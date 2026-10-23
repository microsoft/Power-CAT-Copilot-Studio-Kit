/**
 * Central rule registry for agent-level cross-skill orchestration findings
 * (Spec 013 P2-O). These are set-level checks whose unit of analysis is the
 * whole skill set (overlap, redundancy, contradiction, coverage gaps, coupling,
 * consistency) rather than a single skill, so they are surfaced in the dedicated
 * orchestration section instead of one of the four per-skill rubric dimensions.
 *
 * As with {@link ./skillRuleRegistry}, the registry is the single source of
 * truth for titles, why-explanations, ordered fix steps, and approved reference
 * IDs. The P2-O validator merges AI-supplied evidence with these deterministic
 * fields so all client-visible copy is grounded here, never in raw model output.
 */
import type { SkillFindingSeverity } from "../../contracts/Findings.js";
import type { ReferenceId } from "../../contracts/references.js";
import type {
  CrossSkillOrchestrationFinding,
  OrchestrationIssueType,
} from "../../contracts/SkillEvaluation.js";

/** Typed definition for a single cross-skill orchestration rule. */
export interface OrchestrationRuleDefinition {
  ruleId: string;
  type: OrchestrationIssueType;
  title: string;
  why: string;
  recommendation: string;
  /** Ordered steps; first element is always { order: 1, action: "..." }. */
  fixSteps: Array<{ order: number; action: string }>;
  /** Approved reference IDs for this rule. First element is the primary compat ID. */
  referenceIds: ReferenceId[];
  severity: SkillFindingSeverity;
  confidence: "high" | "medium" | "low";
}

const ORCHESTRATION_REGISTRY: Record<string, OrchestrationRuleDefinition> = {
  "XSK-01": {
    ruleId: "XSK-01",
    type: "overlap",
    title: "Overlapping Skill Triggers",
    why: "Two or more skills describe near-identical trigger conditions, so the agent cannot reliably choose between them and routing becomes ambiguous.",
    recommendation:
      "Differentiate the skill descriptions so each states a distinct, non-overlapping trigger, or merge the skills if they serve the same purpose.",
    fixSteps: [
      {
        order: 1,
        action:
          "Compare the overlapping skill descriptions and identify the shared trigger phrasing.",
      },
      {
        order: 2,
        action:
          "Rewrite each description to name a distinct scope, or consolidate into a single skill.",
      },
      {
        order: 3,
        action: "Re-run the review to confirm the routing ambiguity is resolved.",
      },
    ],
    referenceIds: ["ms-skills-overview", "ms-tools-skills"],
    severity: "high",
    confidence: "medium",
  },

  "XSK-02": {
    ruleId: "XSK-02",
    type: "redundancy",
    title: "Redundant Skills",
    why: "Multiple skills provide the same capability, inflating the skill set, wasting context budget, and confusing routing without adding coverage.",
    recommendation:
      "Remove or merge the redundant skills so each capability is represented once.",
    fixSteps: [
      { order: 1, action: "Confirm the skills deliver the same capability with no unique value." },
      { order: 2, action: "Keep the strongest skill and remove the duplicates." },
    ],
    referenceIds: ["ms-skills-overview"],
    severity: "medium",
    confidence: "medium",
  },

  "XSK-03": {
    ruleId: "XSK-03",
    type: "contradiction",
    title: "Contradictory Skill Guidance",
    why: "Two skills give conflicting instructions for the same situation, so the agent's behaviour depends on which skill is selected and becomes inconsistent.",
    recommendation:
      "Reconcile the conflicting guidance so the skill set gives one consistent instruction per situation.",
    fixSteps: [
      { order: 1, action: "Identify the specific conflicting instructions across the two skills." },
      {
        order: 2,
        action: "Decide the correct guidance and update both skills to agree.",
      },
    ],
    referenceIds: ["ms-authoring-instructions"],
    severity: "high",
    confidence: "medium",
  },

  "XSK-04": {
    ruleId: "XSK-04",
    type: "coverage-gap",
    title: "Capability Coverage Gap",
    why: "The agent's stated purpose implies a capability that no skill covers, so requests in that area will fail or fall back to generic behaviour.",
    recommendation:
      "Add a skill (or extend an existing one) to cover the missing capability implied by the agent's instructions.",
    fixSteps: [
      {
        order: 1,
        action: "Confirm the agent instructions imply a capability with no matching skill.",
      },
      { order: 2, action: "Author a skill that covers the gap, or note it as out of scope." },
    ],
    referenceIds: ["ms-skills-overview"],
    severity: "medium",
    confidence: "low",
  },

  "XSK-05": {
    ruleId: "XSK-05",
    type: "coupling",
    title: "Tight Skill Coupling",
    why: "A skill depends on the side effects or output of another skill, so it cannot run in isolation and the set is fragile to reordering or removal.",
    recommendation:
      "Make each skill self-contained, or express the dependency explicitly so the orchestration is predictable.",
    fixSteps: [
      { order: 1, action: "Identify the implicit dependency between the coupled skills." },
      {
        order: 2,
        action:
          "Refactor so the dependent skill declares its inputs rather than relying on another skill having run first.",
      },
    ],
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
    referenceIds: ["ms-skills-overview", "ms-skills-create"],
    severity: "medium",
    confidence: "low",
  },

  "XSK-06": {
    ruleId: "XSK-06",
    type: "consistency",
    title: "Inconsistent Skill Conventions",
    why: "Skills in the same set use inconsistent naming, formatting, or instruction conventions, which makes the set harder to maintain and reason about.",
    recommendation:
      "Apply a single consistent convention for skill naming, structure, and instruction style across the set.",
    fixSteps: [
      { order: 1, action: "Catalogue the inconsistent conventions across the skills." },
      { order: 2, action: "Choose one convention and update every skill to match." },
    ],
    referenceIds: ["ms-authoring-instructions"],
    severity: "low",
    confidence: "medium",
  },
};

