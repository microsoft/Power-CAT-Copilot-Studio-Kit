/**
 * Score presentation and assessed-score utilities.
 *
 * `calculateAssessedScores` reports pattern and instruction sub-scores from the
 * checks that actually ran, keeping an unmeasured bucket as `null` rather than
 * inventing a number. The agent's headline score is produced by the six-pillar
 * composite scorer, not here.
 *
 * Thresholds:
 * - Excellent (≥80): Green #107C10
 * - Good (≥60): Orange #D83B01
 * - Poor (<60): Red #A80000
 */

import type {
  PatternEvaluation,
  InstructionEvaluation,
} from '../contracts/StageOutputs';
import { summarizeInstructionAssessments, summarizePatternAssessments } from './reviewAssessment';

/**
 * Score input for overall calculation
 */
export interface ScoreInput {
  /** Pattern evaluation from Stage B (optional) */
  patternEvaluation?: PatternEvaluation;

  /** Instruction evaluation from Stage C (optional) */
  instructionEvaluation?: InstructionEvaluation;
}

/** Calculate new-review scores from completed applicable checks, retaining absent scores as null. */
export function calculateAssessedScores(input: ScoreInput) {
  const pattern = summarizePatternAssessments(input.patternEvaluation?.Patterns ?? []);
  const instruction = summarizeInstructionAssessments(input.instructionEvaluation);
  const availableScores = [pattern.score, instruction.score].filter((score): score is number => score !== null);
  return {
    patternScore: pattern.score,
    instructionScore: instruction.score,
    overallScore: availableScores.length
      ? Math.round(availableScores.reduce((sum, score) => sum + score, 0) / availableScores.length)
      : null,
    pattern,
    instruction,
  };
}

/**
 * Get color based on score thresholds
 *
 * From pcf-extracted-logic.md Section 1.4:
 * - ≥80: Green (Excellent)
 * - ≥60: Orange (Good)
 * - <60: Red (Poor)
 *
 * @param score - Score value (0-100)
 * @returns Hex color code
 *
 * @example
 * ```ts
 * getScoreColor(85) // Returns "#107C10" (green)
 * getScoreColor(65) // Returns "#D83B01" (orange)
 * getScoreColor(45) // Returns "#A80000" (red)
 * ```
 */
export function getScoreColor(score: number): string {
  if (score >= 80) return '#107C10'; // Green (success)
  if (score >= 60) return '#D83B01'; // Orange (warning)
  return '#A80000'; // Red (error)
}

/**
 * Get label based on score thresholds
 *
 * From pcf-extracted-logic.md Section 1.4:
 * - ≥80: "Excellent"
 * - ≥60: "Good"
 * - ≥40: "Fair"
 * - <40: "Needs Improvement"
 *
 * @param score - Score value (0-100)
 * @returns Label text
 *
 * @example
 * ```ts
 * getScoreLabel(85) // Returns "Excellent"
 * getScoreLabel(65) // Returns "Good"
 * getScoreLabel(45) // Returns "Fair"
 * getScoreLabel(25) // Returns "Needs Improvement"
 * ```
 */
export function getScoreLabel(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  return 'Needs Improvement';
}

