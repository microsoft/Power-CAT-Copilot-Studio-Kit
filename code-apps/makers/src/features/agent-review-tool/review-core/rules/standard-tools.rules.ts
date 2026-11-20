/**
 * The Standard rules over the callable inventory and over each tool's own text.
 *
 * `local-pattern-7` counts callables; `local-pattern-12` and `local-pattern-13` read the
 * descriptions. They are the only deterministic checks in the Tools pillar, and that is why
 * they exist: the pillar otherwise held a single AI rule, so 12% of a Standard agent's score
 * turned on one model judgement with no partial credit and nothing to report at all when the
 * workflow was unreachable. See `LOCAL_PATTERN_12` for why a harness-list edit on the copilot
 * `TOL-*` rules could not have done this instead.
 *
 * Two things here look wrong and are not:
 *
 * - **`local-pattern-7` scores into Orchestration, not Tools.** The count it takes is tools
 *   *plus* external connected agents, which is a question about how much the
 *   model is being asked to choose between, not about the quality of any one
 *   tool. The hand-written rule declared `family: 'Orchestration'` while living
 *   in `toolRules.ts`, and that placement is load-bearing — moving it to the
 *   Tools pillar would shift the score of every Standard agent with child
 *   agents.
 * - **The builder lives in this file.** It is the rule's algorithm, so keeping
 *   it next to the declaration is what makes "one file to touch" true for this
 *   rule. It also keeps the import direction one-way: the adapter imports this
 *   file, and this file imports nothing from the adapter.
 */

import type { LocalPattern, ParsedBotData } from '../../contracts/ServiceContracts';
import type { PatternTopic, ToolDetail } from '../../contracts/StageOutputs';
import { getPatternSeverity, isPopulationIncomplete } from '../../utils/patternUtils';
import { standardResourceItems } from '../../agents-experience/services/rules/standardResourceEvidence';
import type { Rule } from '../rule';
import {
  describedWordCount, duplicateDescriptionGroups, hasWeakDescription,
} from './tool-descriptions';
import { standardRule, type CoreStandardOptions } from './standard';

/**
 * The one name a tool is reported under.
 *
 * `affectedItems` is built by `standardResourceItems`, which keys every row on `resource.name`,
 * so a sentence that named the display name instead would print one label on the row and a
 * different one in the text directly above it. `local-pattern-7` already uses `name` on both
 * sides; this keeps all three Tools rules reading the same way.
 */
function toolLabel(tool: ToolDetail): string {
  return tool.name;
}

/**
 * Why this tool population cannot be treated as complete, or `null` when it can.
 *
 * `counted` is what the snapshot says exists and `tools` is what it actually described. A rule
 * may only claim a pass — *or* claim it does not apply — when those two agree and no component
 * was left unclassified. Any other combination is a reading failure, and saying so is the only
 * honest answer available: the alternative is a row asserting "this agent has no tools" about a
 * configuration the review could not read, two lines below `local-pattern-7` reporting that a
 * complete count is unavailable for that very same population.
 */
function toolPopulationGap(
  data: ParsedBotData, tools: readonly ToolDetail[], counted: number,
): string | null {
  if (isPopulationIncomplete(data)) return 'Unclassified components prevent a complete tool population, so the descriptions on this agent could not be read in full.';
  if (tools.length < counted) return `${counted} tool(s) are counted, but only ${tools.length} carried a description in this snapshot.`;
  return null;
}

/** Tools and external connected agents share one Standard callable-inventory vote. */
export function buildStandardToolPattern(data: ParsedBotData): LocalPattern {
  const callableCount = data.toolCount + (data.connectedAgents?.length ?? 0);
  const excessive = callableCount > 15;
  const incompletePopulation = isPopulationIncomplete(data);
  const toolsUnknown = !excessive && incompletePopulation;
  const callableNames = [...data.tools, ...(data.connectedAgents ?? []).map(agent => agent.name)];
  return {
    patternId: 'local-pattern-7', patternName: 'Excessive Tools Usage',
    description: `${incompletePopulation ? 'A complete count is unavailable. ' : ''}${callableCount} callable resources were identified: ${data.toolCount} ordinary tools and ${data.connectedAgents?.length ?? 0} connected agents.`,
    recommendation: excessive
      ? 'Review whether each callable resource is necessary. Large selection sets can increase authoring and orchestration complexity; this review does not measure latency.'
      : 'Keep each callable resource focused on a distinct purpose.',
    status: !excessive && !toolsUnknown,
    assessmentStatus: excessive ? 'fail' : toolsUnknown ? 'not-assessed' : 'pass',
    assessmentReason: toolsUnknown ? 'Unclassified components prevent a complete callable-resource count.'
      : `Authoring guidance threshold: more than 15 callable resources${callableCount > 25 ? '; count also exceeds 25' : ''}.`,
    topics: excessive ? callableNames : [],
    affectedItems: excessive ? standardResourceItems(
      [...(data.toolDetails ?? []), ...(data.connectedAgents ?? [])], callableNames, 'Callable resource inventory',
    ) : [],
    category: 'Architecture', severity: getPatternSeverity('Excessive Tools Usage'),
    evidenceKind: 'authoring-guidance',
  };
}

