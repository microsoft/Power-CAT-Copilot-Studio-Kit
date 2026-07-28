import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

const INPUT = process.env.INPUT;

export default defineConfig({
  plugins: [
    react(),
    viteSingleFile(),
    {
      name: 'strip-crossorigin',
      transformIndexHtml(html) {
        return html.replace(/\s+crossorigin/g, '');
      },
    },
  ],
  resolve: {
    // See comment in sf-mcp-copilot vite.config.ts — required for @gtc/mcp-shared
    // peer-dep resolution when installed via npm file: protocol.
    preserveSymlinks: true,
  },
  build: {
    sourcemap: false,
    cssMinify: true,
    minify: 'esbuild',
    rollupOptions: {
      input: INPUT,
    },
    outDir: 'dist',
    emptyOutDir: false,
  },
});
