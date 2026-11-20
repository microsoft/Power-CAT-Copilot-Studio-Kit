/**
 * Reads the ARC2 agent nodes' `arc2-node-output-v4` payload.
 *
 * ## Why this file exists
 *
 * The ARC2 nodes return a different shape from the ART ones, and deliberately a
 * smaller one. Three facts drive everything below:
 *
 * 1. **The output is exception-only.** A rule the node judged and found nothing
 *    wrong with is *absent*. Passes are therefore inferred here, against the set
 *    of rules the node was asked to assess — never read off the wire. A node
 *    that returned nothing at all is a clean sweep, not a failed run.
 * 2. **Severity, references and pillar are omitted on purpose.** The catalog owns
 *    them, so the model cannot invent a severity that moves a score. They are
 *    resolved from {@link ruleById} here, which is what keeps one rule's weight
 *    stated in exactly one place.
 * 3. **"Could not run" is not a model verdict.** It is a host status. The node
 *    says either "this failed" (`exceptions`) or "I could not judge this"
 *    (`notAssessed`); anything else is the app's own reporting.
 *
 * ## What this file does *not* do
 *
 * It does not score. It normalises a v4 payload into the `AgentComponentResult`
 * every existing consumer already understands, so the Copilot, Standard, Skill
 * and artifact paths each gain v4 support without a parser of their own.
 */
import { ruleById } from '../../../review-core/registry';
import { pillarFor, type NodeKind, type Rule, type RuleId } from '../../../review-core/rule';
import { AGENT_PILLARS, LEGACY_PILLAR_NAME, type AgentPillar } from '../../../review-core/pillars';
import { SEVERITY_TO_LEGACY } from '../../../review-core/severity';
import type { Harness } from '../../../review-core/harness';
import type { AgentComponentResult, AgentFinding } from '../../contracts/ReviewJob';
import type { GroundedFinding, RuleEvaluationResult } from '../../contracts/Findings';
import type { ReferenceId } from '../../contracts/references';
import type {
  CrossSkillOrchestrationEvaluation,
  CrossSkillOrchestrationFinding,
} from '../../contracts/SkillEvaluation';
import {
  INSTRUCTION_COVERAGE_KEYS,
  type InstructionCoverageElement,
  type InstructionCoverageResult,
} from '../../contracts/AiCoverage';
import type {
  StandardReviewCandidate,
  StandardReviewCandidateEvidence,
  StandardReviewNotAssessed,
  StandardReviewUnitResult,
} from '../../../contracts/StandardReviewWorkflow';
import { createOrchestrationFinding, getOrchestrationRule } from '../skill/orchestrationRuleRegistry';
import { INSTRUCTION_RULE_IDS } from '../skill/InstructionCoverageValidator';
import { readCopilotAiNarrative } from '../copilotAiNarrative';
import { readWorkflowResourceResults } from './workflowResourceResults';

/** The contract string every ARC2 node stamps on its payload. */
export const ARC2_NODE_CONTRACT = 'arc2-node-output-v4';

/** One grounded quote supporting an exception. */
export interface Arc2Evidence {
  componentId?: string;
  fieldPath?: string;
  quote?: string;
}

/** One rule the node judged and failed. */
export interface Arc2Exception {
  ruleId: string;
  findingTitle?: string;
  fact?: string;
  whyItMatters?: string;
  makerAction?: string;
  acceptanceCheck?: string;
  evidence?: Arc2Evidence[];
  suggestedText?: string;
}

/**
 * One rubric dimension score.
 *
 * Only the two skill nodes return these; `cross-skill` and `copilot-instructions`
 * judge rules rather than score a rubric, so their payloads carry none.
 */
export interface Arc2Dimension {
  key: string;
  score: number;
  rationale?: string;
}

/** One rule the node could not judge, and why. */
export interface Arc2NotAssessed {
  ruleId: string;
  reason?: string;
  scopeStatus?: string;
}

