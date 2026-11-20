import { describe, expect, it, vi } from "vitest";
import type { AnalysisReport } from "../contracts/analysis-report";
import { renderAnalysisHtml } from "../services/analysis-html";
import { installOfflinePrinting } from "../offline/print";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OfflineApp } from "../offline/App";
import { visibleHtmlSections } from "./html-visible-report";
import { GeneralPanel } from "../offline/GeneralPanel";
import { reportEvidence } from "./report-evidence";

function report(): AnalysisReport {
  return {
    title: "Agent Debugger analysis", filename: "agent-debugger-example.html",
    sections: [{ heading: "Tool call trace", blocks: [{
      kind: "exchange", heading: "Session 1 | Turn 1", steps: [
        { category: "prompt", heading: "User prompt", blocks: [{ kind: "markdown", text: "**Recorded prompt**" }] },
        { category: "reasoning", heading: "Reasoning", blocks: [
          { kind: "fields", fields: [{ label: "Status", value: "Completed" }] },
        ] },
        { category: "skill", heading: "Built-in skill", blocks: [] },
        { category: "tool", heading: "Lookup | Tool", blocks: [
          { kind: "fields", fields: [{ label: "Duration", value: "0 ms" }] },
          { kind: "heading", text: "Input passed to tool" },
          { kind: "fields", fields: [{ label: "query", value: "SELECT sample\nWHERE flag = false" }] },
          { kind: "heading", text: "Result returned" },
          { kind: "table", columns: ["Name", "Value"], rows: [["Recorded row", "false"]] },
        ] },
        { category: "response", heading: "Agent response", blocks: [
          { kind: "markdown", text: "### Final answer\n- **Complete**\n\n| Item | Count |\n|---|---|\n| Sample | 42 |" },
        ] },
      ],
    }] }],
  };
}