export const LOCAL_PATTERN_7_OPTIONS: CoreStandardOptions = {
  family: 'Orchestration', fieldPath: 'callableResources', build: buildStandardToolPattern,
};

export const LOCAL_PATTERN_7: Rule<ParsedBotData> = standardRule({
  id: 'local-pattern-7',
  title: 'Excessive Tools Usage',
  harnesses: ['standard'],
  pillar: 'orchestration',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'high',
  tags: ['quality', 'token-optimizer'],
  references: ['ms-tools-skills'],
  prose: {
    question: 'Is the agent choosing between a manageable number of callable resources?',
    summary: 'Count ordinary tools together with external connected agents.',
    why: 'Large callable inventories can increase authoring and orchestration complexity; no latency is measured.',
    fix: 'Review whether each callable resource has a necessary, distinct purpose.',
    passWhen: ['The combined count of tools and connected agents is 15 or fewer.'],
    failWhen: ['More than 15 callable resources are available to the model.'],
    notApplicableWhen: [],
  },
  evidence: { fieldPaths: ['callableResources'] },
}, LOCAL_PATTERN_7_OPTIONS);

/**
 * `standardResourceItems` returns one item per resource, in order, when no legacy names are
 * passed — so the caller can pair each item back to the tool it was built from and show the
 * configured text rather than repeating the name the item already carries.
 */
function withCurrentDescription(tools: ToolDetail[], setting: string): PatternTopic[] {
  return standardResourceItems(tools, [], setting).map((item, index) => ({
    ...item, current: tools[index]?.description?.trim() || '(no description)',
  }));
}

/**
 * A tool the model has no words to choose by.
 *
 * This is the deterministic floor beneath `STD-TOL-ROUTING-DESCRIPTION`, which asks the harder
 * question of whether a description draws a *routing boundary*. The same split already exists as
 * INS-09 beneath INS-07 and SKL-15 beneath SKL-09: the model judges intent, code resolves what
 * the author did or did not write. The floor is what still answers when the workflow is down.
 */
export function buildStandardToolDescriptionPattern(data: ParsedBotData): LocalPattern {
  const tools = data.toolDetails ?? [];
  const counted = Math.max(data.toolCount, tools.length);
  const weak = tools.filter(hasWeakDescription);
  const gap = toolPopulationGap(data, tools, counted);
  const assessmentStatus: LocalPattern['assessmentStatus'] = gap && weak.length === 0
    ? 'not-assessed'
    : weak.length > 0
      ? 'fail'
      : counted === 0 ? 'not-applicable' : 'pass';
  return {
    patternId: 'local-pattern-12', patternName: 'Missing Tool Description',
    description: assessmentStatus === 'not-assessed'
      ? gap!
      : assessmentStatus === 'not-applicable'
        ? 'This agent has no tools, so there are no tool descriptions to read.'
        : weak.length > 0
          ? `${weak.length} of ${tools.length} tool(s) have no usable description: ${weak.map(toolLabel).join(', ')}.`
          : `All ${tools.length} tool(s) carry a description.`,
    recommendation: 'Give every tool a conversational description of what it does and when the agent should call it. The orchestrator reads the description to decide whether to select the tool.',
    status: assessmentStatus === 'pass',
    assessmentStatus,
    assessmentReason: assessmentStatus === 'not-assessed'
      ? 'A tool description cannot be read against a population this review could not resolve in full.'
      : assessmentStatus === 'not-applicable'
        ? 'No tools are configured on this agent.'
        : 'Authoring requirement: a tool description of at least two words.',
    topics: weak.map(toolLabel),
    affectedItems: weak.length > 0 ? withCurrentDescription(weak, 'Tool description') : [],
    category: 'Architecture', severity: getPatternSeverity('Missing Tool Description'),
    evidenceKind: 'configuration-fact',
  };
}

export const LOCAL_PATTERN_12_OPTIONS: CoreStandardOptions = {
  family: 'Tools', fieldPath: 'tools.description', build: buildStandardToolDescriptionPattern,
};

/**
 * Standard reads a different shape than the copilot harness, which is why this rule exists at
 * all rather than adding `'standard'` to `TOL-02`'s harness list. Two reasons, either sufficient:
 * the two harnesses run *different rule systems* — copilot executes `check(model)` over
 * `AgentsExperienceModel` while Standard scores off the `LocalPattern` a rule emits — and three
 * of the five `TOL-*` rules read fields a Standard snapshot never captures (`authMode`,
 * `connectionReference`, `connectorId`/`operationId`), so tagging them would fail or withhold on
 * every Standard tool. `TOL-02`'s predicate is the one that ports, and it is ported verbatim.
 */
