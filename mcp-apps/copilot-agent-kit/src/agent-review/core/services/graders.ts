/**
 * Shared grader semantics for GitHub Copilot harness evaluation sets.
 *
 * Graders of the same kind are not interchangeable: three CompareMeaningGraders
 * at thresholds 0.6 / 0.3 / 0.5 are three different checks, and a PromptGrader
 * is defined entirely by its maker-supplied name and instructions. Collapsing
 * them to bare kinds loses the only information that distinguishes them.
 */
import type { AeGrader, AeEvaluationSet } from '../contracts/AgentsExperienceModel.js';

/**
 * Grader kinds that are inert without maker-supplied configuration.
 *
 * Only `PromptGrader` qualifies: its rubric lives entirely in `instructions`
 * and `labels`, so a bare one has nothing to judge against. `ToolCallGrader`
 * and `ContainsAnyGrader` deliberately carry no configuration — their targets
 * live on each test case as `expectedExecutionSteps` and `expectedKeywords`,
 * verified against live agent data. Treating those as unconfigured produces a
 * false positive on every correctly-authored set.
 */
export const GRADERS_REQUIRING_CONFIG = new Set(['PromptGrader']);

/** Strip the redundant `Grader` suffix for display: `CompareMeaningGrader` -> `Compare meaning`. */
function prettyKind(kind: string): string {
  const base = kind.replace(/Grader$/, '');
  const spaced = base.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/** Render a grader with the setting that distinguishes it from others of its kind. */
export function formatGrader(g: AeGrader): string {
  const detail = g.name ?? (typeof g.threshold === 'number' ? String(g.threshold) : undefined);
  return detail ? `${prettyKind(g.kind)} (${detail})` : prettyKind(g.kind);
}

/**
 * Every grader across the given sets, de-duplicated on its full configuration
 * rather than on kind alone.
 */
export function distinctGraders(sets: AeEvaluationSet[]): AeGrader[] {
  const seen = new Map<string, AeGrader>();
  for (const set of sets) {
    // Pre-detail reviews persisted only kinds; fall back so old records still render.
    const details: AeGrader[] = set.graderDetails
      ?? set.graders.map((kind) => ({ kind, configured: true }));
    for (const g of details) {
      const key = `${g.kind}|${g.name ?? ''}|${g.threshold ?? ''}`;
      if (!seen.has(key)) seen.set(key, g);
    }
  }
  return [...seen.values()];
}
