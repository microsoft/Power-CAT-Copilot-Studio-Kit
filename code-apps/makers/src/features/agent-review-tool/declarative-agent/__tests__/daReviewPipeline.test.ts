import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DAManifest } from '../contracts/DAManifest';
import type { DAPackageEvidence } from '../contracts/DAPackageReview';
import { bundle } from '../../agents-experience/__tests__/skillTestFixtures';
vi.mock('../../services/ReviewWorkflowAvailabilityService', () => ({
  assertReviewWorkflowAvailable: vi.fn(async () => undefined),
}));
import { assertReviewWorkflowAvailable } from '../../services/ReviewWorkflowAvailabilityService';

const {
  evaluateDA,
  executeDAReviewJob,
  reviewDACustomSkills,
  upsertDAReview,
} = vi.hoisted(() => ({
  evaluateDA: vi.fn(),
  executeDAReviewJob: vi.fn(),
  reviewDACustomSkills: vi.fn(),
  upsertDAReview: vi.fn(),
}));

vi.mock('../services/DAEvaluationService', () => ({ evaluateDA }));
vi.mock('../services/DAReviewJobService', () => ({ executeDAReviewJob }));
vi.mock('../services/DAAgentSkillReviewService', () => ({ reviewDACustomSkills }));
vi.mock('../services/DAReviewService', () => ({ upsertDAReview }));

import {
  executeDAReviewPipeline,
  type DAPreparedReviewInput,
} from '../hooks/useDAReviewMutation';

const manifest: DAManifest = {
  appId: 'app-1',
  appVersion: '1.0.0',
  manifestVersion: '1.19',
  shortName: 'Synthetic agent',
  fullName: 'Synthetic agent',
  shortDescription: 'Synthetic description',
  fullDescription: 'Synthetic description',
  developerName: 'Contoso',
  accentColor: '#000000',
  iconBase64: null,
  pluginFiles: {},
  schemaVersion: 'v1.8',
  daId: 'agent-1',
  name: 'Synthetic agent',
  description: 'Synthetic description',
  instructions: 'Use concise answers.',
  capabilities: [],
  actions: [],
  conversationStarters: [],
};

const packageEvidence: DAPackageEvidence = {
  rootManifestPath: 'manifest.json',
  declarativeAgentPath: 'declarativeAgent.json',
  documents: [],
  references: [],
  records: [{
    evidenceId: 'declarativeAgent.json#$.instructions',
    kind: 'json-value',
    sourceFile: 'declarativeAgent.json',
    jsonPath: '$.instructions',
    content: 'Use concise answers.',
    status: 'available',
  }],
};

