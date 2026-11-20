/**
 * Which questions an artifact kind can even be asked (spec 018).
 *
 * The review used to answer every question for every upload, and two of those
 * answers were false. A Scout automation `.json` was reported as "Runs, 100/100"
 * on Copilot Cowork and on Copilot Studio — neither of which has an import path
 * for an automation file at all. The score was 100 for the same reason it was
 * wrong: no finding names those runtimes, so `verdictFor` fell through to its
 * success branch. Absence of evidence was being printed as evidence of success.
 *
 * "Not applicable" and "Runs" are different answers, and only one of them is
 * true here. The same applies one level down, to the rubric: a bare automation
 * has no folder, no frontmatter and no second runtime, so two of the six
 * dimensions are asking about parts that do not exist.
 *
 * Everything in this file is a pure function of (kind, runtime) or (kind,
 * dimension). That matters because three callers must agree: the live review,
 * the store migration that repairs rows written before this existed, and the
 * tests. A rule that needed the upload itself could not repair history.
 */
import type {
  ArtifactKind,
  RubricDimensionId,
  TargetRuntime,
} from '../contracts/ArtifactReview';
import { RUNTIME_LABELS, TARGET_RUNTIMES } from '../contracts/ArtifactReview';

/**
 * The artifact formats each runtime can actually install.
 *
 * `skill` is universal: a SKILL.md folder is the shared format, which is the
 * whole reason a single review can serve three runtimes.
 *
 * The automation format is Scout's alone. Scout is the only one of the three
 * that ships a scheduled-automation concept; Cowork extends through skills and
 * connectors, and Copilot Studio through skill packages, topics and workflows.
 * Neither has anything that reads an automation definition file.
 */
const RUNTIME_ACCEPTS: Record<TargetRuntime, readonly ArtifactKind[]> = {
  cowork: ['skill'],
  scout: ['skill', 'automation'],
  'copilot-studio': ['skill'],
};

/** What each runtime installs, phrased to finish "X installs ...". */
const RUNTIME_INSTALLS: Record<TargetRuntime, string> = {
  cowork: 'skill folders built around a SKILL.md',
  scout: 'skill folders and automation definition files',
  'copilot-studio': 'skill packages',
};

/** How to name an artifact kind inside a sentence about running it. */
const KIND_IN_SENTENCE: Record<ArtifactKind, string> = {
  skill: 'a skill folder',
  automation: 'a Scout automation file',
};

/**
 * Whether a runtime could run this artifact at all.
 *
 * An unknown kind returns true. Detection having failed is not evidence that a
 * runtime rejects the upload, and inventing an exclusion from missing
 * information would repeat the very mistake this module exists to fix.
 */
export function runtimeAcceptsKind(runtime: TargetRuntime, kind: ArtifactKind | undefined): boolean {
  if (!kind) return true;
  return RUNTIME_ACCEPTS[runtime].includes(kind);
}

/** The runtimes that can install a kind, in the canonical order. */
export function runtimesAccepting(kind: ArtifactKind): TargetRuntime[] {
  return (Object.keys(RUNTIME_ACCEPTS) as TargetRuntime[]).filter((r) =>
    RUNTIME_ACCEPTS[r].includes(kind),
  );
}

/**
 * One sentence saying why a runtime has no verdict to give.
 *
 * It names what the runtime *does* install, because the reader's next question
 * is always "then what should I have uploaded?" and a bare "not applicable"
 * leaves them to guess.
 */
export function describeInapplicability(runtime: TargetRuntime, kind: ArtifactKind): string {
  const label = RUNTIME_LABELS[runtime];
  const accepted = runtimesAccepting(kind).map((r) => RUNTIME_LABELS[r]);
  const where =
    accepted.length > 0
      ? ` ${accepted.join(' and ')} ${accepted.length === 1 ? 'is' : 'are'} where this format runs.`
      : '';

  return (
    `${label} installs ${RUNTIME_INSTALLS[runtime]}. It has no import path for ` +
    `${KIND_IN_SENTENCE[kind]}, so there is no compatibility question to answer.${where}`
  );
}

