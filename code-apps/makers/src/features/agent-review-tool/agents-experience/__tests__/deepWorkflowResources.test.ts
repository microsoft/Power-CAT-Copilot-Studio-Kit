/**
 * Phase B: the workflow agent analyses resources in the same call that evaluates
 * the skill, so the deep facade must skip the AI Builder chunk/synthesise
 * cascade when that analysis is present -- and still run it when it is not.
 */
import { describe, expect, it, vi } from 'vitest';

const executeDeepSkillReview = vi.fn();
vi.mock('../services/skill/DeepSkillReviewOrchestrator', () => ({
  executeDeepSkillReview: (...args: unknown[]) => executeDeepSkillReview(...args),
}));

import { executeDeepSkillBundleReview } from '../services/skill/deepFacade';
import { bundle as makeBundle, textResource } from './skillTestFixtures';
import type { SkillBundle } from '../contracts/SkillBundle';
import type {
  StandardSkillBundleEvaluation,
  SkillResourceEvaluation,
} from '../contracts/SkillEvaluation';

const resource = (path: string): SkillResourceEvaluation =>
  ({
    resourcePath: path,
    status: 'complete',
    riskLevel: 'high',
    readiness: 'needs-configuration',
    observedBehaviors: [{ kind: 'http-post', evidence: 'requests.post(ENDPOINT' }],
    dependencies: [],
    externalEndpoints: [],
    capabilities: [{ kind: 'network', evidence: 'requests.post(ENDPOINT' }],
    runtimeAssumptions: [],
    findings: [],
    purposeAlignment: { matches: true, rationale: '' },
    analyzedChunks: 1,
    totalChunks: 1,
    referenceIds: [],
  }) as SkillResourceEvaluation;

const standard = (
  resources?: SkillResourceEvaluation[],
): StandardSkillBundleEvaluation => ({
  status: 'complete',
  dimensions: [],
  findings: [],
  resourcePurposeAlignment: [],
  operationalAssumptions: [{ statement: 'needs an API key', evidence: 'ENDPOINT', resourcePath: 'scripts/x.py' }],
  unreviewedResources: [],
  summary: 'ok',
  referenceIds: [],
  ...(resources ? { resources } : {}),
});

const runStandard = (resources?: SkillResourceEvaluation[]) => async () =>
  ({
    status: 'complete',
    mode: 'standard',
    skillName: 'skill-a',
    skillSchemaName: 'skill_a',
    deterministicFindings: [],
    standardEvaluation: standard(resources),
    validationIssues: [],
  }) as never;

const bundle: SkillBundle = makeBundle({
  skillName: 'skill-a',
  resources: [
    textResource('scripts/x.py', "print('test')"),
    textResource('docs/y.md', '# Test'),
  ],
});
const deepAi = {} as never;

describe('executeDeepSkillBundleReview — workflow resource analysis', () => {
  it('skips the AI Builder cascade when the workflow already analysed the files', async () => {
    executeDeepSkillReview.mockClear();

    const r = await executeDeepSkillBundleReview(
      bundle,
      'skill-a',
      'skill_a',
      deepAi,
      runStandard([resource('scripts/x.py'), resource('docs/y.md')]),
    );

    expect(executeDeepSkillReview).not.toHaveBeenCalled();
    expect(r.mode).toBe('deep');
    expect(r.deepEvaluation?.resources).toHaveLength(2);
    expect(r.deepEvaluation?.synthesisLevel).toBe('final');
    // Carried across so the UI's assumption list still populates.
    expect(r.deepEvaluation?.operationalAssumptions[0].resourcePaths).toEqual(['scripts/x.py']);
  });

  // The AI Builder backend cannot produce per-resource analysis in one call, so
  // it must keep its cascade. This is what makes the backend switch lossless.
  it('still runs the cascade when the backend produced no resource analysis', async () => {
    executeDeepSkillReview.mockClear();
    executeDeepSkillReview.mockResolvedValue({
      status: 'complete',
      synthesisLevel: 'final',
      resources: [],
      crossFileChains: [],
      findings: [],
      operationalAssumptions: [],
      summary: '',
      referenceIds: [],
    });

    await executeDeepSkillBundleReview(bundle, 'skill-a', 'skill_a', deepAi, runStandard());

    expect(executeDeepSkillReview).toHaveBeenCalledOnce();
  });

  it('treats an empty resources array as "not analysed"', async () => {
    executeDeepSkillReview.mockClear();
    executeDeepSkillReview.mockResolvedValue({
      status: 'complete',
      synthesisLevel: 'final',
      resources: [],
      crossFileChains: [],
      findings: [],
      operationalAssumptions: [],
      summary: '',
      referenceIds: [],
    });

    await executeDeepSkillBundleReview(bundle, 'skill-a', 'skill_a', deepAi, runStandard([]));

    expect(executeDeepSkillReview).toHaveBeenCalledOnce();
  });

  it('records file coverage and excludes SKILL.md from supporting-file results', async () => {
    const input = makeBundle({
      resources: [
        textResource('scripts/x.py', "print('test')"),
        textResource('docs/y.md', '# Test'),
      ],
    });
    const result = await executeDeepSkillBundleReview(
      input, 'skill-a', 'skill_a', deepAi,
      runStandard([resource('scripts/x.py'), resource('docs/y.md'), resource('SKILL.md')]),
    );

    expect(input.resources.map(file => file.analysisStatus)).toEqual(['completed', 'completed']);
    expect(input.resources.map(file => file.chunks.length)).toEqual([1, 1]);
    expect(result.deepEvaluation?.resources.map(file => file.resourcePath))
      .toEqual(['scripts/x.py', 'docs/y.md']);
    expect(result.status).toBe('complete');
  });

  it('does not claim completion when one supporting file has no assessment', async () => {
    const input = makeBundle({
      resources: [
        textResource('scripts/x.py', "print('test')"),
        textResource('docs/y.md', '# Test'),
      ],
    });
    const result = await executeDeepSkillBundleReview(
      input, 'skill-a', 'skill_a', deepAi, runStandard([resource('scripts/x.py')]),
    );

    expect(result.status).toBe('partial');
    expect(result.deepEvaluation?.status).toBe('partial');
    expect(input.resources[1].analysisStatus).toBe('partial');
    expect(result.error).toContain('supporting file');
  });

  it('keeps a failed standard phase partial even when the deep phase completes', async () => {
    executeDeepSkillReview.mockResolvedValue({
      status: 'complete',
      synthesisLevel: 'final',
      resources: [],
      crossFileChains: [],
      findings: [],
      operationalAssumptions: [],
      summary: '',
      referenceIds: [],
    });
    const partialStandard = async () => ({
      status: 'partial' as const,
      mode: 'standard' as const,
      skillName: 'skill-a',
      skillSchemaName: 'skill_a',
      deterministicFindings: [],
      standardEvaluation: { ...standard(), status: 'partial' as const },
      validationIssues: [],
      error: 'The skill assessment failed.',
    });

    const result = await executeDeepSkillBundleReview(
      bundle, 'skill-a', 'skill_a', deepAi, partialStandard,
    );

    expect(result.status).toBe('partial');
    expect(result.error).toBe('The skill assessment failed.');
  });
});
