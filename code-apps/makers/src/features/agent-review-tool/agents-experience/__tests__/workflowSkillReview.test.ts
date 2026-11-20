import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { executeCopilotReview, type ReviewAiPort } from '../services/CopilotReviewService';
import { WorkflowReviewAiProviderCore, type WorkflowJobPort } from '../services/ai-providers/WorkflowReviewAiProviderCore';
import { bindWorkflowReviewAiPort } from '../services/ai-providers/reviewAiPortCore';
import { executeSkillBundleReview } from '../services/SkillBundleReviewService';
import { parseAgentsExperience } from '../services/AgentsExperienceParser';
import { mapReviewJobItems } from '../services/jobs/reviewJobMapping';
import { ReviewJobItemStatus, ReviewJobStatus } from '../contracts/ReviewJob';
import { getCopilotReviewCompletion } from '../services/copilotReviewCompletion';
import { buildPersistedCopilotReview } from '../services/skill/persistedSkillReview';
import { parsePersistedCopilotPayload } from '../utils/persistedCopilotReviewGuard';
import { buildPersistedSkillView } from '../components/viewModel';
import { SkillsListView } from '../components/skills/SkillsListView';
import { SkillDrillView } from '../components/skills/SkillDrill';
import { bundle, copilotPayloadWithDeepSecretEvidence, textResource } from './skillTestFixtures';

const path = 'references/id-policy.md';
const analysis = {
  resourcePath: path,
  status: 'complete',
  riskLevel: 'none',
  readiness: 'ready',
  purposeAlignment: { matches: false, rationale: 'The file contradicts the skill steps.' },
  observedBehaviors: [],
  dependencies: [],
  externalEndpoints: [],
  capabilities: [],
  runtimeAssumptions: [],
};
const coverageNote = 'The rules checked the supporting files. The AI checked the skill, not each file separately.';

async function runWorkflow(resources?: unknown, itemStatus = ReviewJobItemStatus.Succeeded, extraFile = false) {
  const input = bundle({
    skillName: 'id-check',
    skillMarkdown: '---\nname: id-check\ndescription: Use when checking an ID.\n---\n# Steps\nRead references/id-policy.md.',
    resources: [
      textResource(path, 'Only a physical photo ID is accepted.'),
      ...(extraFile ? [textResource('references/other.md', 'Another policy.')] : []),
    ],
  });
  const jobs: WorkflowJobPort = {
    createReviewJob: vi.fn(async () => 'unused-job'),
    getReviewJob: vi.fn(async () => ({
      cat_agentreviewjobid: 'test-job', cat_jobstatus: ReviewJobStatus.Succeeded,
    })),
    getReviewJobResults: vi.fn(async () => mapReviewJobItems([{
      cat_agentreviewjobitemid: 'test-item',
      cat_componentindex: 0,
      cat_skillname: input.skillName,
      cat_itemstatus: itemStatus,
      cat_resultjson: JSON.stringify({
        skillName: input.skillName, exceptions: [], notAssessed: [],
        dimensions: [{ key: 'Clarity', score: 80, rationale: 'Clear.' }],
        ...(resources === undefined ? {} : { resources }),
      }),
    }])),
    getAgentLevelResult: vi.fn(async () => null),
    countCompletedComponents: vi.fn(async () => 1),
  };
  const provider = new WorkflowReviewAiProviderCore({
    botId: 'test-agent', botName: 'Test agent',
    sourceEnvironment: 'https://example.crm.dynamics.com', existingJobId: 'test-job',
  }, jobs);
  await provider.prime([input], new Map(), parseAgentsExperience('{}', []));

  const retired = () => { throw new Error('A retired deep prompt was called.'); };
  const prompt: Required<Omit<ReviewAiPort, 'aiBackend'>> = {
    invokeSkillBundleEvaluator: vi.fn(retired),
    invokeInstructionCoverage: vi.fn(async () => null),
    invokeStandardSkillBundleEvaluator: vi.fn(retired),
    invokeSkillResourceChunkEvaluator: vi.fn(retired),
    invokeSkillFileSynthesizer: vi.fn(retired),
    invokeDeepSkillBundleSynthesizer: vi.fn(retired),
    invokeCrossSkillOrchestrator: vi.fn(async () => null),
  };
  const port = bindWorkflowReviewAiPort(provider, prompt);
  const result = await executeSkillBundleReview(input, {
    ai: { ...port, invokeStandardSkillBundleEvaluator: port.invokeStandardSkillBundleEvaluator! },
    deepProvisioned: true,
  });
  const persistenceInput = copilotPayloadWithDeepSecretEvidence();
  const payload = {
    ...persistenceInput.payload,
    findings: [],
    skillBundleReviews: [result],
    bundleRetrievalIssues: [],
    crossSkillOrchestration: undefined,
    analysisStatus: undefined,
    score: { ...persistenceInput.payload.score, status: 'complete' as const },
  };
  const saved = buildPersistedCopilotReview({
    ...persistenceInput, payload, bundles: [input], mode: result.mode,
  });
  const persisted = parsePersistedCopilotPayload(JSON.parse(saved.json))!;
  expect(persisted).toBeDefined();
  return { result, payload, persisted, prompt, input, port };
}

