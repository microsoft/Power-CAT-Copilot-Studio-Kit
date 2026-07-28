import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INPUT = process.env.INPUT;

export default defineConfig(({ command }) => {
  const isDev = command === 'serve';
  return {
    // In dev mode Vite serves from `src/` so it picks up src/index.html naturally.
    // In build mode root stays at the project (widgets/) so build.mjs / INPUT path keeps working.
    root: isDev ? path.resolve(__dirname, 'src') : undefined,
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
      // Required because @gtc/mcp-shared is installed via file: protocol, which
      // npm resolves as a symlink. Without this, Vite follows the symlink to the
      // shared package's source directory (kit/mcp-shared/widgets/src/) and tries
      // to resolve peer deps like @fluentui/react-components from THERE — which
      // has no node_modules. preserveSymlinks: true keeps the resolution rooted
      // in the consumer's node_modules (kit/sf-mcp-copilot/widgets/node_modules/).
      preserveSymlinks: true,
      // Dev mode only: swap the real MCP bridge for a mock so the UI can run
      // without an MCP server, tunnel, or Teams. Production build is untouched.
      // Regex with $ ensures only the bare specifier '@gtc/mcp-shared' is
      // remapped — deep imports like '@gtc/mcp-shared/widgets/src/Toast' pass
      // through to node_modules and resolve via the npm symlink, so their
      // peer deps (@fluentui, @modelcontextprotocol) work normally.
      alias: isDev
        ? [{ find: /^@gtc\/mcp-shared$/, replacement: path.resolve(__dirname, 'src/dev-mocks/index.tsx') }]
        : undefined,
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
  };
});
