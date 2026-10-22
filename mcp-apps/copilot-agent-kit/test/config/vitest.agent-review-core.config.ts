import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/agent-review/core/**/*.test.ts"],
  },
});
