import { describe, expect, it, vi } from 'vitest';
import type { BotComponent } from '../../contracts/ServiceContracts';
import type { CrossSkillOrchestrationFinding } from '../contracts/SkillEvaluation';
import { INSTRUCTION_COVERAGE_KEYS } from '../contracts/AiCoverage';
import { executeCopilotReview, type ReviewDeps } from '../services/CopilotReviewService';
import { parseAgentsExperience } from '../services/AgentsExperienceParser';
import { getCopilotReviewCompletion } from '../services/copilotReviewCompletion';
import {
  arc2ToOrchestrationEvaluation, parseBareArc2Result,
} from '../services/jobs/aiWorkflowNodeOutput';
import { buildReviewCorpus } from '../services/jobs/reviewCorpusBuilder';
import { validateOrchestrationEvaluation } from '../services/skill/SkillEvaluationValidator';
import { createOrchestrationFinding } from '../services/skill/orchestrationRuleRegistry';
import { buildPersistedCopilotReview } from '../services/skill/persistedSkillReview';
import { parsePersistedCopilotPayload } from '../utils/persistedCopilotReviewGuard';
import { bundle, textResource } from './skillTestFixtures';
import { FX } from './fixtures';

const ZERO = '00000000-0000-0000-0000-000000000000';
const PROVISIONED = 'aaaaaaaa-0000-4000-8000-000000000001';
const AGENT_COMPONENT_ID = 'cccccccc-0000-4000-8000-000000000003';
const SKILL_NAMES = ['build-retail-account-brief', 'identify-account-growth-opportunities'];
const ROUTING = 'Use the create-account-growth-plan skill after the user selects opportunities.';
const PLAN = 'Create an account growth plan with outcomes, actions, owners, dates, and';
const CAPABILITY = 'Add a new row to selected environment';
const PARENT = 'Prepare account briefs and identify opportunities for the account team.';
const SIBLING = 'Use the brief to identify and rank account opportunities.';
const RESOURCE = 'Use the captured opportunity identifiers to link the selected opportunities.';
const INSTRUCTIONS = `${ROUTING}\n${PLAN} follow-up checks.`;
const CONFIGURATION = JSON.stringify({ agentSettings: { instructions: INSTRUCTIONS } });

