/**
 * Transform Utilities
 *
 * Transforms Stage outputs into display-ready formats.
 * Implements transformation logic from pcf-extracted-logic.md Section 5.
 *
 * Key features:
 * - Transform patterns for display grid (with sorting)
 * - Transform compliance for display grid
 * - Apply missing instructions override
 * - Map to display models with badge colors
 */

import { COMPLIANCE_CRITERIA } from '../contracts/Constants';
import type {
  AssessmentStatus,
  Pattern,
  InstructionEvaluation,
} from '../contracts/StageOutputs';
import type {
  AssessmentDisplay,
  PatternDisplayRow,
  ComplianceDisplayRow,
  ComplianceIssueDetail,
} from '../contracts/DisplayModels';
import { STATUS_BADGE_COLOR } from '../contracts/DisplayModels';
import {
  categorizePattern,
  getPatternSeverity,
  PATTERN_INHERENT_CATEGORY,
} from './patternUtils';
import {
  groupIssuesByCriteria,
  hasMissingInstructions,
  getCriterionSeverity,
  matchIssueToCriteria,
} from './complianceUtils';
import {
  ASSESSMENT_LABELS, countReviewFindings, getInstructionAssessments,
  getPatternAssessment, getPatternTopicAssessment, isFailedPattern,
} from './reviewAssessment';

const legacySeverityMap: Record<string, 'High' | 'Medium' | 'Low'> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const DEFAULT_ASSESSMENT_REASONS: Record<AssessmentStatus, string> = {
  pass: 'This check passed in the saved assessment.',
  fail: 'This check failed in the saved assessment.',
  'not-applicable': 'This check does not apply to the reviewed configuration.',
  'not-assessed': 'A completed assessment is not available for this check.',
};

function assessmentDisplay(assessmentStatus: AssessmentStatus, reason?: string): AssessmentDisplay {
  const statusLabel = ASSESSMENT_LABELS[assessmentStatus];
  return {
    assessmentStatus,
    assessmentReason: reason || DEFAULT_ASSESSMENT_REASONS[assessmentStatus],
    status: assessmentStatus === 'pass' ? true : assessmentStatus === 'fail' ? false : null,
    statusLabel,
    statusColor: STATUS_BADGE_COLOR[statusLabel],
  };
}

function compatibleInstructionEvaluation(evaluation: InstructionEvaluation | null): InstructionEvaluation | undefined {
  if (!evaluation || !Array.isArray(evaluation.issues) || evaluation.issues.some(issue => !issue || typeof issue.id !== 'string')) {
    return undefined;
  }
  return {
    ...evaluation,
    issues: evaluation.issues.map(issue => {
      const criteriaId = matchIssueToCriteria(issue.criteriaId ?? issue.id) ?? issue.criteriaId;
      const criterion = COMPLIANCE_CRITERIA.find(item => item.id === criteriaId);
      const severity = typeof issue.severity === 'string'
        ? legacySeverityMap[issue.severity.toLowerCase()] ?? (issue.severity === 'High' || issue.severity === 'Medium' || issue.severity === 'Low'
          ? issue.severity : undefined)
        : undefined;
      const title = typeof issue.title === 'string' && issue.title.trim()
        ? issue.title
        : criterion?.name ?? (typeof issue.guidelineReference === 'string' && issue.guidelineReference.trim()
          ? issue.guidelineReference : 'Legacy instruction finding');
      return {
        ...issue,
        criteriaId,
        title,
        recommendation: typeof issue.recommendation === 'string' ? issue.recommendation : '',
        severity: severity ?? 'Low',
        guidelineReference: typeof issue.guidelineReference === 'string' ? issue.guidelineReference : undefined,
      };
    }),
    ...(evaluation.criterionAssessments !== undefined && {
      criterionAssessments: Array.isArray(evaluation.criterionAssessments)
        ? evaluation.criterionAssessments.filter(assessment => assessment && typeof assessment.criteriaId === 'string')
        : [],
    }),
  };
}

/**
 * Resolve a structurally valid issue within its criterion for UI/report display.
 * Priority inherits the criterion; missing evidence does not erase a recorded failure.
 */
