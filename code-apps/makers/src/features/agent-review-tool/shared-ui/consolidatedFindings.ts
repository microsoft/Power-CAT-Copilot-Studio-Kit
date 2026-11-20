/**
 * One list instead of two — the model behind the consolidated review tab.
 *
 * A review used to answer "how did this agent do?" in two places that could not both be right. The
 * Findings tab showed only rules that spoke, so a clean agent looked like an unreviewed one. The
 * Checks tab showed every rule including the silent ones, so its denominator was larger and its
 * ratio different. Both numbers were on screen at once and they disagreed.
 *
 * They were never two things. A rule runs once and resolves to one status; its findings are the
 * reasons behind that status, and a pass is simply a rule with nothing to say. So this module takes
 * the one evaluation and lays it out once: every rule as a row, its findings as the reasoning
 * inside the row, and the rules that could not be judged pulled out into their own section where
 * they cannot distort the ratio.
 *
 * Kept free of React and of any import from `agents-experience`, so both apps can pass their own
 * payloads straight in and the node test environment can exercise it.
 */

import type { ResultTone } from './ExpandableRow';
import { RULE_DISPLAY_LABELS } from './ruleDisplayLabels';

/**
 * The shape this module needs from a rule outcome.
 *
 * Declared structurally rather than imported so `shared-ui` keeps no dependency on either app's
 * contracts. ART's `RuleEvaluationResult` already satisfies it.
 */
export interface RuleOutcomeInput {
  key: string;
  ruleId: string;
  family: string;
  status: 'passed' | 'info' | 'warning' | 'error' | 'not-applicable' | 'failed';
  subject?: string;
  subjectId?: string;
  kind?: 'check' | 'record';
  /**
   * The rule's own name, when the harness that produced it knows one.
   *
   * ART's copilot rules carry no title — a pass returns `null`, so the name lives in a display-label
   * table keyed by rule id. The standard harness is the other way round: each pattern ships its
   * `PatternName`, and there is no fixed id list to label. Accepting a title here lets that harness
   * name its own rows instead of forcing a second label table to be written and kept in step.
   */
  title?: string;
  /**
   * Why this outcome is what it is, in the harness's own words.
   *
   * Only read for a row that cannot be scored, where the generic "this rule had nothing to assess"
   * is true but uninformative. The standard harness distinguishes "No completed assessment was
   * returned" from "Classic trigger-phrase routing is not used in generative orchestration"; both
   * are not-assessed, and only the first is a reason to re-run the review.
   */
  note?: string;
}

/** The shape this module needs from a finding. ART's `GroundedFinding` satisfies it. */
export interface FindingInput {
  id: string;
  family: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  /**
   * Optional because a finding is not obliged to carry every part of its argument — an evaluator
   * model may return a judgement with no verbatim fact to quote. Requiring them here would reject
   * real payloads from both apps at the type level.
   */
  fact?: string;
  why?: string;
  fix?: string;
  /**
   * How the maker confirms the fix worked.
   *
   * Separate from {@link fix} because they answer different questions — `fix` is the change to
   * make, this is the test that proves it landed. A reader given only the change has no way to
   * tell whether they have finished.
   */
  acceptanceCheck?: string;
  /** Ordered remediation steps, where the rule or the model supplied them. Array order is the order. */
  fixSteps?: readonly string[];
  /** The model's own confidence in this finding. Absent on every deterministic finding. */
  confidence?: 'high' | 'medium' | 'low';
  /** Replacement text the maker can paste, when one applies. */
  suggestedText?: string;
  /** Where in the captured subject the fact was read, e.g. `bot.configuration`. */
  fieldPath?: string;
  ai: boolean;
  referenceId?: string;
  componentIdUnique?: string;
}

/**
 * How far the non-deterministic stage got.
 *
 * Structurally matches ART's `ReviewStageStatus`. Absent on older reviews, which is reported as
 * "not recorded" rather than assumed to be success — those are different claims.
 */
export interface StageStatusInput {
  state: 'complete' | 'partial' | 'unavailable' | 'not-applicable' | 'failed' | 'cancelled';
  reason?: string;
}

export type FindingBucket = 'fail' | 'needs-attention' | 'pass' | 'not-assessed' | 'agent-info';

