import "@testing-library/jest-dom/vitest";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { App, type McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { UsageDiagnostics } from "../../agent-debugger/contracts/diagnostics";
import type { ProcessedTranscript } from "../../agent-debugger/contracts/transcript";
import { McpAppProvider } from "../shared/McpAppProvider";
import type { McpBootstrapSnapshot } from "../shared/bootstrap-contract";
import { readInitialResult } from "../shared/read-initial-result";
import { AgentDebuggerApp } from "./AgentDebuggerApp";

afterEach(() => {
  cleanup();
  delete window.__agentReviewMcpBootstrap;
  sessionStorage.clear();
  document.getElementById("root")?.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
type ToolResult = Awaited<ReturnType<App["callServerTool"]>>;
const environment = { id: "11111111-1111-1111-1111-111111111111", name: "Environment", url: "https://example.crm.dynamics.com" };
const agent = { id: "22222222-2222-2222-2222-222222222222", name: "Agent", experience: "generative" };
const conversations = [{ id: "first", name: "first" }, { id: "second", name: "second" }];
// The pickers, Analyze and the full tabs are in full screen. Inline has no selection status line:
// the header shows a loading spinner only while data loads, then the full Performance timeline
// and finite previews of the other tabs.
const fullscreenHost: Partial<McpUiHostContext> = { displayMode: "fullscreen" };
const intentKey = "agent-debugger:fullscreen-intent:first";

function analysis(id = "first", text = "Help with first") {
  const processedTranscript: ProcessedTranscript = {
    generalInfo: { durationMs: 61000, turnCount: 2 },
    raw: { activities: [] },
    turns: ["one", "two"].flatMap((session, index) => [
      { id: `user-${index + 1}`, role: "user" as const, content: index ? "Help with second session" : text, timestamp: `2026-10-07T10:0${index}:00.000Z`, activities: [{ type: "session", mergedSessionKey: session }] },
      { id: `assistant-${index + 1}`, role: "assistant" as const, content: "A saved reply", timestamp: `2026-10-07T10:0${index}:01.000Z`, activities: [{ type: "session", mergedSessionKey: session }], debugInfo: { stepExecutions: [{ stepId: `step-${index}`, taskDialogId: "agent.action.tool", subtitle: "Tool", state: "Completed", triggeredAt: `2026-10-07T10:0${index}:00.000Z`, finishedAt: `2026-10-07T10:0${index}:01.000Z` }] } },
    ]),
  };
  const recommendation = (index: number) => ({ id: `rec-${index}`, title: `Recommendation ${index}`, description: "A real check", suggestion: "Inspect the recorded event", category: "Performance", severity: "medium", turnId: `user-${index}`, turnNumber: index });
  return {
    state: "analysis", environment, environmentId: environment.id, environments: [environment],
    agent, agentId: agent.id, agents: [agent], conversation: { id, name: id }, conversations,
    processedTranscript, connectedAgents: [], componentNameBySchemaName: {},
    recommendations: [recommendation(1), recommendation(1), recommendation(2)],
    sessions: [
      { n: 1, startText: "First session", durationMs: 1000, turnCount: 1 },
      { n: 2, startText: "Second session", durationMs: 1000, turnCount: 1 },
    ],
  };
}

function mount(
  initialData: (Partial<ReturnType<typeof analysis>> & { conversationId?: string; targetResolved?: boolean; restoring?: boolean; deferred?: string[]; dataLoadError?: { source: "initial-data" }; error?: { code: string; message: string }; usage?: UsageDiagnostics; inlineLayout?: string }) | null = analysis(),
  toolInput?: Record<string, unknown>,
  hostPatch: Partial<McpUiHostContext> = {},
) {
  const app = new App({ name: "Debugger UI test", version: "1.0.0" });
  const listeners = new Set<() => void>();
  const original = initialData;
  let snapshot: McpBootstrapSnapshot = {
    app, data: original, toolInput,
    host: { theme: "light", displayMode: "inline", containerDimensions: { width: 1024, height: 820 }, ...hostPatch },
  };
  const replaceData = (data: unknown) => {
    snapshot = { ...snapshot, data };
    listeners.forEach(listener => listener());
  };
  const setHost = (patch: Partial<McpUiHostContext>) => {
    snapshot = { ...snapshot, host: { ...snapshot.host, ...patch } };
    listeners.forEach(listener => listener());
  };
  window.__agentReviewMcpBootstrap = {
    getSnapshot: () => snapshot, replaceData,
    readInitialResult: result => readInitialResult(app, result, "open_agent_debugger"),
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
  const call = vi.spyOn(app, "callServerTool").mockImplementation(async request => {
    const args = request.arguments ?? {};
    if (request.name === "list_debugger_agents") return { content: [], structuredContent: { agents: [agent] } };
    if (request.name === "list_debugger_conversations") return { content: [], structuredContent: { conversations } };
    if (request.name === "get_debugger_turn_details") return {
      content: [], structuredContent: { turn: { ...analysis().processedTranscript.turns[0], content: "Enriched user turn" } },
    };
    if (request.name === "get_debugger_conversation_transcript") return {
      content: [], structuredContent: { transcriptJson: { conversationId: args.conversationId, recordCount: 1, activityCount: 4, records: [{ conversationtranscriptid: "record", name: args.conversationId, content: { activities: [{ text: "Session one" }, { text: "Session two" }, {}, {}] } }] } },
    };
    return { content: [], structuredContent: analysis(String(args.conversationId), "New analysis") };
  });
  render(<FluentProvider theme={webLightTheme}><McpAppProvider><AgentDebuggerApp /></McpAppProvider></FluentProvider>);
  return { app, call, replaceData, setHost, original };
}

/** Seven single-session turns, each with one timed tool step on its reply. */
function manyTurns(count: number, usage?: UsageDiagnostics) {
  const at = (n: number, second: number) => `2026-10-07T10:${String(n).padStart(2, "0")}:0${second}.000Z`;
  const processedTranscript: ProcessedTranscript = {
    generalInfo: { durationMs: count * 60_000, turnCount: count },
    raw: { activities: [] },
    turns: Array.from({ length: count }, (_, index) => index + 1).flatMap(n => [
      { id: `user-${n}`, role: "user" as const, content: `Question ${n}`, timestamp: at(n, 0), activities: [{ type: "session", mergedSessionKey: "one" }] },
      { id: `assistant-${n}`, role: "assistant" as const, content: `Answer ${n}`, timestamp: at(n, 1), activities: [{ type: "session", mergedSessionKey: "one" }], debugInfo: { stepExecutions: [{ stepId: `step-${n}`, taskDialogId: "agent.action.tool", subtitle: "Tool", state: "Completed", triggeredAt: at(n, 0), finishedAt: at(n, 1) }] } },
    ]),
  };
  return {
    ...analysis(), processedTranscript, recommendations: [],
    sessions: [{ n: 1, startText: "First session", durationMs: count * 60_000, turnCount: count }],
    ...(usage ? { usage } : {}),
  };
}

const usageFixture: UsageDiagnostics = {
  reported: { copilotCredits: 2, totalTokens: 1200, tokenRecords: 1, creditRecords: 1, models: ["gpt-4o"], source: "activity-usage" },
  estimatedCredits: 3, confidence: "medium", groups: [], notes: [],
};

/** The bootstrap template pads #root; the reported frame size includes that padding. */
function frame(padding: number) {
  const root = document.createElement("div");
  root.id = "root";
  root.style.paddingTop = `${padding}px`;
  root.style.paddingBottom = `${padding}px`;
  root.style.paddingLeft = `${padding}px`;
  root.style.paddingRight = `${padding}px`;
  document.body.appendChild(root);
}

function debuggerRoot() {
  const root = screen.getByText("Agent Debugger").closest(".w-shell");
  if (!(root instanceof HTMLElement)) throw new Error("The Debugger root is missing.");
  return root;
}

function debuggerContent() {
  const content = document.querySelector("main");
  if (!(content instanceof HTMLElement)) throw new Error("The Debugger content is missing.");
  return content;
}

function debuggerHeader() {
  const header = document.querySelector("header.w-hdr");
  if (!(header instanceof HTMLElement)) throw new Error("The Debugger header is missing.");
  return header;
}

/** No "Selected conversation" status, and the header shows none of the given selection texts. */
function expectNoSelectionLine(...absent: string[]) {
  expect(screen.queryByRole("status", { name: "Selected conversation" })).toBeNull();
  for (const text of absent) expect(debuggerHeader()).not.toHaveTextContent(text);
}

const timelineTurns = () => screen.getByRole("tree", { name: "Performance timeline" }).querySelectorAll('[role="treeitem"][data-tv^="t"]');
const timelineSteps = () => screen.getByRole("tree", { name: "Performance timeline" }).querySelectorAll(".w-ti.step[data-entry]");

function collectScrolledElements() {
  const scrolled: Element[] = [];
  vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (this: Element) { scrolled.push(this); });
  return scrolled;
}

it("shows a named Debugger target with explicit supplemental loading and no automatic analysis", () => {
  const { call } = mount({
    state: "conversations", targetResolved: true, environment, environmentId: environment.id,
    agent, agentId: agent.id, restoring: true, deferred: ["agents", "conversations"],
  }, undefined, fullscreenHost);
  expect(screen.getByRole("combobox", { name: "Agent" })).toHaveValue("Agent");
  expect(screen.getByRole("progressbar", { name: "Loading saved conversations..." })).toBeInTheDocument();
  expect(screen.queryByRole("combobox", { name: "Environment" })).toBeNull();
  expect(screen.getByRole("button", { name: "Analyze" })).toBeDisabled();
  expect(call).not.toHaveBeenCalled();
});

it("keeps an acknowledged Debugger analysis visible when the host clears its data", () => {
  const { call, replaceData } = mount({ ...analysis(), targetResolved: true }, undefined, fullscreenHost);
  act(() => replaceData(null));
  expect(screen.getByRole("combobox", { name: "Agent" })).toHaveValue("Agent");
  expect(screen.getByRole("tablist", { name: "Debugger views" }).querySelectorAll('[role="tab"]')).toHaveLength(5);
  expect(call).not.toHaveBeenCalled();
});

it("shows the acknowledged first conversation while its saved analysis is loading, without another analysis call", () => {
  const { call } = mount({
    state: "analysis", targetResolved: true, environment, environmentId: environment.id,
    agent, agentId: agent.id, conversationId: "first", conversation: conversations[0], conversations,
    restoring: true, deferred: ["agents", "analysis"],
  }, undefined, fullscreenHost);
  expect(screen.getByRole("combobox", { name: "Conversation" })).toHaveValue("first");
  expect(screen.getByRole("button", { name: "Analyze" })).toBeDisabled();
  expect(screen.getByText("Loading saved analysis")).toBeInTheDocument();
  expect(call).not.toHaveBeenCalled();
});

it("explicit Debugger reload preserves the selected conversation rather than reopening the first one", async () => {
  const user = userEvent.setup();
  const { call } = mount({
    ...analysis("second"), conversationId: "second", targetResolved: true,
    dataLoadError: { source: "initial-data" },
    error: { code: "FIXTURE", message: "The supplemental read failed." },
  }, undefined, fullscreenHost);
  call.mockImplementation(async request => {
    expect(request.name).toBe("open_agent_debugger");
    return { content: [], structuredContent: { ...analysis("second"), targetResolved: true } };
  });
  await user.click(screen.getByRole("button", { name: "Reload Debugger data" }));
  await waitFor(() => expect(call).toHaveBeenCalledWith({
    name: "open_agent_debugger", arguments: { environmentId: environment.id, agentId: agent.id, conversationId: "second" },
  }));
  expect(screen.getByRole("combobox", { name: "Conversation" })).toHaveValue("second");
});

it("rejects a reload for another conversation without replacing the selected saved analysis", async () => {
  const user = userEvent.setup();
  const { call } = mount({
    ...analysis("second"), conversationId: "second", targetResolved: true,
    dataLoadError: { source: "initial-data" }, error: { code: "FIXTURE", message: "The supplemental read failed." },
  }, undefined, fullscreenHost);
  call.mockResolvedValue({ content: [], structuredContent: { ...analysis("first"), targetResolved: true } });
  await user.click(screen.getByRole("button", { name: "Reload Debugger data" }));
  await screen.findByText("The restored Debugger data does not match the selected target or conversation.");
  expect(screen.getByRole("combobox", { name: "Conversation" })).toHaveValue("second");
  expect(screen.getByText(/^Conversation shown: second\./)).toBeInTheDocument();
  expect(call).toHaveBeenCalledTimes(1);
});

it("bounds missing Debugger host data and reloads only its read-only opener", async () => {
  vi.useFakeTimers();
  const input = { agentName: agent.name, environmentName: environment.name };
  const { call } = mount(null, input, fullscreenHost);
  call.mockResolvedValue({ content: [], structuredContent: {
    state: "conversations", targetResolved: true, environment, environmentId: environment.id,
    agent, agentId: agent.id, conversations,
  } });
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
  expect(screen.getByRole("alert")).toHaveTextContent("The host has not delivered Agent Debugger data.");
  expect(call).not.toHaveBeenCalled();
  await act(async () => { screen.getByRole("button", { name: "Reload Debugger data" }).click(); });
  expect(call).toHaveBeenCalledTimes(1);
  expect(call).toHaveBeenCalledWith({ name: "open_agent_debugger", arguments: input });
  expect(screen.getByRole("button", { name: "Analyze" })).toBeDisabled();
  expect(screen.getByRole("combobox", { name: "Conversation" })).toHaveValue("");
});

it("keeps detail and full-JSON requests bound to the loaded analysis when a different conversation is selected", async () => {
  const user = userEvent.setup();
  const { call, replaceData, original } = mount(undefined, undefined, fullscreenHost);
  await user.click(screen.getByRole("combobox", { name: "Conversation" }));
  await user.click(await screen.findByRole("option", { name: /^second/ }));
  await user.click(screen.getByRole("tab", { name: "Conversation & activities" }));
  await user.click(screen.getByRole("button", { name: "Turn 1" }));
  await waitFor(() => expect(call).toHaveBeenCalledWith({ name: "get_debugger_turn_details", arguments: { environmentId: environment.id, agentId: agent.id, conversationId: "first", turnId: "user-1" } }));
  await screen.findByText("Enriched user turn");
  await user.click(screen.getByRole("button", { name: "Raw JSON" }));
  await screen.findByRole("dialog", { name: "Conversation JSON" });
  expect(call).toHaveBeenCalledWith({ name: "get_debugger_conversation_transcript", arguments: { environmentId: environment.id, agentId: agent.id, conversationId: "first" } });
  await user.click(screen.getByRole("button", { name: "Close conversation JSON" }));
  act(() => replaceData({ ...original, agents: [agent] }));
  expect(screen.getByRole("button", { name: /Enriched user turn/ })).toBeInTheDocument();
});

it("shows counts for visible execution steps and unique session-scoped recommendations", async () => {
  const user = userEvent.setup();
  mount();
  expect(screen.getByRole("tab", { name: /Execution flow/ }).querySelector('[aria-label="2 execution steps"]')).toHaveTextContent("2");
  expect(screen.getByRole("tab", { name: /Agent insights/ }).querySelector('[aria-label="2 recommendations in this view"]')).toHaveTextContent("2");
  await user.click(screen.getByRole("combobox", { name: "Session" }));
  await user.click(screen.getByRole("option", { name: /^Session 2/ }));
  expect(screen.getByRole("tab", { name: /Execution flow/ }).querySelector('[aria-label="1 execution step"]')).toHaveTextContent("1");
  expect(screen.getByRole("tab", { name: /Agent insights/ }).querySelector('[aria-label="1 recommendation in this view"]')).toHaveTextContent("1");
});

it("rejects delayed details after a new analysis", async () => {
  const user = userEvent.setup();
  const { call } = mount(undefined, undefined, fullscreenHost);
  let finish!: (value: ToolResult) => void;
  const pending = new Promise<ToolResult>(resolve => { finish = resolve; });
  call.mockImplementation(async request => request.name === "get_debugger_turn_details"
    ? pending : { content: [], structuredContent: analysis("second", "New analysis") });
  await user.click(screen.getByRole("tab", { name: "Conversation & activities" }));
  await user.click(screen.getByRole("button", { name: "Turn 1" }));
  await user.click(screen.getByRole("combobox", { name: "Conversation" }));
  await user.click(await screen.findByRole("option", { name: /^second/ }));
  await user.click(screen.getByRole("button", { name: "Analyze" }));
  await waitFor(() => expect(call).toHaveBeenCalledWith({ name: "analyze_debugger_conversation", arguments: { environmentId: environment.id, agentId: agent.id, conversationId: "second" } }));
  await waitFor(() => expect(screen.getByText(/Conversation shown: second/)).toBeInTheDocument());
  await act(async () => { finish({ content: [], structuredContent: { turn: { ...analysis().processedTranscript.turns[0], content: "Stale detail" } } }); await pending; });
  await user.click(screen.getByRole("tab", { name: "Conversation & activities" }));
  expect(screen.getByRole("button", { name: /New analysis/ })).toBeInTheDocument();
  expect(screen.queryByText("Stale detail")).toBeNull();
});

it("rejects an old analysis response after the host supplies a new analysis", async () => {
  const user = userEvent.setup();
  const { call, replaceData } = mount(undefined, undefined, fullscreenHost);
  let finish!: (value: ToolResult) => void;
  const pending = new Promise<ToolResult>(resolve => { finish = resolve; });
  call.mockImplementation(async request => request.name === "analyze_debugger_conversation"
    ? pending : { content: [], structuredContent: { conversations } });
  await user.click(screen.getByRole("combobox", { name: "Conversation" }));
  await user.click(await screen.findByRole("option", { name: /^second/ }));
  await user.click(screen.getByRole("button", { name: "Analyze" }));
  act(() => replaceData(analysis("host", "Host analysis")));
  await act(async () => { finish({ content: [], structuredContent: analysis("second", "Old analysis") }); await pending; });
  expect(screen.getByText(/Conversation shown: host/)).toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: "Conversation & activities" }));
  expect(screen.getByRole("button", { name: /Host analysis/ })).toBeInTheDocument();
  expect(screen.queryByText("Old analysis")).toBeNull();
});

