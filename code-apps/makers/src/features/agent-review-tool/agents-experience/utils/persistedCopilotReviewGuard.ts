import type { PersistedCopilotReviewPayload } from '../../contracts/ReviewResult';

const STAGE_STATES = new Set(['complete', 'partial', 'unavailable', 'not-applicable', 'failed', 'cancelled']);

function hasValidOptionalGuidance(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const finding = value as Record<string, unknown>;
  const textFields = ['findingTitle', 'findingFact', 'whyItMatters', 'makerAction', 'acceptanceCheck', 'suggestedText'];
  if (!textFields.every(field => finding[field] === undefined || typeof finding[field] === 'string')) return false;
  if (finding.remediation === undefined) return true;
  if (typeof finding.remediation !== 'object' || finding.remediation === null) return false;
  const guidance = finding.remediation as Record<string, unknown>;
  return ['findingTitle', 'whyItMatters', 'makerAction', 'acceptanceCheck']
    .every(field => typeof guidance[field] === 'string')
    && (guidance.suggestedText === undefined || typeof guidance.suggestedText === 'string')
    && (guidance.componentIdUnique === undefined || typeof guidance.componentIdUnique === 'string')
    && ['saved', 'snapshot', 'saved-and-snapshot'].includes(String(guidance.source));
}

function hasValidBundleGuidance(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const review = value as Record<string, unknown>;
  return review.findings === undefined
    || (Array.isArray(review.findings) && review.findings.every(hasValidOptionalGuidance));
}

function isStageStatus(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const stage = value as Record<string, unknown>;
  return typeof stage.state === 'string' && STAGE_STATES.has(stage.state)
    && (stage.reason === undefined || typeof stage.reason === 'string')
    && (stage.partialElements === undefined
      || (Array.isArray(stage.partialElements) && stage.partialElements.every(element => typeof element === 'string')));
}

function isOptionalAnalysisStatus(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== 'object' || value === null) return false;
  const analysis = value as Record<string, unknown>;
  return isStageStatus(analysis.instructionCoverage)
    && (analysis.crossSkillOrchestration === undefined || isStageStatus(analysis.crossSkillOrchestration));
}

/** Validate the required persisted fields before rendering a saved Copilot review. */
export function isPersistedCopilotPayload(value: unknown): value is PersistedCopilotReviewPayload {
  if (typeof value !== 'object' || value === null) return false;

  const payload = value as Record<string, unknown>;
  const model = payload.model;
  const score = payload.score;

  return (
    typeof model === 'object' && model !== null &&
    Array.isArray((model as Record<string, unknown>).tools) &&
    Array.isArray((model as Record<string, unknown>).skills) &&
    Array.isArray((model as Record<string, unknown>).connectedAgents) &&
    Array.isArray((model as Record<string, unknown>).knowledge) &&
    Array.isArray((model as Record<string, unknown>).testCases) &&
    Array.isArray((model as Record<string, unknown>).multiTurnCases) &&
    Array.isArray((model as Record<string, unknown>).evaluationSets) &&
    Array.isArray((model as Record<string, unknown>).triggers) &&
    Array.isArray((model as Record<string, unknown>).unknownKinds) &&
    typeof (model as Record<string, unknown>).agentSettings === 'object' &&
    (model as Record<string, unknown>).agentSettings !== null &&
    Array.isArray(payload.findings) &&
    payload.findings.every(hasValidOptionalGuidance) &&
    Array.isArray(payload.skillEvaluations) &&
    Array.isArray(payload.skillBundleReviews) &&
    payload.skillBundleReviews.every(hasValidBundleGuidance) &&
    Array.isArray(payload.coverage) &&
    Array.isArray(payload.persistenceIssues) &&
    isOptionalAnalysisStatus(payload.analysisStatus) &&
    (payload.skillReviewMode === 'standard' || payload.skillReviewMode === 'deep') &&
    typeof score === 'object' && score !== null &&
    (
      typeof (score as Record<string, unknown>).grounded === 'number' ||
      (score as Record<string, unknown>).grounded === null
    ) &&
    typeof (score as Record<string, unknown>).passed === 'number' &&
    typeof (score as Record<string, unknown>).warnings === 'number' &&
    typeof (score as Record<string, unknown>).errors === 'number' &&
    typeof (score as Record<string, unknown>).evaluated === 'number'
  );
}

/**
 * Validates a persisted payload and supplies defaults for supported legacy fields.
 */
export function parsePersistedCopilotPayload(
  value: unknown,
): PersistedCopilotReviewPayload | undefined {
  if (typeof value !== 'object' || value === null) return undefined;

  const payload = value as Record<string, unknown>;
  const model = payload.model;
  if (typeof model !== 'object' || model === null) return undefined;

  const modelRecord = model as Record<string, unknown>;
  const normalized = modelRecord.triggers === undefined
    ? {
        ...payload,
        model: {
          ...modelRecord,
          triggers: [],
        },
      }
    : value;

  return isPersistedCopilotPayload(normalized) ? normalized : undefined;
}
