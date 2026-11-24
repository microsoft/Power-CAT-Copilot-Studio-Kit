/**
 * The 10 Standard-harness AI pattern rules.
 *
 * Topic names and descriptions, input and output variable names and
 * descriptions, trigger phrases, topic overlap, and the two callable-routing
 * descriptions. Like the 15 instruction criteria they sit beside, these were
 * authored twice and registered nowhere: once as workflow templates in ART's
 * `utils/standardReviewWorkflowRules.ts`, and once as node-catalog entries in
 * ARC2's `ai-nodes/catalog.ts`, which composes the `standard` node contract out
 * of those templates. Neither is a registry, so nothing could ask what a
 * pattern rule's pillar, severity or weight was without reading a prompt — and
 * the scorer, which can only reach a rule it can resolve, could not reach these
 * at all.
 *
 * **The verdict is the node's.** `execution: 'ai'` with no `check`: the
 * `standard` AI node answers all 10, and {@link nodesFor} derives that node
 * from the harness, so there is nothing here for deterministic code to decide.
 * The registry's invariant runs the other way round — only a non-AI rule owes a
 * check, and an `ai` rule that declared one would be rejected.
 *
 * **Prose is reproduced, not rewritten.** `question`, `why`, `fix`, `passWhen`,
 * `failWhen` and `notApplicableWhen` are the published node-contract strings
 * verbatim, embedded newlines included, so that registering a rule cannot
 * change what a reviewer is asked or what a maker reads. Rewriting them is
 * owned separately.
 *
 * **`routing` is a tag now.** The catalog carries a `routing` tag on six of
 * these, and `KNOWN_TAGS` had no such member, so an earlier pass dropped it and
 * four of the six were left with `[]`. `routing` is a member now, and each rule
 * carries the union of what the catalog said and what this file said: `routing`
 * on all six, plus the `quality` the catalog also tagged two of them with.
 *
 * **Two ids, one legacy rule.** `STD-TOL-ROUTING-DESCRIPTION` and
 * `STD-CON-DELEGATION-DESCRIPTION` are a deliberate split of the single legacy
 * id `STD-PATTERN-TOOL-ROUTING-GAP`, which asked one question of a mixed
 * population of tools and connected agents. ARC2's `ai-nodes/build-units.ts`
 * performs the split: it expands that one recorded rule into these two ids,
 * partitions the eligible components by `componentType`, and marks the half
 * with no members not-applicable rather than letting it fail on an empty
 * population. That is why the pair shares a question, a `why`, a `fix` and a
 * failure condition, and differs only in title, pillar, and which callable it
 * is shown. The legacy id is deliberately absent from `legacyIds`: it answers
 * to both of these, and the registry resolves ids through one map, so a legacy
 * id claimed twice would silently resolve to whichever rule was declared last.
 *
 * **Three pillars, not one.** Seven describe topics and their variables — the
 * units a Standard agent's work is actually built from — and score as
 * **skills**. Topic overlap and connected-agent delegation ask who serves a
 * request, which is **orchestration**; tool routing asks that same question of
 * a **tool**, so it scores there.
 *
 * **Evidence is field paths only.** `fieldPaths` is the node contract's
 * permitted source scope for each rule, verbatim. No `populations` or
 * `completeForFailure` is declared: these read topic, variable and callable
 * fields, and the published contract names no capture group behind them, so
 * declaring one would be a guess about when the rule may not run — and a wrong
 * guess there suppresses real findings.
 */

import type { ParsedBotData } from '../../contracts/ServiceContracts';
import { rule, type Rule } from '../rule';

/**
 * The closing line of every pattern question.
 *
 * `catalog.ts` appends it to each `standard` question after the ART rejection
 * boundaries, and it is the sentence that stops a reviewer treating a clear
 * field as an exclusion or unreadable evidence as an authored omission.
 */
const QUESTION_EVIDENCE_POLICY =
  'A clear field satisfies the criterion; it is not an exclusion. Unavailable evidence is not an authored omission.';