/**
 * Look up a registered orchestration rule definition by its ID.
 *
 * @param ruleId - The rule identifier (e.g. "XSK-01").
 * @returns The rule definition, or undefined if not registered.
 */
export function getOrchestrationRule(
  ruleId: string,
): OrchestrationRuleDefinition | undefined {
  return ORCHESTRATION_REGISTRY[ruleId];
}

/** All registered orchestration rule IDs (e.g. for prompt scaffolding/tests). */
export function orchestrationRuleIds(): string[] {
  return Object.keys(ORCHESTRATION_REGISTRY);
}

/**
 * Validate that every supplied candidate reference ID belongs to the approved
 * set for the given orchestration rule.
 *
 * @param ruleId - Rule whose approved references are checked against.
 * @param candidateIds - Reference IDs to validate.
 * @returns `true` when all candidates are approved; `false` otherwise (including unknown rule).
 */
export function validateOrchestrationRuleReferences(
  ruleId: string,
  candidateIds: string[],
): boolean {
  const rule = ORCHESTRATION_REGISTRY[ruleId];
  if (!rule) return false;
  const approved = new Set<string>(rule.referenceIds);
  return candidateIds.every((id) => approved.has(id));
}

/**
 * Construct a fully-typed {@link CrossSkillOrchestrationFinding} by merging the
 * caller's evidence with all deterministic fields sourced from the registry.
 * Every displayed orchestration finding must be created through this factory so
 * titles, why-text, ordered fix steps, and reference IDs always come from here.
 *
 * @param ruleId - Registered orchestration rule identifier.
 * @param opts.skills - Skills involved in the finding (>= 1).
 * @param opts.evidence - Pre-sanitized evidence snippet shown in the UI.
 * @param opts.severity - Optional severity override; falls back to the rule default.
 * @throws {Error} when `ruleId` is not registered.
 */
export function createOrchestrationFinding(
  ruleId: string,
  opts: {
    skills: string[];
    evidence: string;
    severity?: SkillFindingSeverity;
  },
): CrossSkillOrchestrationFinding {
  const rule = ORCHESTRATION_REGISTRY[ruleId];
  if (!rule) {
    throw new Error(
      `Orchestration rule "${ruleId}" is not registered in the orchestration rule registry.`,
    );
  }
  const skillKey = opts.skills.length > 0 ? opts.skills.join("+") : "set";
  return {
    id: `${ruleId}:${skillKey}`,
    ruleId,
    type: rule.type,
    severity: opts.severity ?? rule.severity,
    title: rule.title,
    skills: opts.skills,
    evidence: opts.evidence,
    rationale: rule.why,
    recommendation: rule.recommendation,
    fixSteps: rule.fixSteps,
    referenceIds: rule.referenceIds,
    confidence: rule.confidence,
  };
}
