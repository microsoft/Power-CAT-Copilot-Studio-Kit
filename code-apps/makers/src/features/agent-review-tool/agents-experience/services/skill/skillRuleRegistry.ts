/**
 * Central rule registry for deterministic skill-resource findings (Task-4).
 *
 * Every rule that a scanner emits MUST be registered here. The registry is the
 * single source of truth for titles, why-explanations, ordered fix steps, and
 * approved reference IDs. Scanners call {@link createRegisteredFinding} so that
 * all client-visible content comes from this file — never from raw source bytes.
 */
import type { GroundedSkillFinding, SkillFindingSeverity, SkillRubricDimension } from "../../contracts/Findings";
import type { ReferenceId } from "../../contracts/references";
import type { SkillRuleDefinition } from "../../../review-core/rules/skill-scanner.rules";
import { allSkillScannerDefinitions } from "../../../review-core/rules/skill-scanner.all";
import type { Severity } from "../../../review-core/severity";
import { INS_07 } from "../../../review-core/rules/instructions.rules";
import { skillAiRules } from "../../../review-core/rules/skill-ai.rules";

/**
 * How a declared severity reads in this registry's vocabulary.
 *
 * Mirrors `orchestrationRuleRegistry`, which maps the same three values the
 * same way, because both publish into the skill finding shape.
 */
const LEGACY_SEVERITY: Record<Severity, SkillFindingSeverity> = {
  high: "high",
  medium: "medium",
  info: "low",
};

/**
 * Typed definition for a single deterministic scanner rule.
 *
 * Declared in `review-core/rules/skill-scanner.rules.ts` and re-exported here so
 * the import direction stays one-way — rules do not import the registry — while
 * every existing consumer of this name keeps resolving it from this module.
 */
export type { SkillRuleDefinition };

/**
 * Legacy rubric dimension for an AI skill rule, keyed by its standalone-skill pillar.
 *
 * The two vocabularies are deliberately different (D-2): `Rule.pillar` is the
 * six-pillar scoring axis, `dimension` is the four-card grouping axis this older
 * shape needs. Only the mapping lives here -- no rule text is restated.
 */
const AI_SKILL_DIMENSION: Record<string, SkillRuleDefinition["dimension"]> = {
  "safety-evidence": "safety",
  "instruction-quality": "quality",
  "trigger-clarity": "quality",
  "task-focus": "quality",
};

/**
 * Cited when an AI rule declares no reference of its own.
 *
 * Every entry in this registry must cite at least one source that resolves in
 * the reference catalogue, and the `SKL-AI-*` rules all declare `references: []`
 * because the node prompt is forbidden from emitting URLs. The skill-authoring
 * doc is the correct general source for all of them.
 */
const AI_SKILL_FALLBACK_REFERENCES = ["ms-skills-create"];

/**
 * Projects one `SKL-AI-*` rule into the legacy definition shape.
 *
 * Derived, not restated -- the same contract as `INS-07` below. Every
 * maker-facing string comes from the rule's own declaration in
 * `review-core/rules/skill-ai.rules.ts`; only the three legacy facets `Rule`
 * does not carry (confidence, family, dimension) are supplied here.
 */
function toLegacyAiDefinition(
  rule: (typeof skillAiRules)[number],
): SkillRuleDefinition {
  const standalonePillar =
    typeof rule.pillar === "string"
      ? rule.pillar
      : rule.pillar?.["standalone-skill"];
  const fixSteps = rule.prose.fixSteps ?? [rule.prose.fix];
  return {
    ruleId: rule.id,
    title: rule.prose.failTitle ?? rule.title,
    why: rule.prose.why,
    recommendation: rule.prose.fix,
    fixSteps: fixSteps.map((action, index) => ({ order: index + 1, action })),
    referenceIds: (rule.references.length
      ? [...rule.references]
      : AI_SKILL_FALLBACK_REFERENCES) as ReferenceId[],
    severity: LEGACY_SEVERITY[rule.severity],
    confidence: "medium",
    family: "Skills",
    dimension: AI_SKILL_DIMENSION[standalonePillar ?? ""] ?? "quality",
  };
}

