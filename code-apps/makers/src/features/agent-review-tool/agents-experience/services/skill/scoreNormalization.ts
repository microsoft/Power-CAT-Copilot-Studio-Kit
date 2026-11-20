/**
 * Coerces a skill dimension score onto the rubric's 0-10 scale.
 *
 * Current reviews use 0-10, while older persisted reviews can contain 0-100.
 */
export function normalizeSkillDimensionScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  const scaled = score > 10 ? score / 10 : score;
  return Math.min(10, Math.max(0, scaled));
}
