/** Typed contracts for the skill bundle evaluation pipeline (spec 013 §10). */
import type { GroundedSkillFinding } from './Findings.js';

/**
 * Depth actually achieved by a completed review — never an input.
 *
 * Every review runs the full pipeline. `"standard"` means the per-resource
 * phase was unavailable (its AI Builder prompts are not provisioned in the
 * tenant) and the review completed on the deterministic scan plus the
 * whole-skill evaluation alone. Retained so reviews persisted before depth
 * selection was removed keep rendering.
 */
export type SkillReviewMode = "standard" | "deep";

export type ResourceAnalysisStatus =
  | "queued"
  | "downloaded"
  | "scanned"
  | "evaluating"
  | "completed"
  | "partial"
  | "failed"
  | "skipped"
  | "oversized"
  | "cancelled";

export interface RetrievalIssue {
  code: string;
  message: string;
  resourcePath?: string;
  severity: "info" | "warning" | "error";
}

export interface SkillResourceRow {
  botcomponentid: string;
  componentidunique: string;
  parentbotid: string;
  parentbotcomponentid: string;
  name: string;
  schemaname: string;
  componenttype: number;
  componentstate: number;
  statecode: number;
  statuscode: number;
  versionnumber: number;
  modifiedon: string;
  filedata?: string;
  filedata_name?: string;
}

export interface ResourceChunk {
  chunkId: string;
  resourcePath: string;
  index: number;
  startLine: number;
  endLine: number;
  content: string;
  contentHash: string;
  overlapBeforeLines: number;
  overlapAfterLines: number;
}

export interface SkillBundleResource {
  id: string;
  componentIdUnique: string;
  originalPath: string;
  normalizedPath: string;
  extension: string;
  kind: "script" | "reference" | "template" | "asset" | "data" | "other";
  language?: "python" | "html" | "markdown" | "text" | "json" | "yaml" | "other";
  sizeBytes: number;
  sha256: string;
  isBinary: boolean;
  decodeStatus: "decoded" | "binary" | "failed";
  textContent?: string;
  referencedBy: string[];
  analysisStatus: ResourceAnalysisStatus;
  chunks: ResourceChunk[];
  issues: RetrievalIssue[];
}

export interface SkillBundleManifestEntry {
  path: string;
  kind: SkillBundleResource["kind"];
  language?: SkillBundleResource["language"];
  sizeBytes: number;
  sha256: string;
  isBinary: boolean;
  referencedBy: string[];
  analysisStatus: ResourceAnalysisStatus;
}

export interface SkillBundle {
  skillComponentId: string;
  skillComponentUniqueId: string;
  skillSchemaName: string;
  skillName: string;
  source: "inline-markdown" | "zip-bundle";
  bundleMarker?: string;
  skillMarkdown: string;
  skillMarkdownHash: string;
  parentDescription?: string;
  agentInstructions: string;
  siblingDescriptions: Array<{ name: string; description?: string }>;
  manifest: SkillBundleManifestEntry[];
  resources: SkillBundleResource[];
  retrievalIssues: RetrievalIssue[];
  bundleHash: string;
}

export interface QualifiedSkillScore {
  value: number | null;
  status: "complete" | "partial" | "unavailable";
  coveragePercent: number;
  note?: string;
}

export interface SkillBundleScores {
  quality: QualifiedSkillScore;
  integrity: QualifiedSkillScore;
  safety: QualifiedSkillScore;
  readiness: QualifiedSkillScore;
  safetyGate: "none" | "warning" | "error";
}

export interface SkillReviewProgress {
  stage:
    | "loading"
    | "downloading"
    | "deterministic-scan"
    | "standard-ai"
    | "deep-resource-ai"
    | "file-synthesis"
    | "bundle-synthesis"
    | "persisting"
    | "complete";
  percent: number;
  message: string;
  skillName?: string;
  resourcePath?: string;
  completedUnits: number;
  totalUnits: number;
  partialFailures: number;
}

// Review execution result (Task 8 pipeline output)

export type SkillBundleReviewStatus =
  | 'complete'
  | 'partial'
  | 'unavailable'
  | 'blocked'
  | 'failed'
  | 'cancelled';

/** Authored reference from a skill file to a configured Copilot component. */
export interface SkillCapabilityReference {
  category: 'tool' | 'knowledge';
  targetSchemaName: string;
  targetComponentId?: string;
  targetComponentIdUnique?: string;
  matchedName: string;
  /** Absent on historical payloads and interpreted as exact. */
  matchKind?: 'exact' | 'strong';
  lineNumber: number;
  evidence: string;
}

/** A name match intentionally withheld because it did not identify one component. */
export interface SkillCapabilityReferenceIssue {
  code: 'ambiguous-capability-name';
  matchedName: string;
  /** Absent on historical payloads and interpreted as exact. */
  matchKind?: 'exact' | 'strong';
  lineNumber: number;
  evidence: string;
  candidateSchemaNames: string[];
}

export interface SkillBundleReviewResult {
  status: SkillBundleReviewStatus;
  mode: SkillReviewMode;
  skillName: string;
  skillSchemaName: string;
  deterministicFindings: GroundedSkillFinding[];
  /** Standard AI evaluation result. Absent when status is unavailable/blocked/cancelled. */
  standardEvaluation?: import('./SkillEvaluation.js').StandardSkillBundleEvaluation;
  /** Deep AI evaluation result. Present only when mode is "deep" and deep evaluation completed. */
  deepEvaluation?: import('./SkillEvaluation.js').DeepSkillBundleEvaluation;
  validationIssues?: Array<{ code: string; message: string; findingId?: string }>;
  blocked: boolean;
  /** True when untrusted skill content was withheld from all evaluator-model prompts. */
  aiEvaluationSkipped?: boolean;
  /** Deterministic references extracted from the assembled SKILL.md. */
  capabilityReferences?: SkillCapabilityReference[];
  /** Matches withheld because duplicate configured names made the target ambiguous. */
  capabilityReferenceIssues?: SkillCapabilityReferenceIssue[];
  error?: string;
}
