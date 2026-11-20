import { COMPLIANCE_CRITERIA } from '../contracts/Constants';
import type {
  StandardReviewRule,
  StandardReviewRuleCategory,
} from '../contracts/StandardReviewWorkflow';

export interface StandardReviewRuleTemplate {
  ruleId: string;
  name: string;
  category: StandardReviewRuleCategory;
  source: StandardReviewRule['source'];
  evaluationQuestion: string;
  failWhen: string[];
  rejectWhen: string[];
  allowedFieldPaths: string[];
  semanticTerms: string[];
}

export interface StandardPatternRuleTemplate extends StandardReviewRuleTemplate {
  patternName: string;
  description: string;
  recommendation: string;
}

export interface StandardInstructionRuleTemplate extends StandardReviewRuleTemplate {
  title: string;
  description: string;
  recommendation: string;
  severity: 'High' | 'Medium' | 'Low';
  criterionCategory: 'Scope' | 'UX' | 'Safety' | 'Quality';
}

/**
 * The `PatternId` the workflow projection publishes for a pattern.
 *
 * A `Pattern` groups every rule sharing a `patternName`, so it cannot carry a single rule id of its
 * own and names itself after the group instead. That slug is what reaches the scorer, so it is the
 * id `resolveStandardRuleId` must know about — exported here, beside the pattern names it is derived
 * from, so the two cannot drift.
 */