function setup(
  evidence = [
    { fieldPath: 'agent_instructions', quote: ROUTING },
    { fieldPath: 'agent_instructions', quote: PLAN },
    { fieldPath: 'configuredCapabilities', quote: CAPABILITY },
  ],
  backend: 'workflow' | 'prompt' = 'workflow',
) {
  const components: BotComponent[] = SKILL_NAMES.map((name, index) => ({
    ...FX.inlineSkillClean,
    botcomponentid: `skill-${index}`,
    componentidunique: `aaaaaaaa-0000-4000-8000-00000000000${index + 1}`,
    schemaname: `agent.skill.${name}`,
    name,
    data: `kind: InlineAgentSkill
content: |
  ---
  name: ${name}
  description: Use when working on ${name}.
  ---
  # Steps
  1. Read the account details.
  2. Return the requested ${name}.`,
  }));
  components.push({
    ...FX.connectorTool,
    name: 'create-row',
    data: FX.connectorTool.data.replace('Create a chat', CAPABILITY),
  });
  const model = parseAgentsExperience(CONFIGURATION, components);
  const bundles = model.skills.map(skill => bundle({
    skillComponentId: skill.componentId,
    skillComponentUniqueId: skill.componentIdUnique,
    skillSchemaName: skill.schemaname,
    skillName: skill.name,
    source: skill.source,
    skillMarkdown: skill.markdown,
    agentInstructions: INSTRUCTIONS,
    parentDescription: PARENT,
    siblingDescriptions: [{ name: SKILL_NAMES[1], description: SIBLING }],
    resources: [textResource('references/opportunities.md', RESOURCE)],
  }));
  const namesById = new Map(model.skills.map(skill => [skill.componentIdUnique, skill.name]));
  const output = parseBareArc2Result({
    exceptions: [{
      ruleId: 'XSK-04',
      findingTitle: 'The required account growth plan has no skill owner',
      evidence: evidence.map(item => ({ ...item, componentId: AGENT_COMPONENT_ID })),
    }],
    notAssessed: [],
  }, 'cross-skill');
  if (!output) throw new Error('Invalid bare v4 test result.');
  const crossSkill = vi.fn<NonNullable<ReviewDeps['ai']['invokeCrossSkillOrchestrator']>>(
    async (_prompt, names, corpus) => validateOrchestrationEvaluation(
      arc2ToOrchestrationEvaluation(output, namesById, names, corpus), names, corpus,
    ),
  );
  const deps: ReviewDeps = {
    getBotComponents: async () => components,
    authenticationMode: 2,
    getSkillBundles: async () => bundles,
    skillEvalModelId: PROVISIONED,
    coverageModelId: PROVISIONED,
    crossSkillOrchestrationModelId: PROVISIONED,
    skillResourceEvalModelId: ZERO,
    fileSynthesisModelId: ZERO,
    deepBundleSynthesisModelId: ZERO,
    ai: {
      aiBackend: backend,
      invokeSkillBundleEvaluator: async () => { throw new Error('Unexpected legacy evaluator.'); },
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
  return { deps, bundles, model, namesById, crossSkill };
}

describe('cross-skill grounding against submitted agent configuration', () => {
  it.each(['workflow', 'prompt'] as const)(
    'keeps the real capability gap with agent-only evidence in %s mode and after reload',
    async backend => {
      const { deps, bundles, namesById, crossSkill } = setup(undefined, backend);
      expect(namesById.has(AGENT_COMPONENT_ID)).toBe(false);

      const payload = await executeCopilotReview('agent', CONFIGURATION, deps);

      expect(crossSkill).toHaveBeenCalledOnce();
      expect(payload.crossSkillOrchestration?.findings).toContainEqual(expect.objectContaining({
        ruleId: 'XSK-04', skills: SKILL_NAMES, evidence: ROUTING,
      }));
      expect(payload.analysisStatus?.crossSkillOrchestration).toEqual({ state: 'complete' });
      expect(getCopilotReviewCompletion(payload)).toEqual({ status: 'completed' });

      const saved = buildPersistedCopilotReview({
        payload, bundles, mode: 'standard',
        startedAt: '2026-10-22T00:00:00Z', completedAt: '2026-10-22T00:01:00Z',
      });
      const reopened = parsePersistedCopilotPayload(JSON.parse(saved.json))!;
      expect(reopened.crossSkillOrchestration?.findings[0].ruleId).toBe('XSK-04');
      expect(getCopilotReviewCompletion(reopened)).toEqual({ status: 'completed' });
    },
  );

  it.each([
    { fieldPath: 'configuredCapabilities', quote: CAPABILITY },
    { fieldPath: 'resources[references/opportunities.md].content', quote: RESOURCE },
    { fieldPath: 'parentDescription', quote: PARENT },
    { fieldPath: 'sibling_descriptions', quote: SIBLING },
  ])('grounds evidence in $fieldPath from the submitted corpus', async evidence => {
    const { deps, bundles, model } = setup([evidence]);
    const submitted = buildReviewCorpus(bundles, new Map(), model, {
      correlationId: 'review', botId: 'agent', botName: 'Account agent', sourceEnvironment: 'test',
    });
    expect(JSON.stringify(submitted.components)).toContain(evidence.quote);

    const payload = await executeCopilotReview('agent', CONFIGURATION, deps);

    expect(payload.crossSkillOrchestration?.findings[0]?.evidence).toBe(evidence.quote);
    expect(payload.analysisStatus?.crossSkillOrchestration).toEqual({ state: 'complete' });
  });

  it('still drops an unsubmitted quote and retains the incomplete banner', async () => {
    const { deps, crossSkill } = setup([{
      fieldPath: 'agent_instructions',
      quote: 'A separate export skill owns all packaging.',
    }]);
    const payload = await executeCopilotReview('agent', CONFIGURATION, deps);
    const validation = await crossSkill.mock.results[0].value;

    expect(validation?.issues).toContainEqual(expect.objectContaining({ code: 'ungrounded-evidence' }));
    expect(payload.crossSkillOrchestration?.findings).toEqual([]);
    expect(payload.analysisStatus?.crossSkillOrchestration).toEqual({
      state: 'partial', reason: 'incomplete-response',
    });
    expect(getCopilotReviewCompletion(payload).errorMessage)
      .toContain('cross-skill assessment did not complete');
  });

  it.each<{ code: string; overrides: Partial<CrossSkillOrchestrationFinding> }>([
    { code: 'unregistered-orchestration-rule', overrides: { ruleId: 'XSK-99' } },
    { code: 'invalid-references', overrides: { referenceIds: ['ms-authoring-instructions'] } },
    { code: 'missing-skills', overrides: { skills: [] } },
    { code: 'unknown-skill', overrides: { skills: ['unknown-skill'] } },
    { code: 'insufficient-skills', overrides: { ruleId: 'XSK-01', skills: [SKILL_NAMES[0]] } },
    { code: 'missing-evidence', overrides: { evidence: '' } },
    { code: 'url-in-evidence', overrides: { evidence: 'https://example.invalid/plan' } },
  ])('retains the $code guard', ({ code, overrides }) => {
    const finding = createOrchestrationFinding('XSK-04', { skills: SKILL_NAMES, evidence: ROUTING });
    const result = validateOrchestrationEvaluation({
      status: 'complete', findings: [{ ...finding, ...overrides }], summary: '', referenceIds: [],
    }, SKILL_NAMES, `${INSTRUCTIONS}\nhttps://example.invalid/plan`);

    expect(result.issues).toContainEqual(expect.objectContaining({ code }));
    expect(result.evaluation.findings).toEqual([]);
    expect(result.evaluation.status).toBe('partial');
  });
});
