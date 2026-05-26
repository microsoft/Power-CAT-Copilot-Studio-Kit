/**
 * Score Calculator — deterministic scoring logic for agent reviews.
 *
 * Ported from CopilotStudioKit/src/features/agent-review-tool/utils/scoreCalculator.ts
 */
import type { PatternEvaluation, InstructionEvaluation } from './predictV2Client.js';
/** Final score result returned in the callback payload */
export interface ScoreResult {
    patternScore: number;
    instructionScore: number;
    overallScore: number;
    passed: boolean;
    threshold: number;
    stageBPatternCount: number;
    stageBPassingCount: number;
    stageCIssueCount: number;
}
/**
 * Calculate pattern score from Stage B output.
 * Formula: (passing / total) × 100
 */
export declare function calculatePatternScore(evaluation?: PatternEvaluation): number;
/**
 * Calculate instruction compliance score from Stage C output.
 * Uses severity-weighted scoring (High=3, Medium=2, Low=1).
 * A criterion passes if no issue ID starts with its prefix.
 */
export declare function calculateInstructionScore(evaluation?: InstructionEvaluation): number;
/**
 * Calculate overall score and determine pass/fail.
 *
 * Formula: (patternScore × 0.5) + (instructionScore × 0.5)
 * If only one stage available, use that score alone.
 */
export declare function calculateScores(stageBResult?: PatternEvaluation, stageCResult?: InstructionEvaluation, threshold?: number): ScoreResult;
