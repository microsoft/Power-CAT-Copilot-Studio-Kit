/**
 * The deterministic authoring-shape rules over an uploaded skill's SKILL.md.
 *
 * The third class of `standalone-skill` metadata rules moving out of
 * `agents-experience/services/skill/skillRuleRegistry.ts`, and the first to ride
 * on the packaging seam rather than beside it: these rules read the same
 * `UploadedArtifact` that `skill-packaging.rules.ts` reads, so they reuse
 * {@link skillPackagingRule} and its context wholesale instead of declaring a
 * third builder that would differ from it only in which file it lives in.
 *
 * What is different is the *population*, and that is the whole reason for a
 * separate file. The packaging rules resolve a frontmatter field or a file table
 * under a runtime gate; these resolve the markdown body — so the population is
 * declared here, next to the rules that depend on it, rather than added to the
 * seam.
 *
 * Three things worth knowing before reading the rules:
 *
 * - **`dimension` is absent on purpose.** All three legacy rows carry
 *   `dimension: "quality"`, and `trigger-clarity`, `task-focus` and
 *   `instruction-quality` all bucket there, so the pillar below derives the
 *   legacy value rather than restating it. There is no divergence to record:
 *   `SKILL_DIMENSION_BUCKET` reproduces each legacy `dimension` exactly.
 * - **The pillars are not one per prefix.** `artifactReviewService.ts` maps the
 *   `SHP` prefix to `trigger-clarity` and then overrides two of the three rules
 *   —  SHP-BODYLEN to `task-focus`, SHP-STEPS to `instruction-quality`. The
 *   override table is the published answer, so it is what the `pillar` fields
 *   below say; `reviewPipeline.test.ts` pins the first two of them.
 * - **Legacy `low` carries as `info`.** `Rule.severity` has three values and
 *   cannot spell the five-point artifact scale. `critical`/`high` fold to
 *   `high`, `medium` stays, and `low` folds to `info` — which is correct for
 *   what these two rules are, published authoring advice rather than a defect,
 *   but it does mean the new scorer excludes them from both sides of the ratio.
 *   The legacy string rides on the options, so the projected row still reads
 *   `"low"` byte for byte.
 *
 * **Deliberately not here: SHP-HEADINGS.** It is published in `RULE_REGISTRY`
 * between SHP-BODYLEN and SHP-STEPS, but no scanner emits it — `shapeRules.ts`
 * has detectors for exactly the three below. A rule with no detector cannot be
 * given the generated check these share, because that check reports a verdict
 * over findings a detector already produced and would read every skill as a
 * pass. It stays with the orchestrator.
 */

import type { UploadedArtifact } from '../../skills-automations/contracts/ArtifactReview';
import { findFile, parseFrontmatter, stripRoot } from '../../skills-automations/services/artifactUtils';
import type { Rule } from '../rule';
import {
  noPopulation, populated, skillPackagingRule, unreadablePopulation,
  type SkillPackagingContext, type SkillPackagingOptions, type SkillPackagingPopulation,
  type SkillPackagingRuleEntry, type SkillRuleDefinition,
} from './skill-packaging.rules';

/** The family all three shape rules publish under. */
const SHAPE_RULE_FAMILY = 'Skills';

// ── The body reader ────────────────────────────────────────────────────────

/**
 * How far SKILL.md could be split into frontmatter and body.
 *
 * `parseFrontmatter` is the detector's own, imported rather than reimplemented,
 * for the reason the packaging seam gives: a second markdown splitter here could
 * disagree with the one that produced the finding the maker is reading.
 *
 * A file with *no* frontmatter block is `read`, not a failure state. That is not
 * leniency — `parseFrontmatter` returns the whole document as the body in that
 * case, and `evaluateShape` goes on to measure it, so the body genuinely was
 * read. Only a block that is present and broken leaves the split undone, and the
 * missing-block case is already owned and reported by PKG-FM.
 */
type SkillBodyStatus = 'missing' | 'unreadable' | 'unparsable' | 'read';

interface SkillBody {
  readonly status: SkillBodyStatus;
  readonly path: string;
  readonly body: string;
}

function readSkillBody(artifact: UploadedArtifact): SkillBody {
  const file = findFile(artifact, 'SKILL.md');
  if (!file) return { status: 'missing', path: 'SKILL.md', body: '' };

  const path = stripRoot(file.path, artifact.rootFolderName);
  if (file.isBinary || typeof file.text !== 'string') {
    return { status: 'unreadable', path, body: '' };
  }

  const frontmatter = parseFrontmatter(file.text);
  if (frontmatter.parseError) return { status: 'unparsable', path, body: frontmatter.body };
  return { status: 'read', path, body: frontmatter.body };
}

// ── Population ─────────────────────────────────────────────────────────────

