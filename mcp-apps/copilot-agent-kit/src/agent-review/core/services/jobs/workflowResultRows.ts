import type { GroundedSkillFinding } from '../../contracts/Findings.js';
import type {
  AgentComponentResult,
  ReviewJobItemRow,
} from '../../contracts/ReviewJob.js';
import type { StandardTopicResult } from '../../contracts/StandardReview.js';
import { normalizeStandardIdentity } from '../../contracts/StandardReview.js';
import type { AeStandardTopic } from '../../contracts/AgentsExperienceModel.js';
import { parseStandardTopicResult, validateStandardTopicResult } from '../standardTopicEvaluation.js';
import type {
  SkillResourceEvaluation,
  StandardSkillBundleEvaluation,
} from '../../contracts/SkillEvaluation.js';
import { evidenceNamesCapability } from '../skill/capabilityEvidence.js';
import {
  createRegisteredFinding,
  getRule,
} from '../skill/skillRuleRegistry.js';

export const AGENT_LEVEL_INDEX = {
  ORCHESTRATION: 9000,
  INSTRUCTION_COVERAGE: 9001,
} as const;

export const RESOURCE_INDEX_BASE = 1000;

export function isComponentRow(row: ReviewJobItemRow): boolean {
  const index = row.cat_componentindex;
  return index === undefined
    || index === null
    || (index >= 0 && index < RESOURCE_INDEX_BASE);
}

export function safeParseReviewResult(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

export interface SelectedComponentResult {
  key: string;
  row: ReviewJobItemRow;
  result: AgentComponentResult;
}

export interface WorkflowResultRowReduction {
  components: SelectedComponentResult[];
  topics: Array<{ key: string; row: ReviewJobItemRow; result: StandardTopicResult }>;
  stages: ReadonlyMap<number, { row: ReviewJobItemRow; value: unknown }>;
  discardedDuplicateItemIds: string[];
  rejectedRows: Array<{
    itemId: string;
    componentIndex: number | null;
    reason: string;
  }>;
}

interface Candidate<T> {
  row: ReviewJobItemRow;
  value: T;
  position: number;
}

function rowTime(candidate: Candidate<unknown>): number {
  const parsed = Date.parse(candidate.row.createdon ?? '');
  return Number.isFinite(parsed) ? parsed : candidate.position;
}

function isNewer(
  next: Candidate<unknown>,
  current: Candidate<unknown>,
): boolean {
  const nextTime = rowTime(next);
  const currentTime = rowTime(current);
  return nextTime > currentTime
    || (nextTime === currentTime && next.position > current.position);
}

function toComponentResult(
  row: ReviewJobItemRow,
  parsed: unknown,
): AgentComponentResult | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  const candidate = parsed as Partial<AgentComponentResult>;
  const skillName = candidate.skillName ?? row.cat_skillname;
  if (!skillName) return null;
  return {
    ...(candidate as AgentComponentResult),
    skillName,
    status: candidate.status ?? 'complete',
    dimensions: Array.isArray(candidate.dimensions) ? candidate.dimensions : [],
    findings: Array.isArray(candidate.findings) ? candidate.findings : [],
    summary: candidate.summary ?? '',
  };
}

