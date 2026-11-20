/**
 * The applicability rule, at all three levels it has to hold (spec 018).
 *
 * These tests exist because of a specific false answer, not a hypothetical: a
 * Scout automation was reported as "Runs, 100/100" on Copilot Cowork and on
 * Copilot Studio, because no finding named those runtimes and the verdict
 * fell through to its success branch. The regression to guard is therefore not
 * "the label is right" but "silence is never read as success".
 */
import { describe, expect, it } from 'vitest';
import {
  describeDimensionInapplicability,
  describeInapplicability,
  dimensionAppliesTo,
  runtimeAcceptsKind,
  runtimesAccepting,
} from '../services/runtimeApplicability';
import { assembleArtifactReview, reviewArtifact } from '../services/artifactReviewService';
import { overallScoreOf } from '../services/artifactScore';
import { evaluatePackaging } from '../services/packagingRules';
import type { ArtifactFinding, ArtifactReviewResult, TargetRuntime } from '../contracts/ArtifactReview';
import { RUNTIME_LABELS } from '../contracts/ArtifactReview';
import { binaryFile, goodSkillMarkdown, skillArtifact } from './fixtures';

const ALL_RUNTIMES: TargetRuntime[] = ['cowork', 'scout', 'copilot-studio'];
const COWORK_MAX_COMPANION_FILES = 20;

function finding(over: Partial<ArtifactFinding> = {}): ArtifactFinding {
  return {
    id: 'f1',
    // `RT` is the real prefix that maps onto `portability`; rule ids are split
    // on the first hyphen, so an invented dotted id would silently land on the
    // fallback dimension and prove nothing.
    ruleId: 'RT-TOOL-MISSING',
    severity: 'high',
    title: 'A finding',
    detail: 'Detail.',
    source: 'deterministic',
    runtimes: [],
    ...over,
  } as ArtifactFinding;
}

function assemble(
  kind: ArtifactReviewResult['artifactKind'],
  findings: ArtifactFinding[] = [],
  runtimes: TargetRuntime[] = ALL_RUNTIMES,
  // Default true so the rubric assertions exercise the full six dimensions.
  // With the AI stage absent, four dimensions are already null for an unrelated
  // reason, which would make an applicability assertion prove nothing.
  aiAvailable = true,
  declaredRuntimes: TargetRuntime[] = [],
): ArtifactReviewResult {
  return assembleArtifactReview({
    artifactKind: kind,
    artifactName: 'sample',
    artifactHash: 'hash',
    runtimes,
    deterministic: findings,
    aiFindings: [],
    aiAssessment: aiAvailable
      ? {
          status: 'complete',
          portionsAssessed: 1,
          dimensions: [
            { key: 'Clarity', score: 10, rationale: 'Clear.' },
            { key: 'Actionability', score: 10, rationale: 'Actionable.' },
            { key: 'Scope discipline', score: 10, rationale: 'Focused.' },
            { key: 'Composability', score: 10, rationale: 'Composable.' },
          ],
        }
      : undefined,
    aiAvailable,
    files: [],
    uncompressedBytes: 0,
    reviewedAt: new Date('2025-01-01T00:00:00Z').toISOString(),
    declaredRuntimes,
  });
}

describe('runtimeAcceptsKind', () => {
  it('accepts a skill on every runtime, because SKILL.md is the shared format', () => {
    for (const runtime of ALL_RUNTIMES) {
      expect(runtimeAcceptsKind(runtime, 'skill')).toBe(true);
    }
  });

  it('accepts automation formats on Scout only', () => {
    expect(runtimeAcceptsKind('scout', 'automation')).toBe(true);

    for (const runtime of ['cowork', 'copilot-studio'] as TargetRuntime[]) {
      expect(runtimeAcceptsKind(runtime, 'automation')).toBe(false);
    }
  });

  it('accepts an unknown kind everywhere, because failed detection is not evidence of exclusion', () => {
    for (const runtime of ALL_RUNTIMES) {
      expect(runtimeAcceptsKind(runtime, undefined)).toBe(true);
    }
  });
});

describe('runtimesAccepting', () => {
  it('names all three runtimes for a skill and only Scout for an automation', () => {
    expect(runtimesAccepting('skill')).toEqual(ALL_RUNTIMES);
    expect(runtimesAccepting('automation')).toEqual(['scout']);
  });
});

