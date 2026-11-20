import type { CopilotAiNarrative, GroundedFinding } from './Findings';

/** Output of the P1 Copilot Instruction Coverage classifier (spec 013, AI JSON mode). */
export interface InstructionCoverageElement extends CopilotAiNarrative {
  key: 'role' | 'tone' | 'boundaries' | 'ambiguity' | 'escalation';
  present: boolean;
  /** Verbatim quote from the instructions when present; '' when absent. */
  evidence: string;
  /**
   * Host-derived pass, never model-supplied.
   *
   * The ARC2 nodes return exceptions only, so a rule they judged and did not
   * flag is simply absent from the payload — there is no quote to carry for it.
   * This flag marks an element the host inferred as passing from that absence,
   * so the lenient classifier can keep it without an evidence quote it could
   * only have fabricated. The strict validator rejects the flag outright,
   * because a model claiming its own unevidenced pass is exactly what the
   * grounding check exists to stop.
   */
  inferredPass?: boolean;
}

export interface InstructionCoverageResult {
  elements: InstructionCoverageElement[];
  citationIds: { id: string }[];
  /**
   * Verdicts from the same node that are not coverage elements.
   *
   * The `copilot-instructions` node decides more than the five coverage keys —
   * INS-07 runs there too — but `key` is a closed union and the strict validator
   * requires exactly those five elements, so a sixth key is not available. Those
   * rules therefore leave as findings instead.
   *
   * Optional because only the v4 node path can produce them: the AI Builder
   * prompt fallback returns coverage elements and nothing else, and leaving it
   * undefined is how that path says so.
   */
  findings?: GroundedFinding[];
}

/** Valid P1 coverage keys — the exact set required from the AI model. */
export const INSTRUCTION_COVERAGE_KEYS: readonly InstructionCoverageElement['key'][] = [
  'role', 'tone', 'boundaries', 'ambiguity', 'escalation',
] as const;