/** Identical across all 10 in the node contract, so it is written once. */
const PASS_WHEN: readonly string[] = [
  'Each eligible component satisfies the stated quality question, and the complete reviewed population establishes none of the supplied failure conditions.',
  'Inspect the complete permitted source scope; an empty finding list is not positive evidence.',
];

/** Also identical across all 10: eligibility is decided by the frozen ART corpus policy. */
const NOT_APPLICABLE_WHEN: readonly string[] = [
  'The frozen ART corpus applicability policy proves that no component is eligible for this criterion.',
];

/**
 * The shared half of the `STD-PATTERN-TOOL-ROUTING-GAP` split.
 *
 * One legacy question, asked of two populations. See the file header.
 */
const CALLABLE_QUESTION = 'Does each eligible tool or connected agent state when it should and should not be selected?\n'
  + 'Failure-rejection boundaries from ART: The description gives a specific purpose and enough context to distinguish the callable. The callable is not available for model selection. The description is unavailable.\n'
  + QUESTION_EVIDENCE_POLICY;

const CALLABLE_WHY = 'A callable component does not define a clear model-selection boundary.';

const CALLABLE_FIX = 'State the exact use case, required context, and exclusions in the affected callable description.';

const CALLABLE_FAIL_WHEN: readonly string[] = [
  'One eligible callable has a broad or generic description with no clear scope boundary, exclusion, or when-to-use condition.',
];