export function workflowPatternId(patternName: string): string {
  return `workflow-${patternName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

export const STANDARD_PATTERN_WORKFLOW_RULES: readonly StandardPatternRuleTemplate[] = [
  {
    ruleId: 'STD-PATTERN-MODEL-NAME',
    name: 'Unclear Model Name',
    category: 'configuration',
    source: {
      evaluator: 'stage-b-patterns',
      ruleName: 'Unclear Topic/Model Name',
      order: 1,
    },
    patternName: 'Unclear Model Name',
    description: 'An effective model-facing name does not clearly identify the component.',
    recommendation: 'Use a distinct model-facing name that states the component purpose. Test that a maker can identify the intended route from the name alone.',
    evaluationQuestion: 'Does each eligible topic have a clear model-facing name that states its action and context?',
    failWhen: [
      'The name has fewer than two meaningful words after filler words are ignored.',
      'The name is generic, materially misspelled, ambiguous, or does not convey both an action and its context.',
      'The name is identical or nearly identical to another eligible topic name.',
    ],
    rejectWhen: ['Only an authoring name is available.', 'The effective model-facing name cannot be confirmed.'],
    allowedFieldPaths: ['fields.modelName'],
    semanticTerms: [],
  },
  {
    ruleId: 'STD-PATTERN-MODEL-DESCRIPTION',
    name: 'Unclear Model Description',
    category: 'configuration',
    source: {
      evaluator: 'stage-b-patterns',
      ruleName: 'Unclear Topic/Model Description',
      order: 2,
    },
    patternName: 'Unclear Model Description',
    description: 'A model-selection description does not define a clear purpose or selection boundary.',
    recommendation: 'State the positive purpose, required context, and important exclusions. Test representative and near-boundary requests.',
    evaluationQuestion: 'Does each eligible topic description state what the topic does and when it should be selected?',
    failWhen: [
      'The description is shorter than 30 characters.',
      'The description has no action verb or no trigger context.',
      'The description only restates the topic name without adding selection detail.',
    ],
    rejectWhen: ['The description is unavailable or blank and is covered by a deterministic missing-field check.', 'The topic is not eligible for model-description review.'],
    allowedFieldPaths: ['fields.modelDescription', 'fields.description'],
    semanticTerms: [],
  },
  {
    ruleId: 'STD-PATTERN-INPUT-NAME',
    name: 'Unclear Input Variable Name',
    category: 'configuration',
    source: {
      evaluator: 'stage-b-patterns',
      ruleName: 'Unclear Input Variable Name',
      order: 3,
    },
    patternName: 'Unclear Input Variable Name',
    description: 'An input-variable name does not clearly identify the required value.',
    recommendation: 'Use a precise input name that states the expected value. Test that a maker can understand it without opening the topic.',
    evaluationQuestion: 'Does each input name state the value that the topic requires?',
    failWhen: ['The input name is generic, materially misspelled, ambiguous, shorter than three characters, or does not communicate its purpose.'],
    rejectWhen: ['The input metadata is unavailable.', 'The name is clear in its topic context.'],
    allowedFieldPaths: ['fields.inputVariables'],
    semanticTerms: [],
  },
  {
    ruleId: 'STD-PATTERN-INPUT-DESCRIPTION',
    name: 'Unclear Input Variable Description',
    category: 'configuration',
    source: {
      evaluator: 'stage-b-patterns',
      ruleName: 'Unclear Input Variable Description',
      order: 4,
    },
    patternName: 'Unclear Input Variable Description',
    description: 'An input-variable description does not explain the required value or its use.',
    recommendation: 'Describe the value, source, accepted format, and blank-value behavior. Test both valid and missing input.',
    evaluationQuestion: 'Does each populated input description explain its purpose and required value?',
    failWhen: ['A populated description is shorter than 15 characters, is generic, only repeats the variable name, or does not explain the value purpose or expected format.'],
    rejectWhen: ['The description is blank and is covered by a deterministic missing-field check.', 'The input metadata is unavailable.'],
    allowedFieldPaths: ['fields.inputVariableDescriptions'],
    semanticTerms: [],
  },
  {
    ruleId: 'STD-PATTERN-OUTPUT-NAME',
    name: 'Unclear Output Variable Name',
    category: 'configuration',
    source: {
      evaluator: 'stage-b-patterns',
      ruleName: 'Unclear Output Variable Name',
      order: 5,
    },
    patternName: 'Unclear Output Variable Name',
    description: 'An output-variable name does not clearly identify the returned value or condition.',
    recommendation: 'Use a precise, correctly spelled output name. Test that the caller can use it without opening the topic.',
    evaluationQuestion: 'Does each output name state the value or condition it returns?',
    failWhen: ['The output name is generic, materially misspelled, ambiguous, shorter than three characters, or does not communicate its purpose.'],
    rejectWhen: ['The output metadata is unavailable.', 'The name is clear in its topic context.'],
    allowedFieldPaths: ['fields.outputVariables'],
    semanticTerms: [],
  },
  {
    ruleId: 'STD-PATTERN-OUTPUT-DESCRIPTION',
    name: 'Unclear Output Variable Description',
    category: 'configuration',
    source: {
      evaluator: 'stage-b-patterns',
      ruleName: 'Unclear Output Variable Description',
      order: 6,
    },
    patternName: 'Unclear Output Variable Description',
    description: 'An output-variable description does not explain what the value means or how it is used.',
    recommendation: 'Describe the returned value, condition, and caller behavior. Test the output in success and failure paths.',
    evaluationQuestion: 'Does each populated output description explain the returned value and expected format?',
    failWhen: ['A populated description is shorter than 15 characters, is generic, only repeats the variable name, or does not explain the returned value or expected format.'],
    rejectWhen: ['The description is blank and is covered by a deterministic missing-field check.', 'The output metadata is unavailable.'],
    allowedFieldPaths: ['fields.outputVariableDescriptions'],
    semanticTerms: [],
  },
  {
    ruleId: 'STD-ROUTE-TOPIC-OVERLAP',
    name: 'Overlapping Topic Descriptions',
    category: 'routing',
    source: {
      evaluator: 'stage-b-patterns',
      ruleName: 'Overlapping Topic Descriptions',
      order: 7,
    },
    patternName: 'Overlapping Topic Descriptions',
    description: 'Two or more model-selected topics can match the same realistic request.',
    recommendation: 'Separate each topic with explicit positive scope and exclusions. Test one witness request for each overlap and each intended route.',
    evaluationQuestion: 'Can one realistic user request reasonably select two or more eligible topics?',
    failWhen: ['One concrete intent is supported by every named topic and no boundary resolves it.'],
    rejectWhen: ['The topics only share words.', 'Any topic is not model-selected.', 'No common intent is established.'],
    allowedFieldPaths: ['fields.modelDescription', 'fields.description'],
    semanticTerms: [],
  },
  {
    ruleId: 'STD-PATTERN-TOOL-ROUTING-GAP',
    name: 'Tool Routing Gap',
    category: 'routing',
    source: {
      evaluator: 'stage-b-patterns',
      ruleName: 'Tool Routing Gap',
      order: 8,
    },
    patternName: 'Tool Routing Gap',
    description: 'A callable component does not define a clear model-selection boundary.',
    recommendation: 'State the exact use case, required context, and exclusions in the affected callable description.',
    evaluationQuestion: 'Does each eligible tool or connected agent state when it should and should not be selected?',
    failWhen: ['One eligible callable has a broad or generic description with no clear scope boundary, exclusion, or when-to-use condition.'],
    rejectWhen: ['The description gives a specific purpose and enough context to distinguish the callable.', 'The callable is not available for model selection.', 'The description is unavailable.'],
    allowedFieldPaths: ['fields.description'],
    semanticTerms: [],
  },
  {
    ruleId: 'STD-PATTERN-MISSING-TRIGGERS',
    name: 'Missing Trigger Phrases',
    category: 'routing',
    source: {
      evaluator: 'stage-b-patterns',
      ruleName: 'Missing Trigger Phrases',
      order: 9,
    },
    patternName: 'Missing Trigger Phrases',
    description: 'A classic recognized-intent topic does not have enough distinct trigger phrases.',
    recommendation: 'Add at least three distinct phrases that represent realistic requests for the affected topic.',
    evaluationQuestion: 'Does each eligible classic topic have at least three distinct trigger phrases?',
    failWhen: ['A classic recognized-intent topic has fewer than three distinct trigger phrases.'],
    rejectWhen: ['The agent uses generative orchestration.', 'The topic is event-driven, system-managed, or not selected by recognized intent.', 'Trigger-phrase metadata is unavailable.'],
    allowedFieldPaths: ['fields.triggerQueries', 'fields.triggerPhraseSummary'],
    semanticTerms: [],
  },
] as const;

const INSTRUCTION_ACTIONS: Record<string, string> = {
  'scope-definition': 'Define the supported domains and the owner for each route. Test one supported and one unsupported request.',
  'out-of-scope-handling': 'Add a final response for requests that match no supported route. Test a clearly unsupported request.',
  'persona-and-tone': 'Define the response behavior for the identified non-default situation. Test that situation before routing.',
  'privacy-and-sensitive-data': 'Limit sensitive data to the signed-in user, stated purpose, and required route. Test an over-broad data request.',
  'fallback-when-uncertain': 'Add a no-guess rule, an approved fallback, and a stop condition. Test an empty or failed dependency response.',
  'citations-and-sources': 'Require available source attribution for parent-generated grounded answers. Test a source-backed answer.',
  'formatting-guidelines': 'Define the final structure for multi-part parent responses. Test a request with two supported intents.',
  'clarifying-questions': 'Require one focused question when required data or route ownership is ambiguous. Test an ambiguous request.',
  'prompt-injection-resilience': 'Reject requests to reveal or override hidden instructions, permissions, tools, or routing policy. Test an override request.',
  'link-safety': 'Require verified destinations and safe link text for parent-created links. Test an unverified destination.',
  'advice-disclaimers': 'Add the required boundary or disclaimer before consequential advice. Test a sensitive-domain request.',
  'accuracy-quality': 'Require grounded evidence and prohibit fabrication after missing information or dependency failure. Test an ungrounded request.',
  'tool-routing-hints': 'State when each ambiguous tool, source, or agent owns the request. Test the shared boundary request.',
  'escalation-guidance': 'Separate ticket creation, ticket escalation, and live-agent handoff with terminal outcomes. Test each intent.',
  'deterministic-language': 'Replace vague required steps with mandatory actions, success conditions, and stop conditions. Test both success and failure.',
};

const INSTRUCTION_TERMS: Record<string, string[]> = {
  'scope-definition': ['only', 'scope', 'support', 'route', 'domain', 'responsible'],
  'out-of-scope-handling': ['unsupported', 'out-of-scope', 'cannot help', 'no match', 'only respond', 'fails to return'],
  'persona-and-tone': ['frustrat', 'tone', 'acknowledge', 'polite', 'neutral'],
  'privacy-and-sensitive-data': ['personal', 'sensitive', 'country', 'employee', 'expense', 'tax', 'vendor', 'invoice', 'cost center'],
  'fallback-when-uncertain': ['fail', 'no response', 'cannot', 'uncertain', 'unknown', 'knowledge source', 'try'],
  'citations-and-sources': ['source', 'citation', 'cite', 'knowledge', 'document', 'reference'],
  'formatting-guidelines': ['format', 'multiple', 'intent', 'list', 'table', 'step'],
  'clarifying-questions': ['clarif', 'ambiguous', 'missing', 'ask', 'which', 'route', 'query', 'pending', 'repeat'],
  'prompt-injection-resilience': [
    'override', 'ignore instructions', 'reveal', 'hidden', 'bypass', 'permission',
    'untrusted', 'embedded instruction', 'content as data', 'follow', 'connected agent',
  ],
  'link-safety': ['link', 'url', 'website', 'destination'],
  'advice-disclaimers': ['legal', 'medical', 'financial advice', 'investment', 'regulated'],
  'accuracy-quality': ['ground', 'fabricat', 'guess', 'assume', 'no response', 'source'],
  'tool-routing-hints': ['route', 'tool', 'agent', 'topic', 'source', 'use', 'call'],
  'escalation-guidance': ['escalat', 'ticket', 'human', 'live agent', 'handoff', 'support'],
  'deterministic-language': ['try', 'might', 'usually', 'sometimes', 'if possible', 'must', 'always', 'never'],
};

export const STANDARD_INSTRUCTION_WORKFLOW_RULES: readonly StandardInstructionRuleTemplate[] =
  COMPLIANCE_CRITERIA.map((criterion, index) => ({
    ruleId: criterion.id,
    name: criterion.name,
    category: 'instructions' as const,
    source: {
      evaluator: 'stage-c-instructions' as const,
      ruleName: criterion.name,
      order: index + 1,
    },
    title: criterion.name,
    description: criterion.description,
    recommendation: INSTRUCTION_ACTIONS[criterion.id],
    severity: criterion.inherentSeverity,
    criterionCategory: criterion.category,
    evaluationQuestion: `Do the complete agent instructions satisfy ${criterion.name.toLowerCase()} for the agent's stated purpose?`,
    failWhen: [`The instructions omit or inadequately define the required ${criterion.name.toLowerCase()} behavior.`],
    rejectWhen: ['Do not use topic, tool, connected-agent, or knowledge descriptions as evidence.', 'Do not infer behavior from runtime execution or external dependencies.'],
    allowedFieldPaths: ['fields.instructions'],
    semanticTerms: INSTRUCTION_TERMS[criterion.id] ?? [],
  }));

export const STANDARD_WORKFLOW_RULES = [
  ...STANDARD_PATTERN_WORKFLOW_RULES,
  ...STANDARD_INSTRUCTION_WORKFLOW_RULES,
] as const;

/** Find a registered Standard Review workflow rule. */
export function getStandardWorkflowRule(
  ruleId: string,
): StandardPatternRuleTemplate | StandardInstructionRuleTemplate | undefined {
  return STANDARD_WORKFLOW_RULES.find((rule) => rule.ruleId === ruleId);
}
