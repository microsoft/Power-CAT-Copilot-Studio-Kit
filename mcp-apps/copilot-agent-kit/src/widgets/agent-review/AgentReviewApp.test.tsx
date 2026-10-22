import "@testing-library/jest-dom/vitest";
import { randomBytes } from "node:crypto";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { App } from "@modelcontextprotocol/ext-apps";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { CopilotReviewDisplayPayload } from "../../agent-review/core/index";
import { buildReviewViewModel } from "../../agent-review/ui/index";
import { buildDeterministicAgentMap } from "../../agent-map/builder.js";
import { boundedToolResult } from "../../tools/initialWidgetPayload.js";
import fixture from "../../agent-review/ui/fixtures/persisted-review.json";
import { McpAppProvider } from "../shared/McpAppProvider";
import { createInitialToolDataRecovery } from "../shared/initial-tool-data";
import { readInitialResult } from "../shared/read-initial-result";
import type { McpBootstrapSnapshot } from "../shared/bootstrap-contract";
import { AgentReviewApp } from "./AgentReviewApp";

type ToolResult = Awaited<ReturnType<App["callServerTool"]>>;
type Request = Parameters<App["callServerTool"]>[0];
const environment = { id: "11111111-1111-4111-8111-111111111111", name: "Environment", region: "United States" };
const agent = {
  id: "22222222-2222-4222-8222-abcdefabcdef",
  name: "Zava Visual Merchandizer",
  componentIdUnique: "33333333-3333-4333-8333-333333333333",
};
const jobId = "44444444-4444-4444-8444-444444444444";
const reviewId = "55555555-5555-4555-8555-555555555555";
const context = {
  state: "selecting", selectionId: "create-test", environmentId: environment.id,
  environment, environments: [environment], agentId: agent.id, agent, agents: [agent],
};
const status = {
  jobId, agentName: agent.name, startedAt: "2026-10-08T03:00:00.000Z",
  status: "succeeded", completedComponents: 2, totalComponents: 2,
  lastCompletedStatus: null, nextPollMs: null, canFinalize: true, error: null,
};

