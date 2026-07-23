import { defineConfig } from 'vite';

export default defineConfig({
  // Keep generated asset URLs relative so the same build works at the root,
  // in local previews, and under the additive GitHub Pages /airport-auto/ path.
  base: './',
});
