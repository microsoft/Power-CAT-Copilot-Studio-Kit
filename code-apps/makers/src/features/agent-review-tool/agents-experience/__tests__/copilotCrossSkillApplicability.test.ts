import { describe, expect, it, vi } from 'vitest';
import type { BotComponent } from '../../contracts/ServiceContracts';
import type { ReviewDeps } from '../services/CopilotReviewService';
import { executeCopilotReview } from '../services/CopilotReviewService';
import { getCopilotReviewCompletion } from '../services/copilotReviewCompletion';
import { parseAgentsExperience } from '../services/AgentsExperienceParser';
import { buildPersistedCopilotReview } from '../services/skill/persistedSkillReview';
import { parsePersistedCopilotPayload } from '../utils/persistedCopilotReviewGuard';
import { buildReviewViewModel } from '../components/viewModel';
import {
  arc2ToOrchestrationEvaluation, parseArc2NodeOutput, parseBareArc2Result,
} from '../services/jobs/aiWorkflowNodeOutput';
import { validateOrchestrationEvaluation } from '../services/skill/SkillEvaluationValidator';
import { crossSkillRules } from '../../review-core/rules/cross-skill.rules';
import { INSTRUCTION_COVERAGE_KEYS } from '../contracts/AiCoverage';
import { bundle } from './skillTestFixtures';
import { FX } from './fixtures';

const ZERO = '00000000-0000-0000-0000-000000000000';
const PROVISIONED = 'aaaaaaaa-0000-0000-0000-000000000001';
const configuration = JSON.stringify({
  agentSettings: { instructions: 'Help with loyalty account questions.', web: { enableWebSearch: true } },
});

function component(name: string): BotComponent {
  return {
    ...FX.inlineSkillClean,
    botcomponentid: `id-${name}`,
    componentidunique: `unique-${name}`,
    schemaname: `agent.skill.${name}`,
    name,
    data: `kind: InlineAgentSkill
content: |
  ---
  name: ${name}
  description: Use when checking a loyalty tier.
  ---
  # Loyalty tier
  Use this skill when a customer asks about their ZAVA Rewards status.`,
  };
}

function reviewSetup(components: BotComponent[]) {
  const model = parseAgentsExperience(configuration, components);
  const bundles = model.skills.map(skill => bundle({
    skillComponentId: skill.componentId,
    skillComponentUniqueId: skill.componentIdUnique,
    skillSchemaName: skill.schemaname,
    skillName: skill.name,
    source: skill.source,
    skillMarkdown: skill.markdown,
  }));
  const crossSkill = vi.fn<NonNullable<ReviewDeps['ai']['invokeCrossSkillOrchestrator']>>(async () => ({
    evaluation: { status: 'complete', findings: [], summary: '', referenceIds: [] },
    issues: [],
  }));
  const deps: ReviewDeps = {
    getBotComponents: async () => components,
    getSkillBundles: async () => bundles,
    skillEvalModelId: PROVISIONED,
    coverageModelId: PROVISIONED,
    crossSkillOrchestrationModelId: PROVISIONED,
    skillResourceEvalModelId: ZERO,
    fileSynthesisModelId: ZERO,
    deepBundleSynthesisModelId: ZERO,
    ai: {
      invokeSkillBundleEvaluator: async () => { throw new Error('Unexpected legacy evaluator'); },
      invokeStandardSkillBundleEvaluator: async () => ({
        evaluation: {
          status: 'complete',
          dimensions: (['Clarity', 'Actionability', 'Scope discipline', 'Composability'] as const)
            .map(key => ({ key, score: 95, rationale: 'Clear scope.' })),
          findings: [], resourcePurposeAlignment: [], operationalAssumptions: [],
          unreviewedResources: [], summary: '', referenceIds: [],
        },
        issues: [],
      }),
      invokeInstructionCoverage: async () => ({
        elements: INSTRUCTION_COVERAGE_KEYS.map(key => ({ key, present: true, inferredPass: true })),
        findings: [], citationIds: [],
      }),
      invokeCrossSkillOrchestrator: crossSkill,
    },
  };
  return { deps, bundles, crossSkill };
}