export const LOCAL_PATTERN_12: Rule<ParsedBotData> = standardRule({
  id: 'local-pattern-12',
  title: 'Missing Tool Description',
  harnesses: ['standard'],
  pillar: 'tools',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'medium',
  tags: ['quality'],
  references: ['ms-tools-skills'],
  prose: {
    question: 'Does every tool describe, in words, what it does and when the agent should call it?',
    summary: 'Read each captured tool description and require at least two words.',
    why: 'The orchestrator selects a tool by reading its description. A tool with no description can only be reached by name, so the model either guesses or ignores it.',
    fix: 'Give each tool a conversational description of its purpose and the conditions under which the agent should select it.',
    passWhen: ['Every captured tool carries a description of two or more words.'],
    failWhen: ['A captured tool has no description, or one shorter than two words.'],
    notApplicableWhen: ['The agent has no tools.'],
  },
  evidence: { fieldPaths: ['tools.description'], populations: ['tools'] },
}, LOCAL_PATTERN_12_OPTIONS);

/**
 * Two tools the model cannot tell apart.
 *
 * Described separately from `local-pattern-12` because the maker action differs: a missing
 * description is filled in, whereas identical descriptions must be *differentiated*, and only
 * the author knows which tool owns which case. It is also the one half of the copilot `TOL-05`
 * duplicate-operation check that Standard holds the data for — Standard captures no
 * `connectorId`/`operationId`, but it does capture the text the model actually routes on.
 */
export function buildStandardToolDuplicateDescriptionPattern(data: ParsedBotData): LocalPattern {
  const tools = data.toolDetails ?? [];
  const counted = Math.max(data.toolCount, tools.length);
  const described = tools.filter(tool => describedWordCount(tool.description) >= 2);
  const collisions = duplicateDescriptionGroups(tools);
  const duplicated = collisions.flat();
  const gap = toolPopulationGap(data, tools, counted);
  const assessmentStatus: LocalPattern['assessmentStatus'] = gap && collisions.length === 0
    ? 'not-assessed'
    : collisions.length > 0
      ? 'fail'
      : counted === 0 || described.length < 2 ? 'not-applicable' : 'pass';
  return {
    patternId: 'local-pattern-13', patternName: 'Duplicate Tool Descriptions',
    description: assessmentStatus === 'not-assessed'
      ? gap!
      : collisions.length > 0
        ? `${duplicated.length} tool(s) share ${collisions.length} description(s) with another tool: ${duplicated.map(toolLabel).join(', ')}.`
        : assessmentStatus === 'not-applicable'
          ? counted === 0 ? 'This agent has no tools, so no two descriptions can collide.'
            : 'Fewer than two tools carry a description, so no two descriptions can collide.'
          : `All ${described.length} described tool(s) are described distinctly.`,
    recommendation: 'Rewrite the shared descriptions so each one names the case it handles and the cases it does not. Identical text leaves the orchestrator no basis to choose between the tools.',
    status: assessmentStatus === 'pass',
    assessmentStatus,
    assessmentReason: assessmentStatus === 'not-assessed'
      ? 'Tool descriptions cannot be compared against a population this review could not resolve in full.'
      : assessmentStatus === 'not-applicable'
        ? counted === 0 ? 'No tools are configured on this agent.' : 'Fewer than two tools carry a usable description.'
        : 'Authoring requirement: no two tools share the same description.',
    topics: duplicated.map(toolLabel),
    affectedItems: duplicated.length > 0 ? withCurrentDescription(duplicated, 'Tool description') : [],
    category: 'Architecture', severity: getPatternSeverity('Duplicate Tool Descriptions'),
    evidenceKind: 'configuration-fact',
  };
}

export const LOCAL_PATTERN_13_OPTIONS: CoreStandardOptions = {
  family: 'Tools', fieldPath: 'tools.description', build: buildStandardToolDuplicateDescriptionPattern,
};

export const LOCAL_PATTERN_13: Rule<ParsedBotData> = standardRule({
  id: 'local-pattern-13',
  title: 'Duplicate Tool Descriptions',
  harnesses: ['standard'],
  pillar: 'tools',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'medium',
  tags: ['quality'],
  references: ['ms-tools-skills'],
  prose: {
    question: 'Is every tool described distinctly enough for the model to choose between them?',
    summary: 'Compare captured tool descriptions, ignoring case and spacing, and report any shared text.',
    why: 'Two tools with the same description give the orchestrator no basis to prefer one, so selection becomes arbitrary and the wrong tool can be called.',
    fix: 'Rewrite the shared descriptions so each names the case it handles and the cases it does not.',
    passWhen: ['No two tools share a description.'],
    failWhen: ['Two or more tools carry the same description, ignoring case and spacing.'],
    notApplicableWhen: ['Fewer than two tools carry a usable description.'],
  },
  evidence: { fieldPaths: ['tools.description'], populations: ['tools'] },
}, LOCAL_PATTERN_13_OPTIONS);

export const standardToolCoreRules: readonly Rule<ParsedBotData>[] = [
  LOCAL_PATTERN_7, LOCAL_PATTERN_12, LOCAL_PATTERN_13,
];
