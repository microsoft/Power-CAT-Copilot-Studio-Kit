/** Skill rubric score/band helpers (ported from the mock skillsData module). */
import { normalizeSkillDimensionScore } from '../../core/index.js';
import type { SkillDimensionView, SkillView } from './viewTypes.js';

/**
 * Coerce a dimension score onto the rubric's 0-10 scale.
 *
 * The contract is 0-10, but reviews persisted before the provider normalised
 * model output hold 0-100 values (90 meaning 9.0). Those rendered as "90/10"
 * and pushed skill grades past 100% — 630% average quality was seen in
 * production. Scaling here keeps saved reviews readable without a data migration.
 */
export function normalizedDimensionScore(score: number): number {
  return normalizeSkillDimensionScore(score);
}

/**
 * Percent grade for a skill, or `null` when there is no real grade to show
 * (Task 2). A genuine evaluator result of 0 stays 0 — only the *absence* of
 * any real dimension returns `null`.
 */
export function skillScorePercent(skill: SkillView): number | null {
  if (skill.dimensions.length === 0) return null;
  const total = skill.dimensions.reduce((acc, d) => acc + normalizedDimensionScore(d.score), 0);
  return Math.round((total / skill.dimensions.length) * 10);
}

/** The weakest real dimension, or `null` when the skill has no real dimensions. */
export function weakestDimension(skill: SkillView): SkillDimensionView | null {
  if (skill.dimensions.length === 0) return null;
  return skill.dimensions.reduce(
    (min, d) => (normalizedDimensionScore(d.score) < normalizedDimensionScore(min.score) ? d : min),
    skill.dimensions[0],
  );
}

export function scoreBand(pct: number): { label: string; color: 'success' | 'warning' | 'danger' } {
  if (pct >= 80) return { label: 'Strong', color: 'success' };
  if (pct >= 60) return { label: 'Good', color: 'warning' };
  return { label: 'Needs work', color: 'danger' };
}

export function dimensionBand(score: number): 'success' | 'warning' | 'danger' {
  const s = normalizedDimensionScore(score);
  if (s >= 8) return 'success';
  if (s >= 6) return 'warning';
  return 'danger';
}

/**
 * Truthful, non-percent label for a skill that has no real grade (Task 2).
 * Callers must show this instead of a percent/band whenever
 * `skillScorePercent` returns `null` — never a synthetic "0%".
 */
export function evaluationStateLabel(skill: SkillView): { label: string; color: 'informative' | 'warning' | 'danger' | 'subtle' } {
  switch (skill.evaluationState) {
    case 'blocked':
      return { label: 'AI evaluation withheld', color: 'warning' };
    case 'failed':
      return { label: 'Evaluation failed', color: 'danger' };
    case 'cancelled':
      return { label: 'Evaluation cancelled', color: 'subtle' };
    case 'partial':
      return { label: 'Partial evaluation', color: 'warning' };
    case 'unavailable':
    default:
      return { label: skill.evaluationMessage ?? 'Not evaluated', color: 'informative' };
  }
}
