import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { powerApps } from '@microsoft/power-apps-vite/plugin'
import * as path from 'path'

export default defineConfig({
  base: './',
  define: {
    __APP_BUSTER__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    host: 'localhost',
    port: 3002,
    strictPort: false,
    cors: true,
  },
  plugins: [
    react(),
    powerApps(),
  ],
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
