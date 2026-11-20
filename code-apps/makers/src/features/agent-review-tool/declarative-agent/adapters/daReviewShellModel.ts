/**
 * Declarative review → shell view model (spec 017, Phase 1).
 *
 * Derives the tab set, issue counts and rail model from a `DAReviewRecord`.
 *
 * The section list is shared by the routed page, legacy dialog, and exports so
 * applicability and scoring stay consistent across every review surface.
 */

import type { CriterionResult } from '../contracts/DAEvaluationResult';
import type { DAReviewRecord } from '../contracts/DAReviewRecord';
import type { DAPackageValidity } from '../contracts/DAPackageReview';
import { manifestHealthToCriterionResult } from '../utils/manifestHealthToIssues';
import { packageValidationToCriterionResult } from '../utils/packageValidationToCriterion';
import { applyDAEvaluationApplicability } from '../utils/evaluationApplicability';
import { calculateDAScore } from '../utils/scoreCalculator';
import type { RailSubScore } from '../../shared/review-shell/reviewShellTypes';
import {
  buildDACustomSkillsViewModel,
  type DACustomSkillsViewModel,
} from './daCustomSkillsViewModel';
import {
  buildDAScoreBreakdown,
  DA_QUALITY_WEIGHTS,
  type DAScoreBreakdownPart,
} from './daScoreBreakdown';

/** Tab identifiers. `all` is the landing tab; `package` appears conditionally. */
export type DATabId =
  | 'all' | 'instructions' | 'knowledge' | 'capabilities'
  | 'actions' | 'starters' | 'errorHandling' | 'package' | 'customSkills';

export interface DACriterionSection {
  tab: DATabId;
  value: string;
  /** Full name, used in the panel intro and the accordion header. */
  criterionName: string;
  /**
   * Short label for the tab strip. Seven full names wrap onto two rows beside
   * a 316px rail; the approved mock uses these short forms.
   */
  tabLabel: string;
  criterionKey: string;
  result: CriterionResult | undefined;
  /** Share of the overall score, e.g. "30%". Absent for Manifest Health. */
  weightLabel?: string;
}

export interface DASeverityTally {
  high: number;
  medium: number;
  low: number;
  total: number;
}

export interface DAReviewShellModel {
  score: number | null;
  sections: DACriterionSection[];
  issueCounts: Partial<Record<DATabId, number>>;
  severity: DASeverityTally;
  subScores: RailSubScore[];
  scoreBreakdown: DAScoreBreakdownPart[];
  sourceLabel: string;
  aiSummary: string | undefined;
  packageValidity: DAPackageValidity;
  customSkills?: DACustomSkillsViewModel;
}

/**
 * Applies Code App-owned action applicability and supplies a count check when
 * the evaluator did not return one.
 */
function withActionsEmptyStateRule(
  result: CriterionResult | undefined,
  actionCount: number | undefined,
): CriterionResult | undefined {
  if (!result || actionCount === undefined) return result;

  if (actionCount === 0) {
    return {
      status: 'N/A',
      issues: [],
      passingChecks: [],
      assessmentNotes: [{
        status: 'N/A',
        description: 'The agent declares no actions.',
      }],
    };
  }

  if (!result.passingChecks || result.passingChecks.length === 0) {
    return {
      ...result,
      passingChecks: [
        { description: `Action count (${actionCount}) is within the maximum limit of 10` },
      ],
    };
  }

  return result;
}

function withOptionalEmptyState(
  result: CriterionResult | undefined,
  itemCount: number | undefined,
  description: string,
): CriterionResult | undefined {
  if (!result || itemCount === undefined || itemCount > 0) return result;
  return {
    status: 'N/A',
    issues: [],
    passingChecks: [],
    assessmentNotes: [{ status: 'N/A', description }],
  };
}