/** A component a row applies to, rendered as a chip that opens its detail. */
export interface AffectedComponent {
  id?: string;
  name: string;
  /**
   * The rule instance this component's result came from.
   *
   * Carried so the row can offer "ignore this rule for this skill" without the caller having to
   * reconstruct the key. A rule that fired on four skills is one row and four instances, and a
   * reviewer who has decided it is fine for one of them has said nothing about the other three.
   */
  instanceKey?: string;
}

export interface ConsolidatedRow {
  key: string;
  ruleId: string;
  title: string;
  /** Chip after the title — the rule family, e.g. "Skill", "Evaluation". */
  family: string;
  tone: ResultTone;
  bucket: FindingBucket;
  /** Whether the verdict came from a deterministic scan or the evaluator model. */
  detection?: 'static' | 'ai';
  /** External standard the rule cites, e.g. "OWASP". */
  reference?: string;
  /** Verbatim evidence, quoted rather than paraphrased. */
  fact?: string;
  /** What the evidence means for the agent. */
  why?: string;
  fix?: string;
  /** How the maker confirms the fix worked. */
  acceptanceCheck?: string;
  /** Ordered remediation steps, where the rule or the model supplied them. */
  fixSteps?: readonly string[];
  /** The model's own confidence. Absent on every deterministic row. */
  confidence?: 'high' | 'medium' | 'low';
  /** Replacement text the maker can paste, when one applies. */
  suggestedText?: string;
  /** Components this row applies to. Populated when a rule runs once per skill. */
  affected: AffectedComponent[];
  /**
   * Every finding behind this row.
   *
   * A row shows one verdict but may have several reasons — a deterministic pass merged with four
   * evaluator errors is one row and five explanations. Keeping them all lets the expanded body show
   * why the verdict is what it is instead of only the first reason found.
   */
  evidence?: readonly FindingInput[];
  /** Why a not-assessed row could not be judged. */
  note?: string;
  /** True when every instance behind this row was set aside by the reviewer. */
  dismissed?: boolean;
  /**
   * Every rule instance behind this row.
   *
   * What "Ignore this rule" acts on. A row covering four skills holds four keys, so the surface can
   * set aside all of them or only the ones the reviewer ticked.
   */
  instanceKeys: string[];
}

/**
 * Whether a reviewer may overrule this row's verdict.
 *
 * Only a verdict against the agent can be overruled. Offering a manual pass on a row that already
 * passed says nothing, and offering it on a rule that never ran would invent a result the review
 * never reached. A row already set aside stays overridable, because taking the decision back is the
 * same affordance.
 *
 * A row with no rule instance behind it — the AI-stage banner — can never be overridden: there is
 * no key to record the decision against. A finding-only row keys the decision against its own row
 * key, which returns no score credit because there was never a rule outcome to credit, but still
 * lets a reviewer overrule a verdict that would otherwise be unanswerable.
 *
 * Exported because two surfaces ask this question, and they answered it differently until they
 * shared one implementation. The per-component menu tested the tone; the row-level control tested
 * only whether keys existed, so it offered a manual pass on passing and not-assessed rows.
 */
export function isOverridable(row: ConsolidatedRow): boolean {
  if (!row.instanceKeys.length) return false;
  if (row.dismissed === true) return true;
  const tone = row.tone ?? 'info';
  return tone === 'error' || tone === 'warning';
}

/**
 * Static facts about a rule, supplied by the host from its rule registry.
 *
 * A callback rather than an import: this module is shared by both apps and must stay free of React
 * and of either app's contracts, and the registry is neither. The host passes a lookup; a host that
 * has no registry passes nothing and the drawer simply shows less.
 */
export interface RuleMeta {
  /** What the rule asks, independent of this agent's outcome. */
  description?: string;
  /**
   * Why the rule is worth applying, independent of this agent's outcome.
   *
   * A failing row explains itself through its finding. A passing row has no finding, so without
   * this the reader learns that something passed but never what it was being held to.
   */
  why?: string;
  /** Flat, lower-kebab tags from the registry. */
  tags?: readonly string[];
  /** Which harnesses declare this rule. */
  harnesses?: readonly string[];
  /** Every documentation citation the rule carries, not only the one the finding quoted. */
  references?: readonly string[];
  /** Generic ordered steps declared on the rule, used when the finding supplied none. */
  fixSteps?: readonly string[];
  /** How much the rule matters when it is not satisfied. */
  severity?: string;
  /** Where the rule scores. */
  pillar?: string;
}

