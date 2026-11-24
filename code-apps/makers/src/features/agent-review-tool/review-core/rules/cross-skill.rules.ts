/**
 * Cross-skill orchestration — the set-level `XSK-*` family.
 *
 * Their unit of analysis is the whole skill set (overlap, redundancy,
 * contradiction, coverage gaps, coupling, consistency) rather than any one
 * skill, so `subjectScope` is `'skill-set'` and {@link nodesFor} routes every
 * one of them to the `cross-skill` AI node regardless of harness.
 *
 * `copilot-skill` is the only harness they can claim. A standalone upload is a
 * single skill — a "bundle" there is one skill plus its resources, not a set —
 * so there is nothing to compare it against, which is why `validateRules`
 * rejects `skill-set` + `standalone-skill` outright.
 *
 * `execution: 'ai'` with no `check`: the verdicts come from the cross-skill node
 * of the AI workflow, not from deterministic code here. These were previously
 * metadata literals in
 * `agents-experience/services/skill/orchestrationRuleRegistry.ts`, which is now
 * an adapter deriving its legacy shape from this file so each rule is authored
 * once.
 *
 * Titles, `why` and `fix` are the legacy registry's `title`, `why` and
 * `recommendation` verbatim (§7.1 IMPL-7). `question`, `passWhen`, `failWhen`
 * and `notApplicableWhen` have no counterpart there and are taken verbatim from
 * the frozen cross-skill node contract in ARC2's
 * `engine/validation/ai-nodes/catalog.ts`, which is the authoritative AI-side
 * wording for these same ids.
 *
 * The explanatory block above XSK-05's `references` is carried over
 * character-for-character from the registry it came from.
 */
import type { AgentsExperienceModel } from '../../agents-experience/contracts/AgentsExperienceModel';
import { applies, doesNotApply, rule, type Applicability, type Rule } from '../rule';

/**
 * What the cross-skill node is shown.
 *
 * The same list `ai-review-catalog.ts` already publishes for a rule on the
 * `cross-skill` node: the set inventory first, then the per-skill material each
 * claim has to quote from. XSK-04 reads two more and declares them itself.
 */
const SET_FIELD_PATHS: readonly string[] = [
  'skill_inventory', 'skill_markdown', 'resource_manifest', 'resources[<captured-path>].content',
];

/**
 * The one condition under which a set-level question has no answer.
 *
 * Named once because all six share it, and because XSK-04 is the rule that did
 * *not*: it reached the node with a single skill and was asked to find an
 * uncovered capability in a set of one. Applying this to every member of the
 * family is the fix.
 */
const FEWER_THAN_TWO_SKILLS = 'The complete eligible set contains fewer than two skills.';

/** A cross-skill claim is meaningless below two skills — there is no set to compare. */
function needsASkillSet(model: AgentsExperienceModel): Applicability {
  return model.skills.length >= 2 ? applies : doesNotApply(FEWER_THAN_TWO_SKILLS);
}

