import type {
  AssessmentNote,
  CriterionResult,
  EvaluationIssue,
  PassingCheck,
} from '../contracts/DAEvaluationResult';
import type { DAPackageValidation } from '../contracts/DAPackageReview';

/** Projects package validation into the shared review-section model. */
export function packageValidationToCriterionResult(
  validation: DAPackageValidation,
): CriterionResult {
  const issues: EvaluationIssue[] = validation.findings
    .filter((finding) => finding.status === 'Fail' || finding.status === 'Warning')
    .map((finding) => ({
      severity: finding.severity ?? (finding.status === 'Fail' ? 'High' : 'Medium'),
      description: finding.explanation,
      recommendation: finding.recommendation,
      ruleId: finding.ruleId,
      method: finding.method,
      sourceFile: finding.sourceFile,
      jsonPath: finding.jsonPath,
      evidence: finding.evidence,
      guidanceUrl: finding.guidanceUrl,
    }));
  const passingChecks: PassingCheck[] = validation.findings
    .filter((finding) => finding.status === 'Pass')
    .map((finding) => ({
      description: finding.explanation,
      learnUrl: finding.guidanceUrl,
    }));
  const assessmentNotes: AssessmentNote[] = validation.findings
    .filter((finding) => finding.status === 'N/A' || finding.status === 'Not assessed')
    .map((finding) => ({
      status: finding.status as AssessmentNote['status'],
      description: finding.explanation,
      sourceFile: finding.sourceFile,
      jsonPath: finding.jsonPath,
      evidence: finding.evidence,
      learnUrl: finding.guidanceUrl,
    }));

  return {
    status: validation.status === 'invalid'
      ? 'Fail'
      : validation.status === 'valid-with-warnings'
        ? 'Warning'
        : validation.status === 'unavailable'
          ? 'Not assessed'
          : 'Pass',
    issues,
    passingChecks,
    assessmentNotes,
  };
}

