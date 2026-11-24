import type { DAReviewRecord } from '../contracts/DAReviewRecord';
import type { EvaluationIssue } from '../contracts/DAEvaluationResult';
import { packageValidationToCriterionResult } from '../utils/packageValidationToCriterion';
import {
  buildPersistedSkillView,
} from '../../agents-experience/components/viewModel';
import {
  buildSkillsGroupedView,
} from '../../agents-experience/components/skillsGroupedModel';
import type {
  SkillView,
  SkillsGroupedView,
} from '../../agents-experience/components/viewTypes';
import type { RetrievalIssue } from '../../agents-experience/contracts/SkillBundle';

export interface DACustomSkillSeverity {
  high: number;
  medium: number;
  low: number;
  total: number;
}

export interface DACustomSkillsViewModel {
  preview: true;
  skills: SkillView[];
  grouped: SkillsGroupedView;
  issues: RetrievalIssue[];
  checkIssues: EvaluationIssue[];
  severity: DACustomSkillSeverity;
  additionalSeverity: DACustomSkillSeverity;
}

function tallySeverities(severities: string[]): DACustomSkillSeverity {
  const high = severities.filter(
    (severity) =>
      severity === 'critical' ||
      severity === 'high' ||
      severity === 'High' ||
      severity === 'error',
  ).length;
  const medium = severities.filter(
    (severity) =>
      severity === 'medium' ||
      severity === 'Medium' ||
      severity === 'warning',
  ).length;
  const low = severities.filter(
    (severity) =>
      severity === 'low' ||
      severity === 'Low' ||
      severity === 'info',
  ).length;
  return { high, medium, low, total: high + medium + low };
}

/** Builds the Declarative Agent custom-skill category from sanitized review data. */
export function buildDACustomSkillsViewModel(
  review: DAReviewRecord,
): DACustomSkillsViewModel | undefined {
  const reviews = review.customSkillReviews ?? [];
  const pipelineIssues = review.customSkillIssues?.filter(
    (issue) => issue.severity !== 'info',
  ) ?? [];
  const packageIssues: RetrievalIssue[] = review.packageValidation?.findings
    .filter((finding) =>
      finding.ruleId.startsWith('DA-SKILL-') &&
      (finding.status === 'Fail' || finding.status === 'Warning'))
    .map((finding) => ({
      code: finding.ruleId,
      message: `${finding.ruleId}: ${finding.explanation}${
        finding.recommendation ? ` ${finding.recommendation}` : ''
      }`,
      resourcePath: finding.sourceFile,
      severity: finding.severity === 'High'
        ? 'error'
        : finding.severity === 'Low'
          ? 'info'
          : 'warning',
    })) ?? [];
  if (
    reviews.length === 0 &&
    pipelineIssues.length === 0 &&
    packageIssues.length === 0
  ) {
    return undefined;
  }

  const skills = reviews.map(buildPersistedSkillView);
  const grouped = buildSkillsGroupedView(
    {
      skillBundleReviews: reviews,
      crossSkillOrchestration: review.customSkillOrchestration,
    },
    skills,
  );
  const additionalSeverities = [
    ...reviews.flatMap(candidate => candidate.findings.map(finding => finding.severity)),
    ...(review.customSkillOrchestration?.findings.map(finding => finding.severity) ?? []),
    ...pipelineIssues.map(issue => issue.severity),
  ];
  const packageSeverities = packageIssues.map(issue => issue.severity);
  const packageCheckIssues = review.packageValidation
    ? packageValidationToCriterionResult(review.packageValidation).issues
      .filter((issue) => issue.ruleId?.startsWith('DA-SKILL-'))
    : [];
  const pipelineCheckIssues: EvaluationIssue[] = pipelineIssues.map((issue) => ({
    severity: issue.severity === 'error' ? 'High' : 'Medium',
    description: issue.message,
    recommendation: '',
    ruleId: issue.code,
    sourceFile: issue.resourcePath,
  }));

  return {
    preview: true,
    skills,
    grouped,
    issues: [...packageIssues, ...pipelineIssues],
    checkIssues: [...packageCheckIssues, ...pipelineCheckIssues],
    severity: tallySeverities([...packageSeverities, ...additionalSeverities]),
    additionalSeverity: tallySeverities(additionalSeverities),
  };
}