describe('Declarative Agent review pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertDAReview.mockResolvedValue('review-1');
    reviewDACustomSkills.mockResolvedValue({
      reviews: [],
      issues: [],
    });
    executeDAReviewJob.mockImplementation(async (request) => ({
      jobId: 'job-1',
      rejected: [],
      response: {
        contractVersion: request.contractVersion,
        correlationId: request.correlationId,
        state: 'completed',
        outcomes: [],
      },
    }));
  });

  it('blocks a new package review before custom-skill AI, job submission, or saving', async () => {
    vi.mocked(assertReviewWorkflowAvailable).mockRejectedValueOnce(
      new Error('Agent Review Workflow add-on is not installed.'),
    );
    await expect(executeDAReviewPipeline({
      manifest, packageEvidence, sourceType: 'zip', skillBundles: [bundle()],
    })).rejects.toThrow('add-on is not installed');
    expect(reviewDACustomSkills).not.toHaveBeenCalled();
    expect(executeDAReviewJob).not.toHaveBeenCalled();
    expect(upsertDAReview).not.toHaveBeenCalled();
  });

  it('uses the durable job transport for package evidence and reports a restart snapshot', async () => {
    const onPrepared = vi.fn<(input: DAPreparedReviewInput) => void>();
    const onJobSubmitted = vi.fn();

    const result = await executeDAReviewPipeline(
      {
        manifest,
        packageEvidence,
        sourceType: 'zip',
      },
      {
        correlationId: 'correlation-1',
        existingJobId: 'existing-job',
        onPrepared,
        onJobSubmitted,
      },
    );

    expect(evaluateDA).not.toHaveBeenCalled();
    expect(assertReviewWorkflowAvailable).not.toHaveBeenCalled();
    expect(executeDAReviewJob).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: 'correlation-1' }),
      expect.objectContaining({
        existingJobId: 'existing-job',
        onJobSubmitted,
      }),
    );
    expect(onPrepared).toHaveBeenCalledWith(expect.objectContaining({
      componentIdUnique: expect.any(String),
      workflowRequest: expect.objectContaining({
        correlationId: 'correlation-1',
      }),
      retainedEvidence: packageEvidence.records,
    }));
    expect(result).toMatchObject({
      reviewId: 'review-1',
      workflowProvenance: {
        jobId: 'job-1',
        correlationId: 'correlation-1',
      },
    });
  });

  it('resumes from a prepared request without rebuilding package evidence', async () => {
    const first = await executeDAReviewPipeline(
      { manifest, packageEvidence, sourceType: 'zip' },
      { correlationId: 'correlation-1' },
    );
    const savedRequest = vi.mocked(executeDAReviewJob).mock.calls[0][0];
    vi.clearAllMocks();
    upsertDAReview.mockResolvedValue('review-1');
    executeDAReviewJob.mockImplementation(async (request) => ({
      jobId: 'job-1',
      rejected: [],
      response: {
        contractVersion: request.contractVersion,
        correlationId: request.correlationId,
        state: 'completed',
        outcomes: [],
      },
    }));

    const resumed = await executeDAReviewPipeline({
      manifest,
      sourceType: 'zip',
      workflowRequest: savedRequest,
      existingJobId: 'job-1',
      componentIdUnique: first.componentIdUnique,
      manifestHealth: first.manifestHealth,
      packageValidation: first.packageValidation,
      retainedEvidence: savedRequest.evidence,
    });

    expect(executeDAReviewJob).toHaveBeenCalledWith(
      savedRequest,
      expect.objectContaining({ existingJobId: 'job-1' }),
    );
    expect(resumed.workflowProvenance?.correlationId).toBe('correlation-1');
  });

  it('uses the existing evaluator only when no package request is available', async () => {
    evaluateDA.mockResolvedValue({
      instructionsCriterion: { status: 'Pass', issues: [], passingChecks: [] },
      knowledgeCriterion: { status: 'N/A', issues: [], passingChecks: [] },
      capabilitiesCriterion: { status: 'N/A', issues: [], passingChecks: [] },
      actionsCriterion: { status: 'N/A', issues: [], passingChecks: [] },
      conversationStartersCriterion: { status: 'N/A', issues: [], passingChecks: [] },
      gracefulErrorHandlingCriterion: { status: 'Pass', issues: [], passingChecks: [] },
      summary: 'Synthetic legacy result.',
    });

    await executeDAReviewPipeline({
      manifest,
      sourceType: 'graph-api',
      orgUrl: 'https://example.crm.dynamics.com',
    });

    expect(evaluateDA).toHaveBeenCalledWith(
      manifest,
      'https://example.crm.dynamics.com',
    );
    expect(executeDAReviewJob).not.toHaveBeenCalled();
  });

  it('evaluates custom skills once and carries sanitized results through recovery and persistence', async () => {
    const skillBundle = bundle({
      skillName: 'synthetic-skill',
      skillSchemaName: 'synthetic-skill',
    });
    const customSkillReview = {
      skillName: 'synthetic-skill',
      skillSchemaName: 'synthetic-skill',
      findings: [{ id: 'finding-1', severity: 'medium' }],
    };
    reviewDACustomSkills.mockResolvedValue({
      reviews: [customSkillReview],
      issues: [],
    });
    const onPrepared = vi.fn<(input: DAPreparedReviewInput) => void>();

    const result = await executeDAReviewPipeline(
      {
        manifest: {
          ...manifest,
          schemaVersion: 'v1.9',
          customSkills: {
            appFolders: ['skills/synthetic-skill'],
            agentFolders: ['skills/synthetic-skill'],
          },
        },
        packageEvidence,
        skillBundles: [skillBundle],
        sourceType: 'zip',
      },
      {
        correlationId: 'correlation-skills',
        onPrepared,
      },
    );

    expect(reviewDACustomSkills).toHaveBeenCalledWith(
      [skillBundle],
      manifest.instructions,
      {},
      undefined,
    );
    expect(onPrepared).toHaveBeenCalledWith(expect.objectContaining({
      customSkillReviews: [customSkillReview],
      customSkillIssues: [],
    }));
    expect(upsertDAReview).toHaveBeenCalledWith(expect.objectContaining({
      customSkillReviews: [customSkillReview],
      customSkillIssues: [],
    }));
    expect(result.customSkillReviews).toEqual([customSkillReview]);
  });

  it('captures one cancellation signal before custom-skill work and stops before job submission', async () => {
    const controller = new AbortController();
    let signalAvailable = true;
    const getAbortSignal = vi.fn(() =>
      signalAvailable ? controller.signal : undefined);
    reviewDACustomSkills.mockImplementation(async () => {
      signalAvailable = false;
      controller.abort();
      return { reviews: [], issues: [] };
    });

    await expect(executeDAReviewPipeline(
      {
        manifest,
        packageEvidence,
        skillBundles: [bundle()],
        sourceType: 'zip',
      },
      { getAbortSignal },
    )).rejects.toMatchObject({ name: 'AbortError' });

    expect(getAbortSignal).toHaveBeenCalledTimes(1);
    expect(reviewDACustomSkills).toHaveBeenCalledWith(
      expect.any(Array),
      manifest.instructions,
      expect.any(Object),
      controller.signal,
    );
    expect(executeDAReviewJob).not.toHaveBeenCalled();
    expect(upsertDAReview).not.toHaveBeenCalled();
  });

  it('does not persist a review cancelled while collecting the durable job', async () => {
    const controller = new AbortController();
    executeDAReviewJob.mockImplementation(async (request) => {
      controller.abort();
      return {
        jobId: 'job-1',
        rejected: [],
        response: {
          contractVersion: request.contractVersion,
          correlationId: request.correlationId,
          state: 'completed',
          outcomes: [],
        },
      };
    });

    await expect(executeDAReviewPipeline(
      { manifest, packageEvidence, sourceType: 'zip' },
      { signal: controller.signal },
    )).rejects.toMatchObject({ name: 'AbortError' });

    expect(upsertDAReview).not.toHaveBeenCalled();
  });

  it('accepts the runner-owned signal as part of one execution input', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(executeDAReviewPipeline({
      manifest,
      packageEvidence,
      sourceType: 'zip',
      abortSignal: controller.signal,
    } as DAReviewExecutionInput)).rejects.toMatchObject({ name: 'AbortError' });

    expect(executeDAReviewJob).not.toHaveBeenCalled();
    expect(upsertDAReview).not.toHaveBeenCalled();
  });
});
