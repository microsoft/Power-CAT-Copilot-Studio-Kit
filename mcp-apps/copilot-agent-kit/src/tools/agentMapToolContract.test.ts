import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "review-tools.ts"),
  "utf8",
);

test("Agent Map tool paths filter to GitHub Copilot harness agents", () => {
  const uses = source.match(/githubCopilotMapAgents\(/g)?.length ?? 0;
  assert.ok(uses >= 2, "show_agent_map and get_agent_map must both filter their inventories");
});

test("Agent Map rejects a direct request for an ineligible standard agent", () => {
  assert.match(source, /AGENT_MAP_UNSUPPORTED/);
  assert.match(source, /available only for GitHub Copilot harness agents/i);
});

test("each generic Agent Map selection gets an isolated invocation identity", () => {
  assert.match(source, /import\s*\{[^}]*\brandomUUID\b[^}]*\}\s*from\s*"node:crypto"/);
  assert.match(source, /state:\s*"mapSelecting"[\s\S]{0,200}selectionId:\s*randomUUID\(\)/);
});

test("connected-agent expansion exposes a workflow-free live map tool", () => {
  assert.match(source, /export async function getConnectedAgentMap\(/);
  assert.match(source, /review\.getConnectedAgentMap\(/);
  assert.match(source, /state:\s*"connectedAgentMap"/);
});
