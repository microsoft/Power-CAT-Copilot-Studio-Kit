import { describe, expect, it } from 'vitest';
import {
  buildDACriterionSections,
  buildDAReviewShellModel,
  tallyDAIssues,
} from '../adapters/daReviewShellModel';
import type { CriterionResult, DAEvaluationResult } from '../contracts/DAEvaluationResult';
import type { DAReviewRecord } from '../contracts/DAReviewRecord';
import type { DAManifest } from '../contracts/DAManifest';
import type { ManifestHealthCheck } from '../contracts/ManifestHealthCheck';
import { bundle } from '../../agents-experience/__tests__/skillTestFixtures';
import { buildPersistedSkillBundleReview } from '../../agents-experience/services/skill/persistedSkillReview';

const passingBool = { pass: true, message: 'ok' };

function health(overrides: Partial<ManifestHealthCheck> = {}): ManifestHealthCheck {
  return {
    schemaVersion: 'v1.8',
    nameLength: { value: 10, limit: 100, pass: true },
    descriptionLength: { value: 100, limit: 1000, pass: true },
    instructionsPresent: { value: 1, limit: 1, pass: true },
    conversationStartersCount: { value: 4, max: 12, pass: true },
    actionsCount: { value: 0, max: 10, pass: true },
    colorIconPresent: true,
    daFileResolved: true,
    nameConsistency: passingBool,
    noPromptInjection: passingBool,
    noUrlsOrEmojis: passingBool,
    isConsequentialFlags: passingBool,
    httpsOnActionUrls: passingBool,
    mcpStaticDiscovery: passingBool,
    ...overrides,
  };
}

function criterion(
  status: CriterionResult['status'],
  issues: CriterionResult['issues'] = [],
  passingChecks: CriterionResult['passingChecks'] = [{ description: 'ok' }],
): CriterionResult {
  return { status, issues, passingChecks };
}

function evaluation(overrides: Partial<DAEvaluationResult> = {}): DAEvaluationResult {
  return {
    instructionsCriterion: criterion('Pass'),
    knowledgeCriterion: criterion('Pass'),
    capabilitiesCriterion: criterion('Pass'),
    actionsCriterion: criterion('Pass'),
    conversationStartersCriterion: criterion('Pass'),
    gracefulErrorHandlingCriterion: criterion('Pass'),
    summary: 'Looks good.',
    ...overrides,
  };
}

function manifest(overrides: Partial<DAManifest> = {}): DAManifest {
  return {
    appId: 'app-1',
    appVersion: '1.0.0',
    manifestVersion: 'devPreview',
    shortName: 'Agent',
    fullName: 'Agent',
    shortDescription: 'short',
    fullDescription: 'full',
    developerName: 'Contoso',
    accentColor: '#000000',
    iconBase64: null,
    pluginFiles: {},
    schemaVersion: 'v1.8',
    daId: 'da-1',
    name: 'Agent',
    description: 'desc',
    instructions: 'do things',
    capabilities: [],
    actions: [{ id: 'action-1', file: 'plugin.json' }],
    conversationStarters: [{ title: 'Start', text: 'Help me.' }],
    ...overrides,
  };
}

function review(overrides: Partial<DAReviewRecord> = {}): DAReviewRecord {
  return {
    componentIdUnique: 'app-1',
    agentName: 'Contoso Travel Assistant',
    agentVersion: '1.0.0',
    publisherName: 'Contoso',
    sourceType: 'zip',
    overallScore: 68,
    iconBase64: null,
    manifest: manifest(),
    evaluation: evaluation(),
    ...overrides,
  };
}

describe('buildDACriterionSections', () => {
  it('produces the six weighted criteria in tab order', () => {
    const sections = buildDACriterionSections(review({ manifestHealth: undefined }));
    expect(sections.map((s) => s.tab)).toEqual([
      'instructions', 'knowledge', 'capabilities', 'actions', 'starters', 'errorHandling',
    ]);
  });

  it('labels each criterion with its share of the score', () => {
    const sections = buildDACriterionSections(review({ manifestHealth: undefined }));
    const weights = Object.fromEntries(sections.map((s) => [s.tab, s.weightLabel]));
    expect(weights).toEqual({
      instructions: '30%',
      knowledge: '20%',
      capabilities: '15%',
      actions: '15%',
      starters: '10%',
      errorHandling: '10%',
    });
  });

  it('omits the Package tab when no package or health result was recorded', () => {
    const sections = buildDACriterionSections(review({ manifestHealth: undefined }));
    expect(sections.some((s) => s.tab === 'package')).toBe(false);
  });
});

