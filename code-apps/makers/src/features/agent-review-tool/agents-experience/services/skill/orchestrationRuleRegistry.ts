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
 * fields. Optional validated narrative supplies display advice, not verdicts or identity.
 *
 * That copy is no longer authored here. The six XSK rules are unified `Rule`s in
 * {@link ../../../review-core/rules/cross-skill.rules}, and this module is the
 * adapter that projects them back into the legacy definition shape, so each rule
 * is written exactly once. Only `type` and `confidence`, which the unified model
 * does not carry, are still declared below.
 */
import type { CopilotAiNarrative, SkillFindingSeverity } from "../../contracts/Findings";
import type { ReferenceId } from "../../contracts/references";
import type {
  CrossSkillOrchestrationFinding,
  OrchestrationIssueType,
} from "../../contracts/SkillEvaluation";
import { crossSkillRules } from "../../../review-core/rules/cross-skill.rules";
import type { Severity } from "../../../review-core/severity";
import { readCopilotAiNarrative } from "../copilotAiNarrative";

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

/**
 * The two legacy facets the unified `Rule` deliberately does not model.
 *
 * `type` is this family's own taxonomy of orchestration defects, which the P2-O
 * validator reads to decide which findings are pairwise, and `confidence` was a
 * hand-set per-rule hedge. Neither has a home on `Rule`, so they are the only
 * per-rule data this file still authors; everything else is derived from
 * {@link crossSkillRules}.
 */
const LEGACY_FACETS: Record<
  string,
  { type: OrchestrationIssueType; confidence: OrchestrationRuleDefinition["confidence"] }
> = {
  "XSK-01": { type: "overlap", confidence: "medium" },
  "XSK-02": { type: "redundancy", confidence: "medium" },
  "XSK-03": { type: "contradiction", confidence: "medium" },
  "XSK-04": { type: "coverage-gap", confidence: "low" },
  "XSK-05": { type: "coupling", confidence: "low" },
  "XSK-06": { type: "consistency", confidence: "medium" },
};

/**
 * Unified severity, back into the spelling this registry has always published.
 *
 * Deliberately not {@link SEVERITY_TO_LEGACY}: that maps the `error | warning |
 * info` vocabulary, whereas the orchestration findings have always written the
 * bottom of the scale as `low`. XSK-06 is the only rule this moves.
 */
const LEGACY_SEVERITY: Record<Severity, SkillFindingSeverity> = {
  high: "high",
  medium: "medium",
  info: "low",
};

/**
 * Derived once at module load, in `crossSkillRules` order, so every definition
 * keeps the stable object and array identity callers had when these were
 * literals — `createOrchestrationFinding` hands `fixSteps` and `referenceIds`
 * straight to the finding.
 */
const ORCHESTRATION_REGISTRY: Record<string, OrchestrationRuleDefinition> =
  Object.fromEntries(
    crossSkillRules.map((rule): [string, OrchestrationRuleDefinition] => {
      const facets = LEGACY_FACETS[rule.id];
      if (!facets) {
        throw new Error(
          `Cross-skill rule "${rule.id}" has no legacy orchestration facets (type, confidence).`,
        );
      }
      return [
        rule.id,
        {
          ruleId: rule.id,
          type: facets.type,
          title: rule.title,
          why: rule.prose.why,
          recommendation: rule.prose.fix,
          fixSteps: (rule.prose.fixSteps ?? []).map((action, index) => ({
            order: index + 1,
            action,
          })),
          referenceIds: [...rule.references] as ReferenceId[],
          severity: LEGACY_SEVERITY[rule.severity],
          confidence: facets.confidence,
        },
      ];
    }),
  );

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
 * Canonical titles, verdicts, steps, and reference IDs remain registry-owned.
 * AI narrative is optional display metadata and cannot replace those fields.
 *
 * @param ruleId - Registered orchestration rule identifier.
 * @param opts.skills - Skills involved in the finding (>= 1).
 * @param opts.evidence - Pre-sanitized evidence snippet shown in the UI.
 * @param opts.severity - Optional severity override; falls back to the rule default.
 * @param opts.narrative - Optional URL-free advice from the original AI stage.
 * @throws {Error} when `ruleId` is not registered.
 */
export function createOrchestrationFinding(
  ruleId: string,
  opts: {
    skills: string[];
    evidence: string;
    severity?: SkillFindingSeverity;
    narrative?: CopilotAiNarrative;
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
    ...readCopilotAiNarrative(opts.narrative),
  };
}