/** The whole node payload. */
export interface Arc2NodeOutput {
  contract: string;
  schemaVersion: number;
  /** Node id. The field is `node`, not `nodeId` — reading `nodeId` returns empty on every payload. */
  node?: string;
  unitId?: string;
  subjectId?: string;
  attempt?: number;
  status?: 'complete' | 'partial';
  result: {
    exceptions: Arc2Exception[];
    notAssessed: Arc2NotAssessed[];
    /** Rubric scores, present on the skill nodes only. */
    dimensions?: Arc2Dimension[];
    resources?: AgentComponentResult['resources'];
  };
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Whether this payload came from an ARC2 node rather than an ART one. */
export function isArc2NodeOutput(value: unknown): value is Arc2NodeOutput {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<Arc2NodeOutput>;
  return v.contract === ARC2_NODE_CONTRACT
    && typeof v.result === 'object'
    && v.result !== null;
}

/**
 * Normalises an ARC2 payload, tolerating the fields the model may omit.
 *
 * Returns `null` for anything that is not v4, so a caller can fall through to
 * the legacy parser without a second shape test.
 */
export function parseArc2NodeOutput(value: unknown): Arc2NodeOutput | null {
  if (!isArc2NodeOutput(value)) return null;
  const raw = value as Arc2NodeOutput;
  // Passes are inferred from *absence*, so a malformed list must never be read
  // as "the node found nothing wrong". Coercing a string or object to `[]` here
  // would stamp every rule the node was asked to assess as passed -- a silent,
  // fully green result for a payload that was never understood. Both lists are
  // required by the v4 contract, so anything else is rejected outright, exactly
  // as `parseBareArc2Result` already does for the envelope-less shape.
  if (!Array.isArray(raw.result.exceptions) || !Array.isArray(raw.result.notAssessed)) return null;
  const exceptions = raw.result.exceptions
    .filter((e): e is Arc2Exception => !!e && typeof e.ruleId === 'string' && e.ruleId.length > 0);
  const notAssessed = raw.result.notAssessed
    .filter((n): n is Arc2NotAssessed => !!n && typeof n.ruleId === 'string' && n.ruleId.length > 0);
  const rejectedRows = exceptions.length !== raw.result.exceptions.length
    || notAssessed.length !== raw.result.notAssessed.length;
  if (rejectedRows) {
    console.warn('[CopilotReview] Invalid node-result rows were discarded; the assessment is partial.');
  }
  const dimensions = asArray<Arc2Dimension>(raw.result.dimensions)
    .filter((d): d is Arc2Dimension =>
      !!d && typeof d.key === 'string' && d.key.length > 0 && Number.isFinite(d.score));
  const resourceResults = readWorkflowResourceResults(raw.result.resources);
  return {
    ...raw,
    // An advisory "complete" cannot override unassessed or rejected rows.
    status: rejectedRows || resourceResults.rejected
      || resourceResults.resources?.some(resource => resource.status !== 'complete')
      || notAssessed.length > 0 || (raw.status !== undefined && raw.status !== 'complete')
      ? 'partial' : 'complete',
    result: { exceptions, notAssessed, dimensions, resources: resourceResults.resources },
  };
}

/**
 * Normalises a node payload that carries no `arc2-node-output-v4` envelope.
 *
 * The workflow writes each agent node's structured output straight into
 * `cat_resultjson`, so the arrays arrive at the top level with no `contract`,
 * `node` or `result` wrapper. That shape matches neither {@link isArc2NodeOutput}
 * nor the legacy readers, and every field is read behind `?? []` downstream, so
 * an unrecognised payload degrades to zero findings rather than raising -- the
 * review completes looking clean. This recognises the bare shape instead.
 *
 * `isArc2NodeOutput` is deliberately NOT loosened. A bare payload is wrapped
 * here and handed to {@link parseArc2NodeOutput}, so per-item filtering and the
 * `status` derivation stay in one place and cannot drift between the two paths.
 *
 * Three envelopes must never match, and each is excluded by a field only it
 * carries, not by elimination:
 * - a declarative-agent payload (`contractVersion` / `outcome`), which keeps its
 *   own reader and its own `cat_itemstatus` gate;
 * - a Standard Review unit (`findings`), which keeps the legacy ART contract;
 * - anything already stamped with a `contract`, which belongs to the v4 reader
 *   above and must not be silently re-labelled when its contract string differs.
 *
 * @param value - Parsed `cat_resultjson` content.
 * @param node - Node this row came from. The row cannot identify it: a component
 *   row looks identical whether a skill was reviewed inside an agent or uploaded
 *   on its own, so the caller derives it from the submitted job kind.
 * @returns The normalised payload, or null when this is not a bare node result.
 */
export function parseBareArc2Result(value: unknown, node: NodeKind): Arc2NodeOutput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if ('contract' in v || 'contractVersion' in v || 'outcome' in v || 'findings' in v) return null;
  if (!Array.isArray(v.exceptions) || !Array.isArray(v.notAssessed)) return null;
  return parseArc2NodeOutput({
    contract: ARC2_NODE_CONTRACT,
    schemaVersion: 4,
    node,
    ...(v.status !== undefined ? { status: v.status } : {}),
    result: {
      exceptions: v.exceptions as Arc2Exception[],
      notAssessed: v.notAssessed as Arc2NotAssessed[],
      ...(Array.isArray(v.dimensions) ? { dimensions: v.dimensions as Arc2Dimension[] } : {}),
      ...(v.resources !== undefined ? { resources: v.resources } : {}),
    },
  });
}

