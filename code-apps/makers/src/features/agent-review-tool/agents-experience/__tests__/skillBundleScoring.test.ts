import { describe, expect, it } from 'vitest';
import { calculateSkillBundleScores, type SkillBundleScoringInput } from '../services/skill/skillBundleScoring';
import type { SkillDimension } from '../contracts/SkillEvaluation';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseInput(overrides: Partial<SkillBundleScoringInput> = {}): SkillBundleScoringInput {
  return {
    dimensions: [
      { key: 'Clarity', score: 8, rationale: 'Clear.' },
      { key: 'Actionability', score: 8, rationale: 'Actionable.' },
      { key: 'Scope discipline', score: 8, rationale: 'Bounded.' },
      { key: 'Composability', score: 8, rationale: 'Compatible.' },
    ],
    integrity: {
      pathTraversalCount: 0,
      duplicatePathCount: 0,
      missingReferencedCount: 0,
      unreadableReferencedCount: 0,
      unreferencedTextCount: 0,
      lacksProgressiveDisclosure: false,
      emptyResourceCount: 0,
    },
    resourcesTotal: 2,
    resourcesReviewed: 2,
    findings: [],
    readinessIssues: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Quality
// ---------------------------------------------------------------------------

describe('Quality score', () => {
  it('computes average × 10 for all four dimensions', () => {
    const scores = calculateSkillBundleScores(baseInput());
    expect(scores.quality.value).toBe(80);
    expect(scores.quality.status).toBe('complete');
    expect(scores.quality.coveragePercent).toBe(100);
  });

  it('returns unavailable with score 0 when no dimensions provided', () => {
    const scores = calculateSkillBundleScores(baseInput({ dimensions: [] }));
    expect(scores.quality.value).toBe(0);
    expect(scores.quality.status).toBe('unavailable');
    expect(scores.quality.coveragePercent).toBe(0);
  });

  it('returns score 0 when all dimensions are unrecognized (missing/invalid SKILL.md)', () => {
    const scores = calculateSkillBundleScores(baseInput({
      dimensions: [
        { key: 'Unknown' as SkillDimension['key'], score: 9, rationale: 'irrelevant' },
      ],
    }));
    expect(scores.quality.value).toBe(0);
    expect(scores.quality.status).toBe('unavailable');
    expect(scores.quality.coveragePercent).toBe(0);
  });

  it('returns partial when only some dimensions present', () => {
    const scores = calculateSkillBundleScores(baseInput({
      dimensions: [
        { key: 'Clarity', score: 9, rationale: '' },
        { key: 'Composability', score: 7, rationale: '' },
      ],
    }));
    expect(scores.quality.status).toBe('partial');
    expect(scores.quality.coveragePercent).toBe(50);
    expect(scores.quality.value).toBe(80); // round((9+7)/2 * 10) = 80
  });

  it('clamps to 0-100', () => {
    const scores = calculateSkillBundleScores(baseInput({
      dimensions: [
        { key: 'Clarity', score: 10, rationale: '' },
        { key: 'Actionability', score: 10, rationale: '' },
        { key: 'Scope discipline', score: 10, rationale: '' },
        { key: 'Composability', score: 10, rationale: '' },
      ],
    }));
    expect(scores.quality.value).toBe(100);
  });

  it('normalizes legacy 0-100 dimensions before calculating quality', () => {
    const scores = calculateSkillBundleScores(baseInput({
      dimensions: [
        { key: 'Clarity', score: 68, rationale: '' },
        { key: 'Actionability', score: 30, rationale: '' },
        { key: 'Scope discipline', score: 88, rationale: '' },
        { key: 'Composability', score: 45, rationale: '' },
      ],
    }));

    expect(scores.quality.value).toBe(58);
  });
});

// ---------------------------------------------------------------------------
// Integrity
// ---------------------------------------------------------------------------

describe('Integrity score', () => {
  it('starts at 100 with no issues', () => {
    const scores = calculateSkillBundleScores(baseInput());
    expect(scores.integrity.value).toBe(100);
    expect(scores.integrity.status).toBe('complete');
  });

  it('deducts 30 per path traversal, capped at 60', () => {
    const scores = calculateSkillBundleScores(baseInput({
      integrity: {
        pathTraversalCount: 3,
        duplicatePathCount: 0,
        missingReferencedCount: 0,
        unreadableReferencedCount: 0,
        unreferencedTextCount: 0,
        lacksProgressiveDisclosure: false,
        emptyResourceCount: 0,
      },
    }));
    expect(scores.integrity.value).toBe(40); // 100 - min(90, 60) = 40
  });

  it('deducts 10 for missing progressive disclosure', () => {
    const scores = calculateSkillBundleScores(baseInput({
      integrity: {
        pathTraversalCount: 0,
        duplicatePathCount: 0,
        missingReferencedCount: 0,
        unreadableReferencedCount: 0,
        unreferencedTextCount: 0,
        lacksProgressiveDisclosure: true,
        emptyResourceCount: 0,
      },
    }));
    expect(scores.integrity.value).toBe(90);
  });

  it('applies multiple capped deductions', () => {
    const scores = calculateSkillBundleScores(baseInput({
      integrity: {
        pathTraversalCount: 1,   // -30
        duplicatePathCount: 1,    // -25
        missingReferencedCount: 1, // -20
        unreadableReferencedCount: 0,
        unreferencedTextCount: 0,
        lacksProgressiveDisclosure: false,
        emptyResourceCount: 0,
      },
    }));
    expect(scores.integrity.value).toBe(25); // 100 - 30 - 25 - 20 = 25
  });

  it('clamps to zero', () => {
    const scores = calculateSkillBundleScores(baseInput({
      integrity: {
        pathTraversalCount: 3,    // -60
        duplicatePathCount: 3,    // -50
        missingReferencedCount: 3, // -60
        unreadableReferencedCount: 3, // -45
        unreferencedTextCount: 5,  // -20
        lacksProgressiveDisclosure: true, // -10
        emptyResourceCount: 5,    // -20
      },
    }));
    expect(scores.integrity.value).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------------

describe('Safety score', () => {
  it('marks a safety score partial when one resource was not reviewed', () => {
    const scores = calculateSkillBundleScores({
      dimensions: [
        { key: 'Clarity', score: 8, rationale: 'Clear.' },
        { key: 'Actionability', score: 8, rationale: 'Actionable.' },
        { key: 'Scope discipline', score: 8, rationale: 'Bounded.' },
        { key: 'Composability', score: 8, rationale: 'Compatible.' },
      ],
      integrity: {
        pathTraversalCount: 0,
        duplicatePathCount: 0,
        missingReferencedCount: 0,
        unreadableReferencedCount: 0,
        unreferencedTextCount: 0,
        lacksProgressiveDisclosure: false,
        emptyResourceCount: 0,
      },
      resourcesTotal: 2,
      resourcesReviewed: 1,
      findings: [{ severity: 'high', resourcePath: 'scripts/run.py', evidence: 'network call' }],
      readinessIssues: [],
    });
    expect(scores.safety.status).toBe('partial');
    expect(scores.safety.coveragePercent).toBe(50);
    expect(scores.safetyGate).toBe('warning');
  });

  it('deducts 40 for critical findings and sets gate to error', () => {
    const scores = calculateSkillBundleScores(baseInput({
      findings: [{ severity: 'critical', evidence: 'prompt injection' }],
    }));
    expect(scores.safety.value).toBe(60);
    expect(scores.safetyGate).toBe('error');
  });

  it('does not deduct or gate advisory platform-overlap findings', () => {
    const scores = calculateSkillBundleScores(baseInput({
      findings: [{
        severity: 'critical',
        evidence: 'ignore previous instructions',
        safetyDisposition: 'advisory',
      }],
    }));
    expect(scores.safety.value).toBe(100);
    expect(scores.safetyGate).toBe('none');
  });

  it('deduplicates findings by severity+path+evidence', () => {
    const scores = calculateSkillBundleScores(baseInput({
      findings: [
        { severity: 'high', resourcePath: 'a.py', evidence: 'same' },
        { severity: 'high', resourcePath: 'a.py', evidence: 'same' },
      ],
    }));
    expect(scores.safety.value).toBe(75); // Only one deduction of 25
  });

  it('returns complete and gate=none when no findings and all reviewed', () => {
    const scores = calculateSkillBundleScores(baseInput({
      resourcesTotal: 3,
      resourcesReviewed: 3,
      findings: [],
    }));
    expect(scores.safety.value).toBe(100);
    expect(scores.safety.status).toBe('complete');
    expect(scores.safetyGate).toBe('none');
  });

  it('returns unavailable when resourcesTotal is 0', () => {
    const scores = calculateSkillBundleScores(baseInput({
      resourcesTotal: 0,
      resourcesReviewed: 0,
    }));
    expect(scores.safety.status).toBe('unavailable');
  });
});

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

describe('Readiness score', () => {
  it('does not assign readiness 100 when no supporting resource was assessed', () => {
    const scores = calculateSkillBundleScores(baseInput({
      resourcesTotal: 3,
      resourcesReviewed: 0,
    }));

    expect(scores.readiness).toMatchObject({
      value: null, status: 'unavailable', coveragePercent: 0,
    });
  });

  it('marks readiness coverage partial even when no runtime issue was returned', () => {
    const scores = calculateSkillBundleScores(baseInput({
      resourcesTotal: 3,
      resourcesReviewed: 1,
    }));

    expect(scores.readiness.status).toBe('partial');
    expect(scores.readiness.coveragePercent).toBe(33);
  });

  it('starts at 100 with no issues', () => {
    const scores = calculateSkillBundleScores(baseInput());
    expect(scores.readiness.value).toBe(100);
    expect(scores.readiness.status).toBe('complete');
  });

  it('deducts per issue kind with caps', () => {
    const scores = calculateSkillBundleScores(baseInput({
      readinessIssues: [
        { kind: 'unsupported-runtime', resourcePath: 'a.py' },
        { kind: 'unsupported-runtime', resourcePath: 'b.py' },
        { kind: 'unsupported-runtime', resourcePath: 'c.py' },
        { kind: 'unsupported-runtime', resourcePath: 'd.py' }, // 4th capped at 60
        { kind: 'missing-dependency', resourcePath: 'a.py' },
      ],
    }));
    // unsupported: min(4*20, 60) = 60, missing: min(1*15, 45) = 15 → 100-60-15 = 25
    expect(scores.readiness.value).toBe(25);
  });

  it('marks partial when unreviewed or partial resources exist', () => {
    const scores = calculateSkillBundleScores(baseInput({
      readinessIssues: [
        { kind: 'unreviewed-referenced-resource', resourcePath: 'x.py' },
      ],
    }));
    expect(scores.readiness.status).toBe('partial');
    expect(scores.readiness.value).toBe(92); // 100 - 8 = 92
  });
});
