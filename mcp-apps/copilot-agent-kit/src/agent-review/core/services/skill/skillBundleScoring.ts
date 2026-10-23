/**
 * Qualified skill bundle scoring (Task 10).
 *
 * Pure scoring functions that compute quality, integrity, safety, and readiness
 * scores from explicit numeric inputs. No side-effects, no I/O.
 *
 * All scores clamp to 0–100 and report complete/partial/unavailable status
 * with coverage percentage and optional note.
 */
import type { SkillDimension } from '../../contracts/SkillEvaluation.js';
import type { SkillFindingSeverity, SkillSafetyDisposition } from '../../contracts/Findings.js';
import type { QualifiedSkillScore, SkillBundleScores } from '../../contracts/SkillBundle.js';
import { normalizeSkillDimensionScore } from './scoreNormalization.js';

// ---------------------------------------------------------------------------
// Scoring input contract
// ---------------------------------------------------------------------------

export interface SkillBundleScoringInput {
  dimensions: SkillDimension[];
  integrity: {
    pathTraversalCount: number;
    duplicatePathCount: number;
    missingReferencedCount: number;
    unreadableReferencedCount: number;
    unreferencedTextCount: number;
    lacksProgressiveDisclosure: boolean;
    emptyResourceCount: number;
  };
  resourcesTotal: number;
  resourcesReviewed: number;
  findings: Array<{
    severity: SkillFindingSeverity;
    resourcePath?: string;
    evidence: string;
    safetyDisposition?: SkillSafetyDisposition;
  }>;
  readinessIssues: Array<{
    kind:
      | 'unsupported-runtime'
      | 'missing-dependency'
      | 'external-service-configuration'
      | 'hardcoded-environment'
      | 'unreviewed-referenced-resource'
      | 'partial-resource';
    resourcePath?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const QUALITY_KEYS: readonly SkillDimension['key'][] = [
  'Clarity',
  'Actionability',
  'Scope discipline',
  'Composability',
];

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

// ---------------------------------------------------------------------------
// Quality (dimension average × 10)
// ---------------------------------------------------------------------------

function calculateQuality(dimensions: SkillDimension[]): QualifiedSkillScore {
  if (dimensions.length === 0) {
    // Zero dimensions represents missing/invalid SKILL.md → value 0.
    return { value: 0, status: 'unavailable', coveragePercent: 0, note: 'No quality dimensions available.' };
  }

  const valid = dimensions.filter(d => (QUALITY_KEYS as readonly string[]).includes(d.key));
  if (valid.length === 0) {
    // Dimensions were provided but none match recognized quality keys → value 0.
    return { value: 0, status: 'unavailable', coveragePercent: 0, note: 'No recognized quality dimensions.' };
  }

  const coveragePercent = Math.round((valid.length / QUALITY_KEYS.length) * 100);
  const avg = valid.reduce(
    (sum, dimension) => sum + normalizeSkillDimensionScore(dimension.score),
    0,
  ) / valid.length;
  const value = clamp(Math.round(avg * 10));
  const status: QualifiedSkillScore['status'] = valid.length === QUALITY_KEYS.length ? 'complete' : 'partial';

  return {
    value,
    status,
    coveragePercent,
    note: status === 'partial' ? `${valid.length}/${QUALITY_KEYS.length} dimensions evaluated.` : undefined,
  };
}

// ---------------------------------------------------------------------------
// Integrity (start 100, capped deductions)
// ---------------------------------------------------------------------------

function calculateIntegrity(integrity: SkillBundleScoringInput['integrity']): QualifiedSkillScore {
  let score = 100;

  score -= Math.min(integrity.pathTraversalCount * 30, 60);
  score -= Math.min(integrity.duplicatePathCount * 25, 50);
  score -= Math.min(integrity.missingReferencedCount * 20, 60);
  score -= Math.min(integrity.unreadableReferencedCount * 15, 45);
  score -= Math.min(integrity.unreferencedTextCount * 5, 20);
  if (integrity.lacksProgressiveDisclosure) score -= 10;
  score -= Math.min(integrity.emptyResourceCount * 5, 20);

  return { value: clamp(score), status: 'complete', coveragePercent: 100 };
}

// ---------------------------------------------------------------------------
// Safety (start 100, deduplicated severity deductions)
// ---------------------------------------------------------------------------

function calculateSafety(
  findings: SkillBundleScoringInput['findings'],
  resourcesTotal: number,
  resourcesReviewed: number,
): { score: QualifiedSkillScore; gate: SkillBundleScores['safetyGate'] } {
  // Deduplicate by severity + path + evidence.
  // The input contract has no `category` field; `severity` serves as the
  // available scoring category for deduplication purposes.
  const seen = new Set<string>();
  const deduped = findings.filter(f => {
    const key = `${f.safetyDisposition ?? 'blocking'}|${f.severity}|${f.resourcePath ?? ''}|${f.evidence}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const blockingFindings = deduped.filter(f => f.safetyDisposition !== 'advisory');

  let score = 100;
  for (const f of blockingFindings) {
    const deduction =
      f.severity === 'critical' ? 40
        : f.severity === 'high' ? 25
          : f.severity === 'medium' ? 10
            : 2; // low & info
    score -= deduction;
  }

  const coveragePercent = resourcesTotal > 0
    ? Math.round((resourcesReviewed / resourcesTotal) * 100)
    : 100;

  const hasCritical = blockingFindings.some(f => f.severity === 'critical');
  const hasHigh = blockingFindings.some(f => f.severity === 'high');
  const gate: SkillBundleScores['safetyGate'] = hasCritical ? 'error' : hasHigh ? 'warning' : 'none';

  const status: QualifiedSkillScore['status'] =
    resourcesTotal === 0
      ? 'unavailable'
      : coveragePercent < 100
        ? 'partial'
        : 'complete';

  return {
    score: {
      value: clamp(score),
      status,
      coveragePercent,
      note: status === 'partial' ? `${resourcesReviewed}/${resourcesTotal} resources reviewed.` : undefined,
    },
    gate,
  };
}

// ---------------------------------------------------------------------------
// Readiness (start 100, capped deductions)
// ---------------------------------------------------------------------------

function calculateReadiness(issues: SkillBundleScoringInput['readinessIssues']): QualifiedSkillScore {
  let score = 100;

  const count = (kind: string) => issues.filter(i => i.kind === kind).length;

  score -= Math.min(count('unsupported-runtime') * 20, 60);
  score -= Math.min(count('missing-dependency') * 15, 45);
  score -= Math.min(count('external-service-configuration') * 15, 45);
  score -= Math.min(count('hardcoded-environment') * 10, 30);
  score -= Math.min(count('unreviewed-referenced-resource') * 8, 32);
  score -= Math.min(count('partial-resource') * 5, 25);

  const hasPartial = issues.some(
    i => i.kind === 'unreviewed-referenced-resource' || i.kind === 'partial-resource',
  );

  return {
    value: clamp(score),
    status: hasPartial ? 'partial' : 'complete',
    coveragePercent: 100,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculate all four qualified scores for a skill bundle review.
 *
 * @param input - Pre-computed counts and findings from the review pipeline.
 * @returns Quality, integrity, safety, readiness scores and safety gate.
 */
export function calculateSkillBundleScores(input: SkillBundleScoringInput): SkillBundleScores {
  const quality = calculateQuality(input.dimensions);
  const integrity = calculateIntegrity(input.integrity);
  const { score: safety, gate: safetyGate } = calculateSafety(
    input.findings,
    input.resourcesTotal,
    input.resourcesReviewed,
  );
  const readiness = calculateReadiness(input.readinessIssues);

  return { quality, integrity, safety, readiness, safetyGate };
}
