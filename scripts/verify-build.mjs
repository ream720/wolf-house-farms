import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { POLICY_VERSION } from '../src/data/policies.ts';
import { getStrain, getAvailableOffer } from '../src/data/catalog.ts';
import { allRoutes, pathFor, isIndexablePage } from '../src/lib/routes.ts';
import { SITE_URL } from '../src/data/site.ts';
const root = path.resolve("dist/client");
const routes = allRoutes();
const sitemap = await readFile(path.join(root, 'sitemap.xml'), 'utf8');
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
const expectedUrls = routes.filter(route => isIndexablePage(route.page)).map(route => new URL(route.path, SITE_URL).href);
assert.deepEqual([...sitemapUrls].sort(), [...expectedUrls].sort(), 'Sitemap must contain exactly the indexable routes');
assert.equal(new Set(sitemapUrls).size, sitemapUrls.length, 'Sitemap URLs must be unique');
assert.match(sitemap, /xmlns:xhtml="http:\/\/www.w3.org\/1999\/xhtml"/);
const robots = await readFile(path.join(root, 'robots.txt'), 'utf8');
assert.doesNotMatch(robots, /^Disallow:\s*\/\s*$/m, 'Public crawling must be enabled');
assert.match(robots, /^Disallow: \/admin\/$/m);
assert.match(robots, /^Disallow: \/api\/$/m);
assert.ok(robots.includes(`Sitemap: ${SITE_URL}/sitemap.xml`));
async function walk(dir) {
  const files = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    files.map((f) =>
      f.isDirectory() ? walk(path.join(dir, f.name)) : [path.join(dir, f.name)],
    ),
  );
  return nested.flat();
}
const pages = (await walk(root)).filter((f) => f.endsWith(".html"));
let references = 0;
for (const file of pages) {
  const html = await readFile(file, "utf8");
  const relative = path.relative(root, file).replaceAll("\\", "/");
  const redirectTarget = new Map([
    ["drops/index.html", "/genetics/"],
    ["drops/first-chapter/index.html", "/genetics/"],
    ["es/lanzamientos/index.html", "/es/genetica/"],
    ["es/lanzamientos/first-chapter/index.html", "/es/genetica/"],
  ]).get(relative);
  if (redirectTarget) {
    assert.match(html, /http-equiv="refresh"/i);
    assert.ok(html.includes(redirectTarget));
    assert.ok((await stat(path.join(root, redirectTarget, "index.html"))).isFile());
    continue;
  }
  assert.match(html, /<html lang="(?:en|es)"/);
  const routePath = relative === 'index.html' ? '/' : `/${relative.replace(/index\.html$/, '')}`;
  const route = routes.find(item => item.path === routePath);
  if (relative === '404.html' || (route && !isIndexablePage(route.page))) {
    assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
  } else {
    assert.ok(route, `${relative}: unknown public route`);
    assert.doesNotMatch(html, /noindex|nofollow/);
  }
  if (route) {
    assert.ok(html.includes(`<link rel="canonical" href="${new URL(route.path, SITE_URL).href}"`), `${relative}: incorrect canonical URL`);
    for (const language of ['en', 'es', 'x-default']) {
      const alternate = new URL(pathFor(language === 'es' ? 'es' : 'en', route.page, route.slug), SITE_URL).href;
      assert.ok(html.includes(`<link rel="alternate" hreflang="${language}" href="${alternate}"`), `${relative}: missing absolute language URL`);
      if (isIndexablePage(route.page)) {
        const entry = sitemap.match(new RegExp(`<url>\\s*<loc>${new URL(route.path, SITE_URL).href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</loc>([\\s\\S]*?)</url>`))?.[1];
        assert.ok(entry?.includes(`hreflang="${language}" href="${alternate}"`), `${relative}: missing sitemap language alternate`);
      }
    }
  } else {
    assert.doesNotMatch(html, /rel="canonical"/, '404 must not canonicalize to the homepage');
  }
  const isPolicy = /^(?:terms|privacy|ordering|faq|es\/(?:terminos|privacidad|pedidos|preguntas-frecuentes))\/index\.html$/.test(relative);
  if (isPolicy) {
    assert.doesNotMatch(html, /class="age-gate"|data-site-content inert/);
    assert.ok(html.includes(`data-policy-version="${POLICY_VERSION}"`));
  } else {
    assert.match(html, /class="age-gate"/);
    assert.match(html, /data-site-content inert/);
    assert.match(html, /data-age-form/);
    assert.match(html, /type="checkbox" name="terms" required/);
  }
  assert.equal(
    (html.match(/<h1[ >]/g) || []).length,
    1,
    `${file}: expected one page heading`,
  );
  assert.ok(!html.includes("undefined"), `${file}: unresolved content`);
  const copy = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]*>/g,' ');
  assert.doesNotMatch(copy,/wolf\s*house\s*farms/i,`${file}: old business name remains`);
  assert.doesNotMatch(copy,/design preview|vista previa|placeholder|demo only|demostraci[oó]n|concept website|sitio conceptual|draft editorial|texto editorial provisional|details pending|not yet confirmed|on their way|llegar[aá]n pronto|Desert Selections|New Horizons/i,`${file}: unfinished public copy`);
  if (/\/(?:genetics|genetica)\/[^/]+\/index\.html$/.test(`/${relative}`)) {
    const strain=getStrain(relative.split('/').at(-2));
    if(getAvailableOffer(strain.id)) {
      assert.match(html,/data-add-offer=/,`${file}: available variety cannot be ordered`);
      assert.match(html,/(?:\$|USD\s*)50\.00/,`${file}: pack must cost $50`);
    } else {
      assert.doesNotMatch(html,/data-add-offer=/,`${file}: unavailable variety must not be orderable`);
      assert.match(html,strain.status === 'coming-soon' ? /Coming soon|Próximamente/ : /Out of stock|Agotado/,`${file}: availability status is missing`);
    }
  }
  if(['index.html','es/index.html','genetics/index.html','es/genetica/index.html'].includes(relative)) {
    assert.match(html,/data-add-offer="pollen-plantz-2ml" disabled/);
    assert.match(html,/2 mL/);
    assert.match(html,/<p class="offer-price"><strong>\$200<\/strong><\/p>/);
    assert.match(html,/<p>2 mL (?:per unit|por unidad)<\/p>/);
    const cards=[...html.matchAll(/data-strain-card data-collection="([^"]+)"/g)].map(match=>match[1]);
    assert.deepEqual(cards.slice(0,5),Array(5).fill('caviar'));
    assert.equal(cards.length,23);
    assert.match(html,/Winter is coming/);
    assert.match(html,/Coming soon|Próximamente/);
  }
  if (['checkout/index.html','es/reserva/index.html'].includes(relative)) {
    assert.match(html,/select name="shippingMethod" required/);
    assert.match(html,/<option value="standard">/);
    assert.match(html,/<option value="expedited">/);
    assert.match(html,/<option value="standard">[^<]*15\.00/);
    assert.match(html,/<option value="expedited">[^<]*30\.00/);
    const methods = [...html.matchAll(/<option value="(cashapp|apple_pay|cash|paypal|zelle)"/g)].map(match=>match[1]);
    assert.deepEqual(methods,['cashapp','apple_pay','cash']);
    assert.ok(html.includes('$Wolfhousegenetics'));
    assert.ok(html.includes('Apple Pay · 209-404-9891'));
    assert.doesNotMatch(html, /Apple Pay phone number to be confirmed|Número de Apple Pay por confirmar/);
    assert.match(html,/data-payment-account-field/);
    assert.match(html,/data-payment-destination="cash"/);
    assert.ok(html.includes('1700 McHenry Ave Ste 65B PMB166'));
    assert.ok(html.includes('Modesto, CA 95350'));
    assert.doesNotMatch(html,/<p class="payment-preview-notice">/);
    assert.doesNotMatch(copy,/PayPal|Zelle/);
  }
  for (const match of html.matchAll(
    /(?:href|src)="(\/[^"#?]*)(?:[?#][^"]*)?"/g,
  )) {
    const href = decodeURIComponent(match[1]);
    const target = path.join(
      root,
      href.endsWith("/") ? `${href}index.html` : href,
    );
    const info = await stat(target).catch(() => null);
    assert.ok(info?.isFile(), `${file}: broken reference ${href}`);
    references++;
  }
}
assert.equal(pages.length, 67);
const deployment = JSON.parse(await readFile('.vercel/output/config.json','utf8'));
for (const target of ['/genetics/','/es/genetica/']) {
  assert.ok(deployment.routes.some(route => route.headers?.Location === target), `Missing legacy redirect to ${target}`);
}
console.log(
  `Verified ${pages.length} HTML pages, ${sitemapUrls.length} sitemap URLs, indexing rules, language alternates and ${references} local page/asset references.`,
);
