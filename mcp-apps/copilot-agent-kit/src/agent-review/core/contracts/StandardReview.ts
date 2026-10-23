import type { GroundedFinding } from './Findings.js';
import type { ReferenceId } from './references.js';

export type StandardTopicKind = 'AdaptiveDialog' | 'TaskDialog' | 'AgentDialog';
export type StandardJsonValue = string | number | boolean | null
  | StandardJsonValue[] | StandardDocument;
export interface StandardDocument { [key: string]: StandardJsonValue }

export function normalizeStandardIdentity(value: string): string | undefined {
  const trimmed = value.trim();
  const candidate = trimmed.startsWith('{') && trimmed.endsWith('}')
    ? trimmed.slice(1, -1) : trimmed;
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate.toLowerCase() : undefined;
}

export interface StandardAction {
  id?: string;
  kind: string;
  /** Exact JSON pointer in the original component, not a generated action ID. */
  path: string;
  document: StandardDocument;
}

export interface GroundedTopicFinding extends GroundedFinding {
  family: 'Topics';
  ruleId: string;
  componentId: string;
  componentIdUnique: string;
  actionPath?: string;
  evidence: string;
  recommendation: string;
  fixSteps: Array<{ order: number; action: string }>;
  referenceIds: ReferenceId[];
  confidence: 'high' | 'medium' | 'low';
}

export interface StandardTopicResult {
  evaluationType: 'StandardTopic';
  contractVersion: 1;
  componentId: string;
  componentIdUnique: string;
  componentKind: StandardTopicKind;
  componentSchemaName: string;
  inputHash: string;
  status: 'complete' | 'partial';
  summary: string;
  /** Each finding is checked independently before it can enter a saved review. */
  findings: unknown[];
}

export interface StandardTopicReview {
  evaluationType: 'StandardTopic';
  contractVersion: 1;
  componentId: string;
  componentIdUnique: string;
  componentKind: StandardTopicKind;
  componentSchemaName: string;
  name: string;
  inputHash: string;
  status: 'complete' | 'partial' | 'unavailable';
  summary: string;
  reason?: string;
  findings: GroundedTopicFinding[];
  validationIssues: Array<{ code: string; message: string; findingIndex?: number }>;
}

export class ReviewSourceError extends Error {
  constructor(
    readonly code: 'INVALID_SOURCE' | 'UNSUPPORTED_COMPONENT' | 'SOURCE_TOO_LARGE',
    message: string,
  ) {
    super(message);
    this.name = 'ReviewSourceError';
  }
}