it("uses the host display-mode operation rather than a browser-only full-screen fallback", async () => {
  const user = userEvent.setup();
  const { app } = mount();
  const display = vi.spyOn(app, "requestDisplayMode").mockResolvedValue({ mode: "fullscreen" });
  await user.click(screen.getByRole("button", { name: "Open full screen" }));
  expect(display).toHaveBeenCalledWith({ mode: "fullscreen" });
});

it("relies on the host close control in full screen and never requests a display mode by itself", () => {
  const fullscreenSubtitle = /Analyze and visualize agent conversation transcripts/;
  // The prototype spy also records a request that a mount effect could make.
  const display = vi.spyOn(App.prototype, "requestDisplayMode").mockResolvedValue({ mode: "fullscreen" });
  const { call, setHost } = mount(manyTurns(7, usageFixture), undefined, fullscreenHost);
  expect(screen.getByText(fullscreenSubtitle)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /exit full ?screen/i })).toBeNull();
  expect(screen.queryByRole("button", { name: "Open full screen" })).toBeNull();
  // The host close control ends full screen. The view shows its inline layout without a display request.
  act(() => setHost({ displayMode: "inline" }));
  expect(screen.queryByText(fullscreenSubtitle)).toBeNull();
  expect(screen.getByRole("button", { name: "Open full screen" })).toBeInTheDocument();
  expect(screen.getByRole("toolbar", { name: "Turn 6 actions" })).toBeInTheDocument();
  act(() => setHost({ displayMode: "fullscreen" }));
  expect(screen.getByText(fullscreenSubtitle)).toBeInTheDocument();
  act(() => setHost({ displayMode: "inline" }));
  expect(screen.getByRole("button", { name: "Open full screen" })).toBeInTheDocument();
  expect(display).not.toHaveBeenCalled();
  expect(call).not.toHaveBeenCalled();
});