/** Builds the criterion sections, in tab order. */
export function buildDACriterionSections(review: DAReviewRecord): DACriterionSection[] {
  const evaluation = review.evaluation && review.manifest
    ? applyDAEvaluationApplicability(review.evaluation, review.manifest)
    : review.evaluation;
  const packageResult = review.packageValidation
    ? packageValidationToCriterionResult(review.packageValidation)
    : review.manifestHealth
      ? manifestHealthToCriterionResult(review.manifestHealth)
    : null;

  const section = (
    tab: DATabId,
    criterionName: string,
    tabLabel: string,
    criterionKey: string,
    result: CriterionResult | undefined,
  ): DACriterionSection => ({
    tab,
    value: tab,
    criterionName,
    tabLabel,
    criterionKey,
    result,
    weightLabel: undefined,
  });

  const sections = [
    section('instructions', 'Instructions Quality', 'Instructions', 'instructionsCriterion', evaluation?.instructionsCriterion),
    section('knowledge', 'Knowledge Sources', 'Knowledge', 'knowledgeCriterion', evaluation?.knowledgeCriterion),
    section('capabilities', 'Capabilities Fit', 'Capabilities', 'capabilitiesCriterion', evaluation?.capabilitiesCriterion),
    section(
      'actions',
      'Actions Quality',
      'Actions',
      'actionsCriterion',
      withActionsEmptyStateRule(evaluation?.actionsCriterion, review.manifest?.actions.length),
    ),
    section(
      'starters',
      'Conversation Starters',
      'Starters',
      'conversationStartersCriterion',
      withOptionalEmptyState(
        evaluation?.conversationStartersCriterion,
        review.manifest?.conversationStarters.length,
        'The agent declares no conversation starters.',
      ),
    ),
    section('errorHandling', 'Error Handling', 'Error handling', 'gracefulErrorHandlingCriterion', evaluation?.gracefulErrorHandlingCriterion),
    ...(packageResult
      ? [{
          tab: 'package' as DATabId,
          value: 'package',
          criterionName: review.packageValidation
            ? 'Package Validity'
            : 'Legacy Package Checks',
          tabLabel: 'Package',
          criterionKey: 'packageValidation',
          result: packageResult as CriterionResult,
          weightLabel: undefined,
        }]
      : []),
  ];

  const assessedWeight = sections.reduce((sum, candidate) => {
    if (
      !candidate.result ||
      candidate.result.status === 'N/A' ||
      candidate.result.status === 'Not assessed'
    ) {
      return sum;
    }
    return sum + (DA_QUALITY_WEIGHTS[candidate.criterionKey] ?? 0);
  }, 0);

  return sections.map((candidate) => {
    const configuredWeight = DA_QUALITY_WEIGHTS[candidate.criterionKey];
    if (
      !configuredWeight ||
      !candidate.result ||
      candidate.result.status === 'N/A' ||
      candidate.result.status === 'Not assessed' ||
      assessedWeight === 0
    ) {
      return candidate;
    }
    return {
      ...candidate,
      weightLabel: `${Math.round(configuredWeight / assessedWeight * 100)}%`,
    };
  });
}

/** Counts issues per tab and splits the total by severity. */
export function tallyDAIssues(sections: DACriterionSection[]): {
  issueCounts: Partial<Record<DATabId, number>>;
  severity: DASeverityTally;
} {
  const issueCounts: Partial<Record<DATabId, number>> = {};
  let high = 0;
  let medium = 0;
  let low = 0;
  let total = 0;

  for (const s of sections) {
    const issues = s.result?.issues ?? [];
    issueCounts[s.tab] = issues.length;
    total += issues.length;
    for (const issue of issues) {
      if (issue.severity === 'High') high++;
      else if (issue.severity === 'Medium') medium++;
      else low++;
    }
  }

  return { issueCounts, severity: { high, medium, low, total } };
}

/**
 * Builds the complete shell model for a declarative review.
 *
 * The overall score is recomputed from the evaluation when one is present, so
 * the page and the dialog agree; `overallScore` on the record is the fallback
 * for a record saved without an evaluation blob.
 */
export function buildDAReviewShellModel(review: DAReviewRecord): DAReviewShellModel {
  const sections = buildDACriterionSections(review);
  const { issueCounts, severity: criterionSeverity } = tallyDAIssues(sections);
  const customSkills = buildDACustomSkillsViewModel(review);
  if (customSkills) {
    issueCounts.customSkills = customSkills.severity.total;
  }
  const severity = customSkills
    ? {
        high: criterionSeverity.high + customSkills.additionalSeverity.high,
        medium: criterionSeverity.medium + customSkills.additionalSeverity.medium,
        low: criterionSeverity.low + customSkills.additionalSeverity.low,
        total: criterionSeverity.total + customSkills.additionalSeverity.total,
      }
    : criterionSeverity;

  const effectiveEvaluation = review.evaluation && review.manifest
    ? applyDAEvaluationApplicability(review.evaluation, review.manifest)
    : review.evaluation;
  const score = effectiveEvaluation
    ? calculateDAScore(effectiveEvaluation)
    : review.overallScore;

  const scoreBreakdown = buildDAScoreBreakdown(effectiveEvaluation);
  const subScores: RailSubScore[] = scoreBreakdown
    .filter((part) => part.score !== null)
    .map((part) => ({
      label: part.label,
      percent: part.score,
      weight: `${Math.round(part.effectiveWeight)}%`,
    }));

  const sourceLabel = review.sourceType === 'zip' ? 'ZIP upload' : 'Catalog';

  return {
    score,
    sections,
    issueCounts,
    severity,
    subScores,
    scoreBreakdown,
    sourceLabel,
    aiSummary: review.evaluation?.summary,
    packageValidity: review.packageValidation?.status ?? 'unavailable',
    customSkills,
  };
}
