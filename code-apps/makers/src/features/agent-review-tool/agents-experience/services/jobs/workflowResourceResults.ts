import type { AgentComponentResult } from '../../contracts/ReviewJob';
import type { SkillResourceEvaluation } from '../../contracts/SkillEvaluation';

type WorkflowResourceResult = NonNullable<AgentComponentResult['resources']>[number] & {
  status: SkillResourceEvaluation['status'];
  capabilities?: SkillResourceEvaluation['capabilities'];
};

const STATUSES = new Set(['complete', 'partial', 'failed', 'skipped', 'cancelled']);
const CAPABILITIES = new Set(['read', 'write', 'delete', 'network', 'process', 'execute', 'secret-access']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasText(value: unknown, keys: readonly string[]): value is Record<string, string> {
  return isRecord(value) && keys.every(key => typeof value[key] === 'string');
}

function optionalRows(value: unknown, valid: (row: unknown) => boolean): boolean {
  return value === undefined || (Array.isArray(value) && value.every(valid));
}

function isResourceResult(value: unknown): value is WorkflowResourceResult {
  if (!isRecord(value) || typeof value.resourcePath !== 'string'
    || !value.resourcePath.trim() || typeof value.status !== 'string'
    || !STATUSES.has(value.status)) return false;

  return (value.riskLevel === undefined || typeof value.riskLevel === 'string')
    && (value.readiness === undefined || typeof value.readiness === 'string')
    && (value.purposeAlignment === undefined || (
      isRecord(value.purposeAlignment)
      && typeof value.purposeAlignment.matches === 'boolean'
      && typeof value.purposeAlignment.rationale === 'string'
    ))
    && optionalRows(value.observedBehaviors, row => hasText(row, ['kind', 'evidence']))
    && optionalRows(value.dependencies, row => hasText(row, ['name', 'kind'])
      && (row.evidence === undefined || typeof row.evidence === 'string'))
    && optionalRows(value.externalEndpoints, row => hasText(row, ['value', 'evidence']))
    && optionalRows(value.capabilities, row => hasText(row, ['kind', 'evidence'])
      && CAPABILITIES.has(row.kind))
    && optionalRows(value.runtimeAssumptions, row => hasText(row, ['statement', 'evidence']))
    && optionalRows(value.findings, row => hasText(row, ['ruleId', 'evidence']));
}

/** Read optional workflow file analysis without turning malformed data into an assessed empty list. */
export function readWorkflowResourceResults(value: unknown): {
  resources?: WorkflowResourceResult[];
  rejected: boolean;
} {
  if (value === undefined) return { rejected: false };
  const resources = Array.isArray(value) ? value.filter(isResourceResult) : [];
  const rejected = !Array.isArray(value) || resources.length !== value.length;
  if (rejected) {
    console.warn('[CopilotReview] Invalid supporting-file results were discarded; the assessment is partial.');
  }
  return { resources: resources.length ? resources : undefined, rejected };
}
