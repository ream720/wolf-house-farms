import assert from 'node:assert/strict';
import { SITE_URL } from '../src/data/site.ts';
import { allRoutes, isIndexablePage, pathFor } from '../src/lib/routes.ts';

const get = path => fetch(new URL(path, SITE_URL), { redirect: 'manual' });
const routes = allRoutes();
const publicRoutes = routes.filter(route => isIndexablePage(route.page));
const sitemapResponse = await get('/sitemap.xml');
assert.equal(sitemapResponse.status, 200);
assert.match(sitemapResponse.headers.get('content-type'), /xml/);
const sitemap = await sitemapResponse.text();
const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
assert.deepEqual(locations.sort(), publicRoutes.map(route => new URL(route.path, SITE_URL).href).sort());

const robotsResponse = await get('/robots.txt');
assert.equal(robotsResponse.status, 200);
const robots = await robotsResponse.text();
assert.doesNotMatch(robots, /^Disallow:\s*\/\s*$/m);
assert.ok(robots.includes(`Sitemap: ${SITE_URL}/sitemap.xml`));
assert.match(robots, /^Disallow: \/admin\/$/m);
assert.match(robots, /^Disallow: \/api\/$/m);

// Check all published content without submitting an order or signing in.
for (let start = 0; start < routes.length; start += 6) {
  await Promise.all(routes.slice(start, start + 6).map(async route => {
    const response = await get(route.path);
    assert.equal(response.status, 200, route.path);
    const html = await response.text();
    if (isIndexablePage(route.page)) {
      assert.doesNotMatch(html, /<meta name="robots" content="[^"]*noindex/);
      assert.doesNotMatch(response.headers.get('x-robots-tag') || '', /noindex/i);
    } else {
      assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
    }
    assert.ok(html.includes(`<link rel="canonical" href="${new URL(route.path, SITE_URL).href}"`), route.path);
    for (const locale of ['en', 'es']) {
      const alternate = new URL(pathFor(locale, route.page, route.slug), SITE_URL).href;
      assert.ok(html.includes(`hreflang="${locale}" href="${alternate}"`), route.path);
    }
    if (route.page === 'checkout') {
      assert.ok(html.includes('Apple Pay · 209-404-9891'));
      assert.ok(html.includes('$Wolfhousegenetics'));
      assert.ok(html.includes('Modesto, CA 95350'));
    }
  }));
}

const redirected = await fetch('https://www.wolfhousegenetics.com/', { redirect: 'manual' });
assert.equal(redirected.status, 308);
assert.equal(redirected.headers.get('location'), `${SITE_URL}/`);
const login = await get('/admin/login/');
assert.equal(login.status, 200);
assert.match(login.headers.get('x-robots-tag'), /noindex/);
assert.match(login.headers.get('cache-control'), /no-store/);
const protectedPage = await get('/admin/orders/');
assert.equal(protectedPage.status, 302);
assert.equal(protectedPage.headers.get('location'), '/admin/login/');
const post = (path, body, type, origin = SITE_URL) => fetch(new URL(path, SITE_URL), {
  method: 'POST', redirect: 'manual', headers: { Origin: origin, 'Content-Type': type }, body,
});
const invalidLogin = await post('/admin/login/', '', 'application/x-www-form-urlencoded');
assert.equal(invalidLogin.status, 200);
assert.match(await invalidLogin.text(), /Could not sign in. Check your email and password./);
assert.equal((await post('/admin/login/', '', 'application/x-www-form-urlencoded', 'https://other.example')).status, 403);
const invalidOrder = await post('/api/orders/', '{}', 'application/json');
assert.equal(invalidOrder.status, 400);
assert.match(invalidOrder.headers.get('x-robots-tag'), /noindex/);
assert.equal((await post('/api/orders/', '{}', 'application/json', 'https://other.example')).status, 403);
const missing = await get('/whf-launch-check-missing/');
assert.equal(missing.status, 404);
const missingHtml = await missing.text();
assert.match(missingHtml, /<meta name="robots" content="noindex, nofollow"/);
assert.doesNotMatch(missingHtml, /rel="canonical"/);
console.log(`Public launch verified at ${SITE_URL}: ${publicRoutes.length} sitemap URLs, ${routes.length} localized pages, canonical and language links, payment details, HTTPS redirect, private-page indexing and same-origin protections.`);