describe("offline Agent Debugger HTML report", () => {
  it("renders the real tab, conversation and workflow components from embedded typed props", () => {
    const snapshot = {
      identity: { agentName: "HEADER-AGENT-NAME", conversationId: "HEADER-CONVERSATION-ID" },
      transcriptData: { activities: [{ id: "message-0", type: "message" as const, timestamp: "",
        from: { id: "", role: "user" as const }, text: "CAPTURED-PROMPT" }] },
      exchanges: [{ messageId: "message-0", label: "Session 1 | Turn 1", connectedAgents: [],
        turn: { id: "message-0", role: "user" as const, timestamp: "", content: "CAPTURED-PROMPT", activities: [],
          debugInfo: { stepExecutions: [{ stepId: "step", taskDialogId: "test.action.lookup", displayName: "Lookup", state: 1 }] } } }],
      componentNames: {}, messageLabels: { "message-0": "Session 1 | Turn 1" }, turnDurationByMessageId: {},
    };
    const markup = renderToStaticMarkup(createElement(OfflineApp, { snapshot }));
    for (const selector of ["w-msgrow user", "w-turnmark", "w-rnode", "CAPTURED-PROMPT", "Lookup"]) {
      expect(markup).toContain(selector);
    }
    expect(markup).toContain('data-message-id="message-0"');
    expect(markup).toContain('role="region" aria-label="Activities"');
    expect(markup).not.toContain('data-exchange');
    expect(markup).toContain("HEADER-AGENT-NAME");
    expect(markup).toContain("HEADER-CONVERSATION-ID");
    expect(markup).not.toContain("Print / Save as PDF");
    expect(markup).not.toContain('id="print-report"');
  });

  it("includes each original message identity, timing and citation tail in print and no-script evidence", () => {
    const data = report();
    const exchange = data.sections[0].blocks[0];
    if (exchange.kind !== "exchange") throw new Error("Missing exchange");
    exchange.messages = [
      { role: "assistant", id: "individual-answer-a", timestamp: "2026-11-05T10:00:00Z",
        text: 'Readable answer\n[1]: cite:1 "UNIQUE-CITATION-TITLE"' },
      { role: "assistant", id: "individual-answer-b", timestamp: "2026-11-05T10:00:01Z",
        text: "Title: ORIGINAL-ENVELOPE\nReferenceId: original-reference\nFINAL-MESSAGE-TAIL" },
    ];
    const html = renderAnalysisHtml(data);
    for (const text of [/<template id="complete-evidence">([\s\S]*?)<\/template>/.exec(html)?.[1] ?? "",
      /<noscript>([\s\S]*?)<\/noscript>/.exec(html)?.[1] ?? ""]) {
      for (const marker of ["individual-answer-a", "individual-answer-b", "UNIQUE-CITATION-TITLE",
        "2026-11-05T10:00:00Z", "2026-11-05T10:00:01Z", "ORIGINAL-ENVELOPE", "original-reference", "FINAL-MESSAGE-TAIL"]) {
        expect(text).toContain(marker);
      }
    }
  });

  it.each([false, true])("renders recorded reasoning with the shared inline Markdown without making the row a button; recorded=%s", recorded => {
    const text = "**RECORDED-STATEMENT**\n- Check the recorded result\n<script>globalThis.__reasoningProbe = true</script>";
    const markup = renderToStaticMarkup(createElement(OfflineApp, { snapshot: {
      transcriptData: { activities: [] }, componentNames: {}, messageLabels: {}, turnDurationByMessageId: {},
      exchanges: [{ messageId: "user", label: "Session 1 | Turn 1", connectedAgents: [],
        turn: { id: "user", role: "user", content: "", timestamp: "", activities: [],
          debugInfo: { stepExecutions: [{ stepId: "reason", taskDialogId: "P:ReasonerTool",
            offlineReasoning: { name: "Reasoning", text: recorded ? text : undefined, status: "Completed" } }] } } }],
    } }));
    if (recorded) {
      expect(markup).toContain("<strong>RECORDED-STATEMENT</strong>");
      expect(markup).toContain("<li>Check the recorded result</li>");
      expect(markup).toContain("&lt;script&gt;");
      expect(markup).not.toContain("<script>");
    } else {
      expect(markup).toContain("Completed");
      expect(markup).not.toContain("RECORDED-STATEMENT");
    }
    expect(markup).not.toContain('class="w-rnode');
    expect(markup).not.toContain('title="Reasoning');
  });

  it.each(["link", "table region"] as const)("preserves the focused %s and existing evidence nodes across printing", target => {
    for (const hidden of [true, false]) {
      const callbacks = new Map<string, () => void>();
      const focus = { isConnected: true, hasAttribute: () => false, focus: vi.fn(), target };
      const disclosure = { open: false };
      const openDisclosure = { open: true };
      const replaceChildren = vi.fn(() => { focus.isConnected = false; });
      const all = { childNodes: [{}], hidden, replaceChildren,
        querySelectorAll: () => [disclosure, openDisclosure] };
      const elements: Record<string, unknown> = {
        "viewer-flow": { replaceChildren, querySelectorAll: () => [] },
        "viewer-detail": { replaceChildren, querySelector: () => ({ textContent: "Selected activity" }) }, "all-evidence": all,
        "viewer-status": { textContent: "" },
        "toggle-theme": { setAttribute: vi.fn(), textContent: "" },
      };
      const document = {
        documentElement: { dataset: { theme: "dark" } }, activeElement: focus,
        getElementById: (id: string) => elements[id],
        querySelectorAll: (selector: string) => selector === "details[open]" ? [openDisclosure] : [],
        addEventListener: (name: string, callback: () => void) => callbacks.set(name, callback),
      };
      let dark = true;
      const host = {
        addEventListener: (name: string, callback: () => void) => callbacks.set(name, callback),
        removeEventListener: vi.fn(),
      };
      installOfflinePrinting(document as unknown as Document, host as unknown as Window, {
        get: () => dark,
        set: value => { dark = value; document.documentElement.dataset.theme = value ? "dark" : "light"; },
      });
      callbacks.get("beforeprint")!();
      expect(document.documentElement.dataset.theme).toBe("light");
      expect(all.hidden).toBe(false);
      expect(disclosure.open).toBe(true);
      callbacks.get("afterprint")!();
      expect(replaceChildren).not.toHaveBeenCalled();
      expect(focus.focus).toHaveBeenCalledWith({ preventScroll: true });
      expect(focus.isConnected).toBe(true);
      expect(all.hidden).toBe(hidden);
      expect(disclosure.open).toBe(false);
      expect(openDisclosure.open).toBe(true);
      expect(document.documentElement.dataset.theme).toBe("dark");
    }
  });

  it("embeds the real presentation runtime, static props and complete fallback without a parallel selection script", () => {
    const data = report();
    const before = JSON.stringify(data);
    const html = renderAnalysisHtml(data);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('charset="utf-8"');
    expect(html).toContain("Session 1 | Turn 1");
    for (const label of ["Step 1. User prompt", "Step 2. Reasoning", "Step 3. Built-in skill", "Step 4. Lookup | Tool", "Step 5. Agent response"]) {
      expect(html).toContain(label);
    }
    for (const label of ["Conversation preview", "w-msgrow", "w-rnode", "w-agentgrp", "activity-detail-body", "<template", "<noscript>"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain('id="offline-root"');
    expect(html).toContain('id="offline-data" type="application/json"');
    expect(html).toContain('<meta id="offline-style-insertion-point">');
    expect(html.indexOf('<meta id="offline-style-insertion-point">')).toBeLessThan(html.indexOf("<style>"));
    expect(html).not.toContain('button[data-exchange]');
    expect(html).not.toContain("function selectStep(");
    expect(html).toContain("General");
    expect(html).not.toContain('id="show-all"');
    expect(html).toContain("SELECT sample\nWHERE flag = false");
    expect(html).toContain("Recorded row");
    expect(html).toContain("<strong>Recorded prompt</strong>");
    expect(html).toContain("<strong>Complete</strong>");
    expect(html).toContain("<table");
    expect(JSON.stringify(data)).toBe(before);
  });

  it("treats literal markup, attribute payloads, code and dangerous Markdown links as inert recorded content", () => {
    const data = report();
    const attack = '</style><script>window.EXPORT_INJECTION=true</script><img src="https://invalid.example/probe" onerror="alert(1)">';
    data.title = attack;
    data.sections.push({ heading: attack, blocks: [
      { kind: "code", text: attack },
      { kind: "fields", fields: [{ label: attack, value: attack }] },
      { kind: "markdown", text: `${attack}\n[x](javascript:alert)\n[valid](https://example.com)\n\`\`\`html\n${attack}\n\`\`\`` },
    ] });
    const html = renderAnalysisHtml(data);
    expect(html).not.toContain('<script>window.EXPORT_INJECTION');
    expect(html).not.toContain('<img src="https://invalid.example');
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain("&lt;script&gt;window.EXPORT_INJECTION");
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/<(?:script|link|img|iframe)\b[^>]+(?:src|href)=/i);
  });

  it("preserves long values, Unicode, incomplete evidence and all session boundaries without remote assets", () => {
    const data = report();
    data.sections.push({ heading: "Sessions", blocks: [
      { kind: "heading", text: "Session 2" },
      { kind: "fields", fields: [{ label: "Long recorded value", value: `${"recorded ".repeat(12000)}FINAL-LONG-VALUE` }] },
      { kind: "text", text: "\u0939\u093f\u0902\u0926\u0940 \u65e5\u672c\u8a9e \ud83d\udc4b" },
      { kind: "code", text: '{"content": [ (truncated)' },
    ] });
    const html = renderAnalysisHtml(data);
    expect(html).toContain("FINAL-LONG-VALUE");
    expect(html).toContain("\u0939\u093f\u0902\u0926\u0940 \u65e5\u672c\u8a9e \ud83d\udc4b");
    expect(html).toContain("Session 2");
    expect(html).toContain("(truncated)");
    const markup = html.replace(/(<script\b[^>]*>)[\s\S]*?(<\/script\b[^>]*>)/gi, "$1$2");
    expect(markup).not.toMatch(/@import|<link\b|<(?:script|img)\b[^>]+src=/);
    expect(html).toContain("beforeprint");
    expect(html).toContain("afterprint");
  });

  it("renders two labelled mounted tabpanels without redundant export chrome", () => {
    const markup = renderToStaticMarkup(createElement(OfflineApp, { snapshot: {
      transcriptData: { activities: [] }, exchanges: [], componentNames: {},
      messageLabels: {}, turnDurationByMessageId: {},
      generalSections: [{ heading: "Sessions", blocks: [{ kind: "text", text: "Session details not recorded." }] }],
    } }));
    expect(markup).toContain('id="general-panel" role="tabpanel" aria-labelledby="general-tab"');
    expect(markup).toContain('aria-labelledby="conversation-tab" hidden=""');
    expect(markup).toContain("Session details not recorded.");
    for (const label of ["captured offline analysis", "Only captured data", "Show all evidence", 'role="status"', "toggle-theme", "Use dark theme"]) {
      expect(markup).not.toContain(label);
    }
    expect(renderToStaticMarkup(createElement(GeneralPanel, { sections: undefined }))).toContain("General details were not captured.");
  });

  it("projects orphan and wrapper payloads into ordinary content without raw appendices or mutation", () => {
    const data = report();
    const exchange = data.sections[0].blocks[0];
    if (exchange.kind !== "exchange") throw new Error("Missing exchange");
    const marker = "FULL-PAYLOAD-" + "long ".repeat(1000) + "-TAIL";
    exchange.steps.push({ category: "tool", heading: "Unmatched tool", blocks: [
      { kind: "heading", text: "Unmatched recorded tool events", exportProvenance: "events" },
      { kind: "code", exportProvenance: "events", text: JSON.stringify([{ value: { filledParameters: { wrapper: marker }, result: { flag: false, zero: 0 } } }]) },
    ] });
    const before = JSON.stringify(data);
    const sections = visibleHtmlSections(data);
    expect(sections[0].heading).toBe("Conversation & activities");
    const text = JSON.stringify(sections);
    expect(text).toContain(marker);
    expect(text).toContain('\\"flag\\": false');
    expect(text).not.toContain("Unmatched recorded tool events");
    expect(JSON.stringify(data)).toBe(before);
  });

  it("does not interpret captured appendix-name headings as exporter JSON", () => {
    const data = report();
    const exchange = data.sections[0].blocks[0];
    if (exchange.kind !== "exchange") throw new Error("Missing exchange");
    exchange.steps.push({ category: "tool", heading: "Captured result",
      blocks: reportEvidence({ "Observed tool events": { content: [{ text: "[incomplete JSON" }] } }) });
    expect(() => renderAnalysisHtml(data)).not.toThrow();
    expect(JSON.stringify(visibleHtmlSections(data))).toContain("[incomplete JSON");
  });

  it("renders captured inputs and outputs once while retaining metadata and distinct event evidence", () => {
    const data = report();
    const exchange = data.sections[0].blocks[0];
    if (exchange.kind !== "exchange") throw new Error("Missing exchange");
    exchange.steps = [{ category: "tool", heading: "Lookup", blocks: [
      { kind: "fields", fields: [{ label: "Status", value: "Completed" }] },
      { kind: "heading", text: "Input passed to tool" },
      ...reportEvidence({ query: "UNIQUE-QUERY" }),
      { kind: "heading", text: "Result returned" },
      ...reportEvidence("UNIQUE-RESULT"),
      { kind: "code", exportProvenance: "step", text: JSON.stringify({
        arguments: { query: "UNIQUE-QUERY" }, observation: "UNIQUE-RESULT",
      }) },
      { kind: "code", exportProvenance: "events", text: JSON.stringify([
        { value: { filledParameters: { query: "UNIQUE-QUERY" } } },
        { value: { result: "UNIQUE-RESULT", errorCode: "RECORDED-CODE" } },
        { value: { result: { wrapper: "DISTINCT-RESULT", zero: 0, flag: false } } },
      ]) },
    ] }];
    const projected = JSON.stringify(visibleHtmlSections(data));
    expect(projected.match(/UNIQUE-QUERY/g)).toHaveLength(1);
    expect(projected.match(/UNIQUE-RESULT/g)).toHaveLength(1);
    for (const value of ["Completed", "RECORDED-CODE", "DISTINCT-RESULT", '\\"zero\\": 0', '\\"flag\\": false']) {
      expect(projected).toContain(value);
    }
  });

  it("keeps repeated message evidence scoped to its source occurrence and parent/child section", () => {
    const data = report();
    data.sections = ["", "Child - "].flatMap(prefix => {
      const exchange = (marker: string) => ({
        kind: "exchange" as const, heading: marker, steps: [],
        messages: [{ role: "user" as const, id: "reused-id", timestamp: "same-time", text: marker }],
      });
      const code = (marker: string) => ({ kind: "code" as const, exportProvenance: "message" as const,
        text: JSON.stringify({ id: "reused-id", role: "user", timestamp: "same-time", attachments: [marker] }) });
      return [
        { heading: `${prefix}Tool call trace`, blocks: [exchange(`${prefix}FIRST`), exchange(`${prefix}SECOND`)] },
        { heading: `${prefix}Recorded diagnostics and availability`, blocks: [code(`${prefix}FIRST`), code(`${prefix}SECOND`)] },
      ];
    });
    for (const section of visibleHtmlSections(data)) {
      for (const block of section.blocks) {
        if (block.kind !== "exchange") throw new Error("Missing exchange");
        const details = JSON.stringify(block.messageDetails);
        expect(details).toContain(block.heading);
        expect(details).not.toContain(block.heading.endsWith("FIRST") ? "SECOND" : "FIRST");
      }
    }
  });
});
