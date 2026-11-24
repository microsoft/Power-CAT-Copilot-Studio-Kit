import type { DAManifest } from '../contracts/DAManifest';
import type {
  CriterionResult,
  DAEvaluationResult,
  EvaluationIssue,
} from '../contracts/DAEvaluationResult';
import type { DAPackageEvidence } from '../contracts/DAPackageReview';
import type {
  DASemanticCriterion,
  DARejectedWorkflowOutcome,
  DAVerifiedWorkflowResponse,
  DAWorkflowProvenance,
  DAWorkflowRequest,
  DAWorkflowResponse,
} from '../contracts/DAWorkflowReview';
import {
  buildDAWorkflowRequest,
  verifyDAWorkflowResponse,
} from './DAWorkflowContractService';

export interface DAWorkflowTransportResult {
  response: DAWorkflowResponse;
  jobId?: string;
  /** Row-level contract failures found before response verification. */
  rejected?: DARejectedWorkflowOutcome[];
}

export type DAWorkflowTransport = (
  request: DAWorkflowRequest,
) => Promise<DAWorkflowTransportResult>;

const CRITERIA: readonly DASemanticCriterion[] = [
  'instructions',
  'knowledge',
  'capabilities',
  'actions',
  'conversationStarters',
  'gracefulErrorHandling',
];

const RESULT_FIELD: Record<DASemanticCriterion, keyof Omit<DAEvaluationResult, 'summary'>> = {
  instructions: 'instructionsCriterion',
  knowledge: 'knowledgeCriterion',
  capabilities: 'capabilitiesCriterion',
  actions: 'actionsCriterion',
  conversationStarters: 'conversationStartersCriterion',
  gracefulErrorHandling: 'gracefulErrorHandlingCriterion',
};

function notApplicable(description: string): CriterionResult {
  return {
    status: 'N/A',
    issues: [],
    passingChecks: [],
    assessmentNotes: [{ status: 'N/A', description }],
  };
}

function notAssessed(description: string): CriterionResult {
  return {
    status: 'Not assessed',
    issues: [],
    passingChecks: [],
    assessmentNotes: [{ status: 'Not assessed', description }],
  };
}

function absentCriterion(
  criterion: DASemanticCriterion,
  manifest: DAManifest,
): CriterionResult {
  if (criterion === 'actions' && manifest.actions.length === 0) {
    return notApplicable('The agent declares no actions.');
  }
  if (criterion === 'conversationStarters' && manifest.conversationStarters.length === 0) {
    return notApplicable('The agent declares no conversation starters.');
  }
  if (
    (criterion === 'knowledge' || criterion === 'capabilities') &&
    manifest.capabilities.length === 0
  ) {
    return notApplicable('The agent declares no capability or knowledge-source entries.');
  }
  return notAssessed('Reliable package evidence was not available for this criterion.');
}

/**
 * Projects verified workflow outcomes into the existing six-criterion model.
 */
