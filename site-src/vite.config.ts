import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// The site is served from https://microsoft.github.io/Power-CAT-Copilot-Studio-Kit/
// Use relative paths so assets work both at that URL and when previewed locally.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: resolve(__dirname, "..", "docs"),
    emptyOutDir: false, // preserve .nojekyll and /images alongside built assets
    rollupOptions: {
      output: {
        // Keep a stable bundle name so workflow diffs stay readable.
        entryFileNames: "assets/index.js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