export function reduceWorkflowResultRows(
  rows: readonly ReviewJobItemRow[],
  attribution?: {
    correlationId: string;
    topics: ReadonlyMap<number, { topic: AeStandardTopic; inputHash: string }>;
  },
): WorkflowResultRowReduction {
  const components = new Map<string, Candidate<AgentComponentResult>>();
  const topics = new Map<string, Candidate<StandardTopicResult>>();
  const stages = new Map<number, Candidate<unknown>>();
  const discardedDuplicateItemIds: string[] = [];
  const rejectedRows: WorkflowResultRowReduction['rejectedRows'] = [];

  rows.forEach((row, position) => {
    const componentIndex = row.cat_componentindex ?? null;
    const reject = (reason: string) => rejectedRows.push({
      itemId: row.cat_agentreviewjobitemid,
      componentIndex,
      reason,
    });
    if (attribution && row.cat_correlationid !== undefined
        && normalizeStandardIdentity(row.cat_correlationid) !== normalizeStandardIdentity(attribution.correlationId)) {
      reject('row-correlation-mismatch');
      return;
    }

    if (
      componentIndex !== null
      && componentIndex >= RESOURCE_INDEX_BASE
      && componentIndex < AGENT_LEVEL_INDEX.ORCHESTRATION
    ) {
      reject('reserved-resource-row');
      return;
    }

    const parsed = safeParseReviewResult(row.cat_resultjson ?? '');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      reject('malformed-row');
      return;
    }

    if (
      componentIndex === AGENT_LEVEL_INDEX.ORCHESTRATION
      || componentIndex === AGENT_LEVEL_INDEX.INSTRUCTION_COVERAGE
    ) {
      const next: Candidate<unknown> = { row, value: parsed, position };
      const current = stages.get(componentIndex);
      if (!current || isNewer(next, current)) {
        if (current) {
          discardedDuplicateItemIds.push(
            current.row.cat_agentreviewjobitemid,
          );
        }
        stages.set(componentIndex, next);
      } else {
        discardedDuplicateItemIds.push(row.cat_agentreviewjobitemid);
      }
      return;
    }

    if (!isComponentRow(row)) {
      reject('out-of-range-row');
      return;
    }

    const expected = componentIndex === null ? undefined : attribution?.topics.get(componentIndex);
    const standard = expected !== undefined || (parsed as Record<string, unknown>).evaluationType === 'StandardTopic';
    if (standard) {
      const result = parseStandardTopicResult(parsed);
      if (!result || componentIndex === null || !Number.isInteger(componentIndex) || row.cat_itemstatus !== 1) {
        reject('invalid-standard-row');
        return;
      }
      if (attribution && !expected) {
        reject('unknown-standard-component-index');
        return;
      }
      if (expected && row.cat_componentid !== undefined
          && normalizeStandardIdentity(row.cat_componentid) !== normalizeStandardIdentity(expected.topic.componentId)) {
        reject('row-component-mismatch');
        return;
      }
      if (expected) {
        const validated = validateStandardTopicResult(expected.topic, expected.inputHash, result);
        if (validated.status === 'unavailable') {
          reject(validated.reason ?? 'standard-attribution-failed');
          return;
        }
      }
      const key = `#${componentIndex}`;
      const next = { row, value: result, position };
      const current = topics.get(key);
      if (!current || isNewer(next, current)) {
        if (current) discardedDuplicateItemIds.push(current.row.cat_agentreviewjobitemid);
        topics.set(key, next);
      } else {
        discardedDuplicateItemIds.push(row.cat_agentreviewjobitemid);
      }
      return;
    }
    const result = toComponentResult(row, parsed);
    if (!result) {
      reject('malformed-row');
      return;
    }
    const key = componentIndex === null
      ? `name:${result.skillName}`
      : `#${componentIndex}`;
    const next = { row, value: result, position };
    const current = components.get(key);
    if (!current || isNewer(next, current)) {
      if (current) {
        discardedDuplicateItemIds.push(current.row.cat_agentreviewjobitemid);
      }
      components.set(key, next);
    } else {
      discardedDuplicateItemIds.push(row.cat_agentreviewjobitemid);
    }
  });

  return {
    components: [...components.entries()].map(([key, candidate]) => ({ key, row: candidate.row, result: candidate.value })),
    topics: [...topics.entries()].map(([key, candidate]) => ({ key, row: candidate.row, result: candidate.value })),
    stages: new Map(
      [...stages.entries()].map(([index, candidate]) => [
        index,
        { row: candidate.row, value: candidate.value },
      ]),
    ),
    discardedDuplicateItemIds,
    rejectedRows,
  };
}

export function mapReviewJobItems(
  rows: readonly ReviewJobItemRow[],
): AgentComponentResult[] {
  return reduceWorkflowResultRows(rows).components.map(
    (component) => component.result,
  );
}

export function selectNewestUsableStageResult(
  rows: readonly ReviewJobItemRow[],
  index: number,
): unknown | null {
  return reduceWorkflowResultRows(
    rows.filter((row) => row.cat_componentindex === index),
  ).stages.get(index)?.value ?? null;
}

function canonicalizeQuotedEvidence(value: string | undefined): string {
  const evidence = (value ?? '').trim();
  return evidence.replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, '').trim() || evidence;
}

const CONTRADICTION_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'by', 'can', 'for',
  'from', 'has', 'have', 'in', 'into', 'is', 'it', 'its', 'may', 'must',
  'no', 'not', 'of', 'on', 'or', 'only', 'should', 'that', 'the', 'their',
  'then', 'this', 'to', 'under', 'up', 'use', 'with', 'without',
]);

function contradictionContentTokens(value: string): Set<string> {
  return new Set(
    (value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
      (token) =>
        (token.length > 2 || token === 'id')
        && /\p{L}/u.test(token)
        && !CONTRADICTION_STOP_WORDS.has(token),
    ),
  );
}

