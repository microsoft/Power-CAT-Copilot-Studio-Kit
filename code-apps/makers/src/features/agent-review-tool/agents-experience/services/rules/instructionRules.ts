/**
 * INS-01 and INS-08 now live in `review-core/rules/instructions.rules.ts`.
 *
 * This file is the ART publication point: it takes each rule as declared once
 * and hands it to the Copilot machinery that owns availability, evidence
 * synthesis and finding verification. Nothing about what a rule decides is
 * restated here.
 *
 * INS-07 is deliberately absent. It declares `execution: 'ai'`, so it has no
 * deterministic check to publish and the `copilot-instructions` node decides it
 * instead. Re-adding it here would throw at module load, which is the registry
 * invariant doing its job rather than a gap. INS-09 carries the mechanical half
 * of the detector INS-07 used to own, so it *is* published here.
 *
 * All three quote the instruction text itself rather than the evidence ART would
 * synthesize from the finding - the finding states a length or a list of
 * unmatched names, but what a reviewer needs to read is the text that produced
 * it. `UnifiedEvidence` is an ART contract that `review-core` deliberately does
 * not model, so those quotes are supplied below, at the boundary that owns the
 * contract, through the shared adapter's `evidence` hook.
 */
import { INS_01, INS_08, INS_09 } from '../../../review-core/rules/instructions.rules';
import { defineCoreCopilotRule } from './copilotRuleDefinition';

const FAMILY = 'Instructions';
const INSTRUCTION_FIELD = 'agentSettings.instructions';

const registered = [
  defineCoreCopilotRule(INS_01, {
    family: FAMILY,
    evidence: model => [{
      fieldPath: INSTRUCTION_FIELD, status: 'verified', quote: model.agentSettings.instructions,
    }],
  }),
  defineCoreCopilotRule(INS_08, {
    family: FAMILY,
    evidence: model => [{
      fieldPath: INSTRUCTION_FIELD, status: 'verified', quote: model.agentSettings.instructions,
    }],
  }),
  defineCoreCopilotRule(INS_09, {
    family: FAMILY,
    evidence: model => [{
      fieldPath: INSTRUCTION_FIELD, status: 'verified', quote: model.agentSettings.instructions,
    }],
  }),
];

export const instructionRules = registered.map(rule => rule.legacy);
export const unifiedInstructionRules = registered.map(rule => rule.unified);
