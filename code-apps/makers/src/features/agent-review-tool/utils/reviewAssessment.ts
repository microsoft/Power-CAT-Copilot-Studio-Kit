import { COMPLIANCE_CRITERIA } from '../contracts/Constants';
import { getPatternSeverity } from './patternUtils';
import { resolveIssueCriterionId } from './complianceUtils';
import type {
  AssessmentStatus, ComplianceIssue, CriterionAssessment, InstructionEvaluation, Pattern, PatternTopic,
} from '../contracts/StageOutputs';

export const STANDARD_REVIEW_POLICY_VERSION = 'standard-review-4';

export const ASSESSMENT_LABELS: Record<AssessmentStatus, 'Pass' | 'Fail' | 'N/A' | 'Not assessed'> = {
  pass: 'Pass',
  fail: 'Fail',
  'not-applicable': 'N/A',
  'not-assessed': 'Not assessed',
};

export interface AssessmentSummary {
  score: number | null;
  completed: number;
  passed: number;
  failed: number;
  notApplicable: number;
  notAssessed: number;
}

const severityPoints = { High: 3, Medium: 2, Low: 1 } as const;
const legacySeverityMap: Record<string, 'High' | 'Medium' | 'Low'> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

/** Check an outcome received from stored JSON or an AI response. */
export function isAssessmentStatus(value: unknown): value is AssessmentStatus {
  return value === 'pass' || value === 'fail'
    || value === 'not-applicable' || value === 'not-assessed';
}

/** Resolve explicit outcomes first; use boolean status only for legacy records. */
export function getPatternAssessment(pattern: { Status?: unknown; AssessmentStatus?: unknown }): AssessmentStatus {
  if (pattern.AssessmentStatus !== undefined) {
    return isAssessmentStatus(pattern.AssessmentStatus) ? pattern.AssessmentStatus : 'not-assessed';
  }
  return pattern.Status === true ? 'pass' : pattern.Status === false ? 'fail' : 'not-assessed';
}

/** Resolve a setting without promoting it beyond its stored category assessment. */
export function getPatternTopicAssessment(status: AssessmentStatus, topic: PatternTopic): AssessmentStatus {
  if (status === 'not-assessed' || status === 'not-applicable') return status;
  return topic.assessmentStatus === undefined ? status
    : isAssessmentStatus(topic.assessmentStatus) ? topic.assessmentStatus : 'not-assessed';
}

/** Identify actual failed checks without treating excluded outcomes as failures. */
export function isFailedPattern(pattern: Pattern): boolean {
  return getPatternAssessment(pattern) === 'fail';
}

/** Resolve a known criterion from explicit metadata or a legacy issue identifier. */
export function getIssueCriterionId(issue: Pick<ComplianceIssue, 'id' | 'criteriaId'>): string | undefined {
  return resolveIssueCriterionId(issue);
}

/** Return every criterion with a conservative explicit or backward-compatible outcome. */
export function getInstructionAssessments(evaluation?: InstructionEvaluation): CriterionAssessment[] {
  return COMPLIANCE_CRITERIA.map(criterion => {
    const unavailable = (reason: string): CriterionAssessment => ({
      criteriaId: criterion.id, status: 'not-assessed', reason,
    });
    if (!evaluation || !Array.isArray(evaluation.issues)) {
      return unavailable('Instruction assessment data is unavailable.');
    }
    const readableIssues = evaluation.issues.filter(i => i !== null && typeof i === 'object'
      && (typeof i.id === 'string' || typeof i.criteriaId === 'string'));
    if (evaluation.assessmentStatus === 'not-assessed' || evaluation.assessmentStatus === 'not-applicable') {
      return {
        criteriaId: criterion.id, status: evaluation.assessmentStatus,
        reason: evaluation.assessmentReason,
      };
    }
    if (evaluation.criterionAssessments !== undefined) {
      if (!Array.isArray(evaluation.criterionAssessments)) return unavailable('Criterion assessment data is unreadable.');
      const matches = evaluation.criterionAssessments.filter(a => a !== null && typeof a === 'object' && a.criteriaId === criterion.id);
      if (matches.length !== 1 || !isAssessmentStatus(matches[0].status)) {
        return unavailable('A unique completed assessment for this criterion is unavailable.');
      }
      return matches[0];
    }
    if (readableIssues.some(i => i.id === 'missing-instruction-input')) {
      return { criteriaId: criterion.id, status: 'fail', reason: 'No instructions were supplied.' };
    }
    const issues = readableIssues.filter(i => getIssueCriterionId(i) === criterion.id);
    if (issues.some(i => i.assessmentStatus !== 'not-assessed')) {
      return { criteriaId: criterion.id, status: 'fail' };
    }
    if (evaluation.policyVersion !== undefined || readableIssues.length !== evaluation.issues.length) {
      return unavailable('This response does not establish a completed outcome for the criterion.');
    }
    return unavailable(issues.length > 0
      ? 'Legacy issue metadata is available for this criterion, but no completed criterion outcome was recorded.'
      : 'Legacy instruction results do not include a completed outcome for this criterion.');
  });
}

