/**
 * Publishes the bundle-integrity rule family as the legacy finding shape.
 *
 * This file used to *be* the detector. It is now an adapter: the 432 lines of
 * reference-graph construction live in
 * `review-core/rules/skill-bundle-integrity.rules.ts` as `assessBundleIntegrity`,
 * which is the single authority both shapes are projected from (IMPL-12). The
 * rule family projects it into `RuleOutcome`s for the scorer; this file projects
 * the same rows into the `GroundedSkillFinding`s four callers already read.
 *
 * The projection is driven by `skillBundleIntegrityRuleEntries` rather than by a
 * local table, so an id that is not a rule cannot be published and a rule's
 * severity, confidence and family are stated once. Grouping by rule entry is
 * free: the published sort is by `ruleId` first, and within one id the rows keep
 * the order the detector pushed them in, so ties break exactly as before.
 */

import type { GroundedSkillFinding } from "../../contracts/Findings";
import type { SkillBundle } from "../../contracts/SkillBundle";
import {
  assessBundleIntegrity,
  skillBundleIntegrityRuleEntries,
  type BundleIntegrityRow,
  type BundleIntegrityRuleId,
  type SkillBundleIntegrityRuleEntry,
} from "../../../review-core/rules/skill-bundle-integrity.rules";

export { PATH_REFERENCE } from "../../../review-core/rules/skill-bundle-integrity.rules";

export interface BundleIntegrityFinding extends GroundedSkillFinding {
  ruleId: BundleIntegrityRuleId;
  resourcePath?: string;
  referencedIn?: string;
}

export interface BundleIntegrityResult {
  referencedButMissing: Array<{ path: string; referencedIn: string }>;
  presentButUnreferenced: Array<{ path: string; note: string }>;
  progressiveDisclosureOk: boolean;
  findings: GroundedSkillFinding[];
  referenceGraph: Array<{ from: string; to: string }>;
}

function makeFinding(
  hit: BundleIntegrityRow,
  entry: SkillBundleIntegrityRuleEntry,
): BundleIntegrityFinding {
  const extras: Pick<BundleIntegrityFinding, "resourcePath" | "referencedIn"> = {
    ...(hit.resourcePath === undefined ? {} : { resourcePath: hit.resourcePath }),
    ...(hit.referencedIn === undefined ? {} : { referencedIn: hit.referencedIn }),
  };

  return {
    id: `${hit.ruleId}:${extras.referencedIn ?? extras.resourcePath ?? hit.title}`,
    ruleId: hit.ruleId,
    family: entry.options.family,
    severity: entry.options.severity,
    title: hit.title,
    fact: hit.fact,
    why: hit.why,
    fix: hit.fix,
    referenceId: hit.referenceId,
    ai: false,
    evidence: hit.fact,
    recommendation: hit.fix,
    fixSteps: [{ order: 1, action: hit.fix }],
    referenceIds: [hit.referenceId],
    confidence: entry.options.confidence,
    ...extras,
  };
}

/**
 * Analyze a canonical skill bundle for deterministic reference-graph and
 * integrity issues.
 *
 * The analysis is client-side only. It extracts path references from the
 * canonical skill markdown and every decoded textual resource, matches them
 * case-insensitively against the bundle, and returns explicit findings for
 * missing, unreadable, unsupported, duplicate, and progressive-disclosure
 * issues.
 *
 * @param bundle - Canonical skill bundle assembled by the skill bundle pipeline.
 * @returns Deterministic bundle integrity results and grounded findings.
 */
export function analyzeBundleIntegrity(bundle: SkillBundle): BundleIntegrityResult {
  const assessment = assessBundleIntegrity(bundle);
  const findings: BundleIntegrityFinding[] = [];

  for (const entry of skillBundleIntegrityRuleEntries) {
    for (const hit of assessment.rows) {
      if (hit.ruleId !== entry.id) {
        continue;
      }
      const finding = makeFinding(hit, entry);
      // BND-02 names every referencing file, so `referencedIn` is a joined list
      // and cannot identify the finding: two different missing paths referenced
      // from the same files would collide on it. Key it on the subject instead.
      findings.push(
        hit.ruleId === "BND-02" && hit.resourcePath !== undefined
          ? { ...finding, id: `BND-02:${hit.resourcePath}` }
          : finding,
      );
    }
  }

  const sortedFindings = findings.sort((left, right) => {
    if (left.ruleId !== right.ruleId) {
      return left.ruleId.localeCompare(right.ruleId);
    }
    const leftKey = `${left.referencedIn ?? ""}|${left.resourcePath ?? ""}|${left.id}`;
    const rightKey = `${right.referencedIn ?? ""}|${right.resourcePath ?? ""}|${right.id}`;
    return leftKey.localeCompare(rightKey);
  });

  return {
    referencedButMissing: assessment.referencedButMissing,
    presentButUnreferenced: assessment.presentButUnreferenced,
    progressiveDisclosureOk: assessment.progressiveDisclosureOk,
    findings: sortedFindings,
    referenceGraph: assessment.referenceGraph,
  };
}