/**
 * A short line for a runtime that cannot take an upload, for use beside a
 * disabled form control.
 *
 * `describeInapplicability` is the long form, written for the result, where the
 * reader needs the reasoning and the "then what should I have uploaded?"
 * answer. A disabled checkbox needs only the fact. Both draw the artifact name
 * from `KIND_IN_SENTENCE`, so the two forms cannot drift apart.
 */
export function describeUnsupportedUpload(runtime: TargetRuntime, kind: ArtifactKind): string {
  return `${RUNTIME_LABELS[runtime]} cannot install ${KIND_IN_SENTENCE[kind]}.`;
}

/**
 * The runtimes a chosen file could possibly run on.
 *
 * A bare `.json` is an automation definition — `artifactDetector` reads an
 * uncontained `.json` as either `automation` or nothing at all, and both
 * automation kinds are Scout's alone. So the extension is enough to settle the
 * question without reading the file. A `.zip` or `.md` is *not* settled by its
 * extension, so every runtime stays open and the result-side check decides.
 *
 * This is the earlier of the two guards. The result-side check stays the
 * backstop covers rows already stored.
 *
 * Takes a name-bearing object rather than a `File` so the rule can be tested
 * without a DOM.
 */
export function runtimesForFile(file: { name: string } | null): TargetRuntime[] {
  if (file && file.name.toLowerCase().endsWith('.json')) return runtimesAccepting('automation');
  return [...TARGET_RUNTIMES];
}

/**
 * Fold an existing runtime choice into what a newly chosen file allows.
 *
 * Ticks the file cannot support are dropped. If that empties the set — which it
 * always does from the dialog's default of Cowork alone — every runtime that
 * *can* take the file is ticked instead. Clearing without replacing would leave
 * a disabled group, an unsatisfiable "choose at least one runtime" and a dead
 * Review button.
 *
 * Running this on every file selection is what makes the order of the two
 * decisions irrelevant: picking Cowork and then dropping an automation `.json`
 * ends in the same place as doing it the other way round.
 */
export function reconcileRuntimes(
  current: TargetRuntime[],
  allowed: TargetRuntime[],
): TargetRuntime[] {
  const kept = current.filter((runtime) => allowed.includes(runtime));
  return kept.length > 0 ? kept : allowed;
}

/**
 * Rubric dimensions that ask about a part the artifact kind does not have.
 *
 * A bare automation is a single definition file: there is no folder name, no
 * frontmatter and no relative file reference for packaging quality to check.
 * Portability drops for automation for a different reason. It asks
 * "does this run on every runtime you picked?" — and an automation format runs
 * on exactly one runtime by definition. The runtime verdict cards now say so
 * outright, so scoring the same fact again as a rubric dimension would count it
 * twice and read as a defect in the author's work rather than a property of the
 * format they chose.
 */
const DIMENSIONS_NOT_APPLICABLE: Partial<Record<ArtifactKind, readonly RubricDimensionId[]>> = {
  automation: ['portability', 'packaging-quality'],
};

const DIMENSION_REASONS: Record<string, string> = {
  'automation:portability':
    'Not applicable — an automation definition runs on Microsoft Scout only, so there is no second runtime for it to be portable to.',
  'automation:packaging-quality':
    'Not applicable — an automation is a single definition file, so it has no folder name, frontmatter or file references that could disagree.',
};

/** Whether a rubric dimension is meaningful for this artifact kind. */
export function dimensionAppliesTo(
  dimension: RubricDimensionId,
  kind: ArtifactKind | undefined,
): boolean {
  if (!kind) return true;
  return !(DIMENSIONS_NOT_APPLICABLE[kind] ?? []).includes(dimension);
}

/** The assessment text shown in place of a score. Never empty for a dropped dimension. */
export function describeDimensionInapplicability(
  dimension: RubricDimensionId,
  kind: ArtifactKind,
): string {
  return (
    DIMENSION_REASONS[`${kind}:${dimension}`] ??
    `Not applicable — this dimension does not describe ${KIND_IN_SENTENCE[kind]}.`
  );
}
