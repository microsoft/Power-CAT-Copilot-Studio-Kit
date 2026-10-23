/** Deterministic skill bundle findings: L0 analysis, bundle integrity and resource scans. */
import type { GroundedSkillFinding, GroundedFinding } from '../contracts/Findings.js';
import type { ReferenceId } from '../contracts/references.js';
import { REFERENCES } from '../contracts/references.js';
import type { SkillBundle, SkillBundleReviewResult } from '../contracts/SkillBundle.js';
import { analyzeSkillL0 } from './skill/L0SkillAnalyzer.js';
import { analyzeBundleIntegrity } from './skill/bundleIntegrity.js';
import { scanSkillResource } from './skill/resourceScanners.js';
import { splitSkillMarkdown } from './AgentsExperienceParser.js';
// Re-export so existing consumers of SkillBundleReviewService get these types without an import path change.
export type { SkillBundleReviewResult };

/** Maps raw reference string to a valid ReferenceId; unmapped values fail closed to 'owasp-llm01'. */
function toReferenceId(raw: string | undefined): ReferenceId {
  if (raw !== undefined && raw in REFERENCES) {
    return raw as ReferenceId;
  }
  return 'owasp-llm01';
}

/**
 * Every deterministic finding for one bundle, computed without any AI call.
 *
 * Exported so the workflow backend can send real scanner output in its corpus.
 * The workflow submits every component up front, long before this service runs
 * per skill, so it previously sent `deterministic_findings: []` for all of them
 * — the reviewing agent was asked to build on output it had never been given.
 *
 * Every input is pure: L0 analysis, bundle integrity and resource scanning read
 * the bundle and nothing else, so computing them early costs only CPU and
 * cannot change the review's outcome. Sharing this function is what keeps the
 * two backends from drifting apart.
 */
/**
 * Rules whose entire basis is that the skill markdown had no content.
 *
 * They are correct when the markdown was read and found empty, and misleading
 * when it was never read at all.
 */
const EMPTY_CONTENT_RULE_IDS = new Set(['SKL-01', 'SKL-02', 'SKL-03']);

/**
 * Whether the skill's own markdown was successfully retrieved.
 *
 * Measured on ZAVA Training Hub: all four resources failed to download, so
 * `skillMarkdown` was empty and the review reported the skill as having no
 * frontmatter name, no description and an empty body. Those three findings
 * describe the download, not the agent, and a maker acting on them would edit a
 * skill that was never broken. When the content was never seen, the honest
 * output is the retrieval error alone -- which `analyzeBundleIntegrity` already
 * raises as `BND-06`.
 */
function skillMarkdownWasRetrieved(bundle: SkillBundle): boolean {
  if (bundle.skillMarkdown.trim().length > 0) return true;
  return !bundle.retrievalIssues.some(issue =>
    issue.code === 'missing-skill-md' ||
    (issue.code === 'download-failed' &&
      /(^|\/)SKILL\.md$/i.test(issue.resourcePath ?? '')));
}

export function computeDeterministicFindings(bundle: SkillBundle): GroundedSkillFinding[] {
  const skillName = bundle.skillName;
  const fm = splitSkillMarkdown(bundle.skillMarkdown);
  const l0 = analyzeSkillL0({
    name: skillName,
    schemaname: bundle.skillSchemaName,
    markdown: bundle.skillMarkdown,
    frontmatterName: fm.name,
    frontmatterDescription: fm.description,
    body: fm.body,
    componentId: bundle.skillComponentId,
    componentIdUnique: bundle.skillComponentUniqueId,
    source: bundle.source,
    bundleMarker: bundle.bundleMarker,
    resourceCount: bundle.resources.length,
  } as never);

  // Findings about absent content are only meaningful if the content was read.
  const contentFindings = skillMarkdownWasRetrieved(bundle)
    ? l0.frontmatterFindings
    : l0.frontmatterFindings.filter(f => !EMPTY_CONTENT_RULE_IDS.has(f.id));

  return [
    ...contentFindings.map(adaptGroundedToSkillFinding),
    ...toSafetyEvidence(l0.safetyFindings, skillName),
    ...analyzeBundleIntegrity(bundle).findings,
    ...bundle.resources.flatMap(scanSkillResource),
  ];
}

/**
 * Deterministic findings for a whole review, keyed by skill schema name.
 *
 * One malformed bundle must not stop the corpus being submitted, so a failure
 * leaves that component with no findings — exactly what every component had
 * before this existed.
 *
 * @param bundles - Every assembled bundle in the review.
 */
export function computeDeterministicFindingsByBundle(
  bundles: readonly SkillBundle[],
): Map<string, GroundedSkillFinding[]> {
  const byBundle = new Map<string, GroundedSkillFinding[]>();
  for (const bundle of bundles) {
    try {
      byBundle.set(bundle.skillSchemaName, computeDeterministicFindings(bundle));
    } catch (err) {
      console.warn(
        `[CopilotReview] Could not pre-compute deterministic findings for "${bundle.skillName}".`,
        err,
      );
    }
  }
  return byBundle;
}

/** Map L0 safety findings onto the grounded shape used across the review. */
function toSafetyEvidence(
  safetyFindings: ReturnType<typeof analyzeSkillL0>['safetyFindings'],
  skillName: string,
): GroundedSkillFinding[] {
  return safetyFindings.map(f => ({
    id: `${f.id}:${skillName}`,
    family: 'Skills',
    severity: f.severity,
    title: `Safety: ${f.category} in "${skillName}"`,
    fact: f.evidence,
    why: f.rationale,
    fix: f.recommendation,
    referenceId: toReferenceId(f.reference),
    ai: false,
    ruleId: f.id,
    resourcePath: undefined,
    evidence: f.evidence,
    recommendation: f.recommendation,
    fixSteps: [{ order: 1, action: f.recommendation }],
    referenceIds: [toReferenceId(f.reference)],
    confidence: 'high' as const,
    dimension: 'safety' as const,
    safetyDisposition: f.safetyDisposition,
    platformOverlap: f.platformOverlap,
    skipAiEvaluation: f.skipAiEvaluation,
  }));
}

/** Adapts a GroundedFinding (L0 frontmatter shape) to GroundedSkillFinding for deterministic merge. */
function adaptGroundedToSkillFinding(gf: GroundedFinding): GroundedSkillFinding {
  const severityMap: Record<GroundedFinding['severity'], GroundedSkillFinding['severity']> = {
    error: 'high',
    warning: 'medium',
    info: 'info',
  };
  return {
    ...gf,
    severity: severityMap[gf.severity],
    ruleId: gf.id,
    evidence: gf.fact,
    recommendation: gf.fix,
    fixSteps: [{ order: 1, action: gf.fix }],
    referenceIds: [gf.referenceId],
    confidence: 'high',
  };
}