function contradictionQuotesShareSubject(
  evidenceValue: string | undefined,
  conflictingEvidenceValue: string,
): boolean {
  const evidenceTokens = contradictionContentTokens(
    (evidenceValue ?? '').trim(),
  );
  const conflictingTokens = contradictionContentTokens(
    conflictingEvidenceValue,
  );
  return [...evidenceTokens].some((token) => conflictingTokens.has(token));
}

const RESOURCE_STATUSES = [
  'complete',
  'partial',
  'failed',
  'skipped',
  'cancelled',
] as const;
const RISK_LEVELS = ['none', 'info', 'medium', 'high', 'critical'] as const;
const READINESS = [
  'ready',
  'needs-configuration',
  'unsupported',
  'unknown',
] as const;

function mapResources(
  resources: AgentComponentResult['resources'],
): SkillResourceEvaluation[] | undefined {
  if (!Array.isArray(resources) || resources.length === 0) return undefined;
  return resources
    .filter((resource) => resource?.resourcePath)
    .map((resource) => {
      const findings: GroundedSkillFinding[] = [];
      for (const finding of resource.findings ?? []) {
        if (
          !finding?.ruleId
          || !getRule(finding.ruleId)
          || !finding.evidence
        ) {
          continue;
        }
        findings.push({
          ...createRegisteredFinding(finding.ruleId, {
            resourcePath: finding.resourcePath ?? resource.resourcePath,
            evidence: finding.evidence,
            fact: finding.evidence,
          }),
          ai: true,
        });
      }
      return {
        resourcePath: resource.resourcePath,
        status: (RESOURCE_STATUSES as readonly string[]).includes(
          resource.status ?? '',
        ) ? resource.status : 'complete',
        riskLevel: (RISK_LEVELS as readonly string[]).includes(
          resource.riskLevel ?? '',
        ) ? resource.riskLevel : 'info',
        readiness: (READINESS as readonly string[]).includes(
          resource.readiness ?? '',
        ) ? resource.readiness : 'unknown',
        observedBehaviors: resource.observedBehaviors ?? [],
        dependencies: [],
        externalEndpoints: [],
        capabilities: resource.capabilities ?? [],
        runtimeAssumptions: resource.runtimeAssumptions ?? [],
        findings,
        purposeAlignment: { matches: true, rationale: '' },
        analyzedChunks: 1,
        totalChunks: 1,
        referenceIds: [
          ...new Set(findings.flatMap((finding) => finding.referenceIds)),
        ],
      } as SkillResourceEvaluation;
    });
}

const EDGE_USAGES = ['read', 'write', 'invoke', 'delegate', 'reference'] as const;
const EDGE_CONFIDENCE = ['high', 'medium', 'low'] as const;

function mapCapabilityEdges(
  edges: AgentComponentResult['capabilityEdges'],
): StandardSkillBundleEvaluation['capabilityEdges'] {
  if (!Array.isArray(edges)) return undefined;
  const seen = new Set<string>();
  const mapped: NonNullable<
    StandardSkillBundleEvaluation['capabilityEdges']
  > = [];
  for (const edge of edges) {
    const capabilityName = (edge?.capabilityName ?? '').trim();
    const evidence = (edge?.evidence ?? '').trim();
    if (
      !capabilityName
      || !evidence
      || !evidenceNamesCapability(capabilityName, evidence)
      || seen.has(capabilityName)
    ) {
      continue;
    }
    seen.add(capabilityName);
    mapped.push({
      capabilityName,
      usage: (EDGE_USAGES as readonly string[]).includes(edge.usage ?? '')
        ? edge.usage
        : 'reference',
      evidence,
      confidence: (EDGE_CONFIDENCE as readonly string[]).includes(
        edge.confidence ?? '',
      ) ? edge.confidence : 'low',
    } as NonNullable<
      StandardSkillBundleEvaluation['capabilityEdges']
    >[number]);
  }
  return mapped;
}

function normalizeConfidence(
  value: string | undefined,
): 'high' | 'medium' | 'low' | undefined {
  const lower = (value ?? '').toLowerCase();
  return lower === 'high' || lower === 'medium' || lower === 'low'
    ? lower
    : undefined;
}

function mapMissingCapabilities(
  missing: AgentComponentResult['missingCapabilities'],
): StandardSkillBundleEvaluation['missingCapabilities'] {
  if (!Array.isArray(missing)) return undefined;
  return missing
    .map((item) => {
      const resourcePath = (item?.resourcePath ?? '').trim();
      const confidence = normalizeConfidence(item?.confidence);
      return {
        capabilityName: (item?.capabilityName ?? '').trim(),
        evidence: (item?.evidence ?? '').trim(),
        ...(resourcePath ? { resourcePath } : {}),
        ...(confidence ? { confidence } : {}),
      };
    })
    .filter((item) => item.capabilityName && item.evidence);
}