function summarize(assessments: Array<{ status: AssessmentStatus; weight: number }>): AssessmentSummary {
  const result: AssessmentSummary = {
    score: null, completed: 0, passed: 0, failed: 0, notApplicable: 0, notAssessed: 0,
  };
  let completedWeight = 0;
  let passedWeight = 0;
  for (const { status, weight } of assessments) {
    if (status === 'not-applicable') result.notApplicable++;
    else if (status === 'not-assessed') result.notAssessed++;
    else {
      result.completed++;
      completedWeight += weight;
      if (status === 'pass') {
        result.passed++;
        passedWeight += weight;
      } else result.failed++;
    }
  }
  if (completedWeight > 0) result.score = Math.round(passedWeight / completedWeight * 100);
  return result;
}

/** Score completed applicable pattern categories, not individual affected settings. */
export function summarizePatternAssessments(patterns: Pattern[]): AssessmentSummary {
  return summarize(patterns.map(p => ({ status: getPatternAssessment(p), weight: 1 })));
}

/** Score completed applicable instruction criteria with the existing inherent weights. */
export function summarizeInstructionAssessments(evaluation?: InstructionEvaluation): AssessmentSummary {
  return summarize(getInstructionAssessments(evaluation).map((assessment, index) => ({
    status: assessment.status,
    weight: severityPoints[COMPLIANCE_CRITERIA[index].inherentSeverity],
  })));
}

/** Describe only normalized outcomes, with explicit units and no runtime-performance claim. */
export function describeAssessmentSummary(summary: AssessmentSummary, unit: string): string {
  const outcomes = `${summary.passed} Pass; ${summary.failed} Fail; ${summary.notApplicable} N/A; ${summary.notAssessed} Not assessed.`;
  return `${outcomes} ${summary.completed} applicable ${unit} were completed.`
    + (summary.score === null ? ' No score is available.' : ' Excluded outcomes do not enter the score.');
}

/** Select instruction findings without treating excluded or unavailable outcomes as failures. */
export function getAssessedInstructionIssues(evaluation?: InstructionEvaluation): ComplianceIssue[] {
  const assessments = getInstructionAssessments(evaluation);
  return (Array.isArray(evaluation?.issues) ? evaluation.issues : []).filter(issue => {
    if (issue === null || typeof issue !== 'object') return false;
    if (issue.assessmentStatus === 'not-assessed') return false;
    if (evaluation?.assessmentStatus === 'not-assessed' || evaluation?.assessmentStatus === 'not-applicable') return false;
    const criterionId = getIssueCriterionId(issue);
    return !criterionId || assessments.some(a => a.criteriaId === criterionId && a.status === 'fail');
  });
}

/** Count failed pattern categories and assessed instruction issues, using their displayed severity. */
export function countReviewFindings(patterns: Pattern[], evaluation?: InstructionEvaluation) {
  const failedPatterns = patterns.filter(isFailedPattern);
  const instructionIssues = getAssessedInstructionIssues(evaluation);
  const severities = [
    ...failedPatterns.map(p => getPatternSeverity(p.PatternName)),
    ...instructionIssues.map(i => typeof i.severity === 'string'
      ? legacySeverityMap[i.severity.toLowerCase()] ?? i.severity : undefined)
      .filter((severity): severity is 'High' | 'Medium' | 'Low' => severity === 'High' || severity === 'Medium' || severity === 'Low'),
  ];
  return {
    highSeverityCount: severities.filter(s => s === 'High').length,
    mediumSeverityCount: severities.filter(s => s === 'Medium').length,
    lowSeverityCount: severities.filter(s => s === 'Low').length,
    totalIssueCount: severities.length,
    failedPatternCount: failedPatterns.length,
    instructionIssueCount: instructionIssues.length,
  };
}
