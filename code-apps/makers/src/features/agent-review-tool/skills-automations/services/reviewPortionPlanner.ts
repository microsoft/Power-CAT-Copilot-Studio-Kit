/**
 * Splits one uploaded artifact into several review portions (spec 018 §6).
 *
 * An upload arrives as a single `SkillBundle`, which becomes a single corpus
 * component, which the workflow's Loop sends to one agent call. The Loop runs
 * twenty iterations at once, so a one-component job leaves nineteen slots idle
 * and every file queues behind the same call.
 *
 * Worse, the excerpt budget in `tokenBudget.ts` is per component. A large
 * archive overruns it and files are dropped before the agent ever sees them.
 * The drop is silent: the review still reports "complete".
 *
 * Splitting the archive into portions fixes both. Each portion carries the
 * whole SKILL.md and the whole manifest, but only its own slice of file
 * contents, so it stays inside the budget and the portions run concurrently.
 *
 * Nothing here changes the Copilot Studio path. A tenant agent already emits
 * one component per skill and already uses the Loop.
 */
import type { SkillBundle, SkillBundleResource } from '../../agents-experience/contracts/SkillBundle';
import {
  STANDARD_RESOURCE_CHARS,
  STANDARD_RESOURCE_TOTAL_CHARS,
} from '../../agents-experience/services/skill/tokenBudget';

/**
 * Target characters of file content per portion.
 *
 * Deliberately far below the {@link STANDARD_RESOURCE_TOTAL_CHARS} ceiling. The
 * ceiling is the point at which files start being discarded; aiming at it would
 * leave no headroom, and a portion that only just fits gains nothing in speed
 * over one that does not fit at all.
 */
export const DEFAULT_TARGET_PORTION_CHARS = 24_000;

/**
 * Portions to aim for before the per-portion ceiling takes over.
 *
 * The Loop runs twenty iterations at once, so twenty-four portions complete in
 * two waves. Beyond that the wall-clock gain flattens while the token cost
 * keeps rising.
 *
 * This is a target, never a limit. If an archive is so large that this many
 * portions cannot hold it, more portions are planned. Dropping a file to
 * respect a portion count would reintroduce exactly the silent loss this
 * planner exists to remove.
 */
export const DEFAULT_TARGET_PORTIONS = 24;

export interface ReviewPortionPlanOptions {
  /** Per-file excerpt cap. Must match the value the corpus builder will use. */
  perResourceChars?: number;
  /** Per-component excerpt ceiling. Must match the corpus builder's value. */
  totalChars?: number;
  /** Characters of file content to aim for in each portion. */
  targetPortionChars?: number;
  /** Portions to aim for. A soft target, never a cap on quality. */
  targetPortions?: number;
}

export interface ReviewPortionPlan {
  /** One bundle per portion. A single entry means the archive was not split. */
  portions: SkillBundle[];
  /** True when the archive was split. False when it already fitted. */
  split: boolean;
  /**
   * Characters of file content the archive would have asked the budget for,
   * measured the same way the excerpt builder measures it.
   */
  totalCostChars: number;
}

/**
 * Characters this resource will consume in the excerpt budget.
 *
 * Mirrors `buildStandardResourceExcerpts` exactly. A binary or withheld file
 * contributes nothing, because that builder skips it before the budget is
 * consulted. Any drift between the two makes a portion overrun its budget and
 * lose files — the very failure this planner exists to prevent.
 */
function costOf(resource: SkillBundleResource, perResourceChars: number): number {
  if (resource.isBinary || resource.textContent == null) return 0;
  return Math.min(resource.textContent.length, perResourceChars);
}

/** Stable ordering, so the same archive always produces the same portions. */
function byPath(a: SkillBundleResource, b: SkillBundleResource): number {
  if (a.normalizedPath === b.normalizedPath) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  return a.normalizedPath < b.normalizedPath ? -1 : 1;
}

/**
 * Marks a bundle as one portion of a larger archive.
 *
 * Three identity fields must differ between portions, because three separate
 * maps key on them and a collision silently discards a portion's result:
 *
 * - `skillMarkdown` joins a port payload back to its component.
 * - `skillName` joins an agent result back to its component.
 * - `skillSchemaName` keys the deterministic findings map.
 *
 * The marker is **appended** to the markdown, never prepended. Evidence is
 * grounded by line, so inserting a line at the top would shift every line
 * number in SKILL.md and break grounding for the whole portion.
 */
