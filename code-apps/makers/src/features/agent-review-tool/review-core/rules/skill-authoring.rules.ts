/**
 * The deterministic authoring rules for one skill inside a Copilot agent.
 *
 * These nine rules were inline logic *and* inline prose in
 * `agents-experience/services/skill/L0SkillAnalyzer.ts`: the title, the fact, the
 * reason and the fix were string literals in the emitting code, and the ids were
 * in no registry at all. Unregistered, they reached a pillar only through
 * `FAMILY_TO_PILLAR` in `agents-experience/services/scoring.ts` — the table that
 * cannot be deleted while any id resolves through it.
 *
 * **One authority, two shapes (IMPL-12).** The legacy evaluation is not
 * re-expressed once per rule here. `analyzeSkillL0`'s body is hoisted verbatim
 * into {@link assessSkillAuthoring}, which returns one verdict per rule, and that
 * single assessment is projected twice: each rule's `check` reads its own verdict
 * for the scorer, and `L0SkillAnalyzer` reads the same verdicts to rebuild the
 * `GroundedFinding[]` and `RuleEvaluationResult[]` it has always published. The
 * regexes, the thresholds and every literal string below are the ones that were
 * in the analyzer; none of them were harmonised on the way across.
 *
 * Three things worth knowing before reading the rules:
 *
 * - **The harness is `copilot`, not `copilot-skill`.** The subject really is one
 *   skill, and `subjectScope` says so — but the only consumer that *scores* these
 *   ids is `CopilotReviewService`, which reviews a Copilot agent and rolls each
 *   skill's rule results into that agent's Skills pillar. `copilot-skill` is the
 *   AI-node harness and is deliberately still empty at Step 2.3 (D-2.3-K is the
 *   open question); claiming it here would answer that question by accident.
 *   `pillar: 'skills'` reproduces `FAMILY_TO_PILLAR['Skills']` exactly, so no id
 *   moves.
 *
 * - **Four of the nine can be not-applicable, and five can never be.** SKL-01,
 *   SKL-02 and SKL-03 ask whether something exists at all, so a missing name,
 *   description or body *is* the failure — `notApplicableWhen` is empty on
 *   purpose, not unfinished. SKL-05 scans a markdown string that is always
 *   present. SKL-07, SKL-11, SKL-12, SKL-13 and SKL-14 are property rules about a
 *   body or a description, and report not-applicable when their subject is absent
 *   rather than handing out a free pass over an empty population.
 *
 * - **SKL-05 is the one rule with two failure costs.** Legacy status was
 *   three-valued — `error` when a blocking directive was found, `warning` for an
 *   advisory, `passed` for a clean scan — against a `CREDIT` table of
 *   `{ error: 0, warning: 0.5, passed: 1 }`. `Rule.severity` is one value, so the
 *   rule is declared `high` (a blocking failure earns nothing) and the advisory
 *   case returns `failPartial(…, 0.5)`, which is what the legacy half-credit was.
 *
 * **Deliberately not here: SKL-05's finding.** `L0SkillAnalyzer` publishes a
 * *status* for SKL-05 and no finding; the `GroundedFinding` is assembled by
 * `skl05FromSafety` in `CopilotReviewService.ts`, outside this analyzer and
 * outside this migration. SKL-05's verdict therefore carries no instance, which
 * is what keeps `frontmatterFindings` byte-identical.
 */

import type { AeSkill } from '../../agents-experience/contracts/AgentsExperienceModel';
import type { ReferenceId } from '../../agents-experience/contracts/references';
import type { SkillSafetyFinding } from '../../agents-experience/contracts/SkillEvaluation';
import { scanText } from '../../agents-experience/services/skill/injectionPatterns';
import {
  fail, failPartial, failWith, notApplicable, pass, rule,
  type Rule, type RuleInstance, type RuleOutcome,
} from '../rule';
import type { LegacyRuleSeverity } from '../severity';

/** The ids this family owns, in the order `L0SkillAnalyzer` publishes its rule results. */
export const SKILL_AUTHORING_RULE_IDS = [
  'SKL-01', 'SKL-02', 'SKL-03', 'SKL-05', 'SKL-07', 'SKL-11', 'SKL-12', 'SKL-13', 'SKL-14',
] as const;