/**
 * The `SKL-AI-*` rules, projected into this registry.
 *
 * `review-core/registry.ts` has registered `skillAiRules` since the rule split,
 * which is why `ruleById` resolves these ids -- but this registry never did, and
 * `getRule` is what the AI stage validates against. The result was silent: a
 * fully grounded per-skill finding was dropped on the way to the UI with no log,
 * no counter and no error, exactly as the SKL-09 note below warns. Registering
 * them here closes that gap.
 *
 * `SKL-10` is excluded because it is declared explicitly below with
 * hand-authored remediation steps that the projection would overwrite.
 */
const skillAiDefinitions: Record<string, SkillRuleDefinition> =
  Object.fromEntries(
    skillAiRules
      .filter((rule) => rule.id.startsWith("SKL-AI-"))
      .map((rule) => [rule.id, toLegacyAiDefinition(rule)] as const),
  );

/**
 * Every rule the review engine can raise.
 *
 * Exported so tests can assert invariants across the whole set — that each rule
 * cites at least one source, and that every source resolves in the reference
 * catalogue. Read through `getRule` in application code.
 */
export const RULE_REGISTRY: Record<string, SkillRuleDefinition> = {
  // ── Scanner rules ────────────────────────────────────────────────────────
  //
  // Every Python, HTML and Markdown scanner rule is declared once in
  // `review-core/rules/skill-scanner-*.rules.ts` and projected into this shape
  // by `skill-scanner.all.ts`. A rule appears in exactly one of the two places,
  // never both. Spread first because the scanner rules are the first published
  // keys and this keeps them in their original order.
  ...allSkillScannerDefinitions,

  // AI-only skill rules, projected from their single declaration above. Spread
  // before the explicit entries so a hand-authored definition always wins.
  ...skillAiDefinitions,

  // ── Agent-level composition rules (AI-emitted) ───────────────────────────
  //
  // These have no scanner. They are registered so the AI stage can cite them:
  // `validateSingleFinding` resolves every ruleId against this registry, so an
  // unregistered id means the finding is dropped no matter how well evidenced.
  //
  // SKL-09 and INS-07 also exist as deterministic rules in `services/rules/`,
  // but those are deliberately conservative — SKL-09 only fires when a skill
  // references at least one capability that *does* exist, to avoid mistaking
  // prose for a tool name, and INS-07 needs the literal form "use X tool". A
  // skill whose referenced tools are *all* missing therefore passes the scanner
  // silently. Observed in production (job 969ddf01, 2026-07-29): the agent
  // identified exactly that case, quoted the evidence and scored Actionability
  // 25/100, but could emit no finding.
  //
  // INS-07 is registered for the agent-level stage only. The per-component
  // stage must not emit it: every component receives the same
  // `agent_instructions`, so it would report one duplicate per skill.

  "SKL-09": {
    ruleId: "SKL-09",
    title: "Skill References a Capability the Agent Does Not Have",
    why: "A skill step that invokes a tool, knowledge source, or connected agent missing from the agent's configuration cannot execute. The step fails at runtime, or the model silently improvises an answer instead.",
    recommendation:
      "Add the referenced capability to the agent, or rewrite the step to use a capability the agent actually has.",
    fixSteps: [
      {
        order: 1,
        action:
          "Compare each capability named in the skill against the agent's configured tools, knowledge sources, and connected agents.",
      },
      {
        order: 2,
        action:
          "For each name with no match, either add that capability to the agent or remove the reference from the skill.",
      },
      {
        order: 3,
        action:
          "Where the step is essential, state the fallback behaviour explicitly so the model does not invent one.",
      },
    ],
    referenceIds: ["ms-tools-skills", "ms-skills-create"],
    severity: "high",
    confidence: "medium",
    family: "Skills",
    dimension: "readiness",
  },

  "INS-07": {
    // Derived, not restated. Every maker-facing string comes from the rule's
    // own declaration in `review-core/rules/instructions.rules.ts`; only the
    // three legacy facets this shape needs and `Rule` does not carry
    // — confidence, family, dimension — are stated here.
    ruleId: INS_07.id,
    title: INS_07.prose.failTitle ?? INS_07.title,
    why: INS_07.prose.why,
    recommendation: INS_07.prose.fix,
    fixSteps: (INS_07.prose.fixSteps ?? []).map((action, index) => ({
      order: index + 1,
      action,
    })),
    referenceIds: [...INS_07.references] as ReferenceId[],
    severity: LEGACY_SEVERITY[INS_07.severity],
    confidence: "medium",
    family: "Instructions",
    dimension: "readiness",
  },
  "SKL-10": {
    ruleId: "SKL-10",
    title: "Skill Step Contradicts Its Own Bundled Resource",
    why: "When a skill's instructions and its bundled policy or reference file disagree, behaviour depends on which the model weights more heavily — so it is unpredictable and cannot be tested reliably.",
    recommendation:
      "Make the skill and its resources agree, and keep each rule stated in exactly one place.",
    fixSteps: [
      {
        order: 1,
        action:
          "Identify the two statements that conflict and decide which one is correct.",
      },
      {
        order: 2,
        action:
          "Correct the wrong one, then remove the duplicate so the rule is stated once.",
      },
      {
        order: 3,
        action:
          "Where both must remain, have the skill reference the resource rather than restating its content.",
      },
    ],
    referenceIds: ["ms-skills-create", "ms-skills-overview"],
    severity: "medium",
    confidence: "medium",
    family: "Skills",
    dimension: "quality",
  },

  // ── Uploaded-artifact rules (spec 018) ───────────────────────────────────
  // These run against a skill or Scout automation a user uploads, rather than
  // against a component read from Dataverse. They are registered here, with
  // every other rule, so an uploaded artifact and an authored skill are judged
  // by one set of definitions rather than two that drift apart.
  //
  // All but two of them now live in `review-core/rules/skill-*.rules.ts` and
  // arrive through the `...allSkillScannerDefinitions` spread above. The two
  // below stayed behind for one reason: neither has a detector. Both are listed
  // in `RETIRED_UNPROVABLE_RULES` (`artifactAiStageCore.ts`), so nothing ever
  // evaluates them and no finding is ever raised for either. Migrating them
  // would have meant generating a `check`, and a generated check over an empty
  // population returns `pass` — which would hand each of them full credit for a
  // question that was never asked. Leaving them as data keeps them visible to
  // `getRule` and to the citation tests without letting them reach a scorer.
  // Phase 3 decides whether they get a detector or are retired outright.

  "PKG-ORPHAN": {
    ruleId: "PKG-ORPHAN",
    title: "Bundled File Is Never Referenced",
    why: "A file the skill never mentions is still shipped, still read by anyone reviewing the bundle, and still part of the trust surface — while contributing nothing to behaviour.",
    recommendation: "Reference the file from SKILL.md, or remove it.",
    fixSteps: [
      { order: 1, action: "Decide whether the skill actually needs the file." },
      { order: 2, action: "If it does, reference it explicitly from SKILL.md so the model knows when to read it." },
      { order: 3, action: "If it does not, delete it from the bundle." },
    ],
    referenceIds: ["ms-skill-design-checklist"],
    severity: "low",
    confidence: "medium",
    family: "Packaging",
    dimension: "integrity",
  },

  "SHP-HEADINGS": {
    ruleId: "SHP-HEADINGS",
    title: "Skill Body Has No Section Headings",
    why: "Agent Skills guidance recommends structured sections so the agent can locate the part of the instructions relevant to the current task.",
    recommendation: "Add headings that separate the skill's phases.",
    fixSteps: [
      { order: 1, action: "Split the body into sections such as when to use, steps, and edge cases." },
      { order: 2, action: "Give each section a second-level markdown heading." },
    ],
    referenceIds: ["agent-skills-spec", "ms-skill-authoring-rubric"],
    severity: "low",
    confidence: "medium",
    family: "Skills",
    dimension: "quality",
  },
};

