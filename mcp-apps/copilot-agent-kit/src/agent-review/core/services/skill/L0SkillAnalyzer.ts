/**
 * L0 skill analyzer (research §4.1, §4.4 deterministic parts).
 * Runs frontmatter/structure checks + the injection scan, and applies the
 * hard safety gate: any critical/high safety finding blocks the L1 AI judge
 * for that skill (research §5 threat model).
 */
import type { AeSkill } from '../../contracts/AgentsExperienceModel.js';
import type { GroundedFinding, RuleEvaluationResult, RuleEvaluationStatus } from '../../contracts/Findings.js';
import type { SkillSafetyFinding } from '../../contracts/SkillEvaluation.js';
import { scanText } from './injectionPatterns.js';

export interface L0SkillResult {
  skillName: string;
  frontmatterFindings: GroundedFinding[];
  safetyFindings: SkillSafetyFinding[];
  sizeLabel: string;
  structureOk: boolean;
  /** True when an unmitigated critical/high safety finding is a product release blocker. */
  blocked: boolean;
  /** True when the skill content must not be sent to an evaluator-model prompt. */
  skipAiEvaluation: boolean;
  /**
   * One explicit deterministic outcome per per-skill rule instance (Task 3):
   * SKL-01/02/03/05/07 are always evaluated; SKL-11/12/13/14 only when their
   * applicability condition holds (otherwise 'not-applicable', not a pass).
   * Keys are `${ruleId}:${skill.schemaname}` so two skills never collide.
   */
  ruleResults: RuleEvaluationResult[];
}

const NAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

function fmFinding(
  id: string, severity: GroundedFinding['severity'], title: string, fact: string, why: string, fix: string,
  referenceId: GroundedFinding['referenceId'] = 'ms-skills-create'
): GroundedFinding {
  return { id, family: 'Skills', severity, title, fact, why, fix, referenceId, ai: false };
}

// Authoring-quality heuristics (Navya rubric, Dimension A deterministic checks).
const ROUTING_CUE = /\b(use when|when |before |after |whenever|if the|if a|for )/i;
const NEG_SCOPE = /\b(do not use|don'?t use|not for|avoid using|when not to|not intended|rather than|instead of)\b/i;
const HAS_EXAMPLES = /(^|\n)\s*#{1,6}\s*examples?\b|\b(example|examples|e\.g\.|for instance|sample prompt|test case|eval)\b/i;
const ORDERED_STEP = /^\s*\d+[.)]\s+\S/m;

