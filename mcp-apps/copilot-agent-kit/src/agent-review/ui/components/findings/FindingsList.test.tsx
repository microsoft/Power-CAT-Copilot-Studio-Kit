import { FluentProvider } from "@fluentui/react-components";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CopilotReviewDisplayPayload } from "../../../core/index.js";
import fixture from "../../fixtures/persisted-review.json";
import { buildReviewViewModel, copilotStudioReviewLightTheme } from "../../index.js";
import { FindingsTab } from "../FindingsTab.js";
import type { FindingView } from "../viewTypes.js";
import { FindingsList, ResultStatus } from "./FindingsList.js";
import { createFindingRowFocus } from "./findingsGroupedModel.js";
import { buildReviewResultRows, EMPTY_FINDINGS_FILTER, filterReviewResultRows } from "./findingsListModel.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function model() {
  return buildReviewViewModel(fixture.agentsExperience as CopilotReviewDisplayPayload, "You", 42000, "Travel Assistant");
}

function results(focusFindingId?: string) {
  const review = model();
  return (
    <FluentProvider theme={copilotStudioReviewLightTheme}>
      <FindingsTab findings={review.findings} checks={review.checks} capabilityChips={review.capabilityChips} focusFindingId={focusFindingId} />
    </FluentProvider>
  );
}