export type SkillAuthoringRuleId = typeof SKILL_AUTHORING_RULE_IDS[number];

/**
 * The legacy status vocabulary, narrowed to the four values this family produces.
 *
 * Spelled here rather than imported from `agents-experience/contracts/Findings`
 * so `review-core` does not depend on the host's wider `RuleEvaluationStatus`
 * union; it is a structural subset of it, so the adapter widens without a cast.
 */
export type SkillAuthoringStatus = 'passed' | 'warning' | 'error' | 'not-applicable';

/** What one rule concluded about one skill, in both vocabularies at once. */
export interface SkillAuthoringVerdict {
  readonly ruleId: SkillAuthoringRuleId;
  readonly status: SkillAuthoringStatus;
  /** Why the rule had no subject. Empty unless `status` is `not-applicable`. */
  readonly because: string;
  /** The severity the legacy finding carries. */
  readonly severity: LegacyRuleSeverity;
  readonly referenceId: ReferenceId;
  /**
   * One row per finding the legacy analyzer emitted for this rule.
   *
   * Empty on a pass, on a not-applicable, and always for SKL-05 — whose finding
   * is built by `CopilotReviewService`, not by the analyzer.
   */
  readonly instances: readonly RuleInstance[];
  /** The rule-level verdict text, used when there is no instance to carry it. */
  readonly detail: string;
  /** The rule-level action, used when there is no instance to carry it. */
  readonly makerAction: string;
  /** Credit a failure keeps. Omitted means the severity decides. */
  readonly credit?: number;
}

/** Everything `L0SkillAnalyzer` publishes, decided once. */
export interface SkillAuthoringAssessment {
  readonly skillName: string;
  readonly sizeLabel: string;
  readonly structureOk: boolean;
  readonly blocked: boolean;
  readonly skipAiEvaluation: boolean;
  readonly safetyFindings: SkillSafetyFinding[];
  /** One per rule, in {@link SKILL_AUTHORING_RULE_IDS} order. */
  readonly verdicts: readonly SkillAuthoringVerdict[];
}

// ── The legacy detectors, moved rather than restated ────────────────────────

const NAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

// Authoring-quality heuristics (skill rubric, Dimension A deterministic checks).
const ROUTING_CUE = /\b(use when|when |before |after |whenever|if the|if a|for )/i;
const NEG_SCOPE = /\b(do not use|don'?t use|not for|avoid using|when not to|not intended|rather than|instead of)\b/i;
const HAS_EXAMPLES = /(^|\n)\s*#{1,6}\s*examples?\b|\b(example|examples|e\.g\.|for instance|sample prompt|test case|eval)\b/i;
const ORDERED_STEP = /^\s*\d+[.)]\s+\S/m;

const SKILLS_CREATE: ReferenceId = 'ms-skills-create';

// ── The assessment ─────────────────────────────────────────────────────────

/**
 * Evaluates every authoring rule against one skill, once.
 *
 * The body is `analyzeSkillL0`'s, carried across unchanged: the same trims, the
 * same thresholds, the same order of evaluation, and the same strings. Each
 * verdict pairs the legacy status with the legacy finding it would have emitted,
 * so neither projection has to recompute anything the other already decided.
 */
