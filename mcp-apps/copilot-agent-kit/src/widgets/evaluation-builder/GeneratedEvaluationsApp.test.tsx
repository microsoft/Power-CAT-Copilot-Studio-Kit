import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeneratedEvaluationsApp, generatedSetName } from "./GeneratedEvaluationsApp";
import { GENERATED_LAYOUT, loaderSkeletonCount } from "./inlineFit";
import type { EvaluationDraft } from "../../evaluation/contracts";
import type { App } from "@modelcontextprotocol/ext-apps";

const studioUrl = "https://copilotstudio.microsoft.com/environments/22222222-2222-4222-8222-222222222222/agents/33333333-3333-4333-8333-333333333333/evaluate";
const draft: EvaluationDraft = {
  id: "11111111-1111-4111-8111-111111111111", createdOn: "2026-10-14T00:00:00Z", testType: "conversation",
  target: { environment: { id: "22222222-2222-4222-8222-222222222222", name: "Explicit environment" },
    agent: { id: "33333333-3333-4333-8333-333333333333", name: "Exact agent", schemaName: "mspva_exact" } },
  cases: ["a", "b"].map(id => ({
    id: `case-${id}`, question: `Recorded question ${id}`, outcome: id === "a" ? "recorded-failure" as const : "unknown" as const,
    pathKey: `path-${id}`, path: [{ name: "Search rows", kind: "tool", recordedState: id === "a" ? "failed" : "completed" }],
    expectationSource: "recorded-response" as const,
    provenance: { conversationId: `saved-${id}`, transcriptId: `record-${id}`, userTurnIds: [`user-${id}`], activityIds: [] },
    turns: [{ question: `Recorded question ${id}`, observedResponse: `Recorded answer ${id}`, expectedResponse: `Recorded answer ${id}`, userTurnId: `user-${id}`, assistantTurnIds: [`bot-${id}`] }],
  })),
};
const mocks = vi.hoisted(() => ({ call: vi.fn(), openLink: vi.fn(), replaceData: vi.fn(), requestDisplayMode: vi.fn(),
  data: {} as Record<string, unknown> | null, metadata: {} as Record<string, unknown>, capabilities: {} as Record<string, unknown>,
  host: { displayMode: "inline" } as Record<string, unknown> }));
vi.mock("../shared/McpAppProvider", () => ({
  useMcpApp: () => ({
    app: { callServerTool: mocks.call, openLink: mocks.openLink, requestDisplayMode: mocks.requestDisplayMode, getHostCapabilities: () => mocks.capabilities },
    data: mocks.data, metadata: mocks.metadata, replaceData: mocks.replaceData, replaceMetadata: vi.fn(),
    toolInput: { mode: "generate" }, theme: "light", host: mocks.host,
  }),
}));
const receipt = (requestId: unknown, count: number) => ({ state: "saved", verified: true, setId: "set-a",
  caseIds: Array.from({ length: count }, (_, i) => `child-${i}`), requestId, studioUrl, message: "Saved. No evaluation was run." });
