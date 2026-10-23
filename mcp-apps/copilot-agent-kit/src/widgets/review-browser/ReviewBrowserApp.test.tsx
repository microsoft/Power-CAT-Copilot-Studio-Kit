import "@testing-library/jest-dom/vitest";
import { createElement } from "react";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { App, type McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { McpAppProvider } from "../shared/McpAppProvider";
import type { McpBootstrapSnapshot } from "../shared/bootstrap-contract";
import { ReviewBrowserApp } from "./ReviewBrowserApp";

vi.mock("../../agent-review/ui/index.js", () => ({
  CopilotReviewResults: ({ model }: { model: { summary: { agentName: string } } }) =>
    createElement("div", { "data-testid": "review-results" }, model.summary.agentName),
}));

afterEach(() => {
  cleanup();
  delete window.__agentReviewMcpBootstrap;
  sessionStorage.clear();
  document.getElementById("root")?.remove();
  document.documentElement.style.minHeight = "";
  vi.restoreAllMocks();
});

const environment = { id: "env-1", name: "Contoso Dev", region: "unitedstates" };
const rows = Array.from({ length: 45 }, (_, index) => {
  const number = String(index + 1).padStart(2, "0");
  return {
    botId: `bot-${number}`,
    componentIdUnique: `unique-${number}`,
    botName: `Agent ${number}`,
    reviewId: `review-${number}`,
    overallScore: 80,
    totalIssueCount: 2,
    highSeverityCount: 0,
    reviewedOn: "2026-01-15T10:00:00Z",
    status: "completed",
    hasReviewData: true,
    harness: "standard",
  };
});

function inventory(presentation: "inline" | "fullscreen" = "inline") {
  return {
    state: "reviewInventory",
    selectionId: "selection-1",
    environments: [environment],
    environment,
    environmentId: environment.id,
    rows,
    presentation,
  };
}

function frame(padding: number) {
  const root = document.createElement("div");
  root.id = "root";
  root.style.padding = `${padding}px`;
  document.body.appendChild(root);
}

function mount(
  hostPatch: Partial<McpUiHostContext> = {},
  presentation: "inline" | "fullscreen" = "inline",
) {
  const app = new App({ name: "Review Browser UI test", version: "1.0.0" });
  const listeners = new Set<() => void>();
  let snapshot: McpBootstrapSnapshot = {
    app,
    data: inventory(presentation),
    host: {
      theme: "light",
      displayMode: "inline",
      availableDisplayModes: ["inline", "fullscreen"],
      containerDimensions: { width: 760, maxHeight: 500 },
      ...hostPatch,
    },
  };
  const replaceData = (data: unknown) => {
    snapshot = { ...snapshot, data };
    listeners.forEach((listener) => listener());
  };
  window.__agentReviewMcpBootstrap = {
    getSnapshot: () => snapshot,
    replaceData,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
  const call = vi.spyOn(app, "callServerTool").mockImplementation(async (request) => {
    const args = (request.arguments ?? {}) as Record<string, unknown>;
    if (request.name === "get_agent_review_result") {
      return {
        content: [],
        structuredContent: {
          state: "fullReview",
          reviewId: args.reviewId,
          model: { summary: { agentName: "Agent 01" } },
        },
      };
    }
    return { content: [], structuredContent: { ...inventory(), presentation: args.presentation } };
  });
  render(
    <FluentProvider theme={webLightTheme}>
      <McpAppProvider><ReviewBrowserApp /></McpAppProvider>
    </FluentProvider>,
  );
  return { app, call };
}

const inlineRows = () => document.querySelectorAll("[data-review-row]");
const notAvailable = "Fullscreen is not available in this host.";

it("shows a finite inline page that fits the host budget, with pagination and view all", async () => {
  const user = userEvent.setup();
  frame(24);
  const { app, call } = mount();
  const display = vi.spyOn(app, "requestDisplayMode");

  const content = document.querySelector<HTMLElement>("[data-review-inline-content]");
  expect(content?.parentElement?.style.maxHeight).toBe("452px");
  expect(inlineRows()).toHaveLength(4);
  expect(screen.getByText("Showing 1–4 of 45 reviews")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "View all 45 reviews in full screen" })).toBeInTheDocument();
  expect(screen.queryByText(/records per page/)).toBeNull();
  expect(document.documentElement.style.minHeight).toBe("0px");

  await user.click(screen.getByRole("button", { name: "Next page" }));
  expect(screen.getByText("Showing 5–8 of 45 reviews")).toBeInTheDocument();
  expect(inlineRows()).toHaveLength(4);
  expect(display).not.toHaveBeenCalled();
  expect(call).not.toHaveBeenCalled();
});

it("keeps the inline page and shows a neutral caption when full screen is not offered", () => {
  frame(24);
  mount({ availableDisplayModes: ["inline"] });
  expect(screen.getByRole("status")).toHaveTextContent(notAvailable);
  expect(inlineRows().length).toBeGreaterThan(0);
  expect(screen.queryByRole("button", { name: /^View all/ })).toBeNull();
  expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();
  expect(document.querySelector(".fui-MessageBar")).toBeNull();
});

it("stays on the inline page with a neutral caption when view all is refused", async () => {
  const user = userEvent.setup();
  frame(24);
  const { app } = mount();
  const display = vi.spyOn(app, "requestDisplayMode").mockResolvedValue({ mode: "inline" });
  await user.click(screen.getByRole("button", { name: "View all 45 reviews in full screen" }));
  expect(display).toHaveBeenCalledWith({ mode: "fullscreen" });
  await waitFor(() => expect(screen.getByText(notAvailable)).toBeInTheDocument());
  expect(inlineRows().length).toBeGreaterThan(0);
  expect(screen.queryByText(/records per page/)).toBeNull();
  expect(document.querySelector(".fui-MessageBar")).toBeNull();
});

it("keeps the full screen list unchanged", () => {
  mount({ displayMode: "fullscreen", containerDimensions: { width: 1200, height: 900 } }, "fullscreen");
  expect(screen.getByText("Page 1 of 9 (45 total)")).toBeInTheDocument();
  expect(screen.getByText(/records per page/)).toBeInTheDocument();
  expect(inlineRows()).toHaveLength(0);
  expect(screen.queryByRole("button", { name: "Next page" })).toBeNull();
  expect(screen.queryByText(notAvailable)).toBeNull();
});