export function assessSkillAuthoring(skill: AeSkill): SkillAuthoringAssessment {
  const name = skill.frontmatterName?.trim() ?? '';
  const description = skill.frontmatterDescription?.trim() ?? '';
  const body = skill.body?.trim() ?? '';
  const skillName = name || skill.name;

  const subjectId = skill.componentIdUnique;
  const evidenceId = skill.componentIdUnique?.trim() || skill.componentId?.trim() || undefined;

  /** One legacy finding, as the instance row the scorer and the adapter share. */
  const row = (title: string, detail: string, why: string, makerAction: string, quote?: string): RuleInstance => ({
    subjectId,
    subject: skillName,
    title,
    detail,
    why,
    makerAction,
    subjectRef: { id: evidenceId, schemaName: skill.schemaname, quote },
  });

  const verdicts: SkillAuthoringVerdict[] = [];
  const say = (verdict: SkillAuthoringVerdict): void => {
    verdicts.push(verdict);
  };

  // FM-2 / FM-3 — name
  if (!name) {
    say({
      ruleId: 'SKL-01', status: 'warning', because: '', severity: 'warning', referenceId: SKILLS_CREATE,
      detail: 'frontmatter name: (missing)',
      makerAction: 'Add a `name:` field to the skill frontmatter.',
      instances: [row(
        `Skill "${skill.name}" has no frontmatter name`,
        'frontmatter name: (missing)',
        'The skill catalog and orchestrator identify the skill by its frontmatter name.',
        'Add a `name:` field to the skill frontmatter.',
      )],
    });
  } else if (!NAME_RE.test(name)) {
    say({
      ruleId: 'SKL-01', status: 'warning', because: '', severity: 'warning', referenceId: SKILLS_CREATE,
      detail: `frontmatter name: "${name}"`,
      makerAction: 'Rename the skill to match ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$, e.g. "receiving-code-review".',
      instances: [row(
        `Skill name "${name}" is not a valid slug`,
        `frontmatter name: "${name}"`,
        'Skill names must be lowercase, hyphen-separated, with no leading or trailing hyphen (skills-create).',
        'Rename the skill to match ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$, e.g. "receiving-code-review".',
        name,
      )],
    });
  } else {
    say({
      ruleId: 'SKL-01', status: 'passed', because: '', severity: 'warning', referenceId: SKILLS_CREATE,
      detail: `frontmatter name: "${name}"`, makerAction: '', instances: [],
    });
  }

  // FM-4 / FM-5 — description
  if (!description) {
    say({
      ruleId: 'SKL-02', status: 'warning', because: '', severity: 'warning', referenceId: SKILLS_CREATE,
      detail: 'frontmatter description: (missing)',
      makerAction: 'Add a `description:` stating what the skill does and when to use it.',
      instances: [row(
        `Skill "${skillName}" has no description`,
        'frontmatter description: (missing)',
        'The description is the orchestrator\'s sole signal for when to select the skill.',
        'Add a `description:` stating what the skill does and when to use it.',
      )],
    });
  } else if (description.length < 50) {
    say({
      ruleId: 'SKL-02', status: 'warning', because: '', severity: 'warning', referenceId: SKILLS_CREATE,
      detail: `frontmatter description (${description.length} chars): "${description}"`,
      makerAction: 'Expand the description to state what the skill does and the conditions that should trigger it.',
      instances: [row(
        `Skill "${skillName}" has a very short description`,
        `frontmatter description (${description.length} chars): "${description}"`,
        'A description under ~50 characters rarely gives the orchestrator enough to select the skill reliably.',
        'Expand the description to state what the skill does and the conditions that should trigger it.',
        description,
      )],
    });
  } else {
    say({
      ruleId: 'SKL-02', status: 'passed', because: '', severity: 'warning', referenceId: SKILLS_CREATE,
      detail: `frontmatter description: ${description.length} chars`, makerAction: '', instances: [],
    });
  }

  // FM-6 — body present
  if (!body) {
    say({
      ruleId: 'SKL-03', status: 'warning', because: '', severity: 'warning', referenceId: SKILLS_CREATE,
      detail: 'body after frontmatter: (empty)',
      makerAction: 'Add the skill instructions after the closing `---`, or remove the skill.',
      instances: [row(
        `Skill "${skillName}" has an empty body`,
        'body after frontmatter: (empty)',
        'A skill with no instructions cannot change agent behavior.',
        'Add the skill instructions after the closing `---`, or remove the skill.',
      )],
    });
  } else {
    say({
      ruleId: 'SKL-03', status: 'passed', because: '', severity: 'warning', referenceId: SKILLS_CREATE,
      detail: 'body after frontmatter: present', makerAction: '', instances: [],
    });
  }

  // Safety scan (research §5) — markdown body is the injection surface
  const safetyFindings = scanText(skill.markdown, 'markdown');
  const skipAiEvaluation = safetyFindings.some(
    f => f.skipAiEvaluation ?? (f.severity === 'critical' || f.severity === 'high'),
  );
  const blocked = safetyFindings.some(
    f => f.safetyDisposition !== 'advisory'
      && (f.severity === 'critical' || f.severity === 'high'),
  );
  const safetyDetail = safetyFindings.map(f => `${f.id}: ${f.evidence}`).join('\n');
  const SAFETY_ACTION =
    'Review the flagged directives and remove anything that overrides system or safety behavior before publishing.';
  if (blocked) {
    say({
      ruleId: 'SKL-05', status: 'error', because: '', severity: 'error', referenceId: 'owasp-llm01',
      detail: safetyDetail, makerAction: SAFETY_ACTION, instances: [],
    });
  } else if (safetyFindings.length > 0) {
    say({
      ruleId: 'SKL-05', status: 'warning', because: '', severity: 'warning', referenceId: 'owasp-llm01',
      detail: safetyDetail, makerAction: SAFETY_ACTION, credit: 0.5, instances: [],
    });
  } else {
    say({
      ruleId: 'SKL-05', status: 'passed', because: '', severity: 'warning', referenceId: 'owasp-llm01',
      detail: 'injection scan: no directives matched', makerAction: '', instances: [],
    });
  }

  // ST-1 / SKL-07 — structure & size
  const bytes = new TextEncoder().encode(skill.markdown).length;
  const words = body ? body.split(/\s+/).length : 0;
  const hasHeading = /^\s{0,3}#{1,6}\s+\S/m.test(body);
  const structureOk = hasHeading && words <= 4000;
  const sizeLabel = `${(bytes / 1024).toFixed(1)} KB · ${hasHeading ? 'structured' : 'unstructured'}`;
  const structureAction = words > 4000
    ? 'Split or trim the skill below ~4,000 words.'
    : 'Add markdown headings to structure the skill body.';
  if (!body) {
    say({
      ruleId: 'SKL-07', status: 'not-applicable', severity: 'warning', referenceId: SKILLS_CREATE,
      because: 'The skill has no body below its frontmatter, so there is no structure or length to judge. '
        + 'The empty body is reported by SKL-03.',
      detail: '', makerAction: '', instances: [],
    });
  } else if (!hasHeading || words > 4000) {
    say({
      ruleId: 'SKL-07', status: 'warning', because: '', severity: 'warning', referenceId: SKILLS_CREATE,
      detail: `words: ${words} · headings: ${hasHeading ? 'yes' : 'none'}`,
      makerAction: structureAction,
      instances: [row(
        `Skill "${skillName}" structure could be improved`,
        `words: ${words} · headings: ${hasHeading ? 'yes' : 'none'}`,
        'Skills work best as focused, purpose-first instruction modules with headings; oversized or unstructured skills are harder for the orchestrator to apply.',
        structureAction,
      )],
    });
  } else {
    say({
      ruleId: 'SKL-07', status: 'passed', because: '', severity: 'warning', referenceId: SKILLS_CREATE,
      detail: `words: ${words} · headings: yes`, makerAction: '', instances: [],
    });
  }

  // ── Authoring-quality lints (skill rubric Dimension A, deterministic) ─────
  // skl-004 → SKL-11: numbered / ordered steps
  if (!(body && words > 30)) {
    say({
      ruleId: 'SKL-11', status: 'not-applicable', severity: 'warning', referenceId: SKILLS_CREATE,
      because: 'The skill body is empty or under 30 words, so it describes no procedure that could be '
        + 'written as ordered steps.',
      detail: '', makerAction: '', instances: [],
    });
  } else if (!ORDERED_STEP.test(body)) {
    say({
      ruleId: 'SKL-11', status: 'warning', because: '', severity: 'warning', referenceId: SKILLS_CREATE,
      detail: 'body: no ordered "1." / "2." step list found',
      makerAction: 'Rewrite the core procedure as an explicit numbered list of steps.',
      instances: [row(
        `Skill "${skillName}" has no numbered steps`,
        'body: no ordered "1." / "2." step list found',
        'Numbered, ordered steps make execution deterministic; prose or loose bullets leave the model to improvise the sequence.',
        'Rewrite the core procedure as an explicit numbered list of steps.',
      )],
    });
  } else {
    say({
      ruleId: 'SKL-11', status: 'passed', because: '', severity: 'warning', referenceId: SKILLS_CREATE,
      detail: 'body: an ordered step list is present', makerAction: '', instances: [],
    });
  }

  // skl-003 → SKL-12: description present but weak routing signal (no "use when")
  if (!(description && description.length >= 50)) {
    say({
      ruleId: 'SKL-12', status: 'not-applicable', severity: 'warning', referenceId: SKILLS_CREATE,
      because: 'The skill has no description, or one too short to carry a routing cue. The description '
        + 'itself is reported by SKL-02.',
      detail: '', makerAction: '', instances: [],
    });
  } else if (!ROUTING_CUE.test(description)) {
    say({
      ruleId: 'SKL-12', status: 'warning', because: '', severity: 'warning', referenceId: SKILLS_CREATE,
      detail: `frontmatter description: "${description}"`,
      makerAction: 'Add a "Use when …" clause naming the conditions that should trigger this skill.',
      instances: [row(
        `Skill "${skillName}" description lacks a routing signal`,
        `frontmatter description: "${description}"`,
        'The orchestrator selects a skill from its description; without a "use when" trigger cue the routing signal is weak.',
        'Add a "Use when …" clause naming the conditions that should trigger this skill.',
        description,
      )],
    });
  } else {
    say({
      ruleId: 'SKL-12', status: 'passed', because: '', severity: 'warning', referenceId: SKILLS_CREATE,
      detail: 'frontmatter description: a trigger cue is present', makerAction: '', instances: [],
    });
  }

  // skl-009 → SKL-13: no negative scope ("when NOT to use")
  if (!body) {
    say({
      ruleId: 'SKL-13', status: 'not-applicable', severity: 'warning', referenceId: SKILLS_CREATE,
      because: 'The skill has no body below its frontmatter, so it states no scope at all — positive or '
        + 'negative. The empty body is reported by SKL-03.',
      detail: '', makerAction: '', instances: [],
    });
  } else if (!NEG_SCOPE.test(description) && !NEG_SCOPE.test(body)) {
    say({
      ruleId: 'SKL-13', status: 'warning', because: '', severity: 'warning', referenceId: SKILLS_CREATE,
      detail: 'description/body: no "do not use / when not to" guidance',
      makerAction: 'State when NOT to use the skill (which intents defer to other skills or the base agent).',
      instances: [row(
        `Skill "${skillName}" has no negative scope`,
        'description/body: no "do not use / when not to" guidance',
        'Without negative scope the orchestrator over-triggers the skill on adjacent intents that another skill should own.',
        'State when NOT to use the skill (which intents defer to other skills or the base agent).',
      )],
    });
  } else {
    say({
      ruleId: 'SKL-13', status: 'passed', because: '', severity: 'warning', referenceId: SKILLS_CREATE,
      detail: 'description/body: negative scope guidance is present', makerAction: '', instances: [],
    });
  }

  // skl-014 → SKL-14: no evals / example prompts
  if (!(body && words > 30)) {
    say({
      ruleId: 'SKL-14', status: 'not-applicable', severity: 'warning', referenceId: 'ms-eval-intro',
      because: 'The skill body is empty or under 30 words, so there is no behaviour substantial enough '
        + 'for examples or an evaluation set to regression-check.',
      detail: '', makerAction: '', instances: [],
    });
  } else if (!HAS_EXAMPLES.test(body)) {
    say({
      ruleId: 'SKL-14', status: 'warning', because: '', severity: 'warning', referenceId: 'ms-eval-intro',
      detail: 'body: no example prompts, "e.g.", or evals section found',
      makerAction: 'Add an "## Examples" section with a few representative prompts, or link an evaluation set.',
      instances: [row(
        `Skill "${skillName}" has no examples or evals`,
        'body: no example prompts, "e.g.", or evals section found',
        'Example prompts and evals let you regression-check routing and behaviour; skills without them are hard to validate and tune.',
        'Add an "## Examples" section with a few representative prompts, or link an evaluation set.',
      )],
    });
  } else {
    say({
      ruleId: 'SKL-14', status: 'passed', because: '', severity: 'warning', referenceId: 'ms-eval-intro',
      detail: 'body: example prompts or an evals section are present', makerAction: '', instances: [],
    });
  }

  verdicts.sort((a, b) => SKILL_AUTHORING_RULE_IDS.indexOf(a.ruleId) - SKILL_AUTHORING_RULE_IDS.indexOf(b.ruleId));

  return {
    skillName, sizeLabel, structureOk, blocked, skipAiEvaluation, safetyFindings,
    verdicts: Object.freeze(verdicts),
  };
}