/**
 * Look up a registered rule definition by its ID.
 *
 * @param ruleId - The rule identifier (e.g. "SCR-CMD-01").
 * @returns The rule definition, or undefined if not registered.
 */
export function getRule(ruleId: string): SkillRuleDefinition | undefined {
  return RULE_REGISTRY[ruleId];
}

/**
 * Resolve the rubric dimension for any skill finding, from any source.
 *
 * Registered rules are authoritative (their `dimension` field wins). Findings
 * built outside the registry (L0 authoring rules, bundle-integrity BND-xx, and
 * inline SKL-xx findings) are mapped by their rule-ID prefix so grouped display
 * always has a dimension. Cross-skill findings (SKL-06) are agent-level and are
 * surfaced through the orchestration section, not a per-finding dimension; they
 * still resolve to "integrity" here as a safe default when shown as a finding.
 *
 * @param ruleId - The finding's rule identifier (e.g. "BND-01", "SKL-05").
 * @returns The rubric dimension the finding rolls up into.
 */
export function dimensionForRuleId(ruleId: string): SkillRubricDimension {
  const registered = RULE_REGISTRY[ruleId];
  if (registered) return registered.dimension;

  // Bundle integrity: referenced/missing/unreferenced/progressive-disclosure.
  if (ruleId.startsWith("BND-")) return "integrity";

  // Skill-level findings by number.
  if (ruleId.startsWith("SKL-")) {
    // SKL-05 injection scan is a safety concern.
    if (ruleId === "SKL-05") return "safety";
    // SKL-06 cross-skill conflict is agent-level; default to integrity when shown flat.
    if (ruleId === "SKL-06") return "integrity";
    // SKL-10 insufficient-guardrails and SKL-08 skill-to-skill coupling are safety/integrity.
    if (ruleId === "SKL-10") return "safety";
    if (ruleId === "SKL-08" || ruleId === "SKL-09") return "integrity";
    // SKL-14 (no evals/examples) is an operational-readiness signal.
    if (ruleId === "SKL-14") return "readiness";
    // SKL-01/02/03 (frontmatter/description), SKL-07 (structure/size), and the
    // authoring lints SKL-04/11/12/13 (steps/routing/negative-scope) are
    // instruction-quality authoring signals.
    return "quality";
  }

  // Resource/operational readiness findings.
  if (ruleId.startsWith("RES-") || ruleId.startsWith("OPS-")) return "readiness";

  // Security scanner families (SCR/HTML/MD) default to safety.
  return "safety";
}

