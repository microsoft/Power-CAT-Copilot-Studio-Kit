import { afterEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { App, McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { getApplicationRoot, getMcpBootstrap, type AppView } from "./bootstrap-contract";

type FixtureApp = Partial<Pick<App, "ontoolinput" | "ontoolresult" | "onhostcontextchanged" | "onteardown">> & {
  connect(): Promise<void>;
  getHostContext(): McpUiHostContext;
};
const state = vi.hoisted(() => ({
  app: undefined as FixtureApp | undefined,
  connections: 0,
  call: vi.fn(),
}));
vi.mock("@modelcontextprotocol/ext-apps", () => ({
  App: class {
    ontoolinput?: App["ontoolinput"];
    ontoolresult?: App["ontoolresult"];
    onhostcontextchanged?: App["onhostcontextchanged"];
    onteardown?: App["onteardown"];
    constructor() { state.app = this; }
    connect = async () => { state.connections += 1; };
    getHostContext = (): McpUiHostContext => ({ theme: "light", displayMode: "inline" });
    callServerTool = state.call;
    sendSizeChanged = vi.fn(async () => ({}));
  },
}));
afterEach(() => {
  document.body.replaceChildren();
  document.head.querySelectorAll("style, script").forEach(item => item.remove());
  delete window.__agentReviewMcpBootstrap;
  delete document.documentElement.dataset.mcpView;
  delete document.documentElement.dataset.mcpOpenTool;
  state.connections = 0;
  state.app = undefined;
  state.call.mockReset();
  vi.restoreAllMocks();
  vi.resetModules();
});
const openTools: Record<AppView, string> = {
  review: "open_agent_review", debugger: "open_agent_debugger", evaluation: "open_evaluation_builder",
};
const resources: Record<AppView, string> = {
  review: "agent-review.html", debugger: "agent-debugger.html", evaluation: "evaluation-builder.html",
};
async function mount(view: AppView = "review", withOuterAttributes = true) {
  if (withOuterAttributes) {
    document.documentElement.dataset.mcpView = view;
    document.documentElement.dataset.mcpOpenTool = openTools[view];
  }
  const config = { autoResize: view !== "debugger", openTool: openTools[view], view };
  document.body.innerHTML = `<div id="root" role="status">Connecting...</div><script id="__mcp_app_config" type="application/json">${JSON.stringify(config)}</script><script id="__mcp_app_styles" type="text/plain">/* independent styles */</script><script id="__mcp_app_script" type="text/plain">/* independent app */</script>`;
  await import("./bootstrap");
  await waitFor(() => expect(document.body.querySelector('script[type="module"]')).toHaveTextContent("/* independent app */"));
  return state.app!;
}
async function notify(app: FixtureApp, result: CallToolResult) {
  await app.ontoolresult?.(result);
}
describe("independent app views", () => {
  it.each(["review", "debugger", "evaluation"] as const)("mounts only %s on its primary root with one connection and no app navigation", async view => {
    await mount(view, false);
    const primary = window.__agentReviewMcpBootstrap!;
    expect(getMcpBootstrap(view)).toBe(primary);
    expect(getApplicationRoot(view)).toBe(document.getElementById("root"));
    expect(primary.root).toBe(document.getElementById("root"));
    expect(primary.root).toHaveAttribute("data-mcp-view-root", view);
    expect(primary.root).not.toHaveAttribute("role");
    expect(primary.root).not.toHaveAttribute("aria-labelledby");
    expect(document.querySelector('[aria-label="App views"]')).toBeNull();
    expect(document.querySelector('[role="tablist"]')).toBeNull();
    expect(document.querySelector('[id^="mcp-view-"]')).toBeNull();
    expect(state.connections).toBe(1);
    expect(state.call).not.toHaveBeenCalled();
  });
  it.each([
    ["review", "debugger"], ["debugger", "evaluation"], ["evaluation", "review"],
  ] as const)("does not provide a %s widget root for the %s application", async (view, foreign) => {
    await mount(view);
    expect(() => getApplicationRoot(foreign)).toThrow(/view.*does not match/i);
    expect(document.querySelector('[id^="mcp-view-"]')).toBeNull();
    expect(state.call).not.toHaveBeenCalled();
  });
  it.each([
    ["missing", ""],
    ["malformed", '<script id="__mcp_app_config" type="application/json">{</script>'],
    ["invalid", '<script id="__mcp_app_config" type="application/json">{"autoResize":true,"openTool":"open_agent_review","view":"debugger"}</script>'],
  ])("reports %s body configuration before connecting or clearing the visible root", async (_name, config) => {
    document.documentElement.dataset.mcpView = "review";
    document.documentElement.dataset.mcpOpenTool = "open_agent_review";
    document.body.innerHTML = `<div id="root">Connecting...</div>${config}`;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await import("./bootstrap");
    expect(document.getElementById("root")).toHaveAttribute("role", "alert");
    expect(document.getElementById("root")).toHaveTextContent(/configuration/i);
    expect(state.connections).toBe(0);
    expect(error).toHaveBeenCalled();
  });
  it.each([
    ["review", "evaluation"], ["debugger", "review"], ["evaluation", "debugger"],
  ] as const)("ignores a %s widget's foreign %s result without embedding another app", async (view, foreign) => {
    const app = await mount(view);
    const own = { state: "ready", jobId: "running-job", draftId: "edited-draft", view };
    await notify(app, { content: [], structuredContent: own, _meta: { ownGrant: "current-app-only-grant" } });
    const primary = window.__agentReviewMcpBootstrap!;
    primary.replaceData({ ...own, localEdit: "Human-approved expectation" });
    await notify(app, { content: [], structuredContent: { state: "ready", view: foreign },
      _meta: { foreignGrant: "foreign-app-only-grant",
        ui: { resourceUri: `ui://${openTools[foreign]}/v1.0.18/${resources[foreign]}` } } });
    expect(primary.getSnapshot().data).toEqual({ ...own, localEdit: "Human-approved expectation" });
    expect(primary.getSnapshot().metadata).toEqual({ ownGrant: "current-app-only-grant" });
    expect(document.querySelector('[id^="mcp-view-"]')).toBeNull();
    expect(state.call).not.toHaveBeenCalled();
    expect(state.connections).toBe(1);
  });
  it("ignores foreign resource-bound deferred data before it can trigger callbacks", async () => {
    const app = await mount();
    state.call.mockResolvedValue({ content: [], structuredContent: { state: "selecting", view: "evaluation" } });
    await notify(app, { content: [], structuredContent: { state: "selecting", deferred: ["context"],
      contextId: "11111111-1111-4111-8111-111111111111" },
      _meta: { ui: { resourceUri: "ui://open_evaluation_builder/v1.0.18/evaluation-builder.html" } } });
    expect(window.__agentReviewMcpBootstrap!.getSnapshot().data).toBeNull();
    expect(state.call).not.toHaveBeenCalled();
    expect(document.querySelector('[id^="mcp-view-"]')).toBeNull();
  });
  it.each(["review", "debugger", "evaluation"] as const)("keeps %s data and metadata while applying host theme and display mode", async view => {
    const app = await mount(view);
    const primary = window.__agentReviewMcpBootstrap!;
    const own = { state: "ready", view, jobId: "running-job", editedExpectedResponse: "Human-approved draft" };
    await notify(app, { content: [], structuredContent: own, _meta: { ownGrant: "current-app-only-grant" } });
    await app.onhostcontextchanged?.({ theme: "dark", displayMode: "fullscreen" } satisfies Partial<McpUiHostContext>);
    expect(primary.getSnapshot().data).toEqual(own);
    expect(primary.getSnapshot().metadata).toEqual({ ownGrant: "current-app-only-grant" });
    expect(primary.getSnapshot().host?.theme).toBe("dark");
    expect(primary.getSnapshot().host?.displayMode).toBe("fullscreen");
    expect(primary.root?.dataset.theme).toBe("dark");
    expect(state.connections).toBe(1);
    expect(state.call).not.toHaveBeenCalled();
  });
  it("recovers a name-only Review input once with no environment requirement or start permission", async () => {
    const app = await mount();
    state.call.mockResolvedValue({ content: [], structuredContent: {
      state: "running", jobId: "44444444-4444-4444-8444-444444444444",
    } });
    const input = { arguments: { agentName: "Zava visual merchandizer" } };
    await app.ontoolinput?.(input);
    await app.ontoolinput?.(input);
    expect(state.call).toHaveBeenCalledTimes(1);
    expect(state.call).toHaveBeenCalledWith({
      name: "open_agent_review", arguments: { agentName: "Zava visual merchandizer", resumeOnly: true },
    });
    expect(window.__agentReviewMcpBootstrap!.getSnapshot().data).toMatchObject({
      state: "running", jobId: "44444444-4444-4444-8444-444444444444",
    });
  });
});