/** The verdict for one rule, from an assessment that always carries all nine. */
export function verdictFor(
  assessment: SkillAuthoringAssessment, ruleId: SkillAuthoringRuleId,
): SkillAuthoringVerdict {
  const verdict = assessment.verdicts.find(v => v.ruleId === ruleId);
  if (!verdict) throw new Error(`No skill-authoring verdict was produced for ${ruleId}.`);
  return verdict;
}

/**
 * The scorer's half of the projection.
 *
 * A `warning` becomes a half-credit `medium` failure and an `error` a zero-credit
 * `high` one, which is what the legacy `CREDIT` table already paid for each.
 */
function outcomeFor(skill: AeSkill, ruleId: SkillAuthoringRuleId): RuleOutcome {
  const verdict = verdictFor(assessSkillAuthoring(skill), ruleId);
  switch (verdict.status) {
    case 'not-applicable':
      return notApplicable(verdict.because);
    case 'passed':
      return pass(verdict.detail);
    default:
      if (verdict.instances.length > 0) return failWith(verdict.instances);
      return verdict.credit === undefined
        ? fail(verdict.detail, verdict.makerAction)
        : failPartial(verdict.detail, verdict.makerAction, verdict.credit);
  }
}

// ── The rules ──────────────────────────────────────────────────────────────

