import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { powerApps } from '@microsoft/power-apps-vite/plugin'
import * as path from 'path'
import { offlineViewerPlugin } from './build/offline-viewer-plugin.ts'

export default defineConfig({
  base: './',
  server: {
    host: 'localhost',
    port: 3001,
    strictPort: false,
    cors: true,
  },
  plugins: [react(), powerApps(), offlineViewerPlugin()],
  build: {
    // `power-apps push` uploads files as UTF-8 text, corrupting binary images
    // (microsoft/PowerAppsCodeApps#316). Inline raster images as data URIs instead.
    assetsInlineLimit: (filePath) =>
      /\.(png|jpe?g|gif|webp|ico)$/i.test(filePath) ? true : undefined,
  },
  resolve: {
    dedupe: [
      'react',
      'react-dom',
      '@fluentui/react-components',
      '@fluentui/react-icons',
      '@tanstack/react-query',
    ],
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
