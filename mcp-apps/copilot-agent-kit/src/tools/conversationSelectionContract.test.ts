import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const toolsDir = dirname(fileURLToPath(import.meta.url));
const srcDir = join(toolsDir, "..");
const rootDir = join(srcDir, "..");
const server = readFileSync(join(rootDir, "server.ts"), "utf8");
const tools = readFileSync(join(toolsDir, "review-tools.ts"), "utf8");
const reviewApp = readFileSync(
  join(srcDir, "widgets", "agent-review", "AgentReviewApp.tsx"),
  "utf8",
);
const instructions = readFileSync(join(rootDir, "appPackage", "instruction.txt"), "utf8");
const declarativeAgent = readFileSync(
  join(rootDir, "appPackage", "declarativeAgent.json"),
  "utf8",
);
const manifest = readFileSync(join(rootDir, "appPackage", "manifest.json"), "utf8");
const plugin = readFileSync(
  join(rootDir, "appPackage", "agent-review-plugin.json"),
  "utf8",
);
const reviewService = readFileSync(
  join(srcDir, "agent-review", "server", "service.ts"),
  "utf8",
);

function toolRegistration(name: string, nextName: string): string {
  const start = server.indexOf(`(server, "${name}"`);
  const end = server.indexOf(`(server, "${nextName}"`, start);
  assert.notEqual(start, -1, `${name} registration is missing`);
  assert.notEqual(end, -1, `${nextName} registration is missing`);
  return server.slice(start, end);
}

test("the rendering tools accept environment and agent names from conversation context", () => {
  const review = toolRegistration("open_agent_review", "show_agent_map");
  const map = toolRegistration("show_agent_map", "browse_agent_reviews");

  for (const registration of [review, map]) {
    assert.match(registration, /environmentName:/);
    assert.match(registration, /agentName:/);
  }
});

test("conversation selections tolerate a unique whitespace-only name difference", () => {
  const matcherStart = tools.indexOf("function selectedByIdOrName");
  const matcherEnd = tools.indexOf("async function selectedEnvironment", matcherStart);
  const matcher = tools.slice(matcherStart, matcherEnd);

  assert.notEqual(matcherStart, -1);
  assert.notEqual(matcherEnd, -1);
  assert.match(matcher, /replace\(\/\\s\+\/g,\s*""\)/);
  assert.match(matcher, /matches\.length === 1/);
});

test("Agent Map resolves explicit conversation selections before building inline", () => {
  const showStart = tools.indexOf("export async function showAgentMap");
  const showEnd = tools.indexOf("export async function getAgentMap", showStart);
  const show = tools.slice(showStart, showEnd);

  assert.match(
    show,
    /selectedEnvironment\(\s*review,\s*environments,\s*input,\s*hasAgentSelection,\s*\)/,
  );
  assert.match(show, /input\.agentName/);
  assert.match(show, /githubCopilotMapAgents/);
  assert.match(show, /review\.getAgentMap/);
});

test("a generic Agent Map request waits for environment and agent selection", () => {
  const showStart = tools.indexOf("export async function showAgentMap");
  const showEnd = tools.indexOf("export async function getAgentMap", showStart);
  const show = tools.slice(showStart, showEnd);

  assert.match(
    show,
    /if \(!environment\)[\s\S]{0,500}state:\s*"mapSelecting"[\s\S]{0,300}agents:\s*\[\]/,
  );
});