/**
 * Records a model-supplied rule id the registry does not know.
 *
 * Dropping the finding is correct — an id with no registered rule resolves no
 * severity, no pillar and no wording, and a finding carrying none of those
 * corrupts the review rather than degrading it. What the drop lacks is a trace:
 * the job still reports success, the score still computes, and the only visible
 * difference is a finding the maker never sees. Counts alone cannot tell a model
 * that found nothing apart from a model whose answer was discarded.
 *
 * This matters most on the cross-skill node, whose live schema does not
 * constrain `ruleId` to an enum at all, so the model is free to invent one.
 */
function warnDroppedRuleId(source: string, ruleId: string): void {
  console.warn(
    `[CopilotReview] Dropped a finding from ${source}: rule id ${JSON.stringify(ruleId)} `
    + 'is not in the rule registry. The finding was discarded.',
  );
}

/**
 * Projects one v4 exception onto the Standard Review candidate shape.
 *
 * `affectedComponentIds` is derived from the evidence rather than invented,
 * because `validateCandidate` requires every affected component to be evidenced
 * and rejects the whole candidate otherwise — so the evidence is the only
 * honest source for this list, and a superset would be thrown away.
 *
 * `fact` is deliberately dropped: the Standard candidate has no such field and
 * renders the evidence quotes directly, so it has nowhere to go here.
 */
function arc2ExceptionToStandardCandidate(exception: Arc2Exception): StandardReviewCandidate {
  const evidence = asArray<Arc2Evidence>(exception.evidence);
  const affectedComponentIds = [...new Set(
    evidence
      .map((item) => item?.componentId)
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
  )];
  return {
    ruleId: exception.ruleId,
    affectedComponentIds,
    // Passed through unfiltered so the parser's own strict per-item check still
    // rejects a malformed row, rather than this quietly shrinking the evidence
    // and turning a rejection into a smaller-looking finding.
    evidence: evidence as StandardReviewCandidateEvidence[],
    ...(exception.findingTitle ? { findingTitle: exception.findingTitle } : {}),
    ...(exception.whyItMatters ? { whyItMatters: exception.whyItMatters } : {}),
    ...(exception.makerAction ? { makerAction: exception.makerAction } : {}),
    ...(exception.acceptanceCheck ? { acceptanceCheck: exception.acceptanceCheck } : {}),
    ...(exception.suggestedText ? { suggestedText: exception.suggestedText } : {}),
  };
}

/**
 * Reads a Standard Review unit result out of an ARC2 v4 payload.
 *
 * The Standard parser was written against the ART envelope, which puts both
 * arrays at the top level and names the failures `findings`. A v4 payload nests
 * them under `result` and names the failures `exceptions`, so every field that
 * parser reads is `undefined` and it throws on a perfectly good review. This is
 * the same "tell the shapes apart by contract, not by guesswork" seam that
 * `mapReviewJobItems` already uses for per-component rows.
 *
 * Returns `null` for anything that is not v4, so the caller falls through to the
 * legacy parser with its behaviour unchanged.
 */
export function parseArc2StandardUnitResult(value: unknown): StandardReviewUnitResult | null {
  const parsed = parseArc2NodeOutput(value);
  if (!parsed) return null;
  return {
    status: parsed.status === 'complete' ? 'complete' : 'partial',
    findings: parsed.result.exceptions.map(arc2ExceptionToStandardCandidate),
    // `reason` is optional in v4 and required here. It is passed through rather
    // than invented: the existing `notAssessed()` check already rejects a blank
    // reason, and that rejection is visible in the unit's `rejected` list.
    notAssessed: parsed.result.notAssessed as StandardReviewNotAssessed[],
  };
}

