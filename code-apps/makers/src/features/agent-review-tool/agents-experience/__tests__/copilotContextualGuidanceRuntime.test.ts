import { describe, expect, it, vi } from 'vitest';
import { executeCopilotReview, type ReviewDeps } from '../services/CopilotReviewService';
import { arc2ToInstructionCoverage, parseArc2NodeOutput } from '../services/jobs/aiWorkflowNodeOutput';
import { INSTRUCTION_COVERAGE_KEYS } from '../contracts/AiCoverage';
import type { GroundedSkillFinding } from '../contracts/Findings';
import { createRegisteredFinding } from '../services/skill/skillRuleRegistry';
import { contextualGuidanceFixture } from './contextualGuidanceFixtures';

describe('guidance at the runtime boundary', () => {
  it('preserves AI advice through the top-level merge with no additional evaluator calls', async () => {
    const { input, skill } = contextualGuidanceFixture();
    const aiFinding: GroundedSkillFinding = {
      ...createRegisteredFinding('SKL-AI-PREREQUISITES', {
        evidence: 'Check member status.', fact: 'Check member status.',
      }),
      ai: true, componentIdUnique: skill.componentIdUnique,
      findingTitle: 'Private results need an approved source',
      whyItMatters: 'The captured task needs authorized member data.',
      makerAction: 'Verify the private lookup prerequisite before reporting member data.',
      suggestedText: 'If authorized member data is unavailable, explain the limitation.',
      acceptanceCheck: 'An unauthorized request returns no private member data.',
    };
    const standard = vi.fn<NonNullable<ReviewDeps['ai']['invokeStandardSkillBundleEvaluator']>>(async () => ({
      evaluation: {
        status: 'complete',
        dimensions: (['Clarity', 'Actionability', 'Scope discipline', 'Composability'] as const)
          .map(key => ({ key, score: 85, rationale: 'Captured scope.' })),
        findings: [aiFinding], resourcePurposeAlignment: [], operationalAssumptions: [],
        unreviewedResources: [], summary: '', referenceIds: [],
      },
      issues: [],
    }));
    const coverage = vi.fn<ReviewDeps['ai']['invokeInstructionCoverage']>(async () => ({
      elements: INSTRUCTION_COVERAGE_KEYS.map(key => ({ key, present: true, inferredPass: true })),
      findings: [], citationIds: [],
    }));
    const legacy = vi.fn<ReviewDeps['ai']['invokeSkillBundleEvaluator']>(async () => {
      throw new Error('Unexpected legacy evaluator');
    });
    const crossSkill = vi.fn<NonNullable<ReviewDeps['ai']['invokeCrossSkillOrchestrator']>>(async () => {
      throw new Error('Unexpected cross-skill result read');
    });
    const deps: ReviewDeps = {
      getBotComponents: async () => [{
        botcomponentid: skill.componentId, componentidunique: skill.componentIdUnique,
        botid: 'example-agent', name: skill.name, schemaname: skill.schemaname,
        componenttype: '9', content: '',
        data: `kind: InlineAgentSkill\ncontent: |\n${skill.markdown.split('\n').map(line => `  ${line}`).join('\n')}`,
      }],
      getSkillBundles: async () => input.bundles,
      skillEvalModelId: 'fixture-model', coverageModelId: 'fixture-model',
      crossSkillOrchestrationModelId: 'fixture-model',
      skillResourceEvalModelId: '00000000-0000-0000-0000-000000000000',
      fileSynthesisModelId: '00000000-0000-0000-0000-000000000000',
      deepBundleSynthesisModelId: '00000000-0000-0000-0000-000000000000',
      ai: {
        invokeSkillBundleEvaluator: legacy, invokeStandardSkillBundleEvaluator: standard,
        invokeInstructionCoverage: coverage, invokeCrossSkillOrchestrator: crossSkill,
      },
    };
    const configuration = JSON.stringify({ agentSettings: {
      instructions: input.payload.model.agentSettings.instructions, web: { enableWebSearch: true },
    } });
    const result = await executeCopilotReview('example-agent', configuration, deps);
    expect(standard).toHaveBeenCalledTimes(1);
    expect(coverage).toHaveBeenCalledTimes(1);
    expect(legacy).not.toHaveBeenCalled();
    expect(crossSkill).not.toHaveBeenCalled();
    const finding = result.findings.find(item => item.id === 'SKL-AI-PREREQUISITES')!;
    expect(finding).toMatchObject({
      ai: true, makerAction: aiFinding.makerAction, suggestedText: aiFinding.suggestedText,
      acceptanceCheck: aiFinding.acceptanceCheck,
      remediation: {
        source: 'saved', componentIdUnique: skill.componentIdUnique,
        suggestedText: aiFinding.suggestedText,
      },
    });
    const originalScore = result.score;
    const originalOutcomes = result.ruleResults;
    delete aiFinding.findingTitle;
    delete aiFinding.whyItMatters;
    delete aiFinding.makerAction;
    delete aiFinding.suggestedText;
    delete aiFinding.acceptanceCheck;
    const withoutStoredAdvice = await executeCopilotReview('example-agent', configuration, deps);
    expect(withoutStoredAdvice.score).toEqual(originalScore);
    expect(withoutStoredAdvice.ruleResults).toEqual(originalOutcomes);
    expect(withoutStoredAdvice.findings).toHaveLength(result.findings.length);
    expect(standard).toHaveBeenCalledTimes(2);
    expect(coverage).toHaveBeenCalledTimes(2);
    expect(legacy).not.toHaveBeenCalled();
    expect(crossSkill).not.toHaveBeenCalled();
  });

  it('retains original instruction-node advice rather than dropping the draft and verification', () => {
    const exception = {
      ruleId: 'INS-09', findingTitle: 'Unconfigured capability reference',
      whyItMatters: 'A reference is not a configured capability.',
      makerAction: 'Remove the unsupported capability claim.',
      suggestedText: 'If the capability is unavailable, explain the limitation.',
      acceptanceCheck: 'The instructions do not claim that the unavailable action ran.',
      evidence: [{ componentId: 'example-agent', fieldPath: 'agent_instructions', quote: 'Use the missing action.' }],
    };
    const output = parseArc2NodeOutput({
      contract: 'arc2-node-output-v4', schemaVersion: 4, node: 'copilot-instructions',
      unitId: 'coverage', subjectId: 'example-agent', attempt: 1, status: 'complete',
      result: { exceptions: [exception], notAssessed: [] },
    })!;
    const finding = arc2ToInstructionCoverage(output).findings[0];
    expect(finding).toMatchObject({
      makerAction: exception.makerAction,
      suggestedText: exception.suggestedText,
      acceptanceCheck: exception.acceptanceCheck,
    });
  });
});
