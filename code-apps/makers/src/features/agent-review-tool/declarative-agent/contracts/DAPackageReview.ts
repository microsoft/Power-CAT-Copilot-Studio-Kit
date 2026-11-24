import type { EvaluationMethod, EvaluationStatus, IssueSeverity } from './DAEvaluationResult';

export type DAPackageDocumentKind =
  | 'app-manifest'
  | 'declarative-agent'
  | 'plugin'
  | 'openapi'
  | 'mcp-tools'
  | 'instructions'
  | 'localization'
  | 'knowledge'
  | 'editorial-answers'
  | 'worker-agent'
  | 'skill-definition'
  | 'skill-resource'
  | 'other';

export type DAPackageDocumentStatus = 'parsed' | 'text' | 'binary' | 'missing' | 'invalid';
export type DAPackageReferenceStatus = 'resolved' | 'external' | 'missing' | 'unsafe' | 'invalid';
export type DAEvidenceStatus = 'available' | 'unavailable' | 'invalid';
export type DAPackageValidity = 'valid' | 'valid-with-warnings' | 'invalid' | 'unavailable';

export interface DAPackageDocument {
  path: string;
  kind: DAPackageDocumentKind;
  status: DAPackageDocumentStatus;
  data?: unknown;
  text?: string;
  error?: string;
}

export interface DAPackageReference {
  sourceFile: string;
  jsonPath: string;
  requestedPath: string;
  normalizedPath?: string;
  kind: DAPackageDocumentKind;
  status: DAPackageReferenceStatus;
  error?: string;
}

export interface DAEvidenceRecord {
  evidenceId: string;
  kind: 'json-value' | 'document' | 'reference';
  sourceFile: string;
  jsonPath: string;
  content: string;
  status: DAEvidenceStatus;
  error?: string;
}

/**
 * Transient package evidence returned by the ZIP parser.
 *
 * Binary content is never retained, and text records are bounded and sanitized
 * before they can be sent to the review workflow.
 */
export interface DAPackageEvidence {
  rootManifestPath: string;
  declarativeAgentPath?: string;
  packageSizeBytes?: number;
  documents: DAPackageDocument[];
  references: DAPackageReference[];
  records: DAEvidenceRecord[];
}

export interface DAPackageFinding {
  ruleId: string;
  status: EvaluationStatus;
  severity?: IssueSeverity;
  method: EvaluationMethod;
  sourceFile?: string;
  jsonPath?: string;
  evidence?: string;
  explanation: string;
  recommendation: string;
  guidanceUrl?: string;
}

export interface DAPackageValidation {
  status: DAPackageValidity;
  schemaVersion: string;
  findings: DAPackageFinding[];
}
