import { describe, expect, it } from 'vitest';
import type {
  SkillResourceAnalysisView,
  SkillView,
} from '../components/viewTypes';
import {
  buildSkillFileExplorerModel,
  resolveSelectedSkillFile,
} from '../components/skills/skillFileExplorerModel';

function resourceAnalysis(
  path: string,
  overrides: Partial<SkillResourceAnalysisView> = {},
): SkillResourceAnalysisView {
  return {
    path,
    evaluationStatus: 'complete',
    riskLevel: 'medium',
    readiness: 'needs-configuration',
    analyzedChunks: 1,
    totalChunks: 2,
    observedBehaviors: [],
    dependencies: [],
    externalEndpoints: [],
    capabilities: [],
    runtimeAssumptions: [],
    findings: [],
    purposeAlignment: { matches: true, rationale: 'Supports the skill.' },
    ...overrides,
  };
}

function skill(overrides: Partial<SkillView> = {}): SkillView {
  return {
    id: 'skill-1',
    schemaName: 'agent.skill.one',
    name: 'One',
    description: '',
    source: 'zip-bundle',
    safetyFlagged: false,
    sizeLabel: '1 KB',
    dimensions: [],
    markdown: 'bic:bundle',
    sourceFiles: [
      {
        path: 'references/guide.md',
        sizeBytes: 40,
        language: 'markdown',
        kind: 'reference',
        isSkillDefinition: false,
      },
      {
        path: 'SKILL.md',
        sizeBytes: 80,
        language: 'markdown',
        kind: 'skill-definition',
        isSkillDefinition: true,
      },
      {
        path: 'scripts/run.py',
        sizeBytes: 60,
        language: 'python',
        kind: 'script',
        isSkillDefinition: false,
      },
    ],
    resourceManifest: [
      {
        path: './scripts/run.py',
        kind: 'script',
        language: 'python',
        sizeBytes: 60,
        analysisStatus: 'completed',
        referencedBy: [],
      },
    ],
    resourceAnalyses: [resourceAnalysis('Scripts/run.py')],
    skillDefinitionSource: '# One\n\nRun the script.',
    ...overrides,
  };
}

describe('buildSkillFileExplorerModel', () => {
  it('orders SKILL.md first, then folders and files alphabetically', () => {
    const model = buildSkillFileExplorerModel(skill());

    expect(model.entries.map(entry => entry.displayPath)).toEqual([
      'SKILL.md',
      'references/guide.md',
      'scripts/run.py',
    ]);
  });

  it('joins path variants without using the display path as the entry identity', () => {
    const model = buildSkillFileExplorerModel(skill());
    const script = model.entries.find(entry => entry.displayPath === 'scripts/run.py');

    expect(script?.entryId).not.toBe(script?.pathKey);
    expect(script?.analysisStatus).toBe('completed');
    expect(script?.analysis?.evaluationStatus).toBe('complete');
    expect(script?.analysis?.totalChunks).toBe(2);
  });

  it('does not guess a join when source paths collide by case', () => {
    const model = buildSkillFileExplorerModel(skill({
      sourceFiles: [
        {
          path: 'scripts/run.py',
          sizeBytes: 60,
          language: 'python',
          kind: 'script',
          isSkillDefinition: false,
        },
        {
          path: 'Scripts/run.py',
          sizeBytes: 61,
          language: 'python',
          kind: 'script',
          isSkillDefinition: false,
        },
      ],
    }));

    expect(model.entries).toHaveLength(2);
    expect(new Set(model.entries.map(entry => entry.entryId)).size).toBe(2);
    for (const entry of model.entries) {
      expect(entry.analysis).toBeUndefined();
      expect(entry.joinIssue).toContain('duplicate');
    }
  });

  it('keeps an unsafe legacy path visible but does not use it as a join key', () => {
    const model = buildSkillFileExplorerModel(skill({
      sourceFiles: [{
        path: '../outside.py',
        sizeBytes: 12,
        language: 'python',
        kind: 'script',
        isSkillDefinition: false,
      }],
      resourceAnalyses: [resourceAnalysis('../outside.py')],
    }));

    expect(model.entries[0].displayPath).toBe('../outside.py');
    expect(model.entries[0].pathKey).toBeUndefined();
    expect(model.entries[0].analysis).toBeUndefined();
    expect(model.entries[0].joinIssue).toContain('legacy path');
  });

  it('returns a truthful historical state when file metadata is absent', () => {
    const model = buildSkillFileExplorerModel(skill({
      sourceFiles: undefined,
      resourceManifest: undefined,
      resourceAnalyses: undefined,
    }));

    expect(model.entries).toEqual([]);
    expect(model.availability).toBe('historical');
  });

  it('uses the saved redacted skill definition for SKILL.md', () => {
    const model = buildSkillFileExplorerModel(skill());
    const definition = model.entries.find(entry => entry.isSkillDefinition);

    expect(definition?.sourceText).toContain('# One');
    expect(definition?.sourceOmission).toBeUndefined();
  });
});

describe('resolveSelectedSkillFile', () => {
  it('falls back to the first current entry after a rerun removes the selection', () => {
    const entries = buildSkillFileExplorerModel(skill()).entries;

    expect(resolveSelectedSkillFile(entries, 'removed-entry')?.entryId).toBe(
      entries[0].entryId,
    );
  });
});
