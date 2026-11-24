import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DAWorkflowRequest } from '../contracts/DAWorkflowReview';
import type { ReviewJobItemRow } from '../../agents-experience/contracts/ReviewJob';

const {
  createReviewJob,
  findReviewJobByCorrelationId,
  getReviewJob,
  getReviewJobItemRows,
  pollReviewJob,
} = vi.hoisted(() => ({
  createReviewJob: vi.fn(),
  findReviewJobByCorrelationId: vi.fn(),
  getReviewJob: vi.fn(),
  getReviewJobItemRows: vi.fn(),
  pollReviewJob: vi.fn(),
}));

vi.mock('../../agents-experience/services/jobs/ReviewJobService', () => ({
  createReviewJob,
  findReviewJobByCorrelationId,
  getReviewJob,
  getReviewJobItemRows,
}));

vi.mock('../../agents-experience/services/jobs/reviewJobPolling', () => ({
  pollReviewJob,
}));

import {
  buildDAReviewJobCorpus,
  executeDAReviewJob,
  parseDAReviewJobRows,
} from '../services/DAReviewJobService';

const request: DAWorkflowRequest = {
  contractVersion: '1.0',
  correlationId: 'correlation-1',
  agent: {
    id: 'agent-1',
    name: 'Synthetic agent',
    version: 'v1.8',
  },
  rules: [
    {
      ruleId: 'semantic.instructions.quality',
      criterion: 'instructions',
      evidenceIds: ['agent.json#$.instructions'],
    },
    {
      ruleId: 'semantic.actions.quality',
      criterion: 'actions',
      evidenceIds: ['plugin.json#$'],
    },
  ],
  evidence: [
    {
      evidenceId: 'agent.json#$.instructions',
      kind: 'json-value',
      sourceFile: 'agent.json',
      jsonPath: '$.instructions',
      content: 'Use concise answers.',
      status: 'available',
    },
    {
      evidenceId: 'plugin.json#$',
      kind: 'document',
      sourceFile: 'plugin.json',
      jsonPath: '$',
      content: '{"name":"Synthetic action"}',
      status: 'available',
    },
    {
      evidenceId: 'unused.json#$',
      kind: 'document',
      sourceFile: 'unused.json',
      jsonPath: '$',
      content: 'Must not be sent to a rule.',
      status: 'available',
    },
  ],
};

function resultRow(
  index: number,
  ruleId: string,
  outcome: Record<string, unknown>,
): ReviewJobItemRow {
  return {
    cat_agentreviewjobitemid: `item-${index}`,
    cat_componentindex: index,
    cat_componentid: ruleId,
    cat_skillname: ruleId,
    cat_correlationid: request.correlationId,
    cat_itemstatus: 1,
    cat_resultjson: JSON.stringify({
      contractVersion: request.contractVersion,
      correlationId: request.correlationId,
      outcome,
    }),
  };
}

describe('Declarative review job corpus', () => {
  it('creates one self-contained component per requested semantic rule', () => {
    const corpus = buildDAReviewJobCorpus(request);

    expect(corpus.jobKind).toBe('DeclarativeAgent');
    expect(corpus.review).toMatchObject({
      correlationId: request.correlationId,
      botId: request.agent.id,
      botName: request.agent.name,
      componentCount: 2,
    });
    expect(corpus.declarativeReview.request).toEqual(request);
    expect(corpus.components).toEqual([
      expect.objectContaining({
        componentIndex: 0,
        ruleId: 'semantic.instructions.quality',
        evidence: [request.evidence[0]],
      }),
      expect.objectContaining({
        componentIndex: 1,
        ruleId: 'semantic.actions.quality',
        evidence: [request.evidence[1]],
      }),
    ]);
    expect(corpus.components[0].evidence).not.toContainEqual(request.evidence[2]);
  });
});

