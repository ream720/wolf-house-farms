import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { POLICY_VERSION } from '../src/data/policies.ts';
const root = path.resolve("dist/client");
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
  assert.match(html, /noindex, nofollow/);
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
  assert.doesNotMatch(copy,/design preview|vista previa|placeholder|demo only|demostraci[oó]n|concept website|sitio conceptual|draft editorial|texto editorial provisional|details pending|not yet confirmed|on their way|llegar[aá]n pronto|Desert Selections|New Horizons/i,`${file}: unfinished public copy`);
  if (/\/(?:genetics|genetica)\/[^/]+\/index\.html$/.test(`/${relative}`)) {
    assert.match(html,/data-add-offer=/,`${file}: variety cannot be ordered`);
    assert.match(html,/(?:\$|USD\s*)60\.00/,`${file}: pack must cost $60`);
  }
  if (['checkout/index.html','es/reserva/index.html'].includes(relative)) {
    const methods = [...html.matchAll(/<option value="(cashapp|apple_pay|cash|paypal|zelle)"/g)].map(match=>match[1]);
    assert.deepEqual(methods,['cashapp','apple_pay','cash']);
    assert.ok(html.includes('$Wolfhousegenetics'));
    assert.match(html,/data-payment-account-field/);
    assert.match(html,/data-payment-destination="cash"/);
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
assert.equal(pages.length, 57);
const deployment = JSON.parse(await readFile('.vercel/output/config.json','utf8'));
for (const target of ['/genetics/','/es/genetica/']) {
  assert.ok(deployment.routes.some(route => route.headers?.Location === target), `Missing legacy redirect to ${target}`);
}
console.log(
  `Verified ${pages.length} HTML pages and ${references} local page/asset references.`,
);
