/**
 * The eight AI-judged skill-authoring rules: `SKL-10` and the seven `SKL-AI-*`.
 *
 * These ids are not new. They have been asked of every reviewed skill for as
 * long as the two skill nodes have existed — declared in the AI catalog,
 * composed into both node contracts, and parsed back out of both responses.
 * What they never had is a registry entry. Like the 15 Standard instruction
 * criteria before them, that left the scorer reaching them only through the
 * legacy family lookup, and an unresolved id is dropped rather than failed: all
 * eight would leave their denominator silently — not loudly — the moment
 * `ruleById(...)?.pillar` replaced `FAMILY_TO_PILLAR`. Declaring them here is
 * what closes that gap, and it moves no score, because a rule that was already
 * being asked and answered is simply now also being counted.
 *
 * **No `check`, by construction.** Every verdict here comes from an AI node —
 * `copilot-skill` for a skill reviewed inside an agent, `standalone-skill` for
 * an upload — and {@link nodesFor} derives both from the harness list below.
 * `execution: 'ai'` with no `check` is the registry's invariant for that case:
 * `validateRules` rejects a deterministic rule that declares no `check` and
 * equally rejects an `ai` rule that declares one. Unlike the bundle-integrity
 * and skill-authoring families, there is no legacy detector to hoist, because
 * there never was any deterministic logic for these questions.
 *
 * **The per-harness pillar map (D-14).** This is the point of the file. Every
 * rule claims both skill harnesses and declares a *different* pillar for each,
 * because the two harnesses do not score on the same table: `pillarVocabularyFor`
 * gives `copilot-skill` the six agent pillars and `standalone-skill` the six
 * skill dimensions. That is not an inconsistency to normalise away. A skill
 * reviewed inside a Copilot agent is a component of that agent, so its findings
 * roll up into that agent's `skills` pillar alongside everything else the agent
 * is scored on. The same skill uploaded on the Skills/Automations tab is the
 * whole subject, with no instructions, knowledge or evaluation set of its own,
 * so the agent table would leave most of its weight permanently unmeasured; it
 * is judged instead against the published six-dimension authoring rubric.
 *
 * So one claim lands in two places. "Are the required steps executable?" is the
 * agent's Skills pillar from inside an agent and `instruction-quality` from an
 * upload. "Are side effects bounded?" is Skills from inside an agent and
 * `safety-evidence` from an upload. Splitting that into two rules with two ids
 * would duplicate the prose and double the id space for one question, and
 * collapsing it to a single pillar would put a skill dimension in the agent
 * table or an agent pillar in the rubric — which is precisely what
 * `validateRules` rejects. `skill-bundle-integrity.rules.ts` made this call
 * first for `BND-*`; this is the second family to need it and the first
 * AI-decided one.
 *
 * **The context is the bundle.** `Rule`'s generic is the shape a `check` or an
 * `appliesWhen` would read, and these rules declare neither, so it states what
 * the subject *is* rather than naming a parameter anything calls. It is
 * `SkillBundle` because that is the one shape both flows assemble. An
 * `AgentsExperienceModel` — which the `copilot-skill`-only families use — would
 * assert that this family never reaches a standalone upload, and an upload has
 * no agent to model. The evidence paths map onto the bundle directly:
 * `skill_markdown` is `skillMarkdown`, `resource_manifest` is `manifest`, and
 * `resources[<captured-path>].content` is a resource's `textContent`.
 *
 * **Prose is reproduced, not rewritten.** `question`, `why`, `fix`, `passWhen`,
 * `failWhen` and `notApplicableWhen` are the catalog's strings character for
 * character, including the cross-rule ownership notes several of them carry:
 * SKL-AI-ACTIONABILITY deferring capability absence to SKL-09,
 * SKL-AI-COMPOSABILITY deferring a cross-skill dependency to XSK-05, and
 * SKL-AI-RESOURCE-ALIGNMENT deferring direct contradictions to SKL-10. Those
 * sentences are what stop two nodes charging one defect twice, so they are load
 * bearing rather than editorial. Rewording is owned separately; registering a
 * rule must not change what a maker reads.
 *
 * **`notApplicableWhen` is empty on six of the eight, deliberately.** Only
 * SKL-AI-RESOURCE-ALIGNMENT and SKL-AI-OPERATIONAL-GUARDRAILS quantify over a
 * population that can be absent — resources carrying a declared role, and
 * material side-effect operations — and each says so in its own terms. The other
 * six ask about the assembled SKILL.md, which is always present, so they have no
 * state in which the question goes unasked. Empty here means answered, not
 * unfinished.
 *
 * **Tags are the catalog's, unioned with what was already here.** The catalog
 * tags these ids `routing`, `scope`, `grounding` and `dependencies`. `KNOWN_TAGS`
 * held none of those, so an earlier pass kept only the three rules whose catalog
 * tag was already approved — `quality` on SKL-10 and SKL-AI-ACTIONABILITY,
 * `safety` on SKL-AI-OPERATIONAL-GUARDRAILS — and left the other five with `[]`.
 * All four words are members now, so each rule carries the union of the two sets
 * and no rule states its subject anywhere but here.
 *
 * **No references.** The catalog supplies a `policyReference` of
 * `specs/022-unified-ai-review/rule-map.md#<id>`, which is a spec path and not a
 * `ReferenceId` from the documentation allow-list `references` is validated
 * against. Declaring one would assert a citation that does not resolve, so the
 * array is empty — the same thing all 15 Standard instruction criteria do.
 */