export function projectDAWorkflowEvaluation(
  manifest: DAManifest,
  request: DAWorkflowRequest,
  verified: DAVerifiedWorkflowResponse,
): DAEvaluationResult {
  const outcomeByRule = new Map(verified.outcomes.map((outcome) => [outcome.ruleId, outcome]));
  const evidenceById = new Map(request.evidence.map((evidence) => [evidence.evidenceId, evidence]));
  const resultByCriterion = new Map<DASemanticCriterion, CriterionResult>();

  for (const criterion of CRITERIA) {
    const rules = request.rules.filter((rule) => rule.criterion === criterion);
    if (rules.length === 0) {
      resultByCriterion.set(criterion, absentCriterion(criterion, manifest));
      continue;
    }

    const outcomes = rules
      .map((rule) => outcomeByRule.get(rule.ruleId))
      .filter((outcome) => outcome !== undefined);
    if (outcomes.length === 0) {
      resultByCriterion.set(
        criterion,
        notAssessed('The workflow did not return a verified outcome for this criterion.'),
      );
      continue;
    }

    const failed = outcomes.find((outcome) => outcome.status === 'Fail');
    const warned = outcomes.find((outcome) => outcome.status === 'Warning');
    const unassessed = outcomes.find((outcome) => outcome.status === 'Not assessed');
    const aggregateStatus = failed
      ? 'Fail'
      : warned
        ? 'Warning'
        : unassessed
          ? 'Not assessed'
          : 'Pass';
    const issues: EvaluationIssue[] = outcomes
      .filter((outcome) => outcome.status === 'Fail' || outcome.status === 'Warning')
      .map((outcome) => {
        const evidenceReference = outcome.evidence[0];
        const evidence = evidenceReference
          ? evidenceById.get(evidenceReference.evidenceId)
          : undefined;
        return {
          severity: outcome.status === 'Fail' ? 'High' : 'Medium',
          description: outcome.explanation,
          recommendation: outcome.recommendation,
          ruleId: outcome.ruleId,
          method: 'semantic',
          sourceFile: evidence?.sourceFile,
          jsonPath: evidence?.jsonPath,
          evidence: evidenceReference?.exactExcerpt,
        };
      });

    resultByCriterion.set(criterion, {
      status: aggregateStatus,
      issues,
      passingChecks: outcomes
        .filter((outcome) => outcome.status === 'Pass')
        .map((outcome) => ({ description: outcome.explanation })),
      assessmentNotes: outcomes
        .filter((outcome) => outcome.status === 'Not assessed')
        .map((outcome) => {
          const evidenceReference = outcome.evidence[0];
          const evidence = evidenceReference
            ? evidenceById.get(evidenceReference.evidenceId)
            : undefined;
          return {
            status: 'Not assessed',
            description: outcome.explanation,
            sourceFile: evidence?.sourceFile,
            jsonPath: evidence?.jsonPath,
            evidence: evidenceReference?.exactExcerpt,
          };
        }),
    });
  }

  const result = {} as DAEvaluationResult;
  for (const criterion of CRITERIA) {
    result[RESULT_FIELD[criterion]] = resultByCriterion.get(criterion)
      ?? notAssessed('No verified result is available.');
  }
  const issueCount = [...resultByCriterion.values()]
    .reduce((sum, criterion) => sum + criterion.issues.length, 0);
  const notAssessedCount = [...resultByCriterion.values()]
    .filter((criterion) => criterion.status === 'Not assessed').length;
  result.summary = issueCount > 0
    ? `${issueCount} evidence-backed quality issue${issueCount === 1 ? '' : 's'} found.`
    : notAssessedCount > 0
      ? `No quality issues were verified; ${notAssessedCount} criterion${notAssessedCount === 1 ? ' was' : ' were'} not assessed.`
      : 'No evidence-backed quality issues were found.';
  return result;
}

/**
 * Executes a supplied workflow transport and returns verified, projected data.
 *
 * The transport is injected so the Code App contract does not depend on one
 * flow trigger or connector while the user-owned workflow is being built.
 */
export async function evaluateDAWithWorkflow(
  manifest: DAManifest,
  packageEvidence: DAPackageEvidence,
  transport: DAWorkflowTransport,
  correlationId = crypto.randomUUID(),
): Promise<{
  evaluation: DAEvaluationResult;
  provenance: DAWorkflowProvenance;
}> {
  const request = buildDAWorkflowRequest(manifest, packageEvidence, { correlationId });
  return evaluateDAWorkflowRequest(manifest, request, transport);
}

/**
 * Executes an immutable request that was prepared before submission.
 *
 * This entry point is used when a browser resumes a durable Dataverse job. The
 * original correlation ID and evidence allow the returned rows to be verified
 * against exactly what the workflow received.
 */
export async function evaluateDAWorkflowRequest(
  manifest: DAManifest,
  request: DAWorkflowRequest,
  transport: DAWorkflowTransport,
): Promise<{
  evaluation: DAEvaluationResult;
  provenance: DAWorkflowProvenance;
}> {
  const { response, jobId, rejected: transportRejected = [] } = await transport(request);
  const verified = verifyDAWorkflowResponse(request, response);
  const allRejected = [...transportRejected, ...verified.rejected];
  return {
    evaluation: projectDAWorkflowEvaluation(manifest, request, {
      outcomes: verified.outcomes,
      rejected: allRejected,
    }),
    provenance: {
      contractVersion: request.contractVersion,
      correlationId: request.correlationId,
      jobId,
      completedAt: new Date().toISOString(),
      rejectedOutcomeCount: allRejected.length,
    },
  };
}
