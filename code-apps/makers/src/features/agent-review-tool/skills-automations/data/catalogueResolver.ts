/**
 * Single access point for platform capability catalogues (spec 018).
 *
 * Every rule resolves its catalogue through here. That indirection is the whole
 * reason the snapshots can later move to Dataverse configuration data without
 * editing a single rule: only this file knows where a catalogue comes from.
 */
import type { TargetRuntime } from '../contracts/ArtifactReview';
import { RUNTIME_LABELS } from '../contracts/ArtifactReview';
import type { RuntimeVerdictBasis } from '../contracts/ArtifactReview';
import type { PlatformCatalogue } from '../contracts/PlatformCatalogue';
import { coworkCatalogue } from './coworkCatalogue';
import { scoutCatalogue } from './scoutCatalogue';
import { copilotStudioCatalogue } from './copilotStudioCatalogue';

const CATALOGUES: Record<TargetRuntime, PlatformCatalogue> = {
  cowork: coworkCatalogue,
  scout: scoutCatalogue,
  'copilot-studio': copilotStudioCatalogue,
};

/** Resolve the capability catalogue for a runtime. */
export function resolveCatalogue(runtime: TargetRuntime): PlatformCatalogue {
  return CATALOGUES[runtime];
}

/** Resolve catalogues for several runtimes, in the order given. */
export function resolveCatalogues(runtimes: readonly TargetRuntime[]): PlatformCatalogue[] {
  return runtimes.map(resolveCatalogue);
}

/**
 * What kind of published evidence a runtime's verdict can rest on.
 *
 * A runtime can only be judged against evidence it publishes, and the three do
 * not publish the same kind. Cowork and Scout publish a tool list, so their
 * verdict answers "will these tools be there?". Copilot Studio publishes none —
 * tools there are per-agent configuration — but it does publish a skill package
 * contract, so its verdict answers "is this a valid package?". Both are real
 * claims, and the results panel prints a different sentence for each.
 *
 * This lives beside `resolveCatalogue` rather than inside the review service
 * because two callers need it and they must not drift:
 *
 *  - `verdictFor` stamps it on every verdict it builds.
 *  - `parseResult` back-fills it on rows stored before the field existed.
 *
 * If the two disagreed, a reloaded review would caption itself differently from
 * the same review when freshly run.
 */
export function verdictBasisFor(runtime: TargetRuntime): RuntimeVerdictBasis {
  const catalogue = resolveCatalogue(runtime);
  if (catalogue.tools.length > 0 || catalogue.supportsBrowserAutomation !== 'unknown') {
    return 'tool-catalogue';
  }
  return catalogue.skillContract ? 'package-contract' : 'none';
}


/**
 * One plain sentence saying what ticking a runtime covers.
 *
 * Shown beside the runtime tick boxes, before the reader has seen any finding.
 * It answers "what does this check?", not "says who?" — a source date before a
 * claim exists is a number nobody can act on, so the date stays on the verdict
 * cards and findings, where the question is live.
 *
 * The counts are read from the catalogue rather than written out, so the
 * sentence stays true when a catalogue is refreshed.
 */
export function describeRuntimeCoverage(runtime: TargetRuntime): string {
  const catalogue = resolveCatalogue(runtime);
  const label = RUNTIME_LABELS[runtime];

  // Copilot Studio deliberately carries no tools: availability there is per-agent
  // configuration, so any count would be a guess. Say so rather than imply cover.
  if (catalogue.tools.length === 0) {
    return `${label} publishes no tool list, so tool availability is not checked.`;
  }

  return (
    `Checked against the ${catalogue.tools.length} tools and ` +
    `${catalogue.builtInSkills.length} built-in skills ${label} provides.`
  );
}