test("Agent Review carries exact selections and an explicit acknowledged prompt-start path", () => {
  const openStart = tools.indexOf("export async function openAgentReview");
  const openEnd = tools.indexOf("export async function listReviewableAgents", openStart);
  const open = tools.slice(openStart, openEnd);

  for (const field of ["environmentId", "environment", "agents", "agentId", "agent"]) {
    assert.match(open, new RegExp(`\\b${field}\\b`));
  }
  assert.match(open, /input\.startReview === true/);
  assert.match(open, /exactSelection\(/);
  assert.match(open, /await promptStart\(/);
  assert.match(open, /state:\s*"running"/);
  assert.match(open, /No review job was created/);

  for (const initializer of [
    "initial.environmentId",
    "initial.environment?.name",
    "initial.agentId",
    "initial.agent?.name",
  ]) {
    assert.ok(reviewApp.includes(initializer), `review form is missing ${initializer}`);
  }
});

test("each Agent Review surface gets an isolated invocation identity", () => {
  const openStart = tools.indexOf("export async function openAgentReview");
  const openEnd = tools.indexOf("export async function listReviewableAgents", openStart);
  const open = tools.slice(openStart, openEnd);

  assert.match(open, /const selectionId = randomUUID\(\)/);
  assert.match(open, /state:\s*input\.reviewId\s*\?\s*"error"\s*:\s*input\.jobId\s*\?\s*"load-error"\s*:\s*"selecting",\s*\.\.\.\(input\.reviewId\s*\?\s*\{\s*reviewId:\s*input\.reviewId\s*\}\s*:\s*input\.jobId\s*\?\s*\{\s*jobId:\s*input\.jobId\s*\}\s*:\s*\{\}\),\s*selectionId,/);
});

test("each review browser surface gets an isolated invocation identity", () => {
  const browseStart = tools.indexOf("export async function browseAgentReviews");
  const browseEnd = tools.indexOf("export async function listAgentReviews", browseStart);
  const browse = tools.slice(browseStart, browseEnd);
  const listStart = browseEnd;
  const listEnd = tools.indexOf("export async function showAgentMap", listStart);
  const list = tools.slice(listStart, listEnd);

  assert.match(browse, /state:\s*"reviewInventory",\s*selectionId:\s*randomUUID\(\),/);
  assert.match(list, /state:\s*"reviewInventory",\s*selectionId:\s*randomUUID\(\),/);
});

test("agent instructions use direct exact requests and retain optional Create confirmation", () => {
  assert.match(
    instructions,
    /When the user explicitly names an environment or agent[\s\S]*pass those names/i,
  );
  assert.match(instructions, /never call start_agent_review until the user explicitly confirms/i);
  assert.match(instructions, /startReview:true/);
  assert.match(instructions, /one exact, accessible agent starts one review without the selection form/i);
  assert.match(instructions, /Copilot Studio Kit - Dev/);
  assert.match(instructions, /resumeOnly/);
  assert.match(instructions, /unresolved target keeps the form without a start/i);
  assert.match(instructions, /acknowledged jobId/);
  assert.match(instructions, /An opener or result reply does not prove that the host displayed the Review UI\./i);
});

test("user-facing copy follows the current Copilot Studio agent terminology", () => {
  for (const content of [
    server,
    reviewService,
    instructions,
    declarativeAgent,
    manifest,
    plugin,
  ]) {
    assert.doesNotMatch(content, /\bmodern (?:Microsoft )?Copilot Studio agent/i);
    assert.doesNotMatch(content, /\bmodern agent review/i);
  }

  const agent = JSON.parse(declarativeAgent) as {
    conversation_starters: Array<{ title: string; text: string }>;
  };
  assert.ok(agent.conversation_starters.some((starter) =>
    starter.title === "Review a Copilot Studio agent"
    && starter.text === "Help me review a Copilot Studio agent."));
});

test("widget resource URIs are versioned with the Teams package", () => {
  const packageManifest = JSON.parse(manifest) as { version: string };
  const pluginManifest = JSON.parse(plugin) as {
    runtimes: Array<{
      spec: {
        mcp_tool_description: {
          tools: Array<{ _meta?: { ui?: { resourceUri?: string } } }>;
        };
      };
    }>;
  };
  const versionMatch = server.match(/const widgetResourceVersion = "(v[^"]+)"/);
  assert.equal(versionMatch?.[1], `v${packageManifest.version}`);

  const widgetUris = pluginManifest.runtimes[0].spec.mcp_tool_description.tools
    .map((tool) => tool._meta?.ui?.resourceUri)
    .filter((uri): uri is string => Boolean(uri));
  assert.ok(widgetUris.length > 0);
  for (const uri of widgetUris) {
    assert.ok(
      uri.includes(`/${versionMatch?.[1]}/`),
      `${uri} does not contain the widget resource version`,
    );
  }
  assert.match(
    server,
    /reviewWidgetUri = `ui:\/\/open_agent_review\/\$\{widgetResourceVersion\}\/\$\{reviewWidgetFile\}`/,
  );
  assert.match(
    server,
    /mapWidgetUri = `ui:\/\/show_agent_map\/\$\{widgetResourceVersion\}\/\$\{mapWidgetFile\}`/,
  );
  assert.match(
    server,
    /browserWidgetUri = `ui:\/\/browse_agent_reviews\/\$\{widgetResourceVersion\}\/\$\{browserWidgetFile\}`/,
  );
});

test("rendering tool results repeat their widget resource binding", () => {
  for (const [toolCall, widgetUri, openingTool] of [
    ["openAgentReview(incomingToken, args)", "reviewWidgetUri", "open_agent_review"],
    ["openAgentDebugger(incomingToken, args)", "debuggerWidgetUri", "open_agent_debugger"],
    ["showAgentMap(incomingToken, args)", "mapWidgetUri", "show_agent_map"],
    ["browseAgentReviews(incomingToken, args)", "browserWidgetUri", "browse_agent_reviews"],
    ["openEvaluationBuilder(incomingToken, args)", "evaluationWidgetUri", "open_evaluation_builder"],
  ]) {
    assert.ok(
      server.includes(`withWidgetResource(${toolCall}, ${widgetUri}, "${openingTool}", incomingToken)`),
      `${toolCall} is missing its result resource binding`,
    );
  }
});