describe("consolidated review results", () => {
  it("uses only recorded check outcomes and retains stable finding locators", () => {
    const review = model();
    const rows = buildReviewResultRows(review.findings, review.checks);
    expect(rows.filter((row) => row.status === "passed")).toHaveLength(51);
    expect(rows.find((row) => row.key === "0")?.finding).toEqual(review.findings[0]);
    const legacy = buildReviewResultRows(review.findings);
    expect(legacy.every((row) => row.finding)).toBe(true);
    expect(legacy.some((row) => row.status === "passed")).toBe(false);
  });

  it("searches evidence, filters real statuses, and sorts without changing scores", () => {
    const review = model();
    const rows = buildReviewResultRows(review.findings, review.checks);
    const original = structuredClone(review.summary);
    const filtered = filterReviewResultRows(rows, { ...EMPTY_FINDINGS_FILTER, status: "passed", order: "title" });
    expect(filtered).toHaveLength(51);
    expect(filtered.map((row) => row.title)).toEqual(filtered.map((row) => row.title).sort((a, b) => a.localeCompare(b)));
    const finding = review.findings[0];
    expect(filterReviewResultRows(rows, { ...EMPTY_FINDINGS_FILTER, query: finding.fact })).toContainEqual(
      expect.objectContaining({ key: "0" }),
    );
    expect(review.summary).toEqual(original);
  });

  it("opens details, moves through the visible results, closes, and restores focus", async () => {
    const user = userEvent.setup();
    render(results());
    const list = screen.getByRole("list", { name: "Review results" });
    const first = within(list).getByRole("button", { name: "More details" });
    await user.click(first);
    expect(screen.getByRole("dialog", { name: "Finding details" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous finding" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Previous finding" })).not.toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next finding" }));
    expect(screen.getByText(/^2 of \d+ results$/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous finding" }));
    await user.click(screen.getByRole("button", { name: "Close finding details" }));
    expect(screen.queryByRole("dialog", { name: "Finding details" })).toBeNull();
    expect(first).toHaveFocus();
  });

  it("honors cross-tab row focus and retains keyboard drawer dismissal", async () => {
    const user = userEvent.setup();
    const rendered = render(results());
    rendered.rerender(results(createFindingRowFocus("0")));
    expect(screen.getByRole("dialog", { name: "Finding details" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Finding details" })).toBeNull();
    expect(screen.queryByRole("searchbox", { name: "Search review results" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Filter by status" })).toBeNull();
  });
});

function detailedFindings(): FindingView[] {
  const original = model().findings[0];
  return ["First", "Second"].map((label) => ({
    ...original,
    id: "DUP-01",
    title: "Retained duplicate claim",
    family: "Topics",
    sev: "warning",
    provenance: "ai-generated",
    ai: true,
    sub: `${label} saved action context`,
    fact: `${label} saved evidence\n  with all whitespace.`,
    why: `${label} saved impact.`,
    fix: `${label} saved recommendation.`,
    how: "Retained model evaluation",
    source: "Microsoft Learn",
    componentIdUnique: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    actionPath: "/beginDialog/actions/2",
    safetyDisposition: "advisory",
    platformOverlap: "unverified",
    dispositionLabel: "Retained advisory label",
    skipAiEvaluation: false,
    fixSteps: [
      { order: 3, action: `${label} original third step` },
      { order: 7, action: `${label} original seventh step` },
    ],
    references: [
      { id: "first-ref", title: "Complete first reference title", url: "https://learn.microsoft.com/retained-first", source: "Microsoft Learn" },
      { id: "second-ref", title: "Complete second reference title", url: "https://owasp.org/retained-second", source: "OWASP" },
    ],
  }));
}

function detailedResults(focusFindingId?: string) {
  return (
    <FluentProvider theme={copilotStudioReviewLightTheme}>
      <FindingsTab findings={detailedFindings()} capabilityChips={[]} focusFindingId={focusFindingId} />
    </FluentProvider>
  );
}

describe("Review Center findings presentation", () => {
  it("keeps original array locators after an exact node filter with duplicate rule IDs", () => {
    const [first, second] = detailedFindings();
    const findings = [
      { ...first, title: "Unmapped finding", componentIdUnique: undefined },
      first,
      { ...first, title: "Other node finding", componentIdUnique: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
      second,
    ];
    render(
      <FluentProvider theme={copilotStudioReviewLightTheme}>
        <FindingsTab findings={findings} capabilityChips={[]} focusFindingId={createFindingRowFocus("3")}
          nodeFilter={{ nodeId: "saved-node", node: {
            id: "saved-node", label: "Exact saved node", category: "topic", subtitle: "",
            componentIdUnique: `{${first.componentIdUnique!.toUpperCase()}}`, details: {}, warnings: [],
          } }} />
      </FluentProvider>,
    );
    const details = screen.getByRole("dialog", { name: "Finding details" });
    expect(within(details).getByRole("region", { name: "What we found" }).querySelector("pre")?.textContent)
      .toBe("Second saved evidence\n  with all whitespace.");
    expect(within(details).getByText("Second original seventh step")).toBeInTheDocument();
    expect(within(details).queryByText("First saved impact.")).toBeNull();
    expect(screen.queryByRole("button", { name: /Other node finding/, hidden: true })).toBeNull();
  });

  it.each([
    ["error", "Fail", true],
    ["warning", "Fail", true],
    ["passed", "Pass", true],
    ["info", "Info", false],
    ["not-applicable", "Not assessed", false],
    ["failed", "Could not run", false],
    ["recorded", "Recorded", false],
  ] as const)("shows %s with the Center verdict without changing the saved status", (status, label, icon) => {
    const { container } = render(
      <FluentProvider theme={copilotStudioReviewLightTheme}><ResultStatus status={status} /></FluentProvider>,
    );
    expect(container.textContent).toBe(label);
    expect(Boolean(container.querySelector("svg"))).toBe(icon);
  });

  it("keeps every original finding as an accordion card with the first card open", () => {
    render(detailedResults());
    const rows = within(screen.getByRole("list", { name: "Review results" })).getAllByRole("button")
      .filter(button => button.hasAttribute("aria-expanded"));
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(within(row).getByText("Retained duplicate claim", { exact: true })).toBeInTheDocument();
      expect(within(row).queryByText("DUP-01", { exact: true })).toBeNull();
      expect(within(row).queryByText("Fail", { exact: true })).toBeNull();
      expect(row).toHaveAccessibleName(/Warning/);
    }
    expect(rows[0]).toHaveAttribute("aria-expanded", "true");
    expect(rows[1]).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText(detailedFindings()[0].fact, { normalizer: value => value })).toBeInTheDocument();
  });

  it("puts the saved issue count in the summary strip", () => {
    render(detailedResults());
    expect(screen.getByLabelText("Review findings summary")).toHaveTextContent("2 issues found.");
  });

  it("shows the exact duplicate's complete recorded fields in Center argument order", () => {
    const original = detailedFindings();
    render(detailedResults(createFindingRowFocus("1")));
    const details = screen.getByRole("dialog", { name: "Finding details", exact: true });
    expect(within(details).getByText("Retained duplicate claim", { exact: true }).parentElement)
      .toBe(within(details).getByText("Fail", { exact: true }).parentElement);
    expect(within(details).getAllByRole("region").map((section) => section.getAttribute("aria-label"))).toEqual([
      "What we found", "Why it matters", "Recommendation", "How to fix", "References (2)", "Saved attribution",
    ]);
    expect(within(details).getByRole("region", { name: "What we found" }).querySelector("pre")?.textContent)
      .toBe(original[1].fact);
    expect(within(details).getByRole("region", { name: "Why it matters" })).toHaveTextContent(original[1].why);
    expect(within(details).getByRole("region", { name: "Recommendation" })).toHaveTextContent(original[1].fix);
    expect(within(details).queryByText(original[0].fact, { normalizer: (value) => value })).toBeNull();
    const steps = within(details).getByRole("region", { name: "How to fix" });
    expect(within(steps).getAllByRole("listitem").map((step) => ({
      order: step.getAttribute("value"), action: step.textContent,
    }))).toEqual(original[1].fixSteps.map((step) => ({ order: String(step.order), action: step.action })));
    expect(within(details).getAllByRole("link").map((link) => link.getAttribute("href")))
      .toEqual(original[1].references.map((reference) => reference.url));
    for (const reference of original[1].references) {
      expect(within(details).getByText(reference.title, { exact: true })).toBeInTheDocument();
      expect(within(details).getByText(reference.url, { exact: true })).toBeInTheDocument();
    }
    for (const value of [
      original[1].sub, original[1].componentIdUnique!, original[1].actionPath!, original[1].how,
      original[1].dimension, original[1].safetyDisposition!, original[1].platformOverlap!, original[1].dispositionLabel!,
    ]) {
      expect(within(details).getByText(value, { exact: true })).toBeInTheDocument();
    }
    expect(within(details).getByText("AI evaluation skipped", { exact: true })).toBeInTheDocument();
    expect(within(details).getByText("No", { exact: true })).toBeInTheDocument();
    expect(within(details).getByText("AI-generated content may be incorrect.", { exact: true })).toBeInTheDocument();
    expect(within(details).queryByText("What this rule checks", { exact: true })).toBeNull();
    expect(within(details).queryByText("Suggested text", { exact: true })).toBeNull();
    expect(within(details).queryByText("How to confirm the fix", { exact: true })).toBeNull();
    expect(within(details).queryByRole("button", { name: /ignore|restore|save|open component/i })).toBeNull();
  });

  it("does not invent detail or reference fields missing from the saved finding", () => {
    const finding: FindingView = {
      ...detailedFindings()[0],
      provenance: "unknown", ai: false, fact: "", why: "", fix: "", sub: "",
      refTitle: "", refUrl: "", fixSteps: [], references: [],
      how: "Detection was not recorded",
      componentIdUnique: undefined, actionPath: undefined, dispositionLabel: undefined,
      safetyDisposition: undefined, platformOverlap: undefined, skipAiEvaluation: undefined,
    };
    render(
      <FluentProvider theme={copilotStudioReviewLightTheme}>
        <FindingsList rows={buildReviewResultRows([finding])} focusFindingId={createFindingRowFocus("0")} />
      </FluentProvider>,
    );
    const details = screen.getByRole("dialog", { name: "Finding details", exact: true });
    expect(within(details).queryAllByRole("region")).toHaveLength(0);
    expect(within(details).queryAllByRole("link")).toHaveLength(0);
    expect(within(details).getByText(finding.how, { exact: true })).toBeInTheDocument();
    expect(within(details).queryByText("AI-generated content may be incorrect.", { exact: true })).toBeNull();
  });

  it("uses the Center end overlay on wide screens without losing modal focus behavior", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 1200, 800));
    render(detailedResults(createFindingRowFocus("1")));
    const details = screen.getByRole("dialog", { name: "Finding details", exact: true });
    expect(details).toHaveAttribute("aria-modal", "true");
    expect(within(details).getByRole("button", { name: "Close finding details" })).toHaveFocus();
    const title = within(details).getByText("Retained duplicate claim", { exact: true });
    expect(title.parentElement).toContainElement(within(details).getByText("Fail", { exact: true }));
  });

  it("keeps filtered Prev and Next focused at boundaries and returns to the exact original row", async () => {
    const user = userEvent.setup();
    const findings = detailedFindings();
    const rows = filterReviewResultRows(buildReviewResultRows(findings), EMPTY_FINDINGS_FILTER);
    const rendered = render(
      <FluentProvider theme={copilotStudioReviewLightTheme}>
        <FindingsList rows={rows} focusFindingId={createFindingRowFocus("0")} />
      </FluentProvider>,
    );
    let details = screen.getByRole("dialog", { name: "Finding details" });
    expect(within(details).getByRole("button", { name: "Previous finding" })).toHaveTextContent("Prev");
    const next = within(details).getByRole("button", { name: "Next finding" });
    expect(next).toHaveTextContent("Next");
    await user.click(next);
    expect(next).toHaveFocus();
    expect(next).toHaveAttribute("aria-disabled", "true");
    expect(next).not.toBeDisabled();
    expect(within(details).getByRole("region", { name: "What we found" }).querySelector("pre")?.textContent)
      .toBe(findings[1].fact);
    rendered.rerender(
      <FluentProvider theme={copilotStudioReviewLightTheme}>
        <FindingsList rows={rows.slice(0, 1)} focusFindingId={createFindingRowFocus("0")} />
      </FluentProvider>,
    );
    expect(screen.queryByRole("dialog", { name: "Finding details" })).toBeNull();
    rendered.rerender(
      <FluentProvider theme={copilotStudioReviewLightTheme}>
        <FindingsList rows={rows} focusFindingId={createFindingRowFocus("0")} />
      </FluentProvider>,
    );
    details = screen.getByRole("dialog", { name: "Finding details" });
    expect(within(details).getByRole("region", { name: "What we found" }).querySelector("pre")?.textContent)
      .toBe(findings[1].fact);
    await user.click(within(details).getByRole("button", { name: "Close finding details" }));
    const list = screen.getByRole("list", { name: "Review results" });
    expect(within(list).getAllByRole("button")[1]).toHaveFocus();
  });
});
