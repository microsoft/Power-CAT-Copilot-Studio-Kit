import type { AnalysisReport, AnalysisReportInput } from "../contracts/analysis-report";
import type { ProcessedTurn } from "../contracts/transcript";
import { completeHtmlEvidence } from "./html-report-evidence";
import { exchanges, reasoningCallIds, recommendationTranscript } from "./report-privacy";

/** Adds complete safe message evidence for either the parent or an explicitly identified loaded child. */
export function addHtmlMessageEvidence(report: AnalysisReport, turns: ProcessedTurn[], input: AnalysisReportInput, label = ""): void {
  const safeTranscript = recommendationTranscript(input);
  const callsByTurn = new Map(exchanges(turns).flatMap(group => {
    const calls = reasoningCallIds(group, input);
    return group.map(turn => [turn, calls] as const);
  }));
  report.sections.push({ heading: `${label}Recorded diagnostics and availability`, blocks: [
    { kind: "text", text: "Only captured evidence is available. Query availability, tool-call identifiers, HTTP status and explicit event duration are not recorded unless present in ToolCallTrace events. Classic orchestration evidence does not establish ToolCallTrace availability." },
    ...safeTranscript.turns.flatMap((turn, index) => {
      const calls = callsByTurn.get(turns[index]) ?? new Set<string>();
      return [
        { kind: "heading" as const, text: `${label}Recorded message ${index + 1} | ${turn.role} | ${turn.id}` },
        ...completeHtmlEvidence("Recorded message evidence", {
          role: turn.role, id: turn.id, content: turn.content, timestamp: turn.timestamp,
          userAction: turn.userAction, feedback: turn.feedback, feedbackEvents: turn.feedbackEvents,
          attachments: turn.activities.filter(a => a.type === "message").map(a => a.attachments).filter(Boolean),
        }, calls),
        ...completeHtmlEvidence("Recorded diagnostics", turn.activities.filter(a => a.valueType === "ErrorTraceData")
          .map(a => ({ timestamp: a.timestamp, value: a.value })), calls),
      ];
    }),
  ] });
}
