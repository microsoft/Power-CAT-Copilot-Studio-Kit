/**
 * Regressions for three defects found by reviewing ZAVA Visual Merchandiser.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../generated/services/Cat_agentreviewjobsService', () => ({
  Cat_agentreviewjobsService: { create: vi.fn(), update: vi.fn(), get: vi.fn(), upload: vi.fn() },
}));
vi.mock('../../../../generated/services/Cat_agentreviewjobitemsService', () => ({
  Cat_agentreviewjobitemsService: { getAll: vi.fn() },
}));

import { parseAgentsExperience } from '../services/AgentsExperienceParser';
import { withoutRecognisedSystemKinds } from '../services/recognisedSystemKinds';
import { FX } from './fixtures';
import { buildChecksView } from '../components/checksModel';
import { pollReviewJob } from '../services/jobs/reviewJobPolling';
import { WorkflowReviewAiProviderCore } from '../services/ai-providers/WorkflowReviewAiProviderCore';
import { ReviewJobStatus, type ReviewJobRow } from '../contracts/ReviewJob';

const component = (name: string, kind: string, schemaname: string) => ({
  botcomponentid: `id-${schemaname}`,
  componentidunique: `uid-${schemaname}`,
  name,
  schemaname,
  componenttype: 9,
  data: `kind: ${kind}\ncontent: |-\n  # ${name}\n`,
});

describe('system components are not reported as unknown', () => {
  it('ignores DefaultFeedbackCollection', () => {
    // Copilot Studio creates this itself on most Microsoft Copilot agents — 9 of the 12
    // ZAVA agents carry one — so treating it as unknown fired the
    // "did not match a known schema" warning on almost every review and wrongly
    // implied the agent's data had been read incompletely.
    const model = parseAgentsExperience(
      '{"agentSettings":{}}',
      [component('', 'DefaultFeedbackCollection', 'agent.feedback')] as never,
    );
    expect(model.unknownKinds).toHaveLength(0);
  });

  it('still reports a genuinely unrecognised kind', () => {
    const model = parseAgentsExperience(
      '{"agentSettings":{}}',
      [component('Holo', 'HoloDeckTool', 'agent.holo')] as never,
    );
    expect(model.unknownKinds).toHaveLength(1);
  });

  it('ignores NoFeedbackCollection', () => {
    const model = parseAgentsExperience('{"agentSettings":{}}', [FX.noFeedback]);
    expect(model.unknownKinds).toHaveLength(0);
  });
});

describe('saved reviews get the correction too', () => {
  // Saved reviews are re-rendered, not re-parsed, and unknownKinds is persisted
  // on the payload — so a parser-only fix would leave the false warning on every
  // existing review until it was re-run.
  const entry = (kind: string) => ({
    name: '', schemaname: `agent.${kind}`, kind, warning: 'w',
  }) as never;

  it('drops a recognised system kind stored on an old payload', () => {
    expect(withoutRecognisedSystemKinds([entry('DefaultFeedbackCollection')])).toHaveLength(0);
  });

  it('keeps a genuinely unknown kind stored on an old payload', () => {
    expect(withoutRecognisedSystemKinds([entry('HoloDeckTool')])).toHaveLength(1);
  });

  it('tolerates a payload with no unknownKinds at all', () => {
    expect(withoutRecognisedSystemKinds(undefined)).toEqual([]);
  });

  it.each(['NoFeedbackCollection', 'IQCapability', 'WorkflowTool', 'AgentHook'])(
    'drops %s stored on an old payload',
    kind => {
      expect(withoutRecognisedSystemKinds([entry(kind)])).toHaveLength(0);
    },
  );
});

describe('descriptions live in the component column', () => {
  // Caught by corpus agent 11: all three components had descriptions in
  // Dataverse (198, 203 and 39 chars) yet TOL-02 and CON-03 reported
  // "description: missing". The parser read only the YAML `data` payload, but
  // the designer writes descriptions to the `description` column.
  const withDescription = (kind: string, schemaSegment: string) => ({
    botcomponentid: 'id', componentidunique: 'uid',
    name: 'Planogram Archive',
    schemaname: `bot.${schemaSegment}.planogram_abc`,
    componenttype: 9,
    description: 'Retrieves the approved planogram layout for a ZAVA store bay.',
    data: `kind: ${kind}\ndisplayName: Planogram Archive\n`,
  });

  it('reads a tool description from the column', () => {
    const model = parseAgentsExperience(
      '{"agentSettings":{}}',
      [withDescription('ConnectorTool', 'tool')] as never,
    );
    expect(model.tools[0].description).toContain('approved planogram layout');
  });

  it('reads a connected-agent description from the column', () => {
    const model = parseAgentsExperience(
      '{"agentSettings":{}}',
      [withDescription('ConnectedAgentTool', 'action')] as never,
    );
    expect(model.connectedAgents[0].description).toContain('approved planogram layout');
  });

  it('prefers an authored YAML description over the column', () => {
    const comp = withDescription('ConnectorTool', 'tool');
    comp.data = 'kind: ConnectorTool\ndisplayName: Planogram Archive\ndescription: From the YAML\n';
    const model = parseAgentsExperience('{"agentSettings":{}}', [comp] as never);
    expect(model.tools[0].description).toBe('From the YAML');
  });
});

describe('the summary legend describes one population', () => {
  // The old legend mixed populations: `passed` counted RULES while
  // `warnings`/`errors` counted FINDINGS. They do not even nest — one rule can
  // emit several findings (TOL-02 emitted 2 from a single run) and per-skill
  // rules run once per skill — so no arrangement of those numbers ever summed.
  //
  // A check's status is already a severity: the engine derives it from the
  // worst finding the check produced, or `passed` when it produced none. So
  // check outcomes are one population and add up exactly.
  const rule = (ruleId: string, status: string) =>
    ({ key: ruleId, ruleId, family: 'Skills', status }) as never;

  it('check outcomes account for every check', () => {
    const view = buildChecksView(
      [
        rule('A-01', 'passed'),
        rule('A-02', 'passed'),
        rule('A-03', 'warning'),
        rule('A-04', 'error'),
        rule('A-05', 'info'),
        rule('A-06', 'not-applicable'),
        rule('A-07', 'failed'),
      ],
      [],
    );
    const t = view.totals;
    expect(t.passed + t.warning + t.error + t.info + t.notApplicable + t.failed)
      .toBe(t.evaluated);
    expect(t.evaluated).toBe(7);
  });

  it('counts a check once however many findings it emitted', () => {
    // TOL-02 returned two findings from a single run. As a check that is one
    // warning, not two — which is precisely why finding counts cannot serve as
    // check counts.
    const view = buildChecksView(
      [rule('TOL-02', 'warning')],
      [
        { id: 'TOL-02', severity: 'warning' } as never,
        { id: 'TOL-02', severity: 'warning' } as never,
      ],
    );
    expect(view.totals.warning).toBe(1);
    expect(view.totals.evaluated).toBe(1);
  });

  it('reports not-recorded rather than zeros for a legacy review', () => {
    // "No outcomes stored" and "nothing passed" are different claims; the view
    // model falls back to the persisted score when recorded is false.
    expect(buildChecksView(undefined, []).recorded).toBe(false);
  });
});

describe('a queued job remains recoverable during delayed trigger delivery', () => {
  const queued = { cat_jobstatus: ReviewJobStatus.Queued } as unknown as ReviewJobRow;

  const pollQueued = (over: Partial<Parameters<typeof pollReviewJob>[0]> = {}) => {
    let clock = 0;
    return pollReviewJob({
      getJob: async () => queued,
      sleep: async () => { clock += 10_000; },
      now: () => clock,
      unclaimedTimeoutMs: 60_000,
      ...over,
    });
  };

  // Conflict ③ (base-branch merge) — a DELIBERATE reversal of the base branch's spec, not a
  // stale pin. The base branch let a Queued row wait indefinitely, which is exactly how a
  // workflow that is off, deleted, or whose trigger is broken hung the app: the
  // row is set Queued and then simply never claimed, with no error to observe.
  // We bound it so the caller can degrade to a deterministic-only review.
  //
  // The case the base branch was protecting — a slow but genuinely running job — is still
  // protected, by the salvage gate exercised in the next test. Giving up requires
  // BOTH that the pickup window passed AND that no child result row exists.
  it('degrades once the pickup window passes with no sign of a run', async () => {
    let polls = 0;
    await expect(pollQueued({
      getJob: async () => {
        polls += 1;
        return polls > 8
          ? ({ cat_jobstatus: ReviewJobStatus.Succeeded } as unknown as ReviewJobRow)
          : queued;
      },
    })).rejects.toMatchObject({ code: 'workflow-unavailable' });
  });

  it('keeps waiting while a real run is producing rows', async () => {
    // A slow-but-working run must never be cut short: component rows exist, so
    // something did claim the job.
    let clock = 0;
    const promise = pollReviewJob({
      getJob: async () => (clock > 300_000
        ? ({ cat_jobstatus: ReviewJobStatus.Succeeded } as unknown as ReviewJobRow)
        : queued),
      hasSalvageableResults: async () => true,
      sleep: async () => { clock += 10_000; },
      now: () => clock,
      unclaimedTimeoutMs: 60_000,
    });
    await expect(promise).resolves.toMatchObject({ cat_jobstatus: ReviewJobStatus.Succeeded });
  });

  it('does not fire before the timeout elapses', async () => {
    let clock = 0;
    const promise = pollReviewJob({
      getJob: async () => (clock > 30_000
        ? ({ cat_jobstatus: ReviewJobStatus.Succeeded } as unknown as ReviewJobRow)
        : queued),
      sleep: async () => { clock += 10_000; },
      now: () => clock,
      unclaimedTimeoutMs: 60_000,
    });
    await expect(promise).resolves.toMatchObject({ cat_jobstatus: ReviewJobStatus.Succeeded });
  });
});

describe('a partly failed loop does not discard completed work', () => {  const failedRow = {
    cat_jobstatus: ReviewJobStatus.Failed,
    cat_errormessage: 'One or more iterations failed.',
  } as unknown as ReviewJobRow;

  const poll = (hasSalvageableResults?: () => Promise<boolean>) =>
    pollReviewJob({
      getJob: async () => failedRow,
      hasSalvageableResults,
      sleep: async () => undefined,
      now: () => 0,
    });

  it('returns the row when completed component rows exist', async () => {
    // Logic Apps marks the whole foreach Failed if any single iteration fails.
    // The rows the successful iterations wrote are still valid; throwing here
    // lost an entire four-skill review to one flaky iteration.
    await expect(poll(async () => true)).resolves.toBe(failedRow);
  });

  it('still throws when nothing usable was written', async () => {
    await expect(poll(async () => false)).rejects.toThrow(/iterations failed/);
  });

  it('throws when the caller cannot answer', async () => {
    // An unanswerable question falls back to the stricter behaviour rather than
    // reporting a review that may contain nothing.
    await expect(poll(async () => { throw new Error('unreadable'); }))
      .rejects.toThrow(/iterations failed/);
  });

  it('throws when no salvage check is supplied at all', async () => {
    await expect(poll()).rejects.toThrow(/iterations failed/);
  });
});

describe('the skill bundle provider asks to salvage a partly failed job', () => {
  // The salvage behaviour above was specified and passing, yet ZAVA Visual
  // Merchandiser still reported "4 skill assessment(s) did not complete": the
  // only production caller gated the callback behind an option no caller ever
  // set, so the agent-level cross-skill unit failing discarded four healthy
  // skill rows. A guard the code never reaches is not a guard.
  const bundle = { skillName: 'display-audit', skillMarkdown: '# Display audit' };

  const failedJob = {
    cat_agentreviewjobid: 'job-1',
    cat_jobstatus: ReviewJobStatus.Failed,
    cat_errormessage: 'One or more Copilot review checks failed after retry.',
  } as unknown as ReviewJobRow;

  const providerFor = (results: unknown[]) => new WorkflowReviewAiProviderCore(
    {
      botId: 'bot-1',
      botName: 'Zava Visual Merchandiser',
      sourceEnvironment: 'env',
      // Skips job creation, so the test exercises polling and nothing else.
      existingJobId: 'job-1',
    },
    {
      createReviewJob: async () => 'job-1',
      getReviewJob: async () => failedJob,
      getReviewJobResults: async () => results,
      getAgentLevelResult: async () => null,
      countCompletedComponents: async () => results.length,
    } as never,
  );

  const evaluate = (provider: WorkflowReviewAiProviderCore) =>
    provider.invokeStandardSkillBundleEvaluator(
      { skill_markdown: bundle.skillMarkdown, deterministic_findings_json: '[]' } as never,
      bundle.skillMarkdown,
    );

  it('keeps a skill that succeeded inside a job the workflow marked failed', async () => {
    const provider = providerFor([
      { skillName: 'display-audit', summary: 'Reviewed.', findings: [], dimensions: [] },
    ]);
    await provider.prime([bundle] as never, new Map(), {} as never);

    const evaluation = await evaluate(provider);
    expect(evaluation.evaluation.summary).not.toMatch(/No workflow result was returned/);
  });

  it('still fails the review when the job failed without writing any row', async () => {
    const provider = providerFor([]);
    await provider.prime([bundle] as never, new Map(), {} as never);

    await expect(evaluate(provider)).rejects.toThrow(/failed after retry/);
  });
});
