/** Output of the P1 Copilot Instruction Coverage classifier (spec 013, AI JSON mode). */
export interface InstructionCoverageElement {
  key: 'role' | 'tone' | 'boundaries' | 'ambiguity' | 'escalation';
  present: boolean;
  /** Verbatim quote from the instructions when present; '' when absent. */
  evidence: string;
}

export interface InstructionCoverageResult {
  elements: InstructionCoverageElement[];
  citationIds: { id: string }[];
}

/** Valid P1 coverage keys — the exact set required from the AI model. */
export const INSTRUCTION_COVERAGE_KEYS: readonly InstructionCoverageElement['key'][] = [
  'role', 'tone', 'boundaries', 'ambiguity', 'escalation',
] as const;