describe('Actions empty-state rule', () => {
  it('marks actions not applicable when the manifest declares no actions', () => {
    const sections = buildDACriterionSections(
      review({ manifest: manifest({ actions: [] }), manifestHealth: undefined }),
    );
    const actions = sections.find((s) => s.tab === 'actions');

    expect(actions?.result).toMatchObject({
      status: 'N/A',
      issues: [],
      passingChecks: [],
      assessmentNotes: [{
        status: 'N/A',
        description: 'The agent declares no actions.',
      }],
    });
  });

  it('supplies a count-limit check when actions exist but the model returned none', () => {
    const sections = buildDACriterionSections(review({
      manifest: manifest({ actions: [{ id: 'a', file: 'a.json' }, { id: 'b', file: 'b.json' }] }),
      evaluation: evaluation({ actionsCriterion: criterion('Pass', [], []) }),
      manifestHealth: undefined,
    }));
    const actions = sections.find((s) => s.tab === 'actions');

    expect(actions?.result?.passingChecks).toEqual([
      { description: 'Action count (2) is within the maximum limit of 10' },
    ]);
  });

  it('leaves the model output alone when it already reported passing checks', () => {
    const sections = buildDACriterionSections(review({
      manifest: manifest({ actions: [{ id: 'a', file: 'a.json' }] }),
      evaluation: evaluation({
        actionsCriterion: criterion('Pass', [], [{ description: 'from the model' }]),
      }),
      manifestHealth: undefined,
    }));

    expect(sections.find((s) => s.tab === 'actions')?.result?.passingChecks)
      .toEqual([{ description: 'from the model' }]);
  });

  it('marks conversation starters not applicable when none are declared', () => {
    const sections = buildDACriterionSections(review({
      manifest: manifest({ conversationStarters: [] }),
      manifestHealth: undefined,
    }));

    expect(sections.find((s) => s.tab === 'starters')?.result).toMatchObject({
      status: 'N/A',
      assessmentNotes: [{
        status: 'N/A',
        description: 'The agent declares no conversation starters.',
      }],
    });
  });
});

describe('tallyDAIssues', () => {
  it('counts issues per tab and splits the total by severity', () => {
    const sections = buildDACriterionSections(review({
      manifestHealth: undefined,
      evaluation: evaluation({
        instructionsCriterion: criterion('Fail', [
          { severity: 'High', description: 'a', recommendation: 'x' },
          { severity: 'Medium', description: 'b', recommendation: 'y' },
        ]),
        actionsCriterion: criterion('Warning', [
          { severity: 'Low', description: 'c', recommendation: 'z' },
        ]),
      }),
    }));

    const { issueCounts, severity } = tallyDAIssues(sections);

    expect(issueCounts.instructions).toBe(2);
    expect(issueCounts.actions).toBe(1);
    expect(issueCounts.knowledge).toBe(0);
    expect(severity).toEqual({ high: 1, medium: 1, low: 1, total: 3 });
  });
});