export function analyzeSkillL0(skill: AeSkill): L0SkillResult {
  const frontmatterFindings: GroundedFinding[] = [];
  const name = skill.frontmatterName?.trim() ?? '';
  const description = skill.frontmatterDescription?.trim() ?? '';
  const body = skill.body?.trim() ?? '';

  // FM-2 / FM-3 — name
  if (!name) {
    frontmatterFindings.push(fmFinding('SKL-01', 'warning',
      `Skill "${skill.name}" has no frontmatter name`,
      'frontmatter name: (missing)',
      'The skill catalog and orchestrator identify the skill by its frontmatter name.',
      'Add a `name:` field to the skill frontmatter.'));
  } else if (!NAME_RE.test(name)) {
    frontmatterFindings.push(fmFinding('SKL-01', 'warning',
      `Skill name "${name}" is not a valid slug`,
      `frontmatter name: "${name}"`,
      'Skill names must be lowercase, hyphen-separated, with no leading or trailing hyphen (skills-create).',
      'Rename the skill to match ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$, e.g. "receiving-code-review".'));
  }

  // FM-4 / FM-5 — description
  if (!description) {
    frontmatterFindings.push(fmFinding('SKL-02', 'warning',
      `Skill "${name || skill.name}" has no description`,
      'frontmatter description: (missing)',
      'The description is the orchestrator\'s sole signal for when to select the skill.',
      'Add a `description:` stating what the skill does and when to use it.'));
  } else if (description.length < 50) {
    frontmatterFindings.push(fmFinding('SKL-02', 'warning',
      `Skill "${name || skill.name}" has a very short description`,
      `frontmatter description (${description.length} chars): "${description}"`,
      'A description under ~50 characters rarely gives the orchestrator enough to select the skill reliably.',
      'Expand the description to state what the skill does and the conditions that should trigger it.'));
  }

  // FM-6 — body present
  if (!body) {
    frontmatterFindings.push(fmFinding('SKL-03', 'warning',
      `Skill "${name || skill.name}" has an empty body`,
      'body after frontmatter: (empty)',
      'A skill with no instructions cannot change agent behavior.',
      'Add the skill instructions after the closing `---`, or remove the skill.'));
  }

  // ST-1 / SKL-07 — structure & size
  const bytes = new TextEncoder().encode(skill.markdown).length;
  const words = body ? body.split(/\s+/).length : 0;
  const hasHeading = /^\s{0,3}#{1,6}\s+\S/m.test(body);
  const structureOk = hasHeading && words <= 4000;
  const sizeLabel = `${(bytes / 1024).toFixed(1)} KB · ${hasHeading ? 'structured' : 'unstructured'}`;
  if (body && (!hasHeading || words > 4000)) {
    frontmatterFindings.push(fmFinding('SKL-07', 'info',
      `Skill "${name || skill.name}" structure could be improved`,
      `words: ${words} · headings: ${hasHeading ? 'yes' : 'none'}`,
      'Skills work best as focused, purpose-first instruction modules with headings; oversized or unstructured skills are harder for the orchestrator to apply.',
      words > 4000 ? 'Split or trim the skill below ~4,000 words.' : 'Add markdown headings to structure the skill body.'));
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

  // ── Authoring-quality lints (Navya rubric Dimension A, deterministic) ─────
  // skl-004 → SKL-11: numbered / ordered steps
  if (body && words > 30 && !ORDERED_STEP.test(body)) {
    frontmatterFindings.push(fmFinding('SKL-11', 'warning',
      `Skill "${name || skill.name}" has no numbered steps`,
      'body: no ordered "1." / "2." step list found',
      'Numbered, ordered steps make execution deterministic; prose or loose bullets leave the model to improvise the sequence.',
      'Rewrite the core procedure as an explicit numbered list of steps.'));
  }

  // skl-003 → SKL-12: description present but weak routing signal (no "use when")
  if (description && description.length >= 50 && !ROUTING_CUE.test(description)) {
    frontmatterFindings.push(fmFinding('SKL-12', 'info',
      `Skill "${name || skill.name}" description lacks a routing signal`,
      `frontmatter description: "${description}"`,
      'The orchestrator selects a skill from its description; without a "use when" trigger cue the routing signal is weak.',
      'Add a "Use when …" clause naming the conditions that should trigger this skill.'));
  }

  // skl-009 → SKL-13: no negative scope ("when NOT to use")
  if (body && !NEG_SCOPE.test(description) && !NEG_SCOPE.test(body)) {
    frontmatterFindings.push(fmFinding('SKL-13', 'info',
      `Skill "${name || skill.name}" has no negative scope`,
      'description/body: no "do not use / when not to" guidance',
      'Without negative scope the orchestrator over-triggers the skill on adjacent intents that another skill should own.',
      'State when NOT to use the skill (which intents defer to other skills or the base agent).'));
  }

  // skl-014 → SKL-14: no evals / example prompts
  if (body && words > 30 && !HAS_EXAMPLES.test(body)) {
    frontmatterFindings.push(fmFinding('SKL-14', 'warning',
      `Skill "${name || skill.name}" has no examples or evals`,
      'body: no example prompts, "e.g.", or evals section found',
      'Example prompts and evals let you regression-check routing and behaviour; skills without them are hard to validate and tune.',
      'Add an "## Examples" section with a few representative prompts, or link an evaluation set.',
      'ms-eval-intro'));
  }

  // ── Explicit per-skill rule-instance outcomes (Task 3) ────────────────────
  // Always-evaluated rules resolve to passed/warning/error directly from the
  // same conditions above; conditionally-applicable rules resolve to
  // 'not-applicable' outside their applicability window rather than a silent pass.
  const instanceKey = (ruleId: string): string => `${ruleId}:${skill.schemaname}`;
  // Every result below is about this one skill, so the subject is a property of
  // the pass rather than of the individual rule -- the same reasoning that
  // stamps componentIdUnique on the frontmatter findings.
  const subject = name || skill.name;
  const subjectId = skill.componentIdUnique;
  const instance = (ruleId: string, status: RuleEvaluationStatus): RuleEvaluationResult => ({
    key: instanceKey(ruleId), ruleId, family: 'Skills', status, subject, subjectId,
  });
  const skl01Status: RuleEvaluationStatus = (!name || !NAME_RE.test(name)) ? 'warning' : 'passed';
  const skl02Status: RuleEvaluationStatus = (!description || description.length < 50) ? 'warning' : 'passed';
  const skl03Status: RuleEvaluationStatus = !body ? 'warning' : 'passed';
  const skl05Status: RuleEvaluationStatus = blocked ? 'error' : safetyFindings.length > 0 ? 'warning' : 'passed';
  const skl07Status: RuleEvaluationStatus = !body ? 'not-applicable' : (!hasHeading || words > 4000) ? 'info' : 'passed';
  const skl11Status: RuleEvaluationStatus = !(body && words > 30)
    ? 'not-applicable'
    : (!ORDERED_STEP.test(body) ? 'warning' : 'passed');
  const skl12Status: RuleEvaluationStatus = !(description && description.length >= 50)
    ? 'not-applicable'
    : (!ROUTING_CUE.test(description) ? 'info' : 'passed');
  const skl13Status: RuleEvaluationStatus = !body
    ? 'not-applicable'
    : ((!NEG_SCOPE.test(description) && !NEG_SCOPE.test(body)) ? 'info' : 'passed');
  const skl14Status: RuleEvaluationStatus = !(body && words > 30)
    ? 'not-applicable'
    : (!HAS_EXAMPLES.test(body) ? 'warning' : 'passed');

  const ruleResults: RuleEvaluationResult[] = [
    instance('SKL-01', skl01Status),
    instance('SKL-02', skl02Status),
    instance('SKL-03', skl03Status),
    instance('SKL-05', skl05Status),
    instance('SKL-07', skl07Status),
    instance('SKL-11', skl11Status),
    instance('SKL-12', skl12Status),
    instance('SKL-13', skl13Status),
    instance('SKL-14', skl14Status),
  ];

  return {
    skillName: name || skill.name,
    // Stamped once here rather than at each `fmFinding` call site: every
    // frontmatter finding in this pass is about this one skill, so attributing
    // them is a property of the pass, not of the individual rule.
    frontmatterFindings: skill.componentIdUnique
      ? frontmatterFindings.map(f => ({ ...f, componentIdUnique: skill.componentIdUnique }))
      : frontmatterFindings,
    safetyFindings,
    sizeLabel,
    structureOk,
    blocked,
    skipAiEvaluation,
    ruleResults,
  };
}
