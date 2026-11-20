/**
 * Progress wiring integration test (Task 11 — Gap 1).
 *
 * Proves that per-bundle SkillReviewProgress events (with skillName,
 * resourcePath, and units) emitted by executeSkillBundleReview reach the
 * mutation's onProgress callback when routed through executeAndSaveCopilotReview.
 *
 * Uses the same module-mock pattern as cancellation.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../services/ReviewWorkflowAvailabilityService', () => ({
  assertReviewWorkflowAvailable: vi.fn(async () => undefined),
}));

// ── Module mocks (hoisted before imports) ─────────────────────────────────────

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

import type { ReviewResult } from '../../contracts/ReviewResult';
import type { BotComponent } from '../../contracts/ServiceContracts';
import type { SkillReviewProgress } from '../contracts/SkillBundle';
import { FX } from './fixtures';
import { bundle as makeBundle, textResource } from './skillTestFixtures';
import {
  executeAndSaveCopilotReview,
  scaleSkillProgress,
  type CopilotReviewExecutionInput,
} from '../hooks/useCopilotReviewMutation';
import { botService } from '../../services/BotService';
import { reviewService } from '../../services/ReviewService';
import { SkillBundleService } from '../services/skill/SkillBundleService';
import { assembleSkillBundle } from '../services/skill/bundleAssembler';

// ── Shared test data ──────────────────────────────────────────────────────────

const components = [FX.connectorTool, FX.mcpTool, FX.inlineSkillClean, FX.connectedAgentTool];

const baseInput: CopilotReviewExecutionInput = {
  botId: 'b1',
  botName: 'Test Bot',
  componentIdUnique: 'b1-unique',
  mode: 'standard',
  sourceEnvironment: '',
};

// ── Default mock setup ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();

  vi.mocked(botService.getBotHarnessSource).mockResolvedValue({ configuration: FX.botConfigurationCopilot });
  vi.mocked(botService.getBotComponents).mockResolvedValue(components);
  vi.mocked(botService.getBotAuthenticationMode).mockResolvedValue(2);

  vi.mocked(reviewService.saveReviewResult).mockImplementation(
    async (review: ReviewResult) => ({ ...review, reviewId: 'saved-id' }),
  );

  vi.mocked(SkillBundleService).mockImplementation(function () {
    return {
      listPublishedChildren: vi.fn(async () => ({ rows: [], issues: [] })),
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
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('progress wiring — skill progress events reach mutation callback', () => {
  it('uses ZIP data without Dataverse reads and persists ZIP source semantics', async () => {
    await executeAndSaveCopilotReview({
      ...baseInput,
      botId: 'zip-bot-id',
      componentIdUnique: 'zip-component-id',
      sourceEnvironment: 'zip',
      zipData: {
        configuration: JSON.stringify({ agentSettings: {} }),
        components: [],
        resources: [],
      },
    });

    expect(vi.mocked(botService.getBotHarnessSource)).not.toHaveBeenCalled();
    expect(vi.mocked(botService.getBotComponents)).not.toHaveBeenCalled();
    expect(vi.mocked(botService.getBotAuthenticationMode)).not.toHaveBeenCalled();
    expect(vi.mocked(reviewService.saveReviewResult)).toHaveBeenCalledWith(
      expect.objectContaining({
        botId: 'zip-bot-id',
        componentIdUnique: 'zip-component-id',
        sourceEnvironment: 'zip',
        agentsExperience: expect.any(Object),
      }),
    );
  });

  it('forwards at least one event with skillName and totalUnits > 0', async () => {
    const events: SkillReviewProgress[] = [];
    const onProgress = (p: SkillReviewProgress) => events.push(p);

    await executeAndSaveCopilotReview(baseInput, onProgress);

    // At least one event should have a skillName (from executeSkillBundleReview)
    const skillEvents = events.filter(e => e.skillName);
    expect(skillEvents.length).toBeGreaterThan(0);

    // At least one event should report totalUnits > 0
    const unitEvents = events.filter(e => e.totalUnits > 0);
    expect(unitEvents.length).toBeGreaterThan(0);
  });

  it('preserves resource path and unit details while scaling progress', () => {
    const scaled = scaleSkillProgress({
      stage: 'deep-resource-ai',
      percent: 50,
      message: 'Evaluating resource',
      skillName: 'skill-a',
      resourcePath: 'scripts/run.py',
      completedUnits: 2,
      totalUnits: 4,
      partialFailures: 1,
    }, 20);

    expect(scaled).toMatchObject({
      resourcePath: 'scripts/run.py',
      completedUnits: 2,
      totalUnits: 4,
      partialFailures: 1,
      percent: 50,
    });
  });

  it('enforces monotonic percent across all events', async () => {
    const events: SkillReviewProgress[] = [];
    const onProgress = (p: SkillReviewProgress) => events.push(p);

    await executeAndSaveCopilotReview(baseInput, onProgress);

    // Percent must never decrease
    for (let i = 1; i < events.length; i++) {
      expect(events[i].percent).toBeGreaterThanOrEqual(events[i - 1].percent);
    }
  });
});

describe('agent authentication mode wiring', () => {
  it('reads the mode on the live path and saves it on the model', async () => {
    await executeAndSaveCopilotReview(baseInput);

    expect(vi.mocked(botService.getBotAuthenticationMode)).toHaveBeenCalledWith('b1', undefined);
    const saved = vi.mocked(reviewService.saveReviewResult).mock.calls[0][0];
    expect(saved.agentsExperience?.model.authenticationMode).toBe(2);
  });

  it('uses the ZIP mode without a Dataverse read and saves it on the model', async () => {
    await executeAndSaveCopilotReview({
      ...baseInput,
      botId: 'zip-bot-id',
      componentIdUnique: 'zip-component-id',
      sourceEnvironment: 'zip',
      zipData: {
        configuration: JSON.stringify({ agentSettings: {} }),
        components: [],
        resources: [],
        authenticationMode: 1,
      },
    });

    expect(vi.mocked(botService.getBotAuthenticationMode)).not.toHaveBeenCalled();
    const saved = vi.mocked(reviewService.saveReviewResult).mock.calls[0][0];
    expect(saved.agentsExperience?.model.authenticationMode).toBe(1);
  });
});
