import type { CopilotAiNarrative, GroundedFinding, GroundedSkillFinding } from '../contracts/Findings';

const NARRATIVE_FIELDS = [
  'findingTitle', 'fact', 'whyItMatters', 'makerAction', 'acceptanceCheck', 'suggestedText',
] as const;

/** Test for HTTP(S) links without changing the existing skill-validator contract. */
export function containsUrl(text: string): boolean {
  return /https?:\/\/[^\s"')<>\]]+/i.test(text);
}

/** Read optional advice independently of the finding's validated evidence and verdict. */
export function readCopilotAiNarrative(value: unknown): CopilotAiNarrative | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const narrative: CopilotAiNarrative = {};
  for (const field of NARRATIVE_FIELDS) {
    const text = record[field];
    if (text === undefined || text === null) continue;
    if (typeof text !== 'string' || containsUrl(text)) {
      console.warn('[CopilotReview] Invalid AI advice was discarded. The finding and registered text are retained.');
      return undefined;
    }
    if (text.trim() || field === 'suggestedText') narrative[field] = text.trim();
  }
  return Object.keys(narrative).length ? narrative : undefined;
}

/** Read INS-02..06 display metadata without treating the canonical fact as AI prose. */
export function readInstructionFindingNarrative(finding: GroundedFinding | GroundedSkillFinding): {
  provided: boolean;
  narrative?: CopilotAiNarrative;
} {
  if (!finding.ai || finding.family !== 'Instructions' || finding.severity === 'info'
    || !/^INS-0[2-6]$/.test(finding.id.split(':')[0])) return { provided: false };
  const raw: CopilotAiNarrative = {
    findingTitle: finding.findingTitle, fact: finding.findingFact,
    whyItMatters: finding.whyItMatters, makerAction: finding.makerAction,
    acceptanceCheck: finding.acceptanceCheck, suggestedText: finding.suggestedText,
  };
  return {
    provided: NARRATIVE_FIELDS.some(field => raw[field] !== undefined),
    narrative: readCopilotAiNarrative(raw),
  };
}
