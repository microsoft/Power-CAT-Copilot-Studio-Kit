/**
 * Runs one Declarative Agent job against Dataverse.
 *
 * The job's *contract* — the corpus it submits and the rules for reading the
 * rows it gets back — lives in `daReviewJobContract` and is pure, so a second
 * host can share it. This module is the half that cannot be shared: it holds
 * the four Dataverse calls. Both halves are re-exported from here so that
 * nothing which already imports from this module has to change.
 */
import { ReviewJobItemStatus, type ReviewJobRow } from '../../agents-experience/contracts/ReviewJob';
import {
  createReviewJob,
  findReviewJobByCorrelationId,
  getReviewJob,
  getReviewJobItemRows,
} from '../../agents-experience/services/jobs/ReviewJobService';
import { pollReviewJob } from '../../agents-experience/services/jobs/reviewJobPolling';
import type {
  DARejectedWorkflowOutcome,
  DAWorkflowRequest,
  DAWorkflowResponse,
} from '../contracts/DAWorkflowReview';
import { buildDAReviewJobCorpus, parseDAReviewJobRows } from './daReviewJobContract';

export {
  buildDAReviewJobCorpus,
  parseDAReviewJobRows,
} from './daReviewJobContract';
export type {
  DAReviewJobComponent,
  DAReviewJobCorpus,
  DAReviewJobItemPayload,
  ParsedDAReviewJobRows,
} from './daReviewJobContract';

export interface DAReviewJobOptions {
  existingJobId?: string;
  signal?: AbortSignal;
  onJobSubmitted?: (jobId: string) => void;
  onJobPoll?: (row: ReviewJobRow, elapsedMs: number) => void | Promise<void>;
}

export interface DAReviewJobExecutionResult {
  response: DAWorkflowResponse;
  jobId: string;
  rejected: DARejectedWorkflowOutcome[];
}

/**
 * Submits or resumes one Declarative Agent job and returns its collected rows
 * as the existing versioned workflow response.
 */
export async function executeDAReviewJob(
  request: DAWorkflowRequest,
  options: DAReviewJobOptions = {},
): Promise<DAReviewJobExecutionResult> {
  const existing = options.existingJobId
    ? null
    : await findReviewJobByCorrelationId(request.correlationId);
  const jobId = options.existingJobId
    ?? existing?.cat_agentreviewjobid
    ?? await createReviewJob(buildDAReviewJobCorpus(request), options.signal);

  options.onJobSubmitted?.(jobId);

  await pollReviewJob({
    getJob: () => getReviewJob(jobId),
    signal: options.signal,
    onPoll: options.onJobPoll,
    hasSalvageableResults: async () => {
      const rows = await getReviewJobItemRows(jobId);
      return rows.some(
        (row) =>
          row.cat_itemstatus === ReviewJobItemStatus.Succeeded
          && Boolean(row.cat_resultjson?.trim()),
      );
    },
  });

  const parsed = parseDAReviewJobRows(
    request,
    await getReviewJobItemRows(jobId),
  );
  return {
    jobId,
    response: {
      contractVersion: request.contractVersion,
      correlationId: request.correlationId,
      state: 'completed',
      outcomes: parsed.outcomes,
    },
    rejected: parsed.rejected,
  };
}
