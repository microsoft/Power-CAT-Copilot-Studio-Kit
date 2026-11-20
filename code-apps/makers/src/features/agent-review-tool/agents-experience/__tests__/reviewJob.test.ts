/**
 * Unit tests for the workflow-backed review job (spec 014).
 *
 * Covers the three places this contract has actually broken during the spike:
 * double-encoded output, unregistered rule ids, and polling behaviour under
 * throttling and cancellation.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/ReviewWorkflowAvailabilityService', () => ({
  assertReviewWorkflowAvailable: vi.fn(async () => undefined),
}));

// @microsoft/power-apps ships extensionless ESM re-exports that native Node
// cannot resolve, so the generated Dataverse service is stubbed â€” the same
// pattern the existing agent-review tests use.
// The generated per-table services are the supported path for the current
// environment. @microsoft/power-apps ships extensionless ESM re-exports that
// native Node cannot resolve, so they are stubbed here.
vi.mock('../../../../generated/services/Cat_agentreviewjobsService', () => ({
  Cat_agentreviewjobsService: {
    create: vi.fn(),
    update: vi.fn(),
    get: vi.fn(),
    getAll: vi.fn(),
    upload: vi.fn(),
  },
}));

vi.mock('../../../../generated/services/Cat_agentreviewjobitemsService', () => ({
  Cat_agentreviewjobitemsService: {
    getAll: vi.fn(),
  },
}));

import { Cat_agentreviewjobsService } from '../../../../generated/services/Cat_agentreviewjobsService';
import { Cat_agentreviewjobitemsService } from '../../../../generated/services/Cat_agentreviewjobitemsService';
import { assertReviewWorkflowAvailable } from '../../services/ReviewWorkflowAvailabilityService';
import {
  createReviewJob,
  findLatestJobForBot,
  findReviewJobByCorrelationId,
  mapReviewJobItems,
  countCompletedComponents,
  getAgentLevelResult,
  AGENT_LEVEL_INDEX,
} from '../services/jobs/ReviewJobService';
import {
  classifyFailure,
  isTerminal,
  pollIntervalFor,
  pollReviewJob,
  throttleDelayMs,
} from '../services/jobs/reviewJobPolling';
import { toSkillReviewProgress, formatLastCompleted } from '../services/jobs/reviewJobProgress';
import { routeForSubmission } from '../services/jobs/aiWorkflowRouting';
import { toStandardEvaluation, WorkflowReviewAiProvider } from '../services/ai-providers/WorkflowReviewAiProvider';
import type { SkillBundle } from '../contracts/SkillBundle';
import type { StandardPromptPayload } from '../services/skill/SkillPromptPayloadBuilder';
import { ReviewJobStatus, ReviewJobKind, ReviewHarness, type AgentComponentResult, type ReviewJobItemRow, type ReviewJobRow } from '../contracts/ReviewJob';

const noSleep = () => Promise.resolve();

describe('mapReviewJobItems', () => {
  const item = (over: Partial<ReviewJobItemRow>): ReviewJobItemRow => ({
    cat_agentreviewjobitemid: 'i1',
    ...over,
  });

  it('parses the structured output the workflow stored per component', () => {
    const rows = [
      item({
        cat_skillname: 'password-reset',
        cat_resultjson: JSON.stringify({
          skillName: 'password-reset',
          dimensions: [],
          findings: [],
          summary: 's',
        }),
      }),
    ];
    const results = mapReviewJobItems(rows);
    expect(results).toHaveLength(1);
    expect(results[0].skillName).toBe('password-reset');
  });

  it('defaults the status the platform does not enforce', () => {
    const rows = [
      item({ cat_resultjson: JSON.stringify({ skillName: 'a', summary: '' }) }),
    ];
    expect(mapReviewJobItems(rows)[0].status).toBe('complete');
  });

  it('falls back to the row column when the payload omits skillName', () => {
    const rows = [
      item({ cat_skillname: 'laptop-request', cat_resultjson: JSON.stringify({ summary: '' }) }),
    ];
    expect(mapReviewJobItems(rows)[0].skillName).toBe('laptop-request');
  });

  it('skips unusable rows instead of failing the whole review', () => {
    const rows = [
      item({ cat_agentreviewjobitemid: 'i1', cat_resultjson: '' }),
      item({ cat_agentreviewjobitemid: 'i2', cat_resultjson: 'not json' }),
      item({
        cat_agentreviewjobitemid: 'i3',
        cat_resultjson: JSON.stringify({ skillName: 'ok', summary: '' }),
      }),
    ];
    const results = mapReviewJobItems(rows);
    expect(results).toHaveLength(1);
    expect(results[0].skillName).toBe('ok');
  });

  it('coerces malformed arrays to empty rather than throwing', () => {
    const rows = [
      item({
        cat_resultjson: JSON.stringify({
          skillName: 'a',
          dimensions: 'not-an-array',
          findings: null,
        }),
      }),
    ];
    const r = mapReviewJobItems(rows)[0];
    expect(r.dimensions).toEqual([]);
    expect(r.findings).toEqual([]);
  });

  it('keeps one result per component when a retry wrote duplicate rows', () => {
    // Shape observed in CSK-Dev: resubmits and retried iterations left 18 rows
    // for a 3-component job, several with a null cat_resultjson.
    const rows = [
      item({ cat_componentindex: 0, cat_skillname: 'password-reset' }),
      item({
        cat_componentindex: 0,
        cat_skillname: 'password-reset',
        cat_resultjson: JSON.stringify({ skillName: 'password-reset', summary: 'first' }),
      }),
      item({
        cat_componentindex: 0,
        cat_skillname: 'password-reset',
        cat_resultjson: JSON.stringify({ skillName: 'password-reset', summary: 'newest' }),
      }),
      item({
        cat_componentindex: 1,
        cat_skillname: 'laptop-request',
        cat_resultjson: JSON.stringify({ skillName: 'laptop-request', summary: 'only' }),
      }),
    ];

    const results = mapReviewJobItems(rows);
    expect(results).toHaveLength(2);
    // Caller orders createdon asc, so the last usable row is the most recent.
    expect(results[0].summary).toBe('newest');
    expect(results[1].summary).toBe('only');
  });

  it('separates components that share a skill name', () => {
    const rows = [
      item({
        cat_componentindex: 0,
        cat_resultjson: JSON.stringify({ skillName: 'shared', summary: 'a' }),
      }),
      item({
        cat_componentindex: 1,
        cat_resultjson: JSON.stringify({ skillName: 'shared', summary: 'b' }),
      }),
    ];
    expect(mapReviewJobItems(rows)).toHaveLength(2);
  });

  // The agent-level stages share this table with the per-component loop and are
  // told apart only by componentIndex. Their payloads carry status/findings/
  // summary, so without the guard they map cleanly into extra "skills".
  it.each([
    ['orchestration', AGENT_LEVEL_INDEX.ORCHESTRATION, 'orchestration'],
    ['instruction coverage', AGENT_LEVEL_INDEX.INSTRUCTION_COVERAGE, 'coverage'],
  ])('excludes the %s row from component results', (_label, index, name) => {
    const components = [0, 1].map((i) =>
      item({
        cat_componentindex: i,
        cat_resultjson: JSON.stringify({ skillName: `skill-${i}`, summary: 'ok' }),
      }),
    );
    const agentLevel = item({
      cat_componentindex: index,
      cat_skillname: name,
      cat_resultjson: JSON.stringify({
        status: 'complete',
        findings: [{ ruleId: 'XSK-01', severity: 'high' }],
        summary: 'agent-level result',
      }),
    });

    const results = mapReviewJobItems([...components, agentLevel]);

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.skillName)).toEqual(['skill-0', 'skill-1']);
  });

  it('excludes per-resource rows from component results', () => {
    const rows = [
      item({
        cat_componentindex: 0,
        cat_resultjson: JSON.stringify({ skillName: 'skill-0', summary: 'ok' }),
      }),
      item({
        cat_componentindex: 1000,
        cat_skillname: 'skill-0/reference.md',
        cat_resultjson: JSON.stringify({ skillName: 'skill-0/reference.md', summary: 'resource' }),
      }),
    ];
    expect(mapReviewJobItems(rows)).toHaveLength(1);
  });

  it('keeps rows written before the index was bound', () => {
    const rows = [
      item({
        cat_skillname: 'legacy',
        cat_resultjson: JSON.stringify({ skillName: 'legacy', summary: 'no index' }),
      }),
    ];
    expect(mapReviewJobItems(rows)).toHaveLength(1);
  });
});

describe('createReviewJob ordering', () => {
  const corpus = {
    schemaVersion: 1 as const,
    jobKind: 'StandardSkillBundle' as const,
    generatedBy: 'test',
    generatedOn: '2026-01-01T00:00:00Z',
    review: {
      correlationId: 'c1',
      botId: 'b1',
      botName: 'Bot',
      sourceEnvironment: '',
      componentCount: 1,
    },
    components: [],
  };

  afterEach(() => {
    vi.mocked(assertReviewWorkflowAvailable).mockResolvedValue(undefined);
  });

  it('does not create, upload, or queue a job when availability is not verified', async () => {
    vi.mocked(assertReviewWorkflowAvailable).mockRejectedValueOnce(
      new Error('Agent Review Workflow add-on is not installed.'),
    );
    vi.mocked(Cat_agentreviewjobsService.create).mockClear();
    vi.mocked(Cat_agentreviewjobsService.upload).mockClear();
    vi.mocked(Cat_agentreviewjobsService.update).mockClear();
    await expect(createReviewJob(corpus)).rejects.toThrow('add-on is not installed');
    expect(Cat_agentreviewjobsService.create).not.toHaveBeenCalled();
    expect(Cat_agentreviewjobsService.upload).not.toHaveBeenCalled();
    expect(Cat_agentreviewjobsService.update).not.toHaveBeenCalled();
  });

  it('does not create a job if the user cancels during the availability check', async () => {
    const controller = new AbortController();
    vi.mocked(assertReviewWorkflowAvailable).mockImplementationOnce(async () => {
      controller.abort();
    });
    vi.mocked(Cat_agentreviewjobsService.create).mockClear();
    await expect(createReviewJob(corpus, controller.signal)).rejects.toThrow();
    expect(Cat_agentreviewjobsService.create).not.toHaveBeenCalled();
  });

  it('creates without a status, uploads, then queues', async () => {
    const calls: string[] = [];
    vi.mocked(Cat_agentreviewjobsService.create).mockImplementation(
      async (record: unknown) => {
        calls.push('create');
        // The trigger filters on Queued; creating with it would race the upload.
        expect(record).not.toHaveProperty('cat_jobstatus');
        return { success: true, data: { cat_agentreviewjobid: 'job-1' } } as never;
      },
    );
    vi.mocked(Cat_agentreviewjobsService.upload).mockImplementation(async () => {
      calls.push('upload');
      return { success: true } as never;
    });
    vi.mocked(Cat_agentreviewjobsService.update).mockImplementation(
      async (_id: string, changed: unknown) => {
        calls.push('queue');
        expect(changed).toEqual({
          cat_jobstatus: routeForSubmission(corpus.review.botId).queuedStatus,
        });
        return { success: true, data: {} } as never;
      },
    );

    const id = await createReviewJob(corpus);
    expect(id).toBe('job-1');
    expect(calls).toEqual(['create', 'upload', 'queue']);
  });

  it('uploads the corpus into the file column the workflow reads', async () => {
    vi.mocked(Cat_agentreviewjobsService.create).mockResolvedValue({
      success: true,
      data: { cat_agentreviewjobid: 'job-3' },
    } as never);
    const uploadSpy = vi.mocked(Cat_agentreviewjobsService.upload);
    uploadSpy.mockClear();
    uploadSpy.mockResolvedValue({ success: true } as never);
    vi.mocked(Cat_agentreviewjobsService.update)
      .mockResolvedValue({ success: true, data: {} } as never);

    await createReviewJob(corpus);

    const [id, column, file] = uploadSpy.mock.calls[0];
    expect(id).toBe('job-3');
    // The trigger filter also requires cat_inputfile_name to be non-null.
    expect(column).toBe('cat_inputfile');
    expect(file).toBeInstanceOf(File);
    expect((file as File).type).toBe('application/octet-stream');
  });

  it('does not queue the job when the corpus upload fails', async () => {
    vi.mocked(Cat_agentreviewjobsService.create).mockResolvedValue({
      success: true,
      data: { cat_agentreviewjobid: 'job-2' },
    } as never);
    vi.mocked(Cat_agentreviewjobsService.upload)
      .mockResolvedValue({ success: false, error: { message: 'boom' } } as never);
    const queueSpy = vi.mocked(Cat_agentreviewjobsService.update);
    queueSpy.mockClear();

    await expect(createReviewJob(corpus)).rejects.toThrow(/Corpus upload failed/);
    expect(queueSpy).not.toHaveBeenCalled();
  });
});

describe('createReviewJob records what the corpus actually is', () => {
  const base = {
    schemaVersion: 1 as const,
    generatedBy: 'test',
    generatedOn: '2026-01-01T00:00:00Z',
    review: {
      correlationId: 'c1',
      botId: 'b1',
      botName: 'Bot',
      sourceEnvironment: '',
      componentCount: 1,
    },
    components: [],
  };

  /** Captures the record passed to create for a given corpus. */
  async function createdRecord(corpus: Parameters<typeof createReviewJob>[0]) {
    const createSpy = vi.mocked(Cat_agentreviewjobsService.create);
    createSpy.mockClear();
    createSpy.mockResolvedValue({
      success: true,
      data: { cat_agentreviewjobid: 'job-kind' },
    } as never);
    vi.mocked(Cat_agentreviewjobsService.upload).mockResolvedValue({ success: true } as never);
    vi.mocked(Cat_agentreviewjobsService.update)
      .mockResolvedValue({ success: true, data: {} } as never);

    await createReviewJob(corpus);
    return createSpy.mock.calls[0][0] as Record<string, unknown>;
  }

  it('writes an upload review as ArtifactBundle, not as a skill bundle', async () => {
    const record = await createdRecord({ ...base, jobKind: 'ArtifactBundle' as const });
    expect(record.cat_jobkind).toBe(ReviewJobKind.ArtifactBundle);
  });

  it('writes a tenant agent review as StandardSkillBundle', async () => {
    const record = await createdRecord({ ...base, jobKind: 'StandardSkillBundle' as const });
    expect(record.cat_jobkind).toBe(ReviewJobKind.StandardSkillBundle);
  });

  it('records the harness when the corpus names one', async () => {
    const record = await createdRecord({
      ...base,
      jobKind: 'StandardSkillBundle' as const,
      harness: 'Copilot' as const,
    });
    expect(record.cat_harness).toBe(ReviewHarness.Copilot);
  });

  it('leaves the harness unset rather than guessing one', async () => {
    const record = await createdRecord({ ...base, jobKind: 'StandardSkillBundle' as const });
    expect(record).not.toHaveProperty('cat_harness');
  });
});

