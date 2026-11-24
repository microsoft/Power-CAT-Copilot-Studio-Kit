/**
 * CON-03 and CON-04 now live in `review-core/rules/connected-agents.rules.ts`.
 *
 * This file is the ART publication point for them: it takes each rule as declared
 * once and hands it to the Copilot machinery that owns availability cascades,
 * evidence synthesis and finding verification. Nothing about what either rule
 * decides is restated here.
 *
 * The standard-harness child-agent patterns are a different family
 * (`Orchestration`, `local-pattern-9`/`-10`) and now live, with the
 * `buildStandardChildPatterns` builder they share, in
 * `review-core/rules/standard-connected.rules.ts`. They are published here the
 * same way: declared once, handed to the Standard machinery unchanged.
 */
import { CON_03, CON_04 } from '../../../review-core/rules/connected-agents.rules';
import {
  LOCAL_PATTERN_9, LOCAL_PATTERN_9_OPTIONS, LOCAL_PATTERN_10, LOCAL_PATTERN_10_OPTIONS,
} from '../../../review-core/rules/standard-connected.rules';
import { defineCoreCopilotRule } from './copilotRuleDefinition';
import { defineCoreStandardRule } from './standardRuleDefinition';

const FAMILY = 'Connected agents';

export const standardConnectedAgentRules = [
  defineCoreStandardRule(LOCAL_PATTERN_9, LOCAL_PATTERN_9_OPTIONS),
  defineCoreStandardRule(LOCAL_PATTERN_10, LOCAL_PATTERN_10_OPTIONS),
];

// CON-01/CON-02 (env bot existence + publish state) require the environment bot
// list and run in the orchestrator (Task 10), not in this pure engine.
const registered = [
  defineCoreCopilotRule(CON_03, { family: FAMILY, optionalPopulation: 'connectedAgents' }),
  defineCoreCopilotRule(CON_04, { family: FAMILY, kind: 'record', optionalPopulation: 'connectedAgents' }),
];

export const connectedAgentRules = registered.map(rule => rule.legacy);
export const unifiedConnectedAgentRules = registered.map(rule => rule.unified);
