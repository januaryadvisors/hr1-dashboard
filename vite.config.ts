import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base` must match the GitHub Pages path: https://januaryadvisors.github.io/hr1-dashboard/
// Change it in ONE place here if the repo is renamed or moves to a custom domain
// (a custom domain means base: '/').
export default defineConfig({
  base: '/hr1-dashboard/',
  plugins: [react()],
  build: {
    // Spec §3: total payload target under 900KB gzipped including geometry.
    chunkSizeWarningLimit: 700,
  },
});