describe('host-owned cross-skill applicability', () => {
  it('keeps the measured single-skill wire response partial at the generic parser', () => {
    const raw = parseBareArc2Result({
      exceptions: [],
      notAssessed: crossSkillRules.map(rule => ({
        ruleId: rule.id, scopeStatus: 'unavailable',
        reason: 'There are fewer than two eligible skills.',
      })),
    }, 'cross-skill');
    expect(raw?.status).toBe('partial');
  });

  it('does not lose a truncated bare response status', () => {
    expect(parseBareArc2Result({
      status: 'partial', exceptions: [], notAssessed: [],
    }, 'cross-skill')?.status).toBe('partial');
  });

  it('does not let an advisory complete status hide unassessed cross-skill rules', () => {
    const raw = parseArc2NodeOutput({
      contract: 'arc2-node-output-v4', schemaVersion: 4, node: 'cross-skill', status: 'complete',
      result: { exceptions: [], notAssessed: [{ ruleId: 'XSK-01', scopeStatus: 'unavailable' }] },
    })!;
    expect(arc2ToOrchestrationEvaluation(raw, new Map(), ['first', 'second'], '').status)
      .toBe('partial');
  });

  it.each(['{}', '{"status":"complete"}', '{"findings":42}'])(
    'does not accept missing legacy findings as a complete empty assessment: %s', raw => {
      const result = validateOrchestrationEvaluation(JSON.parse(raw), ['first', 'second'], '');
      expect(result.evaluation.status).toBe('partial');
      expect(result.issues.length).toBeGreaterThan(0);
    },
  );

  it.each(['partial', 'unavailable'] as const)(
    'does not establish N/A for a declared %s population', async availability => {
      const { deps, crossSkill } = reviewSetup([component('loyalty')]);
      deps.availability = { skills: availability };
      const payload = await executeCopilotReview('agent', configuration, deps);
      expect(payload.analysisStatus?.crossSkillOrchestration?.state).toBe('unavailable');
      expect(crossSkill).not.toHaveBeenCalled();
      expect(getCopilotReviewCompletion(payload).status).toBe('failed');
    },
  );

  it.each([0, 1])('marks a complete %i-skill population not applicable', async count => {
    const { deps, crossSkill } = reviewSetup(count ? [component('loyalty-tier-lookup')] : []);
    const payload = await executeCopilotReview('agent', configuration, deps);
    expect(payload.analysisStatus?.crossSkillOrchestration).toEqual({
      state: 'not-applicable', reason: 'insufficient-skills',
    });
    expect(getCopilotReviewCompletion(payload)).toEqual({ status: 'completed' });
    expect(crossSkill).not.toHaveBeenCalled();
  });

  it('uses catalog applicability rather than the returned English reason', async () => {
    const { deps, crossSkill } = reviewSetup([component('loyalty-tier-lookup')]);
    const raw = parseBareArc2Result({
      exceptions: [],
      notAssessed: crossSkillRules.map(rule => ({
        ruleId: rule.id, scopeStatus: 'unavailable', reason: 'Untranslated scope text.',
      })),
    }, 'cross-skill')!;
    crossSkill.mockImplementation(async (_payload, names, corpus) =>
      validateOrchestrationEvaluation(
        arc2ToOrchestrationEvaluation(raw, new Map(), names, corpus), names, corpus,
      ));
    const payload = await executeCopilotReview('agent', configuration, deps);
    expect(getCopilotReviewCompletion(payload)).toEqual({ status: 'completed' });
    expect(payload.analysisStatus?.crossSkillOrchestration?.state).toBe('not-applicable');
  });

  it('does not count two bundle portions as two distinct skills', async () => {
    const { deps, bundles, crossSkill } = reviewSetup([component('loyalty-tier-lookup')]);
    deps.getSkillBundles = async () => [
      bundles[0], { ...bundles[0], skillName: 'second portion' },
    ];
    const payload = await executeCopilotReview('agent', configuration, deps);
    expect(payload.analysisStatus?.crossSkillOrchestration?.state).toBe('not-applicable');
    expect(crossSkill).not.toHaveBeenCalled();
  });

  it('retains a completed applicable two-skill assessment', async () => {
    const { deps, crossSkill } = reviewSetup([component('loyalty'), component('returns')]);
    const payload = await executeCopilotReview('agent', configuration, deps);
    expect(crossSkill).toHaveBeenCalledOnce();
    expect(payload.analysisStatus?.crossSkillOrchestration?.state).toBe('complete');
    expect(getCopilotReviewCompletion(payload)).toEqual({ status: 'completed' });
  });

  it.each(['missing', 'partial', 'failed'] as const)(
    'keeps an applicable two-skill assessment incomplete when output is %s', async state => {
      const { deps, crossSkill } = reviewSetup([component('loyalty'), component('returns')]);
      crossSkill.mockImplementation(async () => {
        if (state === 'failed') throw new Error('Failed job item');
        return state === 'missing' ? null : {
          evaluation: { status: 'partial', findings: [], summary: '', referenceIds: [] }, issues: [],
        };
      });
      const payload = await executeCopilotReview('agent', configuration, deps);
      expect(payload.analysisStatus?.crossSkillOrchestration?.state)
        .toBe(state === 'missing' ? 'unavailable' : state);
      expect(getCopilotReviewCompletion(payload).status).toBe('failed');
    },
  );

  it('does not infer a one-skill subject from a missing second bundle', async () => {
    const { deps, bundles } = reviewSetup([component('loyalty'), component('returns')]);
    deps.getSkillBundles = async () => [bundles[0]];
    const payload = await executeCopilotReview('agent', configuration, deps);
    expect(payload.analysisStatus?.crossSkillOrchestration?.state).toBe('unavailable');
    expect(getCopilotReviewCompletion(payload).status).toBe('failed');
  });

  it('does not trust a single-skill English explanation for a known two-skill subject', async () => {
    const { deps, crossSkill } = reviewSetup([component('loyalty'), component('returns')]);
    crossSkill.mockImplementation(async (_prompt, names, corpus) => {
      const raw = parseBareArc2Result({
        exceptions: [],
        notAssessed: crossSkillRules.map(rule => ({
          ruleId: rule.id, scopeStatus: 'unavailable', reason: 'Fewer than two skills; not applicable.',
        })),
      }, 'cross-skill')!;
      return validateOrchestrationEvaluation(
        arc2ToOrchestrationEvaluation(raw, new Map(), names, corpus), names, corpus,
      );
    });
    const payload = await executeCopilotReview('agent', configuration, deps);
    expect(payload.analysisStatus?.crossSkillOrchestration?.state).toBe('partial');
    expect(getCopilotReviewCompletion(payload).status).toBe('failed');
  });

  it('does not establish N/A when a parent component has no captured content', async () => {
    const { deps } = reviewSetup([{ ...component('missing'), data: '', content: '' }]);
    const payload = await executeCopilotReview('agent', configuration, deps);
    expect(payload.analysisStatus?.crossSkillOrchestration?.state).toBe('unavailable');
    expect(getCopilotReviewCompletion(payload).status).toBe('failed');
  });

  it.each([0, 1])('does not establish N/A from %i skills and an unreadable component', async count => {
    const { deps } = reviewSetup([
      ...(count ? [component('loyalty')] : []),
      { ...component('unreadable'), data: 'kind: [', content: '' },
    ]);
    const payload = await executeCopilotReview('agent', configuration, deps);
    expect(payload.analysisStatus?.crossSkillOrchestration?.state).toBe('unavailable');
    expect(getCopilotReviewCompletion(payload).status).toBe('failed');
  });

  it('does not establish N/A after bundle retrieval fails', async () => {
    const { deps } = reviewSetup([component('loyalty')]);
    deps.getSkillBundles = async () => { throw new Error('Capture incomplete'); };
    const payload = await executeCopilotReview('agent', configuration, deps);
    expect(payload.analysisStatus?.crossSkillOrchestration?.state).toBe('unavailable');
    expect(getCopilotReviewCompletion(payload).status).toBe('failed');
  });

  it('retains N/A and the stored score through persistence, reopen, and the view model', async () => {
    const { deps, bundles } = reviewSetup([component('loyalty-tier-lookup')]);
    const payload = await executeCopilotReview('agent', configuration, deps);
    const persisted = buildPersistedCopilotReview({
      payload, bundles, mode: 'standard',
      startedAt: '2026-10-19T00:00:00Z', completedAt: '2026-10-19T00:01:00Z',
    });
    const reopened = parsePersistedCopilotPayload(JSON.parse(persisted.json))!;
    expect(reopened.score).toEqual(payload.score);
    expect(reopened.ruleResults).toEqual(payload.ruleResults);
    expect(getCopilotReviewCompletion(reopened)).toEqual({ status: 'completed' });
    const vm = buildReviewViewModel(reopened, 'Reviewer', 60_000, 'Loyalty');
    expect(vm.summary.crossSkillOrchestrationStatus?.state).toBe('not-applicable');
    expect(vm.summary.webSearchEnabled).toBe(true);
  });
});