it("does not add a second automatic chooser when a list-only Debugger reply arrives", async () => {
  const { call } = mount({
    state: "conversations", targetResolved: true, environment, environmentId: environment.id,
    environments: [environment], agent, agentId: agent.id, agents: [agent], conversations,
  }, undefined, fullscreenHost);
  expect(screen.queryByRole("combobox", { name: "Environment" })).toBeNull();
  expect(screen.getByRole("combobox", { name: "Conversation" })).toHaveValue("");
  expect(screen.getByRole("button", { name: "Analyze" })).toBeDisabled();
  expect(screen.getByRole("combobox", { name: "Agent" })).toHaveValue("Agent");
  expect(call).not.toHaveBeenCalled();
});

it("keeps prompt conversation choice and date filters read-only", async () => {
  const user = userEvent.setup();
  const { call } = mount({
    state: "conversations", targetResolved: true, environment, environmentId: environment.id,
    environments: [environment], agent, agentId: agent.id, agents: [agent], conversations,
  }, undefined, fullscreenHost);
  await user.click(screen.getByRole("combobox", { name: "Conversation" }));
  await user.click(await screen.findByRole("option", { name: /^second/ }));
  expect(call.mock.calls.every(([request]) => request.name === "list_debugger_conversations")).toBe(true);
  await user.click(screen.getByRole("button", { name: "Analyze" }));
  await waitFor(() => expect(call).toHaveBeenCalledWith({
    name: "analyze_debugger_conversation",
    arguments: { environmentId: environment.id, agentId: agent.id, conversationId: "second" },
  }));
  expect(call.mock.calls.every(([request]) => !["start_agent_review", "finalize_agent_review"].includes(request.name))).toBe(true);
});

