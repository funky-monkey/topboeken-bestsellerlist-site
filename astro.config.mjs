import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  site: process.env.SITE_URL ?? 'https://top-boeken.nl',
  vite: {
    ssr: {
      external: ['better-sqlite3'],
      noExternal: [],
    },
  },
});
