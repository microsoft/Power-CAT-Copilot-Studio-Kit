/**
 * Constants for AI evaluation in the pipeline.
 */
/** AI Builder model IDs (same as shipped with Copilot Studio Kit solution) */
export declare const AI_MODEL_IDS: {
    readonly STAGE_B_PATTERN_EVAL: "62476684-f62f-4359-911b-c2b5d5256595";
    readonly STAGE_C_COMPLIANCE: "42b1b48f-6718-4d86-b71c-bf551ad9acaf";
};
/** Compliance criterion with severity weight */
export interface ComplianceCriterion {
    id: string;
    inherentSeverity: 'High' | 'Medium' | 'Low';
}
/** All 15 compliance criteria (id + severity only — for scoring) */
export declare const COMPLIANCE_CRITERIA: readonly ComplianceCriterion[];
/** Points per severity level */
export declare const SEVERITY_POINTS: Record<'High' | 'Medium' | 'Low', number>;
/** Maximum instruction score (7×3 + 6×2 + 2×1 = 35) */
export declare const MAX_INSTRUCTION_POINTS: number;
/** Default quality gate threshold */
export declare const DEFAULT_THRESHOLD = 60;