it("keeps an unavailable prompt conversation reason visible and permits a manual target change", async () => {
  const user = userEvent.setup();
  mount({
    state: "conversations", targetResolved: true, environment, environmentId: environment.id,
    environments: [environment], agent, agentId: agent.id, agents: [agent], conversations,
    error: { code: "TRANSCRIPT_NOT_FOUND", message: "This conversation is unavailable for the selected agent." },
  }, undefined, fullscreenHost);
  expect(screen.getByText("This conversation is unavailable for the selected agent.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Analyze" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Clear agent" }));
  expect(screen.getByRole("combobox", { name: "Environment" })).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Agent" })).toBeInTheDocument();
});

it("opens supplied saved analysis directly without another analysis or review request", async () => {
  const { call } = mount({ ...analysis(), targetResolved: true }, undefined, fullscreenHost);
  expect(screen.queryByRole("combobox", { name: "Environment" })).toBeNull();
  expect(screen.getByText(/Conversation shown: first/)).toBeInTheDocument();
  expect(screen.getAllByRole("tab")).toHaveLength(5);
  expect(call).not.toHaveBeenCalled();
});

it("keeps unresolved prompt targets on the form with their reason visible", () => {
  const { call } = mount({
    state: "selecting", targetResolved: false, environment, environmentId: environment.id,
    environments: [environment], agents: [agent],
    error: { code: "AGENT_AMBIGUOUS", message: "More than one agent has this exact name. Choose an agent." },
  }, undefined, fullscreenHost);
  expect(screen.getByRole("combobox", { name: "Environment" })).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Agent" })).toHaveValue("");
  expect(screen.getByText("More than one agent has this exact name. Choose an agent.")).toBeInTheDocument();
  expect(call).not.toHaveBeenCalled();
});

it("does not show an empty target form while the initial saved data is being recovered", () => {
  const { call } = mount({});
  expect(screen.getByText("Loading Agent Debugger...")).toBeInTheDocument();
  expect(screen.queryByRole("combobox", { name: "Environment" })).toBeNull();
  expect(screen.queryByRole("combobox", { name: "Agent" })).toBeNull();
  expect(call).not.toHaveBeenCalled();
});

const listOnly = {
  state: "conversations", targetResolved: true, environment, environmentId: environment.id,
  environments: [environment], agent, agentId: agent.id, agents: [agent], conversations,
};
const pickerNames = ["Environment", "Agent", "Conversation"] as const;
const fullscreenPrompt = "Open full screen to choose an agent and a conversation";
const askInChat = "Ask in chat for an agent and a conversation to debug.";

it("hides the pickers, Analyze and the selection status line inline", () => {
  const { call, replaceData } = mount({ ...analysis(), targetResolved: true });
  for (const name of pickerNames) expect(screen.queryByRole("combobox", { name })).toBeNull();
  expect(screen.queryByRole("button", { name: "Analyze" })).toBeNull();
  expectNoSelectionLine("first");
  expect(debuggerHeader()).toHaveTextContent(/^Agent Debugger$/);
  expect(debuggerHeader().children).toHaveLength(1);
  expect(screen.getByRole("tablist", { name: "Debugger views" }).querySelectorAll('[role="tab"]')).toHaveLength(5);
  act(() => replaceData(null));
  expectNoSelectionLine("first");
  expect(timelineSteps()).toHaveLength(2);
  expect(call).not.toHaveBeenCalled();
});

it("asks for full screen inline when no conversation is loaded, without another request", async () => {
  const user = userEvent.setup();
  const { app, call } = mount(listOnly);
  const display = vi.spyOn(app, "requestDisplayMode").mockResolvedValue({ mode: "fullscreen" });
  expect(screen.getByText(fullscreenPrompt)).toBeInTheDocument();
  expect(screen.queryByText(askInChat)).toBeNull();
  for (const name of pickerNames) expect(screen.queryByRole("combobox", { name })).toBeNull();
  expect(screen.queryByRole("button", { name: "Analyze" })).toBeNull();
  expectNoSelectionLine("No conversation selected");
  await user.click(screen.getByRole("button", { name: "Open full screen" }));
  expect(display).toHaveBeenCalledWith({ mode: "fullscreen" });
  expect(call).not.toHaveBeenCalled();
});

it("shows the acknowledged conversation loading inline without the full-screen prompt", () => {
  const { call } = mount({
    state: "analysis", targetResolved: true, environment, environmentId: environment.id,
    agent, agentId: agent.id, conversationId: "first", conversation: conversations[0], conversations,
    restoring: true, deferred: ["agents", "analysis"],
  });
  expect(screen.getByText("Loading saved analysis")).toBeInTheDocument();
  expect(screen.getByText("Loading saved conversation first.")).toBeInTheDocument();
  expect(screen.queryByText(fullscreenPrompt)).toBeNull();
  expectNoSelectionLine("first");
  expect(within(debuggerHeader()).getByText("Loading saved analysis...")).toBeInTheDocument();
  expect(screen.queryByRole("combobox", { name: "Conversation" })).toBeNull();
  expect(call).not.toHaveBeenCalled();
});

it("loads the deferred first conversation inline with no Analyze click once the host supplies its analysis", () => {
  const { call, replaceData } = mount({
    state: "analysis", targetResolved: true, environment, environmentId: environment.id,
    agent, agentId: agent.id, conversationId: "first", conversation: conversations[0], conversations,
    restoring: true, deferred: ["agents", "analysis"],
  }, undefined, { availableDisplayModes: ["inline"] });
  expect(screen.getByText("Loading saved analysis")).toBeInTheDocument();
  expect(screen.queryByText(askInChat)).toBeNull();
  expect(screen.queryByRole("button", { name: "Analyze" })).toBeNull();
  // The shared bootstrap reads the deferred analysis itself and replaces the tool data.
  act(() => replaceData({ ...analysis(), targetResolved: true }));
  expect(timelineTurns()).toHaveLength(2);
  expect(timelineSteps()).toHaveLength(2);
  expectNoSelectionLine("first");
  expect(debuggerHeader()).not.toHaveTextContent("Loading saved analysis...");
  expect(debuggerHeader().children).toHaveLength(1);
  for (const name of pickerNames) expect(screen.queryByRole("combobox", { name })).toBeNull();
  expect(screen.queryByRole("button", { name: "Analyze" })).toBeNull();
  expect(call).not.toHaveBeenCalled();
});

it("shows the pickers and Analyze in full screen without the inline status", () => {
  mount(undefined, undefined, fullscreenHost);
  expect(screen.getByRole("combobox", { name: "Environment" })).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Agent" })).toHaveValue("Agent");
  expect(screen.getByRole("combobox", { name: "Conversation" })).toHaveValue("first");
  expect(screen.getByRole("button", { name: "Analyze" })).toBeEnabled();
  expect(screen.queryByRole("status", { name: "Selected conversation" })).toBeNull();
  expect(screen.getByRole("tree", { name: "Performance timeline" })).toBeInTheDocument();
});

it("never shows the pickers or Analyze inline and asks in chat when the host does not offer full screen", () => {
  const { call } = mount(listOnly, undefined, { availableDisplayModes: ["inline"] });
  for (const name of pickerNames) expect(screen.queryByRole("combobox", { name })).toBeNull();
  expect(screen.queryByRole("button", { name: "Analyze" })).toBeNull();
  expect(screen.getByText(askInChat)).toBeInTheDocument();
  expect(screen.queryByText(fullscreenPrompt)).toBeNull();
  expectNoSelectionLine("No conversation selected");
  expect(call).not.toHaveBeenCalled();
});

it("keeps the inline empty title compact with the ask-in-chat hint, and the large title in full screen", () => {
  mount(listOnly, undefined, { availableDisplayModes: ["inline"] });
  const title = screen.getByText("Select a conversation to start debugging");
  expect(title).toHaveClass("fui-Text");
  expect(title).not.toHaveClass("fui-Title3");
  expect(screen.getByText(askInChat)).toBeInTheDocument();
  expect(screen.queryByText("Choose a conversation and select Analyze to see its saved transcript.")).toBeNull();
  cleanup();
  mount(listOnly, undefined, fullscreenHost);
  expect(screen.getByText("Select a conversation to start debugging")).toHaveClass("fui-Title3");
  expect(screen.getByText("Choose a conversation and select Analyze to see its saved transcript.")).toBeInTheDocument();
  expect(screen.queryByText(askInChat)).toBeNull();
});

it.each(["inline", "error"] as const)("keeps the pickers out of the inline view and asks in chat when the host refuses full screen (%s)", async outcome => {
  const user = userEvent.setup();
  const { app, call } = mount(listOnly);
  const display = vi.spyOn(app, "requestDisplayMode");
  if (outcome === "inline") display.mockResolvedValue({ mode: "inline" });
  else display.mockRejectedValue(new Error("The host does not support this display mode."));
  await user.click(screen.getByRole("button", { name: "Open full screen" }));
  expect(display).toHaveBeenCalledWith({ mode: "fullscreen" });
  expect(await screen.findByText("Fullscreen is not available in this host.")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).toBeNull();
  for (const name of pickerNames) expect(screen.queryByRole("combobox", { name })).toBeNull();
  expect(screen.queryByRole("button", { name: "Analyze" })).toBeNull();
  expect(screen.getByText(askInChat)).toBeInTheDocument();
  expect(screen.queryByText(fullscreenPrompt)).toBeNull();
  expectNoSelectionLine("No conversation selected");
  expect(call).not.toHaveBeenCalled();
});

it("shows the full Performance timeline inline with every turn and step row", () => {
  const { call, setHost } = mount(manyTurns(7));
  expect(timelineTurns()).toHaveLength(7);
  timelineTurns().forEach(turn => expect(turn).toHaveAttribute("aria-expanded", "true"));
  expect(timelineSteps()).toHaveLength(7);
  expect(screen.getByLabelText("Component colour key")).toBeInTheDocument();
  expect(document.querySelector(".w-slowest")).toHaveTextContent("Slowest step —");
  expect(screen.getByRole("button", { name: "Collapse all" })).toBeInTheDocument();
  expect(screen.queryByRole("list", { name: "Performance timeline" })).toBeNull();
  expect(screen.queryByText(/^Showing .* turns?$/)).toBeNull();
  expect(screen.queryByRole("button", { name: /^Show all/ })).toBeNull();
  expect(debuggerContent().style.overflowY).toBe("auto");
  act(() => setHost({ displayMode: "fullscreen" }));
  expect(timelineTurns()).toHaveLength(7);
  expect(timelineSteps()).toHaveLength(7);
  expect(debuggerContent().style.overflowY).toBe("");
  expect(call).not.toHaveBeenCalled();
});

it("opens the stored turn when the host mounts a new Debugger view in full screen", async () => {
  sessionStorage.setItem(intentKey, JSON.stringify({ tab: "performance", turnNumber: 6, messageId: "user-6" }));
  const scrolled = collectScrolledElements();
  const { call } = mount(manyTurns(7), undefined, fullscreenHost);
  await waitFor(() => expect(scrolled).toContain(document.querySelector('[data-tv="t6"]')));
  expect(document.querySelector('[data-tv="t6"]')).toHaveClass("sel");
  expect(sessionStorage.getItem(intentKey)).toBeNull();
  expect(call).not.toHaveBeenCalled();
});

it("opens the stored tab when the host mounts a new Debugger view in full screen", () => {
  sessionStorage.setItem(intentKey, JSON.stringify({ tab: "usage" }));
  mount(manyTurns(7, usageFixture), undefined, fullscreenHost);
  expect(screen.getByRole("tab", { name: "Usage and credits" })).toHaveAttribute("aria-selected", "true");
  expect(sessionStorage.getItem(intentKey)).toBeNull();
});

it("shows the full inline timeline without paging or pickers when the host does not offer full screen", () => {
  const { call } = mount(manyTurns(7), undefined, { availableDisplayModes: ["inline"] });
  expect(timelineTurns()).toHaveLength(7);
  expect(timelineSteps()).toHaveLength(7);
  expect(screen.queryByText(/^Showing .* turns?$/)).toBeNull();
  expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  for (const name of pickerNames) expect(screen.queryByRole("combobox", { name })).toBeNull();
  expect(screen.queryByRole("button", { name: "Analyze" })).toBeNull();
  expectNoSelectionLine("first");
  expect(call).not.toHaveBeenCalled();
});

it("sizes the inline Debugger to the host height budget minus the frame inset", () => {
  frame(24);
  mount(manyTurns(7), undefined, { containerDimensions: { width: 760, maxHeight: 500 } });
  expect(debuggerRoot().style.height).toBe("452px");
  expect(parseFloat(debuggerRoot().style.minHeight)).toBe(0);
});

it("keeps the inline root within a short budget and scrolls only the timeline content", async () => {
  const user = userEvent.setup();
  frame(24);
  mount(manyTurns(7), undefined, { containerDimensions: { width: 760, height: 300 } });
  expect(debuggerRoot().style.height).toBe("252px");
  expect(timelineTurns()).toHaveLength(7);
  expect(timelineSteps()).toHaveLength(7);
  expect(debuggerContent().style.overflowY).toBe("auto");
  await user.click(screen.getByRole("tab", { name: /Execution flow/ }));
  expect(debuggerContent().style.overflowY).toBe("");
  // With no status line, the 32 px row goes to the content: one more 32 px preview row fits.
  expect(within(screen.getByRole("list", { name: "Execution flow" })).getAllByRole("listitem")).toHaveLength(3);
  expect(screen.getByText("Showing 3 of 7 turns")).toBeInTheDocument();
  expect(debuggerRoot().style.height).toBe("252px");
});

it("uses the default inline budget when the host reports no height", () => {
  mount(manyTurns(7), undefined, { containerDimensions: { width: 760 } });
  expect(debuggerRoot().style.height).toBe("600px");
});

it("never reports an inline size above the host budget", () => {
  frame(24);
  const sizes = vi.spyOn(App.prototype, "sendSizeChanged").mockResolvedValue(undefined);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const [width, height] = this.classList.contains("w-shell") ? [900, 2000] : [0, 0];
    return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON: () => ({}) };
  });
  mount(manyTurns(7), undefined, { containerDimensions: { width: 760, maxHeight: 500 } });
  expect(sizes).toHaveBeenCalled();
  for (const [size] of sizes.mock.calls) expect(size.height).toBeLessThanOrEqual(500);
  expect(sizes).toHaveBeenLastCalledWith({ width: 948, height: 500 });
});

