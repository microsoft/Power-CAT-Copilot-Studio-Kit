import type { DAManifest } from '../contracts/DAManifest';
import type { DAEvidenceRecord, DAPackageEvidence } from '../contracts/DAPackageReview';
import type {
  DASemanticCriterion,
  DAVerifiedWorkflowResponse,
  DAWorkflowRequest,
  DAWorkflowResponse,
  DAWorkflowRule,
} from '../contracts/DAWorkflowReview';
import { redactSecrets } from '../../agents-experience/services/skill/resourceScanners';

export const DA_WORKFLOW_CONTRACT_VERSION = '1.0';

function sanitizeRecord(record: DAEvidenceRecord): DAEvidenceRecord {
  return {
    ...record,
    content: redactSecrets(record.content),
  };
}

function matchingIds(evidence: DAEvidenceRecord[], predicate: (record: DAEvidenceRecord) => boolean): string[] {
  return evidence
    .filter((record) => record.status === 'available' && predicate(record))
    .map((record) => record.evidenceId);
}

function addRule(
  rules: DAWorkflowRule[],
  ruleId: string,
  criterion: DASemanticCriterion,
  evidenceIds: string[],
): void {
  if (evidenceIds.length > 0) rules.push({ ruleId, criterion, evidenceIds });
}

/**
 * Builds the strict, sanitized evidence request used by the declarative-agent
 * review workflow. Inapplicable criteria are omitted before transport.
 */
export function buildDAWorkflowRequest(
  manifest: DAManifest,
  packageEvidence: DAPackageEvidence,
  options: { correlationId: string },
): DAWorkflowRequest {
  const evidence = packageEvidence.records.map(sanitizeRecord);
  const pathsByKind = new Map<string, Set<string>>();
  for (const document of packageEvidence.documents) {
    const paths = pathsByKind.get(document.kind) ?? new Set<string>();
    paths.add(document.path);
    pathsByKind.set(document.kind, paths);
  }
  const hasDocumentKind = (record: DAEvidenceRecord, ...kinds: string[]) =>
    kinds.some((kind) => pathsByKind.get(kind)?.has(record.sourceFile));
  const instructions = matchingIds(evidence, (record) => record.jsonPath === '$.instructions');
  const purpose = matchingIds(evidence, (record) => record.jsonPath === '$.description');
  const fitContext = [...instructions, ...purpose];
  const capabilities = matchingIds(
    evidence,
    (record) => record.jsonPath === '$.capabilities',
  );
  const knowledge = matchingIds(
    evidence,
    (record) =>
      record.jsonPath === '$.capabilities' ||
      hasDocumentKind(record, 'knowledge'),
  );
  const actions = matchingIds(
    evidence,
    (record) =>
      record.jsonPath === '$.actions' ||
      hasDocumentKind(record, 'plugin', 'openapi', 'mcp-tools'),
  );
  const starters = matchingIds(evidence, (record) => record.jsonPath === '$.conversation_starters');

  const rules: DAWorkflowRule[] = [];
  addRule(rules, 'semantic.instructions.quality', 'instructions', instructions);
  if (knowledge.length > 0) {
    addRule(rules, 'semantic.knowledge.fit', 'knowledge', [...new Set([...knowledge, ...fitContext])]);
  }
  if (capabilities.length > 0) {
    addRule(rules, 'semantic.capabilities.fit', 'capabilities', [...new Set([...capabilities, ...fitContext])]);
  }
  if (manifest.actions.length > 0) {
    addRule(rules, 'semantic.actions.quality', 'actions', actions);
  }
  if (manifest.conversationStarters.length > 0) {
    addRule(rules, 'semantic.conversation-starters.quality', 'conversationStarters', starters);
  }
  addRule(
    rules,
    'semantic.graceful-error-handling',
    'gracefulErrorHandling',
    instructions,
  );

  const usedEvidence = new Set(rules.flatMap((rule) => rule.evidenceIds));
  return {
    contractVersion: DA_WORKFLOW_CONTRACT_VERSION,
    correlationId: options.correlationId,
    agent: {
      id: manifest.daId || manifest.appId,
      name: manifest.name || manifest.shortName,
      version: manifest.schemaVersion,
    },
    rules,
    evidence: evidence.filter((record) => usedEvidence.has(record.evidenceId)),
  };
}