afterEach(() => {
  cleanup();
  delete window.__agentReviewMcpBootstrap;
  window.sessionStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function result(structuredContent: Record<string, unknown>): ToolResult {
  return { content: [], structuredContent };
}

function deferred() {
  let resolve!: (value: ToolResult) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<ToolResult>((finish, fail) => { resolve = finish; reject = fail; });
  return { promise, resolve, reject };
}

function mount(data: unknown = context, handler?: (request: Request) => Promise<ToolResult>, displayMode: "inline" | "fullscreen" = "inline", toolInput?: Record<string, unknown>, availableDisplayModes?: Array<"inline" | "fullscreen">) {
  const app = new App({ name: "Review Create test", version: "1.0.0" });
  const listeners = new Set<() => void>();
  let snapshot: McpBootstrapSnapshot = {
    app, data, toolInput, host: { theme: "light", displayMode, availableDisplayModes, containerDimensions: { width: 840, height: 900 } },
  };
  const replaceData = (next: unknown) => {
    snapshot = { ...snapshot, data: next };
    listeners.forEach(listener => listener());
  };
  // A host changes its context, for example the display mode, after it accepts a display request.
  const setHost = (host: Partial<NonNullable<McpBootstrapSnapshot["host"]>>) => {
    snapshot = { ...snapshot, host: { ...snapshot.host, ...host } };
    listeners.forEach(listener => listener());
  };
  window.__agentReviewMcpBootstrap = {
    getSnapshot: () => snapshot, replaceData,
    readInitialResult: result => readInitialResult(app, result, "open_agent_review"),
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
  const call = vi.spyOn(app, "callServerTool").mockImplementation(handler ?? (async request => {
    if (request.name === "start_agent_review") return result({ state: "running", jobId, agentName: agent.name });
    if (request.name === "get_agent_review_status") return result({ state: "status", status });
    if (request.name === "finalize_agent_review") return result({ state: "summary", reviewId });
    if (request.name === "get_agent_review_result") return result({
      state: "summary", reviewId,
      model: buildReviewViewModel(fixture.agentsExperience as CopilotReviewDisplayPayload, "You", 42_000, agent.name),
    });
    throw new Error(`Unexpected fixture call: ${request.name}`);
  }));
  const rendered = render(<FluentProvider theme={webLightTheme}><McpAppProvider><AgentReviewApp /></McpAppProvider></FluentProvider>);
  return { app, call, replaceData, setHost, getData: () => snapshot.data, unmount: rendered.unmount };
}

it("requires explicit Create and sends only the registered start arguments", async () => {
  const user = userEvent.setup();
  const { call } = mount();
  expect(call).not.toHaveBeenCalled();
  const projectName = (screen.getByRole("textbox", { name: /Project name/ }) as HTMLInputElement).value;
  await user.click(screen.getByRole("button", { name: "Create" }));
  expect(call).toHaveBeenCalledTimes(1);
  expect(call.mock.calls[0][0]).toStrictEqual({
    name: "start_agent_review",
    arguments: {
      environmentId: environment.id, agentId: agent.id,
      componentIdUnique: agent.componentIdUnique, confirmed: true, projectName,
    },
  });
  expect(screen.getByRole("progressbar", { name: /Reviewing/ })).toBeInTheDocument();
});

it("makes an acknowledged manual target usable while the supplemental picker is loading", () => {
  const { call } = mount({ ...context, agents: undefined, deferred: ["agents"], restoring: true });
  expect(screen.getByRole("combobox", { name: "Choose Environment" })).toHaveValue(environment.name);
  expect(screen.getByRole("combobox", { name: "Choose agent" })).toHaveValue(agent.name);
  expect(screen.getByRole("button", { name: "Create" })).toBeEnabled();
  expect(call).not.toHaveBeenCalled();
});

it("keeps the acknowledged job and its next poll after a late same-target picker reply", async () => {
  vi.useFakeTimers();
  const mounted = mount(context, async request => {
    if (request.name === "start_agent_review") return result({ state: "running", jobId });
    if (request.name === "get_agent_review_status") return result({
      state: "status", status: { ...status, status: "running", canFinalize: false, nextPollMs: 5000 },
    });
    throw new Error(`Unexpected startup fixture call: ${request.name}`);
  });
  await act(async () => { screen.getByRole("button", { name: "Create" }).click(); });
  act(() => mounted.replaceData({ ...context, agents: [{ ...agent, iconBase64: "complete-icon" }] }));
  expect(screen.queryByRole("button", { name: "Create" })).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(mounted.call.mock.calls.map(([request]) => request.name)).toEqual([
    "start_agent_review", "get_agent_review_status",
  ]);
  expect(mounted.call.mock.calls[1][0]).toEqual({ name: "get_agent_review_status", arguments: { jobId } });
});

it("accepts one pending Create reply after the same selected target finishes loading", async () => {
  vi.useFakeTimers();
  const start = deferred();
  const mounted = mount({ ...context, agents: undefined, deferred: ["agents"], restoring: true }, async request => {
    if (request.name === "start_agent_review") return start.promise;
    if (request.name === "get_agent_review_status") return result({
      state: "status", status: { ...status, status: "running", canFinalize: false, nextPollMs: 5000 },
    });
    throw new Error(`Unexpected pending-start fixture call: ${request.name}`);
  });
  await act(async () => {
    const create = screen.getByRole("button", { name: "Create" });
    create.click();
    create.click();
  });
  expect(screen.getByRole("progressbar", { name: /Reviewing/ })).toBeInTheDocument();
  act(() => mounted.replaceData(context));
  await act(async () => { start.resolve(result({ state: "running", jobId })); await start.promise; });
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(mounted.call.mock.calls.map(([request]) => request.name)).toEqual([
    "start_agent_review", "get_agent_review_status",
  ]);
});

it("does not schedule another status read when late picker data arrives during the saved-result read", async () => {
  vi.useFakeTimers();
  const saved = deferred();
  const mounted = mount(context, async request => {
    if (request.name === "start_agent_review") return result({ state: "running", jobId });
    if (request.name === "get_agent_review_status") return result({ state: "status", status });
    if (request.name === "finalize_agent_review") return result({ state: "summary", reviewId });
    if (request.name === "get_agent_review_result") return saved.promise;
    throw new Error(`Unexpected saved-result fixture call: ${request.name}`);
  });
  await act(async () => { screen.getByRole("button", { name: "Create" }).click(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  act(() => mounted.replaceData({ ...context, state: "running", jobId }));
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(mounted.call.mock.calls.map(([request]) => request.name)).toEqual([
    "start_agent_review", "get_agent_review_status", "finalize_agent_review", "get_agent_review_result",
  ]);
  await act(async () => {
    saved.resolve(result({ state: "summary", reviewId,
      model: buildReviewViewModel(fixture.agentsExperience as CopilotReviewDisplayPayload, "You", 42_000, agent.name) }));
    await saved.promise;
  });
  expect(screen.getByRole("tablist", { name: "Review views" })).toBeInTheDocument();
});

it("does not hide an acknowledged job when the host clears its initial data", async () => {
  vi.useFakeTimers();
  const mounted = mount(context, async request => {
    if (request.name === "start_agent_review") return result({ state: "running", jobId });
    if (request.name === "get_agent_review_status") return result({
      state: "status", status: { ...status, status: "running", canFinalize: false, nextPollMs: 5000 },
    });
    throw new Error(`Unexpected startup fixture call: ${request.name}`);
  });
  await act(async () => { screen.getByRole("button", { name: "Create" }).click(); });
  act(() => mounted.replaceData(null));
  expect(screen.getByRole("progressbar", { name: /Reviewing/ })).toBeInTheDocument();
  expect(screen.queryByText(/Restoring Agent Review/)).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(mounted.call.mock.calls.map(([request]) => request.name)).toEqual([
    "start_agent_review", "get_agent_review_status",
  ]);
});

it("clears old polling only when a different target and selection are delivered", async () => {
  vi.useFakeTimers();
  const mounted = mount();
  await act(async () => { screen.getByRole("button", { name: "Create" }).click(); });
  const other = { ...agent, id: "66666666-6666-4666-8666-666666666666", name: "Another selected agent" };
  act(() => mounted.replaceData({ ...context, selectionId: "another-selection", agent: other, agentId: other.id, agents: [other] }));
  expect(screen.getByRole("button", { name: "Create" })).toBeEnabled();
  expect(screen.getByRole("combobox", { name: "Choose agent" })).toHaveValue(other.name);
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(mounted.call.mock.calls.map(([request]) => request.name)).toEqual(["start_agent_review"]);
});

it("bounds missing host data and offers only an explicit read-only reload", async () => {
  vi.useFakeTimers();
  const input = { environmentName: environment.name, agentName: agent.name, startReview: false };
  const mounted = mount(null, async request => {
    expect(request).toEqual({ name: "open_agent_review", arguments: { ...input, resumeOnly: true } });
    return result(context);
  }, "inline", input);
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
  expect(screen.getByRole("alert")).toHaveTextContent("The host has not delivered Agent Review data.");
  expect(mounted.call).not.toHaveBeenCalled();
  await act(async () => { screen.getByRole("button", { name: "Reload Review data" }).click(); });
  expect(screen.getByRole("button", { name: "Create" })).toBeEnabled();
  expect(mounted.call).toHaveBeenCalledTimes(1);
});

it("keeps the target and exact MCP callback error without a retry or a Review start", () => {
  const message = "Initial widget data deferred agents failed (list_reviewable_agents): MCP error -32000: MCP integration is unavailable for this agent.";
  const { call } = mount({ ...context, state: "error", agents: undefined, restoring: true,
    dataLoadError: { source: "initial-data", toolName: "list_reviewable_agents", stage: "deferred agents" }, error: { message } });
  expect(screen.getByRole("combobox", { name: "Choose Environment" })).toHaveValue(environment.name);
  expect(screen.getByRole("combobox", { name: "Choose agent" })).toHaveValue(agent.name);
  expect(screen.getByRole("alert")).toHaveTextContent(message);
  expect(screen.getByRole("button", { name: "Reload Review data" })).toBeInTheDocument();
  expect(screen.queryByRole("progressbar", { name: /Reviewing/ })).toBeNull();
  expect(call).not.toHaveBeenCalled();
});

it("does not let supplemental startup data replace a manually selected environment", async () => {
  const user = userEvent.setup();
  const other = { ...environment, id: "77777777-7777-4777-8777-777777777777", name: "Another environment" };
  const mounted = mount({ ...context, environments: [environment, other], agents: undefined, restoring: true, deferred: ["agents"] });
  const picker = deferred();
  mounted.call.mockImplementation(async request => request.arguments?.environmentId === environment.id
    ? picker.promise : result({ state: "agents", agents: [agent] }));
  const recovery = createInitialToolDataRecovery({
    name: "open_agent_review", getData: mounted.getData, replaceData: mounted.replaceData,
    callTool: request => mounted.app.callServerTool(request), reportError: error => { throw error; },
  });
  const pending = recovery.ready();
  await user.click(screen.getByRole("combobox", { name: "Choose Environment" }));
  await user.click(screen.getByRole("option", { name: other.name }));
  await act(async () => { picker.resolve(result({ state: "agents", agents: [agent] })); await pending; });
  expect(screen.getByRole("combobox", { name: "Choose Environment" })).toHaveValue(other.name);
  expect(screen.getByRole("combobox", { name: "Choose agent" })).toHaveValue("");
  expect(mounted.call.mock.calls.map(([request]) => request.name)).toEqual(["list_reviewable_agents", "list_reviewable_agents"]);
});

it.each([
  ["missing", []],
  ["stale", [{ ...agent, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Other agent" }]],
  ["incomplete", [{ ...agent, componentIdUnique: "" }]],
])("blocks a %s selected record with an explicit message instead of a silent Create", async (_name, agents) => {
  const user = userEvent.setup();
  const { call } = mount({ ...context, agents });
  expect(screen.getByRole("combobox", { name: "Choose agent" })).toHaveValue(agent.name);
  expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  expect(screen.getByText("The selected agent is unavailable. Choose an agent from the list.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Create" }));
  expect(call).not.toHaveBeenCalled();
});

it("accepts a resolved GUID regardless of letter case", async () => {
  const user = userEvent.setup();
  const { call } = mount({ ...context, agentId: agent.id.toUpperCase() });
  await user.click(screen.getByRole("button", { name: "Create" }));
  expect(call).toHaveBeenCalledWith({
    name: "start_agent_review",
    arguments: expect.objectContaining({ agentId: agent.id, componentIdUnique: agent.componentIdUnique }),
  });
});

it("enables Create only after the late selected record arrives", () => {
  const { call, replaceData } = mount({ ...context, agents: [] });
  expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  act(() => replaceData(context));
  expect(screen.getByRole("button", { name: "Create" })).toBeEnabled();
  expect(screen.queryByText("The selected agent is unavailable. Choose an agent from the list.")).toBeNull();
  expect(call).not.toHaveBeenCalled();
});

it("shows submission progress immediately and prevents same-turn duplicate starts", async () => {
  const pending = deferred();
  const { call } = mount(context, async () => pending.promise);
  const create = screen.getByRole("button", { name: "Create" });
  act(() => { create.click(); create.click(); });
  expect(screen.getByRole("progressbar", { name: /Reviewing/ })).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent(/Preparing|Initializing/);
  expect(call).toHaveBeenCalledTimes(1);
  await act(async () => { pending.resolve(result({ state: "running", jobId })); await pending.promise; });
});

it.each(["resolved", "rejected", "partial-error"] as const)(
  "keeps a newer saved Review after an older manual start is %s", async outcome => {
    const pending = deferred();
    const { call, replaceData } = mount(context, async () => pending.promise);
    act(() => screen.getByRole("button", { name: "Create" }).click());
    const newerModel = navigationModel();
    newerModel.summary.agentName = "New selected saved agent";
    act(() => replaceData({
      ...context, state: "summary", reviewId: "66666666-6666-4666-8666-666666666666", model: newerModel,
    }));
    await act(async () => {
      if (outcome === "resolved") pending.resolve(result({ state: "running", jobId }));
      else if (outcome === "partial-error") pending.resolve({
        isError: true, content: [], structuredContent: {
          state: "failed", jobId, error: { message: "The obsolete start returned a partial job error." },
        },
      });
      else pending.reject(new Error("The obsolete start failed."));
      await pending.promise.catch(() => undefined);
    });
    expect(screen.getAllByText("New selected saved agent", { exact: true }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/The obsolete start/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(call).toHaveBeenCalledTimes(1);
  },
);

it("shows a text-only MCP error and never polls an empty job ID", async () => {
  const user = userEvent.setup();
  const { call } = mount(context, async () => ({
    isError: true, content: [{ type: "text", text: "Strict host rejected the start request." }],
  }));
  await user.click(screen.getByRole("button", { name: "Create" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Strict host rejected the start request.");
  expect(call).toHaveBeenCalledTimes(1);
});

it("keeps a created job after a failed manual start and checks that job instead of creating another", async () => {
  vi.useFakeTimers();
  const { call } = mount(context, async request => {
    if (request.name === "start_agent_review") return {
      isError: true, content: [], structuredContent: {
        state: "failed", jobId, error: { message: "The job was created, but the input upload failed." },
      },
    };
    if (request.name === "get_agent_review_status") return result({
      state: "status", status: { ...status, status: "queued", canFinalize: false, nextPollMs: 5_000 },
    });
    throw new Error(`Unexpected fixture call: ${request.name}`);
  });
  await act(async () => { screen.getByRole("button", { name: "Create" }).click(); });
  expect(screen.getByRole("alert")).toHaveTextContent("The job was created");
  await act(async () => { screen.getByRole("button", { name: "Check existing job" }).click(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(call.mock.calls.map(([request]) => request.name)).toEqual([
    "start_agent_review", "get_agent_review_status",
  ]);
  expect(call.mock.calls[1][0]).toEqual({ name: "get_agent_review_status", arguments: { jobId } });
});

it("opens a partial prompt-start error without a Create form and keeps the job on close", () => {
  const { call } = mount({
    ...context, state: "failed", jobId,
    error: { message: "The job was created, but the queue update failed." },
  });
  expect(screen.getByRole("button", { name: "Check existing job" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Create" })).toBeNull();
  act(() => screen.getByRole("button", { name: "Close review error" }).click());
  expect(screen.getByRole("button", { name: "Resume progress" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Create" })).toBeNull();
  expect(call).not.toHaveBeenCalled();
});

it("recovers a delayed partial prompt-start error without another Create", () => {
  const { call, replaceData } = mount(context);
  act(() => replaceData({
    ...context, state: "failed", jobId,
    error: { message: "The job was created, but the input upload failed." },
  }));
  expect(screen.getByRole("button", { name: "Check existing job" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Create" })).toBeNull();
  expect(call).not.toHaveBeenCalled();
});

it("reports a missing start job ID instead of entering an invalid polling loop", async () => {
  const user = userEvent.setup();
  const { call } = mount(context, async () => result({ state: "running" }));
  await user.click(screen.getByRole("button", { name: "Create" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("The review did not return a job ID.");
  expect(call).toHaveBeenCalledTimes(1);
});

it("shows an initial running result without an acknowledged job ID as an error, not progress", () => {
  const { call } = mount({ ...context, state: "running" });
  expect(screen.getByRole("alert")).toHaveTextContent("The review result did not include an acknowledged job ID.");
  expect(screen.queryByRole("progressbar", { name: /^Reviewing/ })).toBeNull();
  expect(call).not.toHaveBeenCalled();
});

it("shows a denied SDK call as an explicit error", async () => {
  const user = userEvent.setup();
  mount(context, async () => { throw new Error("The host denied the start tool."); });
  await user.click(screen.getByRole("button", { name: "Create" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("The host denied the start tool.");
});

it("keeps polling, finalization, saved inline results, and background resume bound to one job", async () => {
  vi.useFakeTimers();
  const { call } = mount();
  await act(async () => { screen.getByRole("button", { name: "Create" }).click(); });
  expect(screen.getByRole("progressbar", { name: /Reviewing/ })).toBeInTheDocument();
  act(() => screen.getByRole("button", { name: "Continue in background" }).click());
  expect(screen.getByText(new RegExp(jobId))).toBeInTheDocument();
  act(() => screen.getByRole("button", { name: "Resume progress" }).click());
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(call.mock.calls.map(([request]) => request.name)).toEqual([
    "start_agent_review", "get_agent_review_status", "finalize_agent_review", "get_agent_review_result",
  ]);
  expect(call).toHaveBeenCalledWith({ name: "get_agent_review_status", arguments: { jobId } });
  expect(call).toHaveBeenCalledWith({ name: "finalize_agent_review", arguments: { jobId } });
  expect(screen.getByRole("tab", { name: /Agent map/ })).toBeInTheDocument();
  expect(screen.queryByLabelText("Review summary")).toBeNull();
});

it("resumes a delayed running context without another start", async () => {
  vi.useFakeTimers();
  const { call, replaceData } = mount();
  act(() => replaceData({ state: "running", selectionId: "resumed", status: { ...status, nextPollMs: 0 } }));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(call.mock.calls.map(([request]) => request.name)).toEqual([
    "get_agent_review_status", "finalize_agent_review", "get_agent_review_result",
  ]);
  expect(screen.getByRole("tab", { name: /Agent map/ })).toBeInTheDocument();
  expect(screen.queryByLabelText("Review summary")).toBeNull();
});

it("accepts late acknowledged progress after the read-only recovery callback fails", async () => {
  vi.useFakeTimers();
  const mounted = mount(null, async request => {
    expect(request).toEqual({ name: "open_agent_review", arguments: { agentName: agent.name, resumeOnly: true } });
    throw new Error("forward-proxy-failed:tools/call");
  });
  const recovery = createInitialToolDataRecovery({
    name: "open_agent_review", callTool: request => mounted.app.callServerTool(request),
    getData: mounted.getData, replaceData: mounted.replaceData, reportError: () => undefined,
  });
  await act(async () => {
    await recovery.receiveInput({ arguments: { agentName: agent.name } });
    await recovery.ready();
  });
  expect(screen.getByRole("alert")).toHaveTextContent("forward-proxy-failed:tools/call");
  await act(async () => {
    await recovery.receiveResult(result({
      ...context, state: "running", jobId,
      status: { ...status, status: "running", canFinalize: false, nextPollMs: 5000 },
    }));
  });
  expect(screen.getByRole("progressbar", { name: /Reviewing Zava/ })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Create" })).toBeNull();
  act(() => screen.getByRole("button", { name: "Continue in background" }).click());
  expect(screen.getByText(new RegExp(jobId))).toBeInTheDocument();
  expect(mounted.call).toHaveBeenCalledTimes(1);
});

it("keeps the acknowledged job outside the Create form after deferred data fails", async () => {
  vi.useFakeTimers();
  const mounted = mount(null, async request => {
    expect(request.name).toBe("list_reviewable_agents");
    throw new Error("forward-proxy-failed:tools/call");
  });
  const recovery = createInitialToolDataRecovery({
    name: "open_agent_review", callTool: request => mounted.app.callServerTool(request),
    getData: mounted.getData, replaceData: mounted.replaceData, reportError: () => undefined,
  });
  await act(async () => {
    await recovery.receiveResult(result({ ...context, state: "running", jobId, deferred: ["agents"] }));
    await recovery.ready();
  });
  expect(screen.queryByRole("button", { name: "Create" })).toBeNull();
  expect(screen.getByRole("button", { name: "Check existing job" })).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("list_reviewable_agents");
  act(() => screen.getByRole("button", { name: "Close review error" }).click());
  expect(screen.getByText(new RegExp(jobId))).toBeInTheDocument();
  expect(mounted.call).toHaveBeenCalledTimes(1);
});

it("shows a rejected initial-data chunk as a data error with unknown progress", async () => {
  vi.useFakeTimers();
  const message = "MCP error -32603: MCP error -32603: forward-proxy-failed:tools/call";
  const original = result({
    ...context, state: "running", jobId,
    status: { ...status, status: "running", canFinalize: false, nextPollMs: 3_600_000 },
    evidence: randomBytes(100_000).toString("base64"),
  });
  const compact = boundedToolResult(original, "offline-ui-fixture");
  expect(compact.structuredContent?.status).toBeUndefined();
  const mounted = mount(null, async request => {
    expect(request.name).toBe("get_initial_widget_data");
    throw new Error(message);
  });
  const recovery = createInitialToolDataRecovery({
    name: "open_agent_review", callTool: request => mounted.app.callServerTool(request),
    getData: mounted.getData, replaceData: mounted.replaceData, reportError: () => undefined,
  });
  await act(async () => {
    await recovery.receiveResult(compact);
    await recovery.receiveInput({ arguments: { agentName: agent.name } });
    await recovery.ready();
  });
  const diagnostic = `Initial widget data complete-result chunk failed (get_initial_widget_data): ${message}`;
  expect(screen.queryAllByText(/^Review failed/)).toHaveLength(0);
  expect(screen.getByText("Review data could not be loaded")).toBeInTheDocument();
  expect(screen.getByText("Review progress is unknown.")).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(diagnostic);
  expect(screen.queryByRole("progressbar")).toBeNull();
  expect(screen.queryByText("Checking Compliance")).toBeNull();
  expect(screen.queryByText("40%")).toBeNull();
  expect(screen.getByRole("button", { name: "Check existing job" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Create" })).toBeNull();
  expect(mounted.getData()).toMatchObject({
    state: "load-error", jobId, selectionId: context.selectionId,
    environmentId: environment.id, agentId: agent.id,
    dataLoadError: { source: "initial-data", toolName: "get_initial_widget_data", stage: "complete-result chunk" },
  });
  const calls = mounted.call.mock.calls.length;
  await act(async () => {
    await recovery.ready();
    await recovery.receiveInput({ arguments: { agentName: agent.name } });
    await vi.advanceTimersByTimeAsync(10_000);
  });
  expect(mounted.call).toHaveBeenCalledTimes(calls);
  await act(async () => { await recovery.receiveResult(original); });
  expect(screen.getByRole("progressbar", { name: /Reviewing Zava/ })).toBeInTheDocument();
  expect(screen.queryByText(diagnostic)).toBeNull();
  expect(screen.queryByText("Review data could not be loaded")).toBeNull();
  expect(mounted.getData()).toEqual(original.structuredContent);
  expect(mounted.call).toHaveBeenCalledTimes(calls);
});

const dataLoadFailure = {
  ...context, state: "load-error", jobId,
  dataLoadError: { source: "initial-data", toolName: "get_initial_widget_data", stage: "complete-result chunk" },
  error: { message: "Initial widget data complete-result chunk failed (get_initial_widget_data): forward-proxy-failed:tools/call" },
};

it("checks only the acknowledged job and keeps progress unknown until its status arrives", async () => {
  vi.useFakeTimers();
  const pending = deferred();
  const { call } = mount(dataLoadFailure, async () => pending.promise);
  const check = screen.getByRole("button", { name: "Check existing job" });
  act(() => { check.click(); check.click(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(call).toHaveBeenCalledTimes(1);
  expect(call).toHaveBeenCalledWith({ name: "get_agent_review_status", arguments: { jobId } });
  expect(screen.getByRole("button", { name: "Check existing job" })).toBeDisabled();
  expect(screen.getByText("Review progress is unknown.")).toBeInTheDocument();
  expect(screen.queryByText("Checking Compliance")).toBeNull();
  expect(screen.queryByText("40%")).toBeNull();
  expect(screen.queryByRole("button", { name: "Create" })).toBeNull();
  await act(async () => {
    pending.resolve(result({
      state: "status", status: { ...status, status: "running", canFinalize: false, nextPollMs: 3_600_000 },
    }));
    await pending.promise;
  });
  expect(screen.getByRole("progressbar", { name: /Reviewing Zava/ })).toBeInTheDocument();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(call).toHaveBeenCalledTimes(1);
});

it("does not declare a job failure when the explicit existing-job status read is rejected", async () => {
  vi.useFakeTimers();
  const { call } = mount(dataLoadFailure, async () => {
    throw new Error("MCP error -32603: forward-proxy-failed:tools/call");
  });
  act(() => screen.getByRole("button", { name: "Check existing job" }).click());
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(screen.getByText("Checking existing job")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Check existing job" })).toBeDisabled();
  expect(screen.queryByRole("alert")).toBeNull();
  for (const delay of [5_000, 15_000, 30_000]) {
    await act(async () => { await vi.advanceTimersByTimeAsync(delay); });
  }
  expect(screen.getByText("Review data could not be loaded")).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("get_agent_review_status");
  expect(screen.queryAllByText(/^Review failed/)).toHaveLength(0);
  expect(screen.queryByRole("progressbar")).toBeNull();
  expect(screen.queryByText("Checking Compliance")).toBeNull();
  expect(screen.getByRole("button", { name: "Check existing job" })).toBeEnabled();
  expect(call).toHaveBeenCalledTimes(4);
  expect(call).toHaveBeenCalledWith({ name: "get_agent_review_status", arguments: { jobId } });
});

const runningStatus = { ...status, status: "running", canFinalize: false, nextPollMs: 5_000 };

it.each(["transport", "retryable tool"])("retries a transient %s status read without replacing running progress", async kind => {
  vi.useFakeTimers();
  let reads = 0;
  const { call } = mount({
    ...context, state: "running", jobId, status: { ...runningStatus, nextPollMs: 0 },
  }, async request => {
    expect(request).toEqual({ name: "get_agent_review_status", arguments: { jobId } });
    if (++reads === 1) {
      if (kind === "transport") throw new Error("Request timed out");
      return { isError: true, content: [], structuredContent: {
        state: "error", error: { code: "READ_FAILED", retryable: true, message: "Temporary status read failure." },
      } };
    }
    return result({ state: "status", status: runningStatus });
  });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(screen.getByRole("progressbar", { name: /Reviewing Zava/ })).toBeInTheDocument();
  expect(screen.queryByText("Review data could not be loaded")).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(4_999); });
  expect(call).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(call).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("alert")).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
  expect(call).toHaveBeenCalledTimes(3);
  expect(screen.getByRole("progressbar", { name: /Reviewing Zava/ })).toBeInTheDocument();
});

it.each(["transport", "retryable tool"])("shows the existing card only after four transient %s status failures", async kind => {
  vi.useFakeTimers();
  const message = "Request timed out";
  const { call } = mount({
    ...context, state: "running", jobId, status: { ...runningStatus, nextPollMs: 0 },
  }, async request => {
    expect(request).toEqual({ name: "get_agent_review_status", arguments: { jobId } });
    if (kind === "transport") throw new Error(message);
    return { isError: true, content: [], structuredContent: {
      state: "error", error: { code: "READ_FAILED", retryable: true, message },
    } };
  });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  for (const [index, delay] of [5_000, 15_000, 30_000].entries()) {
    expect(screen.getByRole("progressbar", { name: /Reviewing Zava/ })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(delay - 1); });
    expect(call).toHaveBeenCalledTimes(index + 1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(call).toHaveBeenCalledTimes(index + 2);
  }
  expect(screen.getByText("Review data could not be loaded")).toBeInTheDocument();
  expect(screen.getByText("Review progress is unknown.")).toBeInTheDocument();
  expect(screen.getByText("A data-read error does not confirm that the Review job failed.")).toBeInTheDocument();
  expect(screen.getByText(`Job ID: ${jobId}`)).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(`Unable to read Review status (get_agent_review_status): ${message}`);
  expect(screen.getByRole("button", { name: "Check existing job" })).toBeEnabled();
  expect(screen.queryAllByText(/^Review failed/)).toHaveLength(0);
  expect(screen.queryByRole("button", { name: "Create" })).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(call).toHaveBeenCalledTimes(4);
});

it.each([
  ["AUTH_REQUIRED", false],
  ["AUTH_REQUIRED", undefined],
  ["NOT_FOUND", undefined],
  ["READ_FAILED", false],
] as const)("does not retry a %s status error with retryable=%s", async (code, retryable) => {
  vi.useFakeTimers();
  const message = `${code}: the status read was denied.`;
  const { call } = mount({
    ...context, state: "running", jobId, status: { ...runningStatus, nextPollMs: 0 },
  }, async request => {
    expect(request).toEqual({ name: "get_agent_review_status", arguments: { jobId } });
    return { isError: true, content: [], structuredContent: { state: "error", error: { code, retryable, message } } };
  });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(screen.getByText("Review data could not be loaded")).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(message);
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(call).toHaveBeenCalledTimes(1);
});

it("does not retry a status reply without a status or structured retry permission", async () => {
  vi.useFakeTimers();
  const { call } = mount({
    ...context, state: "running", jobId, status: { ...runningStatus, nextPollMs: 0 },
  }, async () => result({ state: "status" }));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(screen.getByRole("alert")).toHaveTextContent("The response did not include the existing job status.");
  expect(screen.getByRole("button", { name: "Check existing job" })).toBeEnabled();
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(call).toHaveBeenCalledTimes(1);
});

it("resets transient status retries after a successful status read", async () => {
  vi.useFakeTimers();
  let reads = 0;
  const { call } = mount({
    ...context, state: "running", jobId, status: { ...runningStatus, nextPollMs: 0 },
  }, async request => {
    expect(request).toEqual({ name: "get_agent_review_status", arguments: { jobId } });
    if (++reads === 1 || reads === 3) throw new Error("Request timed out");
    return result({ state: "status", status: runningStatus });
  });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
  expect(call).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
  expect(call).toHaveBeenCalledTimes(3);
  expect(screen.queryByRole("alert")).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(4_999); });
  expect(call).toHaveBeenCalledTimes(3);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(call).toHaveBeenCalledTimes(4);
  expect(screen.getByRole("progressbar", { name: /Reviewing Zava/ })).toBeInTheDocument();
});

it("resets transient status retries when Check existing job is selected", async () => {
  vi.useFakeTimers();
  let reads = 0;
  const { call } = mount({
    ...context, state: "running", jobId, status: { ...runningStatus, nextPollMs: 0 },
  }, async request => {
    expect(request).toEqual({ name: "get_agent_review_status", arguments: { jobId } });
    if (++reads < 6) throw new Error("Request timed out");
    return result({ state: "status", status: runningStatus });
  });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  for (const delay of [5_000, 15_000, 30_000]) {
    await act(async () => { await vi.advanceTimersByTimeAsync(delay); });
  }
  expect(call).toHaveBeenCalledTimes(4);
  expect(screen.getByRole("button", { name: "Check existing job" })).toBeEnabled();
  act(() => screen.getByRole("button", { name: "Check existing job" }).click());
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(call).toHaveBeenCalledTimes(5);
  expect(screen.getByText("Checking existing job")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Check existing job" })).toBeDisabled();
  expect(screen.queryByRole("alert")).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(4_999); });
  expect(call).toHaveBeenCalledTimes(5);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(call).toHaveBeenCalledTimes(6);
  expect(screen.getByRole("progressbar", { name: /Reviewing Zava/ })).toBeInTheDocument();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("cancels a transient status retry when a different target is delivered", async () => {
  vi.useFakeTimers();
  const { call, replaceData } = mount({
    ...context, state: "running", jobId, status: { ...runningStatus, nextPollMs: 0 },
  }, async request => {
    expect(request).toEqual({ name: "get_agent_review_status", arguments: { jobId } });
    throw new Error("Request timed out");
  });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  const other = { ...agent, id: "66666666-6666-4666-8666-666666666666", name: "Another selected agent" };
  act(() => replaceData({ ...context, selectionId: "another-selection", agent: other, agentId: other.id, agents: [other] }));
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(screen.getByRole("button", { name: "Create" })).toBeEnabled();
  expect(screen.getByRole("combobox", { name: "Choose agent" })).toHaveValue(other.name);
  expect(call).toHaveBeenCalledTimes(1);
});

it("keeps a server-confirmed failed job distinct from a widget data-read failure", () => {
  const message = "The server confirmed that the review job failed.";
  const { call } = mount({
    ...context, state: "failed", jobId, reviewId,
    status: { ...status, status: "failed", canFinalize: false, completedComponents: 1, error: message },
    error: { message },
  });
  expect(screen.getByText(`Review failed for ${agent.name}`)).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(message);
  expect(screen.getByRole("progressbar", { name: /failed/ })).toBeInTheDocument();
  expect(screen.queryByText("Review progress is unknown.")).toBeNull();
  expect(screen.queryByText("Review data could not be loaded")).toBeNull();
  expect(screen.queryByRole("button", { name: "Load saved results" })).toBeNull();
  expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  expect(call).not.toHaveBeenCalled();
});

it("keeps an acknowledged saved Review readable after its results callback fails", async () => {
  vi.useFakeTimers();
  const model = navigationModel();
  let reads = 0;
  const { call } = mount({
    ...context, state: "running", jobId, status: { ...status, nextPollMs: 0 },
  }, async request => {
    if (request.name === "get_agent_review_status") return result({ state: "status", status });
    if (request.name === "finalize_agent_review") return result({ state: "summary", reviewId });
    if (request.name === "get_agent_review_result") {
      expect(request.arguments).toEqual({ reviewId, presentation: "summary" });
      if (++reads === 1) throw new Error("MCP error -32603: forward-proxy-failed:tools/call");
      return result({ state: "summary", reviewId, model });
    }
    throw new Error(`Unexpected fixture call: ${request.name}`);
  });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(screen.queryAllByText(/^Review failed/)).toHaveLength(0);
  expect(screen.getByText("Review results could not be loaded")).toBeInTheDocument();
  expect(screen.getByText(`Review ID: ${reviewId}`)).toBeInTheDocument();
  expect(screen.getByText(`Job ID: ${jobId}`)).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("forward-proxy-failed:tools/call");
  const reload = screen.getByRole("button", { name: "Load saved results" });
  await act(async () => { reload.click(); reload.click(); });
  expect(call.mock.calls.map(([request]) => request.name)).toEqual([
    "get_agent_review_status", "finalize_agent_review", "get_agent_review_result", "get_agent_review_result",
  ]);
  expect(screen.getByRole("tab", { name: /Agent map/ })).toBeInTheDocument();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByRole("button", { name: "Create" })).toBeNull();
});

it("keeps the acknowledged saved ID when the result payload has no model", async () => {
  vi.useFakeTimers();
  const { call } = mount({
    ...context, state: "running", jobId, status: { ...status, nextPollMs: 0 },
  }, async request => {
    if (request.name === "get_agent_review_status") return result({ state: "status", status });
    if (request.name === "finalize_agent_review") return result({ state: "summary", reviewId });
    if (request.name === "get_agent_review_result") return result({ state: "summary", reviewId });
    throw new Error(`Unexpected fixture call: ${request.name}`);
  });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(screen.getByText(`Review ID: ${reviewId}`)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Load saved results" })).toBeEnabled();
  expect(screen.getByRole("alert")).toHaveTextContent("complete saved findings");
  expect(call).toHaveBeenCalledTimes(3);
  expect(screen.queryByRole("button", { name: "Create" })).toBeNull();
});

it("offers read-only saved result recovery after an initial saved Review read failure", async () => {
  const user = userEvent.setup();
  const model = navigationModel();
  const { call } = mount({
    state: "error", reviewId,
    error: { message: "Initial widget data recovery failed (get_agent_review_result): saved read denied" },
  }, async request => {
    expect(request).toEqual({ name: "get_agent_review_result", arguments: { reviewId, presentation: "summary" } });
    return result({ state: "summary", reviewId, model });
  });
  expect(screen.queryByRole("button", { name: "Create" })).toBeNull();
  expect(screen.getByText(`Review ID: ${reviewId}`)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Load saved results" }));
  expect(screen.getByRole("tab", { name: /Agent map/ })).toBeInTheDocument();
  expect(call).toHaveBeenCalledTimes(1);
});

it("keeps a failed saved-ID opener outside the Create route without an automatic read", async () => {
  const message = "The Agent Review operation failed.";
  const { call } = mount({
    state: "error", selectionId: "failed-saved-opener", reviewId,
    error: { code: "INTERNAL_ERROR", message, retryable: false },
  }, undefined, "inline", { reviewId, startReview: false, resumeOnly: true });
  expect(screen.getByText("Review results could not be loaded")).toBeInTheDocument();
  expect(screen.getByText(`Review ID: ${reviewId}`)).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(message);
  expect(screen.getByText("This view keeps the requested saved review ID. Loading results does not start or finalize a job."))
    .toBeInTheDocument();
  expect(screen.queryByText("New review")).toBeNull();
  expect(screen.queryByRole("button", { name: "Create" })).toBeNull();
  expect(screen.queryByRole("combobox", { name: "Choose agent" })).toBeNull();
  expect(screen.getByRole("button", { name: "Load saved results" })).toBeEnabled();
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(call).not.toHaveBeenCalled();
});

it("prioritizes the saved ID after an initial complete-result failure with an acknowledged job", async () => {
  const user = userEvent.setup();
  const model = navigationModel();
  const message = "Initial widget data complete-result chunk failed (get_initial_widget_data): forward-proxy-failed:tools/call";
  const { call } = mount({
    ...context, state: "load-error", reviewId, jobId, error: { message },
    dataLoadError: { source: "initial-data", toolName: "get_initial_widget_data", stage: "complete-result chunk" },
  }, async request => {
    expect(request).toEqual({ name: "get_agent_review_result", arguments: { reviewId, presentation: "summary" } });
    return result({ state: "summary", reviewId, model });
  });
  expect(screen.getByText(`Review ID: ${reviewId}`)).toBeInTheDocument();
  expect(screen.getByText(`Job ID: ${jobId}`)).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(message);
  expect(screen.queryByRole("button", { name: "Create" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Check existing job" })).toBeNull();
  expect(call).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Load saved results" }));
  expect(screen.getByRole("tab", { name: /Agent map/ })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: /Findings/ })).toBeInTheDocument();
  expect(call.mock.calls.map(([request]) => request.name)).toEqual(["get_agent_review_result"]);
});

it("does not label a newly selected saved read error with the previous Review job", () => {
  const { call, replaceData } = mount({ ...context, state: "running", jobId,
    status: { ...status, nextPollMs: 3_600_000 } });
  const newerId = "66666666-6666-4666-8666-666666666666";
  act(() => replaceData({ state: "error", reviewId: newerId, error: { message: "The selected saved read failed." } }));
  expect(screen.getByText(`Review ID: ${newerId}`)).toBeInTheDocument();
  expect(screen.queryByText(`Job ID: ${jobId}`)).toBeNull();
  expect(call).not.toHaveBeenCalled();
});

it("does not finalize an older job when its pending status returns after a newer saved Review", async () => {
  vi.useFakeTimers();
  const pending = deferred();
  const { call, replaceData } = mount({
    ...context, state: "running", jobId, status: { ...status, nextPollMs: 0 },
  }, async request => {
    if (request.name === "get_agent_review_status") return pending.promise;
    throw new Error(`Stale callback must not run: ${request.name}`);
  });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  const newerId = "66666666-6666-4666-8666-666666666666";
  const newerModel = navigationModel();
  newerModel.summary.agentName = "New selected saved agent";
  act(() => replaceData({ ...context, state: "summary", reviewId: newerId, model: newerModel }));
  await act(async () => {
    pending.resolve(result({ state: "status", status }));
    await pending.promise;
  });
  expect(call.mock.calls.map(([request]) => request.name)).toEqual(["get_agent_review_status"]);
  expect(screen.getAllByText("New selected saved agent", { exact: true }).length).toBeGreaterThan(0);
  expect(screen.queryByRole("alert")).toBeNull();
});

it("cancels an older job timer when a newer saved Review becomes usable", async () => {
  vi.useFakeTimers();
  const { call, replaceData } = mount({
    ...context, state: "running", jobId, status: { ...status, nextPollMs: 500 },
  });
  act(() => replaceData({
    ...context, state: "summary", reviewId: "66666666-6666-4666-8666-666666666666", model: navigationModel(),
  }));
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  expect(call).not.toHaveBeenCalled();
  expect(screen.getByRole("tab", { name: /Agent map/ })).toBeInTheDocument();
});

it.each(["resolved", "rejected"] as const)("keeps a newer saved Review after an older full-results read is %s", async outcome => {
  const pending = deferred();
  const { app, call, replaceData } = mount({ ...context, state: "summary", reviewId, model: navigationModel() },
    async () => pending.promise);
  const display = vi.spyOn(app, "requestDisplayMode").mockResolvedValue({ mode: "fullscreen" });
  act(() => screen.getByRole("button", { name: "Expand to fullscreen" }).click());
  const newerId = "66666666-6666-4666-8666-666666666666";
  const newerModel = navigationModel();
  newerModel.summary.agentName = "New selected saved agent";
  act(() => replaceData({ ...context, state: "summary", reviewId: newerId, model: newerModel }));
  await act(async () => {
    if (outcome === "resolved") pending.resolve(result({ state: "fullReview", reviewId, model: navigationModel() }));
    else pending.reject(new Error("An obsolete full-results callback failed."));
    await pending.promise.catch(() => undefined);
  });
  expect(screen.getAllByText("New selected saved agent", { exact: true }).length).toBeGreaterThan(0);
  expect(screen.queryByText("An obsolete full-results callback failed.")).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(display).not.toHaveBeenCalled();
  expect(call).toHaveBeenCalledTimes(1);
});

it.each(["resolved", "rejected"] as const)("accepts a late current Review full-results read that is %s", async outcome => {
  const pending = deferred();
  const current = { ...context, state: "summary", reviewId, model: navigationModel() };
  const { app, call, replaceData } = mount(current, async () => pending.promise);
  const display = vi.spyOn(app, "requestDisplayMode").mockResolvedValue({ mode: "fullscreen" });
  act(() => screen.getByRole("button", { name: "Expand to fullscreen" }).click());
  act(() => replaceData(structuredClone(current)));
  await act(async () => {
    if (outcome === "resolved") pending.resolve(result({ state: "fullReview", reviewId, model: navigationModel() }));
    else pending.reject(new Error("The current saved Review read failed."));
    await pending.promise.catch(() => undefined);
  });
  expect(screen.getByRole("tab", { name: /Agent map/ })).toBeInTheDocument();
  if (outcome === "resolved") expect(display).toHaveBeenCalledTimes(1);
  else {
    expect(display).not.toHaveBeenCalled();
    expect(screen.getByText("The current saved Review read failed.")).toBeInTheDocument();
  }
  expect(call).toHaveBeenCalledTimes(1);
});

it("accepts its pending result read across the acknowledged job to saved Review transition", async () => {
  vi.useFakeTimers();
  const pending = deferred();
  const model = navigationModel();
  const { call, replaceData } = mount({
    ...context, state: "running", jobId, status: { ...status, nextPollMs: 0 },
  }, async request => {
    if (request.name === "get_agent_review_status") return result({ state: "status", status });
    if (request.name === "finalize_agent_review") return result({ state: "summary", reviewId });
    if (request.name === "get_agent_review_result") return pending.promise;
    throw new Error(`Unexpected fixture call: ${request.name}`);
  });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  act(() => replaceData({ ...context, state: "summary", jobId, reviewId }));
  await act(async () => { pending.resolve(result({ state: "summary", reviewId, model })); await pending.promise; });
  expect(screen.getByRole("tab", { name: /Agent map/ })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Load saved results" })).toBeNull();
  expect(call.mock.calls.map(([request]) => request.name)).toEqual([
    "get_agent_review_status", "finalize_agent_review", "get_agent_review_result",
  ]);
});

it("shares an overlapping full-results read for one saved Review", async () => {
  const pending = deferred();
  const model = navigationModel();
  const { app, call } = mount({ ...context, state: "summary", reviewId, model }, async () => pending.promise);
  const display = vi.spyOn(app, "requestDisplayMode").mockResolvedValue({ mode: "fullscreen" });
  const expand = screen.getByRole("button", { name: "Expand to fullscreen" });
  act(() => { expand.click(); expand.click(); });
  await act(async () => {
    pending.resolve(result({ state: "fullReview", reviewId, model }));
    await pending.promise;
  });
  expect(call).toHaveBeenCalledTimes(1);
  expect(display).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("alert")).toBeNull();
});

it("does not return partial acknowledged data as a successful internal read", async () => {
  const { app, call } = mount(null, async () => {
    throw new Error("forward-proxy-failed:tools/call");
  });
  await expect(readInitialResult(app, result({
    ...context, state: "running", jobId, deferred: ["agents"],
  }), "open_agent_review")).rejects.toThrow("deferred agents failed (list_reviewable_agents)");
  expect(call).toHaveBeenCalledTimes(1);
  expect(call).toHaveBeenCalledWith({ name: "list_reviewable_agents", arguments: { environmentId: environment.id } });
});

it("clears the recovery error when a valid saved result replaces it", () => {
  const message = "Initial widget data recovery failed (get_agent_review_result): forward-proxy-failed:tools/call";
  const model = buildReviewViewModel(
    fixture.agentsExperience as CopilotReviewDisplayPayload, "You", 42_000, agent.name,
  );
  const { call, replaceData } = mount({ state: "error", reviewId, error: { message } });
  expect(screen.getByRole("alert")).toHaveTextContent(message);
  act(() => replaceData({ state: "summary", reviewId, model }));
  expect(screen.getByRole("tab", { name: /Agent map/ })).toBeInTheDocument();
  expect(screen.queryByLabelText("Review summary")).toBeNull();
  expect(screen.queryByText(message)).toBeNull();
  expect(call).not.toHaveBeenCalled();
});

it("opens an existing completed review on Agent map without any start or finalize call", () => {
  const model = buildReviewViewModel(
    fixture.agentsExperience as CopilotReviewDisplayPayload, "You", 42_000, agent.name,
  );
  const { call } = mount({ ...context, state: "summary", reviewId, model });
  expect(screen.getByRole("tab", { name: /Agent map/ })).toHaveAttribute("aria-selected", "true");
  expect(screen.queryByRole("button", { name: "Create" })).toBeNull();
  expect(screen.queryByLabelText("Review summary")).toBeNull();
  expect(call).not.toHaveBeenCalled();
});

it("shows the summary only after fullscreen and removes it again on inline return", async () => {
  const user = userEvent.setup();
  const model = buildReviewViewModel(
    fixture.agentsExperience as CopilotReviewDisplayPayload, "You", 42_000, agent.name,
  );
  const { app, call } = mount({ state: "summary", reviewId, model }, async request => {
    expect(request).toEqual({ name: "get_agent_review_result", arguments: { reviewId, presentation: "fullReview" } });
    return result({ state: "fullReview", reviewId, model });
  });
  vi.spyOn(app, "requestDisplayMode").mockImplementation(async ({ mode }) => ({ mode }));
  expect(screen.queryByLabelText("Review summary")).toBeNull();
  await user.click(screen.getByRole("tab", { name: /Findings/ }));
  expect(screen.queryByLabelText("Review summary")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Expand to fullscreen" }));
  expect(screen.getByLabelText("Review summary")).toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: /Agent map/ }));
  expect(screen.getByLabelText("Review summary")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Exit fullscreen" }));
  expect(screen.queryByLabelText("Review summary")).toBeNull();
  expect(call).toHaveBeenCalledTimes(1);
});

it("expands a plain saved-result tool reply without an opener selection ID", async () => {
  const user = userEvent.setup();
  const model = buildReviewViewModel(
    fixture.agentsExperience as CopilotReviewDisplayPayload, "You", 42_000, agent.name,
  );
  const { app, call } = mount({ state: "summary", reviewId, model }, async request => {
    expect(request).toEqual({ name: "get_agent_review_result", arguments: { reviewId, presentation: "fullReview" } });
    return result({ state: "fullReview", reviewId, model });
  });
  const display = vi.spyOn(app, "requestDisplayMode").mockResolvedValue({ mode: "fullscreen" });
  await user.click(screen.getByRole("button", { name: "Expand to fullscreen" }));
  expect(display).toHaveBeenCalledWith({ mode: "fullscreen" });
  expect(call).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByRole("tab", { name: /Agent map/ })).toHaveAttribute("aria-selected", "true");
});

it("does not substitute another saved review's fullscreen snapshot for an explicit saved ID", () => {
  const model = buildReviewViewModel(
    fixture.agentsExperience as CopilotReviewDisplayPayload, "You", 42_000, agent.name,
  );
  window.sessionStorage.setItem("agent-review:review:snapshot:previous-selection", JSON.stringify({
    selectionId: "previous-selection", reviewId: "66666666-6666-4666-8666-666666666666",
    state: "fullReview", model: { ...model, summary: { ...model.summary, agentName: "Other saved agent" } },
    activeTab: "findings",
  }));
  window.sessionStorage.setItem("agent-review:review:active-fullscreen", "previous-selection");
  const { call } = mount({ state: "fullReview", reviewId, model }, undefined, "fullscreen");
  expect(screen.getAllByText(agent.name, { exact: true }).length).toBeGreaterThan(0);
  expect(screen.queryByText("Other saved agent", { exact: true })).toBeNull();
  expect(screen.getByRole("tab", { name: /Agent map/ })).toHaveAttribute("aria-selected", "true");
  expect(call).not.toHaveBeenCalled();
});

it("shows Architecture map when a running job completes without another start", async () => {
  vi.useFakeTimers();
  const { call, replaceData } = mount();
  act(() => replaceData({ state: "running", selectionId: "map-resume", status: { ...status, nextPollMs: 0 } }));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(screen.getByRole("tab", { name: /Agent map/ })).toHaveAttribute("aria-selected", "true");
  expect(call.mock.calls.map(([request]) => request.name)).toEqual([
    "get_agent_review_status", "finalize_agent_review", "get_agent_review_result",
  ]);
});

it("does not replace a new environment's agents with an older picker response", async () => {
  const user = userEvent.setup();
  const second = { ...environment, id: "66666666-6666-4666-8666-666666666666", name: "Second environment" };
  const third = { ...environment, id: "77777777-7777-4777-8777-777777777777", name: "Third environment" };
  const secondAgent = { ...agent, name: "Second agent" };
  const thirdAgent = { ...agent, name: "Third agent" };
  const old = deferred();
  const current = deferred();
  mount({ ...context, environments: [environment, second, third] }, async request =>
    request.arguments?.environmentId === second.id ? old.promise : current.promise);
  await user.click(screen.getByRole("combobox", { name: "Choose Environment" }));
  await user.click(screen.getByRole("option", { name: second.name }));
  await user.click(screen.getByRole("combobox", { name: "Choose Environment" }));
  await user.click(screen.getByRole("option", { name: third.name }));
  await act(async () => {
    current.resolve(result({ state: "agents", environmentId: third.id, agents: [thirdAgent] }));
    await current.promise;
  });
  await act(async () => {
    old.resolve(result({ state: "agents", environmentId: second.id, agents: [secondAgent] }));
    await old.promise;
  });
  await user.click(screen.getByRole("combobox", { name: "Choose agent" }));
  expect(screen.getByRole("option", { name: thirdAgent.name })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: secondAgent.name })).toBeNull();
});

it("shows direct prompt progress with no target form or additional start", async () => {
  vi.useFakeTimers();
  const running = {
    ...context, state: "running", jobId,
    status: { ...status, status: "running", canFinalize: false, nextPollMs: 500 },
  };
  const { call, replaceData } = mount(running);
  expect(screen.queryByRole("button", { name: "Create" })).toBeNull();
  expect(screen.queryByRole("combobox", { name: "Choose agent" })).toBeNull();
  expect(screen.getByRole("progressbar", { name: /Reviewing/ })).toBeInTheDocument();
  act(() => replaceData(structuredClone(running)));
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  expect(call.mock.calls.map(([request]) => request.name)).toEqual([
    "get_agent_review_status", "finalize_agent_review", "get_agent_review_result",
  ]);
  expect(screen.getByRole("tab", { name: /Agent map/ })).toBeInTheDocument();
  expect(screen.queryByLabelText("Review summary")).toBeNull();
});

it("keeps a direct prompt fallback on the existing form with its clear reason", () => {
  const { call } = mount({
    ...context, agentId: undefined, agent: undefined,
    error: { code: "AGENT_AMBIGUOUS", message: "More than one agent has this exact name. Choose an agent." },
  });
  expect(screen.getByText("New review")).toBeInTheDocument();
  expect(screen.getByText("More than one agent has this exact name. Choose an agent.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  expect(call).not.toHaveBeenCalled();
});

it("keeps the server's direct-review project name when progress continues in the background", async () => {
  vi.useFakeTimers();
  const projectName = "Agent Review 10/9/26, 12:54 PM";
  const { call } = mount({
    ...context, state: "running", jobId, projectName, startedAt: "2026-10-09T07:24:44.000Z",
  });
  act(() => screen.getByRole("button", { name: "Continue in background" }).click());
  expect(screen.getByText(projectName)).toBeInTheDocument();
  expect(call).not.toHaveBeenCalled();
});

function navigationModel() {
  const payload = fixture.agentsExperience as CopilotReviewDisplayPayload;
  const model = buildReviewViewModel(payload, "You", 42_000, agent.name);
  return {
    ...model,
    findings: [
      { ...model.findings[0], id: "DUP-01", title: "First exact node finding",
        componentIdUnique: payload.model.tools[0].componentIdUnique, fact: "First complete saved evidence." },
      { ...model.findings[0], id: "DUP-01", title: "Second exact node finding",
        componentIdUnique: payload.model.tools[0].componentIdUnique, fact: "Second complete saved evidence." },
      { ...model.findings[0], id: "DUP-01", title: "Other same-family node finding",
        componentIdUnique: payload.model.tools[1].componentIdUnique, fact: "Other complete saved evidence." },
    ],
    agentMap: {
      state: "ready" as const, reviewId, componentIdUnique: agent.componentIdUnique,
      graph: buildDeterministicAgentMap({
        agentId: agent.id, agentName: agent.name,
        environmentId: environment.id, environmentName: environment.name,
        model: payload.model, corpusComponents: [],
      }),
    },
  };
}

async function activateListNode(user: ReturnType<typeof userEvent.setup>, name = "Display Photo Library", keyboard?: string) {
  await user.click(screen.getByRole("tab", { name: /Agent map/ }));
  const list = screen.queryByRole("tab", { name: /^List$/ });
  if (list) await user.click(list);
  const node = list ? screen.getByRole("button", { name: `Inspect Connector tool ${name}` })
    : [...document.querySelectorAll<HTMLElement>(".react-flow__node")]
      .find(element => element.getAttribute("aria-label")?.startsWith(`Connector tool: ${name}.`));
  if (!node) throw new Error("The saved map node was not rendered.");
  if (keyboard) {
    node.focus();
    await user.keyboard(keyboard);
  } else {
    await user.click(node);
  }
}

/** Clicks an inline canvas node once. fireEvent.click skips the mousedown that d3-drag cannot read in jsdom. */
async function clickInlineCanvasNode(user: ReturnType<typeof userEvent.setup>, name = "Display Photo Library") {
  await user.click(screen.getByRole("tab", { name: /Agent map/ }));
  const node = [...document.querySelectorAll<HTMLElement>(".react-flow__node")]
    .find(element => element.getAttribute("aria-label")?.startsWith(`Connector tool: ${name}.`));
  if (!node) throw new Error("The saved map node was not rendered.");
  await act(async () => {
    fireEvent.click(node);
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

function expectExactNodeResults(name = "Display Photo Library") {
  expect(screen.getByRole("tab", { name: /Findings/ })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("group", { name: "Selected map node" })).toHaveTextContent(name);
  expect(screen.queryByRole("dialog", { name: "Finding details" })).toBeNull();
  if (name === "Display Photo Library") {
    expect(screen.getByRole("button", { name: /First exact node finding/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Second exact node finding/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Other same-family node finding/ })).toBeNull();
  } else {
    expect(screen.getByRole("button", { name: /Other same-family node finding/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /First exact node finding/ })).toBeNull();
  }
}

it("saves the next tab and exact mouse-selected node before requesting fullscreen", async () => {
  const user = userEvent.setup();
  const model = navigationModel();
  const node = model.agentMap.graph.nodes.find(item => item.label === "Display Photo Library")!;
  const { app, call } = mount({ state: "summary", reviewId, model });
  const display = vi.spyOn(app, "requestDisplayMode").mockImplementation(async request => {
    expect(request).toEqual({ mode: "fullscreen" });
    const saved = JSON.parse(window.sessionStorage.getItem(`agent-review:review:snapshot:${reviewId}`)!);
    expect(saved).toMatchObject({
      reviewId, state: "fullReview", activeTab: "findings",
      nodeFilter: { reviewId, nodeId: node.id },
      mapNavigation: { view: "map", selection: { type: "node", id: node.id } },
    });
    return { mode: "fullscreen" };
  });
  await activateListNode(user);
  expectExactNodeResults();
  expect(display).toHaveBeenCalledTimes(1);
  expect(call).not.toHaveBeenCalled();
});

it.each(["{Enter}", " "])("routes component-list keyboard activation %s to fullscreen findings", async key => {
  const user = userEvent.setup();
  const { app, call } = mount({ state: "summary", reviewId, model: navigationModel() });
  const display = vi.spyOn(app, "requestDisplayMode").mockResolvedValue({ mode: "fullscreen" });
  await activateListNode(user, "Display Photo Library", key);
  expectExactNodeResults();
  expect(display).toHaveBeenCalledTimes(1);
  expect(call).not.toHaveBeenCalled();
});

it.each(["{Enter}", " "])("routes canvas keyboard activation %s through the same node path", async key => {
  const user = userEvent.setup();
  const model = navigationModel();
  const { app, call } = mount({ state: "summary", reviewId, model });
  const display = vi.spyOn(app, "requestDisplayMode").mockResolvedValue({ mode: "fullscreen" });
  const nodeId = model.agentMap.graph.nodes.find(item => item.label === "Display Photo Library")!.id;
  // jsdom has no graph layout. The compiled host checks actual viewport visibility.
  const node = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${nodeId}"]`);
  expect(node).not.toBeNull();
  if (!node) throw new Error("The saved map node was not rendered.");
  node.focus();
  await user.keyboard(key);
  expectExactNodeResults();
  expect(display).toHaveBeenCalledTimes(1);
  expect(call).not.toHaveBeenCalled();
});

function expectCleanInlineMap() {
  expect(screen.getByRole("tab", { name: /Agent map/ })).toHaveAttribute("aria-selected", "true");
  expect(screen.queryByRole("group", { name: "Selected map node" })).toBeNull();
  expect(screen.queryByRole("group", { name: "Map selection details" })).toBeNull();
  expect(screen.queryByLabelText("Review summary")).toBeNull();
}

it("keeps the exact node filter through a fullscreen remount and returns inline to the clean map", async () => {
  const user = userEvent.setup();
  const model = navigationModel();
  const initial = mount({ state: "summary", reviewId, model });
  vi.spyOn(initial.app, "requestDisplayMode").mockResolvedValue({ mode: "fullscreen" });
  await activateListNode(user);
  initial.unmount();
  const fullscreen = mount(null, undefined, "fullscreen");
  expectExactNodeResults();
  const display = vi.spyOn(fullscreen.app, "requestDisplayMode").mockImplementation(async request => {
    const saved = JSON.parse(window.sessionStorage.getItem(`agent-review:review:snapshot:${reviewId}`)!);
    expect(saved).toMatchObject({
      state: "summary", activeTab: "map", nodeFilter: null, mapNavigation: { selection: null },
    });
    expect(request).toEqual({ mode: "inline" });
    fullscreen.setHost({ displayMode: "inline" });
    return { mode: "inline" };
  });
  await user.click(screen.getByRole("button", { name: "Exit fullscreen" }));
  expectCleanInlineMap();
  fullscreen.unmount();
  const returned = mount({ state: "summary", reviewId, model });
  expectCleanInlineMap();
  await user.click(screen.getByRole("tab", { name: /Findings/ }));
  expect(screen.getByRole("button", { name: /Other same-family node finding/ })).toBeInTheDocument();
  expect(screen.queryByRole("group", { name: "Selected map node" })).toBeNull();
  expect(display).toHaveBeenCalledTimes(1);
  expect(initial.call).not.toHaveBeenCalled();
  expect(fullscreen.call).not.toHaveBeenCalled();
  expect(returned.call).not.toHaveBeenCalled();
});

it("returns to the clean inline map when the host ends fullscreen", async () => {
  const user = userEvent.setup();
  const { app, call, setHost } = mount({ state: "summary", reviewId, model: navigationModel() });
  vi.spyOn(app, "requestDisplayMode").mockImplementation(async () => {
    setHost({ displayMode: "fullscreen" });
    return { mode: "fullscreen" };
  });
  await activateListNode(user, "Display Photo Library", "{Enter}");
  expectExactNodeResults();
  expect(screen.getByLabelText("Review summary")).toBeInTheDocument();
  act(() => setHost({ displayMode: "inline" }));
  expectCleanInlineMap();
  const saved = JSON.parse(window.sessionStorage.getItem(`agent-review:review:snapshot:${reviewId}`)!);
  expect(saved).toMatchObject({
    state: "summary", activeTab: "map", nodeFilter: null, mapNavigation: { selection: null },
  });
  expect(call).not.toHaveBeenCalled();
});

it("replaces a node filter without another display request when already fullscreen", async () => {
  const user = userEvent.setup();
  const { app, call } = mount({ state: "fullReview", reviewId, model: navigationModel() }, undefined, "fullscreen");
  const display = vi.spyOn(app, "requestDisplayMode").mockResolvedValue({ mode: "fullscreen" });
  await activateListNode(user);
  expectExactNodeResults();
  await activateListNode(user, "Planogram Archive");
  expectExactNodeResults("Planogram Archive");
  expect(display).not.toHaveBeenCalled();
  expect(call).not.toHaveBeenCalled();
});

it("does not request fullscreen twice for two node activations during one pending request", async () => {
  const user = userEvent.setup();
  let finish!: (value: { mode: "fullscreen" }) => void;
  const { app, call } = mount({ state: "summary", reviewId, model: navigationModel() });
  const pending = new Promise<{ mode: "fullscreen" }>(resolve => { finish = resolve; });
  const display = vi.spyOn(app, "requestDisplayMode").mockReturnValue(pending);
  await activateListNode(user);
  await activateListNode(user, "Planogram Archive");
  await activateListNode(user);
  expect(display).toHaveBeenCalledTimes(1);
  await act(async () => { finish({ mode: "fullscreen" }); await pending; });
  expectExactNodeResults();
  expect(call).not.toHaveBeenCalled();
});

it.each(["refused", "rejected"])("shows the node's findings inline when fullscreen is %s", async outcome => {
  const user = userEvent.setup();
  const model = navigationModel();
  const node = model.agentMap.graph.nodes.find(item => item.label === "Display Photo Library")!;
  const { app, call } = mount({ state: "summary", reviewId, model });
  const display = vi.spyOn(app, "requestDisplayMode");
  if (outcome === "refused") display.mockResolvedValue({ mode: "inline" });
  else display.mockRejectedValue(new Error("Fixture display request failed."));
  await clickInlineCanvasNode(user);
  // The host did not show fullscreen. Thus the same click shows the node's findings inline, not the map.
  expectExactNodeResults();
  expect(screen.queryByRole("group", { name: "Map selection details" })).toBeNull();
  expect(screen.getByRole("button", { name: "Clear node filter" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Expand to fullscreen" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Exit fullscreen" })).toBeNull();
  expect(screen.getByText("Fullscreen is not available in this host.")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).toBeNull();
  const saved = JSON.parse(window.sessionStorage.getItem(`agent-review:review:snapshot:${reviewId}`)!);
  expect(saved).toMatchObject({
    state: "summary", activeTab: "findings", nodeFilter: { reviewId, nodeId: node.id },
    mapNavigation: { selection: { type: "node", id: node.id } },
  });
  // After the refusal, the next node click opens its findings inline without another display request.
  await clickInlineCanvasNode(user, "Planogram Archive");
  expectExactNodeResults("Planogram Archive");
  expect(screen.queryByRole("group", { name: "Map selection details" })).toBeNull();
  expect(display).toHaveBeenCalledTimes(1);
  expect(call).not.toHaveBeenCalled();
});

it("does not restore another review's node filter when the invocation changes saved Review", async () => {
  const user = userEvent.setup();
  const model = navigationModel();
  const { app, call, replaceData } = mount({ ...context, state: "summary", reviewId, model });
  vi.spyOn(app, "requestDisplayMode").mockResolvedValue({ mode: "fullscreen" });
  await activateListNode(user);
  expectExactNodeResults();
  const otherReviewId = "66666666-6666-4666-8666-666666666666";
  const other = { ...model, agentMap: { ...model.agentMap, reviewId: otherReviewId } };
  act(() => replaceData({ ...context, state: "summary", reviewId: otherReviewId, model: other }));
  expect(screen.getByRole("tab", { name: /Agent map/ })).toHaveAttribute("aria-selected", "true");
  await user.click(screen.getByRole("tab", { name: /Findings/ }));
  expect(screen.queryByRole("group", { name: "Selected map node" })).toBeNull();
  // The inline preview lists the primary findings of the whole review, not one node.
  const results = within(screen.getByRole("list", { name: "Review results" }));
  expect(results.getAllByRole("button")).toHaveLength(3);
  expect(results.getByRole("button", { name: /Other same-family node finding/ })).toBeInTheDocument();
  expect(call).not.toHaveBeenCalled();
});

it("does not save a stale node view when a prior fullscreen request completes after changing Review", async () => {
  const user = userEvent.setup();
  let finish!: (value: { mode: "fullscreen" }) => void;
  const model = navigationModel();
  const { app, call, replaceData, unmount } = mount({ ...context, state: "summary", reviewId, model });
  const pending = new Promise<{ mode: "fullscreen" }>(resolve => { finish = resolve; });
  vi.spyOn(app, "requestDisplayMode").mockReturnValue(pending);
  await activateListNode(user);
  const otherReviewId = "77777777-7777-4777-8777-777777777777";
  const other = { ...model, agentMap: { ...model.agentMap, reviewId: otherReviewId } };
  act(() => replaceData({ ...context, state: "summary", reviewId: otherReviewId, model: other }));
  const stored = JSON.parse(window.sessionStorage.getItem("agent-review:review:snapshot:create-test")!);
  expect(stored).toMatchObject({ reviewId: otherReviewId, activeTab: "map", nodeFilter: null });
  await act(async () => { finish({ mode: "fullscreen" }); await pending; });
  unmount();
  const remounted = mount({ ...context, state: "summary", reviewId: otherReviewId, model: other });
  expect(screen.getByRole("tab", { name: /Agent map/ })).toHaveAttribute("aria-selected", "true");
  expect(screen.queryByRole("group", { name: "Selected map node" })).toBeNull();
  expect(call).not.toHaveBeenCalled();
  expect(remounted.call).not.toHaveBeenCalled();
});

it.each(["skills", "coverage", "checks"])("normalizes the old saved %s tab to Review findings", oldTab => {
  const model = navigationModel();
  window.sessionStorage.setItem(`agent-review:review:snapshot:${reviewId}`, JSON.stringify({
    selectionId: reviewId, reviewId, state: "summary", model, activeTab: oldTab,
  }));
  const { call } = mount({ state: "summary", reviewId, model });
  expect(screen.getByRole("tab", { name: /Findings/ })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("list", { name: "Review results" })).toBeInTheDocument();
  expect(call).not.toHaveBeenCalled();
});

it("keeps the expand button when the available display modes omit fullscreen", () => {
  mount({ state: "summary", reviewId, model: navigationModel() }, undefined, "inline", undefined, ["inline"]);
  expect(screen.getByRole("button", { name: "Expand to fullscreen" })).toBeInTheDocument();
});

it("opens the node's findings inline with one click when the host offers only inline", async () => {
  const user = userEvent.setup();
  const model = navigationModel();
  const node = model.agentMap.graph.nodes.find(item => item.label === "Display Photo Library")!;
  const { app, call } = mount({ state: "summary", reviewId, model }, undefined, "inline", undefined, ["inline"]);
  const display = vi.spyOn(app, "requestDisplayMode");
  await clickInlineCanvasNode(user);
  expectExactNodeResults();
  expect(screen.queryByRole("group", { name: "Map selection details" })).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  const saved = JSON.parse(window.sessionStorage.getItem(`agent-review:review:snapshot:${reviewId}`)!);
  expect(saved).toMatchObject({
    state: "summary", activeTab: "findings", nodeFilter: { reviewId, nodeId: node.id },
    mapNavigation: { selection: { type: "node", id: node.id } },
  });
  await user.click(screen.getByRole("button", { name: "Clear node filter" }));
  expect(screen.queryByRole("group", { name: "Selected map node" })).toBeNull();
  expect(screen.getByRole("button", { name: /Other same-family node finding/ })).toBeInTheDocument();
  expect(display).not.toHaveBeenCalled();
  expect(call).not.toHaveBeenCalled();
});

const SIMULATED_STAGES = [
  "Initializing", "Parsing Configuration", "Evaluating Patterns", "Checking Compliance", "Saving Results", "Complete",
];

function simulatedReview(selectionId: string, simulatedProgress: unknown = { stepMs: 2000 }) {
  const model = buildReviewViewModel(fixture.agentsExperience as CopilotReviewDisplayPayload, "You", 42_000, agent.name);
  return { state: "summary", selectionId, reviewId, model, simulatedProgress };
}

/** The status of each stepper row: completed, in progress or not started. */
function stageStatuses() {
  return SIMULATED_STAGES.map(name => {
    const row = screen.getByText(name, { exact: true }).parentElement!;
    return within(row).getByText(/^(completed|in progress|failed|not started)$/).textContent;
  });
}

function expectSimulatedStep(active: number, percent: string, detail?: string) {
  expect(screen.getByText(`Reviewing ${agent.name}...`)).toBeInTheDocument();
  expect(screen.getByRole("progressbar", { name: /Reviewing/ })).toHaveAttribute("aria-valuetext", percent);
  expect(stageStatuses()).toEqual(SIMULATED_STAGES.map((_, index) =>
    index < active ? "completed" : index === active ? "in progress" : "not started"));
  if (detail) expect(screen.getByText(detail)).toBeInTheDocument();
  expect(screen.getByText("4 skills")).toBeInTheDocument();
  // A demo step has no job actions: no Continue in background, Cancel, Retry or dismiss button.
  expect(screen.queryAllByRole("button")).toHaveLength(0);
  expect(screen.queryByRole("tab", { name: /Agent map/ })).toBeNull();
}

it("plays the real stepper for a simulated final review, one stage per step, then shows the result without a tool call", () => {
  vi.useFakeTimers();
  const { call } = mount(simulatedReview("simulated-review"));
  expectSimulatedStep(1, "10%", "Preparing and submitting the review");
  act(() => { vi.advanceTimersByTime(1_999); });
  expectSimulatedStep(1, "10%");
  act(() => { vi.advanceTimersByTime(1); });
  expectSimulatedStep(2, "15%", "Handing off to the review agent");
  act(() => { vi.advanceTimersByTime(2_000); });
  expectSimulatedStep(3, "50%", "Reviewed 2 of 4 skills");
  expect(screen.getByText("Agent node")).toBeInTheDocument();
  act(() => { vi.advanceTimersByTime(2_000); });
  expectSimulatedStep(4, "90%", "Saving review results");
  act(() => { vi.advanceTimersByTime(2_000); });
  expect(stageStatuses()).toEqual(SIMULATED_STAGES.map(() => "completed"));
  expect(screen.getByRole("progressbar", { name: /Reviewing/ })).toHaveAttribute("aria-valuetext", "100%");
  expect(screen.getByText("Review complete.")).toBeInTheDocument();
  expect(screen.queryAllByRole("button")).toHaveLength(0);
  act(() => { vi.advanceTimersByTime(2_000); });
  expect(screen.queryByRole("progressbar", { name: /Reviewing/ })).toBeNull();
  expect(screen.getByRole("tab", { name: /Agent map/ })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("button", { name: "Expand to fullscreen" })).toBeInTheDocument();
  act(() => { vi.advanceTimersByTime(60_000); });
  expect(call).not.toHaveBeenCalled();
});

it("plays a simulated review once: not again after a display-mode change, a repeated result or a new frame", () => {
  vi.useFakeTimers();
  const data = simulatedReview("simulated-once", true);
  const first = mount(data);
  act(() => { vi.advanceTimersByTime(4_000); });
  // The host changes the display mode during the playback; the step continues.
  act(() => first.setHost({ displayMode: "fullscreen" }));
  expectSimulatedStep(3, "50%", "Reviewed 2 of 4 skills");
  act(() => { vi.advanceTimersByTime(6_000); });
  expect(screen.queryByRole("progressbar", { name: /Reviewing/ })).toBeNull();
  expect(screen.getByRole("button", { name: "Exit fullscreen" })).toBeInTheDocument();
  act(() => first.setHost({ displayMode: "inline" }));
  act(() => first.replaceData({ ...data }));
  expect(screen.queryByRole("progressbar", { name: /Reviewing/ })).toBeNull();
  expect(screen.getByRole("tab", { name: /Agent map/ })).toHaveAttribute("aria-selected", "true");
  first.unmount();
  const second = mount(data);
  expect(screen.queryByRole("progressbar", { name: /Reviewing/ })).toBeNull();
  expect(screen.getByRole("tab", { name: /Agent map/ })).toHaveAttribute("aria-selected", "true");
  second.unmount();
  // Another tool result with the same review plays again.
  const third = mount(simulatedReview("simulated-next"));
  expectSimulatedStep(1, "10%", "Preparing and submitting the review");
  expect([first.call, second.call, third.call].every(spy => spy.mock.calls.length === 0)).toBe(true);
});

it("limits a long simulated review to 16 seconds and plays nothing without a valid flag", () => {
  vi.useFakeTimers();
  const long = mount(simulatedReview("simulated-long", { stepMs: 60_000 }));
  act(() => { vi.advanceTimersByTime(3_200); });
  expectSimulatedStep(2, "15%");
  act(() => { vi.advanceTimersByTime(12_800); });
  expect(screen.queryByRole("progressbar", { name: /Reviewing/ })).toBeNull();
  long.unmount();
  for (const flag of [undefined, false, null, "yes", 2000]) {
    const view = mount({ ...simulatedReview(`simulated-off-${String(flag)}`), simulatedProgress: flag });
    expect(screen.queryByRole("progressbar", { name: /Reviewing/ })).toBeNull();
    expect(screen.getByRole("tab", { name: /Agent map/ })).toHaveAttribute("aria-selected", "true");
    view.unmount();
  }
});