it("keeps an unresolved target reason visible inline and offers its pickers in full screen", async () => {
  const user = userEvent.setup();
  const { app, call, setHost } = mount({
    state: "selecting", targetResolved: false, environment, environmentId: environment.id,
    environments: [environment], agents: [agent],
    error: { code: "AGENT_AMBIGUOUS", message: "More than one agent has this exact name. Choose an agent." },
  });
  const display = vi.spyOn(app, "requestDisplayMode").mockResolvedValue({ mode: "fullscreen" });
  expect(screen.getByRole("alert")).toHaveTextContent("More than one agent has this exact name. Choose an agent.");
  expect(screen.queryByRole("combobox", { name: "Agent" })).toBeNull();
  expectNoSelectionLine("No agent selected");
  expect(screen.getByText(fullscreenPrompt)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Open full screen" }));
  expect(display).toHaveBeenCalledWith({ mode: "fullscreen" });
  act(() => setHost({ displayMode: "fullscreen" }));
  expect(screen.getByRole("combobox", { name: "Environment" })).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Agent" })).toHaveValue("");
  expect(screen.getByText("More than one agent has this exact name. Choose an agent.")).toBeInTheDocument();
  expect(call).not.toHaveBeenCalled();
});

it("keeps a read failure and its reload visible inline and reloads the selected conversation", async () => {
  const user = userEvent.setup();
  const { call } = mount({
    ...analysis("second"), conversationId: "second", targetResolved: true,
    dataLoadError: { source: "initial-data" },
    error: { code: "FIXTURE", message: "The supplemental read failed." },
  });
  call.mockResolvedValue({ content: [], structuredContent: { ...analysis("second"), targetResolved: true } });
  expect(screen.getByRole("alert")).toHaveTextContent("The supplemental read failed.");
  expectNoSelectionLine("second");
  await user.click(screen.getByRole("button", { name: "Reload Debugger data" }));
  await waitFor(() => expect(call).toHaveBeenCalledWith({
    name: "open_agent_debugger", arguments: { environmentId: environment.id, agentId: agent.id, conversationId: "second" },
  }));
  expectNoSelectionLine("second");
});

it("previews the other Debugger views inline with finite rows and full-screen actions", async () => {
  const user = userEvent.setup();
  const { app, call } = mount(manyTurns(7, usageFixture));
  const display = vi.spyOn(app, "requestDisplayMode").mockResolvedValue({ mode: "fullscreen" });

  await user.click(screen.getByRole("tab", { name: /Execution flow/ }));
  expect(within(screen.getByRole("list", { name: "Execution flow" })).getAllByRole("listitem")).toHaveLength(5);
  expect(screen.getByText("Showing 5 of 7 turns")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "View all 7 turns in full screen" })).toBeInTheDocument();

  await user.click(screen.getByRole("tab", { name: "Conversation & activities" }));
  expect(within(screen.getByRole("list", { name: "Conversation & activities" })).getAllByRole("listitem")).toHaveLength(5);
  expect(screen.getByText("Showing 5 of 14 messages")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "View all 14 messages in full screen" }));
  expect(display).toHaveBeenCalledTimes(1);
  expect(JSON.parse(sessionStorage.getItem(intentKey) ?? "null")).toEqual({ tab: "conversation" });

  await user.click(screen.getByRole("tab", { name: /Agent insights/ }));
  expect(screen.getByText("No recommendations for this view.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "View agent insights in full screen" })).toBeInTheDocument();

  await user.click(screen.getByRole("tab", { name: "Usage and credits" }));
  expect(within(screen.getByRole("list", { name: "Usage and credits" })).getAllByRole("listitem")).toHaveLength(5);
  expect(screen.getByText("Showing 5 of 7 metrics")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "View all usage details in full screen" }));
  expect(display).toHaveBeenCalledTimes(2);
  expect(JSON.parse(sessionStorage.getItem(intentKey) ?? "null")).toEqual({ tab: "usage" });
  expect(call).not.toHaveBeenCalled();
});

/** No inline preview list, "Showing" footer or "in full screen" action is on the page. */
function expectNoInlinePreview() {
  for (const name of ["Execution flow", "Conversation & activities", "Usage and credits"]) {
    expect(screen.queryByRole("list", { name })).toBeNull();
  }
  expect(screen.queryByText(/^Showing \d+ of \d+/)).toBeNull();
  expect(screen.queryByRole("button", { name: /in full screen$/ })).toBeNull();
}

it("shows the full Debugger tabs inline when the result asks for the full inline layout", async () => {
  const user = userEvent.setup();
  const { call } = mount({ ...manyTurns(7, usageFixture), inlineLayout: "full" });
  expect(timelineTurns()).toHaveLength(7);
  expect(timelineSteps()).toHaveLength(7);
  expect(debuggerContent().style.overflowY).toBe("auto");

  await user.click(screen.getByRole("tab", { name: /Execution flow/ }));
  expect(screen.getByLabelText("Execution flow summary")).toBeInTheDocument();
  expect(document.querySelectorAll(".w-diagturn[data-turn-id]")).toHaveLength(7);
  expect(debuggerContent().style.overflowY).toBe("auto");
  expect(debuggerContent().style.overflowX).toBe("auto");
  expectNoInlinePreview();

  await user.click(screen.getByRole("tab", { name: "Conversation & activities" }));
  expect(screen.getAllByRole("button", { name: /^Turn \d+/ })).toHaveLength(7);
  expect(debuggerContent().style.overflowY).toBe("auto");
  expectNoInlinePreview();

  await user.click(screen.getByRole("tab", { name: /Agent insights/ }));
  expect(screen.getByRole("heading", { name: "Recommendations" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /runtime/ })).toBeInTheDocument();
  expect(screen.queryByText("No recommendations for this view.")).toBeNull();
  expectNoInlinePreview();

  await user.click(screen.getByRole("tab", { name: "Usage and credits" }));
  expect(screen.getByLabelText("Usage and credit diagnostics")).toBeInTheDocument();
  expectNoInlinePreview();

  for (const name of pickerNames) expect(screen.queryByRole("combobox", { name })).toBeNull();
  expect(screen.queryByRole("button", { name: "Analyze" })).toBeNull();
  expect(screen.getByRole("button", { name: "Open full screen" })).toBeInTheDocument();
  expect(call).not.toHaveBeenCalled();
});

it("keeps the first inline layout for the life of the view", async () => {
  const user = userEvent.setup();
  const { replaceData } = mount({ ...manyTurns(7, usageFixture), inlineLayout: "full" });
  await user.click(screen.getByRole("tab", { name: /Execution flow/ }));
  act(() => replaceData(manyTurns(7, usageFixture)));
  expect(screen.getByLabelText("Execution flow summary")).toBeInTheDocument();
  act(() => replaceData({ ...manyTurns(7, usageFixture), inlineLayout: "preview" }));
  expect(screen.getByLabelText("Execution flow summary")).toBeInTheDocument();
  expectNoInlinePreview();
});

it("keeps the inline previews when the layout is preview, missing or unknown", async () => {
  const user = userEvent.setup();
  for (const inlineLayout of ["preview", undefined, "wide"]) {
    mount({ ...manyTurns(7, usageFixture), ...(inlineLayout ? { inlineLayout } : {}) });
    await user.click(screen.getByRole("tab", { name: /Execution flow/ }));
    expect(within(screen.getByRole("list", { name: "Execution flow" })).getAllByRole("listitem")).toHaveLength(5);
    expect(screen.queryByLabelText("Execution flow summary")).toBeNull();
    expect(debuggerContent().style.overflowY).toBe("");
    cleanup();
  }
});

it("takes the full inline layout from a later result when the first result has none", async () => {
  const user = userEvent.setup();
  const { replaceData } = mount(manyTurns(7, usageFixture));
  await user.click(screen.getByRole("tab", { name: /Execution flow/ }));
  expect(screen.getByRole("list", { name: "Execution flow" })).toBeInTheDocument();
  act(() => replaceData({ ...manyTurns(7, usageFixture), inlineLayout: "full" }));
  expect(screen.getByLabelText("Execution flow summary")).toBeInTheDocument();
  expectNoInlinePreview();
});

it("jumps from the inline timeline to the selected turn in the full inline Execution flow", async () => {
  const user = userEvent.setup();
  const { call } = mount({ ...manyTurns(7), inlineLayout: "full" });
  await user.click(within(screen.getByRole("toolbar", { name: "Turn 6 actions" })).getByRole("button", { name: "Execution flow" }));
  expect(screen.getByRole("tab", { name: /Execution flow/ })).toHaveAttribute("aria-selected", "true");
  const target = document.querySelector('[data-turn-id="user-6"]');
  expect(target).toHaveAttribute("aria-current", "true");
  await waitFor(() => expect(document.activeElement).toBe(target));
  expect(call).toHaveBeenCalledWith({
    name: "get_debugger_turn_details",
    arguments: { environmentId: environment.id, agentId: agent.id, conversationId: "first", turnId: "user-6" },
  });
});

/** The Conversation & activities layout follows the view (iframe) width. */
function setViewWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
  window.dispatchEvent(new Event("resize"));
}

afterEach(() => setViewWidth(1024));

function activitiesTab() {
  const root = document.querySelector("[data-layout]");
  if (!(root instanceof HTMLElement)) throw new Error("The Conversation & activities tab is missing.");
  return root;
}

/** The cards that sit side by side in the tab, by their heading text. */
function paneTitles() {
  const grid = activitiesTab().lastElementChild;
  return Array.from(grid?.children ?? []).map(pane => pane.querySelector("h2")?.textContent?.trim() ?? "details");
}

const hostRefusal = new Error("MCP error -32000: MCP integration is unavailable for this agent.");

/** The analysis fixture with step inputs and outputs, so its activities have details to open. */
function detailedAnalysis(): ReturnType<typeof analysis> {
  const data = analysis();
  return {
    ...data,
    processedTranscript: {
      ...data.processedTranscript,
      turns: data.processedTranscript.turns.map(turn => turn.debugInfo ? {
        ...turn,
        debugInfo: {
          ...turn.debugInfo,
          stepExecutions: turn.debugInfo.stepExecutions?.map(step => ({ ...step, arguments: { query: "Find the order" }, observation: { status: "Found" } })),
        },
      } : turn),
    },
  };
}

it("shows the conversation and the activities side by side in the inline view and opens details in place", async () => {
  setViewWidth(740);
  const user = userEvent.setup();
  const scrolled = collectScrolledElements();
  mount({ ...detailedAnalysis(), inlineLayout: "full" });
  await user.click(screen.getByRole("tab", { name: "Conversation & activities" }));
  expect(activitiesTab()).toHaveAttribute("data-layout", "duo");
  expect(paneTitles()).toEqual(["Conversation", "Activities"]);
  expect(screen.queryByRole("button", { name: "Close details" })).toBeNull();
  const list = screen.getByRole("list", { name: "Turn 1 activities" });
  const activity = within(list).getAllByRole("button")[0];
  expect(activity).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByTestId("activity-detail-body")).toBeNull();
  await user.click(activity);
  expect(activity).toHaveAttribute("aria-expanded", "true");
  expect(within(activity.closest("li") as HTMLElement).getByTestId("activity-detail-body")).toHaveTextContent("Overview");
  await user.click(activity);
  expect(activity).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByTestId("activity-detail-body")).toBeNull();
  expect(scrolled).toEqual([]);
});