function mount(container?: HTMLElement) { return render(<FluentProvider theme={webLightTheme}><GeneratedEvaluationsApp /></FluentProvider>, container ? { container } : undefined); }
const saved = () => waitFor(() => expect(screen.getByRole("button", { name: "Open in Copilot Studio" })).toBeEnabled());
type Request = Parameters<App["callServerTool"]>[0];
const requests = () => mocks.call.mock.calls.map(call => call[0] as Request);
afterEach(() => cleanup());
beforeEach(() => {
  mocks.call.mockReset(); mocks.openLink.mockReset(); mocks.replaceData.mockReset(); mocks.requestDisplayMode.mockReset();
  mocks.requestDisplayMode.mockResolvedValue({ mode: "fullscreen" }); mocks.host = { displayMode: "inline" };
  mocks.openLink.mockResolvedValue({}); mocks.capabilities = { openLinks: {} };
  mocks.data = { state: "generated", draft, studioUrl, sampledConversations: 4 };
  mocks.metadata = { evaluationSaveGrant: "test-grant-with-at-least-thirty-two-characters" };
  let count = draft.cases.length;
  mocks.call.mockImplementation(async (request: Parameters<App["callServerTool"]>[0]) => {
    if (request.name === "update_agent_evaluation_case" && request.arguments?.remove) count -= 1;
    return { content: [], structuredContent: { state: "save", receipt: receipt(request.arguments?.requestId, count) } };
  });
});
describe("Generated evaluations", () => {
  it("shows a target error in the generated view, without the loader or a save", () => {
    mocks.data = { state: "error", error: { message: "No agent was named." } };
    mount();
    expect(screen.getByRole("alert")).toHaveTextContent("No agent was named.");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(mocks.call).not.toHaveBeenCalled();
  });
  it("shows the generating animation until the cases arrive", () => {
    mocks.data = null;
    mount();
    expect(screen.getByRole("status")).toHaveTextContent("Generating evals based on available transcripts");
    expect(mocks.call).not.toHaveBeenCalled();
  });
  it("saves every generated case automatically, without a Save button", async () => {
    mount();
    expect(screen.queryByRole("button", { name: /^Save/ })).not.toBeInTheDocument();
    await saved();
    expect(screen.queryByText("Saved to Copilot Studio")).not.toBeInTheDocument();
    expect(mocks.call).toHaveBeenCalledTimes(1);
    const request = mocks.call.mock.calls[0][0] as Parameters<App["callServerTool"]>[0];
    expect(request.name).toBe("create_agent_evaluation_set");
    expect(request.arguments).toMatchObject({
      draftId: draft.id, requestId: draft.id, method: "GeneralQualityGrader", confirmed: true,
      selectedCases: [{ caseId: "case-a", expectedResponses: ["Recorded answer a"] }, { caseId: "case-b", expectedResponses: ["Recorded answer b"] }],
    });
    fireEvent.click(screen.getByRole("button", { name: "Open in Copilot Studio" }));
    await waitFor(() => expect(mocks.openLink).toHaveBeenCalledWith({ url: studioUrl }));
  });
  it("saves an inline edit when the field loses focus", async () => {
    mount();
    await saved();
    fireEvent.click(screen.getByRole("button", { name: "Edit expected response 1" }));
    const box = screen.getByRole("textbox", { name: "expected response 1" });
    fireEvent.change(box, { target: { value: "Reviewed expectation" } });
    fireEvent.blur(box);
    await screen.findByText("Edited · saved");
    const request = mocks.call.mock.calls[1][0] as Parameters<App["callServerTool"]>[0];
    expect(request.name).toBe("update_agent_evaluation_case");
    expect(request.arguments).toMatchObject({ requestId: draft.id, caseId: "case-a", question: "Recorded question a", expectedResponse: "Reviewed expectation" });
    expect(request.arguments?.remove).toBeUndefined();
  });
  it("deletes a case from the saved set", async () => {
    mount();
    await saved();
    fireEvent.click(screen.getAllByRole("button", { name: "Delete from set" })[1]);
    await waitFor(() => expect(screen.queryByText("Recorded question b")).not.toBeInTheDocument());
    const request = mocks.call.mock.calls[1][0] as Parameters<App["callServerTool"]>[0];
    expect(request.arguments).toMatchObject({ caseId: "case-b", remove: true });
    expect(screen.getByRole("button", { name: "Delete from set" })).toBeDisabled();
  });
  it("keeps the saved text when an edit would leave a case empty", async () => {
    mount();
    await saved();
    fireEvent.click(screen.getByRole("button", { name: "Edit expected response 2" }));
    const box = screen.getByRole("textbox", { name: "expected response 2" });
    fireEvent.change(box, { target: { value: "  " } });
    fireEvent.blur(box);
    expect(await screen.findByRole("alert")).toHaveTextContent("needs a question and an expected response");
    expect(screen.getByRole("button", { name: "Edit expected response 2" })).toHaveTextContent("Recorded answer b");
    expect(mocks.call).toHaveBeenCalledTimes(1);
  });
});

const NOTE = "Edits and deletions save as you go. No evaluation is run.";
const longText = (prefix: string) => Array.from({ length: 80 }, (_, i) => `${prefix} word ${i}`).join(" ");
function manyCases(count: number): EvaluationDraft {
  const base = draft.cases[1];
  return { ...draft, cases: Array.from({ length: count }, (_, i) => ({ ...base, id: `case-${i}`, question: longText(`Question ${i}`), pathKey: `path-${i}`,
    provenance: { ...base.provenance, conversationId: `saved-${i}`, transcriptId: `record-${i}`, userTurnIds: [`user-${i}`] },
    turns: [{ ...base.turns[0], question: longText(`Question ${i}`), observedResponse: longText(`Answer ${i}`), expectedResponse: longText(`Answer ${i}`), userTurnId: `user-${i}` }] })) };
}
function insetRoot() {
  const root = document.createElement("div"); root.id = "root"; root.style.padding = "24px"; document.body.appendChild(root); return root;
}
const rows = () => document.querySelectorAll(".eval-gen-row:not(.eval-gen-header)");
const css = () => readFileSync(join(process.cwd(), "src", "widgets", "evaluation-builder", "evaluation-builder.css"), "utf8");

