/**
 * Pure payload builder for the cross-skill orchestration AI Builder prompt.
 *
 * The builder returns a Record<string, string> matching the exact AI Builder
 * Text input variable names. Values are plain strings (raw text or JSON).
 */
import type { SkillBundle } from "../../contracts/SkillBundle.js";
import {
  getOrchestrationRule,
  orchestrationRuleIds,
} from "./orchestrationRuleRegistry.js";

// ---------------------------------------------------------------------------
// P2-O: Cross-skill orchestration payload (agent-level, 1 call per review)
// ---------------------------------------------------------------------------

/** Max chars of each skill's markdown included in the orchestration context. */
export const ORCHESTRATION_SKILL_EXCERPT_CHARS = 2_000;
/** Overall char ceiling for the serialised skills array. */
export const ORCHESTRATION_SKILLS_TOTAL_CHARS = 48_000;

export interface OrchestrationPromptPayload {
  agent_instructions: string;
  skills_json: string;
  orchestration_rules_json: string;
}

/** Compact per-skill view supplied to the orchestration prompt. */
interface OrchestrationSkillContext {
  name: string;
  description: string;
  instructionsExcerpt: string;
  truncated: boolean;
}

/**
 * Builds the P2-O (Cross-Skill Orchestration Evaluator) AI Builder input
 * payload. Unlike the per-skill builders, this consumes the WHOLE skill set so
 * the model can reason about overlap, coverage gaps, coupling, and consistency.
 *
 * Each skill contributes a name, description, and a char-budgeted instruction
 * excerpt. The registered orchestration rule catalog (ids + types + titles) is
 * included so the model only emits findings against known XSK rules.
 *
 * @param bundles - Every assembled skill bundle in the review.
 * @param agentInstructions - The agent's overall instructions (falls back to the first bundle's).
 */
export function buildOrchestrationPromptInput(
  bundles: SkillBundle[],
  agentInstructions?: string,
): OrchestrationPromptPayload {
  const perSkillCap = ORCHESTRATION_SKILL_EXCERPT_CHARS;
  let remaining = ORCHESTRATION_SKILLS_TOTAL_CHARS;

  const skills: OrchestrationSkillContext[] = bundles.map((bundle) => {
    const description =
      bundle.parentDescription ??
      bundle.siblingDescriptions.find((s) => s.name === bundle.skillName)?.description ??
      "";
    const cap = Math.max(0, Math.min(perSkillCap, remaining));
    const full = bundle.skillMarkdown ?? "";
    const excerpt = full.slice(0, cap);
    remaining -= excerpt.length;
    return {
      name: bundle.skillName,
      description,
      instructionsExcerpt: excerpt,
      truncated: excerpt.length < full.length,
    };
  });

  const rulesCatalog = orchestrationRuleIds().map((ruleId) => {
    const rule = getOrchestrationRule(ruleId)!;
    return { ruleId: rule.ruleId, type: rule.type, title: rule.title };
  });

  const resolvedInstructions =
    agentInstructions ?? bundles[0]?.agentInstructions ?? "";

  return {
    agent_instructions: resolvedInstructions,
    skills_json: JSON.stringify(skills),
    orchestration_rules_json: JSON.stringify(rulesCatalog),
  };
}