describe('WorkflowReviewAiProvider submission failure', () => {
  const bundle = {
    skillName: 'password-reset',
    skillSchemaName: 'passwordReset',
    skillMarkdown: '# password reset',
    agentInstructions: '',
    siblingDescriptions: [],
    manifest: [],
    resources: [],
  } as unknown as SkillBundle;
  const model = { tools: [], skills: [], connectedAgents: [], knowledge: [] } as never;

  const payload = {
    skill_markdown: '# password reset',
    deterministic_findings_json: '[]',
  } as unknown as StandardPromptPayload;

  it('does not throw from prime when the job cannot be submitted', async () => {
    vi.mocked(Cat_agentreviewjobsService.create).mockResolvedValue({
      success: false,
      error: { message: 'table not found' },
    } as never);

    const provider = new WorkflowReviewAiProvider({
      botId: 'b',
      botName: 'Bot',
      sourceEnvironment: '',
    });

    // Bundle assembly must survive: throwing here would lose the whole review.
    await expect(provider.prime([bundle], new Map(), model)).resolves.toBeUndefined();
  });

  it('re-raises the failure per skill so deterministic findings are kept', async () => {
    vi.mocked(Cat_agentreviewjobsService.create).mockResolvedValue({
      success: false,
      error: { message: 'table not found' },
    } as never);

    const provider = new WorkflowReviewAiProvider({
      botId: 'b',
      botName: 'Bot',
      sourceEnvironment: '',
    });
    await provider.prime([bundle], new Map(), model);

    // SkillBundleReviewService catches this and degrades the skill to partial.
    await expect(
      provider.invokeStandardSkillBundleEvaluator(payload, '# password reset'),
    ).rejects.toThrow(/table not found/);
  });

  it('does not submit a job when there are no bundles to review', async () => {
    const createSpy = vi.mocked(Cat_agentreviewjobsService.create);
    createSpy.mockClear();

    const provider = new WorkflowReviewAiProvider({
      botId: 'b',
      botName: 'Bot',
      sourceEnvironment: '',
    });
    await provider.prime([], new Map(), model);

    expect(createSpy).not.toHaveBeenCalled();
    expect(provider.submittedJobId).toBeNull();
  });

  it('does not resubmit after a failed submission', async () => {
    const createSpy = vi.mocked(Cat_agentreviewjobsService.create);
    createSpy.mockResolvedValue({ success: false, error: { message: 'boom' } } as never);
    createSpy.mockClear();

    const provider = new WorkflowReviewAiProvider({
      botId: 'b',
      botName: 'Bot',
      sourceEnvironment: '',
    });
    await provider.prime([bundle], new Map(), model);
    await provider.prime([bundle], new Map(), model);

    expect(createSpy).toHaveBeenCalledTimes(1);
  });

  it('attaches to a running job instead of submitting a second one', async () => {
    // This is what a resumed review does. Submitting again would pay for the
    // same AI work twice and leave two jobs claiming to be the same review.
    const createSpy = vi.mocked(Cat_agentreviewjobsService.create);
    createSpy.mockClear();
    vi.mocked(Cat_agentreviewjobsService.get).mockResolvedValue({
      success: true,
      data: { cat_agentreviewjobid: 'job-9', cat_jobstatus: ReviewJobStatus.Succeeded },
    } as never);

    const provider = new WorkflowReviewAiProvider({
      botId: 'b',
      botName: 'Bot',
      sourceEnvironment: '',
      existingJobId: 'job-9',
    });
    await provider.prime([bundle], new Map(), model);

    expect(createSpy).not.toHaveBeenCalled();
    expect(provider.submittedJobId).toBe('job-9');
  });

  it('reports the attached job id so app restart recovery can persist it', async () => {
    const onJobSubmitted = vi.fn();
    vi.mocked(Cat_agentreviewjobsService.get).mockResolvedValue({
      success: true,
      data: { cat_agentreviewjobid: 'job-9', cat_jobstatus: ReviewJobStatus.Succeeded },
    } as never);

    const provider = new WorkflowReviewAiProvider({
      botId: 'b',
      botName: 'Bot',
      sourceEnvironment: '',
      existingJobId: 'job-9',
      onJobSubmitted,
    });
    await provider.prime([bundle], new Map(), model);

    expect(onJobSubmitted).toHaveBeenCalledOnce();
    expect(onJobSubmitted).toHaveBeenCalledWith('job-9');
  });
});