/** What every rule in this family shares, declared once. */
type SkillAuthoringDefinition =
  Omit<Rule<AeSkill>, 'harnesses' | 'pillar' | 'subjectScope' | 'execution' | 'check'>
  & { readonly id: SkillAuthoringRuleId };

function authoringRule(definition: SkillAuthoringDefinition): Rule<AeSkill> {
  return rule<AeSkill>({
    ...definition,
    harnesses: ['copilot'],
    pillar: 'skills',
    subjectScope: 'skill',
    execution: 'deterministic',
    check: (skill: AeSkill) => outcomeFor(skill, definition.id),
  });
}

export const SKL_01: Rule<AeSkill> = authoringRule({
  id: 'SKL-01',
  title: 'Skill declares a valid frontmatter name',
  severity: 'medium',
  tags: ['quality'],
  references: ['ms-skills-create'],
  prose: {
    question: 'Does the skill declare a frontmatter name, and is that name a valid slug?',
    summary: 'Read the frontmatter name and match it against the slug format skills-create requires.',
    why: 'The skill catalog and orchestrator identify the skill by its frontmatter name, and skills-create requires that name to be lowercase and hyphen-separated.',
    fix: 'Add a `name:` field to the skill frontmatter, spelled as a lowercase hyphen-separated slug.',
    passWhen: ['The frontmatter declares a name matching ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$.'],
    failWhen: [
      'The frontmatter declares no name.',
      'The frontmatter name is not lowercase and hyphen-separated, or has a leading or trailing hyphen.',
    ],
    // A presence rule is never not-applicable: a skill with no name is the
    // failure this rule exists to report, not a skill it has nothing to say about.
    notApplicableWhen: [],
  },
  evidence: { fieldPaths: ['skills.frontmatterName'], populations: ['skills'] },
});

