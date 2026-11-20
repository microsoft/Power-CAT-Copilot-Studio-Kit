/**
 * Standard review → shell view model (spec 017, Phase 2).
 *
 * Both standard surfaces use the same saved-score, availability and evidence
 * projection. Missing stages are explicitly unavailable, never an empty success.
 */

import type {
  ComplianceDisplayRow, PatternDisplayRow, ReviewResult,
} from '../contracts/ReviewResult';
import type { LocalStageAOutput } from '../contracts/StageOutputs';
import { transformComplianceForDisplay, transformPatternsForDisplay } from '../utils/transformUtils';
import {
  projectSavedStandardReview, type SavedStandardScores,
} from '../utils/standardReviewProjection';
import { countReviewFindings } from '../utils/reviewAssessment';

export type StandardTabId = 'patterns' | 'compliance';

export interface StandardReviewShellModel {
  patternRows: PatternDisplayRow[];
  complianceRows: ComplianceDisplayRow[];
  /** Failed pattern categories, not the number of affected settings. */
  failedPatternCount: number;
  /** Failed criterion rows, which can contain several assessed instruction findings. */
  failedComplianceCount: number;
  findingCounts: ReturnType<typeof countReviewFindings>;
  stageAOutput: LocalStageAOutput | null;
  isZipSource: boolean;
  scores: SavedStandardScores;
  patternAssessmentSummary: string;
  instructionAssessmentSummary: string;
  agentInstructions?: string;
}

function assessmentSummary(
  rows: Array<PatternDisplayRow | ComplianceDisplayRow>,
  unit: 'checks' | 'criteria' = 'checks',
): string {
  const completed = rows.filter(row => row.assessmentStatus === 'pass' || row.assessmentStatus === 'fail').length;
  const failed = rows.filter(row => row.assessmentStatus === 'fail').length;
  const notAssessed = rows.filter(row => row.assessmentStatus === 'not-assessed').length;
  const notApplicable = rows.filter(row => row.assessmentStatus === 'not-applicable').length;
  return [
    completed ? `${failed} of ${completed} assessed ${unit} failed` : `No completed ${unit}`,
    ...(notAssessed ? [`${notAssessed} not assessed`] : []),
    ...(notApplicable ? [`${notApplicable} N/A`] : []),
  ].join('; ');
}

/** Build standard-only display state from a saved snapshot without regrading it. */
export function buildStandardReviewShellModel(
  review: ReviewResult | null,
): StandardReviewShellModel {
  if (!review) {
    return {
      patternRows: [],
      complianceRows: [],
      failedPatternCount: 0,
      failedComplianceCount: 0,
      findingCounts: countReviewFindings([]),
      stageAOutput: null,
      isZipSource: false,
      scores: { pattern: null, instruction: null, overall: null, legacy: false, notes: [], pillars: [], status: null },
      patternAssessmentSummary: 'No completed checks',
      instructionAssessmentSummary: 'No completed criteria',
    };
  }

  const projection = projectSavedStandardReview(review);
  const { isZipSource, patternEvaluation, instructionEvaluation, stageAOutput, scores } = projection;
  const patternRows = patternEvaluation
    ? transformPatternsForDisplay(patternEvaluation.Patterns, isZipSource)
    : [];
  const complianceRows = transformComplianceForDisplay(instructionEvaluation);
  // Use display outcomes so historical ZIP exclusions agree with the UI without rewriting saved data.
  const findingCounts = countReviewFindings(patternRows.map(row => ({
    PatternId: row.patternId,
    PatternName: row.patternName,
    AssessmentStatus: row.assessmentStatus,
    Status: row.status === true,
    Recommendation: row.recommendation,
    Topics: row.rawTopics,
  })), instructionEvaluation ?? undefined);

  return {
    patternRows,
    complianceRows,
    failedPatternCount: findingCounts.failedPatternCount,
    failedComplianceCount: complianceRows.filter((c) => c.assessmentStatus === 'fail').length,
    findingCounts,
    stageAOutput,
    isZipSource,
    scores,
    patternAssessmentSummary: assessmentSummary(patternRows),
    instructionAssessmentSummary:
      `${findingCounts.instructionIssueCount} assessed instruction finding${findingCounts.instructionIssueCount === 1 ? '' : 's'}. `
      + assessmentSummary(complianceRows, 'criteria'),
    agentInstructions: review.agentInstructions ?? stageAOutput?.agentInstructions,
  };
}
