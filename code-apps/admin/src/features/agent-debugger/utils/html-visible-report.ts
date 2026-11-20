import type { AnalysisReport, AnalysisReportContentBlock, AnalysisReportStep } from "../contracts/analysis-report";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function payloadBlocks(value: unknown): AnalysisReportContentBlock[] {
  if (Array.isArray(value)) return value.flatMap(payloadBlocks);
  if (!record(value)) return [];
  const payload = record(value.value) ? value.value : value;
  const pairs: Array<[string, unknown]> = [
    ["Inputs", payload.arguments ?? payload.filledParameters],
    ["Additional inputs", payload.hiddenFilledParameters],
    ["Outputs", payload.observation ?? payload.result],
    ["Error", payload.errorMessage ?? payload.error],
    ["Error code", payload.errorCode],
    ["Blocked", payload.blockedError],
  ];
  return pairs.flatMap(([label, item]): AnalysisReportContentBlock[] => item === undefined ? [] : [
    { kind: "heading", text: label },
    { kind: "code", text: typeof item === "string" ? item : JSON.stringify(item, null, 2) },
  ]);
}

function visibleStep(step: AnalysisReportStep): AnalysisReportStep {
  const blocks: AnalysisReportContentBlock[] = [];
  const payloads: AnalysisReportContentBlock[] = [];
  const seen = new Set<string>();
  for (const block of step.blocks) {
    if (!block.exportProvenance) {
      blocks.push(block);
      continue;
    }
    if (block.kind !== "code") continue;
    // Only explicitly tagged exporter groups are parsed; captured headings stay inert.
    const payload: unknown = JSON.parse(block.text);
    const captured = payloadBlocks(payload);
    for (let index = 0; index < captured.length; index += 2) {
      const pair = captured.slice(index, index + 2);
      const key = JSON.stringify(pair);
      if (seen.has(key)) continue;
      seen.add(key);
      payloads.push(...pair);
    }
  }
  // Captured payloads replace the readable copy, but keep the leading step metadata.
  const metadataEnd = blocks.findIndex(block => block.kind !== "fields");
  return { heading: step.heading, category: step.category,
    blocks: payloads.length ? [...blocks.slice(0, metadataEnd < 0 ? blocks.length : metadataEnd), ...payloads] : blocks };
}

/** Projects only the approved sections from the complete captured evidence. */
export function visibleHtmlSections(report: AnalysisReport): AnalysisReport["sections"] {
  return report.sections.flatMap((section, sectionIndex) => {
    if (["Conversation summary", "Sessions"].includes(section.heading)) return [section];
    if (!section.blocks.some(block => block.kind === "exchange")) return [];
    const next = report.sections[sectionIndex + 1];
    const expected = section.heading.replace(/Tool call trace$/, "Recorded diagnostics and availability");
    const messages: Array<{ id: string; role: unknown; timestamp: unknown; details: AnalysisReportContentBlock[] }> = [];
    for (const code of next?.heading === expected ? next.blocks : []) {
      if (code.kind !== "code" || code.exportProvenance !== "message") continue;
      const value: unknown = JSON.parse(code.text);
      if (!record(value) || typeof value.id !== "string") continue;
      const details: AnalysisReportContentBlock[] = [];
      for (const key of ["attachments", "feedback", "feedbackEvents", "userAction"]) {
        const item = value[key];
        if (item === undefined || item === null || Array.isArray(item) && !item.length) continue;
        details.push({ kind: "heading", text: key === "attachments" ? "Attachments" : key === "userAction" ? "User action" : "Feedback" },
          { kind: "code", text: typeof item === "string" ? item : JSON.stringify(item, null, 2) });
      }
      messages.push({ id: value.id, role: value.role, timestamp: value.timestamp, details });
    }
    const exchanges = section.blocks.filter(block => block.kind === "exchange").map(block => ({
      ...block, steps: block.steps.map(visibleStep),
      messageDetails: block.messages?.flatMap(message => {
        const index = messages.findIndex(captured => captured.id === message.id &&
          captured.role === message.role && captured.timestamp === message.timestamp);
        return index < 0 ? [] : messages.splice(index, 1)[0].details;
      }),
    }));
    if (!exchanges.length) return [];
    return [{ heading: section.heading.replace(/Tool call trace$/, "Conversation & activities"), blocks: exchanges }];
  });
}
