/**
 * Cancellation persistence tests (Task 10 fix — defect 4).
 *
 * Proves the actual exported executeAndSaveCopilotReview behaviour (deterministic
 * work + Dataverse persistence in one call) using surgical module mocks.
 *
 * Four scenarios:
 *   1. Already-aborted signal → rejects before meaningful work; saveReviewResult
 *      never called.
 *   2. Abort mid-bundle retrieval (throw from SkillBundleService) → resolves with
 *      a saved ReviewResult; saveReviewResult called exactly once; persisted
 *      payload has deterministic top-level findings; issue code is
 *      bundle-retrieval-cancelled; no AI call.
 *   3. Bundle returned while signal already aborted → skillBundleReviews[0].status
 *      === 'cancelled' (with deterministic findings from executeSkillBundleReview);
 *      AI methods not called.
 *   4. Save failure → rejects; saveReviewResult called exactly once (no retry).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
vi.mock('../../services/ReviewWorkflowAvailabilityService', () => ({
  assertReviewWorkflowAvailable: vi.fn(async () => undefined),
}));

// ── Module mocks (Vitest hoists these before all imports) ─────────────────────

vi.mock('../../services/BotService', () => ({
  botService: {
    getBotHarnessSource: vi.fn(),
    getBotComponents: vi.fn(),
    getBotAuthenticationMode: vi.fn(),
  },
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

vi.mock('../../services/ReviewService', () => ({
  reviewService: {
    saveReviewResult: vi.fn(),
  },
}));

vi.mock('../services/skill/SkillBundleService', () => ({
  createProductionSkillBundlePort: vi.fn(() => ({})),
  SkillBundleService: vi.fn(),
}));

vi.mock('../services/skill/bundleAssembler', () => ({
  assembleSkillBundle: vi.fn(),
}));

vi.mock('../services/skill/resourceNormalizer', () => ({
  normalizeResource: vi.fn(),
}));

// The workflow backend (spec 014) is reachable from the mutation, so its
// Dataverse dependency is pulled into this module graph. @microsoft/power-apps
// ships extensionless ESM re-exports that native Node cannot resolve, so the
// generated services are stubbed — the same pattern the other suites here use.
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

// ── Imports resolved after mocks ──────────────────────────────────────────────

import type { ReviewResult, PersistedCopilotReviewPayload } from '../../contracts/ReviewResult';
import type { BotComponent } from '../../contracts/ServiceContracts';
import { FX } from './fixtures';
import { bundle as makeBundle, textResource } from './skillTestFixtures';
import {
  executeAndSaveCopilotReview,
  invalidateCopilotReviewQueries,
  type CopilotReviewExecutionInput,
} from '../hooks/useCopilotReviewMutation';
import { botService } from '../../services/BotService';
import { aiService } from '../../services/AIService';
import { reviewService } from '../../services/ReviewService';
import { SkillBundleService } from '../services/skill/SkillBundleService';
import { assembleSkillBundle } from '../services/skill/bundleAssembler';
import { buildReviewViewModel } from '../components/viewModel';
import { queryKeys } from '../../hooks/queryKeys';
import { assertReviewWorkflowAvailable } from '../../services/ReviewWorkflowAvailabilityService';
import { ReviewJobError } from '../contracts/ReviewJob';
import { Cat_agentreviewjobsService } from '../../../../generated/services/Cat_agentreviewjobsService';
import { UNSUPPORTED_HARNESS_MESSAGE } from '../services/detection';

// ── Shared test data ──────────────────────────────────────────────────────────

const components = [FX.connectorTool, FX.mcpTool, FX.inlineSkillClean, FX.connectedAgentTool];

const baseInput: CopilotReviewExecutionInput = {
  botId: 'b1',
  botName: 'Test Bot',
  componentIdUnique: 'b1-unique',
  mode: 'standard',
  sourceEnvironment: '',
};

describe('Copilot review setup checks', () => {
  it('rejects unavailable setup before retrieval, AI, job creation, or persistence', async () => {
    const error = new ReviewJobError('workflow-unavailable', 'The review workflow is off.');
    vi.mocked(assertReviewWorkflowAvailable).mockRejectedValueOnce(error);

    await expect(executeAndSaveCopilotReview(baseInput)).rejects.toBe(error);

    expect(botService.getBotHarnessSource).not.toHaveBeenCalled();
    expect(botService.getBotComponents).not.toHaveBeenCalled();
    expect(botService.getBotAuthenticationMode).not.toHaveBeenCalled();
    expect(SkillBundleService).not.toHaveBeenCalled();
    expect(Cat_agentreviewjobsService.create).not.toHaveBeenCalled();
    expect(reviewService.saveReviewResult).not.toHaveBeenCalled();
    for (const invoke of Object.values(aiService)) expect(invoke).not.toHaveBeenCalled();
  });

  it('rejects an unsupported harness before retrieval, AI, job creation, or persistence', async () => {
    vi.mocked(botService.getBotHarnessSource).mockResolvedValueOnce({
      configuration: JSON.stringify({ agentSettings: { $kind: 'FutureAgentSettings' } }),
    });

    await expect(executeAndSaveCopilotReview(baseInput)).rejects.toThrow(UNSUPPORTED_HARNESS_MESSAGE);

    expect(botService.getBotComponents).not.toHaveBeenCalled();
    expect(botService.getBotAuthenticationMode).not.toHaveBeenCalled();
    expect(SkillBundleService).not.toHaveBeenCalled();
    expect(Cat_agentreviewjobsService.create).not.toHaveBeenCalled();
    expect(reviewService.saveReviewResult).not.toHaveBeenCalled();
    for (const invoke of Object.values(aiService)) expect(invoke).not.toHaveBeenCalled();
  });

  it('rejects a run-mode start for a Microsoft Copilot template with no agent settings (rule 2)', async () => {
    vi.mocked(botService.getBotHarnessSource).mockResolvedValueOnce({
      configuration: JSON.stringify({ settings: { GenerativeActionsEnabled: true } }),
      template: 'cliagent-2.0.0',
    });

    await expect(executeAndSaveCopilotReview({ ...baseInput, orgUrl: 'https://org.example' }))
      .rejects.toThrow(UNSUPPORTED_HARNESS_MESSAGE);

    expect(botService.getBotHarnessSource).toHaveBeenCalledWith('b1', 'https://org.example');
    expect(botService.getBotComponents).not.toHaveBeenCalled();
    expect(botService.getBotAuthenticationMode).not.toHaveBeenCalled();
    expect(SkillBundleService).not.toHaveBeenCalled();
    expect(Cat_agentreviewjobsService.create).not.toHaveBeenCalled();
    expect(reviewService.saveReviewResult).not.toHaveBeenCalled();
    for (const invoke of Object.values(aiService)) expect(invoke).not.toHaveBeenCalled();
  });

  it('rejects a solution ZIP agent with a Microsoft Copilot template and no agent settings (rule 2)', async () => {
    await expect(executeAndSaveCopilotReview({
      ...baseInput,
      sourceEnvironment: 'zip',
      zipData: {
        configuration: JSON.stringify({ settings: { GenerativeActionsEnabled: true } }),
        template: 'cliagent-2.0.0',
        components: [],
        resources: [],
      },
    })).rejects.toThrow(UNSUPPORTED_HARNESS_MESSAGE);

    expect(botService.getBotHarnessSource).not.toHaveBeenCalled();
    expect(SkillBundleService).not.toHaveBeenCalled();
    expect(Cat_agentreviewjobsService.create).not.toHaveBeenCalled();
    expect(reviewService.saveReviewResult).not.toHaveBeenCalled();
    for (const invoke of Object.values(aiService)) expect(invoke).not.toHaveBeenCalled();
  });

  it('degrades to deterministic findings without a paid fallback if setup changes before final job creation', async () => {
    const error = new ReviewJobError('workflow-unavailable', 'The review workflow is off.');
    vi.mocked(assertReviewWorkflowAvailable)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(error);

    // The base branch rejected here. That is Delta A, refused at conflict ⑤: re-throwing discards the
    // deterministic findings we have already computed, which is the opposite of the degradation
    // contract ("if the AI workflow is unreachable, still show the deterministic score").
    const review = await executeAndSaveCopilotReview(baseInput);

    expect(assertReviewWorkflowAvailable).toHaveBeenCalledTimes(2);
    expect(Cat_agentreviewjobsService.create).not.toHaveBeenCalled();
    expect(Cat_agentreviewjobsService.upload).not.toHaveBeenCalled();
    expect(Cat_agentreviewjobsService.update).not.toHaveBeenCalled();
    // The base branch's real guard is KEPT: no paid AI Builder call may stand in for the workflow (D-4).
    // Reported by name so a regression says which invocation started spending credits.
    const paidCalls = Object.entries(aiService)
      .filter(([, invoke]) => vi.isMockFunction(invoke) && invoke.mock.calls.length > 0)
      .map(([name]) => name);
    expect(paidCalls).toEqual([]);    // ...and the degraded review is still persisted rather than thrown away.
    expect(reviewService.saveReviewResult).toHaveBeenCalledTimes(1);
    expect(review).toBeDefined();
  });
});

// ── Default mock setup ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();

  vi.mocked(botService.getBotHarnessSource).mockResolvedValue({ configuration: FX.botConfigurationCopilot });
  vi.mocked(botService.getBotComponents).mockResolvedValue(components);
  vi.mocked(botService.getBotAuthenticationMode).mockResolvedValue(2);

  vi.mocked(reviewService.saveReviewResult).mockImplementation(
    async (review: ReviewResult) => ({ ...review, reviewId: 'saved-id' }),
  );

  // Default: empty skill resource list, no downloads → bundle assembles with no resources.
  vi.mocked(SkillBundleService).mockImplementation(function () {
    return {
      listPublishedChildren: vi.fn(async () => ({ rows: [], issues: [] })),
      downloadPublishedResources: vi.fn(async () => []),
    };
  });

  // Default: return a clean bundle keyed on the parent component schemaname.
  vi.mocked(assembleSkillBundle).mockImplementation(async (parent: BotComponent) =>
    makeBundle({
      skillSchemaName: parent.schemaname,
      skillName: parent.name,
    }),
  );
});

describe('Copilot review cache invalidation', () => {
  const savedReview: ReviewResult = {
    reviewId: 'saved-id',
    botId: 'b1',
    componentIdUnique: 'b1-unique',
    botName: 'Test Bot',
    overallScore: 80,
    patternScore: 80,
    instructionScore: 80,
    highSeverityCount: 0,
    mediumSeverityCount: 0,
    lowSeverityCount: 0,
    totalIssueCount: 0,
    reviewedOn: new Date('2026-08-25T00:00:00.000Z'),
    durationMs: 1000,
    status: 'completed',
  };

  it('invalidates the saved review detail together with its list and bot caches', () => {
    const queryClient = new QueryClient();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');

    invalidateCopilotReviewQueries(queryClient, savedReview, baseInput);

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.reviews(baseInput.orgUrl),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.bots(),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.review('saved-id'),
    });
  });

  it('does not invalidate an empty review-detail key when persistence returns no id', () => {
    const queryClient = new QueryClient();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');

    invalidateCopilotReviewQueries(
      queryClient,
      { ...savedReview, reviewId: undefined },
      baseInput,
    );

    expect(invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: queryKeys.review(''),
    });
  });
});

// ── 1. Already-aborted signal ─────────────────────────────────────────────────

describe('cancellation — already-aborted signal', () => {
  it('rejects before meaningful work; saveReviewResult not called', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      executeAndSaveCopilotReview(baseInput, undefined, controller.signal),
    ).rejects.toThrow('Review cancelled');

    expect(vi.mocked(reviewService.saveReviewResult)).not.toHaveBeenCalled();
  });
});

// ── 2. Abort mid-retrieval (SkillBundleService throws) ───────────────────────

describe('cancellation — abort during bundle retrieval (throw)', () => {
  it(
    'saves exactly once; persisted payload has deterministic findings; ' +
    'issue code is bundle-retrieval-cancelled; no AI invoked',
    async () => {
      const controller = new AbortController();

      // listPublishedChildren aborts the signal AND throws — simulates an
      // interrupted download while the orchestrator records the cancellation.
      vi.mocked(SkillBundleService).mockImplementation(function () {
        return {
          listPublishedChildren: vi.fn(async () => {
            controller.abort();
            throw new Error('Download failed');
          }),
          downloadPublishedResources: vi.fn(async () => []),
        };
      });
      const result = await executeAndSaveCopilotReview(baseInput, undefined, controller.signal);

      // Resolved — deterministic result persisted despite the cancellation
      expect(result).toBeDefined();
      expect(result.reviewId).toBe('saved-id');
      expect(result.status).toBe('failed');
      expect(result.errorMessage).toContain('Review incomplete');

      // saveReviewResult called exactly once (no retry)
      expect(vi.mocked(reviewService.saveReviewResult)).toHaveBeenCalledTimes(1);

      // Inspect the persisted payload
      const savedArg = vi.mocked(reviewService.saveReviewResult).mock.calls[0][0];
      const agentEx = savedArg.agentsExperience as PersistedCopilotReviewPayload;

      // Top-level deterministic grounded-rules findings are present
      expect(agentEx.findings.length).toBeGreaterThan(0);

      // Retrieval issue uses the cancellation code, not the generic failure code
      expect(agentEx.bundleRetrievalIssues?.some(i => i.code === 'bundle-retrieval-cancelled')).toBe(true);
      expect(agentEx.bundleRetrievalIssues?.some(i => i.code === 'bundle-retrieval-failed')).toBe(false);

      // No AI calls — cancellation happened before every AI branch
      expect(vi.mocked(aiService.invokeInstructionCoverage)).not.toHaveBeenCalled();
      expect(vi.mocked(aiService.invokeStandardSkillBundleEvaluator)).not.toHaveBeenCalled();
      expect(vi.mocked(aiService.invokeSkillBundleEvaluator)).not.toHaveBeenCalled();
    },
  );
});

// ── 3. Bundle returned while signal already aborted ───────────────────────────

describe('cancellation — bundle returned while signal aborted', () => {
  it(
    'persists skillBundleReviews[0].status === cancelled; ' +
    'deterministic bundle findings array present; AI methods not called',
    async () => {
      const controller = new AbortController();

      // listPublishedChildren aborts the signal but RETURNS rows (does not throw).
      // This exercises the path where bundles.length > 0 but signal is already aborted:
      // executeSkillBundleReview must still run deterministic work before returning 'cancelled'.
      vi.mocked(SkillBundleService).mockImplementation(function () {
        return {
          listPublishedChildren: vi.fn(async () => {
            controller.abort();
            return { rows: [], issues: [] };
          }),
          downloadPublishedResources: vi.fn(async () => []),
        };
      });
      vi.mocked(assembleSkillBundle).mockImplementation(async (parent: BotComponent) =>
        makeBundle({
          skillSchemaName: parent.schemaname,
          skillName: parent.name,
          resources: [textResource('scripts/run.py', 'print("hello")')],
        }),
      );

      const result = await executeAndSaveCopilotReview(baseInput, undefined, controller.signal);

      expect(result.reviewId).toBe('saved-id');
      expect(vi.mocked(reviewService.saveReviewResult)).toHaveBeenCalledTimes(1);

      // Inspect the persisted payload
      const savedArg = vi.mocked(reviewService.saveReviewResult).mock.calls[0][0];
      const agentEx = savedArg.agentsExperience as PersistedCopilotReviewPayload;

      // One bundle review was assembled and evaluated (with the aborted signal)
      expect(agentEx.skillBundleReviews).toHaveLength(1);

      // The bundle review must be cancelled — not skipped, not 'unavailable'
      expect(agentEx.skillBundleReviews[0].status).toBe('cancelled');

      // Deterministic findings array is present (even if empty for a clean skill)
      expect(Array.isArray(agentEx.skillBundleReviews[0].deterministic.findings)).toBe(true);

      // The returned mutation result is the same persisted projection the page renders.
      const immediatePayload = result.agentsExperience as PersistedCopilotReviewPayload;
      const viewModel = buildReviewViewModel(
        immediatePayload,
        'Maker',
        result.durationMs,
        result.botName,
      );
      expect(immediatePayload.skillBundleReviews[0].sourceFiles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'SKILL.md', isSkillDefinition: true }),
          expect.objectContaining({ path: 'scripts/run.py', kind: 'script' }),
        ]),
      );
      expect(viewModel.skills[0].sourceFiles).toEqual(
        immediatePayload.skillBundleReviews[0].sourceFiles,
      );

      // AI methods must not have been invoked
      expect(vi.mocked(aiService.invokeStandardSkillBundleEvaluator)).not.toHaveBeenCalled();
      expect(vi.mocked(aiService.invokeInstructionCoverage)).not.toHaveBeenCalled();
      expect(vi.mocked(aiService.invokeSkillBundleEvaluator)).not.toHaveBeenCalled();
    },
  );
});

// ── 4. Save failure ───────────────────────────────────────────────────────────

describe('cancellation — save failure', () => {
  it('rejects with the save error; saveReviewResult called exactly once (no retry)', async () => {
    vi.mocked(reviewService.saveReviewResult).mockRejectedValue(
      new Error('Dataverse write failed'),
    );

    await expect(
      executeAndSaveCopilotReview(baseInput),
    ).rejects.toThrow('Dataverse write failed');

    // The error propagates immediately — the mutation hook has retry:false,
    // and this function itself never retries.
    expect(vi.mocked(reviewService.saveReviewResult)).toHaveBeenCalledTimes(1);
  });
});