const DIMENSION_KEYS = [
  'Clarity',
  'Actionability',
  'Scope discipline',
  'Composability',
] as const;

function normalizeDimensions(
  dimensions: Array<{
    key: string;
    score: number;
    rationale: string;
    evidence?: string;
    improvement?: string;
  }> | undefined,
): StandardSkillBundleEvaluation['dimensions'] {
  if (!Array.isArray(dimensions)) return [];
  return dimensions
    .filter((dimension) =>
      (DIMENSION_KEYS as readonly string[]).includes(dimension?.key),
    )
    .map((dimension) => ({
      ...dimension,
      key: dimension.key as (typeof DIMENSION_KEYS)[number],
      ...(dimension.evidence?.trim()
        ? { evidence: dimension.evidence.trim() }
        : {}),
      ...(dimension.improvement?.trim()
        ? { improvement: dimension.improvement.trim() }
        : {}),
    }));
}

export function toStandardEvaluation(
  result: AgentComponentResult,
  sourceCorpus = '',
): StandardSkillBundleEvaluation {
  const findings: GroundedSkillFinding[] = [];
  const findingIndexes = new Map<string, number>();
  const hasMissingCapabilities = Array.isArray(result.missingCapabilities);
  const hasContradictions = Array.isArray(result.contradictions);

  const addFinding = (
    ruleId: string | undefined,
    evidenceValue: string | undefined,
    resourcePathValue: string | undefined,
  ): void => {
    const rule = ruleId ? getRule(ruleId) : undefined;
    const evidence = canonicalizeQuotedEvidence(evidenceValue);
    if (!rule || !evidence) return;
    const resourcePath = (resourcePathValue ?? '').trim() || undefined;
    const key = `${rule.ruleId}\u0000${evidence.toLowerCase()}`;
    const hydrated = {
      ...createRegisteredFinding(rule.ruleId, {
        resourcePath,
        evidence,
        fact: evidence,
      }),
      ai: true,
    };
    const existing = findingIndexes.get(key);
    if (existing === undefined) {
      findingIndexes.set(key, findings.length);
      findings.push(hydrated);
    } else if (!findings[existing].resourcePath && resourcePath) {
      findings[existing] = hydrated;
    }
  };

  for (const finding of result.findings ?? []) {
    if (finding?.ruleId === 'SKL-09' && hasMissingCapabilities) continue;
    if (finding?.ruleId === 'SKL-10' && hasContradictions) continue;
    addFinding(finding?.ruleId, finding?.evidence, finding?.resourcePath);
  }
  for (const missing of result.missingCapabilities ?? []) {
    const capabilityName = (missing?.capabilityName ?? '').trim();
    const evidence = (missing?.evidence ?? '').trim();
    if (
      !capabilityName
      || !evidenceNamesCapability(capabilityName, evidence)
    ) {
      continue;
    }
    addFinding('SKL-09', missing.evidence, missing.resourcePath);
  }
  for (const contradiction of result.contradictions ?? []) {
    const otherEvidence = (
      contradiction?.conflictingEvidence ?? ''
    ).trim();
    const otherPath = (
      contradiction?.conflictingResourcePath ?? ''
    ).trim();
    if (!otherEvidence || !otherPath) continue;
    if (
      sourceCorpus
      && !sourceCorpus.toLowerCase().includes(otherEvidence.toLowerCase())
    ) {
      continue;
    }
    if (
      !contradictionQuotesShareSubject(
        contradiction.evidence,
        otherEvidence,
      )
    ) {
      continue;
    }
    addFinding(
      'SKL-10',
      contradiction.evidence,
      contradiction.resourcePath,
    );
  }

  return {
    status: result.status ?? 'complete',
    dimensions: normalizeDimensions(result.dimensions),
    findings,
    resourcePurposeAlignment: result.resourcePurposeAlignment ?? [],
    operationalAssumptions: result.operationalAssumptions ?? [],
    unreviewedResources: result.unreviewedResources ?? [],
    summary: result.summary ?? '',
    referenceIds: [
      ...new Set(findings.flatMap((finding) => finding.referenceIds)),
    ],
    resources: mapResources(result.resources),
    capabilityEdges: mapCapabilityEdges(result.capabilityEdges),
    missingCapabilities: mapMissingCapabilities(result.missingCapabilities),
  };
}
