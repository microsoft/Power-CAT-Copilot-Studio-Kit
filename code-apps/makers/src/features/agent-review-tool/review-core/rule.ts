/**
 * The only rule type in the product.
 *
 * A rule is one object, in one file, that knows every harness it runs on, how it
 * is decided, what it is worth, and what it says to a maker. Execution style is a
 * field rather than a repository boundary, and harness is a field rather than an
 * `if`, so the same rule can be deterministic on one harness and AI-judged on
 * another without being written down twice.
 *
 * Before this type there were 28 registries and up to four authoring sites per
 * rule — a definition, a scoring-metadata entry, a node-catalog entry and the
 * prose of the finding it produces — with nothing linking them. Those are the
 * fields below.
 *
 * Nothing here imports outside `review-core`. A rule must be readable by both
 * apps and by the scorer without dragging a host in.
 */

import type { Harness } from './harness';
import { EXTERNAL_HARNESSES } from './harness';
import type { Pillar } from './pillars';
import type { Severity } from './severity';
import { severityCredit } from './severity';

/** A stable, human-readable identifier: `EVL-05`, `local-pattern-7`, `SKL-AI-SCOPE`. */
export type RuleId = string;

/**
 * Which AI node asks a rule's question.
 *
 * This is transport, not classification — it is **derived** from the rule's
 * harnesses and subject scope by {@link nodesFor} rather than declared, so a node
 * list and a harness list can never disagree. A rule can land on more than one
 * node: the nine shared skill rules run on both skill nodes, which is why the
 * per-node counts sum to more than the number of rules.
 *
 * Mirrors `NodeKind` in ARC2's `engine/validation/ai-nodes/contracts.ts`, which
 * is owned by the agent that builds the AI workflow. A drift guard asserts the
 * two lists stay identical.
 */
export type NodeKind =
  | 'standard'
  | 'copilot-instructions'
  | 'copilot-skill'
  | 'cross-skill'
  | 'standalone-skill';

export const NODE_KINDS: readonly NodeKind[] = Object.freeze([
  'standard', 'copilot-instructions', 'copilot-skill', 'cross-skill', 'standalone-skill',
] as const);

/** What the rule is asked about: one agent, one skill, or the set of skills together. */
export type SubjectScope = 'agent' | 'skill' | 'skill-set';

export const SUBJECT_SCOPES: readonly SubjectScope[] =
  Object.freeze(['agent', 'skill', 'skill-set'] as const);

/**
 * A group of captured components a rule may need.
 *
 * Declaring these is what separates "the agent has no tools" from "we could not
 * read the agent's tools". The first is a pass or a not-applicable; the second
 * must never be either.
 */
export type Population =
  | 'instructions'
  | 'tools'
  | 'skills'
  | 'topics'
  | 'knowledge'
  | 'connectedAgents'
  | 'childAgents'
  | 'evaluation'
  | 'configuration';

export const POPULATIONS: readonly Population[] = Object.freeze([
  'instructions', 'tools', 'skills', 'topics', 'knowledge', 'connectedAgents', 'childAgents',
  'evaluation', 'configuration',
] as const);

/**
 * Populations that evidence a pillar is worth scoring at all.
 *
 * `configuration` is deliberately absent. Every agent has settings, so admitting a
 * pillar on that basis would admit it for every agent — which is how an agent with no
 * delegation would have scored a full Orchestration pillar off `LCY-01` alone.
 * A population here names components the maker had to create.
 */
export const COMPONENT_POPULATIONS: readonly Population[] = Object.freeze(
  POPULATIONS.filter(p => p !== 'configuration'),
);

/** Whether a rule applies to this subject at all, and if not, why not. */
export type Applicability =
  | { readonly applies: true }
  | { readonly applies: false; readonly because: string };

export const applies: Applicability = Object.freeze({ applies: true });

export function doesNotApply(because: string): Applicability {
  return Object.freeze({ applies: false, because });
}

/** The four things a rule can conclude. */
export type Outcome = 'pass' | 'fail' | 'not-applicable' | 'could-not-run';

export const OUTCOMES: readonly Outcome[] =
  Object.freeze(['pass', 'fail', 'not-applicable', 'could-not-run'] as const);

/**
 * What a check returns.
 *
 * A union rather than one shape with optional fields, because three of the four
 * outcomes owe the maker an explanation and the type is the cheapest place to
 * insist on it. A failure must carry `makerAction` — the concrete change to make
 * in the agent — and a `could-not-run` must say what was missing, since that is
 * an infrastructure status and never a judgement about the agent.
 */