function markPortion(
  bundle: SkillBundle,
  resources: SkillBundleResource[],
  index: number,
  total: number,
): SkillBundle {
  const label = `portion ${index + 1} of ${total}`;
  return {
    ...bundle,
    skillComponentId: `${bundle.skillComponentId}#p${index + 1}`,
    skillComponentUniqueId: `${bundle.skillComponentUniqueId}#p${index + 1}`,
    skillSchemaName: `${bundle.skillSchemaName}#p${index + 1}`,
    skillName: `${bundle.skillName} (${label})`,
    skillMarkdown: `${bundle.skillMarkdown}\n\n<!-- review ${label} -->`,
    // Every portion carries the full manifest. The agent must be able to see
    // that a file exists even when another portion holds its content, or it
    // reports files as missing that are merely elsewhere.
    manifest: bundle.manifest,
    resources,
  };
}

/**
 * Plan how to split an uploaded artifact for review.
 *
 * Returns the bundle unchanged when its files already fit one component, so a
 * small upload costs exactly what it costs today and takes the same path.
 *
 * @param bundle - The whole uploaded artifact as one bundle.
 * @param options - Budget overrides. Defaults match the corpus builder.
 */
export function planReviewPortions(
  bundle: SkillBundle,
  options: ReviewPortionPlanOptions = {},
): ReviewPortionPlan {
  const perResourceChars = options.perResourceChars ?? STANDARD_RESOURCE_CHARS;
  const totalChars = options.totalChars ?? STANDARD_RESOURCE_TOTAL_CHARS;
  const targetPortionChars = options.targetPortionChars ?? DEFAULT_TARGET_PORTION_CHARS;
  const targetPortions = Math.max(1, options.targetPortions ?? DEFAULT_TARGET_PORTIONS);

  const ordered = [...bundle.resources].sort(byPath);
  const costs = new Map(ordered.map((r) => [r.id, costOf(r, perResourceChars)]));
  const totalCostChars = ordered.reduce((sum, r) => sum + (costs.get(r.id) ?? 0), 0);

  if (totalCostChars <= totalChars || ordered.length < 2) {
    return { portions: [bundle], split: false, totalCostChars };
  }

  // How much content each portion should hold.
  //
  // Three bounds apply, and the order they are applied in is the whole design:
  //
  // 1. Aim for `targetPortionChars`, which decides how many portions a typical
  //    archive needs.
  // 2. Raise that if the count would exceed `targetPortions`, so a moderately
  //    large archive costs fewer, fuller calls rather than many thin ones.
  // 3. Then clamp to `totalChars` — the point at which the excerpt builder
  //    starts discarding files.
  //
  // Step 3 wins, and that is what makes `targetPortions` a target rather than a
  // cap. An archive too large for that many portions simply gets more of them.
  // Capping the count instead would push each portion past the budget and drop
  // files, which is the silent loss this planner exists to remove.
  //
  // The lower bound of `perResourceChars` guarantees one whole file always fits
  // an empty portion, so no file can be too large to place.
  const wanted = Math.ceil(totalCostChars / targetPortionChars);
  const portionCount = Math.min(wanted, targetPortions);
  const effectiveTarget = Math.min(
    Math.max(Math.ceil(totalCostChars / portionCount), perResourceChars),
    totalChars,
  );

  const groups: SkillBundleResource[][] = [];
  let current: SkillBundleResource[] = [];
  let used = 0;

  for (const resource of ordered) {
    const cost = costs.get(resource.id) ?? 0;

    // A zero-cost file (binary, or content withheld by the secret scanner)
    // never reaches the excerpt budget, so it can join any portion. Keeping it
    // with its neighbours preserves the alphabetical grouping.
    if (cost > 0 && used + cost > effectiveTarget && current.length > 0) {
      groups.push(current);
      current = [];
      used = 0;
    }

    current.push(resource);
    used += cost;
  }

  if (current.length > 0) groups.push(current);

  const portions = groups.map((resources, i) =>
    markPortion(bundle, resources, i, groups.length),
  );

  return { portions, split: true, totalCostChars };
}