export const standardPatternRules: readonly Rule<ParsedBotData>[] = Object.freeze([
  rule<ParsedBotData>({
    id: 'STD-PATTERN-MODEL-NAME',
    title: 'Unclear Model Name',
    harnesses: ['standard'],
    pillar: 'skills',
    subjectScope: 'agent',
    execution: 'ai',
    severity: 'high',
    tags: ['quality', 'routing'],
    references: [],
    prose: {
      question: 'Does each eligible topic have a clear model-facing name that states its action and context?\n'
        + 'Failure-rejection boundaries from ART: Only an authoring name is available. The effective model-facing name cannot be confirmed.\n'
        + QUESTION_EVIDENCE_POLICY,
      why: 'An effective model-facing name does not clearly identify the component.',
      fix: 'Use a distinct model-facing name that states the component purpose. Test that a maker can identify the intended route from the name alone.',
      passWhen: PASS_WHEN,
      failWhen: [
        'The name has fewer than two meaningful words after filler words are ignored.',
        'The name is generic, materially misspelled, ambiguous, or does not convey both an action and its context.',
        'The name is identical or nearly identical to another eligible topic name.',
      ],
      notApplicableWhen: NOT_APPLICABLE_WHEN,
    },
    evidence: { fieldPaths: ['fields.modelName'], populations: ['topics'] },
  }),

  rule<ParsedBotData>({
    id: 'STD-PATTERN-MODEL-DESCRIPTION',
    title: 'Unclear Model Description',
    harnesses: ['standard'],
    pillar: 'skills',
    subjectScope: 'agent',
    execution: 'ai',
    severity: 'high',
    tags: ['quality', 'routing'],
    references: [],
    prose: {
      question: 'Does each eligible topic description state what the topic does and when it should be selected?\n'
        + 'Failure-rejection boundaries from ART: The description is unavailable or blank and is covered by a deterministic missing-field check. The topic is not eligible for model-description review.\n'
        + QUESTION_EVIDENCE_POLICY,
      why: 'A model-selection description does not define a clear purpose or selection boundary.',
      fix: 'State the positive purpose, required context, and important exclusions. Test representative and near-boundary requests.',
      passWhen: PASS_WHEN,
      failWhen: [
        'The description is shorter than 30 characters.',
        'The description has no action verb or no trigger context.',
        'The description only restates the topic name without adding selection detail.',
      ],
      notApplicableWhen: NOT_APPLICABLE_WHEN,
    },
    evidence: { fieldPaths: ['fields.modelDescription', 'fields.description'], populations: ['topics'] },
  }),

  rule<ParsedBotData>({
    id: 'STD-PATTERN-INPUT-NAME',
    title: 'Unclear Input Variable Name',
    harnesses: ['standard'],
    pillar: 'skills',
    subjectScope: 'agent',
    execution: 'ai',
    severity: 'medium',
    tags: ['quality'],
    references: [],
    prose: {
      question: 'Does each input name state the value that the topic requires?\n'
        + 'Failure-rejection boundaries from ART: The input metadata is unavailable. The name is clear in its topic context.\n'
        + QUESTION_EVIDENCE_POLICY,
      why: 'An input-variable name does not clearly identify the required value.',
      fix: 'Use a precise input name that states the expected value. Test that a maker can understand it without opening the topic.',
      passWhen: PASS_WHEN,
      failWhen: [
        'The input name is generic, materially misspelled, ambiguous, shorter than three characters, or does not communicate its purpose.',
      ],
      notApplicableWhen: NOT_APPLICABLE_WHEN,
    },
    evidence: { fieldPaths: ['fields.inputVariables'], populations: ['topics'] },
  }),

  rule<ParsedBotData>({
    id: 'STD-PATTERN-INPUT-DESCRIPTION',
    title: 'Unclear Input Variable Description',
    harnesses: ['standard'],
    pillar: 'skills',
    subjectScope: 'agent',
    execution: 'ai',
    severity: 'medium',
    tags: ['quality'],
    references: [],
    prose: {
      question: 'Does each populated input description explain its purpose and required value?\n'
        + 'Failure-rejection boundaries from ART: The description is blank and is covered by a deterministic missing-field check. The input metadata is unavailable.\n'
        + QUESTION_EVIDENCE_POLICY,
      why: 'An input-variable description does not explain the required value or its use.',
      fix: 'Describe the value, source, accepted format, and blank-value behavior. Test both valid and missing input.',
      passWhen: PASS_WHEN,
      failWhen: [
        'A populated description is shorter than 15 characters, is generic, only repeats the variable name, or does not explain the value purpose or expected format.',
      ],
      notApplicableWhen: NOT_APPLICABLE_WHEN,
    },
    evidence: { fieldPaths: ['fields.inputVariableDescriptions'], populations: ['topics'] },
  }),

  rule<ParsedBotData>({
    id: 'STD-PATTERN-OUTPUT-NAME',
    title: 'Unclear Output Variable Name',
    harnesses: ['standard'],
    pillar: 'skills',
    subjectScope: 'agent',
    execution: 'ai',
    severity: 'medium',
    tags: ['quality'],
    references: [],
    prose: {
      question: 'Does each output name state the value or condition it returns?\n'
        + 'Failure-rejection boundaries from ART: The output metadata is unavailable. The name is clear in its topic context.\n'
        + QUESTION_EVIDENCE_POLICY,
      why: 'An output-variable name does not clearly identify the returned value or condition.',
      fix: 'Use a precise, correctly spelled output name. Test that the caller can use it without opening the topic.',
      passWhen: PASS_WHEN,
      failWhen: [
        'The output name is generic, materially misspelled, ambiguous, shorter than three characters, or does not communicate its purpose.',
      ],
      notApplicableWhen: NOT_APPLICABLE_WHEN,
    },
    evidence: { fieldPaths: ['fields.outputVariables'], populations: ['topics'] },
  }),

  rule<ParsedBotData>({
    id: 'STD-PATTERN-OUTPUT-DESCRIPTION',
    title: 'Unclear Output Variable Description',
    harnesses: ['standard'],
    pillar: 'skills',
    subjectScope: 'agent',
    execution: 'ai',
    severity: 'medium',
    tags: ['quality'],
    references: [],
    prose: {
      question: 'Does each populated output description explain the returned value and expected format?\n'
        + 'Failure-rejection boundaries from ART: The description is blank and is covered by a deterministic missing-field check. The output metadata is unavailable.\n'
        + QUESTION_EVIDENCE_POLICY,
      why: 'An output-variable description does not explain what the value means or how it is used.',
      fix: 'Describe the returned value, condition, and caller behavior. Test the output in success and failure paths.',
      passWhen: PASS_WHEN,
      failWhen: [
        'A populated description is shorter than 15 characters, is generic, only repeats the variable name, or does not explain the returned value or expected format.',
      ],
      notApplicableWhen: NOT_APPLICABLE_WHEN,
    },
    evidence: { fieldPaths: ['fields.outputVariableDescriptions'], populations: ['topics'] },
  }),

  rule<ParsedBotData>({
    id: 'STD-PATTERN-MISSING-TRIGGERS',
    title: 'Missing Trigger Phrases',
    harnesses: ['standard'],
    pillar: 'skills',
    subjectScope: 'agent',
    execution: 'ai',
    severity: 'medium',
    tags: ['routing'],
    references: [],
    prose: {
      question: 'Does each eligible classic topic have at least three distinct trigger phrases?\n'
        + 'Failure-rejection boundaries from ART: The agent uses generative orchestration. The topic is event-driven, system-managed, or not selected by recognized intent. Trigger-phrase metadata is unavailable.\n'
        + QUESTION_EVIDENCE_POLICY,
      why: 'A classic recognized-intent topic does not have enough distinct trigger phrases.',
      fix: 'Add at least three distinct phrases that represent realistic requests for the affected topic.',
      passWhen: PASS_WHEN,
      failWhen: [
        'A classic recognized-intent topic has fewer than three distinct trigger phrases.',
      ],
      notApplicableWhen: NOT_APPLICABLE_WHEN,
    },
    evidence: {
      fieldPaths: ['fields.triggerQueries', 'fields.triggerPhraseSummary'],
      populations: ['topics'],
    },
  }),

  rule<ParsedBotData>({
    id: 'STD-ROUTE-TOPIC-OVERLAP',
    title: 'Overlapping Topic Descriptions',
    harnesses: ['standard'],
    pillar: 'orchestration',
    subjectScope: 'agent',
    execution: 'ai',
    severity: 'medium',
    tags: ['routing', 'token-optimizer'],
    references: [],
    prose: {
      question: 'Can one realistic user request reasonably select two or more eligible topics?\n'
        + 'Failure-rejection boundaries from ART: The topics only share words. Any topic is not model-selected. No common intent is established.\n'
        + QUESTION_EVIDENCE_POLICY,
      why: 'Two or more model-selected topics can match the same realistic request.',
      fix: 'Separate each topic with explicit positive scope and exclusions. Test one witness request for each overlap and each intended route.',
      passWhen: PASS_WHEN,
      failWhen: [
        'One concrete intent is supported by every named topic and no boundary resolves it.',
      ],
      notApplicableWhen: NOT_APPLICABLE_WHEN,
    },
    evidence: { fieldPaths: ['fields.modelDescription', 'fields.description'], populations: ['topics'] },
  }),

  rule<ParsedBotData>({
    id: 'STD-CON-DELEGATION-DESCRIPTION',
    title: 'Connected-Agent Delegation Description',
    harnesses: ['standard'],
    pillar: 'orchestration',
    subjectScope: 'agent',
    execution: 'ai',
    severity: 'medium',
    tags: ['routing'],
    references: [],
    prose: {
      question: CALLABLE_QUESTION,
      why: CALLABLE_WHY,
      fix: CALLABLE_FIX,
      passWhen: PASS_WHEN,
      failWhen: CALLABLE_FAIL_WHEN,
      notApplicableWhen: NOT_APPLICABLE_WHEN,
    },
    evidence: {
      fieldPaths: ['fields.description'],
      populations: ['connectedAgents', 'childAgents'],
    },
  }),

  rule<ParsedBotData>({
    id: 'STD-TOL-ROUTING-DESCRIPTION',
    title: 'Tool Routing Description',
    harnesses: ['standard'],
    pillar: 'tools',
    subjectScope: 'agent',
    execution: 'ai',
    severity: 'medium',
    tags: ['routing', 'token-optimizer'],
    references: [],
    prose: {
      question: CALLABLE_QUESTION,
      why: CALLABLE_WHY,
      fix: CALLABLE_FIX,
      passWhen: PASS_WHEN,
      failWhen: CALLABLE_FAIL_WHEN,
      notApplicableWhen: NOT_APPLICABLE_WHEN,
    },
    evidence: { fieldPaths: ['fields.description'], populations: ['tools'] },
  }),
]);
