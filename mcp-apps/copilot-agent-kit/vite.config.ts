import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

const input = process.env.INPUT;
if (!input) throw new Error("INPUT environment variable is not set");
const outDir = process.env.OUTPUT_DIR ?? "dist";

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    sourcemap: process.env.NODE_ENV === "development" ? "inline" : false,
    minify: process.env.NODE_ENV !== "development",
    cssMinify: process.env.NODE_ENV !== "development",
    rollupOptions: { input },
    outDir,
    emptyOutDir: false
  }
});