describe('buildDAReviewShellModel', () => {
  it('adds a preview custom-skills category with per-skill and orchestration issues', () => {
    const skillBundle = bundle({
      skillName: 'synthetic-skill',
      skillSchemaName: 'synthetic-skill',
      skillMarkdown: `---
name: synthetic-skill
description: Use for synthetic review tests.
---

Complete the synthetic task.`,
    });
    const persistedReview = buildPersistedSkillBundleReview(
      skillBundle,
      {
        status: 'complete',
        mode: 'standard',
        skillName: 'synthetic-skill',
        skillSchemaName: 'synthetic-skill',
        deterministicFindings: [{
          id: 'BND-02',
          ruleId: 'BND-02',
          family: 'Skills',
          severity: 'medium',
          title: 'Synthetic bundle issue',
          fact: 'Synthetic evidence.',
          evidence: 'Synthetic evidence.',
          why: 'The bundle needs a synthetic correction.',
          fix: 'Correct the synthetic bundle.',
          recommendation: 'Correct the synthetic bundle.',
          fixSteps: [{ order: 1, action: 'Correct the synthetic bundle.' }],
          referenceId: 'ms-skills-overview',
          referenceIds: ['ms-skills-overview'],
          confidence: 'high',
          ai: false,
        }],
        standardEvaluation: {
          status: 'complete',
          dimensions: [{ key: 'Clarity', score: 8, rationale: 'Clear.' }],
          findings: [],
          resourcePurposeAlignment: [],
          operationalAssumptions: [],
          unreviewedResources: [],
          summary: 'Synthetic review.',
          referenceIds: [],
        },
        blocked: false,
      },
      '2026-09-24T00:00:00.000Z',
      '2026-09-24T00:00:01.000Z',
    );

    const model = buildDAReviewShellModel(review({
      customSkillReviews: [persistedReview],
      customSkillOrchestration: {
        status: 'complete',
        findings: [{
          id: 'XSK-01:synthetic',
          ruleId: 'XSK-01',
          type: 'overlap',
          severity: 'medium',
          title: 'Synthetic overlap',
          skills: ['synthetic-skill'],
          evidence: 'Synthetic overlap evidence.',
          rationale: 'The synthetic routing overlaps.',
          recommendation: 'Clarify the routing.',
          fixSteps: [{ order: 1, action: 'Clarify the routing.' }],
          referenceIds: [],
          confidence: 'high',
        }],
        summary: 'Synthetic orchestration review.',
        referenceIds: [],
      },
    }));

    expect(model.customSkills?.preview).toBe(true);
    expect(model.customSkills?.skills).toEqual([
      expect.objectContaining({ name: 'synthetic-skill', evaluationState: 'evaluated' }),
    ]);
    expect(model.issueCounts.customSkills).toBe(2);
    expect(model.severity).toEqual({ high: 0, medium: 2, low: 0, total: 2 });
  });

  it('shows deterministic custom-skill package failures when no bundle can be evaluated', () => {
    const model = buildDAReviewShellModel(review({
      packageValidation: {
        status: 'invalid',
        schemaVersion: 'v1.9',
        findings: [{
          ruleId: 'DA-SKILL-REGISTRATION',
          status: 'Fail',
          severity: 'High',
          method: 'deterministic',
          sourceFile: 'manifest.json',
          jsonPath: '$.agentSkills',
          evidence: '../unsafe-skill',
          explanation: 'The custom-skill registration is unsafe.',
          recommendation: 'Use a package-local skill folder.',
        }],
      },
    }));

    expect(model.customSkills?.issues).toContainEqual(expect.objectContaining({
      code: 'DA-SKILL-REGISTRATION',
      severity: 'error',
      resourcePath: 'manifest.json',
    }));
    expect(model.issueCounts.customSkills).toBe(1);
    expect(model.issueCounts.package).toBe(1);
    expect(model.severity).toEqual({ high: 1, medium: 0, low: 0, total: 1 });
  });

  it('recomputes the score from the evaluation so page and dialog agree', () => {
    const model = buildDAReviewShellModel(review({ overallScore: 1 }));
    expect(model.score).toBe(100);
  });

  it('falls back to the stored score when a record has no evaluation blob', () => {
    const model = buildDAReviewShellModel(review({ evaluation: undefined, overallScore: 42 }));
    expect(model.score).toBe(42);
  });

  it('shows legacy manifest health as an unweighted Package section', () => {
    const model = buildDAReviewShellModel(review({ manifestHealth: health() }));

    expect(model.sections).toContainEqual(expect.objectContaining({
      tab: 'package',
      criterionName: 'Legacy Package Checks',
    }));
    expect(model.subScores.every((s) => s.label !== 'Legacy Package Checks')).toBe(true);
    expect(model.subScores).toHaveLength(6);
  });

  it('reports stored package validity separately from the quality score', () => {
    const model = buildDAReviewShellModel(review({
      packageValidation: {
        status: 'invalid',
        schemaVersion: 'v1.8',
        findings: [{
          ruleId: 'DA-VERSION-REQUIRED',
          status: 'Fail',
          severity: 'High',
          method: 'deterministic',
          sourceFile: 'declarativeAgent.json',
          jsonPath: '$.version',
          evidence: '(missing)',
          explanation: 'The required version is missing.',
          recommendation: 'Set version to v1.8.',
        }],
      },
    }));

    expect(model.packageValidity).toBe('invalid');
    expect(model.score).toBe(100);
    expect(model.issueCounts.package).toBe(1);
  });

  it('redistributes displayed weights after optional criteria are excluded', () => {
    const model = buildDAReviewShellModel(review({
      manifest: manifest({ actions: [], conversationStarters: [] }),
    }));

    expect(model.subScores.map(({ label, weight }) => ({ label, weight }))).toEqual([
      { label: 'Instructions Quality', weight: '40%' },
      { label: 'Knowledge Sources', weight: '27%' },
      { label: 'Capabilities Fit', weight: '20%' },
      { label: 'Error Handling', weight: '13%' },
    ]);
  });

  it('describes a ZIP-sourced review as a ZIP upload', () => {
    expect(buildDAReviewShellModel(review({ sourceType: 'zip' })).sourceLabel).toBe('ZIP upload');
    expect(buildDAReviewShellModel(review({ sourceType: 'graph-api' })).sourceLabel).toBe('Catalog');
  });
});