/**
 * One thing the rule has something to say about.
 *
 * A rule asks one question but can answer it many times: "every tool has a
 * description" is one rule and four failing tools, not four rules. The verdict
 * above is what scores; this is what the maker reads, and there is one of these
 * per offending component.
 *
 * `title`, `why` and `makerAction` are per-instance because the existing
 * deterministic findings already vary them — naming the component in the
 * headline, and explaining a specific consequence rather than the rule's general
 * one. Omitting `why` falls back to the rule's own.
 */
/**
 * How a host can verify that an instance row points at something real.
 *
 * Two identities rather than one because captured components do not all carry
 * both: a stable id is preferred, a schema name is accepted, and a row with
 * neither is reported as unverifiable rather than silently trusted.
 */
export interface RuleEvidenceRef {
  /** Stable component id, preferring the unique form when the capture has one. */
  readonly id?: string;
  /** Schema name, used when no id survived the capture. */
  readonly schemaName?: string;
  /** The captured text this row quotes. */
  readonly quote?: string;
  /** Overrides the rule's first field path when this row quotes a different field. */
  readonly fieldPath?: string;
}

export interface RuleInstance {
  /** `componentIdUnique` of the component this is about. Absent for agent-level answers. */
  readonly subjectId?: string;
  /** Display name of that component, when it differs from the id. */
  readonly subject?: string;
  readonly title: string;
  /** The parsed evidence, shown verbatim. */
  readonly detail: string;
  /** Overrides {@link RuleProse.why} when this instance has a narrower reason. */
  readonly why?: string;
  /** The concrete change to make, for this component. */
  readonly makerAction: string;
  /** Overrides the rule's first reference when this instance cites a different page. */
  readonly reference?: string;
  /**
   * The identity a host needs to prove this row refers to a real component.
   *
   * Supplied verbatim from the captured component — never derived from a display
   * name or an array position, because neither is stable across a re-capture.
   * Absent means the row is agent-level and has no component to point at.
   *
   * A list when one finding is about more than one component — a skill coupled to
   * a sibling names both, and each published evidence row has to point at the
   * component it quotes. The first entry is the subject; the rest are what the
   * finding relates it to.
   */
  readonly subjectRef?: RuleEvidenceRef | readonly RuleEvidenceRef[];
  readonly evidence?: readonly string[];
}

export type RuleOutcome =
  | {
      readonly outcome: 'pass';
      readonly detail?: string;
      readonly evidence?: readonly string[];
      /**
       * Present on a pass only for records — `severity: 'info'` rules that report
       * configuration rather than judging it, and whose whole purpose is the row
       * they emit.
       */
      readonly instances?: readonly RuleInstance[];
    }
  | {
      readonly outcome: 'fail';
      readonly detail: string;
      readonly makerAction: string;
      readonly evidence?: readonly string[];
      /** One per offending component. Absent when the failure is agent-level. */
      readonly instances?: readonly RuleInstance[];
      /**
       * Credit earned despite failing, 0..1. Omitted means "the severity decides"
       * — see {@link creditFor}.
       *
       * Exists for rules whose answer is a proportion rather than a verdict. Tool
       * coverage is the only one today: covering half the tools is a failure that
       * has genuinely earned half the slice, and rounding that to zero would make
       * a mostly-tested agent score like an untested one.
       */
      readonly credit?: number;
    }
  | { readonly outcome: 'not-applicable'; readonly because: string }
  | { readonly outcome: 'could-not-run'; readonly because: string };

export function pass(detail?: string, evidence?: readonly string[]): RuleOutcome {
  return Object.freeze({ outcome: 'pass' as const, detail, evidence });
}

export function fail(detail: string, makerAction: string, evidence?: readonly string[]): RuleOutcome {
  return Object.freeze({ outcome: 'fail' as const, detail, makerAction, evidence });
}

/**
 * A failure that earned part of its weight.
 *
 * Separate from {@link fail} rather than a fourth argument to it, because partial
 * credit is the rare case and an optional numeric parameter on the common one is
 * the kind of thing that gets passed by accident.
 */
export function failPartial(
  detail: string, makerAction: string, credit: number, evidence?: readonly string[],
): RuleOutcome {
  if (!(credit >= 0 && credit <= 1)) {
    throw new Error(`Partial credit must be between 0 and 1; received ${credit}.`);
  }
  return Object.freeze({ outcome: 'fail' as const, detail, makerAction, credit, evidence });
}

export function notApplicable(because: string): RuleOutcome {
  return Object.freeze({ outcome: 'not-applicable' as const, because });
}

export function couldNotRun(because: string): RuleOutcome {
  return Object.freeze({ outcome: 'could-not-run' as const, because });
}

