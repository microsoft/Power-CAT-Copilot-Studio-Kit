import type { AssessmentStatus, ComplianceIssue, EvidenceKind, PatternTopic } from './StageOutputs';

/**
 * DisplayModels TypeScript interfaces
 *
 * These interfaces define the data structures for UI display in DataGrids.
 * They transform backend data into grid-friendly formats with all required fields.
 */

/** Explicit outcomes shared by the standard-review grids and details surfaces. */
export interface AssessmentDisplay {
  assessmentStatus: AssessmentStatus;
  assessmentReason: string;
  /** Null means excluded or unavailable, never a successful or failed check. */
  status: boolean | null;
  statusLabel: 'Pass' | 'Fail' | 'N/A' | 'Not assessed';
  statusColor: 'success' | 'danger' | 'informative';
  evidenceKind?: EvidenceKind;
}

/**
 * Pattern row for PatternsDataGrid display
 *
 * Columns: Status badge | Severity badge | Category | Pattern name | Topic count | Actions
 */
export interface PatternDisplayRow extends AssessmentDisplay {
  /** Unique identifier for the row */
  id: string;

  /** Pattern ID from evaluation */
  patternId: string;

  /** Pattern name (primary display) */
  patternName: string;

  /** Full pattern description */
  description: string;

  /** Recommended fix */
  recommendation: string;

  /** Severity level */
  severity: 'High' | 'Medium' | 'Low';

  /** Severity badge color */
  severityColor: 'danger' | 'warning' | 'informative';

  /** Pattern category */
  category: string;

  /** Number of settings marked Fail; unresolved and excluded references remain in rawTopics. */
  topicCount: number;

  /** List of affected topic names */
  topics: string[];

  /** Raw topic objects with current/suggested values from AI model */
  rawTopics: PatternTopic[];

  /** Sort order for category */
  categorySortOrder: number;

  /** True when the pattern is not applicable for this review source (e.g. test cases for ZIP reviews) */
  notApplicable?: boolean;
}

/**
 * Compliance row for ComplianceDataGrid display
 *
 * Columns: Status badge | Severity badge | Category | Criteria name | Issue count | Actions
 */
export interface ComplianceDisplayRow extends AssessmentDisplay {
  /** Unique identifier for the row */
  id: string;

  /** Criterion ID (e.g., "scope-definition") */
  criteriaId: string;

  /** Criterion name (primary display) */
  criteriaName: string;

  /** Full criterion description */
  description: string;

  /** Severity level (inherent or from issues) */
  severity: 'High' | 'Medium' | 'Low';

  /** Severity badge color */
  severityColor: 'danger' | 'warning' | 'informative';

  /** Compliance category */
  category: 'Scope' | 'UX' | 'Safety' | 'Quality';

  /** Number of issues for this criterion */
  issueCount: number;

  /** List of issues for this criterion */
  issues: ComplianceIssueDetail[];

  /** Inherent severity (used when passed) */
  inherentSeverity: 'High' | 'Medium' | 'Low';

  /** Sort order for category */
  categorySortOrder: number;
}

/**
 * Detailed issue information for display in ComplianceDetailsDialog
 */
export interface ComplianceIssueDetail extends Pick<
  ComplianceIssue,
  'assessmentStatus' | 'assessmentReason' | 'evidence' | 'coverage'
    | 'uncoveredSituation' | 'guidelineReference' | 'remediation'
> {
  /** Issue unique ID */
  id: string;

  /** Issue title */
  title: string;

  /** Issue description */
  description: string;

  /** Recommended fix */
  recommendation: string;

  /** Issue severity */
  severity: 'High' | 'Medium' | 'Low';
}

/**
 * Category sort order for both patterns and compliance
 */
export const PATTERN_CATEGORY_ORDER: Record<string, number> = {
  'Model Naming': 1,
  'Model Description': 2,
  'Input Variables': 3,
  'Output Variables': 4,
  'Architecture': 5,
  'Orchestration': 6,
  'Evaluation': 7,
  'Unknown': 8,
};

export const COMPLIANCE_CATEGORY_ORDER: Record<string, number> = {
  'Scope': 1,
  'UX': 2,
  'Safety': 3,
  'Quality': 4,
};

/**
 * Badge color mappings
 */
export const STATUS_BADGE_COLOR: Record<AssessmentDisplay['statusLabel'], AssessmentDisplay['statusColor']> = {
  Pass: 'success',
  Fail: 'danger',
  'N/A': 'informative',
  'Not assessed': 'informative',
};

export const EVIDENCE_KIND_LABELS: Record<EvidenceKind, string> = {
  'configuration-fact': 'Configuration fact',
  'authoring-guidance': 'Authoring guidance',
  'potential-risk': 'Potential risk',
};

export const PUBLIC_SAFE_PDF_DESCRIPTION =
  'Reviewed and suggested text and source identifiers are omitted. Findings and saved scores are retained.';

export const SEVERITY_BADGE_COLOR: Record<'High' | 'Medium' | 'Low', 'danger' | 'warning' | 'informative'> = {
  High: 'danger',
  Medium: 'warning',
  Low: 'informative',
};