export const SKL_02: Rule<AeSkill> = authoringRule({
  id: 'SKL-02',
  title: 'Skill declares a description the orchestrator can select on',
  severity: 'medium',
  tags: ['quality'],
  references: ['ms-skills-create'],
  prose: {
    question: 'Does the skill declare a frontmatter description long enough to select on?',
    summary: 'Read the frontmatter description and measure it against the ~50-character floor.',
    why: 'The description is the orchestrator\'s sole signal for when to select the skill, and one under ~50 characters rarely carries enough of that signal.',
    fix: 'Add a `description:` stating what the skill does and the conditions that should trigger it.',
    passWhen: ['The frontmatter declares a description of at least 50 characters.'],
    failWhen: [
      'The frontmatter declares no description.',
      'The description is shorter than 50 characters.',
    ],
    notApplicableWhen: [],
  },
  evidence: { fieldPaths: ['skills.frontmatterDescription'], populations: ['skills'] },
});

export const SKL_03: Rule<AeSkill> = authoringRule({
  id: 'SKL-03',
  title: 'Skill carries instructions below its frontmatter',
  severity: 'medium',
  tags: ['quality'],
  references: ['ms-skills-create'],
  prose: {
    question: 'Does the skill carry any instructions below its frontmatter?',
    summary: 'Check whether anything was authored after the closing frontmatter delimiter.',
    why: 'A skill with no instructions cannot change agent behavior, so it adds a selection candidate the orchestrator can choose and gain nothing from.',
    fix: 'Add the skill instructions after the closing `---`, or remove the skill.',
    passWhen: ['The markdown carries a non-empty body below its frontmatter.'],
    failWhen: ['Nothing was authored below the closing frontmatter delimiter.'],
    notApplicableWhen: [],
  },
  evidence: { fieldPaths: ['skills.body'], populations: ['skills'] },
});