/**
 * The markdown body of SKILL.md.
 *
 * Every rule here makes a claim about the shape of what an author wrote — that
 * the description says when to reach for the skill, that the body stays inside
 * the Cowork word budget, that a procedure is numbered. With no body, none of
 * those claims has a subject, so the honest answer is not-applicable rather than
 * a pass: crediting a bundle with no SKILL.md for well-shaped prose would let an
 * empty upload score as a well-authored one.
 *
 * The three non-present states are kept apart because only one of them is
 * silence:
 *
 * - *Missing* and *unparsable* are absences. Each is already somebody's failure
 *   — PKG-REQ owns the first, PKG-FM the second — and re-reporting one defect as
 *   four is what the packaging seam's property rules exist not to do.
 * - *Undecodable* is not an absence. There is a SKILL.md and it could not be
 *   read, which is an infrastructure status and never a judgement about the
 *   skill, so it is `could-not-run`.
 * - An *empty* body is the genuine "nothing to look at": the frontmatter parsed,
 *   the file was read, and the author wrote no prose, no procedure and no
 *   structure for these rules to have an opinion about.
 */
export const SKILL_BODY: SkillPackagingPopulation = Object.freeze({
  label: 'the SKILL.md body',
  resolve: (ctx: SkillPackagingContext) => {
    const skill = readSkillBody(ctx.artifact);
    switch (skill.status) {
      case 'missing':
        return noPopulation(
          'This bundle contains no SKILL.md, so there is no body whose shape could be examined. '
          + 'The missing file is reported by PKG-REQ.',
        );
      case 'unreadable':
        return unreadablePopulation(
          `"${skill.path}" is binary or failed to decode, so its body could not be read.`,
        );
      case 'unparsable':
        return noPopulation(
          'The SKILL.md frontmatter could not be parsed, so the file could not be split into a '
          + 'frontmatter block and a body. The unparsable block is reported by PKG-FM.',
        );
      default:
        break;
    }

    if (skill.body.trim().length === 0) {
      return noPopulation(
        `"${skill.path}" carries no body below its frontmatter, so it states no description `
        + 'context, no procedure and no structure for an authoring rule to judge.',
      );
    }

    return populated(
      `The frontmatter of "${skill.path}" parsed and its body was read, so the shape of what the `
      + 'author wrote could be examined.',
    );
  },
});

// ── Authoring-shape rules ──────────────────────────────────────────────────

export const SHP_TRIGGER_OPTIONS: SkillPackagingOptions = Object.freeze({
  severity: 'medium', confidence: 'medium', family: SHAPE_RULE_FAMILY,
  population: SKILL_BODY,
});

export const SHP_TRIGGER: SkillPackagingRuleEntry = skillPackagingRule({
  id: 'SHP-TRIGGER',
  title: 'Description Does Not State When to Use the Skill',
  pillar: 'trigger-clarity',
  severity: 'medium',
  tags: ['quality'],
  references: ['ms-skill-authoring-rubric', 'ms-skill-design-checklist'],
  prose: {
    question: 'Does the description say when the skill should be used, and not only what it does?',
    summary: 'Match the frontmatter description against the explicit activation phrasings the authoring guidance recommends.',
    why: 'Official guidance says the description should explain both what the skill does and when to use it. Without trigger phrases, the agent has less information for matching a request to the skill.',
    fix: 'Add concrete trigger situations and phrases to the description.',
    fixSteps: [
      'State the triggering situation, for example "Use when the user asks to…".',
      'Name the concrete phrases and file types that should trigger the skill.',
      'Keep the description focused on what the skill does and when it applies.',
    ],
    passWhen: [
      'The description names an activation condition — "use when…", "when the user…", "for requests involving…" or an equivalent explicit trigger.',
    ],
    failWhen: [
      'The description says only what the skill does, with no phrasing that tells the agent which requests should reach for it.',
    ],
    notApplicableWhen: [
      'The bundle has no SKILL.md, or its frontmatter block is present but could not be parsed — each is reported by the rule that owns it, and neither leaves a document to read a description from.',
      'SKILL.md carries no body below its frontmatter, so there is nothing authored for a shape rule to judge.',
    ],
  },
  evidence: { fieldPaths: ['SKILL.md:frontmatter.description'] },
}, SHP_TRIGGER_OPTIONS);

export const SHP_BODYLEN_OPTIONS: SkillPackagingOptions = Object.freeze({
  severity: 'low', confidence: 'medium', family: SHAPE_RULE_FAMILY,
  population: SKILL_BODY,
});

