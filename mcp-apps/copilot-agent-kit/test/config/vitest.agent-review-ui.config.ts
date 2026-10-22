import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^tabster$/,
        replacement: fileURLToPath(
          new URL("../../node_modules/tabster/dist/esm/index.js", import.meta.url),
        ),
      },
    ],
  },
  test: {
    environment: "jsdom",
    // Large Fluent UI fixtures need more time and must not compete for jsdom resources.
    fileParallelism: false,
    testTimeout: 15_000,
    include: [
      "src/agent-review/ui/**/*.test.{ts,tsx}",
      "src/widgets/**/*.test.tsx",
      "src/agent-debugger/components/**/*.test.tsx",
    ],
    setupFiles: ["src/agent-review/ui/testSetup.ts"],
    server: {
      deps: {
        inline: true,
      },
    },
  },
});
