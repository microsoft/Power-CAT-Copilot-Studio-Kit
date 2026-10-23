import { strict as assert } from "node:assert";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { agentMapSurface } from "./agentMapPresentationPolicy";

const widgetDir = dirname(fileURLToPath(import.meta.url));
const srcDir = join(widgetDir, "..", "..");

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const full = join(root, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

const allSources = sourceFiles(srcDir).map((path) => ({
  path,
  text: readFileSync(path, "utf8"),
}));
const widgetSources = allSources.filter((file) => file.path.startsWith(widgetDir));

test("no source file carries the removed Agent Map informational message", () => {
  // Split so this guard does not match itself.
  const needles = [
    "This map reads the current" + " agent configuration",
    "does not start or consume" + " an Agent Review workflow",
  ];
  const offenders = allSources.filter((file) =>
    needles.some((needle) => file.text.includes(needle)));
  assert.deepEqual(offenders.map((file) => file.path), []);
});

test("the surface contract exposes no informational banner switch", () => {
  const inline = agentMapSurface({ fullscreen: false, hasGraph: true, view: "map" });
  const expanded = agentMapSurface({ fullscreen: true, hasGraph: true, view: "map" });
  assert.equal(Object.hasOwn(inline, "infoMessage"), false);
  assert.equal(Object.hasOwn(expanded, "infoMessage"), false);
});

// The only allowed inline SVG: the 12x12 decorative legend key glyph, by name and exact form.
// Written with \s so this allow-list does not match the guard below.
const allowedSvgGlyphs = [
  {
    path: join(widgetDir, "AgentMapCanvas.tsx"),
    glyph: /function LegendGlyph\(\) \{\s*return \(\s*<svg\s+viewBox="0 0 12 12"\s+aria-hidden="true"\s+focusable="false">(?:\s*<path\s[^<>]*\/>)+\s*<\/svg>\s*\);\s*\}/,
  },
];

test("no hand-rolled SVG map survives in the Agent Map widget", () => {
  const offenders = widgetSources.filter((file) => {
    const text = allowedSvgGlyphs
      .filter((allowed) => allowed.path === file.path)
      .reduce((remaining, allowed) => remaining.replace(allowed.glyph, ""), file.text);
    return /<svg[\s>]/.test(text)
      || /createElement\(\s*["']svg["']/.test(text)
      || /\bMapCanvas\b/.test(text);
  });
  assert.deepEqual(offenders.map((file) => file.path), []);
});

test("the canvas is rendered by @xyflow/react", () => {
  const canvas = widgetSources.find((file) => file.path.endsWith("AgentMapCanvas.tsx"));
  assert.ok(canvas, "AgentMapCanvas.tsx is missing");
  assert.match(canvas.text, /import\s*\{[^}]*\bReactFlow\b[^}]*\}\s*from\s*"@xyflow\/react"/s);
  assert.match(canvas.text, /<ReactFlow[<\s]/);

  const app = widgetSources.find((file) => file.path.endsWith("AgentMapApp.tsx"));
  assert.ok(app, "AgentMapApp.tsx is missing");
  assert.match(app.text, /<AgentMapCanvas[\s\n]/);
});

test("keeps the inline map compact so it does not create a long chat scroll", () => {
  const canvas = widgetSources.find((file) => file.path.endsWith("AgentMapCanvas.tsx"));
  assert.ok(canvas, "AgentMapCanvas.tsx is missing");

  assert.match(canvas.text, /canvas:\s*\{[\s\S]{0,120}height:\s*"360px"/);
  assert.match(canvas.text, /@media \(max-width: 767px\)[\s\S]{0,80}height:\s*"320px"/);
  assert.match(canvas.text, /canvasExpanded:\s*\{[\s\S]{0,120}height:\s*"100%"/);
  assert.doesNotMatch(canvas.text, /height:\s*"(?:640|560|480)px"/);
});

const appSource = readFileSync(join(widgetDir, "AgentMapApp.tsx"), "utf8");
const indexSource = readFileSync(join(widgetDir, "index.tsx"), "utf8");
const providerSource = readFileSync(join(widgetDir, "..", "shared", "McpAppProvider.tsx"), "utf8");
const buildUiSource = readFileSync(join(srcDir, "..", "build-ui.mjs"), "utf8");

/** Slice the body of the `if (!isFullscreen) { … }` early return. */
function inlineBranch(): string {
  const start = appSource.indexOf("if (!isFullscreen) {");
  assert.notEqual(start, -1, "the inline early return is missing");
  let depth = 0;
  for (let index = appSource.indexOf("{", start); index < appSource.length; index += 1) {
    if (appSource[index] === "{") depth += 1;
    if (appSource[index] === "}") {
      depth -= 1;
      if (depth === 0) return appSource.slice(start, index + 1);
    }
  }
  throw new Error("the inline early return is unbalanced");
}

test("reports Agent Map content height instead of the iframe viewport height", () => {
  assert.match(indexSource, /<McpAppProvider>/);
  assert.match(buildUiSource, /"agent-map\.html":\s*\{\s*autoResize:\s*false\s*[,}]/);
  assert.doesNotMatch(providerSource, /autoResize/);
  assert.match(appSource, /ref=\{inlineRootRef\}/);
  assert.match(appSource, /new ResizeObserver\(/);
  // The report is the whole document (root plus frame padding), capped by the inline budget.
  assert.match(appSource, /const width = Math\.ceil\(bounds\.width\);/);
  assert.match(
    appSource,
    /const height = Math\.min\(inlineBudget, Math\.ceil\(bounds\.height \+ frameInsetHeight\)\);/,
  );
  assert.match(appSource, /app\.sendSizeChanged\(\{ width, height \}\)/);
});

test("inline renders selectors before selection and only the map after selection", () => {
  const branch = inlineBranch();
  const forbidden = [
    "Combobox",
    "AgentMapToolbar",
    "AgentMapInspector",
    "AgentMapList",
    "SearchBox",
    "TabList",
    "Switch",
    "Badge",
    "Checkbox",
    "legend",
    "Legend",
  ];
  assert.deepEqual(forbidden.filter((name) => branch.includes(name)), []);
  assert.equal(branch.includes("listView"), false);
  assert.match(branch, /surface\.selectors\s*\?\s*inlineSelectionView/);
  assert.match(branch, /\? canvasView :/);
  assert.match(
    appSource,
    /const canvasView[\s\S]*?<AgentMapCanvasBoundary[\s\S]*?<AgentMapCanvas[\s\n]/,
  );
  assert.match(branch, /ArrowMaximizeRegular/);
  assert.match(branch, /requestDisplayMode\("fullscreen"\)/);
});

test("the same selector view is reused inline and fullscreen", () => {
  assert.equal(appSource.match(/<div className=\{styles\.selectors\}>/g)?.length, 1);
  assert.equal(appSource.match(/\bselectorsView\b/g)?.length, 3);
});

test("contains the inline selection controls in a bordered card", () => {
  assert.match(
    appSource,
    /inlineSelectionCard:\s*\{[\s\S]{0,500}shorthands\.border\("1px"[\s\S]{0,160}shorthands\.borderRadius\([\s\S]{0,120}backgroundColor:/,
  );
  assert.match(
    appSource,
    /const inlineSelectionView = \(\s*<div className=\{styles\.inlineSelectionCard\}>/,
  );

  const branch = inlineBranch();
  assert.equal(
    branch.match(/styles\.inlineSelectionCard/g)?.length ?? 0,
    0,
    "the loaded inline map must remain map-only without an outer card",
  );
});

test("keeps a stable inline selection height with a map placeholder", () => {
  // 220px stays the stable minimum, but never above the inline budget.
  assert.match(
    appSource,
    /inlineSelectionCard:\s*\{[\s\S]{0,240}minHeight:\s*"min\(220px, var\(--agent-map-inline-height, 220px\)\)"/,
  );
  assert.match(
    appSource,
    /<Subtitle2 as="h3">Your agent map will appear here<\/Subtitle2>/,
  );
  assert.match(
    appSource,
    /Choose an environment and an agent to display its component map\./,
  );
});

test("fullscreen owns every map exploration and detail control", () => {
  const branch = inlineBranch();
  const fullscreen = appSource.replace(branch, "");
  for (const name of [
    "<AgentMapToolbar",
    "<AgentMapInspector",
    "<AgentMapList",
    "imageSource(",
    "fullscreenHeight(",
  ]) {
    assert.ok(fullscreen.includes(name), `fullscreen is missing ${name}`);
  }
});

test("fullscreen relies on the host close control", () => {
  const removedLabels = [
    "Exit full" + " screen",
    "Arrow" + "MinimizeRegular",
  ];
  const offenders = widgetSources.filter((file) =>
    removedLabels.some((label) => file.text.includes(label)));
  assert.deepEqual(offenders.map((file) => file.path), []);
});

test("the fullscreen title uses Fluent React's map icon", () => {
  assert.match(appSource, /import\s*\{[^}]*\bMap24Regular\b[^}]*\}\s*from\s*"@fluentui\/react-icons"/s);
  assert.match(appSource, /<Map24Regular\s*\/>/);
  assert.equal(appSource.includes("BotSparkle24Color"), false);
});

test("inline selection never shows an indefinite opening placeholder", () => {
  const branch = inlineBranch();
  assert.equal(branch.includes("Opening the Agent Map"), false);
  assert.match(branch, /surface\.selectors\s*\?\s*inlineSelectionView/);
});

test("inline keeps the expand affordance on the loaded map", () => {
  const branch = inlineBranch();
  const expandAt = branch.indexOf("ArrowMaximizeRegular");
  const selectionAt = branch.indexOf("surface.selectors");
  assert.notEqual(expandAt, -1);
  assert.notEqual(selectionAt, -1);
  assert.ok(
    selectionAt < expandAt,
    "the selector state must resolve before rendering the map's expand action",
  );
});

test("the widget mirrors the review-browser session precedence", () => {
  for (const marker of [
    "requestAgentMapDisplayMode(",
    "resolveAgentMapFullscreen(",
    "completeAgentMapSelection(",
    "readAgentMapPresentation(",
    "readAgentMapContext(",
    "writeAgentMapContext(",
    "shouldRehydrateAgentMap(",
    "agentMapDataTransition(",
    "window.sessionStorage",
    "replaceData(",
  ]) {
    assert.ok(appSource.includes(marker), `AgentMapApp.tsx is missing ${marker}`);
  }
  // The host answer decides the mode; a discarded promise is what let an
  // explicit exit bounce straight back to fullscreen.
  assert.match(appSource, /const mode = await requestAgentMapDisplayMode\(/);
  assert.match(appSource, /setIsFullscreen\(mode === "fullscreen"\)/);
});

test("fullscreen is requested only from the maker's explicit Expand action", () => {
  assert.equal(appSource.includes("shouldRequestAgentMapFullscreen("), false);
  assert.equal(appSource.includes("markAgentMapSelectionFullscreen("), false);
  assert.equal(appSource.match(/requestDisplayMode\("fullscreen"\)/g)?.length, 1);
  assert.match(inlineBranch(), /onClick=\{\(\) => void requestDisplayMode\("fullscreen"\)\}/);
  assert.doesNotMatch(appSource, /setIsFullscreen\(requested === "fullscreen"\)/);
});

test("changing agents keeps the existing map mounted during the replacement call", () => {
  const loadMapStart = appSource.indexOf("const loadMap = async");
  const loadMapEnd = appSource.indexOf("const requestDisplayMode =", loadMapStart);
  assert.notEqual(loadMapStart, -1);
  assert.notEqual(loadMapEnd, -1);
  assert.doesNotMatch(appSource.slice(loadMapStart, loadMapEnd), /setGraph\(undefined\)/);
  assert.doesNotMatch(
    appSource,
    /value !== selectedAgent\?\.name\)[\s\S]{0,100}setGraph\(undefined\)/,
  );
  assert.match(
    appSource,
    /shouldShowAgentMapLoadingPlaceholder\(\{\s*loading,\s*hasGraph: Boolean\(graph\),?\s*\}\)/,
  );
});

test("the map selector requests the map-specific GitHub Copilot inventory", () => {
  assert.match(
    appSource,
    /name:\s*"show_agent_map",\s*arguments:\s*\{\s*environmentId:\s*id\s*\}/,
  );
  assert.equal(appSource.includes('name: "list_reviewable_agents"'), false);
});

test("selecting a connected agent loads and merges its live component map", () => {
  assert.match(appSource, /node\?\.category === "connected-agent"/);
  assert.match(appSource, /name:\s*"get_connected_agent_map"/);
  assert.match(appSource, /expandConnectedAgentMap\(/);
});

test("environment and agent loading use accurate messages", () => {
  assert.match(appSource, /setLoadingPhase\("agents"\)/);
  assert.match(appSource, /setLoadingPhase\("map"\)/);
  assert.match(
    appSource,
    /loadingPhase === "agents"\s*\?\s*"Loading available agents"\s*:\s*"Reading agent configuration"/,
  );
  assert.equal(appSource.includes("Loading GitHub Copilot agents"), false);
});

test("the canvas boundary can be reset when the graph changes", () => {
  const canvas = readFileSync(join(widgetDir, "AgentMapCanvas.tsx"), "utf8");
  assert.match(canvas, /resetKey\??:/);
  assert.match(canvas, /componentDidUpdate/);
  assert.match(appSource, /<AgentMapCanvasBoundary[\s\S]{0,200}resetKey=/);
});

test("the fullscreen height workaround is untouched", () => {
  assert.match(
    appSource,
    /fullscreenHeight\(host\?\.containerDimensions, window\.screen\.availHeight\)/,
  );
});

test("the built bundle ships the React Flow map and is not stale", (t) => {
  const bundle = join(widgetDir, "..", "..", "..", "dist", "ui", "agent-map.html");
  if (!existsSync(bundle)) {
    t.skip("run npm run build first");
    return;
  }
  const built = statSync(bundle).mtimeMs;
  const newest = Math.max(...widgetSources.map((file) => statSync(file.path).mtimeMs));
  assert.ok(built >= newest, "dist/ui/agent-map.html is older than the widget sources");

  const html = readFileSync(bundle, "utf8");
  // build-ui.mjs writes the app script and styles as gzip-base64 payloads.
  const decode = (id: string): string => {
    const payload = html.match(
      new RegExp(`<script id="${id}" type="[^"]+" data-encoding="gzip-base64">([^<]*)</script>`),
    )?.[1];
    assert.ok(payload, `the bundle is missing the ${id} payload`);
    return gunzipSync(Buffer.from(payload, "base64")).toString("utf8");
  };
  const application = decode("__mcp_app_script") + decode("__mcp_app_styles");
  for (const marker of ["react-flow__renderer", "react-flow__edge", "agentMapNode"]) {
    assert.ok(application.includes(marker), `the bundle is missing ${marker}`);
  }
  const removedMessage = "This map reads the current" + " agent configuration";
  assert.equal(html.includes(removedMessage), false);
  assert.equal(application.includes(removedMessage), false);
});
