import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

// Catalog pages stay prerendered; order APIs and administration run on Vercel.
export default defineConfig({
  output: 'static',
  adapter: vercel(),
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
