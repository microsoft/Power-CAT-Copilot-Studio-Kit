import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { preprocessCSS, resolveConfig } from "vite";

const testDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(testDir, "..");
const sharedDir = join(rootDir, "src", "widgets", "shared");

test("each widget retains its bootstrap configuration inside the body when the host wraps the document", () => {
  for (const [file, openTool, view, autoResize] of [
    ["agent-review.html", "open_agent_review", "review", true],
    ["agent-debugger.html", "open_agent_debugger", "debugger", false],
    ["evaluation-builder.html", "open_evaluation_builder", "evaluation", true],
    ["agent-map.html", "show_agent_map", undefined, false],
    ["review-browser.html", "browse_agent_reviews", undefined, true],
  ] as const) {
    const html = readFileSync(join(rootDir, "dist", "ui", file), "utf8")
      .replace(/\sdata-mcp-[a-z-]+="[^"]*"/g, "");
    const body = html.slice(html.indexOf("<body>"));
    const config = body.match(/<script id="__mcp_app_config" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
    assert.ok(config, `${file} loses its configuration when outer document attributes are omitted`);
    assert.deepEqual(JSON.parse(config), { autoResize, openTool, ...(view ? { view } : {}) });
  }
});

test("the MCP bridge connects before the React application payload loads", () => {
  const bootstrap = readFileSync(join(sharedDir, "bootstrap.ts"), "utf8");
  const connect = bootstrap.indexOf("await app.connect()");
  const loadApplication = bootstrap.indexOf("await loadApplicationPayload()");

  assert.notEqual(connect, -1, "bootstrap must connect the MCP App");
  assert.notEqual(loadApplication, -1, "bootstrap must load the application payload");
  assert.ok(connect < loadApplication, "React loaded before the MCP handshake completed");
});

test("the React provider consumes the connected bootstrap instead of reconnecting", () => {
  const provider = readFileSync(join(sharedDir, "McpAppProvider.tsx"), "utf8");

  assert.match(provider, /getMcpBootstrap\(view\)/);
  assert.doesNotMatch(provider, /new App\(/);
  assert.doesNotMatch(provider, /\.connect\(/);
});

for (const [directory, view] of [
  ["agent-review", "review"],
  ["agent-debugger", "debugger"],
  ["evaluation-builder", "evaluation"],
]) {
  test(`${view} mounts its own application with a view-specific React ID prefix`, () => {
    const entry = readFileSync(join(rootDir, "src", "widgets", directory, "index.tsx"), "utf8");
    assert.match(entry, new RegExp(
      `createRoot\\(getApplicationRoot\\("${view}"\\),\\s*\\{\\s*identifierPrefix:\\s*"mcp-${view}-"\\s*\\}\\)`,
    ));
  });
}

test("resource builds do not inherit development settings from CSS preprocessing", () => {
  const build = readFileSync(join(rootDir, "build-ui.mjs"), "utf8");
  assert.match(build, /watch\s*\?\s*"NODE_ENV=development"\s*:\s*"NODE_ENV=production"/);
  assert.match(build, /mode:\s*watch\s*\?\s*"development"\s*:\s*"production"/);
});

test("widgets do not contain shared app navigation or cross-view resource loading", () => {
  const bootstrap = readFileSync(join(sharedDir, "bootstrap.ts"), "utf8");
  assert.doesNotMatch(bootstrap, /installNavigation|loadPeer|selectView|readOpeningResult|peerTarget/);
  assert.doesNotMatch(bootstrap, /get_app_view_resource|get_app_view_chunk|peerRecoveries/);
  const shell = readFileSync(join(rootDir, "ui", "bootstrap.html"), "utf8");
  assert.doesNotMatch(shell, /mcp-peer|data-active="false"/);
});

test("Review and Debugger can restore data from the full tool input when the inline result is omitted", () => {
  const bootstrap = readFileSync(join(sharedDir, "bootstrap.ts"), "utf8");
  assert.match(bootstrap, /app\.ontoolinput\s*=/);
  assert.match(bootstrap, /createInitialToolDataRecovery/);
  assert.match(bootstrap, /initialDataRecovery\?\.ready\(\)/);
  assert.match(bootstrap, /initialDataRecovery\.receiveResult\(result\)/);
  const build = readFileSync(join(rootDir, "build-ui.mjs"), "utf8");
  assert.match(build, /"agent-review\.html":\s*\{[^}]*openTool:\s*"open_agent_review"/);
  assert.match(build, /"agent-debugger\.html":\s*\{[^}]*openTool:\s*"open_agent_debugger"/);
});

test("built widgets keep the complete application code and scoped styles inert until initialization", async () => {
  const viewByFile: Record<string, string> = {
    "agent-review.html": "review", "agent-debugger.html": "debugger", "evaluation-builder.html": "evaluation",
  };
  const declarations = async (css: string) => {
    const result: Array<[string, string, boolean]> = [];
    const config = await resolveConfig({
      configFile: false, mode: "production",
      css: { postcss: { plugins: [{
        postcssPlugin: "verify-complete-style-declarations",
        Declaration(node: { prop: string; value: string; important?: boolean }) {
          result.push([node.prop, node.value, Boolean(node.important)]);
        },
      }] } },
    }, "build", "production", "production");
    await preprocessCSS(css, "complete-styles.css", config);
    return result;
  };
  for (const file of ["agent-review.html", "agent-debugger.html", "agent-map.html", "review-browser.html", "evaluation-builder.html"]) {
    const path = join(rootDir, "dist", "ui", file);
    assert.ok(existsSync(path), `${file} is not built`);
    const html = readFileSync(path, "utf8");
    const payloadStart = html.indexOf('<script id="__mcp_app_styles"');
    const applicationStart = html.indexOf(
      '<script id="__mcp_app_script" type="application/x-agent-review-module"',
    );
    const applicationContent = html.indexOf(">", applicationStart) + 1;
    const applicationEnd = html.indexOf("</script>", applicationContent);
    const activeModules = html
      .slice(0, payloadStart)
      .match(/<script type="module"[^>]*>/g) ?? [];

    assert.notEqual(payloadStart, -1, `${file} is missing its deferred payload`);
    assert.equal(activeModules.length, 1, `${file} must expose only the bootstrap module`);
    assert.ok(
      html.slice(0, payloadStart).includes("ui/initialize"),
      `${file} does not initialize MCP in its bootstrap`,
    );
    assert.match(html, /<script id="__mcp_app_script" type="application\/x-agent-review-module" data-encoding="gzip-base64">/);
    assert.match(html, /<script id="__mcp_app_styles" type="application\/x-agent-review-styles" data-encoding="gzip-base64">/);
    const application = gunzipSync(Buffer.from(
      html.slice(applicationContent, applicationEnd), "base64",
    )).toString("utf8");
    const staged = readFileSync(join(rootDir, "dist", "staged", "ui", file), "utf8");
    const stagedApplication = [...staged.matchAll(/<script type="module"[^>]*>([\s\S]*?)<\/script>/g)];
    assert.equal(stagedApplication.length, 1);
    assert.equal(application, stagedApplication[0][1], `${file} changed its complete application`);
    assert.ok(
      Buffer.byteLength(application, "utf8") > 100_000,
      `${file} did not preserve its deferred application bundle`,
    );
    const stylePayload = html.match(/<script id="__mcp_app_styles"[^>]*>([\s\S]*?)<\/script>/)?.[1];
    assert.ok(stylePayload);
    const decodedStyles = gunzipSync(Buffer.from(stylePayload, "base64")).toString("utf8");
    const withoutModules = staged.replace(/<script type="module"[^>]*>[\s\S]*?<\/script>/g, "");
    const stagedStyles = [...withoutModules.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
      .map((match) => match[1]).join("\n");
    if (viewByFile[file]) {
      assert.ok(decodedStyles.includes(`[data-mcp-view-root="${viewByFile[file]}"]`), `${file} does not scope its styles`);
      assert.deepEqual(await declarations(decodedStyles), await declarations(stagedStyles), `${file} changed its complete style declarations`);
    } else {
      assert.equal(decodedStyles, stagedStyles, `${file} changed its complete styles`);
    }
  }
});
