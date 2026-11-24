import {
  createReviewJob,
  getReviewJob,
  getReviewJobItemRows,
} from '../agents-experience/services/jobs/ReviewJobService';
import { pollReviewJob } from '../agents-experience/services/jobs/reviewJobPolling';
import type { ReviewJobRow } from '../agents-experience/contracts/ReviewJob';
import type { LocalStageAOutput } from '../contracts/StageOutputs';
import type { StandardReviewWorkflowProvenance } from '../contracts/StandardReviewWorkflow';
import { buildStandardReviewWorkflowCorpus } from '../utils/standardReviewCorpus';
import { parseStandardReviewResultRows } from '../utils/standardReviewResultRows';
import {
  projectStandardReviewWorkflow,
  type StandardReviewWorkflowEvaluation,
} from '../utils/standardReviewWorkflowProjection';

export interface StandardReviewWorkflowContext {
  botId: string;
  botName: string;
  sourceEnvironment: string;
}

export interface StandardReviewWorkflowOptions {
  existingJobId?: string;
  onJobSubmitted?: (jobId: string) => void;
  onJobPoll?: (row: ReviewJobRow, elapsedMs: number) => void;
}

export interface StandardReviewWorkflowExecution
  extends StandardReviewWorkflowEvaluation {
  workflowProvenance: StandardReviewWorkflowProvenance;
}

/**
 * Runs or resumes one Standard review workflow job and returns
 * existing UI models.
 */
export async function evaluateStandardReviewWithWorkflow(
  stageA: LocalStageAOutput,
  context: StandardReviewWorkflowContext,
  options: StandardReviewWorkflowOptions = {},
): Promise<StandardReviewWorkflowExecution> {
  const corpus = buildStandardReviewWorkflowCorpus(stageA, {
    correlationId: crypto.randomUUID(),
    sourceEnvironment: context.sourceEnvironment,
  });
  const jobId = options.existingJobId ?? await createReviewJob(corpus);
  if (!options.existingJobId) {
    options.onJobSubmitted?.(jobId);
  }
  const completedJob = await pollReviewJob({
    getJob: () => getReviewJob(jobId),
    onPoll: options.onJobPoll,
  });
  const rows = await getReviewJobItemRows(jobId);
  const results = parseStandardReviewResultRows(rows, corpus);
  const projected = projectStandardReviewWorkflow(
    stageA,
    corpus,
    results,
  );
  const workflowProvenance: StandardReviewWorkflowProvenance = {
    jobId,
    correlationId: completedJob?.cat_correlationid ?? corpus.review.correlationId,
    reviewPolicyVersion: corpus.reviewPolicyVersion,
    retrievedAt: new Date().toISOString(),
    rejectedCandidateCount: projected.rejectedCandidateCount,
    validationDiagnostics: projected.validationDiagnostics,
    units: corpus.standardReview.reviewUnits.map((unit) => {
      // Read off the raw map value rather than a parsed shape. The Standard
      // branch is frozen on the legacy ART contract, which names its failures
      // `findings`, so this is correct as written — it is not an oversight left
      // behind by the move to `exceptions`. 🔴 Do not "modernise" it: the node
      // emits no `exceptions` here, and renaming the read would silently zero
      // both counts on every Standard review.
      const result = results.get(unit.componentIndex) as {
        findings?: unknown;
        notAssessed?: unknown;
      } | undefined;
      return {
        componentIndex: unit.componentIndex,
        unitId: unit.unitId,
        status: result ? 'succeeded' : 'missing',
        findingCount: Array.isArray(result?.findings) ? result.findings.length : 0,
        notAssessedCount: Array.isArray(result?.notAssessed) ? result.notAssessed.length : 0,
      };
    }),
  };
  return { ...projected, workflowProvenance };
}
