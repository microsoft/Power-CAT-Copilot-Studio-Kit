import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(testDir, "..");
const packageJson = JSON.parse(
  readFileSync(join(rootDir, "package.json"), "utf8"),
) as {
  dependencies: Record<string, string>;
};

test("MCP Apps dependencies stay on the M365 Copilot-compatible releases", () => {
  assert.equal(packageJson.dependencies["@modelcontextprotocol/ext-apps"], "1.1.2");
  assert.equal(packageJson.dependencies["@modelcontextprotocol/sdk"], "1.27.1");
});