it("shows three columns at 1080 px or more with the first activity selected", async () => {
  setViewWidth(1320);
  const user = userEvent.setup();
  mount(detailedAnalysis(), undefined, fullscreenHost);
  await user.click(screen.getByRole("tab", { name: "Conversation & activities" }));
  expect(activitiesTab()).toHaveAttribute("data-layout", "tri");
  expect(paneTitles()).toHaveLength(3);
  expect(paneTitles().slice(0, 2)).toEqual(["Conversation preview", "Activities"]);
  const activity = within(screen.getByRole("list", { name: "Turn 1 activities" })).getAllByRole("button")[0];
  expect(activity).toHaveAttribute("aria-current", "true");
  expect(screen.getByRole("button", { name: "Close details" })).toBeInTheDocument();
  expect(screen.getByTestId("activity-detail-body")).toHaveTextContent("Overview");
});

it("switches between the conversation and the activities below 640 px", async () => {
  setViewWidth(600);
  const user = userEvent.setup();
  mount({ ...analysis(), inlineLayout: "full" });
  await user.click(screen.getByRole("tab", { name: "Conversation & activities" }));
  expect(activitiesTab()).toHaveAttribute("data-layout", "single");
  const panes = screen.getByRole("group", { name: "Pane" });
  expect(within(panes).getByRole("button", { name: "Conversation" })).toHaveAttribute("aria-pressed", "true");
  expect(paneTitles()).toEqual(["Conversation"]);
  await user.click(screen.getByRole("button", { name: /Help with second session/ }));
  expect(within(panes).getByRole("button", { name: "Activities" })).toHaveAttribute("aria-pressed", "true");
  expect(paneTitles()).toEqual(["Activities"]);
  expect(screen.getByRole("list", { name: "Turn 2 activities" })).toBeInTheDocument();
  await user.click(within(panes).getByRole("button", { name: "Conversation" }));
  expect(screen.getByRole("button", { name: "Turn 2" })).toHaveAttribute("aria-current", "true");
});

it("keeps the activities and the selected turn without an error banner when the host refuses turn details", async () => {
  setViewWidth(740);
  const user = userEvent.setup();
  const { call } = mount({ ...detailedAnalysis(), inlineLayout: "full" });
  call.mockImplementation(async request => {
    if (request.name === "get_debugger_turn_details") throw hostRefusal;
    throw new Error(`Unexpected ${request.name}`);
  });
  await user.click(screen.getByRole("tab", { name: "Conversation & activities" }));
  await user.click(screen.getByRole("button", { name: "Turn 2" }));
  await waitFor(() => expect(call).toHaveBeenCalledWith({
    name: "get_debugger_turn_details",
    arguments: { environmentId: environment.id, agentId: agent.id, conversationId: "first", turnId: "user-2" },
  }));
  await waitFor(() => expect(screen.queryByRole("progressbar")).toBeNull());
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByText(/MCP error -32000/)).toBeNull();
  expect(screen.getByRole("button", { name: "Turn 2" })).toHaveAttribute("aria-current", "true");
  const activity = within(screen.getByRole("list", { name: "Turn 2 activities" })).getAllByRole("button")[0];
  await user.click(activity);
  expect(within(activity.closest("li") as HTMLElement).getByRole("note"))
    .toHaveTextContent("Activity details are not available in this host.");
  expect(call).toHaveBeenCalledTimes(1);
});

/** The steps on the user turns, as the parsers attach them. Turn 1 has a failed tool call. */
function failedFlowAnalysis(): ReturnType<typeof analysis> {
  const data = analysis();
  const step = (stepId: string, displayName: string, at: string, extra: Record<string, unknown> = {}) => ({
    stepId, displayName, taskDialogId: `agent.action.${stepId}`, subtitle: "Tool", state: "Completed",
    triggeredAt: `2026-10-07T10:${at}.000Z`, finishedAt: `2026-10-07T10:${at}.900Z`, arguments: { request: displayName }, ...extra,
  });
  const steps: Record<string, ReturnType<typeof step>[]> = {
    "user-1": [
      step("lookup", "Lookup order", "00:00"),
      step("promo", "get_promo_prices", "00:01", { state: "Failed", errorMessage: "503 Service Unavailable" }),
    ],
    "user-2": [step("summary", "Send summary", "01:00")],
  };
  return {
    ...data,
    processedTranscript: {
      ...data.processedTranscript,
      turns: data.processedTranscript.turns.map(turn => ({ ...turn, debugInfo: steps[turn.id] ? { stepExecutions: steps[turn.id] } : undefined })),
    },
  };
}

const flowTab = () => screen.getByRole("tab", { name: /Execution flow/ });

/** The cards of the full screen Execution flow: conversation, flow and step details. */
function flowCards() {
  return Array.from(screen.getByTestId("flow-columns").firstElementChild?.children ?? []) as HTMLElement[];
}

function turnDetailsCall(turnId: string) {
  return { name: "get_debugger_turn_details", arguments: { environmentId: environment.id, agentId: agent.id, conversationId: "first", turnId } };
}

it("shows the conversation, the selectable flow and the step details in full screen from 1080 px", async () => {
  setViewWidth(1280);
  const user = userEvent.setup();
  const { call } = mount(failedFlowAnalysis(), undefined, fullscreenHost);
  await user.click(flowTab());
  expect(flowCards()).toHaveLength(3);
  const [conversation, flow, details] = flowCards();
  expect(within(conversation).getByRole("heading", { name: "Conversation" })).toBeInTheDocument();
  expect(within(conversation).getByRole("button", { name: "Turn 1" })).toHaveAttribute("aria-current", "true");
  expect(within(flow).getByLabelText("Execution flow summary")).toBeInTheDocument();
  expect(within(flow).getAllByRole("button", { name: "Raw JSON" })).toHaveLength(2);
  expect(within(flow).getAllByRole("button", { name: "Inspect" })).toHaveLength(2);
  const first = within(flow).getByRole("button", { name: /Lookup order/ });
  expect(first).toHaveAttribute("aria-current", "true");
  expect(within(details).getByRole("heading", { name: "Lookup order" })).toBeInTheDocument();

  const failed = within(flow).getByRole("button", { name: /get_promo_prices/ });
  await user.click(failed);
  expect(failed).toHaveAttribute("aria-current", "true");
  expect(first).not.toHaveAttribute("aria-current");
  expect(within(details).getByRole("heading", { name: "get_promo_prices" })).toBeInTheDocument();
  const body = within(details).getByTestId("activity-detail-body");
  expect(body).toHaveTextContent("Failed");
  expect(body).toHaveTextContent("503 Service Unavailable");
  expect(flowTab()).toHaveAttribute("aria-selected", "true");
  expect(call).not.toHaveBeenCalled();

  await user.click(within(details).getByRole("button", { name: "Close details" }));
  expect(within(details).getByText("Select an activity to inspect its details.")).toBeInTheDocument();
  expect(flow.querySelector('.w-rnode[aria-current="true"]')).toBeNull();
});

it("selects the turn of a step in another turn and loads its details in the details column", async () => {
  setViewWidth(1280);
  const user = userEvent.setup();
  const { call } = mount(failedFlowAnalysis(), undefined, fullscreenHost);
  let release: (result: ToolResult) => void = () => undefined;
  call.mockImplementation(request => request.name === "get_debugger_turn_details"
    ? new Promise<ToolResult>(resolve => { release = resolve; })
    : Promise.reject(new Error(`Unexpected ${request.name}`)));
  await user.click(flowTab());
  const [conversation, flow, details] = flowCards();
  await user.click(within(flow).getByRole("button", { name: /Send summary/ }));
  expect(call).toHaveBeenCalledWith(turnDetailsCall("user-2"));
  expect(document.querySelector('[data-turn-id="user-2"]')).toHaveAttribute("aria-current", "true");
  expect(within(conversation).getByRole("button", { name: "Turn 2" })).toHaveAttribute("aria-current", "true");
  expect(within(flow).getByRole("button", { name: /Send summary/ })).toHaveAttribute("aria-current", "true");
  expect(within(details).getByText("Loading step details...")).toBeInTheDocument();
  expect(within(details).getByRole("heading", { name: "Send summary" })).toBeInTheDocument();

  const enriched = failedFlowAnalysis().processedTranscript.turns[2];
  await act(async () => release({ content: [], structuredContent: { turn: { ...enriched, content: "Enriched second turn" } } }));
  await waitFor(() => expect(within(details).queryByText("Loading step details...")).toBeNull());
  expect(within(flow).getByRole("button", { name: /Send summary/ })).toHaveAttribute("aria-current", "true");
  expect(within(details).getByTestId("activity-detail-body")).toHaveTextContent("Completed");
  expect(flowTab()).toHaveAttribute("aria-selected", "true");
  expect(call).toHaveBeenCalledTimes(1);
});

