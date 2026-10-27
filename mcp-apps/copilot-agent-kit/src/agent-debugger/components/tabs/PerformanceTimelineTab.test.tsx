import "@testing-library/jest-dom/vitest";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { ProcessedTranscript } from "../../contracts/transcript";
import { PerformanceTimelineTab, type PerformanceTimelineTabProps } from "./PerformanceTimelineTab";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Single-session turns, each with one timed tool step on its reply. */
function transcript(count: number): ProcessedTranscript {
  const at = (n: number, second: number) => `2026-10-07T10:${String(n).padStart(2, "0")}:0${second}.000Z`;
  return {
    generalInfo: { durationMs: count * 60_000, turnCount: count },
    raw: { activities: [] },
    turns: Array.from({ length: count }, (_, index) => index + 1).flatMap(n => [
      { id: `user-${n}`, role: "user" as const, content: `Question ${n}`, timestamp: at(n, 0), activities: [{ type: "session", mergedSessionKey: "one" }] },
      { id: `assistant-${n}`, role: "assistant" as const, content: `Answer ${n}`, timestamp: at(n, 1), activities: [{ type: "session", mergedSessionKey: "one" }], debugInfo: { stepExecutions: [{ stepId: `step-${n}`, taskDialogId: "agent.action.tool", subtitle: "Tool", state: "Completed", triggeredAt: at(n, 0), finishedAt: at(n, 1) }] } },
    ]),
  };
}

function renderTimeline(props: Partial<PerformanceTimelineTabProps> = {}) {
  return render(<FluentProvider theme={webLightTheme}><PerformanceTimelineTab transcript={transcript(7)} {...props} /></FluentProvider>);
}

function collectScrolledElements() {
  const scrolled: Element[] = [];
  vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (this: Element) { scrolled.push(this); });
  return scrolled;
}

const turnItems = () => document.querySelectorAll('[role="treeitem"][data-tv^="t"]');
const stepRows = () => document.querySelectorAll(".w-ti.step[data-entry]");

it("shows every turn expanded with its step rows, the legend and the slowest step", () => {
  renderTimeline();
  expect(screen.getByRole("tree", { name: "Performance timeline" })).toBeInTheDocument();
  expect(turnItems()).toHaveLength(7);
  turnItems().forEach(turn => expect(turn).toHaveAttribute("aria-expanded", "true"));
  expect(stepRows()).toHaveLength(7);
  expect(screen.getByLabelText("Component colour key")).toBeInTheDocument();
  expect(document.querySelector(".w-slowest")).toHaveTextContent("Slowest step —");
  expect(screen.getByRole("button", { name: "Go to slowest step" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Collapse all" })).toBeInTheDocument();
  expect(screen.queryByRole("list", { name: "Performance timeline" })).toBeNull();
  expect(screen.queryByText(/^Showing \d/)).toBeNull();
});

it("collapses and expands every turn", async () => {
  const user = userEvent.setup();
  renderTimeline();
  await user.click(screen.getByRole("button", { name: "Collapse all" }));
  turnItems().forEach(turn => expect(turn).toHaveAttribute("aria-expanded", "false"));
  expect(stepRows()).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: "Expand all" }));
  turnItems().forEach(turn => expect(turn).toHaveAttribute("aria-expanded", "true"));
  expect(stepRows()).toHaveLength(7);
});

it("selects, expands and scrolls to a focused turn by its message ID in the full timeline", async () => {
  const scrolled = collectScrolledElements();
  const onFocusHandled = vi.fn();
  renderTimeline({ focusTurn: { messageId: "user-6", turnNumber: 2 }, onFocusHandled });
  await waitFor(() => expect(onFocusHandled).toHaveBeenCalledTimes(1));
  const turn = document.querySelector('[data-tv="t6"]');
  expect(scrolled).toContain(turn);
  expect(turn).toHaveClass("sel");
  expect(turn).toHaveAttribute("aria-expanded", "true");
  expect(document.querySelector('[data-tv="t2"]')).not.toHaveClass("sel");
  expect(document.querySelector('[data-tv="t1"]')).not.toHaveClass("sel");
});

it("reports an unknown focused turn as handled without scrolling", () => {
  const scrolled = collectScrolledElements();
  const onFocusHandled = vi.fn();
  renderTimeline({ focusTurn: { messageId: "missing", turnNumber: 99 }, onFocusHandled });
  expect(onFocusHandled).toHaveBeenCalledTimes(1);
  expect(scrolled).toHaveLength(0);
  expect(document.querySelector('[data-tv="t1"]')).toHaveClass("sel");
});

it("names the turn actions, so the icon-only actions of a narrow row keep their names", async () => {
  const user = userEvent.setup();
  const onTurnNavigate = vi.fn();
  renderTimeline({ onTurnNavigate });
  const toolbar = screen.getByRole("toolbar", { name: "Turn 2 actions" });
  const flow = within(toolbar).getByRole("button", { name: "Execution flow" });
  const conversation = within(toolbar).getByRole("button", { name: "Conversation" });
  // overrides.css hides only these labels in a narrow turn row.
  expect(flow.querySelector(".w-act-label")).toHaveTextContent("Execution flow");
  expect(conversation.querySelector(".w-act-label")).toHaveTextContent("Conversation");
  await user.click(conversation);
  expect(onTurnNavigate).toHaveBeenCalledWith("conversation", "user-2");
});
