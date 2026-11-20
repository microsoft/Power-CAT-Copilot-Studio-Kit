import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SSRProvider } from '@fluentui/react-components';
import { describe, expect, it, vi } from 'vitest';
import { SkillFilesExplorer } from '../components/skills/SkillFilesExplorer';
import { SkillDrillView } from '../components/skills/SkillDrill';
import type { SkillView } from '../components/viewTypes';

function skill(overrides: Partial<SkillView> = {}): SkillView {
  return {
    id: 'skill-1',
    schemaName: 'agent.skill.one',
    name: 'Expense helper',
    description: 'Processes expense files.',
    source: 'zip-bundle',
    safetyFlagged: false,
    sizeLabel: '1 KB',
    dimensions: [],
    evaluationState: 'evaluated',
    markdown: 'bic:bundle',
    sourceFiles: [{
      path: 'SKILL.md',
      sizeBytes: 80,
      language: 'markdown',
      isSkillDefinition: true,
    }],
    skillDefinitionSource: '# Expense helper\n\nUse scripts/run.py.',
    ...overrides,
  };
}

function render(content: ReturnType<typeof createElement>): string {
  return renderToStaticMarkup(
    createElement(SSRProvider, null, content),
  );
}

describe('SkillFilesExplorer', () => {
  it('shows the retained redacted SKILL.md definition', () => {
    const html = render(createElement(SkillFilesExplorer, { skill: skill() }));

    expect(html).toContain('SKILL.md');
    expect(html).toContain('# Expense helper');
    expect(html).toContain('1 file');
  });

  it('shows separate manifest, evaluation, coverage, and sanitized evidence', () => {
    const resourceSkill = skill({
      sourceFiles: [{
        path: 'scripts/run.py',
        sizeBytes: 120,
        language: 'python',
        kind: 'script',
        isSkillDefinition: false,
      }],
      resourceManifest: [{
        path: 'scripts/run.py',
        kind: 'script',
        language: 'python',
        sizeBytes: 120,
        referencedBy: ['SKILL.md'],
        analysisStatus: 'completed',
        riskLevel: 'medium',
        readiness: 'needs-configuration',
      }],
      resourceAnalyses: [{
        path: 'scripts/run.py',
        source: 'standard',
        evaluationStatus: 'complete',
        riskLevel: 'medium',
        readiness: 'needs-configuration',
        analyzedChunks: 1,
        totalChunks: 2,
        observedBehaviors: [{ kind: 'network', evidence: 'Calls [URL-REDACTED].' }],
        dependencies: [{ name: 'requests', kind: 'pip', evidence: 'Imported by run.py.' }],
        externalEndpoints: [{ value: '[URL-REDACTED]', evidence: 'Used for upload.' }],
        capabilities: [{ kind: 'network', evidence: 'Sends the completed report.' }],
        runtimeAssumptions: [{ statement: 'Needs configuration', evidence: 'Reads a URL setting.' }],
        findings: [{
          id: 'SCR-NET-01',
          title: 'Endpoint requires review',
          severity: 'medium',
          evidence: 'Calls [URL-REDACTED].',
          why: 'The destination must be approved.',
          fix: 'Use an approved endpoint.',
        }],
        purposeAlignment: { matches: true, rationale: 'Supports expense upload.' },
      }],
    });

    const html = render(createElement(SkillFilesExplorer, { skill: resourceSkill }));

    expect(html).toContain('Manifest: Completed');
    expect(html).toContain('Evaluation: Complete');
    expect(html).toContain('Chunks: 1 of 2');
    expect(html).toContain('Purpose alignment');
    expect(html).toContain('Observed behavior');
    expect(html).toContain('Dependencies');
    expect(html).toContain('Runtime assumptions');
    expect(html).toContain('Raw resource content is not stored');
    expect(html).toContain('[URL-REDACTED]');
    expect(html).not.toContain('>Findings<');
    expect(html).toContain('role="region"');
    expect(html).toContain('<h3');
    expect(html).toContain('<h4');
  });

  it('explains historical reviews without file metadata', () => {
    const html = render(createElement(SkillFilesExplorer, {
      skill: skill({
        sourceFiles: undefined,
        files: undefined,
        skillDefinitionSource: undefined,
      }),
    }));

    expect(html).toContain('saved before file metadata was recorded');
  });

  it('explains why a retained definition was omitted', () => {
    const html = render(createElement(SkillFilesExplorer, {
      skill: skill({
        skillDefinitionSource: undefined,
        skillDefinitionSourceOmission: 'payload-budget',
      }),
    }));

    expect(html).toContain('omitted to keep the saved review within its storage limit');
  });

  it('does not claim analysis is missing when a duplicate path prevents a safe join', () => {
    const html = render(createElement(SkillFilesExplorer, {
      skill: skill({
        sourceFiles: [
          { path: 'scripts/run.py', sizeBytes: 120, kind: 'script' },
          { path: 'Scripts/RUN.py', sizeBytes: 120, kind: 'script' },
        ],
        resourceAnalyses: [{
          path: 'scripts/run.py',
          source: 'standard',
          evaluationStatus: 'complete',
          riskLevel: 'info',
          readiness: 'ready',
          analyzedChunks: 1,
          totalChunks: 1,
          observedBehaviors: [],
          dependencies: [],
          externalEndpoints: [],
          capabilities: [],
          runtimeAssumptions: [],
          findings: [],
          purposeAlignment: { matches: true, rationale: '' },
        }],
      }),
    }));

    expect(html).toContain('duplicate file paths');
    expect(html).not.toContain('No detailed resource analysis was recorded');
  });

  it('renders SKILL.md before other root files', () => {
    const html = render(createElement(SkillFilesExplorer, {
      skill: skill({
        sourceFiles: [
          { path: 'README.md', sizeBytes: 20, language: 'markdown' },
          {
            path: 'SKILL.md',
            sizeBytes: 80,
            language: 'markdown',
            isSkillDefinition: true,
          },
        ],
      }),
    }));

    expect(html.indexOf('SKILL.md')).toBeLessThan(html.indexOf('README.md'));
  });
});

describe('skill files integrations', () => {
  it('replaces the drilled Source tab and resource grid with Files', () => {
    const html = render(createElement(SkillDrillView, {
      skill: skill({ resourceRows: [{
        path: 'scripts/run.py',
        kind: 'script',
        language: 'python',
        sizeBytes: 120,
        analysisStatus: 'completed',
        riskLevel: 'medium',
        readiness: 'needs-configuration',
        findingCount: 1,
        reviewCoverage: 'Complete',
      }] }),
      backLabel: 'Pattern',
      onBack: vi.fn(),
    }));

    expect(html).toContain('>Files<');
    expect(html).not.toContain('>Source<');
    expect(html).not.toContain('Resources (1)');
  });

});
