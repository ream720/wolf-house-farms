import type { APIRoute } from 'astro';
import { allRoutes, isIndexablePage, pathFor } from '../lib/routes';

export const prerender = true;

const escapeXml = (value: string) => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[character]!);

export const GET: APIRoute = ({ site }) => {
  if (!site) throw new Error('The public site URL is required to generate the sitemap.');
  const entries = allRoutes().filter(route => isIndexablePage(route.page)).map(route => {
    const url = (locale: 'en' | 'es') => escapeXml(new URL(pathFor(locale, route.page, route.slug), site).href);
    return `  <url>
    <loc>${url(route.locale)}</loc>
    <xhtml:link rel="alternate" hreflang="en" href="${url('en')}" />
    <xhtml:link rel="alternate" hreflang="es" href="${url('es')}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${url('en')}" />
  </url>`;
  });
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join('\n')}
</urlset>\n`, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
