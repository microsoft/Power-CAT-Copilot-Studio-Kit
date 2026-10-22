/**
 * Pure payload builders for the four AI Builder skill evaluation prompts.
 *
 * Each builder returns a Record<string, string> matching the exact AI Builder
 * Text input variable names. Values are plain strings (raw text or JSON).
 * Never slices serialised JSON — uses tokenBudget primitives for budgeting.
 */
import type { GroundedSkillFinding } from "../../contracts/Findings.js";
import type { SkillBundle } from "../../contracts/SkillBundle.js";
import type { ResourcePromptContext } from "../../contracts/SkillEvaluation.js";
import { buildStandardResourceExcerpts } from "./tokenBudget.js";
import {
  getOrchestrationRule,
  orchestrationRuleIds,
} from "./orchestrationRuleRegistry.js";

// ---------------------------------------------------------------------------
// P2-N: Standard skill bundle evaluation payload
// ---------------------------------------------------------------------------

export interface StandardPromptPayload {
  skill_markdown: string;
  agent_instructions: string;
  sibling_descriptions_json: string;
  resource_manifest_json: string;
  resource_excerpts_json: string;
  deterministic_findings_json: string;
}

/**
 * Builds the P2-N (Standard Skill Bundle Evaluator) AI Builder input payload.
 *
 * @param bundle - The assembled skill bundle.
 * @param findings - Deterministic findings from L0 scan.
 */
export function buildStandardPromptInput(
  bundle: SkillBundle,
  findings: GroundedSkillFinding[],
): StandardPromptPayload {
  const { excerpts } = buildStandardResourceExcerpts(bundle, findings);
  return {
    skill_markdown: bundle.skillMarkdown,
    agent_instructions: bundle.agentInstructions,
    sibling_descriptions_json: JSON.stringify(bundle.siblingDescriptions),
    resource_manifest_json: JSON.stringify(bundle.manifest),
    resource_excerpts_json: JSON.stringify(excerpts),
    deterministic_findings_json: JSON.stringify(findings),
  };
}

// ---------------------------------------------------------------------------
// P2-R: Resource chunk evaluation payload
// ---------------------------------------------------------------------------

export interface ResourcePromptPayload {
  skill_context_json: string;
  resource_metadata_json: string;
  resource_chunk: string;
  chunk_context_json: string;
  deterministic_findings_json: string;
}

/**
 * Builds the P2-R (Resource Chunk Evaluator) AI Builder input payload.
 *
 * @param ctx - The resource prompt context containing skill, metadata, chunk, and findings.
 */
export function buildResourcePromptInput(
  ctx: ResourcePromptContext,
): ResourcePromptPayload {
  const chunkContext = {
    chunkId: ctx.chunk.chunkId,
    resourcePath: ctx.chunk.resourcePath,
    index: ctx.chunk.index,
    startLine: ctx.chunk.startLine,
    endLine: ctx.chunk.endLine,
    contentHash: ctx.chunk.contentHash,
    overlapBeforeLines: ctx.chunk.overlapBeforeLines,
    overlapAfterLines: ctx.chunk.overlapAfterLines,
  };

  return {
    skill_context_json: JSON.stringify(ctx.skillContext),
    resource_metadata_json: JSON.stringify(ctx.resourceMetadata),
    resource_chunk: ctx.chunk.content,
    chunk_context_json: JSON.stringify(chunkContext),
    deterministic_findings_json: JSON.stringify(ctx.deterministicFindings),
  };
}

// ---------------------------------------------------------------------------
// P2-F: File synthesis payload
// ---------------------------------------------------------------------------

export interface FileSynthesisPromptPayload {
  resource_metadata_json: string;
  chunk_results_json: string;
  deterministic_findings_json: string;
}

/** Metadata shape for the resource being synthesized. */
export interface FileSynthesisResourceMetadata {
  path: string;
  kind: string;
  language?: string;
  sizeBytes: number;
  sha256: string;
  referencedBy: string[];
}

/**
 * Builds the P2-F (File Synthesis) AI Builder input payload.
 *
 * @param metadata - Resource file metadata.
 * @param chunkResults - Array of chunk evaluation results for this file.
 * @param findings - Deterministic findings scoped to this resource.
 */
export function buildFileSynthesisPromptInput(
  metadata: FileSynthesisResourceMetadata,
  chunkResults: unknown[],
  findings: GroundedSkillFinding[],
): FileSynthesisPromptPayload {
  return {
    resource_metadata_json: JSON.stringify(metadata),
    chunk_results_json: JSON.stringify(chunkResults),
    deterministic_findings_json: JSON.stringify(findings),
  };
}

// ---------------------------------------------------------------------------
// P2-B: Bundle synthesis payload
// ---------------------------------------------------------------------------

export interface BundleSynthesisPromptPayload {
  skill_markdown: string;
  agent_instructions: string;
  sibling_descriptions_json: string;
  resource_manifest_json: string;
  resource_results_json: string;
  bundle_integrity_json: string;
  deterministic_findings_json: string;
  skill_markdown_analysis_json: string;
  synthesis_level: string;
}

/**
 * Builds the P2-B (Bundle Synthesis) AI Builder input payload.
 *
 * @param bundle - The assembled skill bundle.
 * @param resourceResults - Array of per-resource evaluation results.
 * @param bundleIntegrity - Bundle integrity analysis object.
 * @param findings - Deterministic findings for the bundle.
 * @param synthesisLevel - "partial" or "final".
 * @param skillMarkdownAnalysis - Optional analysis of the skill markdown.
 */
export function buildBundleSynthesisPromptInput(
  bundle: SkillBundle,
  resourceResults: unknown[],
  bundleIntegrity: unknown,
  findings: GroundedSkillFinding[],
  synthesisLevel: "partial" | "final",
  skillMarkdownAnalysis?: unknown,
): BundleSynthesisPromptPayload {
  return {
    skill_markdown: bundle.skillMarkdown,
    agent_instructions: bundle.agentInstructions,
    sibling_descriptions_json: JSON.stringify(bundle.siblingDescriptions),
    resource_manifest_json: JSON.stringify(bundle.manifest),
    resource_results_json: JSON.stringify(resourceResults),
    bundle_integrity_json: JSON.stringify(bundleIntegrity),
    deterministic_findings_json: JSON.stringify(findings),
    skill_markdown_analysis_json: JSON.stringify(skillMarkdownAnalysis ?? {}),
    synthesis_level: synthesisLevel,
  };
}

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