function expectNoDeepPrompts(prompt: Required<Omit<ReviewAiPort, 'aiBackend'>>) {
  expect(prompt.invokeSkillResourceChunkEvaluator).not.toHaveBeenCalled();
  expect(prompt.invokeSkillFileSynthesizer).not.toHaveBeenCalled();
  expect(prompt.invokeDeepSkillBundleSynthesizer).not.toHaveBeenCalled();
}

describe('workflow skill review without retired deep prompts', () => {
  it.each([{ resources: undefined }, { resources: [] }])(
    'completes the skill with reduced file coverage when resources are $resources',
    async ({ resources }) => {
      const { result, payload, persisted, prompt } = await runWorkflow(resources);
      expect(result.status).toBe('complete');
      expect(result.mode).toBe('standard');
      expect(result.deepEvaluation).toBeUndefined();
      expectNoDeepPrompts(prompt);
      expect(getCopilotReviewCompletion(payload)).toEqual({ status: 'completed' });
      expect(getCopilotReviewCompletion(persisted)).toEqual({ status: 'completed' });
      expect(persisted.score).toEqual(payload.score);
      const stored = persisted.skillBundleReviews[0];
      expect(stored.coverage.resourcesReviewed).toBe(0);
      expect(stored.manifest[0].analysisStatus).not.toBe('completed');
      expect(stored.scores.readiness.value).toBeNull();
      expect(stored.scores.safety.value).toBeNull();
      expect(stored.promptVersions).toEqual({ standard: 'workflow-served' });
    },
  );

  it('keeps the workflow backend when the Copilot service assembles the skill port', async () => {
    const { input, port, prompt } = await runWorkflow();
    const reviewed = await executeCopilotReview('test-agent', '{}', {
      getBotComponents: async () => [],
      getSkillBundles: async () => [input],
      ai: port,
    });
    expect(reviewed.skillBundleReviews?.[0]).toMatchObject({
      aiBackend: 'workflow', mode: 'standard', status: 'complete',
    });
    expectNoDeepPrompts(prompt);
  });

  it('shows the reduced-coverage note on both skill views after save and reopen', async () => {
    const { persisted } = await runWorkflow();
    const stored = persisted.skillBundleReviews[0];
    const before = JSON.stringify(stored);
    const skill = buildPersistedSkillView(stored);
    expect(skill.coverageNote).toBe(coverageNote);
    expect(renderToStaticMarkup(createElement(SkillsListView, {
      skills: [skill], defaultOpenSkillIds: [skill.id],
    }))).toContain(coverageNote);
    expect(renderToStaticMarkup(createElement(SkillDrillView, {
      skill, backLabel: 'Skills', onBack: () => undefined,
    }))).toContain(coverageNote);
    expect(JSON.stringify(stored)).toBe(before);
  });

  it('uses returned file results, including a negative alignment verdict', async () => {
    const { result, persisted, payload, prompt } = await runWorkflow([analysis]);
    expectNoDeepPrompts(prompt);
    expect(result.status).toBe('complete');
    expect(result.mode).toBe('deep');
    expect(result.deepEvaluation?.resources[0].purposeAlignment).toEqual(analysis.purposeAlignment);
    expect(persisted.skillBundleReviews[0].deep?.resources[0].purposeAlignment)
      .toEqual(analysis.purposeAlignment);
    expect(persisted.skillBundleReviews[0].coverage.resourcesReviewed).toBe(1);
    expect(getCopilotReviewCompletion(persisted)).toEqual({ status: 'completed' });
    expect(persisted.score).toEqual(payload.score);
    expect(persisted.skillBundleReviews[0].promptVersions).toEqual({
      standard: 'workflow-served', resource: 'workflow-served',
    });
  });

  it('keeps a failed workflow item incomplete even when it contains a complete file row', async () => {
    const { result, payload, persisted, prompt } = await runWorkflow([analysis], ReviewJobItemStatus.Failed);
    expectNoDeepPrompts(prompt);
    expect(result.status).toBe('partial');
    expect(getCopilotReviewCompletion(payload).errorMessage).toContain('skill assessment(s)');
    expect(getCopilotReviewCompletion(persisted).errorMessage).toContain('skill assessment(s)');
  });

  it.each(['failed', 'partial', 'cancelled'])('keeps a %s file result incomplete', async (status) => {
    const { result, payload, persisted, prompt } = await runWorkflow([{ ...analysis, status }]);
    expectNoDeepPrompts(prompt);
    expect(result.status).toBe('partial');
    expect(getCopilotReviewCompletion(payload).errorMessage).toContain('skill assessment(s)');
    expect(getCopilotReviewCompletion(persisted).errorMessage).toContain('skill assessment(s)');
  });

  it('keeps partial file coverage incomplete when some workflow file results exist', async () => {
    const { result, payload, persisted, prompt } = await runWorkflow([analysis], ReviewJobItemStatus.Succeeded, true);
    expectNoDeepPrompts(prompt);
    expect(result.status).toBe('partial');
    expect(getCopilotReviewCompletion(payload).errorMessage).toContain('skill assessment(s)');
    expect(getCopilotReviewCompletion(persisted).errorMessage).toContain('skill assessment(s)');
  });

  it('does not treat a malformed resource payload as reduced but successful coverage', async () => {
    const { result, payload, persisted, prompt } = await runWorkflow({ resourcePath: path });
    expectNoDeepPrompts(prompt);
    expect(result.status).toBe('partial');
    expect(getCopilotReviewCompletion(payload).errorMessage).toContain('skill assessment(s)');
    expect(getCopilotReviewCompletion(persisted).errorMessage).toContain('skill assessment(s)');
  });

  it('keeps a real deterministic failure in the completion banner', async () => {
    const { payload } = await runWorkflow();
    expect(getCopilotReviewCompletion({
      ...payload, score: { ...payload.score, status: 'partial' },
    }).errorMessage).toContain('deterministic checks');
  });

  it('keeps each skill mode when the aggregate review reaches deep coverage', async () => {
    const { result, payload, input } = await runWorkflow();
    const baseline = copilotPayloadWithDeepSecretEvidence();
    const saved = buildPersistedCopilotReview({
      ...baseline, payload, bundles: [input], mode: 'deep',
    });
    const persisted = parsePersistedCopilotPayload(JSON.parse(saved.json))!;
    expect(persisted.skillBundleReviews[0].mode).toBe(result.mode);
    expect(getCopilotReviewCompletion(persisted)).toEqual({ status: 'completed' });
  });
});