export const SKL_05: Rule<AeSkill> = authoringRule({
  id: 'SKL-05',
  title: 'Skill content carries no prepublish injection risk',
  severity: 'high',
  tags: ['safety', 'security'],
  references: ['owasp-llm01'],
  prose: {
    question: 'Does the skill markdown contain directives that override system or safety behavior?',
    summary: 'Scan the whole skill markdown — including hidden and obfuscated text — for prompt-injection directives.',
    why: 'A skill body is operator-supplied text the agent treats as instruction, so a directive hidden inside it reaches the model with the authority of the skill that carries it.',
    fix: 'Review the flagged directives and remove anything that overrides system or safety behavior before publishing.',
    passWhen: ['No injection pattern matched anywhere in the skill markdown.'],
    failWhen: [
      'A hidden or obfuscated critical or high directive was found, which blocks publication and withholds the skill from AI evaluation.',
      'A visible injection category was found for which Copilot Studio runtime mitigation was observed; it is reported as authoring hygiene at half credit.',
    ],
    // The scan reads `skill.markdown`, which a captured skill always has — an
    // empty string is a clean scan, not an absent subject.
    notApplicableWhen: [],
  },
  evidence: { fieldPaths: ['skills.markdown'], populations: ['skills'] },
});

export const SKL_07: Rule<AeSkill> = authoringRule({
  id: 'SKL-07',
  title: 'Skill body is structured and inside the size guideline',
  severity: 'medium',
  tags: ['quality', 'token-optimizer'],
  references: ['ms-skills-create'],
  prose: {
    question: 'Is the skill body broken up with headings and kept under ~4,000 words?',
    summary: 'Count the words in the body and look for at least one markdown heading.',
    why: 'Skills work best as focused, purpose-first instruction modules with headings; oversized or unstructured skills are harder for the orchestrator to apply.',
    fix: 'Add markdown headings to structure the skill body, and split or trim it below ~4,000 words.',
    passWhen: ['The body carries at least one markdown heading and runs to 4,000 words or fewer.'],
    failWhen: [
      'The body carries no markdown heading.',
      'The body runs past 4,000 words.',
    ],
    notApplicableWhen: [
      'The skill has no body below its frontmatter, so there is no structure or length to measure. The empty body is reported by SKL-03.',
    ],
  },
  evidence: { fieldPaths: ['skills.body'], populations: ['skills'] },
});