describe('describeInapplicability', () => {
  it('says what the runtime does install and where the format does run', () => {
    const text = describeInapplicability('cowork', 'automation');

    expect(text).toContain('Copilot Cowork');
    expect(text).toContain('no import path');
    // The reader's next question is "then what should I have uploaded?".
    expect(text).toContain('skill folders');
    expect(text).toContain('Microsoft Scout is where this format runs.');
  });

  it('never phrases the reason as a pass', () => {
    for (const runtime of ['cowork', 'copilot-studio'] as TargetRuntime[]) {
      const text = describeInapplicability(runtime, 'automation');

      // The bug this replaces printed "Runs" and "No issues found for this
      // runtime" for exactly these two cases. Neither phrasing may return.
      expect(text.toLowerCase()).not.toContain('no issues');
      expect(text).not.toContain(`${RUNTIME_LABELS[runtime]} runs`);
      expect(text.toLowerCase()).not.toContain('compatible');
    }
  });
});

describe('dimensionAppliesTo', () => {
  it('keeps all six dimensions for a skill', () => {
    for (const d of [
      'trigger-clarity',
      'task-focus',
      'instruction-quality',
      'safety-evidence',
      'portability',
      'packaging-quality',
    ] as const) {
      expect(dimensionAppliesTo(d, 'skill')).toBe(true);
    }
  });

  it('drops portability and packaging for a bare automation', () => {
    expect(dimensionAppliesTo('portability', 'automation')).toBe(false);
    expect(dimensionAppliesTo('packaging-quality', 'automation')).toBe(false);
    expect(dimensionAppliesTo('safety-evidence', 'automation')).toBe(true);
    expect(dimensionAppliesTo('trigger-clarity', 'automation')).toBe(true);
  });

  it('keeps every dimension when the kind is unknown', () => {
    expect(dimensionAppliesTo('portability', undefined)).toBe(true);
  });
});

describe('artifact-only portability scoring', () => {
  it('does not score portability without a connected runtime review', () => {
    const portability = assemble('skill').dimensions.find((dimension) => dimension.id === 'portability');

    expect(portability?.score).toBeNull();
    expect(portability?.assessment).toContain('connected');
  });
});

describe('describeDimensionInapplicability', () => {
  it('explains the reason rather than restating the label', () => {
    const text = describeDimensionInapplicability('portability', 'automation');
    expect(text).toContain('Not applicable');
    expect(text).toContain('Microsoft Scout only');
  });
});

