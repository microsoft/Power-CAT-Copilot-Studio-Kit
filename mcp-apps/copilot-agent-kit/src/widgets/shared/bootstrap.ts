import { App } from "@modelcontextprotocol/ext-apps";
import type { AppView, McpBootstrap, McpBootstrapSnapshot } from "./bootstrap-contract";
import { createInitialToolDataRecovery } from "./initial-tool-data";
import { createCompleteToolResultReader } from "./tool-result";
import { readInitialResult } from "./read-initial-result";

function requireRoot(): HTMLElement {
  const element = document.getElementById("root");
  if (!element) throw new Error("The Agent Review widget root is missing.");
  return element;
}

const root = requireRoot();

interface WidgetConfiguration {
  autoResize: boolean;
  openTool: string;
  view?: AppView;
}

function readConfiguration(sourceDocument: Document = document): WidgetConfiguration {
  const element = sourceDocument.getElementById("__mcp_app_config");
  if (!(element instanceof HTMLScriptElement) || element.type !== "application/json") {
    throw new Error("The Agent Review widget configuration is missing.");
  }
  let value: unknown;
  try {
    value = JSON.parse(element.textContent ?? "");
  } catch (error) {
    throw new Error("The Agent Review widget configuration is malformed.", { cause: error });
  }
  const viewsByTool: Record<string, AppView | undefined> = {
    open_agent_review: "review", open_agent_debugger: "debugger", open_evaluation_builder: "evaluation",
    show_agent_map: undefined, browse_agent_reviews: undefined,
  };
  if (!value || typeof value !== "object" || Array.isArray(value)
    || !("autoResize" in value) || typeof value.autoResize !== "boolean"
    || !("openTool" in value) || typeof value.openTool !== "string"
    || !Object.hasOwn(viewsByTool, value.openTool)) {
    throw new Error("The Agent Review widget configuration is invalid.");
  }
  const view = viewsByTool[value.openTool];
  if (("view" in value ? value.view : undefined) !== view) {
    throw new Error("The Agent Review widget configuration has a different view identity.");
  }
  return { autoResize: value.autoResize, openTool: value.openTool, ...(view ? { view } : {}) };
}

const configuration = (() => {
  try {
    return readConfiguration();
  } catch (error) {
    showFailure(error);
    return undefined;
  }
})();
const app = new App(
  { name: "agent-review-widget", version: "1.0.18" },
  {},
  { autoResize: configuration?.autoResize === true },
);
const callServerTool = app.callServerTool.bind(app);
const readCompleteToolResult = createCompleteToolResultReader(callServerTool);
app.callServerTool = async (...arguments_) => readCompleteToolResult(await callServerTool(...arguments_));
const listeners = new Set<() => void>();
let snapshot: McpBootstrapSnapshot = {
  app,
  data: null,
  host: undefined,
};
const defaultView = configuration?.view;
if (defaultView) root.dataset.mcpViewRoot = defaultView;

function update(next: Partial<McpBootstrapSnapshot>): void {
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) listener();
}

const primary: McpBootstrap = {
  getSnapshot: () => snapshot,
  replaceData: (data) => update({ data }),
  replaceMetadata: (metadata) => update({ metadata }),
  readInitialResult: async result => {
    if (!configuration) throw new Error("The widget configuration is unavailable for data recovery.");
    return readInitialResult(app, result, configuration.openTool);
  },
  subscribe: (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  root,
  view: defaultView,
};
window.__agentReviewMcpBootstrap = primary;

const openTool = configuration?.openTool;
const initialDataRecovery = openTool
  ? createInitialToolDataRecovery({
    name: openTool,
    callTool: callServerTool,
    getData: () => snapshot.data,
    replaceData: (data) => update({ data }),
    replaceMetadata: metadata => update({ metadata }),
    reportError: (error) => console.error("Unable to restore the initial MCP widget data.", error),
  })
  : undefined;

app.ontoolinput = async (input) => {
  update({ toolInput: input.arguments });
  await initialDataRecovery?.receiveInput(input);
};
app.ontoolresult = async (result) => {
  const declaredView = result.structuredContent?.view;
  const ui = result._meta?.ui;
  const uri = ui && typeof ui === "object" && "resourceUri" in ui && typeof ui.resourceUri === "string" ? ui.resourceUri : "";
  const resourceView: AppView | undefined = uri.startsWith("ui://open_evaluation_builder/") ? "evaluation"
    : uri.startsWith("ui://open_agent_debugger/") ? "debugger"
      : uri.startsWith("ui://open_agent_review/") ? "review" : undefined;
  if (((declaredView === "review" || declaredView === "debugger" || declaredView === "evaluation") && declaredView !== defaultView)
    || (resourceView && resourceView !== defaultView)) return;
  if (initialDataRecovery) await initialDataRecovery.receiveResult(result);
  else {
    const complete = await readCompleteToolResult(result);
    if (complete.structuredContent != null) update({ data: complete.structuredContent, metadata: complete._meta });
  }
};
app.onhostcontextchanged = next => {
  update({ host: { ...snapshot.host, ...next } });
  document.documentElement.dataset.theme = snapshot.host?.theme === "dark" ? "dark" : "light";
  root.dataset.theme = snapshot.host?.theme === "dark" ? "dark" : "light";
};
app.onteardown = async () => ({});

async function payload(id: string, sourceDocument: Document = document): Promise<string> {
  const element = sourceDocument.getElementById(id);
  if (!(element instanceof HTMLScriptElement)) {
    throw new Error(`The Agent Review payload ${id} is missing.`);
  }
  const source = element.textContent ?? "";
  if (!element.dataset.encoding) return source;
  if (element.dataset.encoding !== "gzip-base64") {
    throw new Error(`The Agent Review payload ${id} has an unsupported encoding.`);
  }
  if (typeof DecompressionStream !== "function") {
    throw new Error("This browser does not support compressed MCP widget payloads.");
  }
  const bytes = Uint8Array.from(atob(source), (character) => character.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

function whenDocumentReady(): Promise<void> {
  if (document.readyState !== "loading") return Promise.resolve();
  return new Promise((resolve) => {
    document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
  });
}

async function loadApplicationPayload(): Promise<void> {
  await whenDocumentReady();
  const [applicationStyles, applicationScript] = await Promise.all([
    payload("__mcp_app_styles"),
    payload("__mcp_app_script"),
  ]);
  const style = document.createElement("style");
  style.textContent = applicationStyles;
  document.head.append(style);
  root.removeAttribute("role");
  root.replaceChildren();
  const script = document.createElement("script");
  script.type = "module";
  script.textContent = applicationScript;
  document.body.append(script);
}

function showFailure(error: unknown): void {
  console.error("Agent Review widget bootstrap failed.", error);
  root.setAttribute("role", "alert");
  root.style.padding = "24px";
  root.textContent = `Unable to open the Agent Review interface.${error instanceof Error ? ` ${error.message}` : ""}`;
}

async function start(): Promise<void> {
  try {
    await app.connect();
    update({ host: app.getHostContext() });
    document.documentElement.dataset.theme = snapshot.host?.theme === "dark" ? "dark" : "light";
    root.dataset.theme = snapshot.host?.theme === "dark" ? "dark" : "light";
    await loadApplicationPayload();
    void initialDataRecovery?.ready();
  } catch (error) {
    showFailure(error);
  }
}

if (configuration) void start();
