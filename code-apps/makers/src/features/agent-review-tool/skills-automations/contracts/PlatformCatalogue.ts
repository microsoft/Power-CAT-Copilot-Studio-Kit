/**
 * Platform capability catalogue for uploaded-artifact review (spec 018).
 *
 * A catalogue describes what a runtime can actually do: which tools exist,
 * which skills it already ships, and whether it can drive a browser. Rules use
 * it to answer "will this run here?" rather than only "is this well written?".
 *
 * Rules never import a catalogue module directly. They receive one from
 * `resolveCatalogue`, so the source can later become Dataverse configuration
 * data without touching a single rule.
 */
import type { TargetRuntime } from './ArtifactReview';
import type { SkillFindingSeverity } from '../../agents-experience/contracts/Findings';

export interface PlatformCatalogue {
  runtime: TargetRuntime;
  /** Upstream version constant, carried verbatim, e.g. "2026-07-28". */
  version: string;
  /** ISO date this snapshot was taken. Drives the staleness policy. */
  snapshotDate: string;
  /** Tool identifiers the runtime exposes. */
  tools: readonly string[];
  /** Skills the runtime already ships, so an upload does not reinvent one. */
  builtInSkills: readonly string[];
  /**
   * Whether the runtime exposes browser-automation tools.
   *
   * `'unknown'` where no capability surface is published — Copilot Studio, where
   * tools are per-agent configuration. Reporting a missing capability there
   * would be a guess, so the browser rule only fires on an explicit `false`.
   */
  supportsBrowserAutomation: boolean | 'unknown';
  /** Pattern the artifact `name` must satisfy when this runtime publishes one. */
  namePattern?: RegExp;
  /** Human label for the pattern, shown in findings instead of a raw regex. */
  namePatternLabel?: string;
  /** Preferred command-line tools, where the runtime documents one. */
  preferredClis?: readonly string[];
  /**
   * The skill package format the runtime publishes, where it publishes one.
   *
   * This exists because a tool list is not the only kind of evidence a runtime
   * can offer. Copilot Studio publishes no tool list and never will — tool
   * access there is per-agent configuration — but it does document exactly what
   * a skill package must contain. Checking a skill against that contract is a
   * real compatibility check, sourced and citable, not a guess.
   *
   * Left undefined where no such contract is published. Absence means "we make
   * no claim", never "this runtime has no requirements".
   */
  skillContract?: SkillPackageContract;
}

/**
 * A runtime's published skill package format.
 *
 * `docsUrl` is not decoration. Every finding derived from this contract cites
 * it, so a reader can check the rule against the source rather than trusting
 * the kit. A contract with no citable source does not belong in a catalogue.
 */
export interface SkillPackageContract {
  /** The file the package must contain, e.g. `SKILL.md`. */
  entryFile: string;
  /** Frontmatter keys the runtime requires, e.g. `name` and `description`. */
  requiredFrontmatter: readonly string[];
  /** Human label for the contract, shown in findings and on the verdict card. */
  label: string;
  /** Published source for every rule derived from this contract. */
  docsUrl: string;
}

/**
 * How much a catalogue snapshot can still be trusted.
 *
 * This exists because the kit ships to customers who may run a build for a
 * year. A capability claim taken from a snapshot that old cannot carry the same
 * weight as one taken last month, and the honest response is to say so rather
 * than to keep asserting a blocker.
 */
export interface StalenessAssessment {
  ageDays: number;
  isStale: boolean;
  severityShift: 'none' | 'downgrade';
  /** The sentence appended to any finding derived from this catalogue. */
  note?: string;
}

/**
 * Days after which a catalogue-derived finding is reduced in severity.
 *
 * The threshold lives here and nowhere else, so the policy cannot drift rule by
 * rule. Roughly two quarters: long enough that a normal release cadence never
 * trips it, short enough that a stale build stops making strong claims.
 */
export const CATALOGUE_STALE_AFTER_DAYS = 180;

const MS_PER_DAY = 86_400_000;

/**
 * Formats a snapshot date for display, as `28 July 2026`.
 *
 * Every user-facing sentence that cites a tool list goes through this, so the
 * date reads the same in a checkbox hint, a verdict card and a finding. Written
 * out in full rather than numerically, because `07/28` and `28/07` mean
 * different things to different readers and neither is worth a support call.
 *
 * Falls back to the raw string when the date will not parse, so a malformed
 * catalogue shows something honest rather than `Invalid Date`.
 */
export function formatCatalogueDate(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  return new Date(parsed).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Assess whether a catalogue snapshot is old enough to soften its findings.
 *
 * The notes returned here are read by the person who uploaded the skill, so
 * they say "our tool list" rather than "capability snapshot". The latter is our
 * word for the thing, not theirs.
 *
 * @param catalogue - The snapshot the finding was derived from.
 * @param now - Current time, passed explicitly so this stays pure and testable.
 */
export function resolveStaleness(catalogue: PlatformCatalogue, now: Date = new Date()): StalenessAssessment {
  const snapshot = Date.parse(catalogue.snapshotDate);
  if (Number.isNaN(snapshot)) {
    return {
      ageDays: 0,
      isStale: true,
      severityShift: 'downgrade',
      note: 'We cannot tell how old our list of tools for this runtime is, so this result is advice only.',
    };
  }

  const ageDays = Math.max(0, Math.floor((now.getTime() - snapshot) / MS_PER_DAY));
  if (ageDays <= CATALOGUE_STALE_AFTER_DAYS) {
    return { ageDays, isStale: false, severityShift: 'none' };
  }

  return {
    ageDays,
    isStale: true,
    severityShift: 'downgrade',
    note:
      `We last updated our list of tools for this runtime ${ageDays} days ago. ` +
      'The platform can change, so this result is advice only. ' +
      'Check the current documentation before you act on it.',
  };
}

const DOWNGRADE: Record<SkillFindingSeverity, SkillFindingSeverity> = {
  critical: 'high',
  high: 'medium',
  medium: 'low',
  low: 'info',
  info: 'info',
};

/** Apply a staleness assessment to a severity. One step down, never further. */
export function applyStaleness(
  severity: SkillFindingSeverity,
  staleness: StalenessAssessment,
): SkillFindingSeverity {
  return staleness.severityShift === 'downgrade' ? DOWNGRADE[severity] : severity;
}
