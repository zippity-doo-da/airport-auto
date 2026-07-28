import { defineConfig } from "vite";

export default defineConfig({
  // Keep generated asset URLs relative so the same build works at the root,
  // in local previews, and under the additive GitHub Pages /airport-auto/ path.
  base: "./",
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        fighters: "fighters.html",
        playground: "flight-playground.html",
        dogfight: "dogfight.html",
        heritage: "heritage-flight.html",
      },
      output: {
        manualChunks: {
          three: ["three"],
        },
      },
    },
  },
});