/*
  A review whose browser went away is found again through its bot id. The window
  around the start time is the whole safety mechanism: the same artifact keeps
  the same bot id across every run, so an unbounded search would happily collect
  a different day's review onto this row.
*/
describe('findLatestJobForBot', () => {
  const startedAt = new Date('2025-01-01T12:00:00.000Z');

  const optionsOf = () =>
    vi.mocked(Cat_agentreviewjobsService.getAll).mock.calls[0][0] as unknown as {
      filter: string;
      orderBy: string[];
    };

  it('searches a window around the moment the review started', async () => {
    vi.mocked(Cat_agentreviewjobsService.getAll).mockReset().mockResolvedValue({
      success: true,
      data: [],
    } as never);

    await findLatestJobForBot('upload:hash-a', startedAt);

    const { filter } = optionsOf();
    expect(filter).toContain("cat_botid eq 'upload:hash-a'");
    // Back far enough to absorb browser-versus-server clock skew, forward far
    // enough to cover a slow hand-off but not a later re-review.
    expect(filter).toContain('createdon ge 2025-01-01T11:55:00.000Z');
    expect(filter).toContain('createdon le 2025-01-01T12:30:00.000Z');
  });

  describe('findReviewJobByCorrelationId', () => {
    it('uses an exact bounded lookup and returns the newest matching job', async () => {
      vi.mocked(Cat_agentreviewjobsService.getAll).mockReset().mockResolvedValue({
        success: true,
        data: [{
          cat_agentreviewjobid: 'job-1',
          cat_correlationid: 'correlation-1',
        }],
      } as never);

      const job = await findReviewJobByCorrelationId('correlation-1');
      const options = vi.mocked(Cat_agentreviewjobsService.getAll).mock.calls[0][0];

      expect(job?.cat_agentreviewjobid).toBe('job-1');
      expect(options).toMatchObject({
        filter: "cat_correlationid eq 'correlation-1'",
        orderBy: ['createdon desc'],
        top: 1,
      });
    });

    it('does not query an unsafe correlation ID', async () => {
      const spy = vi.mocked(Cat_agentreviewjobsService.getAll);
      spy.mockReset();

      await expect(
        findReviewJobByCorrelationId("correlation' or statecode eq 0"),
      ).resolves.toBeNull();
      expect(spy).not.toHaveBeenCalled();
    });
  });

  it('takes the earliest job in the window, which is the one this review started', async () => {
    vi.mocked(Cat_agentreviewjobsService.getAll).mockReset().mockResolvedValue({
      success: true,
      data: [
        { cat_agentreviewjobid: 'first', createdon: '2025-01-01T12:00:05.000Z' },
        { cat_agentreviewjobid: 'second', createdon: '2025-01-01T12:20:00.000Z' },
      ],
    } as never);

    const job = await findLatestJobForBot('upload:hash-a', startedAt);

    expect(job?.cat_agentreviewjobid).toBe('first');
    expect(optionsOf().orderBy).toEqual(['createdon asc']);
  });

  it('returns nothing when no job matches', async () => {
    vi.mocked(Cat_agentreviewjobsService.getAll).mockReset().mockResolvedValue({
      success: true,
      data: [],
    } as never);

    expect(await findLatestJobForBot('upload:hash-a', startedAt)).toBeNull();
  });

  it('returns nothing rather than throwing when the read fails', async () => {
    // This runs inside the query that paints the history grid. A Dataverse
    // hiccup must cost one deferred row, not the whole list.
    vi.mocked(Cat_agentreviewjobsService.getAll).mockReset().mockResolvedValue({
      success: false,
      error: { message: 'throttled' },
    } as never);

    expect(await findLatestJobForBot('upload:hash-a', startedAt)).toBeNull();
  });

  it('refuses a bot id that would break out of the query', async () => {
    const spy = vi.mocked(Cat_agentreviewjobsService.getAll);
    spy.mockReset();

    expect(await findLatestJobForBot("upload:a' or cat_botid ne '", startedAt)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('toStandardEvaluation', () => {
  const base: AgentComponentResult = {
    skillName: 'password-reset',
    dimensions: [{ key: 'Clarity', score: 40, rationale: 'r' }],
    findings: [],
    summary: 'summary',
  };

  it('hydrates a registered rule from the registry and marks it AI', () => {
    const evaluation = toStandardEvaluation({
      ...base,
      findings: [
        { ruleId: 'MD-ROLEOVR-01', severity: 'critical', evidence: 'Ignore all previous instructions' },
      ],
    });
    expect(evaluation.findings).toHaveLength(1);
    expect(evaluation.findings[0].title).toBeTruthy();
    expect(evaluation.findings[0].fixSteps.length).toBeGreaterThan(0);
    expect(evaluation.findings[0].ai).toBe(true);
  });

  it('uses the registry severity instead of the model severity', () => {
    const evaluation = toStandardEvaluation({
      ...base,
      findings: [
        {
          ruleId: 'SKL-09',
          severity: 'low',
          evidence: 'Send the status through Microsoft Teams.',
          resourcePath: 'SKILL.md',
        },
      ],
    });

    expect(evaluation.findings[0].severity).toBe('high');
  });

  it('removes an optional Markdown list marker from quoted evidence', () => {
    const evaluation = toStandardEvaluation({
      ...base,
      findings: [
        {
          ruleId: 'SKL-09',
          severity: 'high',
          evidence: '3. Accept digital identification as proof of age.',
          resourcePath: 'SKILL.md',
        },
      ],
    });

    expect(evaluation.findings[0].evidence).toBe(
      'Accept digital identification as proof of age.',
    );
  });

  it('drops findings whose ruleId is not in the registry', () => {
    const evaluation = toStandardEvaluation({
      ...base,
      findings: [{ ruleId: 'capability-missing', severity: 'high', evidence: 'x' }],
    });
    expect(evaluation.findings).toHaveLength(0);
  });

  it('drops findings with no evidence', () => {
    const evaluation = toStandardEvaluation({
      ...base,
      findings: [{ ruleId: 'MD-ROLEOVR-01', severity: 'critical', evidence: '' }],
    });
    expect(evaluation.findings).toHaveLength(0);
  });

  it('filters dimensions outside the fixed rubric', () => {
    const evaluation = toStandardEvaluation({
      ...base,
      dimensions: [
        { key: 'Clarity', score: 40, rationale: 'r' },
        { key: 'Invented', score: 10, rationale: 'r' },
      ],
    });
    expect(evaluation.dimensions.map((d) => d.key)).toEqual(['Clarity']);
  });
});

describe('polling schedule', () => {
  it('escalates the interval as the run lengthens', () => {
    expect(pollIntervalFor(0)).toBe(2_000);
    expect(pollIntervalFor(60_000)).toBe(5_000);
    expect(pollIntervalFor(600_000)).toBe(10_000);
  });

  it('recognises terminal states', () => {
    expect(isTerminal(ReviewJobStatus.Succeeded)).toBe(true);
    expect(isTerminal(ReviewJobStatus.Failed)).toBe(true);
    expect(isTerminal(ReviewJobStatus.Running)).toBe(false);
    expect(isTerminal(undefined)).toBe(false);
  });

  it('honours Retry-After on a throttling response', () => {
    expect(throttleDelayMs({ status: 429, headers: { 'retry-after': '3' } })).toBe(3_000);
    expect(throttleDelayMs({ status: 429 })).toBe(30_000);
    expect(throttleDelayMs({ status: 500 })).toBeNull();
  });

  it('classifies capacity exhaustion apart from a generic failure', () => {
    expect(classifyFailure('Copilot Studio capacity exceeded')).toBe('capacity');
    expect(classifyFailure('Request was throttled')).toBe('throttled');
    expect(classifyFailure('Agent node error')).toBe('workflow-failed');
  });
});

describe('pollReviewJob', () => {
  const row = (status: number): ReviewJobRow =>
    ({ cat_agentreviewjobid: 'j1', cat_jobstatus: status } as ReviewJobRow);

  it('returns once the row reaches Succeeded', async () => {
    const getJob = vi
      .fn()
      .mockResolvedValueOnce(row(ReviewJobStatus.Queued))
      .mockResolvedValueOnce(row(ReviewJobStatus.Running))
      .mockResolvedValueOnce(row(ReviewJobStatus.Succeeded));

    const result = await pollReviewJob({ getJob, sleep: noSleep });
    expect(result.cat_jobstatus).toBe(ReviewJobStatus.Succeeded);
    expect(getJob).toHaveBeenCalledTimes(3);
  });

  it('throws a classified error when the workflow fails', async () => {
    const getJob = vi.fn().mockResolvedValue({
      cat_agentreviewjobid: 'j1',
      cat_jobstatus: ReviewJobStatus.Failed,
      cat_errormessage: 'Copilot Studio capacity exceeded',
    });

    await expect(pollReviewJob({ getJob, sleep: noSleep })).rejects.toMatchObject({
      code: 'capacity',
    });
  });

  it('surfaces the Agent Node timeout message for Retry UX', async () => {
    const message =
      'The Agent Node did not respond within five minutes. Retry the review.';
    const getJob = vi.fn().mockResolvedValue({
      cat_agentreviewjobid: 'j1',
      cat_jobstatus: ReviewJobStatus.Failed,
      cat_errormessage: message,
    });

    await expect(
      pollReviewJob({ getJob, sleep: noSleep }),
    ).rejects.toMatchObject({
      code: 'workflow-failed',
      message,
    });
  });

  it('tolerates a single transient read failure', async () => {
    const getJob = vi
      .fn()
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValueOnce(row(ReviewJobStatus.Succeeded));

    await expect(pollReviewJob({ getJob, sleep: noSleep })).resolves.toBeTruthy();
  });

  it('gives up after three consecutive read failures', async () => {
    const getJob = vi.fn().mockRejectedValue(new Error('gone'));
    await expect(pollReviewJob({ getJob, sleep: noSleep })).rejects.toMatchObject({
      code: 'workflow-failed',
    });
  });

  it('stops immediately when aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const getJob = vi.fn();
    await expect(
      pollReviewJob({ getJob, signal: controller.signal, sleep: noSleep }),
    ).rejects.toMatchObject({ code: 'cancelled' });
    expect(getJob).not.toHaveBeenCalled();
  });

  it('times out without cancelling the server-side job', async () => {
    const getJob = vi.fn().mockResolvedValue(row(ReviewJobStatus.Running));
    let clock = 0;
    await expect(
      pollReviewJob({
        getJob,
        sleep: noSleep,
        now: () => (clock += 10_000),
        deadlineMs: 30_000,
      }),
    ).rejects.toMatchObject({ code: 'timeout' });
  });

  // The base branch's fix is KEPT: the deadline runs from workflow pickup, so time spent
  // queued does not eat the run budget. The numbers isolate that claim — 50s
  // queued + 9m40s running is 10m30s from submission but only 9m40s from pickup,
  // so a submission-based deadline would time out here and a pickup-based one
  // does not.
  //
  // What changed from the base branch is only the LENGTH of queue wait allowed: the delay
  // is kept under `unclaimedTimeoutMs`. The base branch held the row Queued for four hours,
  // which is the unbounded wait conflict ③ deliberately closed — see
  // 'gives up on a queued job that is never claimed' below.
  it('starts the deadline at pickup, not at submission', async () => {
    const queueDelay = 50_000;
    const runFor = 9 * 60 * 1000 + 40_000;
    const getJob = vi.fn(async () => {
      if (clock < queueDelay) return row(ReviewJobStatus.Queued);
      if (clock < queueDelay + runFor) return row(ReviewJobStatus.Running);
      return row(ReviewJobStatus.Succeeded);
    });
    let clock = 0;

    await expect(
      pollReviewJob({
        getJob,
        sleep: async () => { clock += 10_000; },
        now: () => clock,
        unclaimedTimeoutMs: 60_000,
        deadlineMs: 10 * 60 * 1000,
      }),
    ).resolves.toMatchObject({ cat_jobstatus: ReviewJobStatus.Succeeded });
  });

  // The counterpart to the reversal above: an unclaimed row is bounded, so a
  // workflow that is off or whose trigger is broken surfaces as
  // 'workflow-unavailable' rather than polling forever.
  it('gives up on a queued job that is never claimed', async () => {
    const getJob = vi.fn(async () => row(ReviewJobStatus.Queued));
    let clock = 0;

    await expect(
      pollReviewJob({
        getJob,
        sleep: async () => { clock += 10_000; },
        now: () => clock,
        unclaimedTimeoutMs: 60_000,
        deadlineMs: 30 * 60 * 1000,
      }),
    ).rejects.toMatchObject({ code: 'workflow-unavailable' });
  });

  it('times out a running job based on time since pickup', async () => {
    const queueDelay = 50_000;
    const getJob = vi.fn(async () =>
      row(clock < queueDelay ? ReviewJobStatus.Queued : ReviewJobStatus.Running));
    let clock = 0;

    await expect(
      pollReviewJob({
        getJob,
        sleep: async () => { clock += 10_000; },
        now: () => clock,
        unclaimedTimeoutMs: 60_000,
        deadlineMs: 10 * 60 * 1000,
      }),
    ).rejects.toMatchObject({ code: 'timeout' });
  });

  it('fails fast when a recovered job never reaches Queued', async () => {
    const getJob = vi.fn().mockResolvedValue({
      cat_agentreviewjobid: 'j1',
      cat_jobstatus: undefined,
    } as ReviewJobRow);
    let clock = 0;

    await expect(
      pollReviewJob({
        getJob,
        sleep: noSleep,
        now: () => (clock += 10_000),
        unclaimedTimeoutMs: 20_000,
        deadlineMs: 60_000,
      }),
    ).rejects.toMatchObject({ code: 'workflow-unavailable' });
  });
});

describe('countCompletedComponents', () => {
  it('counts distinct components, not raw rows', async () => {
    // A retried iteration leaves two rows for the same component; counting
    // rows would report more progress than actually happened.
    vi.mocked(Cat_agentreviewjobitemsService.getAll).mockResolvedValue({
      success: true,
      data: [
        { cat_agentreviewjobitemid: 'a', cat_componentindex: 0 },
        { cat_agentreviewjobitemid: 'b', cat_componentindex: 0 },
        { cat_agentreviewjobitemid: 'c', cat_componentindex: 1 },
      ],
    } as never);

    await expect(countCompletedComponents('job-1')).resolves.toBe(2);
  });

  it('returns undefined rather than throwing when the count is unavailable', async () => {
    // Progress is cosmetic; a failed count must not fail the poll.
    vi.mocked(Cat_agentreviewjobitemsService.getAll).mockResolvedValue({
      success: false,
      error: { message: 'throttled' },
    } as never);

    await expect(countCompletedComponents('job-1')).resolves.toBeUndefined();
  });

  it('ignores agent-level and per-resource rows', async () => {
    // These rows share the table but are not components. Counting them makes a
    // two-component review report "4 of 2".
    vi.mocked(Cat_agentreviewjobitemsService.getAll).mockResolvedValue({
      success: true,
      data: [
        { cat_agentreviewjobitemid: 'a', cat_componentindex: 0 },
        { cat_agentreviewjobitemid: 'b', cat_componentindex: 1 },
        { cat_agentreviewjobitemid: 'x', cat_componentindex: AGENT_LEVEL_INDEX.ORCHESTRATION },
        { cat_agentreviewjobitemid: 'y', cat_componentindex: AGENT_LEVEL_INDEX.INSTRUCTION_COVERAGE },
        { cat_agentreviewjobitemid: 'r', cat_componentindex: 1000 },
      ],
    } as never);

    await expect(countCompletedComponents('job-1')).resolves.toBe(2);
  });
});

describe('reviewJobProgress', () => {
  it('never moves the bar backwards', () => {
    const p = toSkillReviewProgress(
      { phase: 'queued', message: 'Handing off to the review agent', componentCount: 12 },
      60,
    );
    expect(p.percent).toBe(60);
  });

  it('appends the liveness ping to the message', () => {
    const p = toSkillReviewProgress({
      phase: 'running',
      message: 'Review agent is analysing 12 components',
      componentCount: 12,
      lastCompleted: 'Reviewed employee-offboarding',
    });
    expect(p.message).toContain('Reviewed employee-offboarding');
    expect(p.totalUnits).toBe(12);
  });

  it('reports real n-of-m progress from the child-row count', () => {
    const p = toSkillReviewProgress({
      phase: 'running',
      message: 'Review agent is analysing 12 components',
      componentCount: 12,
      completedComponents: 6,
      lastCompleted: 'Reviewed employee-offboarding',
    });
    expect(p.message).toBe('Reviewed 6 of 12 skills · employee-offboarding');
    expect(p.completedUnits).toBe(6);
    // Half of the 15-85 running band.
    expect(p.percent).toBe(50);
  });

  it('interpolates within the running band, never past it', () => {
    const start = toSkillReviewProgress({
      phase: 'running', message: 'x', componentCount: 4, completedComponents: 0,
    });
    const end = toSkillReviewProgress({
      phase: 'running', message: 'x', componentCount: 4, completedComponents: 4,
    });
    expect(start.percent).toBe(15);
    expect(end.percent).toBe(85);
  });

  it('clamps a count that exceeds the component total', () => {
    // Duplicate child rows from a resubmit must not push the bar past the end.
    const p = toSkillReviewProgress({
      phase: 'running', message: 'x', componentCount: 3, completedComponents: 7,
    });
    expect(p.percent).toBe(85);
    expect(p.message).toBe('Reviewed 3 of 3 skills');
  });

  it('names the skill that just finished without repeating the verb', () => {
    // The flow writes the ping as "Reviewed <name>"; showing it verbatim would
    // read "Reviewed 2 of 4 skills · Reviewed display-audit".
    const p = toSkillReviewProgress({
      phase: 'running',
      message: 'x',
      componentCount: 4,
      completedComponents: 2,
      lastCompleted: 'Reviewed display-audit',
    });
    expect(p.message).toBe('Reviewed 2 of 4 skills · display-audit');
  });

  it('shows an unexpected ping shape unchanged rather than mangling it', () => {
    // The column is free text and races between parallel iterations.
    const p = toSkillReviewProgress({
      phase: 'running',
      message: 'x',
      componentCount: 4,
      completedComponents: 2,
      lastCompleted: 'display-audit finished',
    });
    expect(p.message).toBe('Reviewed 2 of 4 skills · display-audit finished');
  });

  it('omits the separator when no skill name has arrived yet', () => {
    const p = toSkillReviewProgress({
      phase: 'running', message: 'x', componentCount: 4, completedComponents: 1,
    });
    expect(p.message).toBe('Reviewed 1 of 4 skills');
  });

  it('uses the singular for a one-skill agent', () => {
    const p = toSkillReviewProgress({
      phase: 'running', message: 'x', componentCount: 1, completedComponents: 1,
    });
    expect(p.message).toBe('Reviewed 1 of 1 skill');
  });

  it('falls back to the liveness ping when no count is available', () => {
    const p = toSkillReviewProgress({
      phase: 'running',
      message: 'Review agent is analysing 12 components',
      componentCount: 12,
      lastCompleted: 'Reviewed password-reset',
    });
    expect(p.percent).toBe(40);
    expect(p.message).toContain('Reviewed password-reset');
  });

  it('ignores an empty ping', () => {
    expect(formatLastCompleted('   ')).toBeNull();
    expect(formatLastCompleted(undefined)).toBeNull();
  });
});

describe('getAgentLevelResult', () => {
  const row = (json: string | undefined, id = 'r1') => ({
    cat_agentreviewjobitemid: id,
    cat_componentindex: AGENT_LEVEL_INDEX.ORCHESTRATION,
    cat_resultjson: json,
  });

  it('returns the parsed payload', async () => {
    vi.mocked(Cat_agentreviewjobitemsService.getAll).mockResolvedValue({
      success: true,
      data: [row(JSON.stringify({ findings: [{ ruleId: 'XSK-01' }], summary: 'ok' }))],
    } as never);

    const r = (await getAgentLevelResult('job-1', AGENT_LEVEL_INDEX.ORCHESTRATION)) as {
      summary: string;
    };
    expect(r.summary).toBe('ok');
  });

  it('does not accept a complete-looking payload from a failed agent-level item', async () => {
    vi.mocked(Cat_agentreviewjobitemsService.getAll).mockResolvedValue({
      success: true,
      data: [{
        ...row(JSON.stringify({ status: 'complete', exceptions: [], notAssessed: [] })),
        cat_itemstatus: 2,
        cat_errormessage: 'Cross-skill node failed.',
      }],
    } as never);
    await expect(getAgentLevelResult('job-1', AGENT_LEVEL_INDEX.ORCHESTRATION)).resolves.toBeNull();
  });

  it.each([true, false])('honours a successful retry after failure: %s', async successfulRetry => {
    const successful = {
      ...row(JSON.stringify({ status: 'complete', summary: 'ok' }), 'success'), cat_itemstatus: 1,
    };
    const failed = {
      ...row(JSON.stringify({ status: 'complete', summary: 'not valid' }), 'failed'), cat_itemstatus: 2,
    };
    vi.mocked(Cat_agentreviewjobitemsService.getAll).mockResolvedValue({
      success: true, data: successfulRetry ? [failed, successful] : [successful, failed],
    } as never);
    const result = await getAgentLevelResult('job-1', AGENT_LEVEL_INDEX.ORCHESTRATION);
    if (successfulRetry) expect(result).toMatchObject({ summary: 'ok' });
    else expect(result).toBeNull();
  });

  // A retried loop iteration re-runs the whole success branch, so the same index
  // can have several rows. Observed live 2026-08-05: two rows 8s apart.
  it('keeps the newest row when an iteration was retried', async () => {
    vi.mocked(Cat_agentreviewjobitemsService.getAll).mockResolvedValue({
      success: true,
      data: [
        row(JSON.stringify({ summary: 'older' }), 'a'),
        row(JSON.stringify({ summary: 'newer' }), 'b'),
      ],
    } as never);

    const r = (await getAgentLevelResult('job-1', AGENT_LEVEL_INDEX.ORCHESTRATION)) as {
      summary: string;
    };
    expect(r.summary).toBe('newer');
  });

  it('returns null when the stage produced no row', async () => {
    vi.mocked(Cat_agentreviewjobitemsService.getAll).mockResolvedValue({
      success: true,
      data: [],
    } as never);

    await expect(
      getAgentLevelResult('job-1', AGENT_LEVEL_INDEX.ORCHESTRATION),
    ).resolves.toBeNull();
  });

  it('returns null rather than throwing when the read fails', async () => {
    vi.mocked(Cat_agentreviewjobitemsService.getAll).mockResolvedValue({
      success: false,
      error: { message: 'throttled' },
    } as never);

    await expect(
      getAgentLevelResult('job-1', AGENT_LEVEL_INDEX.ORCHESTRATION),
    ).resolves.toBeNull();
  });

  it('skips a row whose payload is unusable', async () => {
    vi.mocked(Cat_agentreviewjobitemsService.getAll).mockResolvedValue({
      success: true,
      data: [row(JSON.stringify({ summary: 'good' }), 'a'), row('', 'b')],
    } as never);

    const r = (await getAgentLevelResult('job-1', AGENT_LEVEL_INDEX.ORCHESTRATION)) as {
      summary: string;
    };
    expect(r.summary).toBe('good');
  });
});