describe("Generated evaluations inline fit (D2)", () => {
  beforeEach(() => {
    mocks.host = { displayMode: "inline", containerDimensions: { width: 760, maxHeight: 500 } };
    mocks.data = { state: "generated", draft: manyCases(30), studioUrl, sampledConversations: 30 };
  });
  it("shows a finite preview of 30 long cases within the budget and offers full screen", async () => {
    mount(insetRoot());
    await saved();
    const main = document.querySelector<HTMLElement>(".eval-gen")!;
    await waitFor(() => expect(main.style.maxHeight).toBe("452px"));
    expect(Number(main.dataset.inlineHeight)).toBeLessThanOrEqual(452);
    expect(rows()).toHaveLength(3);
    expect(screen.getByText("Showing 3 of 30 cases")).toBeInTheDocument();
    expect(document.querySelector("textarea")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "View all 30 cases in full screen" }));
    await waitFor(() => expect(mocks.requestDisplayMode).toHaveBeenCalledWith({ mode: "fullscreen" }));
  });
  it("paginates with a neutral caption when full screen is not offered", async () => {
    mocks.host = { ...mocks.host, availableDisplayModes: ["inline"] };
    mount(insetRoot());
    await saved();
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(screen.getByText("Showing 1–2 of 30 cases")).toBeInTheDocument();
    expect(screen.getByText("Fullscreen is not available in this host.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^View all/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("Showing 3–4 of 30 cases")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.requestDisplayMode).not.toHaveBeenCalled();
    expect(Number(document.querySelector<HTMLElement>(".eval-gen")!.dataset.inlineHeight)).toBeLessThanOrEqual(452);
  });
  it("paginates after the host refuses full screen", async () => {
    mocks.requestDisplayMode.mockResolvedValue({ mode: "inline" });
    mount(insetRoot());
    await saved();
    fireEvent.click(screen.getByRole("button", { name: "View all 30 cases in full screen" }));
    expect(await screen.findByText("Fullscreen is not available in this host.")).toBeInTheDocument();
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(screen.getByText("Showing 1–2 of 30 cases")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("shows every case in full screen", async () => {
    mocks.host = { displayMode: "fullscreen", containerDimensions: { width: 760, maxHeight: 500 } };
    mount();
    await saved();
    expect(rows()).toHaveLength(30);
    expect(screen.queryByText(/^Showing /)).not.toBeInTheDocument();
    expect(css()).not.toMatch(/\.eval-gen-table \{[^}]*(max-height|overflow: auto)/);
  });
  it("relies on the host close control in full screen and never requests a display mode by itself", async () => {
    mocks.host = { displayMode: "fullscreen", containerDimensions: { width: 760, maxHeight: 500 } };
    const root = insetRoot();
    const view = mount(root);
    await saved();
    expect(rows()).toHaveLength(30);
    expect(screen.queryByRole("button", { name: /exit full ?screen/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open fullscreen" })).not.toBeInTheDocument();
    // The host close control ends full screen. The view shows its inline preview without a display request.
    mocks.host = { displayMode: "inline", containerDimensions: { width: 760, maxHeight: 500 } };
    view.rerender(<FluentProvider theme={webLightTheme}><GeneratedEvaluationsApp /></FluentProvider>);
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(screen.getByText("Showing 3 of 30 cases")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open fullscreen" })).toBeInTheDocument();
    expect(document.querySelector(".eval-gen")).toHaveClass("is-inline");
    expect(mocks.requestDisplayMode).not.toHaveBeenCalled();
  });
});

describe("Generated evaluations fixed boxes (D7)", () => {
  it("keeps both boxes at three lines in display and edit states, without the set row", async () => {
    mount();
    await saved();
    expect(screen.queryByText("Saved to Copilot Studio")).not.toBeInTheDocument();
    expect(document.querySelectorAll('.eval-gen-cell-text[data-fixed-lines="3"]')).toHaveLength(4);
    document.querySelectorAll<HTMLElement>(".eval-gen-cell").forEach(cell => expect(cell.style.height).toBe("73px"));
    fireEvent.click(screen.getByRole("button", { name: "Edit expected response 1" }));
    const box = screen.getByRole("textbox", { name: "expected response 1" });
    expect(box).toHaveAttribute("rows", "3");
    expect(box).toHaveAttribute("data-fixed-lines", "3");
    expect(box.style.resize).toBe("none");
    expect(box.parentElement?.style.height).toBe("73px");
    expect(box.parentElement?.style.paddingBottom).toBe("7px");
    const text = css();
    expect(text).not.toMatch(/\.eval-gen-set/);
    expect(text).toMatch(/\.eval-gen-cell-text \{[^}]*overflow-y: hidden/);
    // Hover and focus also remove the at-rest line clamp, so the full text can scroll in the same box.
    expect(text).toMatch(/\.eval-gen-cell:hover \.eval-gen-cell-text[^{]*\{ display: block; -webkit-line-clamp: none; overflow-y: auto; \}/);
    expect(text).toMatch(/\.eval-gen-textarea:hover > textarea[^{]*\{ overflow-y: auto; \}/);
  });
});

describe("Generated evaluations three-line clip (F4)", () => {
  const rule = (selector: string): Record<string, string> => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`).exec(css());
    if (!match) throw new Error(`No CSS rule for ${selector}`);
    return Object.fromEntries(match[1].split(";").map(item => item.trim()).filter(Boolean)
      .map(item => [item.slice(0, item.indexOf(":")).trim(), item.slice(item.indexOf(":") + 1).trim()]));
  };
  const px = (value: string) => value === "0" ? 0 : Number(/^(\d+(?:\.\d+)?)px$/.exec(value)?.[1] ?? Number.NaN);
  const sides = (shorthand: string) => {
    const [top, right = top, bottom = top] = shorthand.split(/\s+/).map(px);
    return { top, right, bottom };
  };

  it("clips each read-only box at the end of line 3 and clamps longer text with an ellipsis at rest", () => {
    const cell = rule(".eval-gen-cell");
    const text = rule(".eval-gen-cell-text");
    const border = px(cell.border.split(/\s+/)[0]);
    const clipHeight = px(cell.height) - 2 * border - sides(cell.padding).top - sides(cell.padding).bottom;
    expect(px(cell.height)).toBe(73);
    expect(sides(text.padding).bottom).toBe(0);
    expect(clipHeight).toBe(sides(text.padding).top + 3 * px(text["line-height"]));
    expect(text["overflow-y"]).toBe("hidden");
    expect(text.display).toBe("-webkit-box");
    expect(text["-webkit-box-orient"]).toBe("vertical");
    expect(text["-webkit-line-clamp"]).toBe("3");
  });

  it("clips the edit box at the end of line 3 with the same outer height", () => {
    const wrapper = rule(".eval-gen .eval-gen-textarea");
    const textarea = rule(".eval-gen .eval-gen-textarea > textarea");
    const fluentBorder = 1;
    const clipHeight = px(wrapper.height) - 2 * fluentBorder - px(wrapper["padding-bottom"]);
    expect(px(wrapper.height)).toBe(73);
    expect(sides(textarea.padding).bottom).toBe(0);
    expect(clipHeight).toBe(sides(textarea.padding).top + 3 * px(textarea["line-height"]));
  });
});

describe("Generated evaluations save once per draft (D8)", () => {
  it("uses the draft id as the request id on every mount and never reads the save back", async () => {
    const uuid = vi.spyOn(crypto, "randomUUID");
    const first = mount();
    await saved();
    first.unmount();
    mount();
    await saved();
    const creates = requests().filter(request => request.name === "create_agent_evaluation_set");
    expect(creates).toHaveLength(2);
    creates.forEach(request => expect(request.arguments?.requestId).toBe(draft.id));
    expect(creates[0].arguments?.name).toBe(generatedSetName(draft));
    expect(generatedSetName(draft)).toMatch(/^Exact agent . generated evals . 2026-10-14$/);
    expect(requests().some(request => request.name === "get_agent_evaluation_save")).toBe(false);
    expect(uuid).not.toHaveBeenCalled();
    uuid.mockRestore();
  });
  it("waits for Retry after a failed save, creates once per click, and shows the note only after a verified save", async () => {
    mocks.call.mockRejectedValueOnce(new Error("Network down"));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Retry saves to the same set. It does not create another set.");
    expect(screen.getByRole("button", { name: "Open in Copilot Studio" })).toBeDisabled();
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(mocks.call).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await saved();
    expect(mocks.call).toHaveBeenCalledTimes(2);
    expect(requests()[1]).toMatchObject({ name: "create_agent_evaluation_set", arguments: { requestId: draft.id } });
    expect(requests().some(request => request.name === "get_agent_evaluation_save")).toBe(false);
    expect(screen.getByText(NOTE)).toBeInTheDocument();
  });
  it("checks an unconfirmed save on Retry instead of creating another set", async () => {
    mocks.call.mockImplementation(async (request: Request) => ({ content: [], structuredContent: { state: "save",
      receipt: request.name === "create_agent_evaluation_set" ? { ...receipt(draft.id, 2), state: "unconfirmed", verified: false, message: "Use Check existing set." } : receipt(draft.id, 2) } }));
    mount();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The save could not be confirmed. Retry checks the saved set. It does not create another set.");
    expect(alert).not.toHaveTextContent("Check existing set");
    expect(screen.getByRole("button", { name: "Open in Copilot Studio" })).toBeDisabled();
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await saved();
    expect(requests().filter(request => request.name === "create_agent_evaluation_set")).toHaveLength(1);
    const gets = requests().filter(request => request.name === "get_agent_evaluation_save");
    expect(gets).toHaveLength(1);
    expect(gets[0].arguments).toEqual({ draftId: draft.id, requestId: draft.id, saveGrant: "test-grant-with-at-least-thirty-two-characters" });
  });
  it("names a probable sign-in expiry when an edit fails, without an automatic retry", async () => {
    mount();
    await saved();
    mocks.call.mockRejectedValueOnce(new Error("MCP error -32000: The MCP App operation failed."));
    fireEvent.click(screen.getByRole("button", { name: "Edit expected response 1" }));
    const box = screen.getByRole("textbox", { name: "expected response 1" });
    fireEvent.change(box, { target: { value: "Reviewed expectation" } });
    fireEvent.blur(box);
    expect(await screen.findByRole("alert")).toHaveTextContent("The change was not saved. Your sign-in may have expired. The saved set did not change. You can edit the set in Copilot Studio.");
    expect(screen.getByText(/Not saved . sign-in may have expired/)).toBeInTheDocument();
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(mocks.call).toHaveBeenCalledTimes(2);
  });
});

describe("Generated evaluations existing set (E5)", () => {
  const grant = "test-grant-with-at-least-thirty-two-characters";
  const existingDraft: EvaluationDraft = { ...draft, cases: draft.cases.map(item => ({
    id: item.id, question: item.question, outcome: "unknown" as const, path: [], pathKey: "",
    provenance: { conversationId: "", transcriptId: "", userTurnIds: [], activityIds: [] },
    turns: item.turns.map(turn => ({ ...turn, observedResponse: "", userTurnId: "", assistantTurnIds: [] })),
  })) };
  beforeEach(() => {
    mocks.data = { state: "generated", draft: existingDraft, studioUrl, receipt: receipt(draft.id, 2),
      existingSet: { setId: "set-a", name: generatedSetName(draft), createdOn: "2026-10-14T08:00:00Z" } };
  });
  it("shows the saved set with a saved-set subtitle and makes no create or check call", async () => {
    mount();
    await saved();
    expect(screen.getByText("2 saved test cases for Exact agent.")).toBeInTheDocument();
    expect(screen.getAllByText("Saved in Copilot Studio")).toHaveLength(2);
    expect(screen.queryAllByText(/recorded (step|answer)/)).toHaveLength(0);
    expect(screen.getByText(NOTE)).toBeInTheDocument();
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(mocks.call).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Open in Copilot Studio" }));
    await waitFor(() => expect(mocks.openLink).toHaveBeenCalledWith({ url: studioUrl }));
  });
  it("updates the saved set on an inline edit and a delete with the opened draft ID and grant", async () => {
    mount();
    await saved();
    fireEvent.click(screen.getByRole("button", { name: "Edit expected response 1" }));
    const box = screen.getByRole("textbox", { name: "expected response 1" });
    fireEvent.change(box, { target: { value: "Reviewed expectation" } });
    fireEvent.blur(box);
    await screen.findByText("Edited · saved");
    fireEvent.click(screen.getAllByRole("button", { name: "Delete from set" })[1]);
    await waitFor(() => expect(screen.queryByText("Recorded question b")).not.toBeInTheDocument());
    expect(requests().map(request => request.name)).toEqual(["update_agent_evaluation_case", "update_agent_evaluation_case"]);
    expect(requests()[0].arguments).toMatchObject({ draftId: draft.id, requestId: draft.id, saveGrant: grant, caseId: "case-a", question: "Recorded question a", expectedResponse: "Reviewed expectation" });
    expect(requests()[1].arguments).toMatchObject({ draftId: draft.id, requestId: draft.id, saveGrant: grant, caseId: "case-b", remove: true });
    expect(screen.getByText("1 saved test case for Exact agent.")).toBeInTheDocument();
  });
});

describe("Generated evaluations demo pacing", () => {
  const savedResult = { state: "generated", selectionId: "demo-eval", draft, studioUrl, sampledConversations: 4, receipt: receipt(draft.id, 2) };
  const app = () => <FluentProvider theme={webLightTheme}><GeneratedEvaluationsApp /></FluentProvider>;
  const table = () => screen.queryByRole("table", { name: "Generated evaluation cases" });
  const expectLoader = () => {
    expect(screen.getByRole("status")).toHaveTextContent("Generating evals based on available transcripts");
    expect(screen.getByText("Copilot Agent Kit · evaluation cases from saved conversations")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open in Copilot Studio" })).not.toBeInTheDocument();
    expect(table()).not.toBeInTheDocument();
  };
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.useFakeTimers();
    mocks.host = { displayMode: "inline", containerDimensions: { width: 760, maxHeight: 600 } };
    mocks.data = { ...savedResult, simulatedProgress: { stepMs: 2_000 } };
  });
  afterEach(() => vi.useRealTimers());

  it("shows the same generating loader for three steps, then the saved cases, without a tool call or a save", () => {
    mount(insetRoot());
    expectLoader();
    const main = document.querySelector<HTMLElement>(".eval-gen")!;
    const skeletons = loaderSkeletonCount(552);
    expect(document.querySelectorAll(".eval-gen-skeleton > div")).toHaveLength(skeletons);
    expect(Number(main.dataset.inlineHeight)).toBe(GENERATED_LAYOUT.loaderBase + skeletons * GENERATED_LAYOUT.skeleton);
    expect(Number(main.dataset.inlineHeight)).toBeLessThanOrEqual(552);
    act(() => { vi.advanceTimersByTime(5_999); });
    expectLoader();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(table()).toBeInTheDocument();
    expect(screen.getByText("2 test cases from 4 recent saved conversations of Exact agent.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open in Copilot Studio" })).toBeEnabled();
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(mocks.call).not.toHaveBeenCalled();
    expect(mocks.replaceData).not.toHaveBeenCalled();
  });

  it("plays once per result: not again after a display-mode change or in a new frame", () => {
    const view = mount();
    act(() => { vi.advanceTimersByTime(2_000); });
    mocks.host = { displayMode: "fullscreen", containerDimensions: { width: 760, maxHeight: 600 } };
    view.rerender(app());
    expectLoader();
    act(() => { vi.advanceTimersByTime(4_000); });
    expect(table()).toBeInTheDocument();
    mocks.host = { displayMode: "inline", containerDimensions: { width: 760, maxHeight: 600 } };
    view.rerender(app());
    expect(table()).toBeInTheDocument();
    view.unmount();
    const again = mount();
    expect(table()).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    again.unmount();
    mocks.data = { ...savedResult, selectionId: "demo-eval-next", simulatedProgress: true };
    mount();
    expectLoader();
    expect(mocks.call).not.toHaveBeenCalled();
  });

  it("shows a result error at once and plays nothing without a valid flag", () => {
    mocks.data = { state: "error", error: { message: "No agent was named." }, simulatedProgress: true };
    const failed = mount();
    expect(screen.getByRole("alert")).toHaveTextContent("No agent was named.");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    failed.unmount();
    mocks.data = { ...savedResult, simulatedProgress: false };
    mount();
    expect(table()).toBeInTheDocument();
    expect(mocks.call).not.toHaveBeenCalled();
  });
});