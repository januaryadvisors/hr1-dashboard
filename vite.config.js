import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
/**
 * @typedef {import('vite').Plugin} Plugin
 */
import react from '@vitejs/plugin-react';

/**
 * GitHub Pages serves static files only — there is no server to rewrite unknown
 * paths onto the app shell. So /hr1-dashboard/map 404s, because no such file
 * exists, even though react-router would happily render it.
 *
 * Pages does serve 404.html for any unmatched path, and it does so WITHOUT
 * changing the URL. An exact copy of index.html therefore boots the app, which
 * reads the original location and renders the right route. Deep links and
 * refreshes both work.
 *
 * The copy has to happen after the build, not as a committed file, because the
 * asset filenames are content-hashed. It works at any path depth because `base`
 * makes the asset URLs absolute.
 *
 * Trade-off: the HTTP status stays 404 even though the page renders correctly.
 * That is invisible to users and irrelevant here (the site is noindex). Getting a
 *a true 200 needs the redirect-through-query-string trick, which makes the URL
 * visibly flicker — not worth it.
 */
function githubPagesSpaFallback() {
  return {
    name: 'github-pages-spa-fallback',
    apply: 'build',
    closeBundle() {
      const dist = resolve(__dirname, 'dist');
      copyFileSync(resolve(dist, 'index.html'), resolve(dist, '404.html'));
      this.info?.('wrote dist/404.html (SPA fallback for deep links)');
    },
  };
}

// `base` must match the GitHub Pages path: https://januaryadvisors.github.io/hr1-dashboard/
// Change it in ONE place here if the repo is renamed or moves to a custom domain
// (a custom domain means base: '/').
export default defineConfig({
  base: '/hr1-dashboard/',
  plugins: [react(), githubPagesSpaFallback()],
  build: {
    // Spec §3: total payload target under 900KB gzipped including geometry.
    chunkSizeWarningLimit: 700,
  },
});
