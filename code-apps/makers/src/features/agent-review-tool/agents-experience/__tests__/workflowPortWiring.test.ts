/**
 * Port-level wiring for the workflow backend (spec 014, step 5).
 *
 * The seam that decides which backend serves a stage is
 * `createWorkflowReviewAiPort`: it spreads the prompt port and overrides the
 * stages the workflow has taken over. These tests pin the override behaviour and
 * — more importantly — the fallback, which is what lets the workflow be migrated
 * one stage at a time without an environment losing a stage it used to have.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
vi.mock('../../services/ReviewWorkflowAvailabilityService', () => ({
  assertReviewWorkflowAvailable: vi.fn(async () => undefined),
}));

vi.mock('../../../../generated/services/Cat_agentreviewjobsService', () => ({
  Cat_agentreviewjobsService: {
    create: vi.fn(),
    update: vi.fn(),
    get: vi.fn(),
    upload: vi.fn(),
  },
}));

vi.mock('../../../../generated/services/Cat_agentreviewjobitemsService', () => ({
  Cat_agentreviewjobitemsService: { getAll: vi.fn() },
}));

vi.mock('../../services/AIService', () => ({
  aiService: {
    invokeSkillBundleEvaluator: vi.fn(),
    invokeInstructionCoverage: vi.fn(),
    invokeStandardSkillBundleEvaluator: vi.fn(),
    invokeSkillResourceChunkEvaluator: vi.fn(),
    invokeSkillFileSynthesizer: vi.fn(),
    invokeDeepSkillBundleSynthesizer: vi.fn(),
    invokeCrossSkillOrchestrator: vi.fn(),
  },
}));

import { aiService } from '../../services/AIService';
import {
  createPromptReviewAiPort,
  createWorkflowReviewAiPort,
  WORKFLOW_SERVED_MODEL_ID,
} from '../services/ai-providers/ReviewAiProvider';
import type { WorkflowReviewAiProvider } from '../services/ai-providers/WorkflowReviewAiProvider';
import type { OrchestrationPromptPayload } from '../services/skill/SkillPromptPayloadBuilder';
import type { OrchestrationValidationResult } from '../services/skill/SkillEvaluationValidator';
import type { InstructionCoverageResult } from '../contracts/AiCoverage';
import type { SkillBundle } from '../contracts/SkillBundle';
import { ReviewJobStatus } from '../contracts/ReviewJob';
import { executeCopilotReview } from '../services/CopilotReviewService';
import { Cat_agentreviewjobsService } from '../../../../generated/services/Cat_agentreviewjobsService';
import { Cat_agentreviewjobitemsService } from '../../../../generated/services/Cat_agentreviewjobitemsService';

const payload = {
  agent_instructions: 'instructions',
  skills_json: '[]',
  orchestration_rules_json: '[]',
} as OrchestrationPromptPayload;

const promptResult = {
  evaluation: {
    status: 'complete',
    findings: [],
    summary: 'from the prompt backend',
    referenceIds: [],
  },
  issues: [],
} as unknown as OrchestrationValidationResult;

const workflowResult = {
  evaluation: {
    status: 'complete',
    findings: [],
    summary: 'from the workflow backend',
    referenceIds: [],
  },
  issues: [],
} as unknown as OrchestrationValidationResult;

describe('createWorkflowReviewAiPort — cross-skill orchestration', () => {
  const options = {
    botId: 'bot-1',
    botName: 'Bot',
    sourceEnvironment: 'https://example.crm.dynamics.com',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(aiService.invokeCrossSkillOrchestrator).mockResolvedValue(promptResult);
  });

  const stubProvider = (
    provider: WorkflowReviewAiProvider,
    value: OrchestrationValidationResult | null,
  ) => {
    (
      provider as unknown as {
        invokeCrossSkillOrchestrator: () => Promise<OrchestrationValidationResult | null>;
      }
    ).invokeCrossSkillOrchestrator = async () => value;
  };

  it('uses the workflow result when the job produced one', async () => {
    const { port, provider } = createWorkflowReviewAiPort(options);
    stubProvider(provider, workflowResult);

    const r = await port.invokeCrossSkillOrchestrator!(payload, ['alpha'], 'corpus');

    expect(r!.evaluation.summary).toBe('from the workflow backend');
    expect(aiService.invokeCrossSkillOrchestrator).not.toHaveBeenCalled();
  });

  // D-4 retires the AI Builder prompt backend outright. The cross-skill node is
  // optional, so a workflow that predates it — or one whose node failed while the
  // per-component rows succeeded — yields null. That null now ENDS the stage
  // instead of re-running it on paid credits; CopilotReviewService guards it and
  // leaves cross-skill orchestration unassessed.
  //
  // `promptResult` is still armed on the mock above on purpose: the fallback would
  // succeed if anything rewired it, so `not.toHaveBeenCalled` is a live trap.
  it('returns nothing rather than re-running the stage on the paid prompt backend', async () => {
    const { port, provider } = createWorkflowReviewAiPort(options);
    stubProvider(provider, null);

    const r = await port.invokeCrossSkillOrchestrator!(payload, ['alpha'], 'corpus');

    expect(r).toBeNull();
    expect(aiService.invokeCrossSkillOrchestrator).not.toHaveBeenCalled();
  });

  it('never delegates a deep workflow stage to the retired prompt backend', async () => {
    const { port } = createWorkflowReviewAiPort(options);
    vi.mocked(aiService.invokeSkillResourceChunkEvaluator).mockResolvedValue({} as never);
    vi.mocked(aiService.invokeSkillFileSynthesizer).mockResolvedValue({} as never);
    vi.mocked(aiService.invokeDeepSkillBundleSynthesizer).mockResolvedValue({} as never);

    await expect(port.invokeSkillResourceChunkEvaluator!({} as never, {} as never))
      .rejects.toThrow('workflow');
    await expect(port.invokeSkillFileSynthesizer!({} as never, [], ''))
      .rejects.toThrow('workflow');
    await expect(port.invokeDeepSkillBundleSynthesizer!({} as never, [], ''))
      .rejects.toThrow('workflow');
    expect(aiService.invokeSkillResourceChunkEvaluator).not.toHaveBeenCalled();
    expect(aiService.invokeSkillFileSynthesizer).not.toHaveBeenCalled();
    expect(aiService.invokeDeepSkillBundleSynthesizer).not.toHaveBeenCalled();
  });

  it('keeps all three deep stages available on the prompt rollback port', async () => {
    const port = createPromptReviewAiPort();
    await port.invokeSkillResourceChunkEvaluator!({} as never, {} as never);
    await port.invokeSkillFileSynthesizer!({} as never, [], '');
    await port.invokeDeepSkillBundleSynthesizer!({} as never, [], '');
    expect(aiService.invokeSkillResourceChunkEvaluator).toHaveBeenCalledOnce();
    expect(aiService.invokeSkillFileSynthesizer).toHaveBeenCalledOnce();
    expect(aiService.invokeDeepSkillBundleSynthesizer).toHaveBeenCalledOnce();
  });
});

describe('createWorkflowReviewAiPort — instruction coverage', () => {
  const options = {
    botId: 'bot-1',
    botName: 'Bot',
    sourceEnvironment: 'https://example.crm.dynamics.com',
  };

  const workflowCoverage = {
    elements: [{ key: 'role', present: true, evidence: 'from the workflow backend' }],
    citationIds: [{ id: 'ms-authoring-instructions' }],
  } as unknown as InstructionCoverageResult;

  const promptCoverage = {
    elements: [{ key: 'role', present: true, evidence: 'from the prompt backend' }],
    citationIds: [{ id: 'ms-authoring-instructions' }],
  } as unknown as InstructionCoverageResult;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(aiService.invokeInstructionCoverage).mockResolvedValue(promptCoverage);
  });

  const stub = (
    provider: WorkflowReviewAiProvider,
    value: InstructionCoverageResult | null,
  ) => {
    (
      provider as unknown as {
        invokeInstructionCoverage: () => Promise<InstructionCoverageResult | null>;
      }
    ).invokeInstructionCoverage = async () => value;
  };

  it('uses the workflow result when the job produced one', async () => {
    const { port, provider } = createWorkflowReviewAiPort(options);
    stub(provider, workflowCoverage);

    const r = await port.invokeInstructionCoverage('instructions', 'caps');

    expect(r!.elements[0].evidence).toBe('from the workflow backend');
    expect(aiService.invokeInstructionCoverage).not.toHaveBeenCalled();
  });

  // validateInstructionCoverage throws on a malformed shape rather than dropping
  // one element, so the provider converts that to null. Under D-4 that null ends
  // the stage: the retired AI Builder prompt backend must never be re-entered, so
  // a review that reaches here runs on deterministic findings alone.
  // CopilotReviewService records state 'failed' / reason 'invocation-failed'.
  //
  // `promptCoverage` stays armed on the mock above on purpose, so this assertion
  // fails loudly if anything rewires the fallback.
  it('returns nothing rather than re-running the stage on the paid prompt backend', async () => {
    const { port, provider } = createWorkflowReviewAiPort(options);
    stub(provider, null);

    const r = await port.invokeInstructionCoverage('instructions', 'caps');

    expect(r).toBeNull();
    expect(aiService.invokeInstructionCoverage).not.toHaveBeenCalled();
  });

  it('publishes one aggregate positive from the successful 9001 row, not per-element criteria', async () => {
    const instructions = [
      'You are the Zava visual merchandising assistant.',
      'Use a concise and professional tone.',
      'Decline requests outside visual merchandising.',
      'Ask a clarifying question when the request is ambiguous.',
      'Escalate safety concerns to the store manager.',
    ].join(' ');
    const elements: InstructionCoverageResult['elements'] = [
      {
        key: 'role',
        present: true,
        evidence: 'You are the Zava visual merchandising assistant.',
      },
      {
        key: 'tone',
        present: true,
        evidence: 'Use a concise and professional tone.',
      },
      {
        key: 'boundaries',
        present: true,
        evidence: 'Decline requests outside visual merchandising.',
      },
      {
        key: 'ambiguity',
        present: true,
        evidence: 'Ask a clarifying question when the request is ambiguous.',
      },
      {
        key: 'escalation',
        present: true,
        evidence: 'Escalate safety concerns to the store manager.',
      },
    ];

    vi.mocked(Cat_agentreviewjobsService.get).mockResolvedValue({
      success: true,
      data: {
        cat_agentreviewjobid: 'job-879',
        cat_jobstatus: ReviewJobStatus.Succeeded,
      },
    } as never);
    vi.mocked(Cat_agentreviewjobitemsService.getAll).mockImplementation(
      async (options) => {
        const filter = String(options?.filter ?? '');
        if (filter.includes('cat_componentindex eq 9001')) {
          return {
            success: true,
            data: [{
              cat_agentreviewjobitemid: 'coverage-1',
              cat_componentindex: 9001,
              cat_itemstatus: 1,
              cat_resultjson: JSON.stringify({
                elements,
                citationIds: [{ id: 'ms-authoring-instructions' }],
              }),
            }],
          } as never;
        }
        return {
          success: true,
          data: [{
            cat_agentreviewjobitemid: 'skill-1',
            cat_componentindex: 0,
            cat_skillname: 'seasonal-display-planning',
            cat_itemstatus: 1,
            cat_resultjson: JSON.stringify({
              skillName: 'seasonal-display-planning',
              dimensions: [],
              findings: [],
              summary: 'complete',
            }),
          }],
        } as never;
      },
    );

    const { port, provider } = createWorkflowReviewAiPort({
      botId: 'bot-879',
      botName: 'Zava Visual Merchandiser',
      sourceEnvironment: 'https://example.crm.dynamics.com',
      existingJobId: 'job-879',
    });
    await provider.prime([
      {
        skillName: 'seasonal-display-planning',
        skillMarkdown: '# Seasonal display planning',
      } as SkillBundle,
    ], new Map(), {} as never);

    const published = await executeCopilotReview(
      'bot-879',
      JSON.stringify({ agentSettings: { instructions } }),
      {
        getBotComponents: async () => [],
        ai: port,
        skillEvalModelId: '00000000-0000-0000-0000-000000000000',
        coverageModelId: WORKFLOW_SERVED_MODEL_ID,
      },
    );
    const criteria = published.findings
      .filter((finding) => finding.family === 'Instructions' && finding.ai)
      .map((finding) => ({ id: finding.id, evidence: finding.fact }));

    expect(published.analysisStatus?.instructionCoverage).toEqual({
      state: 'complete',
    });
    // D-6: a pass renders from the rule's STATUS in ChecksPanel, so the coverage port publishes a
    // single aggregate positive instead of one info finding per element. The base branch published five
    // per-element positives (INS-02..INS-06); they were rejected at conflict ④ because an info
    // finding makes ChecksPanel render the finding title over the clean
    // "Checked — nothing to report." hint.
    expect(criteria).toEqual([
      {
        id: 'INS-02',
        evidence: 'role, tone, boundaries, ambiguity handling, and escalation are all present',
      },
    ]);
    // The per-element positives must not leak back in alongside the aggregate.
    for (const element of elements)
      expect(criteria.some((criterion) => criterion.evidence === element.evidence)).toBe(false);
    expect(aiService.invokeInstructionCoverage).not.toHaveBeenCalled();
  });
});

// Thread 2814, second road. A row that announces the v4 contract but carries a
// malformed `result` is rejected by `parseArc2NodeOutput`; `parseBareArc2Result`
// rejects it too, because it refuses anything already stamped with a `contract`.
// Flow then reached the legacy validator, which casts the row, reads the
// ENVELOPE's `status: 'complete'` as a legal value and finds no top-level
// `findings` (v4 nests them under `result`), defaulting them to `[]` --
// publishing a complete cross-skill evaluation with zero findings. A node that
// failed a rule rendered as a clean all-clear. Nothing on this path throws, so
// only an explicit assertion can catch it.
describe('WorkflowReviewAiProvider — a malformed v4 row must not be re-read as legacy', () => {
  const options = {
    botId: 'bot-1',
    botName: 'Bot',
    sourceEnvironment: 'https://example.crm.dynamics.com',
  };

  const stubRow = (provider: WorkflowReviewAiProvider, row: unknown) => {
    (
      provider as unknown as { readAgentLevelRow: (index: number) => Promise<unknown> }
    ).readAgentLevelRow = async () => row;
  };

  // The v4 contract requires an array. A string is what a model emits when it
  // answers in prose, and it is precisely what must never read as "nothing found".
  const malformedV4 = (node: string) => ({
    contract: 'arc2-node-output-v4',
    schemaVersion: 4,
    node,
    status: 'complete',
    result: { exceptions: 'XSK-03 failed', notAssessed: [] },
  });

  it('does not publish a complete zero-finding cross-skill evaluation', async () => {
    const { provider } = createWorkflowReviewAiPort(options);
    stubRow(provider, malformedV4('cross-skill'));

    expect(await provider.invokeCrossSkillOrchestrator(['alpha'], 'corpus')).toBeNull();
  });

  it('does not publish instruction coverage from a malformed v4 row', async () => {
    const { provider } = createWorkflowReviewAiPort(options);
    stubRow(provider, malformedV4('copilot-instructions'));

    expect(await provider.invokeInstructionCoverage('instructions')).toBeNull();
  });

  // The guard keys on the v4 contract, so a genuinely legacy row -- which carries
  // no `contract` at all -- must still reach the legacy validator untouched.
  it('still reads a legacy cross-skill row through the legacy validator', async () => {
    const { provider } = createWorkflowReviewAiPort(options);
    stubRow(provider, { status: 'complete', findings: [], summary: 'legacy row', referenceIds: [] });

    expect(await provider.invokeCrossSkillOrchestrator(['alpha'], 'corpus')).not.toBeNull();
  });
});
