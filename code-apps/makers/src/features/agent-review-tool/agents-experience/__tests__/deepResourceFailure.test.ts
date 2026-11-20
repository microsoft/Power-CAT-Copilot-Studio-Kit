import { describe, expect, it } from 'vitest';
import { executeFileSynthesis } from '../services/skill/deepSynthesis';
import { chunkResource } from '../services/skill/chunking';
import type { DeepSkillReviewAiPort } from '../services/skill/deepReviewHelpers';
import type { ResourceChunkEvaluation, SkillResourceEvaluation } from '../contracts/SkillEvaluation';
import { FILE_SYNTHESIS_TOKEN_CEILING } from '../services/skill/tokenBudget';
import { bundle, textResource } from './skillTestFixtures';

const unexpectedCall = async () => {
  throw new Error('No AI call is expected when every input chunk already failed.');
};
const ai: DeepSkillReviewAiPort = {
  invokeSkillResourceChunkEvaluator: unexpectedCall,
  invokeSkillFileSynthesizer: unexpectedCall,
  invokeDeepSkillBundleSynthesizer: unexpectedCall,
};

async function batchedInput() {
  const resource = textResource('scripts/charts.py', 'print("example")');
  const [first] = await chunkResource(resource);
  const chunks = [first, { ...first, chunkId: `${first.chunkId}-second`, index: 1 }];
  const evaluation: SkillResourceEvaluation = {
    resourcePath: resource.normalizedPath,
    status: 'complete',
    riskLevel: 'none',
    readiness: 'ready',
    observedBehaviors: [],
    dependencies: [],
    externalEndpoints: [],
    capabilities: [],
    runtimeAssumptions: [],
    findings: [],
    purposeAlignment: { matches: true, rationale: 'Example.' },
    analyzedChunks: 2,
    totalChunks: 2,
    referenceIds: [],
  };
  const chunkResults = chunks.map(chunk => {
    const chunkEvaluation: ResourceChunkEvaluation = {
      ...evaluation,
      status: 'complete',
      chunkId: chunk.chunkId,
      observedBehaviors: [{
        kind: 'read',
        evidence: 'x'.repeat(FILE_SYNTHESIS_TOKEN_CEILING * 3),
      }],
    };
    return {
      status: 'fulfilled' as const,
      value: { findings: [], issues: [], evaluation: chunkEvaluation },
    };
  });
  return {
    evaluation,
    input: new Map([[resource.normalizedPath, { resource, chunks, chunkResults }]]),
    bundle: bundle({ resources: [resource] }),
  };
}

describe('Detailed resource failure diagnostics', () => {
  it('retains errors when all file-synthesis batches fail', async () => {
    const source = await batchedInput();
    const result = await executeFileSynthesis(source.input, [], new Map(), source.bundle, {
      ...ai,
      invokeSkillFileSynthesizer: async () => {
        throw new Error('Batch synthesis failed: 503 service unavailable.');
      },
    });

    expect(result.fileEvaluations[0]).toMatchObject({
      status: 'partial',
      parseError: expect.stringContaining('503 service unavailable'),
    });
  });

  it('does not call the file complete when a required synthesis batch fails', async () => {
    const source = await batchedInput();
    let calls = 0;
    const result = await executeFileSynthesis(source.input, [], new Map(), source.bundle, {
      ...ai,
      invokeSkillFileSynthesizer: async () => {
        if (++calls === 1) throw new Error('First synthesis batch failed: 503 service unavailable.');
        return { evaluation: source.evaluation, issues: [] };
      },
    });

    expect(calls).toBe(2);
    expect(result.fileEvaluations[0]).toMatchObject({
      status: 'partial',
      parseError: expect.stringContaining('503 service unavailable'),
    });
  });

  it('retains an error from file synthesis after successful chunk calls', async () => {
    const resource = textResource('scripts/charts.py', 'print("example")');
    const [first] = await chunkResource(resource);
    const chunks = [first, { ...first, chunkId: `${first.chunkId}-second`, index: 1 }];
    const result = await executeFileSynthesis(new Map([[
      resource.normalizedPath,
      {
        resource,
        chunks,
        chunkResults: chunks.map(() => ({
          status: 'fulfilled' as const,
          value: { findings: [], issues: [] },
        })),
      },
    ]]), [], new Map(), bundle({ resources: [resource] }), {
      ...ai,
      invokeSkillFileSynthesizer: async () => {
        throw new Error('File synthesis failed: 503 service unavailable.');
      },
    });

    expect(result.fileEvaluations[0]).toMatchObject({
      status: 'partial',
      parseError: expect.stringContaining('503 service unavailable'),
    });
  });

  it('retains the actual failure reason instead of only All chunks failed', async () => {
    const resource = textResource('scripts/charts.py', 'print("example")');
    const chunks = await chunkResource(resource);
    const result = await executeFileSynthesis(new Map([[
      resource.normalizedPath,
      {
        resource,
        chunks,
        chunkResults: [{
          status: 'rejected' as const,
          reason: new Error('Resource evaluator request failed: 403 permission denied.'),
        }],
      },
    ]]), [], new Map(), bundle({ resources: [resource] }), ai);

    expect(result.fileEvaluations[0]).toMatchObject({
      status: 'failed',
      analyzedChunks: 0,
      totalChunks: 1,
      parseError: expect.stringContaining('403 permission denied'),
    });
  });

  it('redacts secrets from resource failure details before they can reach the UI', async () => {
    const resource = textResource('scripts/charts.py', 'print("example")');
    const chunks = await chunkResource(resource);
    const result = await executeFileSynthesis(new Map([[
      resource.normalizedPath,
      {
        resource,
        chunks,
        chunkResults: [{
          status: 'rejected' as const,
          reason: new Error('Request failed. api_key = "private-resource-test-key"'),
        }],
      },
    ]]), [], new Map(), bundle({ resources: [resource] }), ai);

    expect(result.fileEvaluations[0].parseError).toContain('[REDACTED]');
    expect(JSON.stringify(result)).not.toContain('private-resource-test-key');
  });
});