/** Resolves a rule id to its registry facts. */
export type RuleMetaLookup = (ruleId: string) => RuleMeta | undefined;

export interface ConsolidatedTotals {
  /** Literal passes only. "Needs attention" earns full score credit but is not a pass, and neither is an override. */
  passed: number;
  /** Rows that carry a verdict — excludes not-assessed and agent-info. */
  evaluated: number;
  fail: number;
  needsAttention: number;
  notAssessed: number;
  /** Rows the reviewer set aside. Counted separately so the summary can say so out loud. */
  ignored: number;
}

export interface ConsolidatedView {
  fail: ConsolidatedRow[];
  needsAttention: ConsolidatedRow[];
  pass: ConsolidatedRow[];
  notAssessed: ConsolidatedRow[];
  agentInfo: ConsolidatedRow[];
  totals: ConsolidatedTotals;
  /** False when the review predates per-rule outcomes, so the list must not claim "nothing failed". */
  recorded: boolean;
}

const RECORD_RULE_IDS: ReadonlySet<string> = new Set([
  'LCY-01', 'LCY-02', 'CON-04', 'KNW-01', 'MDL-01', 'EVL-03', 'TOL-01',
  // Reclassified from scored `info`: these state configuration, they do not judge it.
  'EVL-06', 'KNW-04', 'INS-02',
]);

const isRecord = (r: RuleOutcomeInput): boolean =>
  r.kind === 'record' || (r.kind === undefined && RECORD_RULE_IDS.has(r.ruleId));

/** Worst first, so the row that decides a group's status is the one that wins. */
const STATUS_RANK: Record<RuleOutcomeInput['status'], number> = {
  error: 0,
  failed: 1,
  warning: 2,
  info: 3,
  passed: 4,
  'not-applicable': 5,
};

/**
 * `failed` is the stored word for a rule the review reached but could not judge — not for a review
 * that broke. The reader is told exactly that: the rule was *not assessed*. "Could not run" is kept
 * for `aiStageRow`, the one row that does stand for an assessment that could not be performed.
 */
const TONE_FOR_STATUS: Record<RuleOutcomeInput['status'], ResultTone> = {
  passed: 'pass',
  info: 'info',
  warning: 'warning',
  error: 'error',
  'not-applicable': 'not-applicable',
  failed: 'not-assessed',
};

/**
 * Which category a status lands in.
 *
 * `info` goes to Agent info, not Pass. An informational outcome states a fact about the agent; it
 * is not something the reader can stop worrying about, which is what Pass means, and it earns no
 * credit either way. Filing it under Pass made a fact look like an achievement and, worse, made
 * rules that report a genuine gap render green.
 */
const BUCKET_FOR_STATUS: Record<RuleOutcomeInput['status'], FindingBucket> = {
  passed: 'pass',
  info: 'agent-info',
  warning: 'needs-attention',
  error: 'fail',
  'not-applicable': 'not-assessed',
  failed: 'not-assessed',
};

const BUCKET_FOR_SEVERITY: Record<FindingInput['severity'], FindingBucket> = {
  error: 'fail',
  warning: 'needs-attention',
  info: 'agent-info',
};

const TONE_FOR_SEVERITY: Record<FindingInput['severity'], ResultTone> = {
  error: 'error',
  warning: 'warning',
  info: 'info',
};

/**
 * Why the non-deterministic stage produced nothing, in the reader's words.
 *
 * Reported as one row rather than one per AI rule. The rules the evaluator applies are prompt text
 * that changes between releases; synthesising a row per rule would bake today's prompt into the UI
 * and leave dead rows behind the next time it is edited. What a reader needs to know is simply that
 * this part of the review did not happen, and why.
 */
const STAGE_REASON: Record<string, string> = {
  unprovisioned: 'the AI model is not provisioned in this environment',
  'empty-instructions': 'the agent has no instructions to assess',
  'incomplete-response': 'the model returned an incomplete response',
  'invocation-failed': 'the model call failed',
  'review-cancelled': 'the review was cancelled',
};

const STAGE_FALLBACK: Record<StageStatusInput['state'], string> = {
  complete: '',
  partial: 'it returned only part of its answer',
  unavailable: 'the AI model was unavailable',
  'not-applicable': 'it did not apply to this agent',
  failed: 'it did not complete',
  cancelled: 'the review was cancelled',
};

