import type { App, McpUiHostContext } from "@modelcontextprotocol/ext-apps";

export interface McpBootstrapSnapshot {
  app: App;
  data: unknown;
  host: McpUiHostContext | undefined;
  metadata?: Record<string, unknown>;
  toolInput?: Record<string, unknown>;
}
export type AppView = "review" | "debugger" | "evaluation";

export interface McpBootstrap {
  getSnapshot: () => McpBootstrapSnapshot;
  replaceData: (data: unknown) => void;
  subscribe: (listener: () => void) => () => void;
  replaceMetadata?: (metadata: Record<string, unknown> | undefined) => void;
  readInitialResult?: (result: Awaited<ReturnType<App["callServerTool"]>>) => Promise<{
    data: unknown;
    metadata: Record<string, unknown> | undefined;
  }>;
  view?: AppView;
  root?: HTMLElement;
}

declare global {
  interface Window {
    __agentReviewMcpBootstrap?: McpBootstrap;
  }
}

export function getMcpBootstrap(view?: AppView): McpBootstrap {
  const bootstrap = window.__agentReviewMcpBootstrap;
  if (!bootstrap) throw new Error("The Agent Review MCP bridge is unavailable.");
  if (view && bootstrap.view && view !== bootstrap.view) {
    throw new Error("The app view does not match this widget.");
  }
  return bootstrap;
}

export function getApplicationRoot(view: AppView): HTMLElement {
  const root = getMcpBootstrap(view).root ?? document.getElementById("root");
  if (!root) throw new Error("The app view root is unavailable.");
  return root;
}