describe('assembleArtifactReview applicability', () => {
  it('reports Not applicable, not Runs, for an automation on Cowork and Copilot Studio', () => {
    const result = assemble('automation');

    const byRuntime = Object.fromEntries(result.runtimeVerdicts.map((v) => [v.runtime, v]));

    expect(byRuntime.cowork.verdict).toBe('not-applicable');
    expect(byRuntime['copilot-studio'].verdict).toBe('not-applicable');
    expect(byRuntime.scout.verdict).toBe('runs');
  });

  it('withholds a score for an inapplicable runtime instead of awarding 100', () => {
    const result = assemble('automation');
    const cowork = result.runtimeVerdicts.find((v) => v.runtime === 'cowork');

    expect(cowork?.score).toBeNull();
    expect(cowork?.findingIds).toEqual([]);
    expect(cowork?.basis).toBe('none');
    expect(cowork?.notApplicableReason).toBeTruthy();
  });

  it('does not treat runtime selection as evidence that a skill targets those runtimes', () => {
    const result = assemble('skill');

    for (const verdict of result.runtimeVerdicts) {
      expect(verdict.verdict).toBe('not-evaluated');
      expect(verdict.score).toBeNull();
      expect(verdict.notApplicableReason).toBeUndefined();
    }
  });

  it('uses resolved authoritative target metadata as runtime-target evidence', () => {
    const result = assemble('skill', [], ALL_RUNTIMES, true, ['cowork']);
    const byRuntime = Object.fromEntries(result.runtimeVerdicts.map((verdict) => [verdict.runtime, verdict]));

    expect(byRuntime.cowork.verdict).toBe('runs');
    expect(byRuntime.scout.verdict).toBe('not-evaluated');
    expect(byRuntime['copilot-studio'].verdict).toBe('not-evaluated');
  });

  it('uses the official compatibility frontmatter field when it names a runtime', async () => {
    const markdown = goodSkillMarkdown().replace(
      'allowed-tools:',
      'compatibility: Copilot Studio\nallowed-tools:',
    );
    const result = await reviewArtifact({
      artifact: skillArtifact(markdown),
      runtimes: ALL_RUNTIMES,
    });
    const byRuntime = Object.fromEntries(result.runtimeVerdicts.map((verdict) => [verdict.runtime, verdict]));

    expect(byRuntime.cowork.verdict).toBe('not-evaluated');
    expect(byRuntime.scout.verdict).toBe('not-evaluated');
    expect(byRuntime['copilot-studio'].verdict).toBe('runs');
  });

  it('does not accept caller-provided runtime intent as compatibility evidence', async () => {
    const request = {
      artifact: skillArtifact(goodSkillMarkdown()),
      runtimes: ALL_RUNTIMES,
      declaredRuntimes: ['scout'],
    } as Parameters<typeof reviewArtifact>[0] & { declaredRuntimes: TargetRuntime[] };
    const result = await reviewArtifact(request);
    const byRuntime = Object.fromEntries(result.runtimeVerdicts.map((verdict) => [verdict.runtime, verdict]));

    expect(byRuntime.cowork.verdict).toBe('not-evaluated');
    expect(byRuntime.scout.verdict).toBe('not-evaluated');
    expect(byRuntime['copilot-studio'].verdict).toBe('not-evaluated');
  });

  it('does not leak Cowork companion limits into Scout or Copilot Studio verdicts', () => {
    const companions = Array.from(
      { length: COWORK_MAX_COMPANION_FILES + 1 },
      (_, index) => binaryFile(`references/${index}.bin`, 1),
    );
    const deterministic = evaluatePackaging({
      artifact: skillArtifact(goodSkillMarkdown(), companions),
      runtimes: ALL_RUNTIMES,
    });
    const result = assemble('skill', deterministic);
    const byRuntime = Object.fromEntries(result.runtimeVerdicts.map((verdict) => [verdict.runtime, verdict]));

    expect(byRuntime.cowork.verdict).toBe('will-not-run');
    expect(byRuntime.scout.verdict).toBe('not-evaluated');
    expect(byRuntime['copilot-studio'].verdict).toBe('not-evaluated');
    expect(byRuntime.scout.findingIds).toEqual([]);
    expect(byRuntime['copilot-studio'].findingIds).toEqual([]);
  });

  it('nulls the two inapplicable dimensions for an automation and keeps the other four', () => {
    const result = assemble('automation');
    const byId = Object.fromEntries(result.dimensions.map((d) => [d.id, d]));

    expect(byId.portability.score).toBeNull();
    expect(byId['packaging-quality'].score).toBeNull();
    expect(byId.portability.assessment).toContain('connected runtime review');
    expect(byId['packaging-quality'].assessment).toContain('Not applicable');

    for (const id of ['trigger-clarity', 'task-focus', 'instruction-quality', 'safety-evidence']) {
      expect(byId[id].score).not.toBeNull();
    }
  });

  it('re-normalises the overall score over the four remaining dimensions', () => {
    // Both dropped dimensions scored full marks with no findings, so removing
    // them must not move the number. If this ever fails, the weights are being
    // divided by 100 rather than by the weight actually assessed.
    const automation = overallScoreOf(assemble('automation').dimensions);
    const skill = overallScoreOf(assemble('skill').dimensions);

    expect(automation).toBe(skill);
  });

  it('keeps portability findings visible without inventing an artifact-only score', () => {
    const result = assemble('automation', [
      finding({ id: 'p1', ruleId: 'RT-TOOL-MISSING', runtimes: ['scout'] }),
    ]);
    const portability = result.dimensions.find((d) => d.id === 'portability');

    expect(portability?.score).toBeNull();
    expect(result.findings.map((item) => item.id)).toContain('p1');
    expect(result.runtimeVerdicts.find((verdict) => verdict.runtime === 'scout')?.verdict).toBe(
      'will-not-run',
    );
  });
});
