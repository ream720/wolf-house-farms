import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

// Vercel proxies functions through an internal host. Trust only our public host
// and exact deployment aliases supplied by Vercel when reconstructing the URL.
const deploymentHosts = new Set([
  'wolf-house-farms.vercel.app',
  process.env.VERCEL_URL,
  process.env.VERCEL_BRANCH_URL,
  process.env.VERCEL_PROJECT_PRODUCTION_URL,
].filter(Boolean));

// Catalog pages stay prerendered; order APIs and administration run on Vercel.
export default defineConfig({
  output: 'static',
  adapter: vercel(),
  security: {
    checkOrigin: true,
    allowedDomains: [...deploymentHosts].map(hostname => ({ protocol: 'https', hostname })),
  },
  trailingSlash: 'always',
  redirects: {
    '/drops/': '/genetics/',
    '/drops/first-chapter/': '/genetics/',
    '/es/lanzamientos/': '/es/genetica/',
    '/es/lanzamientos/first-chapter/': '/es/genetica/',
  },
  devToolbar: { enabled: false },
  vite: { server: { allowedHosts: ['localhost', '127.0.0.1'] } },
});
