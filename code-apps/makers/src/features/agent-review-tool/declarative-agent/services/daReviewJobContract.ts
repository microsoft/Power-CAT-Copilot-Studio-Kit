/**
 * The Declarative Agent job contract: the corpus a review submits, and the rules
 * for reading the rows that come back.
 *
 * Both halves are pure. Nothing here reaches Dataverse, so a second host can
 * submit and interpret a Declarative Agent job without reimplementing either
 * shape — which is the point of the split. `DAReviewJobService` keeps the part
 * that does touch Dataverse and re-exports this module, so nothing that already
 * imports from there has to change.
 *
 * The parser is deliberately suspicious of its own rows. A job writes one row
 * per rule, but nothing in the transport guarantees the rows that come back are
 * the rows that were asked for: an unexpected row, a duplicate, a mismatched
 * correlation ID or unreadable JSON all mean the result cannot be attributed to
 * a rule. Every one of those becomes a rejected outcome rather than a silently
 * dropped row, because a rule that was never really evaluated must not read as
 * a rule that passed.
 */
import {
  ReviewJobItemStatus,
  type ReviewJobItemRow,
  type ReviewJobSubmissionCorpus,
} from '../../agents-experience/contracts/ReviewJob';
import type { DAEvidenceRecord } from '../contracts/DAPackageReview';
import type {
  DARejectedWorkflowOutcome,
  DASemanticCriterion,
  DAWorkflowOutcome,
  DAWorkflowRequest,
} from '../contracts/DAWorkflowReview';

export interface DAReviewJobComponent {
  componentIndex: number;
  ruleId: string;
  criterion: DASemanticCriterion;
  contractVersion: string;
  correlationId: string;
  agent: DAWorkflowRequest['agent'];
  evidence: DAEvidenceRecord[];
}

export interface DAReviewJobCorpus extends ReviewJobSubmissionCorpus {
  schemaVersion: 1;
  jobKind: 'DeclarativeAgent';
  generatedBy: string;
  generatedOn: string;
  review: {
    correlationId: string;
    botId: string;
    botName: string;
    sourceEnvironment: string;
    componentCount: number;
  };
  declarativeReview: {
    request: DAWorkflowRequest;
  };
  components: DAReviewJobComponent[];
}

export interface DAReviewJobItemPayload {
  contractVersion: string;
  correlationId: string;
  outcome: DAWorkflowOutcome;
}

export interface ParsedDAReviewJobRows {
  outcomes: DAWorkflowOutcome[];
  rejected: DARejectedWorkflowOutcome[];
}

/**
 * Builds the immutable job file consumed by the Declarative Agent workflow.
 * Each loop component contains only evidence allowed for that rule.
 */
export function buildDAReviewJobCorpus(
  request: DAWorkflowRequest,
): DAReviewJobCorpus {
  const evidenceById = new Map(
    request.evidence.map((evidence) => [evidence.evidenceId, evidence]),
  );
  const components = request.rules.map((rule, componentIndex) => ({
    componentIndex,
    ruleId: rule.ruleId,
    criterion: rule.criterion,
    contractVersion: request.contractVersion,
    correlationId: request.correlationId,
    agent: request.agent,
    evidence: rule.evidenceIds
      .map((evidenceId) => evidenceById.get(evidenceId))
      .filter((evidence): evidence is DAEvidenceRecord => evidence !== undefined),
  }));

  return {
    schemaVersion: 1,
    jobKind: 'DeclarativeAgent',
    generatedBy: 'Copilot Studio Kit Makers',
    generatedOn: new Date().toISOString(),
    review: {
      correlationId: request.correlationId,
      botId: request.agent.id,
      botName: request.agent.name,
      sourceEnvironment: 'package-upload',
      componentCount: components.length,
    },
    declarativeReview: { request },
    components,
  };
}

function reject(
  rejected: DARejectedWorkflowOutcome[],
  ruleId: string | undefined,
  reason: string,
): void {
  rejected.push({ ...(ruleId ? { ruleId } : {}), reason });
}

function parseItemPayload(
  row: ReviewJobItemRow,
): DAReviewJobItemPayload | null {
  if (!row.cat_resultjson?.trim()) return null;
  try {
    const parsed = JSON.parse(row.cat_resultjson) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as DAReviewJobItemPayload;
  } catch {
    return null;
  }
}

/**
 * Converts job-item rows into workflow outcomes without trusting row identity
 * or JSON. Invalid rows remain visible as rejected outcomes.
 */
export function parseDAReviewJobRows(
  request: DAWorkflowRequest,
  rows: ReviewJobItemRow[],
): ParsedDAReviewJobRows {
  const outcomes: DAWorkflowOutcome[] = [];
  const rejected: DARejectedWorkflowOutcome[] = [];
  const ruleByIndex = new Map(
    request.rules.map((rule, index) => [index, rule] as const),
  );

  for (const row of rows) {
    if (
      row.cat_componentindex === undefined
      || !ruleByIndex.has(row.cat_componentindex)
    ) {
      reject(
        rejected,
        row.cat_componentid ?? row.cat_skillname,
        'The workflow returned an unexpected Declarative Agent result row.',
      );
    }
  }

  for (const [index, rule] of ruleByIndex) {
    const matching = rows.filter((row) => row.cat_componentindex === index);
    if (matching.length === 0) {
      reject(rejected, rule.ruleId, 'The workflow returned no result row for the requested rule.');
      continue;
    }
    if (matching.length > 1) {
      reject(rejected, rule.ruleId, 'The workflow returned the requested rule more than once.');
      continue;
    }

    const row = matching[0];
    if (
      row.cat_componentid !== rule.ruleId
      || row.cat_skillname !== rule.ruleId
    ) {
      reject(rejected, rule.ruleId, 'The workflow row did not identify the expected rule.');
      continue;
    }
    if (row.cat_correlationid !== request.correlationId) {
      reject(rejected, rule.ruleId, 'The workflow row correlation ID does not match the request.');
      continue;
    }
    if (row.cat_itemstatus !== ReviewJobItemStatus.Succeeded) {
      reject(
        rejected,
        rule.ruleId,
        row.cat_errormessage?.trim()
          || (
            row.cat_itemstatus === ReviewJobItemStatus.Failed
              ? 'The workflow rule evaluation failed.'
              : 'The workflow row does not contain a successful item status.'
          ),
      );
      continue;
    }

    const payload = parseItemPayload(row);
    if (!payload) {
      reject(rejected, rule.ruleId, 'The workflow row does not contain readable result JSON.');
      continue;
    }
    if (payload.contractVersion !== request.contractVersion) {
      reject(rejected, rule.ruleId, 'The workflow item contract version does not match the request.');
      continue;
    }
    if (payload.correlationId !== request.correlationId) {
      reject(rejected, rule.ruleId, 'The workflow item correlation ID does not match the request.');
      continue;
    }
    if (!payload.outcome || typeof payload.outcome !== 'object') {
      reject(rejected, rule.ruleId, 'The workflow item does not contain an outcome.');
      continue;
    }
    if (payload.outcome.ruleId !== rule.ruleId) {
      reject(rejected, rule.ruleId, 'The workflow outcome rule ID does not match the row identity.');
      continue;
    }

    outcomes.push(payload.outcome);
  }

  return { outcomes, rejected };
}