import type { SkillBundle } from '../../agents-experience/contracts/SkillBundle';
import { rule, type Rule } from '../rule';

/**
 * What the two skill nodes are shown for a whole-skill question.
 *
 * The list the AI catalog already publishes for these ids: the assembled
 * SKILL.md first, then the manifest and the readable resource bodies a claim has
 * to quote from. SKL-AI-CLARITY reads only the first and declares that itself,
 * because purpose and activation guidance live in the frontmatter and opening
 * prose — a resource cannot make an ambiguous trigger clear.
 */
const SKILL_FIELD_PATHS: readonly string[] = [
  'skill_markdown', 'resource_manifest', 'resources[<captured-path>].content',
];

export const skillAiRules: readonly Rule<SkillBundle>[] = Object.freeze([
  rule<SkillBundle>({
    id: 'SKL-10',
    title: 'Consistent Skill and Resource Instructions',
    harnesses: ['copilot-skill', 'standalone-skill'],
    pillar: { 'copilot-skill': 'skills', 'standalone-skill': 'instruction-quality' },
    subjectScope: 'skill',
    execution: 'ai',
    severity: 'medium',
    tags: ['quality'],
    references: [],
    prose: {
      question: 'Can the controlling skill/resource statements all be followed for the same subject, object, condition, unit and scope?',
      why: 'Conflicting requirements make the result depend on which statement is followed.',
      fix: 'Reconcile the two controlling statements so the same situation has one compatible requirement.',
      passWhen: [
        'The complete relevant instructions and resources contain no mutually incompatible controlling statements.',
        'Inspect the complete permitted source scope; an empty finding list is not positive evidence.',
      ],
      failWhen: [
        'Two exact controlling statements cannot both be satisfied for the same subject and conditions. Provide both quotes and establish their shared scope; wording differences, extra detail and compatible thresholds are not contradictions.',
      ],
      notApplicableWhen: [],
    },
    evidence: { fieldPaths: SKILL_FIELD_PATHS },
  }),

  rule<SkillBundle>({
    id: 'SKL-AI-CLARITY',
    title: 'Clear Skill Purpose and Activation',
    harnesses: ['copilot-skill', 'standalone-skill'],
    pillar: { 'copilot-skill': 'skills', 'standalone-skill': 'trigger-clarity' },
    subjectScope: 'skill',
    execution: 'ai',
    severity: 'medium',
    tags: ['routing'],
    references: [],
    prose: {
      question: 'Do the stated purpose and activation guidance communicate an unambiguous, accurate task? Missing-field and formatting checks remain deterministic-owned.',
      why: 'Ambiguous activation can select the wrong skill for a request.',
      fix: 'Clarify the specific purpose and activation boundary using the actual task and supported inputs.',
      passWhen: [
        'The supplied purpose and activation guidance make the intended task and when to use it materially clear.',
        'Inspect the complete permitted source scope; an empty finding list is not positive evidence.',
      ],
      failWhen: [
        'Populated purpose or activation guidance is materially ambiguous or misleading, beyond missing-field or format issues.',
      ],
      notApplicableWhen: [],
    },
    evidence: { fieldPaths: ['skill_markdown'] },
  }),

  rule<SkillBundle>({
    id: 'SKL-AI-ACTIONABILITY',
    title: 'Executable Skill Steps',
    harnesses: ['copilot-skill', 'standalone-skill'],
    pillar: { 'copilot-skill': 'skills', 'standalone-skill': 'instruction-quality' },
    subjectScope: 'skill',
    execution: 'ai',
    severity: 'high',
    tags: ['quality'],
    references: [],
    prose: {
      question: 'Are the required inputs, decisions, ordering and outputs executable from the stated workflow? Capability absence belongs to SKL-09 and external prerequisite defects belong to SKL-AI-PREREQUISITES.',
      why: 'An underspecified required step forces the agent to guess how to perform the task.',
      fix: 'Specify the missing input, decision, sequence or expected output for that exact step.',
      passWhen: [
        'Required steps define the inputs, decisions, ordering and observable outputs needed to follow the supplied workflow.',
        'Inspect the complete permitted source scope; an empty finding list is not positive evidence.',
      ],
      failWhen: [
        'A required step lacks an executable input, decision, ordering or output contract, and the defect is not the same missing capability or external prerequisite claimed by another rule.',
      ],
      notApplicableWhen: [],
    },
    evidence: { fieldPaths: SKILL_FIELD_PATHS },
  }),

  rule<SkillBundle>({
    id: 'SKL-AI-SCOPE',
    title: 'Focused Skill Responsibilities',
    harnesses: ['copilot-skill', 'standalone-skill'],
    pillar: { 'copilot-skill': 'skills', 'standalone-skill': 'task-focus' },
    subjectScope: 'skill',
    execution: 'ai',
    severity: 'medium',
    tags: ['scope'],
    references: [],
    prose: {
      question: 'Do the skill responsibilities serve its stated primary task and, when bound, its supplied parent remit?',
      why: 'Unrelated responsibilities make activation and task ownership less predictable.',
      fix: 'Remove or separate the unrelated responsibility, or explicitly clarify the supported primary task.',
      passWhen: [
        'The responsibilities materially support the declared primary task and supplied remit.',
        'Inspect the complete permitted source scope; an empty finding list is not positive evidence.',
      ],
      failWhen: [
        'The skill adds materially unrelated responsibilities outside its stated primary task.',
      ],
      notApplicableWhen: [],
    },
    evidence: { fieldPaths: SKILL_FIELD_PATHS },
  }),

  rule<SkillBundle>({
    id: 'SKL-AI-COMPOSABILITY',
    title: 'Explicit Invocation State',
    harnesses: ['copilot-skill', 'standalone-skill'],
    pillar: { 'copilot-skill': 'skills', 'standalone-skill': 'instruction-quality' },
    subjectScope: 'skill',
    execution: 'ai',
    severity: 'medium',
    tags: ['dependencies'],
    references: [],
    prose: {
      question: 'Can the skill be reused without undeclared invocation or session state? An explicit cross-skill dependency claim in a Copilot set belongs to XSK-05.',
      why: 'Hidden state makes a skill behave differently across sessions or invocation order.',
      fix: 'Declare and validate the state as an input, or initialize it within this invocation.',
      passWhen: [
        'Necessary invocation/session state is declared, supplied or initialized by the documented skill contract.',
        'Inspect the complete permitted source scope; an empty finding list is not positive evidence.',
      ],
      failWhen: [
        'Successful reuse relies on undeclared invocation/session state, apart from a cross-skill dependency owned by XSK-05.',
      ],
      notApplicableWhen: [],
    },
    evidence: { fieldPaths: SKILL_FIELD_PATHS },
  }),

  rule<SkillBundle>({
    id: 'SKL-AI-RESOURCE-ALIGNMENT',
    title: 'Resources Support Their Declared Role',
    harnesses: ['copilot-skill', 'standalone-skill'],
    pillar: { 'copilot-skill': 'skills', 'standalone-skill': 'task-focus' },
    subjectScope: 'skill',
    execution: 'ai',
    severity: 'medium',
    tags: ['grounding'],
    references: [],
    prose: {
      question: 'Does the actual readable resource content support the role the skill assigns it? A filename, omitted excerpt or deterministic orphan-file issue is not semantic evidence; direct contradictions belong to SKL-10.',
      why: 'A mismatched resource cannot reliably support the workflow that depends on it.',
      fix: 'Align the resource content with its declared role or change the referring step to use a suitable resource.',
      passWhen: [
        'Each relevant supplied resource materially supports its declared role in the skill.',
        'Inspect the complete permitted source scope; an empty finding list is not positive evidence.',
      ],
      failWhen: [
        'The actual resource content materially fails to serve the role assigned by the skill, without duplicating SKL-10 or a deterministic orphan-file claim.',
      ],
      notApplicableWhen: [
        'A complete manifest proves there are no resources assigned a role to assess.',
      ],
    },
    evidence: { fieldPaths: SKILL_FIELD_PATHS },
  }),

  rule<SkillBundle>({
    id: 'SKL-AI-PREREQUISITES',
    title: 'Declared External Prerequisites',
    harnesses: ['copilot-skill', 'standalone-skill'],
    pillar: { 'copilot-skill': 'skills', 'standalone-skill': 'instruction-quality' },
    subjectScope: 'skill',
    execution: 'ai',
    severity: 'medium',
    tags: ['dependencies'],
    references: [],
    prose: {
      question: 'Are evidenced required external inputs and configuration dependencies documented and supported by the declared contract? A legitimate documented dependency is not itself a defect.',
      why: 'An undisclosed or unsupported prerequisite prevents the documented workflow from being followed.',
      fix: 'Document the exact prerequisite and how the caller supplies or configures it, or remove the unsupported dependency.',
      passWhen: [
        'The contract documents and supports each evidenced required external input or configuration dependency.',
        'Inspect the complete permitted source scope; an empty finding list is not positive evidence.',
      ],
      failWhen: [
        'An evidenced required external input or configuration dependency is undocumented or unsupported by the declared contract; do not duplicate an explicit missing-capability claim.',
      ],
      notApplicableWhen: [],
    },
    evidence: { fieldPaths: SKILL_FIELD_PATHS },
  }),

  rule<SkillBundle>({
    id: 'SKL-AI-OPERATIONAL-GUARDRAILS',
    title: 'Bounded Side-Effect Instructions',
    harnesses: ['copilot-skill', 'standalone-skill'],
    pillar: { 'copilot-skill': 'skills', 'standalone-skill': 'safety-evidence' },
    subjectScope: 'skill',
    execution: 'ai',
    severity: 'high',
    tags: ['safety'],
    references: [],
    prose: {
      question: 'Do semantic instructions bound material side effects with the scope, approval and recovery required by the supplied workflow? Code that executes or uses a network is not by itself a second semantic defect; scanner-owned patterns keep their own rule.',
      why: 'An unbounded authorized side effect can change the wrong target or leave the user unable to recover.',
      fix: 'State the exact authorized target/scope, required approval and bounded recovery behavior for that operation.',
      passWhen: [
        'The supplied semantic side-effect instructions state the applicable scope, approval and recovery boundaries.',
        'Inspect the complete permitted source scope; an empty finding list is not positive evidence.',
      ],
      failWhen: [
        'The semantic instructions authorize an evidenced material side effect without a required scope, approval or recovery boundary. Identify the actual requirement; do not invent product or runtime policies.',
      ],
      notApplicableWhen: [
        'The complete relevant scope establishes no material side-effect operation requiring this criterion.',
      ],
    },
    evidence: { fieldPaths: SKILL_FIELD_PATHS },
  }),
]);
