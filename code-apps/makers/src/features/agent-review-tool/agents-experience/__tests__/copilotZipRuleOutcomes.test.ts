import { describe, expect, it } from 'vitest';
import { executeCopilotReview, type ReviewDeps } from '../services/CopilotReviewService';
import { getCopilotReviewCompletion } from '../services/copilotReviewCompletion';
import { createRegisteredFinding } from '../services/skill/skillRuleRegistry';
import { ALL_RULES } from '../services/GroundedRuleEngine';
import { INSTRUCTION_COVERAGE_KEYS } from '../contracts/AiCoverage';
import { bundle } from './skillTestFixtures';
import { FX } from './fixtures';

const PROVISIONED = 'aaaaaaaa-0000-0000-0000-000000000001';
const ZERO = '00000000-0000-0000-0000-000000000000';
const MARKDOWN = `---
name: loyalty
description: Use when checking a loyalty tier.
---
# Loyalty tier
Use this skill when a customer asks about their ZAVA Rewards status.`;
const component = {
  ...FX.inlineSkillClean,
  name: 'loyalty',
  data: 'kind: InlineAgentSkill\ncontent: <!-- bic:bundle=loyalty -->',
};
const configuration = JSON.stringify({
  agentSettings: { instructions: 'Help with loyalty account questions.', web: { enableWebSearch: true } },
});

function setup() {
  const captured = bundle({
    skillComponentId: component.botcomponentid,
    skillComponentUniqueId: component.componentidunique,
    skillSchemaName: component.schemaname,
    skillName: component.name,
    source: 'zip-bundle',
    skillMarkdown: MARKDOWN,
    resources: [],
    manifest: [],
  });
  const deps: ReviewDeps = {
    getBotComponents: async () => [component],
    getSkillBundles: async () => [captured],
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
    },
  };
  return { captured, deps };
}

describe('deferred deterministic ZIP-skill checks', () => {
  it('settles deferred base outcomes when the complete archive text was captured', async () => {
    const { deps } = setup();
    const payload = await executeCopilotReview('agent', configuration, deps);
    for (const id of ['SKL-08', 'SKL-15']) {
      expect(payload.ruleResults?.find(result => result.ruleId === id)?.status).not.toBe('failed');
    }
    expect(payload.model.skills[0].source).toBe('zip-bundle');
    expect(payload.model.skills[0].markdown).toContain('bic:bundle');
    expect(payload.score.status).toBe('complete');
    expect(getCopilotReviewCompletion(payload)).toEqual({ status: 'completed' });
    const baseRows = payload.ruleResults!.filter(row => row.key === row.ruleId
      && ALL_RULES.some(rule => rule.id === row.ruleId));
    expect(new Set(baseRows.map(row => row.key)).size).toBe(baseRows.length);
    expect(payload.score.passed).toBe(baseRows.filter(row => row.status === 'passed').length);
  });

  it.each(['missing', 'retrieval-failed', 'wrong-identity'] as const)(
    'retains unavailable outcomes when the archive is %s', async state => {
      const { captured, deps } = setup();
      if (state === 'missing') deps.getSkillBundles = async () => [];
      if (state === 'retrieval-failed') {
        captured.retrievalIssues = [{ code: 'download-failed', message: 'File retrieval failed.', severity: 'error' }];
      }
      if (state === 'wrong-identity') {
        captured.skillComponentId = 'wrong';
        captured.skillComponentUniqueId = 'wrong';
      }
      const payload = await executeCopilotReview('agent', configuration, deps);
      expect(payload.ruleResults?.find(result => result.ruleId === 'SKL-15')?.status).toBe('failed');
      expect(payload.analysisStatus?.crossSkillOrchestration?.state).toBe('unavailable');
      expect(payload.score.status).toBe('partial');
      expect(getCopilotReviewCompletion(payload).status).toBe('failed');
    },
  );

  it('retains a real named-capability failure after reading the archive text', async () => {
    const { captured, deps } = setup();
    captured.skillMarkdown += '\nUse the "Missing Member Account" tool.';
    const payload = await executeCopilotReview('agent', configuration, deps);
    expect(payload.ruleResults?.find(result => result.ruleId === 'SKL-15')?.status).toBe('warning');
    expect(payload.findings.find(finding => finding.id === 'SKL-15')?.fact).toContain('missing member account');
    expect(payload.score.status).toBe('complete');
  });

  it('does not remove a separate AI prerequisite finding when generic self-reference passes', async () => {
    const { deps } = setup();
    const evaluate = deps.ai.invokeStandardSkillBundleEvaluator!;
    deps.ai.invokeStandardSkillBundleEvaluator = async (...args) => {
      const result = await evaluate(...args);
      result.evaluation.findings = [{
        ...createRegisteredFinding('SKL-09', {
          evidence: 'ZAVA Rewards status',
          fact: 'A member-account data source is required to look up the customer reward tier.',
        }),
        ai: true,
      }];
      return result;
    };
    const payload = await executeCopilotReview('agent', configuration, deps);
    expect(payload.findings.some(finding => finding.id === 'SKL-15')).toBe(false);
    expect(payload.findings.find(finding => finding.id === 'SKL-09'))
      .toMatchObject({ ai: true, fact: expect.stringContaining('member-account data source') });
  });
});