/**
 * A failure the maker can see component by component.
 *
 * One rule can answer its question many times — "every tool has a description" is
 * one rule and four undescribed tools. The verdict is what scores; the instances
 * are what the maker reads, and there is one per offending component.
 *
 * `detail` is the optional rule-level explanation, distinct from the per-instance
 * `detail`s; omit it unless there is something true of the failure as a whole.
 * The rule-level `makerAction` is taken from the first instance, because when a
 * rule fails for several components the action is the same shape for each.
 */
export function failWith(instances: readonly RuleInstance[], detail = ''): RuleOutcome {
  if (instances.length === 0) {
    throw new Error('failWith was given no instances; use fail() for an agent-level failure.');
  }
  return Object.freeze({
    outcome: 'fail' as const, detail, makerAction: instances[0].makerAction, instances,
  });
}

/**
 * A record: an `info` rule reporting what it observed.
 *
 * It passes — a record never fails — and the rows it emits are its output.
 */
export function record(instances: readonly RuleInstance[], detail?: string): RuleOutcome {
  return Object.freeze({ outcome: 'pass' as const, detail, instances });
}

/**
 * The wording, authored once.
 *
 * The deterministic finding, the AI node contract and the UI all read this block.
 * `{ title, question, passWhen, failWhen, notApplicableWhen, why, fix }` is
 * exactly the shape the node contract already publishes, so generating the
 * contract from here keeps the existing byte-comparison guard working unchanged.
 */
export interface RuleProse {
  /** What the reviewer is being asked. */
  readonly question: string;
  /**
   * One line stating what the rule records or asserts, independent of outcome.
   *
   * This is the rule-level `fact` the existing unified assessment publishes when
   * a rule produces no per-instance rows, so it is kept rather than derived from
   * {@link question} — the two are worded differently today and D-13 fidelity
   * says text does not move during a relocation.
   */
  readonly summary?: string;
  /** Why a maker should care. One or two sentences. */
  readonly why: string;
  /** Generic guidance, used when no instance-specific action is available. */
  readonly fix: string;
  /** Ordered steps. Array order is the order; there is no separate index. */
  readonly fixSteps?: readonly string[];
  readonly passWhen: readonly string[];
  readonly failWhen: readonly string[];
  readonly notApplicableWhen: readonly string[];
  /** Headline shown when the rule fails, when that differs from `title`. */
  readonly failTitle?: string;
}

/** What the rule needs to have been captured, and how completely. */
export interface RuleEvidence {
  /** Paths into the captured subject this rule reads. */
  readonly fieldPaths: readonly string[];
  /** Populations that must have been captured for the rule to run at all. */
  readonly populations?: readonly Population[];
  /** Populations that must be *complete* before a failure is allowed to stand. */
  readonly completeForFailure?: readonly Population[];
  /** Claims another rule owns, which this one must not also judge. */
  readonly separatelyOwnedClaims?: readonly string[];
}

/**
 * One rule.
 *
 * `C` is the context its `check` reads. It is generic because a Standard agent, a
 * Copilot agent and a skill present different captured shapes; it is not a second
 * classification axis — {@link Harness} is the only one of those (D-10).
 */
export interface Rule<C = unknown> {
  readonly id: RuleId;
  readonly title: string;

  /** Declared, never inferred. The list *is* the rule's harness tag. */
  readonly harnesses: readonly Harness[];

  /**
   * Where the rule scores. A plain pillar when every harness it claims uses the
   * same one; a map when it claims harnesses with different pillar tables — a
   * shared skill rule rolls into the host agent's Skills pillar under
   * `copilot-skill` and into the upload rubric under `standalone-skill` (D-14).
   */
  readonly pillar: Pillar | Partial<Record<Harness, Pillar>>;

  readonly subjectScope: SubjectScope;

  /** Replaces `optionalPopulation` and `inlineSkillsOnly` with one predicate. */
  readonly appliesWhen?: (ctx: C) => Applicability;

  readonly execution: 'deterministic' | 'ai';

  /** One vocabulary. `info` never fails and never scores. */
  readonly severity: Severity;

  /**
   * This rule's share of its pillar, relative to the other rules in it.
   *
   * Omitted means 1, and nearly every rule omits it: inside a pillar all rules
   * count the same, and a pillar of ten rules with one `high` failure scores 90.
   * Severity decides what a *failure* costs, not what a rule is *worth*.
   *
   * The Evaluation pillar is the one place the shares are unequal — 35 for having
   * a test set, 40 for tool coverage, 15 for multi-turn cases, 10 for expected
   * responses. Those four numbers were the hard-coded coefficients of
   * `evaluationCoverageScore`; declaring them here is what lets Evaluation be an
   * ordinary pillar instead of a formula, without changing a single score.
   */
  readonly weight?: number;