/**
 * Flattens the structured evidence into the single string the finding UI renders.
 *
 * The UI shows `fact` in one monospace block, so multiple quotes are joined
 * rather than dropped — naming only the first offending component is the defect
 * the evidence-completeness prompt fix exists to prevent, and silently
 * discarding the rest here would reintroduce it below the model.
 *
 * The result is **narrative, not quotation**: it interleaves the model's own
 * prose with component ids and field paths, so it is deliberately *not* a
 * verbatim substring of the reviewed source. It therefore cannot be used as the
 * finding's grounding evidence — see `evidenceQuotes` on
 * {@link arc2ExceptionToFinding}, which carries the verbatim quotes separately.
 */
export function flattenArc2Evidence(exception: Arc2Exception): string {
  const quotes = asArray<Arc2Evidence>(exception.evidence)
    .map((e) => {
      const where = [e.componentId, e.fieldPath].filter(Boolean).join(' · ');
      const quote = (e.quote ?? '').trim();
      if (!where) return quote;
      return quote ? `${where}: ${quote}` : where;
    })
    .filter((line) => line.length > 0);

  const fact = (exception.fact ?? '').trim();
  if (quotes.length === 0) return fact;
  return fact ? [fact, ...quotes].join('\n') : quotes.join('\n');
}

/**
 * The display family for a rule, resolved through the pillar it scores in.
 *
 * Two hops rather than one: `family` is not a field on a rule — that axis was
 * removed — so the pillar is resolved first and then spelled the way the UI
 * groups on. {@link pillarFor} throws when a rule does not claim the harness it
 * is asked about, so the requested harness is used only when the rule declares
 * it and the rule's own first harness is used otherwise. An adapter is the wrong
 * place to decide a rule's harness was wrong.
 *
 * A skill rule resolves to one of the six rubric dimensions rather than an agent
 * pillar, and those have no Title-case spelling because they were never
 * persisted as one. The dimension id is returned unchanged, which is the axis
 * the skill views already group on.
 */
export function familyForRule(rule: Rule<never>, harness?: Harness): string | undefined {
  const usable = harness && rule.harnesses.includes(harness) ? harness : rule.harnesses[0];
  if (!usable) return undefined;
  try {
    const pillar = pillarFor(rule, usable);
    return (AGENT_PILLARS as readonly string[]).includes(pillar)
      ? LEGACY_PILLAR_NAME[pillar as AgentPillar]
      : pillar;
  } catch {
    return undefined;
  }
}

/**
 * Turns one v4 exception into the legacy finding shape.
 *
 * Severity comes from the catalog and is never left undefined: an unresolved
 * severity does not degrade the UI, it corrupts it — the header counts become
 * `NaN` and the finding disappears from every severity filter. An unregistered
 * rule id therefore yields `null` and is dropped, which is the same outcome the
 * skill path already chose for unknown ids.
 *
 * `evidence` and `evidenceQuotes` are deliberately different things.
 * `evidence`/`fact` is the readable narrative the UI renders; `evidenceQuotes`
 * is the ordered list of **verbatim** quotes, which is the only form that can
 * satisfy the validator's grounding check (a literal substring test against the
 * reviewed source). Before they were separated, every v4 skill finding was
 * dropped as `fabricated-evidence`, because the narrative composite can never be
 * a substring of the text it describes.
 */
export function arc2ExceptionToFinding(
  exception: Arc2Exception,
  harness?: Harness,
): AgentFinding | null {
  const rule = ruleById(exception.ruleId as RuleId);
  if (!rule) {
    warnDroppedRuleId('a node exception', exception.ruleId);
    return null;
  }

  const evidence = flattenArc2Evidence(exception);
  const quotes = asArray<Arc2Evidence>(exception.evidence)
    .map((e) => (e.quote ?? '').trim())
    .filter((quote) => quote.length > 0);
  const firstComponent = asArray<Arc2Evidence>(exception.evidence)
    .map((e) => e.componentId)
    .find((id): id is string => typeof id === 'string' && id.length > 0);

  return {
    ruleId: rule.id,
    severity: SEVERITY_TO_LEGACY[rule.severity],
    evidence,
    evidenceQuotes: quotes.length > 0 ? quotes : undefined,
    resourcePath: firstComponent,
    family: familyForRule(rule, harness),
    findingTitle: exception.findingTitle?.trim() || undefined,
    fact: evidence || undefined,
    whyItMatters: exception.whyItMatters?.trim() || undefined,
    makerAction: exception.makerAction?.trim() || undefined,
    acceptanceCheck: exception.acceptanceCheck?.trim() || undefined,
    suggestedText: exception.suggestedText?.trim() || undefined,
    componentIdUnique: firstComponent,
  };
}

