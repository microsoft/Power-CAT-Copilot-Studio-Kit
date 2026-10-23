import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  watch as watchFiles,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { preprocessCSS, resolveConfig } from "vite";

const uiDir = "ui";
const watch = process.argv.includes("--watch");
const outputDir = "dist/ui";
const bootstrapOutputDir = "dist/bootstrap";
const stagedOutputDir = "dist/staged";
const bootstrapEntry = "bootstrap.html";
const resourceResponseBudget = 1_000_000;
const widgetConfigs = {
  "agent-debugger.html": { autoResize: false, openTool: "open_agent_debugger", view: "debugger" },
  "agent-map.html": { autoResize: false, openTool: "show_agent_map" },
  "agent-review.html": { autoResize: true, openTool: "open_agent_review", view: "review" },
  "review-browser.html": { autoResize: true, openTool: "browse_agent_reviews" },
  "evaluation-builder.html": { autoResize: true, openTool: "open_evaluation_builder", view: "evaluation", clawpilotTheme: true },
};
const entries = readdirSync(uiDir)
  .filter((name) => name.endsWith(".html") && name !== bootstrapEntry);

for (const directory of [outputDir, bootstrapOutputDir, stagedOutputDir]) {
  mkdirSync(directory, { recursive: true });
}

function build(input, outDir) {
  execFileSync(
    "npx",
    ["cross-env", watch ? "NODE_ENV=development" : "NODE_ENV=production", `INPUT=${input}`, `OUTPUT_DIR=${outDir}`, "vite", "build"],
    { stdio: "inherit", shell: true },
  );
}

function singleModule(html, entry) {
  const scripts = [...html.matchAll(/<script type="module"[^>]*>([\s\S]*?)<\/script>/g)];
  if (scripts.length !== 1) {
    throw new Error(`${entry} must contain exactly one module script`);
  }
  const source = scripts[0][1];
  if (/<\/script/i.test(source)) {
    throw new Error(`${entry} contains an unsafe closing script sequence`);
  }
  return source;
}

function styles(html) {
  const withoutModules = html.replace(
    /<script type="module"[^>]*>[\s\S]*?<\/script>/g,
    "",
  );
  return [...withoutModules.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map((match) => match[1])
    .join("\n");
}

async function scopedStyles(source, view) {
  if (!view) return source;
  const scope = `[data-mcp-view-root="${view}"]`;
  const cssConfig = await resolveConfig({
    configFile: false,
    mode: watch ? "development" : "production",
    css: { postcss: { plugins: [{
      postcssPlugin: "mcp-peer-view-scope",
      Rule(rule) {
        if (rule.parent.type === "atrule" && /keyframes$/i.test(rule.parent.name)) return;
        rule.selectors = [...new Set(rule.selectors.map(selector => {
          if ([":root", "html", "body", "#root"].includes(selector)) return scope;
          for (const prefix of [":root", "html", "body", "#root"]) {
            if (selector.startsWith(`${prefix}[`) || selector.startsWith(`${prefix}.`) || selector.startsWith(`${prefix} `)) {
              return scope + selector.slice(prefix.length);
            }
          }
          return `${scope} ${selector}`;
        }))];
      },
    }] } },
  }, "build", watch ? "development" : "production", watch ? "development" : "production");
  return (await preprocessCSS(source, `${view}.css`, cssConfig)).code;
}

async function compose(entry, config) {
  const bootstrap = readFileSync(join(bootstrapOutputDir, uiDir, bootstrapEntry), "utf8");
  const application = readFileSync(join(stagedOutputDir, uiDir, entry), "utf8");
  const applicationScript = singleModule(application, entry);
  const applicationStyles = await scopedStyles(styles(application), config.view);
  const payload = [
    `<script id="__mcp_app_config" type="application/json">${JSON.stringify({
      autoResize: config.autoResize, openTool: config.openTool, ...(config.view ? { view: config.view } : {}),
    })}</script>`,
    `<script id="__mcp_app_styles" type="application/x-agent-review-styles" data-encoding="gzip-base64">${gzipSync(applicationStyles).toString("base64")}</script>`,
    `<script id="__mcp_app_script" type="application/x-agent-review-module" data-encoding="gzip-base64">${gzipSync(applicationScript).toString("base64")}</script>`,
  ].join("\n");
  const configured = bootstrap.replace(
    '<html lang="en">',
    `<html lang="en" data-mcp-auto-resize="${config.autoResize}"${config.openTool ? ` data-mcp-open-tool="${config.openTool}"` : ""}${config.view ? ` data-mcp-view="${config.view}"` : ""}>`,
  );
  const themed = config.clawpilotTheme ? configured.replace("<head>", `<head>
<script>
  (() => {
    const param = new URLSearchParams(window.location.search).get("scoutTheme");
    const theme =
      param || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
  })();
</script>`) : configured;
  const output = themed.replace("</body>", () => `${payload}\n</body>`);
  const responseBytes = Buffer.byteLength(JSON.stringify(output), "utf8") + 1_024;
  if (responseBytes > resourceResponseBudget) {
    throw new Error(
      `${entry}: ${responseBytes} bytes exceed the ${resourceResponseBudget}-byte engineering guard, including response overhead. This is not a published Microsoft limit.`,
    );
  }
  writeFileSync(join(outputDir, entry), output);
}

async function buildAll() {
  build(join(uiDir, bootstrapEntry), bootstrapOutputDir);
  for (const entry of entries) {
    build(join(uiDir, entry), stagedOutputDir);
    await compose(entry, widgetConfigs[entry]);
  }
}

await buildAll();

if (watch) {
  let timer;
  let building = false;
  let pending = false;
  const rebuild = () => {
    if (building) {
      pending = true;
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(async () => {
      building = true;
      try {
        await buildAll();
      } finally {
        building = false;
        if (pending) {
          pending = false;
          rebuild();
        }
      }
    }, 200);
  };
  const watchers = [
    watchFiles(uiDir, { recursive: true }, rebuild),
    watchFiles("src/widgets", { recursive: true }, rebuild),
  ];
  process.on("SIGINT", () => watchers.forEach((watcher) => watcher.close()));
}