  /**
   * A failure here zeroes the whole pillar, whatever else passed.
   *
   * For preconditions, not for severity. An agent with no test set has not scored
   * badly on evaluation — it has no evaluation, and the remaining questions are
   * unanswerable rather than answered badly. Without this the agent would collect
   * the other rules' credit for questions it never faced.
   */
  readonly gate?: boolean;

  readonly prose: RuleProse;

  /** Flat, lower-kebab. Everything the scorer does *not* read. */
  readonly tags: readonly string[];

  /** Documentation citations. Was `referenceId` singular and `referenceIds` plural. */
  readonly references: readonly string[];

  readonly evidence: RuleEvidence;

  /** Required unless `execution` is `'ai'`. */
  readonly check?: (ctx: C) => RuleOutcome;

  /** Historical ids this rule absorbs, so persisted rows still resolve. */
  readonly legacyIds?: readonly RuleId[];
}

/**
 * Declares a rule.
 *
 * Exists so there is exactly one construction site to tighten, and so a rule is
 * frozen at authoring time — a registry that can be mutated at runtime is a
 * registry two callers can disagree about.
 */
export function rule<C = unknown>(definition: Rule<C>): Rule<C> {
  Object.freeze(definition.harnesses);
  Object.freeze(definition.tags);
  Object.freeze(definition.references);
  Object.freeze(definition.prose);
  Object.freeze(definition.evidence);
  if (definition.legacyIds) Object.freeze(definition.legacyIds);
  if (typeof definition.pillar === 'object') Object.freeze(definition.pillar);
  return Object.freeze(definition);
}

/**
 * The pillar this rule scores into under a given harness.
 *
 * Throws rather than returning a default. A rule asked for a coordinate it never
 * declared is a registry error, and the alternative — silently scoring it
 * somewhere plausible — is the class of bug this refactor exists to remove.
 */
export function pillarFor<C>(r: Rule<C>, harness: Harness): Pillar {
  if (!r.harnesses.includes(harness)) {
    throw new Error(`Rule ${r.id} does not apply to harness "${harness}".`);
  }
  if (typeof r.pillar === 'string') return r.pillar;
  const mapped = r.pillar[harness];
  if (!mapped) {
    throw new Error(
      `Rule ${r.id} claims harness "${harness}" but declares no pillar for it. `
      + 'A per-harness pillar map must cover every harness the rule claims.',
    );
  }
  return mapped;
}

/**
 * This rule's share of its pillar. See {@link Rule.weight}.
 */
export function weightOf<C>(r: Rule<C>): number {
  return r.weight ?? 1;
}

/**
 * How much of its weight a rule earned, or `null` when it is not scored at all.
 *
 * `null` means "excluded from both sides of the ratio" — an `info` rule states a
 * fact, and `not-applicable` / `could-not-run` were never answered. Returning a
 * number for those would be the free-credit bug this model exists to remove:
 * a pillar holding one failure and one fact would score 50 instead of 0.
 */
export function creditFor<C>(r: Rule<C>, outcome: RuleOutcome): number | null {
  if (r.severity === 'info') return null;
  switch (outcome.outcome) {
    case 'pass': return 1;
    case 'fail': return outcome.credit ?? severityCredit(r.severity);
    default: return null;
  }
}

/**
 * Which AI nodes carry this rule — derived, never declared.
 *
 * A rule on both skill harnesses runs on both skill nodes; that is why the
 * per-node totals exceed the rule count, and deriving it is what stops the
 * hand-maintained `skillNodes` constant from drifting away from the harness
 * lists it was supposed to describe.
 */
export function nodesFor<C>(r: Rule<C>): readonly NodeKind[] {
  if (r.execution === 'deterministic') return Object.freeze([]);
  if (r.subjectScope === 'skill-set') return Object.freeze(['cross-skill'] as const);

  const nodes = new Set<NodeKind>();
  for (const harness of r.harnesses) {
    switch (harness) {
      case 'standard': nodes.add('standard'); break;
      case 'copilot': nodes.add('copilot-instructions'); break;
      case 'copilot-skill': nodes.add('copilot-skill'); break;
      case 'standalone-skill': nodes.add('standalone-skill'); break;
    }
  }
  return Object.freeze([...NODE_KINDS].filter((n) => nodes.has(n)));
}

/** True when a rule claims a harness this scorer does not own. */
export function claimsExternalHarness<C>(r: Rule<C>): boolean {
  return r.harnesses.some((h) => (EXTERNAL_HARNESSES as readonly string[]).includes(h));
}