it("selects a turn from the conversation column and opens its first step without a tab change", async () => {
  setViewWidth(1280);
  const user = userEvent.setup();
  const { call } = mount(failedFlowAnalysis(), undefined, fullscreenHost);
  await user.click(flowTab());
  const [conversation, flow, details] = flowCards();
  await user.click(within(conversation).getByRole("button", { name: /Help with second session/ }));
  await waitFor(() => expect(call).toHaveBeenCalledWith(turnDetailsCall("user-2")));
  expect(flowTab()).toHaveAttribute("aria-selected", "true");
  expect(document.querySelector('[data-turn-id="user-2"]')).toHaveAttribute("aria-current", "true");
  await waitFor(() => expect(within(details).queryByText("Loading step details...")).toBeNull());
  expect(within(flow).getByRole("button", { name: /Send summary/ })).toHaveAttribute("aria-current", "true");
  expect(within(details).getByRole("heading", { name: "Send summary" })).toBeInTheDocument();
});

it("shows refused step details as a note in the details column without an error banner", async () => {
  setViewWidth(1280);
  const user = userEvent.setup();
  const { call } = mount(failedFlowAnalysis(), undefined, fullscreenHost);
  call.mockImplementation(async request => {
    if (request.name === "get_debugger_turn_details") throw hostRefusal;
    throw new Error(`Unexpected ${request.name}`);
  });
  await user.click(flowTab());
  const [, flow, details] = flowCards();
  await user.click(within(flow).getByRole("button", { name: /Send summary/ }));
  await waitFor(() => expect(within(details).getByRole("note")).toHaveTextContent("Activity details are not available in this host."));
  expect(within(details).getByRole("heading", { name: "Send summary" })).toBeInTheDocument();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByText(/MCP error -32000/)).toBeNull();
  expect(call).toHaveBeenCalledTimes(1);
});

it("keeps one Execution flow card without selectable steps inline and in full screen below 1080 px", async () => {
  const user = userEvent.setup();
  const expectSingleCard = () => {
    expect(screen.queryByTestId("flow-columns")).toBeNull();
    expect(screen.queryByTestId("activity-detail-body")).toBeNull();
    const nodes = Array.from(document.querySelectorAll(".w-rnode"));
    expect(nodes).toHaveLength(3);
    for (const node of nodes) expect(node.tagName).toBe("DIV");
  };
  setViewWidth(1280);
  mount({ ...failedFlowAnalysis(), inlineLayout: "full" });
  await user.click(flowTab());
  expect(screen.getByLabelText("Execution flow summary")).toBeInTheDocument();
  expectSingleCard();
  cleanup();

  mount(failedFlowAnalysis());
  await user.click(flowTab());
  expect(screen.queryByTestId("flow-columns")).toBeNull();
  expect(screen.queryByRole("button", { name: /get_promo_prices/ })).toBeNull();
  cleanup();

  setViewWidth(1000);
  mount(failedFlowAnalysis(), undefined, fullscreenHost);
  await user.click(flowTab());
  expectSingleCard();
  act(() => setViewWidth(1280));
  expect(flowCards()).toHaveLength(3);
  act(() => setViewWidth(1000));
  expectSingleCard();
});

it("shows session start times in the viewer's local time and falls back to the saved text", async () => {
  const user = userEvent.setup();
  const start = "2026-10-07T10:00:00.000Z";
  const local = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(start));
  const sessions = [
    { n: 1, startText: "Server text", startTimeUtc: start, durationMs: 1000, turnCount: 1 },
    { n: 2, startText: "Second session", startTimeUtc: "not a date", durationMs: 1000, turnCount: 1 },
  ];
  mount({ ...analysis(), sessions }, undefined, fullscreenHost);
  await user.click(screen.getByRole("combobox", { name: "Session" }));
  expect(screen.getByRole("option", { name: /^Session 1/ })).toHaveTextContent(local);
  expect(screen.getByRole("option", { name: /^Session 1/ })).not.toHaveTextContent("Server text");
  expect(screen.getByRole("option", { name: /^Session 2/ })).toHaveTextContent("Second session");
});

const agentB = { id: "33333333-3333-3333-3333-333333333333", name: "Billing helper", experience: "generative", schemaName: "cr_billing" };
const otherEnvironment = { id: "44444444-4444-4444-4444-444444444444", name: "Other environment", url: "https://other.crm.dynamics.com" };
const listLoadText = /^Loading (agents|conversations|analysis)\.\.\.$/;
const pause = (ms: number) => act(() => new Promise<void>(resolve => { window.setTimeout(resolve, ms); }));
/** Spinners in the full-screen command area (the pickers and Analyze). */
const commandSpinners = () => document.querySelectorAll(".w-cmd .fui-Spinner");

/** The options of an open picker. A closed picker has no aria-controls. */
function openOptions(name: string) {
  const id = screen.getByRole("combobox", { name }).getAttribute("aria-controls");
  const listbox = id ? document.getElementById(id) : null;
  if (!listbox) throw new Error(`The ${name} picker is not open.`);
  return within(listbox).queryAllByRole("option");
}

it("opens the loaded Agent and Conversation lists at once without a server call", async () => {
  const user = userEvent.setup();
  const { call } = mount({ ...listOnly, agents: [agent, agentB] }, undefined, fullscreenHost);
  await user.click(screen.getByRole("combobox", { name: "Agent" }));
  expect(openOptions("Agent")).toHaveLength(2);
  expect(openOptions("Agent").filter(option => option.textContent?.includes("Loading"))).toHaveLength(0);
  await pause(350);
  expect(openOptions("Agent")).toHaveLength(2);
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("combobox", { name: "Conversation" }));
  expect(openOptions("Conversation")).toHaveLength(2);
  expect(openOptions("Conversation").filter(option => option.textContent?.includes("Loading"))).toHaveLength(0);
  await pause(350);
  expect(openOptions("Conversation")).toHaveLength(2);
  expect(call).not.toHaveBeenCalled();
});

it("filters the loaded agents locally without a server call, and searches the server for a typed conversation query", async () => {
  const user = userEvent.setup();
  const { call } = mount({ ...listOnly, agents: [agent, agentB] }, undefined, fullscreenHost);
  call.mockImplementation(async request => {
    if (request.name !== "list_debugger_conversations") throw new Error(`Unexpected ${request.name}`);
    return { content: [], structuredContent: { conversations: [{ id: "older-second", name: "older-second" }] } };
  });
  await user.click(screen.getByRole("combobox", { name: "Agent" }));
  await user.keyboard("billing");
  expect(openOptions("Agent")).toHaveLength(1);
  expect(screen.getByRole("option", { name: /^Billing helper/ })).toBeInTheDocument();
  await pause(350);
  expect(openOptions("Agent")).toHaveLength(1);
  expect(call).not.toHaveBeenCalled();
  await user.keyboard("{Escape}");
  // The short loaded list can be incomplete, so the query goes to the server.
  await user.click(screen.getByRole("combobox", { name: "Conversation" }));
  await user.keyboard("sec");
  await waitFor(() => expect(call).toHaveBeenCalledTimes(1));
  expect(call).toHaveBeenCalledWith({
    name: "list_debugger_conversations",
    arguments: { environmentId: environment.id, agentId: agent.id, query: "sec", limit: 50 },
  });
  expect(await screen.findByRole("option", { name: /^older-second/ })).toBeInTheDocument();
  expect(openOptions("Conversation")).toHaveLength(1);
});

const savedConversations = Array.from({ length: 50 }, (_, index) => {
  const id = `saved-${String(index).padStart(2, "0")}`;
  return { id, name: id };
});

// The server reads at most 250 transcript rows and removes duplicate names, so also a short list can be incomplete.
it.each([
  { size: "short", loaded: conversations },
  { size: "full", loaded: savedConversations },
])("searches the server for a typed query with a $size loaded conversation list, and restores that list without a call", async ({ loaded }) => {
  const user = userEvent.setup();
  const { call } = mount({ ...listOnly, conversations: loaded }, undefined, fullscreenHost);
  call.mockImplementation(async request => {
    if (request.name !== "list_debugger_conversations") throw new Error(`Unexpected ${request.name}`);
    return { content: [], structuredContent: { conversations: [{ id: "older-match", name: "older-match" }] } };
  });
  await user.click(screen.getByRole("combobox", { name: "Conversation" }));
  expect(openOptions("Conversation")).toHaveLength(loaded.length);
  await user.keyboard("older");
  expect(call).not.toHaveBeenCalled();
  await waitFor(() => expect(call).toHaveBeenCalledTimes(1));
  expect(call).toHaveBeenCalledWith({
    name: "list_debugger_conversations",
    arguments: { environmentId: environment.id, agentId: agent.id, query: "older", limit: 50 },
  });
  expect(await screen.findByRole("option", { name: /^older-match/ })).toBeInTheDocument();
  expect(openOptions("Conversation")).toHaveLength(1);
  await user.keyboard("{Backspace>5/}");
  await waitFor(() => expect(openOptions("Conversation")).toHaveLength(loaded.length));
  expect(screen.queryByRole("option", { name: /^older-match/ })).toBeNull();
  await pause(350);
  expect(call).toHaveBeenCalledTimes(1);
});