export const crossSkillRules: readonly Rule<AgentsExperienceModel>[] = Object.freeze([
  rule<AgentsExperienceModel>({
    id: 'XSK-01',
    title: 'Overlapping Skill Triggers',
    harnesses: ['copilot-skill'],
    pillar: 'orchestration',
    subjectScope: 'skill-set',
    appliesWhen: needsASkillSet,
    execution: 'ai',
    severity: 'high',
    prose: {
      question: 'Can one realistic supported user intent ambiguously select two skills because their routing boundaries do not distinguish ownership?',
      why: 'Two or more skills describe near-identical trigger conditions, so the agent cannot reliably choose between them and routing becomes ambiguous.',
      fix: 'Differentiate the skill descriptions so each states a distinct, non-overlapping trigger, or merge the skills if they serve the same purpose.',
      fixSteps: [
        'Compare the overlapping skill descriptions and identify the shared trigger phrasing.',
        'Rewrite each description to name a distinct scope, or consolidate into a single skill.',
        'Re-run the review to confirm the routing ambiguity is resolved.',
      ],
      passWhen: ['The complete supplied skill set has materially distinguishable routing boundaries for supported intents.'],
      failWhen: ['Two skills support the same realistic intent and their supplied boundaries leave ownership ambiguous. Cite exactly those two skills; shared words alone are insufficient.'],
      notApplicableWhen: [FEWER_THAN_TWO_SKILLS],
    },
    tags: ['quality', 'routing', 'token-optimizer'],
    references: ['ms-skills-overview', 'ms-tools-skills'],
    evidence: {
      fieldPaths: SET_FIELD_PATHS,
      populations: ['skills'],
      completeForFailure: ['skills'],
    },
  }),

  rule<AgentsExperienceModel>({
    id: 'XSK-02',
    title: 'Redundant Skills',
    harnesses: ['copilot-skill'],
    pillar: 'orchestration',
    subjectScope: 'skill-set',
    appliesWhen: needsASkillSet,
    execution: 'ai',
    severity: 'medium',
    prose: {
      question: 'Does each skill contribute a meaningful capability or boundary rather than duplicate another?',
      why: 'Multiple skills provide the same capability, inflating the skill set, wasting context budget, and confusing routing without adding coverage.',
      fix: 'Remove or merge the redundant skills so each capability is represented once.',
      fixSteps: [
        'Confirm the skills deliver the same capability with no unique value.',
        'Keep the strongest skill and remove the duplicates.',
      ],
      passWhen: ['Skills provide distinct value or an explicit meaningful difference within the complete declared set.'],
      failWhen: ['Two supplied skills deliver the same capability without meaningful distinct value. Cite exactly the two skills and the duplicated responsibility.'],
      notApplicableWhen: [FEWER_THAN_TWO_SKILLS],
    },
    tags: ['quality', 'token-optimizer'],
    references: ['ms-skills-overview'],
    evidence: {
      fieldPaths: SET_FIELD_PATHS,
      populations: ['skills'],
      completeForFailure: ['skills'],
    },
  }),

  rule<AgentsExperienceModel>({
    id: 'XSK-03',
    title: 'Contradictory Skill Guidance',
    harnesses: ['copilot-skill'],
    pillar: 'orchestration',
    subjectScope: 'skill-set',
    appliesWhen: needsASkillSet,
    execution: 'ai',
    severity: 'high',
    prose: {
      question: 'Do controlling statements in different skills agree for the same subject and situation?',
      why: 'Two skills give conflicting instructions for the same situation, so the agent\'s behaviour depends on which skill is selected and becomes inconsistent.',
      fix: 'Reconcile the conflicting guidance so the skill set gives one consistent instruction per situation.',
      fixSteps: [
        'Identify the specific conflicting instructions across the two skills.',
        'Decide the correct guidance and update both skills to agree.',
      ],
      passWhen: ['The complete set has compatible controlling guidance for shared subjects and conditions.'],
      failWhen: ['Two skills give incompatible controlling instructions for the same subject, condition and scope. Cite both exact statements and only the two involved skills.'],
      notApplicableWhen: [FEWER_THAN_TWO_SKILLS],
    },
    tags: ['quality'],
    references: ['ms-authoring-instructions'],
    evidence: {
      fieldPaths: SET_FIELD_PATHS,
      populations: ['skills'],
      completeForFailure: ['skills'],
    },
  }),

  /*
   * The missing guard, repaired in the move.
   *
   * Its five siblings each declared "fewer than two skills" as a reason not to
   * run; this one did not, in the registry or in the node contract. A coverage
   * question asked of a single skill is a question about that skill, not about
   * a set, and answering it was the rule reporting a gap no set had. It now
   * shares `needsASkillSet` with the rest of the family.
   */
  rule<AgentsExperienceModel>({
    id: 'XSK-04',
    title: 'Capability Coverage Gap',
    harnesses: ['copilot-skill'],
    pillar: 'orchestration',
    subjectScope: 'skill-set',
    appliesWhen: needsASkillSet,
    execution: 'ai',
    severity: 'medium',
    prose: {
      question: 'Are the responsibilities required by the declared skill-orchestration design covered by the supplied skills or other configured routes?',
      why: 'The agent\'s stated purpose implies a capability that no skill covers, so requests in that area will fail or fall back to generic behaviour.',
      fix: 'Add a skill (or extend an existing one) to cover the missing capability implied by the agent\'s instructions.',
      fixSteps: [
        'Confirm the agent instructions imply a capability with no matching skill.',
        'Author a skill that covers the gap, or note it as out of scope.',
      ],
      passWhen: ['Every responsibility required by the supplied design has a supported owner among the declared skills, tools or connected agents.'],
      failWhen: ['An evidenced responsibility required by the declared skill-orchestration design has no supported owner in the complete supplied configuration. Do not require a skill for work intentionally owned by a tool or connected agent.'],
      notApplicableWhen: [FEWER_THAN_TWO_SKILLS],
    },
    tags: ['quality', 'scope'],
    references: ['ms-skills-overview'],
    evidence: {
      fieldPaths: [...SET_FIELD_PATHS, 'configuredCapabilities', 'agent_instructions'],
      populations: ['skills', 'instructions'],
      completeForFailure: ['skills'],
    },
  }),

  rule<AgentsExperienceModel>({
    id: 'XSK-05',
    title: 'Tight Skill Coupling',
    harnesses: ['copilot-skill'],
    pillar: 'orchestration',
    subjectScope: 'skill-set',
    appliesWhen: needsASkillSet,
    execution: 'ai',
    severity: 'medium',
    prose: {
      question: 'Are dependencies on another skill input, prior output or side effect explicit and supported?',
      why: 'A skill depends on the side effects or output of another skill, so it cannot run in isolation and the set is fragile to reordering or removal.',
      fix: 'Make each skill self-contained, or express the dependency explicitly so the orchestration is predictable.',
      fixSteps: [
        'Identify the implicit dependency between the coupled skills.',
        'Refactor so the dependent skill declares its inputs rather than relying on another skill having run first.',
      ],
      passWhen: ['Cross-skill dependencies are explicit and supported by the documented inputs, outputs and ordering.'],
      failWhen: ['A skill implicitly or unsupportably relies on another skill having produced an output or side effect. Cite exactly the dependent skill and its required provider; do not infer dependency from shared terminology.'],
      notApplicableWhen: [FEWER_THAN_TWO_SKILLS],
    },
    tags: ['dependencies', 'quality'],
    /*
     * `ms-skills-overview` states the claim directly: Copilot Studio defines a
     * skill as a "self-contained set of instructions and logic that you can
     * create, share, and reuse across agents". A skill that only works after
     * another has run is not self-contained, so the platform's own definition
     * is the authority for this rule.
     *
     * This previously cited a vendor engineering blog on agent architecture as
     * its *only* reference. That page advocates composable patterns at the
     * system level but never mentions skills depending on one another, so a
     * maker who followed the citation would not find the rule they had just
     * been told they broke.
     *
     * Three places carry this allowlist and must change together: this
     * registry, the AI Builder prompt at
     * specs/013-agents-experience-review/context/ai-Prompt-skill-orchestration.md,
     * and the pin in skillPromptDefinitions.test.ts that compares them.
     */
    references: ['ms-skills-overview', 'ms-skills-create'],
    evidence: {
      fieldPaths: SET_FIELD_PATHS,
      populations: ['skills'],
      completeForFailure: ['skills'],
    },
  }),

  rule<AgentsExperienceModel>({
    id: 'XSK-06',
    title: 'Inconsistent Skill Conventions',
    harnesses: ['copilot-skill'],
    pillar: 'orchestration',
    subjectScope: 'skill-set',
    appliesWhen: needsASkillSet,
    execution: 'ai',
    severity: 'medium',
    prose: {
      question: 'Do skill conventions remain consistent where a difference would establish an actual quality problem?',
      why: 'Skills in the same set use inconsistent naming, formatting, or instruction conventions, which makes the set harder to maintain and reason about.',
      fix: 'Apply a single consistent convention for skill naming, structure, and instruction style across the set.',
      fixSteps: [
        'Catalogue the inconsistent conventions across the skills.',
        'Choose one convention and update every skill to match.',
      ],
      passWhen: ['The complete set uses compatible conventions where consistency matters to its documented workflow.'],
      failWhen: ['Inconsistent meaningful conventions establish an evidenced quality problem with a concrete correction. Mere style preferences and neutral observations are not defects.'],
      notApplicableWhen: [FEWER_THAN_TWO_SKILLS],
    },
    tags: ['quality'],
    references: ['ms-authoring-instructions'],
    evidence: {
      fieldPaths: SET_FIELD_PATHS,
      populations: ['skills'],
      completeForFailure: ['skills'],
    },
  }),
]);
