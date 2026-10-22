import "@testing-library/jest-dom/vitest";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { UsageDiagnostics } from "../../contracts/diagnostics";
import { UsageCreditsTab } from "./UsageCreditsTab";

afterEach(cleanup);
const usage: UsageDiagnostics = {
  reported: { tokenRecords: 0, creditRecords: 0, models: [], source: "not-reported" },
  confidence: "none", groups: [], notes: ["Not a billing statement", "No licensing assumptions"],
};

it("shows unavailable metrics rather than zeros when usage is absent", () => {
  render(<FluentProvider theme={webLightTheme}><UsageCreditsTab usage={usage} scope="parent-agent session 2" /></FluentProvider>);
  expect(screen.getByText("Not available", { exact: true })).toBeInTheDocument();
  expect(screen.getByText(/parent-agent session 2/)).toBeInTheDocument();
  expect(screen.getAllByText("Not reported", { exact: true }).length).toBeGreaterThan(4);
  expect(screen.getByText("Diagnostic estimate, not a billing statement.")).toBeInTheDocument();
});

it("keeps explicit reported zeros and separate credit meters visible beside an estimate", () => {
  const next: UsageDiagnostics = {
    ...usage,
    reported: { ...usage.reported, copilotCredits: 0, aiBuilderCredits: 3, totalTokens: 0, creditRecords: 1, tokenRecords: 1, source: "activity-usage" },
    estimatedCredits: 5, confidence: "medium",
    groups: [{ kind: "actions", label: "Completed agent actions", count: 1, rate: 5, credits: 5, confidence: "medium", evidence: "One recorded action" }],
  };
  render(<FluentProvider theme={webLightTheme}><UsageCreditsTab usage={next} scope="all loaded parent-agent sessions" /></FluentProvider>);
  const copilot = screen.getByText("Copilot Credits", { exact: true }).parentElement;
  const aiBuilder = screen.getByText("AI Builder credits", { exact: true }).parentElement;
  expect(copilot).not.toBeNull();
  expect(aiBuilder).not.toBeNull();
  expect(within(copilot!).getByText("0", { exact: true })).toBeInTheDocument();
  expect(within(aiBuilder!).getByText("3", { exact: true })).toBeInTheDocument();
  expect(screen.getByText("1 x 5 = 5")).toBeInTheDocument();
  expect(screen.getByText("Medium confidence")).toBeInTheDocument();
});