it("keeps each loaded conversation list for the life of the view", async () => {
  const user = userEvent.setup();
  const { call } = mount({ ...listOnly, agents: [agent, agentB] }, undefined, fullscreenHost);
  call.mockImplementation(async request => {
    if (request.name !== "list_debugger_conversations") throw new Error(`Unexpected ${request.name}`);
    return { content: [], structuredContent: { conversations: [{ id: "b-1", name: "b-1" }] } };
  });
  const chooseAgent = async (name: RegExp) => {
    await user.click(screen.getByRole("combobox", { name: "Agent" }));
    await user.click(screen.getByRole("option", { name }));
  };
  const conversationPicker = () => screen.getByRole("combobox", { name: "Conversation" });

  await chooseAgent(/^Billing helper/);
  await waitFor(() => expect(call).toHaveBeenCalledTimes(1));
  expect(call).toHaveBeenCalledWith({
    name: "list_debugger_conversations", arguments: { environmentId: environment.id, agentId: agentB.id, limit: 50 },
  });
  await waitFor(() => expect(conversationPicker()).toHaveAttribute("placeholder", "Search conversation..."));
  await user.click(conversationPicker());
  expect(openOptions("Conversation")).toHaveLength(1);
  expect(screen.getByRole("option", { name: /^b-1/ })).toBeInTheDocument();
  await user.keyboard("{Escape}");

  await chooseAgent(/^Agent/);
  expect(commandSpinners()).toHaveLength(0);
  expect(conversationPicker()).toHaveAttribute("placeholder", "Search conversation...");
  await user.click(conversationPicker());
  expect(openOptions("Conversation")).toHaveLength(2);
  expect(screen.getByRole("option", { name: /^second/ })).toBeInTheDocument();
  await user.keyboard("{Escape}");

  await chooseAgent(/^Billing helper/);
  expect(commandSpinners()).toHaveLength(0);
  await user.click(conversationPicker());
  expect(openOptions("Conversation")).toHaveLength(1);
  expect(screen.getByRole("option", { name: /^b-1/ })).toBeInTheDocument();
  expect(call).toHaveBeenCalledTimes(1);
});

it("shows each list load only in its own picker, with no status row below the pickers", async () => {
  const user = userEvent.setup();
  const { call } = mount({ ...listOnly, targetResolved: false, environments: [environment, otherEnvironment] }, undefined, fullscreenHost);
  let finishAgents!: (value: ToolResult) => void;
  let finishConversations!: (value: ToolResult) => void;
  call.mockImplementation(request => new Promise<ToolResult>((resolve, reject) => {
    if (request.name === "list_debugger_agents") finishAgents = resolve;
    else if (request.name === "list_debugger_conversations") finishConversations = resolve;
    else reject(new Error(`Unexpected ${request.name}`));
  }));
  const agentPicker = () => screen.getByRole("combobox", { name: "Agent" });
  const conversationPicker = () => screen.getByRole("combobox", { name: "Conversation" });

  await user.click(screen.getByRole("combobox", { name: "Environment" }));
  await user.click(screen.getByRole("option", { name: /^Other environment/ }));
  expect(call).toHaveBeenCalledWith({ name: "list_debugger_agents", arguments: { environmentId: otherEnvironment.id } });
  expect(agentPicker()).toHaveAttribute("placeholder", "Loading agents...");
  expect(screen.queryByText(listLoadText)).toBeNull();
  expect(commandSpinners()).toHaveLength(0);

  await user.click(agentPicker());
  const loadingOptions = openOptions("Agent");
  expect(loadingOptions).toHaveLength(1);
  expect(loadingOptions[0]).toHaveAccessibleName(/Loading agents\.\.\./);
  expect(document.querySelectorAll(".fui-Spinner")).toHaveLength(1);
  expect(call).toHaveBeenCalledTimes(1);

  await act(async () => { finishAgents({ content: [], structuredContent: { agents: [agentB] } }); });
  await user.click(await screen.findByRole("option", { name: /^Billing helper/ }));
  expect(call).toHaveBeenCalledTimes(2);
  expect(call).toHaveBeenLastCalledWith({
    name: "list_debugger_conversations", arguments: { environmentId: otherEnvironment.id, agentId: agentB.id, limit: 50 },
  });
  expect(conversationPicker()).toHaveAttribute("placeholder", "Loading conversations...");
  expect(screen.queryByText(listLoadText)).toBeNull();
  expect(commandSpinners()).toHaveLength(0);

  await act(async () => { finishConversations({ content: [], structuredContent: { conversations: [{ id: "b-1", name: "b-1" }] } }); });
  expect(conversationPicker()).toHaveAttribute("placeholder", "Search conversation...");
  expect(agentPicker()).toHaveAttribute("placeholder", "Search agent...");
  expect(agentPicker()).toHaveValue("Billing helper");
  expect(call).toHaveBeenCalledTimes(2);
});

it("shows a running analysis in the Analyze button and in a polite status, not in a status row", async () => {
  const user = userEvent.setup();
  const { call } = mount(listOnly, undefined, fullscreenHost);
  let finish!: (value: ToolResult) => void;
  const pending = new Promise<ToolResult>(resolve => { finish = resolve; });
  call.mockImplementation(async request => {
    if (request.name === "analyze_debugger_conversation") return pending;
    throw new Error(`Unexpected ${request.name}`);
  });
  const analyzeButton = () => screen.getByRole("button", { name: "Analyze" });
  await user.click(screen.getByRole("combobox", { name: "Conversation" }));
  await user.click(screen.getByRole("option", { name: /^second/ }));
  expect(analyzeButton().querySelector("svg")).not.toBeNull();
  await user.click(analyzeButton());

  expect(call).toHaveBeenCalledWith({
    name: "analyze_debugger_conversation", arguments: { environmentId: environment.id, agentId: agent.id, conversationId: "second" },
  });
  expect(analyzeButton()).toHaveAttribute("aria-busy", "true");
  expect(analyzeButton()).toBeDisabled();
  expect(analyzeButton()).toHaveTextContent(/^Analyze$/);
  expect(analyzeButton().querySelector(".fui-Spinner")).not.toBeNull();
  expect(analyzeButton().querySelector("svg")).toBeNull();
  const status = screen.getByText("Analyzing conversation...");
  expect(status).toHaveAttribute("role", "status");
  expect(status).toHaveAttribute("aria-live", "polite");
  expect(commandSpinners()).toHaveLength(1);
  expect(screen.queryByText(listLoadText)).toBeNull();

  await act(async () => { finish({ content: [], structuredContent: analysis("second", "New analysis") }); await pending; });
  expect(screen.getByText(/^Conversation shown: second\./)).toBeInTheDocument();
  expect(analyzeButton().querySelector("svg")).not.toBeNull();
  expect(analyzeButton().querySelector(".fui-Spinner")).toBeNull();
  expect(analyzeButton()).toBeEnabled();
  expect(analyzeButton()).not.toHaveAttribute("aria-busy");
  expect(screen.queryByText("Analyzing conversation...")).toBeNull();
  expect(commandSpinners()).toHaveLength(0);
});

it("loads a missing agent list once when the Agent picker opens", async () => {
  const user = userEvent.setup();
  const { call } = mount({
    state: "conversations", targetResolved: true, environment, environmentId: environment.id,
    agent, agentId: agent.id, conversations,
    dataLoadError: { source: "initial-data" }, error: { code: "FIXTURE", message: "The supplemental read failed." },
  }, undefined, fullscreenHost);
  await user.click(screen.getByRole("combobox", { name: "Agent" }));
  expect(call).toHaveBeenCalledTimes(1);
  expect(call).toHaveBeenCalledWith({ name: "list_debugger_agents", arguments: { environmentId: environment.id, query: "" } });
  await waitFor(() => expect(openOptions("Agent")).toHaveLength(1));
  expect(screen.getByRole("option", { name: /^Agent/ })).toBeInTheDocument();
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("combobox", { name: "Agent" }));
  expect(openOptions("Agent")).toHaveLength(1);
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("combobox", { name: "Conversation" }));
  expect(openOptions("Conversation")).toHaveLength(2);
  await pause(350);
  expect(call).toHaveBeenCalledTimes(1);
});

it("loads the full conversation list once when the opener gave only the selected conversation", async () => {
  const user = userEvent.setup();
  const { call } = mount({ ...analysis(), conversationId: "first", conversations: [conversations[0]], targetResolved: true }, undefined, fullscreenHost);
  await user.click(screen.getByRole("combobox", { name: "Conversation" }));
  expect(call).toHaveBeenCalledTimes(1);
  expect(call).toHaveBeenCalledWith({
    name: "list_debugger_conversations", arguments: { environmentId: environment.id, agentId: agent.id, query: "", limit: 50 },
  });
  await waitFor(() => expect(openOptions("Conversation")).toHaveLength(2));
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("combobox", { name: "Conversation" }));
  expect(openOptions("Conversation")).toHaveLength(2);
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("combobox", { name: "Agent" }));
  expect(openOptions("Agent")).toHaveLength(1);
  await pause(350);
  expect(call).toHaveBeenCalledTimes(1);
});

it.each([
  {
    title: "Loading saved conversations",
    data: { state: "conversations", restoring: true, deferred: ["agents", "conversations"] },
  },
  {
    title: "Loading saved analysis",
    data: {
      state: "analysis", conversationId: "first", conversation: conversations[0], conversations,
      restoring: true, deferred: ["agents", "analysis"],
    },
  },
])("shows one spinner in the full-screen empty state while it is $title", ({ title, data }) => {
  const { call } = mount({
    targetResolved: true, environment, environmentId: environment.id, agent, agentId: agent.id, ...data,
  }, undefined, fullscreenHost);
  expect(screen.getByText(title)).toBeInTheDocument();
  expect(document.querySelectorAll(".fui-Spinner")).toHaveLength(1);
  expect(screen.getByRole("progressbar", { name: `${title}...` })).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Agent" })).toHaveAttribute("placeholder", "Search agent...");
  expect(screen.getByRole("combobox", { name: "Conversation" })).toHaveAttribute("placeholder", "Search conversation...");
  expect(screen.queryByText(listLoadText)).toBeNull();
  expect(call).not.toHaveBeenCalled();
});
