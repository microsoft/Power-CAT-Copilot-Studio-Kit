/**
 * Constants for AI evaluation in the pipeline.
 */
/** AI Builder model IDs (same as shipped with Copilot Studio Kit solution) */
export const AI_MODEL_IDS = {
    STAGE_B_PATTERN_EVAL: '62476684-f62f-4359-911b-c2b5d5256595',
    STAGE_C_COMPLIANCE: '42b1b48f-6718-4d86-b71c-bf551ad9acaf',
};
/** All 15 compliance criteria (id + severity only — for scoring) */
export const COMPLIANCE_CRITERIA = [
    { id: 'scope-definition', inherentSeverity: 'High' },
    { id: 'out-of-scope-handling', inherentSeverity: 'Medium' },
    { id: 'persona-and-tone', inherentSeverity: 'Low' },
    { id: 'privacy-and-sensitive-data', inherentSeverity: 'High' },
    { id: 'fallback-when-uncertain', inherentSeverity: 'High' },
    { id: 'citations-and-sources', inherentSeverity: 'Medium' },
    { id: 'formatting-guidelines', inherentSeverity: 'Low' },
    { id: 'clarifying-questions', inherentSeverity: 'Medium' },
    { id: 'prompt-injection-resilience', inherentSeverity: 'High' },
    { id: 'link-safety', inherentSeverity: 'Medium' },
    { id: 'advice-disclaimers', inherentSeverity: 'High' },
    { id: 'accuracy-quality', inherentSeverity: 'High' },
    { id: 'tool-routing-hints', inherentSeverity: 'Medium' },
    { id: 'escalation-guidance', inherentSeverity: 'High' },
    { id: 'deterministic-language', inherentSeverity: 'Medium' },
];
/** Points per severity level */
export const SEVERITY_POINTS = {
    High: 3,
    Medium: 2,
    Low: 1,
};
/** Maximum instruction score (7×3 + 6×2 + 2×1 = 35) */
export const MAX_INSTRUCTION_POINTS = COMPLIANCE_CRITERIA.reduce((sum, c) => sum + SEVERITY_POINTS[c.inherentSeverity], 0);
/** Default quality gate threshold */
export const DEFAULT_THRESHOLD = 60;