/**
 * Validate that every supplied candidate reference ID belongs to the
 * approved set for the given rule.
 *
 * @param ruleId - Rule whose approved references are checked against.
 * @param candidateIds - Reference IDs to validate.
 * @returns `true` when all candidates are approved; `false` otherwise (including unknown rule).
 */
export function validateRuleReferences(ruleId: string, candidateIds: string[]): boolean {
  const rule = RULE_REGISTRY[ruleId];
  if (!rule) return false;
  const approved = new Set<string>(rule.referenceIds);
  return candidateIds.every((id) => approved.has(id));
}

/**
 * Construct a fully-typed {@link GroundedSkillFinding} by merging the caller's
 * evidence with all deterministic fields sourced from the rule registry.
 * Every displayed finding must be created through this factory so that titles,
 * why-text, ordered fix steps, and reference IDs always come from the registry.
 *
 * @param ruleId - Registered rule identifier.
 * @param opts.resourcePath - Resource file path where the finding was detected.
 * @param opts.evidence - Pre-sanitized evidence snippet shown in the UI.
 * @param opts.fact - Pre-sanitized evidence text for the monospace block.
 * @param opts.severity - Optional severity override; falls back to the rule default.
 * @throws {Error} when `ruleId` is not registered.
 */
export function createRegisteredFinding(
  ruleId: string,
  opts: {
    resourcePath?: string;
    evidence: string;
    fact: string;
    severity?: SkillFindingSeverity;
  },
): GroundedSkillFinding {
  const rule = RULE_REGISTRY[ruleId];
  if (!rule) {
    throw new Error(`Rule "${ruleId}" is not registered in the skill rule registry.`);
  }
  const effectiveSeverity = opts.severity ?? rule.severity;
  const blocksSafety =
    rule.dimension === 'safety' &&
    (effectiveSeverity === 'critical' || effectiveSeverity === 'high');
  return {
    id: `${ruleId}:${opts.resourcePath ?? "unknown"}`,
    ruleId,
    family: rule.family,
    severity: effectiveSeverity,
    title: rule.title,
    fact: opts.fact,
    why: rule.why,
    fix: rule.recommendation,
    referenceId: rule.referenceIds[0] as ReferenceId,
    ai: false,
    evidence: opts.evidence,
    recommendation: rule.recommendation,
    fixSteps: rule.fixSteps,
    referenceIds: rule.referenceIds,
    confidence: rule.confidence,
    resourcePath: opts.resourcePath,
    dimension: rule.dimension,
    safetyDisposition:
      rule.dimension === 'safety' ? (blocksSafety ? 'blocking' : 'advisory') : undefined,
    platformOverlap: rule.dimension === 'safety' ? 'unverified' : undefined,
    skipAiEvaluation: false,
  };
}