export function getInstructionIssueDisplay(
  criterion: Pick<ComplianceDisplayRow, 'assessmentStatus' | 'severity'>,
  issue: { assessmentStatus?: unknown; severity?: unknown },
): Pick<ComplianceDisplayRow, 'assessmentStatus' | 'severity'> {
  const parentStatus = criterion.assessmentStatus;
  if (parentStatus !== 'pass' && parentStatus !== 'fail') {
    return {
      assessmentStatus: parentStatus === 'not-applicable' ? 'not-applicable' : 'not-assessed',
      severity: criterion.severity,
    };
  }
  const assessmentStatus = issue.assessmentStatus === undefined
    ? parentStatus === 'fail' ? 'fail' : 'not-assessed'
    : issue.assessmentStatus === 'fail' || issue.assessmentStatus === 'not-assessed'
      ? issue.assessmentStatus : 'not-assessed';
  return { assessmentStatus, severity: criterion.severity };
}

/**
 * Transform patterns to display grid format
 *
 * Applies categorization, severity calculation, and all required display fields.
 *
 * @param patterns - Raw patterns from Stage A or Stage B
 * @returns Array of pattern display rows
 *
 * @example
 * ```ts
 * const displayRows = transformPatternsForDisplay(stageAPatterns);
 * // Patterns with all display fields populated
 * ```
 */
export function transformPatternsForDisplay(
  patterns: Pattern[],
  isZipSource = false
): PatternDisplayRow[] {
  return patterns
    .map((pattern, index) => {
    // A historical ZIP score is retained separately; only the display label changes.
    if (isZipSource && pattern.PatternName === 'Inadequate Test Cases' && pattern.AssessmentStatus === undefined) {
      const category = 'Evaluation';
      return {
        id: pattern.PatternId || `pattern-${index}`,
        patternId: pattern.PatternId || `pattern-${index}`,
        patternName: pattern.PatternName,
        description: 'Not evaluated — test cases are environment-scoped and not included in solution exports. Run a live environment review to evaluate test coverage.',
        recommendation: 'To evaluate test coverage, review this agent directly from the live environment instead of a solution ZIP.',
        ...assessmentDisplay('not-applicable', 'Test cases are environment-scoped and are not included in solution exports.'),
        evidenceKind: pattern.EvidenceKind,
        severity: 'Medium',
        severityColor: 'warning',
        category,
        topicCount: 0,
        topics: [],
        rawTopics: [],
        categorySortOrder: getCategorySortOrder(category),
        notApplicable: true,
      };
    }
    const category = PATTERN_INHERENT_CATEGORY[pattern.PatternName] ?? categorizePattern(pattern.PatternName);
    const legacyTopics = (pattern as Pattern & { AffectedTopics?: unknown }).AffectedTopics;
    const rawTopics = Array.isArray(pattern.Topics) ? pattern.Topics
      : Array.isArray(legacyTopics) ? legacyTopics.filter((topic): topic is string => typeof topic === 'string').map(item => ({ item }))
        : [];
    const assessmentStatus = getPatternAssessment(pattern);
    const severity = getPatternSeverity(pattern.PatternName);

    return {
      id: pattern.PatternId || `pattern-${index}`,
      patternId: pattern.PatternId || `pattern-${index}`,
      patternName: pattern.PatternName,
      description: pattern.PatternDescription || pattern.Description || '',
      recommendation: pattern.Recommendation || '',
      ...assessmentDisplay(assessmentStatus, pattern.AssessmentReason),
      evidenceKind: pattern.EvidenceKind,
      severity,
      severityColor: severity === 'High' ? 'danger' : severity === 'Medium' ? 'warning' : 'informative',
      category,
      topicCount: rawTopics.filter(topic => getPatternTopicAssessment(assessmentStatus, topic) === 'fail').length,
      topics: rawTopics.map((t) => t.item),
      rawTopics,
      categorySortOrder: getCategorySortOrder(category),
      notApplicable: assessmentStatus === 'not-applicable',
    };
  });
}

/**
 * Transform compliance evaluation to display grid format
 *
 * Maps 12 compliance criteria to display rows with issue grouping.
 * Applies missing instructions override if present.
 *
 * @param instructionEvaluation - Stage C output
 * @returns Array of 12 compliance display rows
 *
 * @example
 * ```ts
 * const displayRows = transformComplianceForDisplay(stageC);
 * // All 12 criteria with Pass/Fail status and issues
 * ```
 */