/**
 * Verifies workflow output against the exact request sent by the Code App.
 * Invalid outcomes are rejected as units; they never enter scoring.
 */
export function verifyDAWorkflowResponse(
  request: DAWorkflowRequest,
  response: DAWorkflowResponse,
): DAVerifiedWorkflowResponse {
  if (response.contractVersion !== request.contractVersion) {
    throw new Error(
      `Declarative review workflow contract mismatch: expected ${request.contractVersion}, received ${response.contractVersion}.`,
    );
  }
  if (response.correlationId !== request.correlationId) {
    throw new Error('Declarative review workflow correlation ID does not match the submitted request.');
  }
  if (response.state === 'failed') {
    throw new Error(
      typeof response.error === 'string' && response.error.trim()
        ? response.error.trim()
        : 'Declarative review workflow failed.',
    );
  }
  if (response.state !== 'completed') {
    throw new Error('Declarative review workflow returned an unsupported state.');
  }
  if (!Array.isArray(response.outcomes)) {
    throw new Error('Declarative review workflow response does not contain an outcomes array.');
  }

  const ruleById = new Map(request.rules.map((rule) => [rule.ruleId, rule]));
  const evidenceById = new Map(request.evidence.map((record) => [record.evidenceId, record]));
  const outcomeCountByRule = response.outcomes.reduce((counts, outcome) => {
    if (outcome && typeof outcome.ruleId === 'string') {
      counts.set(outcome.ruleId, (counts.get(outcome.ruleId) ?? 0) + 1);
    }
    return counts;
  }, new Map<string, number>());
  const outcomes: DAVerifiedWorkflowResponse['outcomes'] = [];
  const rejected: DAVerifiedWorkflowResponse['rejected'] = [];

  for (const outcome of response.outcomes) {
    if (!outcome || typeof outcome !== 'object') {
      rejected.push({ reason: 'The workflow returned an invalid outcome value.' });
      continue;
    }
    const ruleId = typeof outcome.ruleId === 'string' ? outcome.ruleId : '';
    const reject = (reason: string) => {
      rejected.push({ ruleId: ruleId || undefined, reason });
    };
    if (!ruleId) {
      reject('The workflow outcome does not contain a rule identifier.');
      continue;
    }
    const rule = ruleById.get(ruleId);
    if (!rule) {
      reject('The workflow returned a rule that was not requested.');
      continue;
    }
    if ((outcomeCountByRule.get(ruleId) ?? 0) > 1) {
      reject('The workflow returned the same rule more than once.');
      continue;
    }
    if (!['Pass', 'Warning', 'Fail', 'Not assessed'].includes(outcome.status)) {
      reject('The workflow returned an unsupported status.');
      continue;
    }
    if (typeof outcome.explanation !== 'string' || !outcome.explanation.trim()) {
      reject('The workflow outcome does not contain an explanation.');
      continue;
    }
    if (
      (outcome.status === 'Warning' || outcome.status === 'Fail') &&
      (typeof outcome.recommendation !== 'string' || !outcome.recommendation.trim())
    ) {
      reject('A warning or failure does not contain a recommendation.');
      continue;
    }
    if (!Array.isArray(outcome.evidence)) {
      reject('The workflow outcome does not contain an evidence array.');
      continue;
    }
    if (outcome.status !== 'Not assessed' && outcome.evidence.length === 0) {
      reject('An assessed outcome does not contain evidence.');
      continue;
    }

    const invalidEvidence = outcome.evidence.some((reference) => {
      if (
        !reference ||
        typeof reference.evidenceId !== 'string' ||
        typeof reference.exactExcerpt !== 'string'
      ) {
        return true;
      }
      const evidence = evidenceById.get(reference.evidenceId);
      return !evidence ||
        !rule.evidenceIds.includes(reference.evidenceId) ||
        evidence.status !== 'available' ||
        !reference.exactExcerpt.trim() ||
        !evidence.content.includes(reference.exactExcerpt);
    });
    if (invalidEvidence) {
      reject('The workflow evidence is unknown, not allowed for the rule, or not an exact excerpt.');
      continue;
    }

    outcomes.push(outcome);
  }

  return { outcomes, rejected };
}
