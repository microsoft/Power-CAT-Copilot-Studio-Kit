import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../generated/services/Cat_agentreviewsesService', () => ({
  Cat_agentreviewsesService: {
    getAll: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

import { parseDAZip } from '../utils/zipParser';
import { runDAPackageValidation } from '../utils/packageValidation';
import { reviewDACustomSkills } from '../services/DAAgentSkillReviewService';
import {
  parseDAReviewResult,
  serializeDAReviewResult,
} from '../services/DAReviewService';
import { buildDAReviewShellModel } from '../adapters/daReviewShellModel';
import type { DAReviewRecord } from '../contracts/DAReviewRecord';

async function makeMultiSkillPackage(): Promise<File> {
  const zip = new JSZip();
  const registrations = [
    { folder: 'skills/weather-summary' },
    { folder: 'skills/travel-plan' },
  ];
  zip.file('manifest.json', JSON.stringify({
    id: '11111111-1111-1111-1111-111111111111',
    version: '1.0.0',
    manifestVersion: '1.17',
    name: { short: 'Synthetic skills', full: 'Synthetic skills' },
    description: {
      short: 'Synthetic custom-skill package.',
      full: 'Synthetic custom-skill package for automated tests.',
    },
    developer: { name: 'Contoso' },
    accentColor: '#FFFFFF',
    copilotAgents: {
      declarativeAgents: [{
        id: 'synthetic-agent',
        file: 'declarativeAgent.json',
      }],
    },
    agentSkills: registrations,
  }));
  zip.file('declarativeAgent.json', JSON.stringify({
    $schema: 'https://developer.microsoft.com/json-schemas/copilot/declarative-agent/v1.9/schema.json',
    version: 'v1.9',
    id: 'synthetic-agent',
    name: 'Synthetic agent',
    description: 'Uses two synthetic custom skills.',
    instructions: 'Use the best matching skill. Do not invoke both skills for one request.',
    conversation_starters: [],
    actions: [],
    agent_skills: registrations,
  }));
  zip.file('skills/weather-summary/SKILL.md', `---
name: weather-summary
description: Use when the user asks for a synthetic weather summary.
---

Read references/weather.txt and return a concise summary.`);
  zip.file(
    'skills/weather-summary/references/weather.txt',
    'Synthetic weather resource that must not persist.',
  );
  zip.file('skills/travel-plan/SKILL.md', `---
name: travel-plan
description: Use when the user asks for a synthetic travel plan.
---

Create a concise travel plan from the supplied request.`);

  return await zip.generateAsync({ type: 'uint8array' }) as unknown as File;
}

describe('declarative-agent custom skills end to end', () => {
  it('parses, validates, evaluates, reloads, and models a synthetic multi-skill package', async () => {
    const parsed = await parseDAZip(await makeMultiSkillPackage());
    const validation = runDAPackageValidation(
      parsed.manifest,
      parsed.packageEvidence,
      parsed.skillBundles,
    );
    const invokeStandardSkillBundleEvaluator = vi.fn().mockResolvedValue({
      evaluation: {
        status: 'complete',
        dimensions: [
          { key: 'Clarity', score: 8, rationale: 'The synthetic steps are clear.' },
          { key: 'Actionability', score: 8, rationale: 'The synthetic steps are actionable.' },
          { key: 'Scope discipline', score: 9, rationale: 'The synthetic scope is narrow.' },
          { key: 'Composability', score: 8, rationale: 'The synthetic skill composes safely.' },
        ],
        findings: [],
        resourcePurposeAlignment: [],
        operationalAssumptions: [],
        unreviewedResources: [],
        summary: 'Synthetic skill evaluation.',
        referenceIds: [],
      },
      issues: [],
    });
    const customSkills = await reviewDACustomSkills(
      parsed.skillBundles,
      parsed.manifest.instructions,
      {
        ai: {
          invokeSkillBundleEvaluator: vi.fn(),
          invokeInstructionCoverage: vi.fn(),
          invokeStandardSkillBundleEvaluator,
          invokeCrossSkillOrchestrator: vi.fn().mockResolvedValue({
            evaluation: {
              status: 'complete',
              findings: [{
                id: 'XSK-01:weather+travel',
                ruleId: 'XSK-01',
                type: 'overlap',
                severity: 'medium',
                title: 'Synthetic routing overlap',
                skills: ['weather-summary', 'travel-plan'],
                evidence: 'Both skills can receive a broad itinerary request.',
                rationale: 'The parent instructions need an explicit routing boundary.',
                recommendation: 'Route weather-only requests to weather-summary.',
                fixSteps: [{
                  order: 1,
                  action: 'Add an explicit weather-only routing boundary.',
                }],
                referenceIds: [],
                confidence: 'high',
              }],
              summary: 'Synthetic orchestration evaluation.',
              referenceIds: [],
            },
            issues: [],
          }),
        },
        isProvisioned: (modelId) => modelId === 'standard' || modelId === 'orchestration',
        modelIds: {
          standard: 'standard',
          resource: 'resource',
          fileSynthesis: 'file-synthesis',
          bundleSynthesis: 'bundle-synthesis',
          orchestration: 'orchestration',
        },
      },
    );

    const original: DAReviewRecord = {
      componentIdUnique: parsed.manifest.appId,
      agentName: parsed.manifest.name,
      agentVersion: parsed.manifest.appVersion,
      publisherName: parsed.manifest.developerName,
      sourceType: 'zip',
      overallScore: null,
      iconBase64: null,
      manifest: parsed.manifest,
      packageValidation: validation,
      evidence: parsed.packageEvidence.records,
      customSkillReviews: customSkills.reviews,
      customSkillOrchestration: customSkills.orchestration,
      customSkillIssues: customSkills.issues,
    };
    const storedJson = serializeDAReviewResult(original);
    const reloaded: DAReviewRecord = {
      ...original,
      customSkillReviews: undefined,
      customSkillOrchestration: undefined,
      customSkillIssues: undefined,
      ...parseDAReviewResult(storedJson),
    };
    const model = buildDAReviewShellModel(reloaded);

    expect(parsed.skillBundles.map(bundle => bundle.skillName)).toEqual([
      'weather-summary',
      'travel-plan',
    ]);
    expect(validation.findings.filter(
      finding => finding.ruleId.startsWith('DA-SKILL-') && finding.status === 'Fail',
    )).toEqual([]);
    expect(invokeStandardSkillBundleEvaluator).toHaveBeenCalledTimes(2);
    expect(customSkills.reviews).toHaveLength(2);
    expect(customSkills.orchestration?.findings).toHaveLength(1);
    expect(storedJson).not.toContain('Synthetic weather resource that must not persist.');
    expect(model.customSkills?.skills.map(skill => skill.name)).toEqual([
      'weather-summary',
      'travel-plan',
    ]);
    expect(model.customSkills?.grouped.orchestration).toHaveLength(1);
    expect(model.issueCounts.customSkills).toBe(
      customSkills.reviews.reduce((sum, review) => sum + review.findings.length, 0) + 1,
    );
  });
});