export function transformComplianceForDisplay(
  instructionEvaluation: InstructionEvaluation | null
): ComplianceDisplayRow[] {
  const evaluation = compatibleInstructionEvaluation(instructionEvaluation);
  const issues = evaluation?.issues ?? [];
  const missingInstructions = hasMissingInstructions(issues);
  const groupedIssues = groupIssuesByCriteria(issues);
  const assessments = getInstructionAssessments(evaluation);

  return COMPLIANCE_CRITERIA.map((criterion, index) => {
    const assessment = assessments[index];
    const criterionIssues = missingInstructions && assessment.status === 'fail'
      ? issues.filter(issue => hasMissingInstructions([issue]))
      : groupedIssues.get(criterion.id) ?? [];
    const severity = getCriterionSeverity(criterion, criterionIssues);

    return {
      id: `compliance-${index}`,
      criteriaId: criterion.id,
      criteriaName: criterion.name,
      description: criterion.description,
      ...assessmentDisplay(assessment.status, assessment.reason),
      evidenceKind: 'authoring-guidance',
      severity,
      severityColor: severity === 'High' ? 'danger' : severity === 'Medium' ? 'warning' : 'informative',
      category: criterion.category,
      issueCount: criterionIssues.length,
      issues: criterionIssues.map((issue): ComplianceIssueDetail => ({
        id: issue.id,
        title: issue.title,
        description: issue.description,
        recommendation: issue.recommendation,
        severity: issue.severity,
        guidelineReference: issue.guidelineReference,
        assessmentStatus: issue.assessmentStatus,
        assessmentReason: issue.assessmentReason,
        evidence: issue.evidence,
        remediation: issue.remediation,
        coverage: issue.coverage,
        uncoveredSituation: issue.uncoveredSituation,
      })),
      inherentSeverity: criterion.inherentSeverity,
      categorySortOrder: getComplianceCategorySortOrder(criterion.category),
    };
  });
}

/**
 * Get category sort order for patterns
 */
function getCategorySortOrder(category: string): number {
  const order: Record<string, number> = {
    'Model Naming': 1,
    'Model Description': 2,
    'Input Variables': 3,
    'Output Variables': 4,
    'Architecture': 5,
    'Evaluation': 6,
    'Unknown': 7,
  };
  return order[category] ?? 7;
}

/**
 * Get category sort order for compliance
 */
function getComplianceCategorySortOrder(category: 'Scope' | 'UX' | 'Safety' | 'Quality'): number {
  const order: Record<string, number> = {
    'Scope': 1,
    'UX': 2,
    'Safety': 3,
    'Quality': 4,
  };
  return order[category] ?? 4;
}

/**
 * Count high-severity issues from pattern evaluation
 *
 * @param patterns - Patterns from Stage A or Stage B
 * @returns Count of high-severity issues
 */
export function countHighSeverityPatterns(patterns: Pattern[]): number {
  return patterns.filter((pattern) => {
    if (!isFailedPattern(pattern)) return false;
    return getPatternSeverity(pattern.PatternName) === 'High';
  }).length;
}

/**
 * Count high-severity issues from compliance evaluation
 *
 * @param instructionEvaluation - Stage C output
 * @returns Count of high-severity compliance issues
 */
export function countHighSeverityCompliance(
  instructionEvaluation: InstructionEvaluation | null
): number {
  return countReviewFindings([], compatibleInstructionEvaluation(instructionEvaluation)).highSeverityCount;
}

/**
 * Count total issues (patterns + compliance)
 *
 * @param patterns - Patterns from Stage A or Stage B
 * @param instructionEvaluation - Stage C output
 * @returns Total issue count
 */
export function countTotalIssues(
  patterns: Pattern[],
  instructionEvaluation: InstructionEvaluation | null
): number {
  return countReviewFindings(patterns, compatibleInstructionEvaluation(instructionEvaluation)).totalIssueCount;
}

/**
 * Format duration in milliseconds to human-readable string
 *
 * @param durationMs - Duration in milliseconds
 * @returns Formatted string (e.g., "2.5s", "1m 30s")
 */
export function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  if (durationMs < 60000) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  }

  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.floor((durationMs % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Truncate text with ellipsis
 *
 * @param text - Text to truncate
 * @param maxLength - Maximum length
 * @returns Truncated text
 */
export function truncateText(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) {
    return text;
  }

  return text.substring(0, maxLength - 3) + '...';
}