export const SHP_BODYLEN: SkillPackagingRuleEntry = skillPackagingRule({
  id: 'SHP-BODYLEN',
  title: 'Cowork Skill Body Exceeds the Authoring Guideline',
  pillar: 'task-focus',
  severity: 'info',
  tags: ['quality'],
  // One reference, not two. The Cowork authoring rubric carries this claim
  // directly; the vendor blog that used to be cited beside it was dropped from
  // the legacy row under the policy that a blog earns no place where Microsoft
  // has already spoken. Carried across verbatim rather than re-argued.
  references: ['ms-skill-authoring-rubric'],
  prose: {
    question: 'Does the SKILL.md body stay inside the word count the Copilot Cowork authoring guidance advises?',
    summary: 'Count the words in the markdown below the frontmatter and compare them against the 3,000-word Copilot Cowork authoring guideline.',
    why: 'Copilot Cowork recommends moving detail into references when SKILL.md exceeds about 3,000 words. This is authoring advice, not an upload requirement.',
    fix: 'Move detail into referenced resource files.',
    fixSteps: [
      'Keep the main procedure in SKILL.md.',
      'Move reference tables and edge cases into separate files.',
      'Reference each file from the step that needs it, so it is read only when relevant.',
    ],
    passWhen: [
      'Copilot Cowork is a selected runtime and the body is at or under about 3,000 words.',
    ],
    failWhen: [
      'The body runs past about 3,000 words, which the Cowork authoring guidance treats as the point to move detail into referenced files.',
    ],
    notApplicableWhen: [
      'The bundle has no SKILL.md, or its frontmatter block is present but could not be parsed — each is reported by the rule that owns it, and neither leaves a body to measure.',
      'SKILL.md carries no body below its frontmatter, so there is no length to compare against the guideline.',
    ],
  },
  evidence: { fieldPaths: ['SKILL.md:body'] },
}, SHP_BODYLEN_OPTIONS);

export const SHP_STEPS_OPTIONS: SkillPackagingOptions = Object.freeze({
  severity: 'low', confidence: 'medium', family: SHAPE_RULE_FAMILY,
  population: SKILL_BODY,
});

export const SHP_STEPS: SkillPackagingRuleEntry = skillPackagingRule({
  id: 'SHP-STEPS',
  title: 'Procedure Is Not Written as Ordered Steps',
  pillar: 'instruction-quality',
  severity: 'info',
  tags: ['quality'],
  references: ['ms-skill-authoring-rubric'],
  prose: {
    question: 'Where the body describes a procedure, is that procedure written as numbered steps?',
    summary: 'Look for numbered steps in a body that announces a procedure, a workflow or a process.',
    why: 'A procedure written as prose leaves the order implicit, so the model may reorder it. Numbered steps make the sequence explicit and testable.',
    fix: 'Rewrite the procedure as a numbered list.',
    fixSteps: [
      'Break the procedure into discrete actions.',
      'Number them in the order they must happen.',
    ],
    passWhen: [
      'The body announces a procedure and numbers its actions, as a numbered list or as "Step N" headings.',
      'The body describes no procedure at all — a pure reference skill has no sequence to number.',
    ],
    failWhen: [
      'The body announces steps, a procedure, a workflow or a process, and then states them as prose with no numbering.',
    ],
    notApplicableWhen: [
      'The bundle has no SKILL.md, or its frontmatter block is present but could not be parsed — each is reported by the rule that owns it, and neither leaves a body to read a procedure from.',
      'SKILL.md carries no body below its frontmatter, so there is no procedure to be ordered.',
    ],
  },
  evidence: { fieldPaths: ['SKILL.md:body'] },
}, SHP_STEPS_OPTIONS);

/**
 * Every authoring-shape rule declared here, in published order.
 *
 * The order is the one `RULE_REGISTRY` publishes — SHP-TRIGGER, SHP-BODYLEN,
 * then SHP-STEPS — with SHP-HEADINGS, which sits between the last two there,
 * left to the orchestrator because it has no detector to report over.
 *
 * `skillRuleRegistry.ts` will spread {@link skillShapeDefinitions} over the rows
 * still written out by hand, exactly as it already does for the scanner rules,
 * so a rule that moves here stops being authored twice without any consumer of
 * `RULE_REGISTRY` changing. That spread is the orchestrator's edit, not this
 * file's.
 */
export const skillShapeRuleEntries: readonly SkillPackagingRuleEntry[] = Object.freeze([
  SHP_TRIGGER,
  SHP_BODYLEN,
  SHP_STEPS,
]);

export const skillShapeCoreRules: readonly Rule<SkillPackagingContext>[] = Object.freeze(
  skillShapeRuleEntries.map(entry => entry.rule),
);

export const skillShapeDefinitions: Readonly<Record<string, SkillRuleDefinition>> =
  Object.freeze(
    Object.fromEntries(skillShapeRuleEntries.map(entry => [entry.rule.id, entry.definition])),
  );