export const SKL_11: Rule<AeSkill> = authoringRule({
  id: 'SKL-11',
  title: 'Skill procedure is written as numbered steps',
  severity: 'medium',
  tags: ['quality'],
  references: ['ms-skills-create'],
  prose: {
    question: 'Does the skill body state its procedure as an ordered, numbered list?',
    summary: 'Look for a numbered step list in a body long enough to describe a procedure.',
    why: 'Numbered, ordered steps make execution deterministic; prose or loose bullets leave the model to improvise the sequence.',
    fix: 'Rewrite the core procedure as an explicit numbered list of steps.',
    passWhen: ['The body contains a numbered step list.'],
    failWhen: ['The body runs past 30 words and states no numbered steps.'],
    notApplicableWhen: [
      'The skill body is empty or under 30 words, so it describes no procedure that could be ordered.',
    ],
  },
  evidence: { fieldPaths: ['skills.body'], populations: ['skills'] },
});

export const SKL_12: Rule<AeSkill> = authoringRule({
  id: 'SKL-12',
  title: 'Skill description carries a routing signal',
  severity: 'medium',
  tags: ['quality'],
  references: ['ms-skills-create'],
  prose: {
    question: 'Does the description name the conditions that should trigger the skill?',
    summary: 'Match the frontmatter description against the trigger phrasings an orchestrator routes on.',
    why: 'The orchestrator selects a skill from its description; without a "use when" trigger cue the routing signal is weak.',
    fix: 'Add a "Use when …" clause naming the conditions that should trigger this skill.',
    passWhen: ['The description names an activation condition — "use when…", "whenever…", "if the…" or an equivalent cue.'],
    failWhen: ['The description is long enough to route on but states only what the skill does, with no trigger cue.'],
    notApplicableWhen: [
      'The skill has no description, or one shorter than 50 characters — too little text to carry a routing cue. The description itself is reported by SKL-02.',
    ],
  },
  evidence: { fieldPaths: ['skills.frontmatterDescription'], populations: ['skills'] },
});

export const SKL_13: Rule<AeSkill> = authoringRule({
  id: 'SKL-13',
  title: 'Skill states when not to use it',
  severity: 'medium',
  tags: ['quality'],
  references: ['ms-skills-create'],
  prose: {
    question: 'Does the skill say which intents it should not be selected for?',
    summary: 'Look for negative-scope phrasing in either the description or the body.',
    why: 'Without negative scope the orchestrator over-triggers the skill on adjacent intents that another skill should own.',
    fix: 'State when NOT to use the skill (which intents defer to other skills or the base agent).',
    passWhen: ['The description or the body names intents the skill should not be used for.'],
    failWhen: ['Neither the description nor the body carries any "do not use" or "when not to" guidance.'],
    notApplicableWhen: [
      'The skill has no body below its frontmatter, so it states no scope at all — positive or negative. The empty body is reported by SKL-03.',
    ],
  },
  evidence: { fieldPaths: ['skills.body', 'skills.frontmatterDescription'], populations: ['skills'] },
});

export const SKL_14: Rule<AeSkill> = authoringRule({
  id: 'SKL-14',
  title: 'Skill carries examples or an evaluation set',
  severity: 'medium',
  tags: ['quality'],
  references: ['ms-eval-intro'],
  prose: {
    question: 'Does the skill body carry example prompts or point at an evaluation set?',
    summary: 'Look for an examples section, a worked example, or a reference to evals in the body.',
    why: 'Example prompts and evals let you regression-check routing and behaviour; skills without them are hard to validate and tune.',
    fix: 'Add an "## Examples" section with a few representative prompts, or link an evaluation set.',
    passWhen: ['The body carries an examples section, a worked example, or a reference to an evaluation set.'],
    failWhen: ['The body runs past 30 words and carries no example prompts, no "e.g.", and no evals section.'],
    notApplicableWhen: [
      'The skill body is empty or under 30 words, so there is no behaviour substantial enough to exemplify or evaluate.',
    ],
  },
  evidence: { fieldPaths: ['skills.body'], populations: ['skills'] },
});

/**
 * Every skill-authoring rule, in the order `L0SkillAnalyzer` publishes them.
 *
 * Registering this array into `review-core/registry.ts` is the orchestrator's
 * edit (§7.1 IMPL-5), not this file's.
 */
export const skillAuthoringRules: readonly Rule<AeSkill>[] = Object.freeze([
  SKL_01, SKL_02, SKL_03, SKL_05, SKL_07, SKL_11, SKL_12, SKL_13, SKL_14,
]);
