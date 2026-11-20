/**
 * The Knowledge family now lives in `review-core/rules/knowledge.rules.ts`.
 *
 * This file is the ART publication point: it takes each rule as declared once
 * and hands it to the Copilot machinery that owns availability, evidence
 * synthesis and finding verification. Nothing about what a rule decides is
 * restated here.
 *
 * KNW-02 quotes narrower evidence than ART would synthesize from the finding:
 * it quotes the instruction text. `UnifiedEvidence` is an ART contract that
 * `review-core` deliberately does not model, so that quote is supplied below,
 * at the boundary that owns the contract, through the shared adapter's
 * `evidence` hook. KNW-03 needs no hook: each of its rows carries its own
 * subject reference. The WIQ rows carry their own subject references too.
 */
import {
  KNW_01, KNW_02, KNW_03, KNW_04, WIQ_01, WIQ_02, WIQ_03, WIQ_04,
} from '../../../review-core/rules/knowledge.rules';
import { defineCoreCopilotRule } from './copilotRuleDefinition';

const FAMILY = 'Knowledge';

const registered = [
  defineCoreCopilotRule(KNW_01, { family: FAMILY, kind: 'record' }),
  defineCoreCopilotRule(KNW_02, {
    family: FAMILY,
    evidence: model => [{
      fieldPath: 'agentSettings.instructions', status: 'verified', quote: model.agentSettings.instructions,
      reason: 'The knowledge promise is compared with captured knowledge-source and web-search configuration.',
    }],
  }),
  // No optionalPopulation: an agent with no tools can pass on a Work IQ capability.
  defineCoreCopilotRule(KNW_03, { family: FAMILY }),
  defineCoreCopilotRule(KNW_04, { family: FAMILY, kind: 'record' }),
  // No optionalPopulation: `iqCapabilities` is optional, so each WIQ rule gives
  // its own not-applicable reason.
  defineCoreCopilotRule(WIQ_01, { family: FAMILY, kind: 'record' }),
  defineCoreCopilotRule(WIQ_02, { family: FAMILY, kind: 'record' }),
  defineCoreCopilotRule(WIQ_03, { family: FAMILY, kind: 'record' }),
  defineCoreCopilotRule(WIQ_04, { family: FAMILY }),
];

export const knowledgeRules = registered.map(rule => rule.legacy);
export const unifiedKnowledgeRules = registered.map(rule => rule.unified);