/**
 * The harness whose rules a node runs, keyed by the node id the flow stamps.
 *
 * Measured from live payloads rather than assumed: component rows carry
 * `copilot-skill` or `standalone-skill`, 9000 `cross-skill`, 9001
 * `copilot-instructions`, and 9500-9504 `standard`.
 *
 * This is a better source than the job's own harness column, which cannot tell
 * a skill reviewed inside a copilot agent from a standalone upload — they share
 * one job harness but have different pillars on the same shared rule (D-14).
 */
const NODE_HARNESS: Readonly<Record<string, Harness>> = Object.freeze({
  'copilot-skill': 'copilot-skill',
  'standalone-skill': 'standalone-skill',
  'cross-skill': 'copilot',
  'copilot-instructions': 'copilot',
  standard: 'standard',
});

/** Resolves a payload's node id to its harness; `undefined` for an unknown node. */
export function harnessForNode(node: string | undefined): Harness | undefined {
  return node ? NODE_HARNESS[node] : undefined;
}

/**
 * Projects a v4 payload onto the per-component shape the rest of the app reads.
 *
 * `skillName` comes from the row, not the payload, and the order matters more
 * than it looks. A v4 payload carries no `skillName` at all, and its `subjectId`
 * is the **agent** — identical on every component row of a review — so keying on
 * the subject would collapse every skill onto one entry and silently discard all
 * but the last. It is also the wrong value: the batch is looked up by the skill
 * name the host holds in `bundlesByMarkdown`, which an agent id never matches.
 * `unitId` is the per-unit last resort, so a row carrying no name is still
 * distinct rather than dropped.
 *
 * `harness` defaults to the payload's own node, which resolves a shared skill
 * rule to the right pillar without the caller having to know which node ran.
 *
 * `dimensions` are carried through from the payload. The two skill nodes score
 * the four-key rubric and the other three do not, so an empty list here means
 * "this node scores no rubric" rather than "this skill scored zero" — which is
 * why they are passed through rather than defaulted to a number. The 0-100 scale
 * the nodes emit is reconciled downstream by `normalizeSkillDimensionScore`.
 */
export function arc2ToAgentComponentResult(
  output: Arc2NodeOutput,
  skillName: string,
  harness?: Harness,
): AgentComponentResult {
  const resolved = harness ?? harnessForNode(output.node);
  const findings = output.result.exceptions
    .map((e) => arc2ExceptionToFinding(e, resolved))
    .filter((f): f is AgentFinding => f !== null);

  return {
    skillName: skillName || output.unitId || output.subjectId || '',
    status: output.status ?? 'complete',
    dimensions: asArray<Arc2Dimension>(output.result.dimensions).map((d) => ({
      key: d.key,
      score: d.score,
      rationale: d.rationale ?? '',
    })),
    findings,
    summary: '',
    notAssessed: output.result.notAssessed,
    resources: output.result.resources,
    arc2: {
      node: output.node,
      unitId: output.unitId,
      attempt: output.attempt,
    },
  } as AgentComponentResult;
}

/**
 * Builds one verdict per rule the node was asked to assess.
 *
 * This is where "absent means passed" is applied, and it is only sound against a
 * known denominator: `expectedRuleIds` is the set the host sent to the node. A
 * rule missing from a payload is a pass; a rule the node explicitly could not
 * judge is `not-applicable`, which keeps it out of both sides of the ratio
 * rather than crediting it.
 *
 * @param output - The parsed node payload.
 * @param expectedRuleIds - Every rule the node was asked to assess.
 * @param keySuffix - Appended to each key so two subjects assessed by the same
 *   rule do not collide; keys must be unique across the whole review.
 */
