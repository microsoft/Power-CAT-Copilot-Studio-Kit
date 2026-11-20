import { describe, expect, it, vi } from 'vitest';
import type { SkillBundleReviewResult } from '../../agents-experience/contracts/SkillBundle';
import { bundle, textResource } from '../../agents-experience/__tests__/skillTestFixtures';
import { buildPersistedSkillBundleReview } from '../../agents-experience/services/skill/persistedSkillReview';
import { reviewDACustomSkills } from '../services/DAAgentSkillReviewService';

describe('declarative-agent custom-skill review projection', () => {
  it('persists a redacted review without raw supporting-resource content', () => {
    const skillBundle = bundle({
      source: 'zip-bundle',
      skillMarkdown: `---
name: synthetic-skill
description: Use this skill for synthetic tests.
---

Read references/data.txt. API_KEY="top-secret-value"
`,
      resources: [
        textResource(
          'references/data.txt',
          'private supporting content that must not be persisted',
        ),
      ],
    });
    const review: SkillBundleReviewResult = {
      status: 'complete',
      mode: 'standard',
      skillName: 'synthetic-skill',
      skillSchemaName: 'synthetic-skill',
      deterministicFindings: [],
      standardEvaluation: {
        status: 'complete',
        dimensions: [],
        findings: [],
        resourcePurposeAlignment: [],
        operationalAssumptions: [],
        unreviewedResources: [],
        summary: 'Synthetic evaluation.',
        referenceIds: [],
      },
      blocked: false,
    };

    const persisted = buildPersistedSkillBundleReview(
      skillBundle,
      review,
      '2026-09-24T00:00:00.000Z',
      '2026-09-24T00:00:01.000Z',
    );
    const json = JSON.stringify(persisted);

    expect(persisted.skillName).toBe('synthetic-skill');
    expect(persisted.sourceFiles).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'SKILL.md', isSkillDefinition: true }),
      expect.objectContaining({ path: 'references/data.txt' }),
    ]));
    expect(json).not.toContain('private supporting content');
    expect(json).not.toContain('top-secret-value');
    expect(json).toContain('[REDACTED]');
  });

  it('runs the existing skill-review engine and returns sanitized durable reviews', async () => {
    const invokeStandardSkillBundleEvaluator = vi.fn().mockResolvedValue({
      evaluation: {
        status: 'complete',
        dimensions: [],
        findings: [],
        resourcePurposeAlignment: [],
        operationalAssumptions: [],
        unreviewedResources: [],
        summary: 'Synthetic evaluation.',
        referenceIds: [],
      },
      issues: [],
    });
    const skillBundle = bundle({
      skillName: 'synthetic-skill',
      skillSchemaName: 'synthetic-skill',
      source: 'zip-bundle',
      skillMarkdown: `---
name: synthetic-skill
description: Use this skill for synthetic tests.
---

Read references/data.txt.
`,
      resources: [
        textResource(
          'references/data.txt',
          'transient supporting content',
        ),
      ],
    });

    const result = await reviewDACustomSkills(
      [skillBundle],
      'Use the best matching custom skill.',
      {
        ai: {
          invokeSkillBundleEvaluator: vi.fn(),
          invokeInstructionCoverage: vi.fn(),
          invokeStandardSkillBundleEvaluator,
        },
        isProvisioned: (modelId) => modelId === 'standard',
        modelIds: {
          standard: 'standard',
          resource: 'resource',
          fileSynthesis: 'file-synthesis',
          bundleSynthesis: 'bundle-synthesis',
          orchestration: 'orchestration',
        },
        now: vi
          .fn()
          .mockReturnValueOnce('2026-09-24T00:00:00.000Z')
          .mockReturnValue('2026-09-24T00:00:01.000Z'),
      },
    );

    expect(invokeStandardSkillBundleEvaluator).toHaveBeenCalledOnce();
    expect(result.reviews).toHaveLength(1);
    expect(result.reviews[0]).toMatchObject({
      skillName: 'synthetic-skill',
      status: 'complete',
      mode: 'standard',
    });
    expect(JSON.stringify(result.reviews)).not.toContain('transient supporting content');
  });

  it('evaluates and sanitizes cross-skill orchestration for multiple skills', async () => {
    const invokeStandardSkillBundleEvaluator = vi.fn().mockResolvedValue({
      evaluation: {
        status: 'complete',
        dimensions: [],
        findings: [],
        resourcePurposeAlignment: [],
        operationalAssumptions: [],
        unreviewedResources: [],
        summary: 'Synthetic evaluation.',
        referenceIds: [],
      },
      issues: [],
    });
    const invokeCrossSkillOrchestrator = vi.fn().mockResolvedValue({
      evaluation: {
        status: 'complete',
        findings: [{
          id: 'XSK-01:first+second',
          ruleId: 'XSK-01',
          type: 'overlap',
          severity: 'medium',
          title: 'Synthetic overlap',
          skills: ['first', 'second'],
          evidence: 'token="secret-value"',
          rationale: 'Both skills handle the same synthetic request.',
          recommendation: 'Separate their activation conditions.',
          fixSteps: [{ order: 1, action: 'Separate activation conditions.' }],
          referenceIds: [],
          confidence: 'high',
        }],
        summary: 'Synthetic overlap review.',
        referenceIds: [],
      },
      issues: [],
    });
    const first = bundle({
      skillName: 'first',
      skillSchemaName: 'first',
      skillMarkdown: `---
name: first
description: Use for the first synthetic task.
---

Run the first task.
`,
    });
    const second = bundle({
      skillName: 'second',
      skillSchemaName: 'second',
      skillMarkdown: `---
name: second
description: Use for the second synthetic task.
---

Run the second task.
`,
    });

    const result = await reviewDACustomSkills(
      [first, second],
      'Route each request to one skill.',
      {
        ai: {
          invokeSkillBundleEvaluator: vi.fn(),
          invokeInstructionCoverage: vi.fn(),
          invokeStandardSkillBundleEvaluator,
          invokeCrossSkillOrchestrator,
        },
        isProvisioned: (modelId) =>
          modelId === 'standard' || modelId === 'orchestration',
        modelIds: {
          standard: 'standard',
          resource: 'resource',
          fileSynthesis: 'file-synthesis',
          bundleSynthesis: 'bundle-synthesis',
          orchestration: 'orchestration',
        },
      },
    );

    expect(invokeCrossSkillOrchestrator).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_instructions: 'Route each request to one skill.',
      }),
      ['first', 'second'],
      expect.stringContaining('Run the first task.'),
    );
    expect(result.orchestration?.findings[0].evidence).toContain('[REDACTED]');
    expect(JSON.stringify(result.orchestration)).not.toContain('secret-value');
  });

  it('does not persist secrets from evaluator failures', async () => {
    const skillBundle = bundle({
      skillName: 'synthetic-skill',
      skillSchemaName: 'synthetic-skill',
    });

    const result = await reviewDACustomSkills(
      [skillBundle],
      'Use the synthetic skill.',
      {
        ai: {
          invokeSkillBundleEvaluator: vi.fn(),
          invokeInstructionCoverage: vi.fn(),
          invokeStandardSkillBundleEvaluator: vi.fn().mockRejectedValue(
            new Error('API_KEY="top-secret-value"'),
          ),
        },
        isProvisioned: (modelId) => modelId === 'standard',
        modelIds: {
          standard: 'standard',
          resource: 'resource',
          fileSynthesis: 'file-synthesis',
          bundleSynthesis: 'bundle-synthesis',
          orchestration: 'orchestration',
        },
      },
    );

    expect(result.reviews[0].status).toBe('partial');
    expect(JSON.stringify(result)).not.toContain('top-secret-value');
  });

  it('redacts secrets from persisted orchestration failure issues', async () => {
    const invokeStandardSkillBundleEvaluator = vi.fn().mockResolvedValue({
      evaluation: {
        status: 'complete',
        dimensions: [],
        findings: [],
        resourcePurposeAlignment: [],
        operationalAssumptions: [],
        unreviewedResources: [],
        summary: 'Synthetic evaluation.',
        referenceIds: [],
      },
      issues: [],
    });

    const result = await reviewDACustomSkills(
      [
        bundle({ skillName: 'first', skillSchemaName: 'first' }),
        bundle({ skillName: 'second', skillSchemaName: 'second' }),
      ],
      'Route to one synthetic skill.',
      {
        ai: {
          invokeSkillBundleEvaluator: vi.fn(),
          invokeInstructionCoverage: vi.fn(),
          invokeStandardSkillBundleEvaluator,
          invokeCrossSkillOrchestrator: vi.fn().mockRejectedValue(
            new Error('API_KEY="top-secret-value"'),
          ),
        },
        isProvisioned: (modelId) =>
          modelId === 'standard' || modelId === 'orchestration',
        modelIds: {
          standard: 'standard',
          resource: 'resource',
          fileSynthesis: 'file-synthesis',
          bundleSynthesis: 'bundle-synthesis',
          orchestration: 'orchestration',
        },
      },
    );

    expect(result.issues).toHaveLength(1);
    expect(JSON.stringify(result.issues)).not.toContain('top-secret-value');
    expect(result.issues[0].message).toContain('[REDACTED]');
  });
});
