/**
 * DAReviewRecord TypeScript interface
 *
 * Represents a DA review stored in the cat_agentreviews Dataverse table
 * with cat_agenttype = 2 (M365DeclarativeAgent).
 *
 * Flat columns (cat_agentname, cat_agentversion, etc.) are written on upsert
 * so the grid and stat cards can be derived from Dataverse query results
 * without parsing the full JSON blob per row.
 */

import type { DAManifest } from './DAManifest';
import type { ManifestHealthCheck } from './ManifestHealthCheck';
import type { DAEvaluationResult } from './DAEvaluationResult';
import type { DAEvidenceRecord, DAPackageValidation } from './DAPackageReview';
import type { DAWorkflowProvenance } from './DAWorkflowReview';
import type { PersistedSkillBundleReview } from '../../contracts/ReviewResult';
import type {
  CrossSkillOrchestrationEvaluation,
} from '../../agents-experience/contracts/SkillEvaluation';
import type { RetrievalIssue } from '../../agents-experience/contracts/SkillBundle';

export interface DAReviewRecord {
  /** Dataverse record ID (cat_agentreviewsid) — undefined when creating new */
  reviewId?: string;

  /** DA unique identifier: manifest.appId or SHA-256 hash fallback */
  componentIdUnique: string;

  /** Agent name (flat column: cat_agentname) */
  agentName: string;

  /** Agent version string (flat column: cat_agentversion) */
  agentVersion: string;

  /** Publisher/developer name (flat column: cat_publishername) */
  publisherName: string;

  /** How the DA was loaded (flat column: cat_sourcetype) */
  sourceType: 'zip' | 'graph-api';

  /** Overall weighted score 0-100 */
  overallScore: number | null;

  /** Persisted count of package and quality issues for list-level statistics. */
  totalIssues?: number;

  /** Review date/time */
  reviewedOn?: Date;

  /** base64 icon from color.png (null for Graph API path) */
  iconBase64: string | null;

  /** Full parsed manifest (stored in cat_reviewresultfile JSON blob) */
  manifest?: DAManifest;

  /** Stage A manifest health check results */
  manifestHealth?: ManifestHealthCheck;

  /** Stage B AI evaluation results */
  evaluation?: DAEvaluationResult;

  /** Deterministic package validity, separate from semantic quality scoring. */
  packageValidation?: DAPackageValidation;

  /** Sanitized evidence retained for result traceability. */
  evidence?: DAEvidenceRecord[];

  /** Workflow run identity and response-verification summary. */
  workflowProvenance?: DAWorkflowProvenance;

  /** Sanitized custom-skill evaluations from the uploaded package. */
  customSkillReviews?: PersistedSkillBundleReview[];

  /** Sanitized whole-set routing and compatibility evaluation. */
  customSkillOrchestration?: CrossSkillOrchestrationEvaluation;

  /** Non-fatal custom-skill evaluation failures retained for traceability. */
  customSkillIssues?: RetrievalIssue[];
}

/**
 * DA grid row — derived from DAReviewRecord for display in DAGrid
 */
export interface DAGridRow {
  /** DAReviewRecord reviewId (undefined = not yet reviewed) */
  reviewId?: string;

  /** Unique DA identifier (appId or hash) */
  componentIdUnique: string;

  /** Display name */
  agentName: string;

  /** Version string */
  agentVersion: string;

  /** Publisher */
  publisherName: string;

  /** Score (undefined = not yet reviewed) */
  overallScore?: number;

  /** When last reviewed */
  reviewedOn?: Date;

  /** Source of the DA listing */
  sourceType: 'zip' | 'graph-api';

  /** base64 icon (null = use fallback icon) */
  iconBase64: string | null;

  /** Action to show in grid */
  action: 'review' | 'view-results';
}
