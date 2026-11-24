import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalStageAOutput } from '../../contracts/StageOutputs';

const {
  createReviewJob,
  getReviewJob,
  getReviewJobItemRows,
  pollReviewJob,
  buildCorpus,
  parseRows,
  projectWorkflow,
} = vi.hoisted(() => ({
  createReviewJob: vi.fn(),
  getReviewJob: vi.fn(),
  getReviewJobItemRows: vi.fn(),
  pollReviewJob: vi.fn(),
  buildCorpus: vi.fn(),
  parseRows: vi.fn(),
  projectWorkflow: vi.fn(),
}));

vi.mock('../../agents-experience/services/jobs/ReviewJobService', () => ({
  createReviewJob,
  getReviewJob,
  getReviewJobItemRows,
}));
vi.mock('../../agents-experience/services/jobs/reviewJobPolling', () => ({
  pollReviewJob,
}));
vi.mock('../../utils/standardReviewCorpus', () => ({
  buildStandardReviewWorkflowCorpus: buildCorpus,
}));
vi.mock('../../utils/standardReviewResultRows', () => ({
  parseStandardReviewResultRows: parseRows,
}));
vi.mock('../../utils/standardReviewWorkflowProjection', () => ({
  projectStandardReviewWorkflow: projectWorkflow,
}));

import { evaluateStandardReviewWithWorkflow } from '../StandardReviewWorkflowService';

const stageA = {
  botId: 'standard-bot',
  botName: 'Standard Bot',
  topicCount: 0,
  toolCount: 0,
  knowledgeCount: 0,
  testCaseCount: 0,
  topics: [],
  topicComponents: [],
  tools: [],
  knowledgeSources: [],
  localPatterns: [],
  orchestrationMode: 'generative',
  source: 'live',
} satisfies LocalStageAOutput;

const context = {
  botId: 'standard-bot',
  botName: 'Standard Bot',
  sourceEnvironment: 'current',
};

describe('Standard review workflow attachment', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    buildCorpus.mockReturnValue({
      review: {
        botId: 'standard-bot',
        correlationId: 'synthetic-correlation',
      },
      reviewPolicyVersion: 'standard-review-2',
      standardReview: {
        reviewUnits: [{
          componentIndex: 9500,
          unitId: 'standard-configuration-quality',
        }],
      },
    });
    createReviewJob.mockResolvedValue('new-job');
    pollReviewJob.mockResolvedValue(undefined);
    getReviewJobItemRows.mockResolvedValue([{
      cat_componentindex: 9500,
      cat_componentid: 'standard-configuration-quality',
    }]);
    parseRows.mockReturnValue(new Map([[
      9500,
      {
        findings: [{ ruleId: 'synthetic-rule' }],
        notAssessed: [{ ruleId: 'synthetic-unavailable' }],
      },
    ]]));
    projectWorkflow.mockReturnValue({
      patternEvaluation: { Patterns: [] },
      instructionEvaluation: { compliancePercentage: 0, issues: [] },
      rejectedCandidateCount: 2,
      validationDiagnostics: {
        rejectedCandidates: [{
          unitId: 'standard-configuration-quality',
          ruleId: 'synthetic-rule',
          reason: 'The synthetic candidate failed validation.',
          outcomeImpact: 'incomplete',
        }],
        normalizations: [{
          unitId: 'standard-instruction-safety',
          ruleId: 'privacy-and-sensitive-data',
          field: 'findingTitle',
          originalLength: 249,
          normalizedLength: 200,
          reason: 'The generated title exceeded the display limit and was shortened.',
        }],
      },
    });
  });

  it('collects an existing job without submitting duplicate AI work', async () => {
    const onJobSubmitted = vi.fn();
    pollReviewJob.mockResolvedValue({
      cat_correlationid: 'restored-correlation',
    });

    const result = await evaluateStandardReviewWithWorkflow(stageA, context, {
      existingJobId: 'existing-job',
      onJobSubmitted,
    });

    expect(createReviewJob).not.toHaveBeenCalled();
    expect(pollReviewJob).toHaveBeenCalledOnce();
    const pollingOptions = pollReviewJob.mock.calls[0][0] as {
      getJob: () => Promise<unknown>;
    };
    await pollingOptions.getJob();
    expect(getReviewJob).toHaveBeenCalledWith('existing-job');
    expect(getReviewJobItemRows).toHaveBeenCalledWith('existing-job');
    expect(onJobSubmitted).not.toHaveBeenCalled();
    expect(result.workflowProvenance.correlationId).toBe('restored-correlation');
  });

  it('reports a newly submitted job for restart recovery', async () => {
    const onJobSubmitted = vi.fn();

    await evaluateStandardReviewWithWorkflow(stageA, context, {
      onJobSubmitted,
    });

    expect(createReviewJob).toHaveBeenCalledOnce();
    expect(onJobSubmitted).toHaveBeenCalledWith('new-job');
    expect(getReviewJobItemRows).toHaveBeenCalledWith('new-job');
  });

  it('forwards job polling updates to the review pipeline', async () => {
    const onJobPoll = vi.fn();

    await evaluateStandardReviewWithWorkflow(stageA, context, {
      onJobPoll,
    });

    const pollingOptions = pollReviewJob.mock.calls[0][0] as {
      onPoll?: (row: unknown, elapsedMs: number) => void;
    };
    const queued = { cat_jobstatus: 1 };
    pollingOptions.onPoll?.(queued, 180_000);

    expect(onJobPoll).toHaveBeenCalledWith(queued, 180_000);
  });

  it('returns durable workflow provenance with all collected unit outcomes', async () => {
    const result = await evaluateStandardReviewWithWorkflow(stageA, context);

    expect(result.workflowProvenance).toMatchObject({
      jobId: 'new-job',
      correlationId: 'synthetic-correlation',
      reviewPolicyVersion: 'standard-review-2',
      rejectedCandidateCount: 2,
      units: [{
        componentIndex: 9500,
        unitId: 'standard-configuration-quality',
        status: 'succeeded',
        findingCount: 1,
        notAssessedCount: 1,
      }],
    });
    expect(result.workflowProvenance.retrievedAt).toEqual(expect.any(String));
    expect(result.workflowProvenance.validationDiagnostics).toEqual({
      rejectedCandidates: [{
        unitId: 'standard-configuration-quality',
        ruleId: 'synthetic-rule',
        reason: 'The synthetic candidate failed validation.',
        outcomeImpact: 'incomplete',
      }],
      normalizations: [{
        unitId: 'standard-instruction-safety',
        ruleId: 'privacy-and-sensitive-data',
        field: 'findingTitle',
        originalLength: 249,
        normalizedLength: 200,
        reason: 'The generated title exceeded the display limit and was shortened.',
      }],
    });
  });
});