describe('Declarative review job result rows', () => {
  it('accepts one correlated result row for each requested rule', () => {
    const parsed = parseDAReviewJobRows(request, [
      resultRow(0, request.rules[0].ruleId, {
        ruleId: request.rules[0].ruleId,
        status: 'Pass',
        evidence: [{
          evidenceId: request.evidence[0].evidenceId,
          exactExcerpt: 'concise answers',
        }],
        explanation: 'The instruction is direct.',
        recommendation: '',
      }),
      resultRow(1, request.rules[1].ruleId, {
        ruleId: request.rules[1].ruleId,
        status: 'Not assessed',
        evidence: [],
        explanation: 'The action needs runtime context.',
        recommendation: '',
      }),
    ]);

    expect(parsed.outcomes).toHaveLength(2);
    expect(parsed.rejected).toHaveLength(0);
  });

  it('rejects every duplicate row for a rule instead of choosing one silently', () => {
    const duplicate = resultRow(0, request.rules[0].ruleId, {
      ruleId: request.rules[0].ruleId,
      status: 'Pass',
      evidence: [],
      explanation: 'Synthetic duplicate.',
      recommendation: '',
    });

    const parsed = parseDAReviewJobRows(request, [duplicate, {
      ...duplicate,
      cat_agentreviewjobitemid: 'item-duplicate',
    }]);

    expect(parsed.outcomes).toHaveLength(0);
    expect(parsed.rejected).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: request.rules[0].ruleId,
        reason: expect.stringMatching(/more than once/i),
      }),
    ]));
  });

  it('turns failed, malformed, mismatched, and missing rows into rejected outcomes', () => {
    const parsed = parseDAReviewJobRows(request, [
      {
        ...resultRow(0, 'wrong-rule', {}),
        cat_componentid: 'wrong-rule',
        cat_skillname: 'wrong-rule',
      },
      {
        cat_agentreviewjobitemid: 'unexpected',
        cat_componentindex: 99,
        cat_componentid: 'unexpected-rule',
        cat_skillname: 'unexpected-rule',
        cat_correlationid: request.correlationId,
        cat_itemstatus: 2,
        cat_errormessage: 'Synthetic failure.',
      },
    ]);

    expect(parsed.outcomes).toHaveLength(0);
    expect(parsed.rejected).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: request.rules[0].ruleId,
        reason: expect.stringMatching(/expected rule/i),
      }),
      expect.objectContaining({
        ruleId: request.rules[1].ruleId,
        reason: expect.stringMatching(/no result row/i),
      }),
      expect.objectContaining({
        ruleId: 'unexpected-rule',
        reason: expect.stringMatching(/unexpected/i),
      }),
    ]));
  });

  it('rejects a row without a successful item status', () => {
    const row = resultRow(0, request.rules[0].ruleId, {
      ruleId: request.rules[0].ruleId,
      status: 'Pass',
      evidence: [],
      explanation: 'Synthetic result.',
      recommendation: '',
    });
    row.cat_itemstatus = undefined;

    const parsed = parseDAReviewJobRows(request, [row]);

    expect(parsed.outcomes).toHaveLength(0);
    expect(parsed.rejected).toContainEqual(expect.objectContaining({
      ruleId: request.rules[0].ruleId,
      reason: expect.stringMatching(/status/i),
    }));
  });

  it('rejects an outcome whose rule ID differs from the row identity', () => {
    const parsed = parseDAReviewJobRows(request, [
      resultRow(0, request.rules[0].ruleId, {
        ruleId: request.rules[1].ruleId,
        status: 'Pass',
        evidence: [],
        explanation: 'Synthetic mismatched result.',
        recommendation: '',
      }),
    ]);

    expect(parsed.outcomes).toHaveLength(0);
    expect(parsed.rejected).toContainEqual(expect.objectContaining({
      ruleId: request.rules[0].ruleId,
      reason: expect.stringMatching(/outcome.*rule/i),
    }));
  });
});

describe('Declarative durable workflow execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findReviewJobByCorrelationId.mockResolvedValue(null);
    createReviewJob.mockResolvedValue('new-job');
    pollReviewJob.mockResolvedValue({
      cat_agentreviewjobid: 'new-job',
      cat_jobstatus: 3,
    });
    getReviewJobItemRows.mockResolvedValue([]);
  });

  it('resumes the job with the same correlation ID instead of submitting twice', async () => {
    findReviewJobByCorrelationId.mockResolvedValue({
      cat_agentreviewjobid: 'existing-job',
      cat_jobstatus: 2,
    });
    const onJobSubmitted = vi.fn();

    const result = await executeDAReviewJob(request, { onJobSubmitted });

    expect(createReviewJob).not.toHaveBeenCalled();
    expect(onJobSubmitted).toHaveBeenCalledWith('existing-job');
    expect(result.jobId).toBe('existing-job');
    const pollingOptions = pollReviewJob.mock.calls[0][0] as {
      getJob: () => Promise<unknown>;
    };
    await pollingOptions.getJob();
    expect(getReviewJob).toHaveBeenCalledWith('existing-job');
  });

  it('creates, reports, polls, and reads a new durable job', async () => {
    const onJobSubmitted = vi.fn();

    const result = await executeDAReviewJob(request, { onJobSubmitted });

    expect(createReviewJob).toHaveBeenCalledWith(
      expect.objectContaining({ jobKind: 'DeclarativeAgent' }),
      undefined,
    );
    expect(onJobSubmitted).toHaveBeenCalledWith('new-job');
    expect(pollReviewJob).toHaveBeenCalledOnce();
    expect(getReviewJobItemRows).toHaveBeenCalledWith('new-job');
    expect(result).toMatchObject({
      jobId: 'new-job',
      response: {
        contractVersion: request.contractVersion,
        correlationId: request.correlationId,
        state: 'completed',
      },
    });
  });

  it('salvages a failed parent only when a child row explicitly succeeded', async () => {
    getReviewJobItemRows.mockResolvedValue([{
      cat_agentreviewjobitemid: 'item-1',
      cat_resultjson: '{"outcome":{}}',
    }]);

    await executeDAReviewJob(request);

    const pollingOptions = pollReviewJob.mock.calls[0][0] as {
      hasSalvageableResults: () => Promise<boolean>;
    };
    await expect(pollingOptions.hasSalvageableResults()).resolves.toBe(false);

    getReviewJobItemRows.mockResolvedValue([{
      cat_agentreviewjobitemid: 'item-1',
      cat_itemstatus: 1,
      cat_resultjson: '{"outcome":{}}',
    }]);
    await expect(pollingOptions.hasSalvageableResults()).resolves.toBe(true);
  });
});