/**
 * The single row standing in for the whole non-deterministic stage when it did not run.
 *
 * `not-applicable` is a different claim from `could-not-run`: one says the agent gave the stage
 * nothing to look at, the other says the assessment itself broke. Collapsing them would let a
 * tooling failure read as a clean agent.
 */
export function aiStageRow(status: StageStatusInput | undefined): ConsolidatedRow | null {
  if (!status || status.state === 'complete') return null;

  const applicable = status.state === 'not-applicable';
  const why = (status.reason && STAGE_REASON[status.reason]) || STAGE_FALLBACK[status.state];

  return {
    key: 'ai-stage',
    ruleId: 'AI',
    title: 'Non-deterministic checks (role, tone, boundaries, ambiguity, escalation)',
    family: 'Instructions',
    // No rule instance stands behind this row, so there is nothing to set aside — and nothing to
    // give credit back for, since a stage that did not run scores nothing either way.
    instanceKeys: [],
    tone: applicable ? 'not-applicable' : 'could-not-run',
    bucket: 'not-assessed',
    detection: 'ai',
    affected: [],
    note: why ? `These were not assessed because ${why}.` : 'These were not assessed.',
  };
}

/**
 * The row's heading.
 *
 * Precedence is not a preference for one source over the other — it follows from what each source
 * can honestly claim. A finding's title is the most informative thing available (`Skill References
 * a Capability the Agent Does Not Have` says far more than `Referenced capability availability`),
 * so it wins whenever it describes the whole row. It stops describing the whole row as soon as the
 * row covers several components, because the title quotes one of them; there the general label is
 * the only true statement. And a passing rule has no finding at all — `check()` returns `null` on a
 * pass — so the label is all there is.
 */
function rowTitle(
  ruleId: string,
  family: string,
  affected: readonly AffectedComponent[],
  lead: FindingInput | undefined,
  ruleTitles: Readonly<Record<string, string>>,
  declared: string | undefined,
): string {
  if (lead && affected.length < 2) return lead.title;
  const label = ruleTitles[ruleId] ?? declared;
  if (label) return label;
  if (lead) return generalizeTitle(lead.title, affected);
  return family ? `${family} check` : ruleId;
}

/**
 * A title that is true for every component in a grouped row.
 *
 * Rule titles quote the component they are about — `Skill "display-audit" has a very short
 * description`. That is exactly right for one skill and wrong for the four the row actually covers,
 * because it names one of them and silently misdescribes the other three. Dropping the quoted name
 * leaves a claim that holds for all of them, and the affected chips say which.
 */
