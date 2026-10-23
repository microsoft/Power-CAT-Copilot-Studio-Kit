import type { Activity } from "../../contracts/transcript.js";

/**
 * Copilot Studio orchestration engine that produced a transcript.
 *
 * - `classic`   — the original topic/plan orchestration. Emits `DynamicPlan*`
 *   and `DynamicServer*` trace/event activities.
 * - `generative` — the new agent designer's generative orchestration. Emits
 *   `ToolCallTrace(:Started|:Completed|:Failed)`, `ThinkingTrace`, and
 *   `turn.complete` activities instead.
 */
export type OrchestrationEngine = "classic" | "generative";

const CLASSIC_PREFIXES = ["DynamicPlan", "DynamicServer"] as const;

function isGenerativeMarker(key: string): boolean {
  return (
    key === "ThinkingTrace" ||
    key === "turn.complete" ||
    key.startsWith("ToolCallTrace")
  );
}

function isClassicMarker(key: string): boolean {
  return CLASSIC_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/**
 * Detects which orchestration engine produced a transcript by inspecting its
 * activity `name`/`valueType` markers.
 *
 * Classic markers take precedence: a transcript is only treated as
 * `generative` when it carries generative markers AND no classic markers. This
 * keeps mixed or ambiguous transcripts (e.g. message-only conversations) on the
 * classic path, which is a superset that safely renders plain messages.
 */
export function detectOrchestrationEngine(
  activities: readonly Activity[] | undefined
): OrchestrationEngine {
  let sawGenerative = false;
  for (const activity of activities ?? []) {
    const key = activity?.name ?? activity?.valueType ?? "";
    if (!key) continue;
    if (isClassicMarker(key)) return "classic";
    if (isGenerativeMarker(key)) sawGenerative = true;
  }
  return sawGenerative ? "generative" : "classic";
}
