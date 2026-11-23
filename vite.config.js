import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
/**
 * @typedef {import('vite').Plugin} Plugin
 */
import react from '@vitejs/plugin-react';

/**
 * GitHub Pages serves static files only — there is no server to rewrite unknown
 * paths onto the app shell. So /map 404s, because no such file
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
 * That is invisible to users and irrelevant here (the site is noindex). Getting
 * a true 200 needs the redirect-through-query-string trick, which makes the URL
 * visibly flicker — not worth it.
 */
function githubPagesSpaFallback() {
  let outDir;
  return {
    name: 'github-pages-spa-fallback',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      copyFileSync(resolve(outDir, 'index.html'), resolve(outDir, '404.html'));
      this.info?.(`wrote ${outDir}/404.html (SPA fallback for deep links)`);
    },
  };
}

// `base` is '/' because the site is served from the root of its custom domain,
// https://snaptracker.feedingtexas.org/ (GitHub redirects the old
// januaryadvisors.github.io/hr1-dashboard/ address there). Change it here alone if
// the site ever moves back under a path; the router and data fetches follow it.
export default defineConfig({
  base: '/',
  plugins: [react(), githubPagesSpaFallback()],
  build: {
    // The whole payload, geometry included, should stay under ~900KB gzipped.
    chunkSizeWarningLimit: 700,
  },
});