function generalizeTitle(title: string, affected: readonly AffectedComponent[]): string {
  if (affected.length < 2) return title;
  let out = title;
  for (const a of affected) {
    out = out.replace(`"${a.name}"`, '').replace(`'${a.name}'`, '');
  }
  return out.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Group key: a rule that reached the same verdict for several components is one row.
 *
 * A set-aside instance keys differently from one still counting, so ignoring a rule on one of four
 * skills splits the row in two — three still needing attention, one marked as an override. That is
 * the honest rendering: the reviewer made a decision about one skill, not about the rule.
 */
const groupKey = (r: RuleOutcomeInput, ignored: ReadonlySet<string>): string =>
  `${r.ruleId}::${ignored.has(r.key) ? 'ignored' : r.status}`;

/**
 * Build the consolidated view.
 *
 * Rows are grouped by rule *and* status. A rule that reached the same verdict across four skills is
 * one row naming all four — four identical rows say nothing extra and bury the rest of the list.
 * The same rule reaching different verdicts stays split, because those are genuinely different
 * results that happen to share a name.
 *
 * @param ruleResults - One outcome per evaluated rule instance. `undefined` for reviews saved
 *   before outcomes were persisted, which yields `recorded: false` and an empty list.
 * @param findings - The reasons behind the outcomes, attached to their rule's row.
 * @param aiStatus - How far the non-deterministic stage got, if recorded.
 * @param ruleTitles - Rule id to its general name. Defaults to the shared display labels, which is
 *   what both tools should use; pass a map only to override or extend them. Needed because a
 *   passing rule produces no finding and therefore no title of its own.
 * @param dismissed - Rule instance keys the reviewer set aside. Those rows render as an override
 *   rather than disappearing: a dismissal is a recorded judgement, not a delete.
 */
export function buildConsolidatedView(
  ruleResults: readonly RuleOutcomeInput[] | undefined,
  findings: readonly FindingInput[] = [],
  aiStatus?: StageStatusInput,
  ruleTitles: Readonly<Record<string, string>> = RULE_DISPLAY_LABELS,
  dismissed: ReadonlySet<string> | readonly string[] = [],
): ConsolidatedView {
  const ignored: ReadonlySet<string> = dismissed instanceof Set ? dismissed : new Set(dismissed);
  const empty: ConsolidatedView = {
    fail: [], needsAttention: [], pass: [], notAssessed: [], agentInfo: [],
    totals: { passed: 0, evaluated: 0, fail: 0, needsAttention: 0, notAssessed: 0, ignored: 0 },
    recorded: false,
  };
  if (!ruleResults) return empty;

  // Findings are attached by rule id. A per-skill rule stamps `componentIdUnique`, which is matched
  // against the outcome's `subjectId` so a four-skill rule hands each row its own finding instead
  // of giving all four the first one.
  const findingsByRule = new Map<string, FindingInput[]>();
  for (const f of findings) {
    const list = findingsByRule.get(f.id);
    if (list) list.push(f);
    else findingsByRule.set(f.id, [f]);
  }

  const groups = new Map<string, RuleOutcomeInput[]>();
  for (const r of ruleResults) {
    const k = groupKey(r, ignored);
    const list = groups.get(k);
    if (list) list.push(r);
    else groups.set(k, [r]);
  }

  const rows: ConsolidatedRow[] = [];

  for (const [key, instances] of groups) {
    const head = instances[0];
    const record = isRecord(head);
    const subjectIds = new Set(instances.map(i => i.subjectId).filter((v): v is string => !!v));

    const own = (findingsByRule.get(head.ruleId) ?? []).filter(f =>
      // An agent-level rule has no subject, so every finding for that id belongs to it.
      subjectIds.size === 0 || !f.componentIdUnique || subjectIds.has(f.componentIdUnique));

    // Worst first, so the row is described by the reason that decided it. Taking whichever finding
    // happened to be stored first would let an info note headline a row that actually failed.
    const ranked = [...own].sort((a, b) => STATUS_RANK[a.severity] - STATUS_RANK[b.severity]);
    const lead = ranked[0];

    // Worst wins between the deterministic verdict and what the evaluator model found.
    //
    // The deterministic scanners are deliberately conservative — SKL-09 only fires when a skill
    // names both a real and a missing capability, so a skill naming nothing but missing ones passes
    // the scanner in silence and the evaluator is the only thing that catches it. Reporting the
    // scanner's Pass while holding five AI errors inside the row would put the reassuring word on
    // screen and hide the reason it is wrong. Display only: scoring still ignores AI findings.
    const worstSeverity = ranked[0]?.severity;

    const merged: RuleOutcomeInput['status'] =
      record || head.status === 'not-applicable' || head.status === 'failed'
        ? head.status
        : worstSeverity && STATUS_RANK[worstSeverity] < STATUS_RANK[head.status]
          ? worstSeverity
          : head.status;

    // A record that came back clean has nothing to tell anyone. Agent info exists to surface facts
    // worth knowing, not to list every informational rule that ran and found nothing, so a passing
    // record with no evidence behind it is dropped rather than shown as a reassuring empty row.
    if (record && merged === 'passed' && !lead) continue;

    const affected = instances
      .filter(i => i.subject)
      .map(i => ({ id: i.subjectId, name: i.subject as string, instanceKey: i.key }));

    // Grouping has already split set-aside instances into their own row, so this holds for every
    // instance in the group rather than merely one of them.
    const overridden = instances.every(i => ignored.has(i.key));

    rows.push({
      key,
      ruleId: head.ruleId,
      title: rowTitle(head.ruleId, head.family, affected, lead, ruleTitles, head.title),
      family: head.family,
      tone: overridden ? 'ignored' : record ? 'info' : TONE_FOR_STATUS[merged],
      bucket: overridden ? 'pass' : record ? 'agent-info' : BUCKET_FOR_STATUS[merged],
      dismissed: overridden,
      instanceKeys: instances.map(i => i.key),
      detection: lead ? (lead.ai ? 'ai' : 'static') : 'static',
      reference: lead?.referenceId,
      fact: lead?.fact,
      why: lead?.why,
      fix: record ? undefined : lead?.fix,
      acceptanceCheck: record ? undefined : lead?.acceptanceCheck,
      fixSteps: record ? undefined : lead?.fixSteps,
      confidence: lead?.confidence,
      suggestedText: record ? undefined : lead?.suggestedText,
      /** Every reason behind this row, so a merged verdict can show what drove it. */
      evidence: ranked,
      affected,
      note: head.status === 'not-applicable'
        ? head.note ?? 'This rule had nothing to assess on this agent.'
        : head.status === 'failed'
          ? head.note ?? 'This rule could not be evaluated.'
          : undefined,
    });
  }

  // Findings from rules that produced no outcome row — the evaluator model's own checks, which
  // exist only as findings. Without this they would vanish from a list that claims to be complete.
  //
  // Grouped by rule and severity like the outcome rows, because the model can return the same
  // judgement several times over. Three separate rows saying the instructions never state their
  // boundaries is the same sentence three times, and they would collide on their row key besides.
  const ruleIdsWithRows = new Set(rows.map(r => r.ruleId));
  const orphans = new Map<string, FindingInput[]>();
  for (const f of findings) {
    if (ruleIdsWithRows.has(f.id)) continue;
    const k = `${f.id}::${f.severity}`;
    const list = orphans.get(k);
    if (list) list.push(f);
    else orphans.set(k, [f]);
  }

  for (const [key, group] of orphans) {
    const lead = group[0];
    const affected = group
      .filter(f => f.componentIdUnique)
      .map(f => ({ id: f.componentIdUnique, name: f.componentIdUnique as string }));
    // The row key is also the dismissal key, so it must not move when the row is set aside — unlike
    // an outcome row, whose group key splits on dismissal because several instances share it.
    const rowKey = `finding::${key}`;
    const overridden = ignored.has(rowKey);
    rows.push({
      key: rowKey,
      ruleId: lead.id,
      title: rowTitle(lead.id, lead.family, affected, lead, ruleTitles, undefined),
      family: lead.family,
      tone: overridden ? 'ignored' : TONE_FOR_SEVERITY[lead.severity],
      bucket: overridden ? 'pass' : BUCKET_FOR_SEVERITY[lead.severity],
      dismissed: overridden,
      detection: lead.ai ? 'ai' : 'static',
      reference: lead.referenceId,
      fact: lead.fact,
      why: lead.why,
      fix: lead.fix,
      acceptanceCheck: lead.acceptanceCheck,
      fixSteps: lead.fixSteps,
      confidence: lead.confidence,
      suggestedText: lead.suggestedText,
      evidence: group,
      affected,
      // No rule outcome stands behind these, so setting one aside returns no score credit. It is
      // recorded against the row's own key so the verdict can still be overruled on screen.
      instanceKeys: [rowKey],
    });
  }

  const stage = aiStageRow(aiStatus);
  if (stage) rows.push(stage);

  const inBucket = (b: FindingBucket) => rows.filter(r => r.bucket === b);
  const fail = inBucket('fail');
  const needsAttention = inBucket('needs-attention');
  const pass = inBucket('pass');
  const notAssessed = inBucket('not-assessed');
  const agentInfo = inBucket('agent-info');

  return {
    fail,
    needsAttention,
    pass,
    notAssessed,
    agentInfo,
    totals: {
      passed: pass.filter(r => !r.dismissed).length,
      evaluated: fail.length + needsAttention.length + pass.length,
      fail: fail.length,
      needsAttention: needsAttention.length,
      notAssessed: notAssessed.length,
      ignored: pass.filter(r => r.dismissed).length,
    },
    recorded: true,
  };
}

/** Every field a reader might type into the search box, for one row. */
export function searchFields(row: ConsolidatedRow): (string | undefined)[] {
  return [row.title, row.ruleId, row.family, row.fact, row.why, row.fix,
    ...row.affected.map(a => a.name)];
}

/** Distinct families present, for the "All components" filter. Sorted so the list is stable. */
export function familyOptions(view: ConsolidatedView): string[] {
  const all = [...view.fail, ...view.needsAttention, ...view.pass, ...view.notAssessed, ...view.agentInfo];
  return [...new Set(all.map(r => r.family))].sort();
}

/** What the toolbar can narrow the list to. `bucket` names the reader's own vocabulary. */
export interface FindingsFilter {
  query?: string;
  family?: string;
  bucket?: FindingBucket;
  /** Narrows to one reader-facing status. Finer than `bucket`: it separates the two not-assessed kinds. */
  status?: FindingStatus;
  /** Worst first by default, which is the order a reader wants to work through. */
  order?: 'severity' | 'family';
}

/**
 * The status a reader filters by.
 *
 * Finer than `FindingBucket` in one place and coarser in another. `not-assessed` holds both "there
 * was nothing here to check" and "the check itself did not run", which are different answers to
 * different questions and were being offered as one. Against that, the rubric's `needs-attention`
 * bucket is not offered at all: a rule either held or it did not, and how much it matters is the
 * severity tag on the row. Filtering by a third verdict would ask the reader to sort failures into
 * two piles the report no longer shows.
 */
export type FindingStatus =
  | 'fail'
  | 'pass'
  | 'not-assessed'
  | 'not-applicable'
  | 'agent-info';

/** Reader-facing wording for each status, used by the filter and by nothing else. */
export const STATUS_LABEL: Record<FindingStatus, string> = {
  fail: 'Fail',
  pass: 'Pass',
  'not-assessed': 'Not assessed',
  'not-applicable': 'Not applicable',
  'agent-info': 'Agent info',
};

/** Fails first, agent info last — the order a reviewer works through a report. */
const STATUS_ORDER: Record<FindingStatus, number> = {
  fail: 0,
  pass: 1,
  'not-assessed': 2,
  'not-applicable': 3,
  'agent-info': 4,
};

export function rowStatus(row: ConsolidatedRow): FindingStatus {
  // `needs-attention` survives as a scoring bucket — it still earns its own credit — but it has no
  // status of its own on screen. Reported as a failure, ranked with the failures, and told apart
  // from them by carrying Medium severity rather than High.
  if (row.bucket === 'needs-attention') return 'fail';
  if (row.bucket !== 'not-assessed') return row.bucket;
  return row.tone === 'not-applicable' ? 'not-applicable' : 'not-assessed';
}

/**
 * Every row, graded or not, as one sequence.
 *
 * The separate "Not assessed" and "Info about the agent" sections asked a reader to look in three
 * places for a rule they could name but not classify. One list with the status on each row — and in
 * the filter — answers "what happened to X" in a single scan, and the ordering keeps the ungraded
 * rows below the graded ones so they still cannot be mistaken for part of the ratio.
 */
export function allRows(view: ConsolidatedView): ConsolidatedRow[] {
  return [
    ...view.fail,
    ...view.needsAttention,
    ...view.pass,
    ...view.notAssessed,
    ...view.agentInfo,
  ];
}

/** Distinct statuses present, so the filter never offers one that matches nothing. */
export function statusOptions(rows: readonly ConsolidatedRow[]): FindingStatus[] {
  return [...new Set(rows.map(rowStatus))].sort((a, b) => STATUS_ORDER[a] - STATUS_ORDER[b]);
}

/**
 * The graded rows as one list, worst first.
 *
 * Not assessed and agent info are excluded: a row that was never graded has no place among the ones
 * that were, wherever the two are being counted rather than merely listed.
 */
export function gradedRows(view: ConsolidatedView): ConsolidatedRow[] {
  return [...view.fail, ...view.needsAttention, ...view.pass];
}

/** Apply the toolbar's narrowing to a list of rows. */
export function filterRows(
  rows: readonly ConsolidatedRow[],
  { query, family, bucket, status, order = 'severity' }: FindingsFilter = {},
): ConsolidatedRow[] {
  const needle = query?.trim().toLowerCase();
  const out = rows.filter(r => {
    if (family && r.family !== family) return false;
    if (bucket && r.bucket !== bucket) return false;
    if (status && rowStatus(r) !== status) return false;
    if (!needle) return true;
    return searchFields(r).some(f => f?.toLowerCase().includes(needle));
  });

  out.sort((a, b) =>
    order === 'family'
      ? a.family.localeCompare(b.family) || STATUS_ORDER[rowStatus(a)] - STATUS_ORDER[rowStatus(b)]
      : STATUS_ORDER[rowStatus(a)] - STATUS_ORDER[rowStatus(b)] || a.family.localeCompare(b.family));

  return out;
}