export function arc2RuleResults(
  output: Arc2NodeOutput,
  expectedRuleIds: readonly string[],
  keySuffix?: string,
  harness?: Harness,
): RuleEvaluationResult[] {
  const failed = new Map(output.result.exceptions.map((e) => [e.ruleId, e]));
  const unassessed = new Map(output.result.notAssessed.map((n) => [n.ruleId, n]));
  const key = (ruleId: string): string => (keySuffix ? `${ruleId}:${keySuffix}` : ruleId);

  const results: RuleEvaluationResult[] = [];
  for (const ruleId of expectedRuleIds) {
    const rule = ruleById(ruleId as RuleId);
    if (!rule) continue;
    const family = familyForRule(rule, harness) ?? 'Instructions';

    if (unassessed.has(ruleId)) {
      results.push({ key: key(ruleId), ruleId, family, status: 'not-applicable' });
      continue;
    }
    if (failed.has(ruleId)) {
      results.push({
        key: key(ruleId),
        ruleId,
        family,
        status: rule.severity === 'info'
          ? 'info'
          : rule.severity === 'medium' ? 'warning' : 'error',
      });
      continue;
    }
    results.push({ key: key(ruleId), ruleId, family, status: 'passed' });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Agent-level translations - v4 payload into the legacy stage shapes
// ---------------------------------------------------------------------------

/**
 * Picks the single evidence quote most likely to survive grounding.
 *
 * The orchestration validator carries **one string**, not a list, and grounds it
 * by plain case-insensitive substring against the skill corpus. Joining several
 * quotes would therefore ground none of them, so one is chosen: the longest that
 * is actually present in the corpus, falling back to the longest overall so the
 * validator reports an ungrounded finding rather than an empty one.
 */
function groundedQuote(exception: Arc2Exception, sourceCorpus: string): string {
  const quotes = asArray<Arc2Evidence>(exception.evidence)
    .map((e) => (e.quote ?? '').trim())
    .filter((q) => q.length > 0)
    .sort((a, b) => b.length - a.length);
  if (quotes.length === 0) return '';
  const corpus = sourceCorpus.toLowerCase();
  return quotes.find((q) => corpus.includes(q.toLowerCase())) ?? quotes[0];
}

/**
 * Translates the cross-skill node (index 9000) into the shape
 * `validateOrchestrationEvaluation` already checks.
 *
 * The translation deliberately stops at the validator rather than replacing it.
 * Every guard that protects this stage - registered rule, approved references,
 * known skill names, grounded evidence, no URLs - keeps running untouched; only
 * the wire shape changes here. The validator then rebuilds each finding through
 * `createOrchestrationFinding`, so the canonical title, rationale, fix steps and
 * references remain registry-owned. Validated AI narrative is retained
 * separately as optional display advice; it cannot change identity or verdicts.
 *
 * Two fields need real work. `skills` must be skill **names**, while v4 cites
 * component **GUIDs**, so the caller supplies the map recovered from the batch
 * rows. When no cited component maps - a set-level finding such as a coverage
 * gap names no single skill - it falls back to the whole known set, which is the
 * honest subject of a set-level rule and also satisfies the pairwise rules'
 * two-skill minimum.
 */
export function arc2ToOrchestrationEvaluation(
  output: Arc2NodeOutput,
  skillNameById: ReadonlyMap<string, string>,
  knownSkills: string[],
  sourceCorpus: string,
): CrossSkillOrchestrationEvaluation {
  const findings: CrossSkillOrchestrationFinding[] = [];
  let droppedFinding = false;

  for (const exception of output.result.exceptions) {
    const rule = getOrchestrationRule(exception.ruleId);
    // An unregistered id is dropped here rather than passed on, so the
    // validator's issue list stays a record of model error, not of our own.
    if (!rule) {
      warnDroppedRuleId('the cross-skill reviewer', exception.ruleId);
      droppedFinding = true;
      continue;
    }

    const cited = asArray<Arc2Evidence>(exception.evidence)
      .map((e) => (e.componentId ? skillNameById.get(e.componentId) : undefined))
      .filter((name): name is string => !!name);
    const skills = cited.length > 0 ? [...new Set(cited)] : [...knownSkills];

    findings.push(createOrchestrationFinding(exception.ruleId, {
      skills,
      evidence: groundedQuote(exception, sourceCorpus),
      narrative: exception,
    }));
  }

  return {
    status: droppedFinding || output.result.notAssessed.length > 0 || output.status === 'partial'
      ? 'partial' : 'complete',
    findings, summary: '', referenceIds: [],
  };
}

/**
 * The coverage node's verdicts on rules that are *not* coverage elements.
 *
 * INS-07 is decided on this node but is not one of the five coverage keys, and
 * `InstructionCoverageElement['key']` is a closed union that the strict
 * validator enforces exactly — so there is no element for it to become. Before
 * this existed, INS-07 matched no key and was therefore consulted in neither the
 * failed nor the unassessed set: its verdict was dropped in both directions,
 * with nothing thrown and nothing logged.
 *
 * `notAssessed` rows are deliberately not projected. Under the node contract a
 * rule absent from the findings is treated as passed, and "could not judge" is a
 * host status rather than a maker-facing finding.
 *
 * The registered rule owns identity, severity and references. The original node
 * may supply the finding title, rationale and maker action, with registered
 * prose as the fallback. Optional verification and draft text from the same
 * response are retained as saved advice, not generated by this translation.
 */
function coverageRuleFindings(output: Arc2NodeOutput): GroundedFinding[] {
  const coverageIds = new Set<string>(Object.values(INSTRUCTION_RULE_IDS));
  const findings: GroundedFinding[] = [];

  for (const exception of output.result.exceptions) {
    if (coverageIds.has(exception.ruleId)) continue;
    const rule = ruleById(exception.ruleId as RuleId);
    // An unregistered id cannot resolve a severity, and a missing severity does
    // not degrade the UI but corrupts it — the same reason the generic path drops.
    if (!rule) {
      warnDroppedRuleId('the instruction coverage reviewer', exception.ruleId);
      continue;
    }

    const evidence = flattenArc2Evidence(exception);
    const componentId = asArray<Arc2Evidence>(exception.evidence)
      .map((e) => e.componentId)
      .find((id): id is string => typeof id === 'string' && id.length > 0);

    const finding: GroundedFinding = {
      id: rule.id,
      family: familyForRule(rule, 'copilot') ?? 'Instructions',
      severity: SEVERITY_TO_LEGACY[rule.severity],
      title: exception.findingTitle?.trim() || rule.title,
      fact: evidence || rule.prose.summary || rule.prose.question,
      why: exception.whyItMatters?.trim() || rule.prose.why,
      fix: exception.makerAction?.trim() || rule.prose.fix,
      referenceId: rule.references[0] as ReferenceId,
      ai: true,
      findingTitle: exception.findingTitle,
      whyItMatters: exception.whyItMatters,
      makerAction: exception.makerAction,
      acceptanceCheck: exception.acceptanceCheck,
      suggestedText: exception.suggestedText,
    };
    findings.push(componentId ? { ...finding, componentIdUnique: componentId } : finding);
  }

  return findings;
}

/**
 * Translates the instruction-coverage node (index 9001) into the five-element
 * shape the coverage classifier reads.
 *
 * The exception-only contract maps cleanly onto the three states this stage
 * needs. A rule the node raised is an **absent** element, which is what emits
 * the INS-xx warning. A rule it reported as unassessed is **omitted**, which
 * leaves the classification `partial` - the honest answer when something was
 * never judged, and distinct from a pass. Everything else is a **pass**, marked
 * `inferredPass` because there is no quote to carry for a rule that was never
 * flagged; without that marker the classifier would drop all five and report a
 * clean agent as a failed stage.
 *
 * The node also judges rules that are not coverage elements; those leave through
 * `findings` rather than being silently discarded. See {@link coverageRuleFindings}.
 */
export function arc2ToInstructionCoverage(output: Arc2NodeOutput): InstructionCoverageResult {
  const failed = new Map(output.result.exceptions.map((e) => [e.ruleId, e]));
  const unassessed = new Set(output.result.notAssessed.map((n) => n.ruleId));
  const elements: InstructionCoverageElement[] = [];

  for (const key of INSTRUCTION_COVERAGE_KEYS) {
    const ruleId: string = INSTRUCTION_RULE_IDS[key];
    if (unassessed.has(ruleId)) continue;
    elements.push(
      failed.has(ruleId)
        ? { key, present: false, evidence: '', ...readCopilotAiNarrative(failed.get(ruleId)) }
        : { key, present: true, evidence: '', inferredPass: true },
    );
  }

  return {
    elements,
    citationIds: [{ id: 'ms-authoring-instructions' }],
    findings: coverageRuleFindings(output),
  };
}
