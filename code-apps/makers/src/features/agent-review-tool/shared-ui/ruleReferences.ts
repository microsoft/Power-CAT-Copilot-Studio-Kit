/**
 * The official page a rule is checking against.
 *
 * Every rule already names its source — `referenceId` is required on `Rule`, and each evaluator
 * finding carries one too — but that id only reached the screen when the rule produced a finding.
 * A rule that *passed* returns `null`, so the row had nothing to cite and the Source badge simply
 * did not appear. That is backwards: a reader who wants to know what a check is asking for wants
 * the page most when the check is unfamiliar, not only when it failed.
 *
 * Resolving by rule id instead of by finding fixes that, and fixes it for reviews already saved:
 * nothing new has to be persisted, and no stored row has to be migrated.
 *
 * Two sources, in this order:
 *
 *  1. `ALL_RULES`, read directly, so a rule that changes its citation changes this map with it and
 *     a new rule arrives already linked. Nothing to keep in step by hand.
 *  2. The table below, for checks that exist only as evaluator or analyzer output and so are absent
 *     from `ALL_RULES`. Each entry repeats the id that code already cites, quoted at its source.
 */

import { ALL_RULES } from '../agents-experience/services/GroundedRuleEngine';
import { REFERENCES, type ReferenceId } from '../agents-experience/contracts/references';

/**
 * Checks with no entry in `ALL_RULES`.
 *
 * These are raised by the evaluator model or by the skill analyzer, which build findings directly
 * rather than declaring a rule, so there is no definition to read a citation from. The comment on
 * each group names the code that chooses the id, so a change there can be found from here.
 */
const EVALUATOR_RULE_REFERENCES: Readonly<Record<string, ReferenceId>> = {
  // L0SkillAnalyzer.fmFinding defaults every frontmatter check to the skill authoring page.
  'SKL-01': 'ms-skills-create',
  'SKL-02': 'ms-skills-create',
  'SKL-03': 'ms-skills-create',
  'SKL-07': 'ms-skills-create',
  'SKL-11': 'ms-skills-create',
  'SKL-12': 'ms-skills-create',
  'SKL-13': 'ms-skills-create',
  'SKL-14': 'ms-skills-create',
  // CopilotReviewService raises these three itself, each citing its own source.
  'SKL-04': 'ms-skills-overview',
  'SKL-05': 'owasp-llm01',
  'SKL-10': 'owasp-llm06',
  'AEX-01': 'ms-agents-overview',
  // Instruction coverage: INSTRUCTION_RULE_IDS maps the five elements to INS-02..06, and every one
  // of them is raised against the authoring guidance that lists those elements.
  'INS-02': 'ms-authoring-instructions',
  'INS-03': 'ms-authoring-instructions',
  'INS-04': 'ms-authoring-instructions',
  'INS-05': 'ms-authoring-instructions',
  'INS-06': 'ms-authoring-instructions',
  // INS-07 and SKL-09 declare `execution: 'ai'`, so the AI node decides them and neither appears
  // in ALL_RULES. Each id repeats its own rule's `references[0]` — instructions.rules.ts:86 and
  // skills.rules.ts:43 — so the Source badge reads the same page it did when they ran in code.
  'INS-07': 'ms-authoring-instructions',
  'SKL-09': 'ms-tools-skills',
  // EvaluationCoverageService.
  'EVL-02': 'ms-eval-intro',
  // Connected-agent checks retired from ALL_RULES but still present on saved reviews.
  'CON-01': 'ms-connected-agent',
  'CON-02': 'ms-connected-agent',
};

const RULE_REFERENCE_IDS: ReadonlyMap<string, ReferenceId> = new Map([
  ...ALL_RULES.map((rule) => [rule.id, rule.referenceId] as const),
  ...Object.entries(EVALUATOR_RULE_REFERENCES),
]);

/** The reference id a rule cites, or undefined for one this build does not know. */
export function ruleReferenceId(ruleId: string | undefined): ReferenceId | undefined {
  return ruleId ? RULE_REFERENCE_IDS.get(ruleId) : undefined;
}

export interface ResolvedReference {
  /** The publisher, e.g. "Microsoft Learn" or "OWASP" — what the badge shows. */
  label: string;
  /** The page itself. Absent only for an id missing from the registry. */
  url?: string;
  /** The page's own title, for the link's tooltip. */
  title?: string;
}

/**
 * The badge the design asks for: the standard's name, linked to the page it names.
 *
 * Rows persist the id (`owasp-llm06`), which means nothing to a reader. The curated registry is the
 * only place that knows both the publisher and the URL, and it is read here rather than at save
 * time so that correcting a URL there corrects every review ever recorded — which is what that
 * registry promises.
 */
export function resolveReference(referenceId: string | undefined): ResolvedReference | undefined {
  if (!referenceId) return undefined;
  const entry = (REFERENCES as Record<string, { title: string; url: string; source: string }>)[referenceId];
  return entry ? { label: entry.source, url: entry.url, title: entry.title } : { label: referenceId };
}

/**
 * What the review cited, for the line beside the summary bar's legend.
 *
 * Counted over distinct pages rather than over rows: a dozen instruction checks all citing the
 * authoring guidance is one source consulted, not twelve, and the larger number would suggest a
 * breadth of evidence the review does not have.
 *
 * Resolved exactly the way the Source badge resolves it — `row.reference` first, then the rule's
 * own citation — so this line counts the same pages the reader can click through to. An id no
 * longer in the registry is left out entirely; it names no page, so it cannot be cited.
 */
export function citationProvenance(
  rows: ReadonlyArray<{ ruleId: string; reference?: string }>,
): string[] {
  const cited = new Set<string>();
  for (const row of rows) {
    const id = row.reference ?? ruleReferenceId(row.ruleId);
    if (id && resolveReference(id)?.url) cited.add(id);
  }
  if (cited.size === 0) return [];

  let learn = 0;
  for (const id of cited) {
    if (resolveReference(id)?.label === 'Microsoft Learn') learn += 1;
  }
  const web = cited.size - learn;

  // "web" covers OWASP, MITRE CWE, Anthropic and the rest in one word, which is what the design
  // asks for: the split a reader cares about is Microsoft's own guidance versus everything else.
  const parts = [`${cited.size} reference${cited.size === 1 ? '' : 's'} cited`];
  if (learn > 0) parts.push(`${learn} Microsoft Learn`);
  if (web > 0) parts.push(`${web} web`);
  return parts;
}
