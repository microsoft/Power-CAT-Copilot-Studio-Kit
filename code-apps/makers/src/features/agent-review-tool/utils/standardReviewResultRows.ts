import {
  ReviewJobError,
  ReviewJobItemStatus,
  type ReviewJobItemRow,
} from '../agents-experience/contracts/ReviewJob';
import {
  STANDARD_REVIEW_UNIT_INDEXES,
  type StandardReviewUnit,
  type StandardReviewWorkflowCorpus,
} from '../contracts/StandardReviewWorkflow';

function parseResultJson(row: ReviewJobItemRow): unknown {
  if (!row.cat_resultjson?.trim()) {
    throw new ReviewJobError(
      'malformed-output',
      `Standard review unit ${row.cat_componentindex ?? 'unknown'} returned no result JSON.`,
    );
  }
  try {
    const parsed: unknown = JSON.parse(row.cat_resultjson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('the parsed result is not an object');
    }
    return parsed;
  } catch (error) {
    throw new ReviewJobError(
      'malformed-output',
      `Standard review unit ${row.cat_componentindex ?? 'unknown'} returned unreadable result JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Enforces the one-row-per-unit contract before workflow output reaches projection.
 */
export function parseStandardReviewResultRows(
  rows: ReviewJobItemRow[],
  corpus: StandardReviewWorkflowCorpus,
): ReadonlyMap<number, unknown> {
  const unitsByIndex = new Map<number, StandardReviewUnit>(
    corpus.standardReview.reviewUnits.map((unit) =>
      [unit.componentIndex, unit] as const));
  const expected = new Set<number>(STANDARD_REVIEW_UNIT_INDEXES);
  if (unitsByIndex.size !== expected.size
    || [...expected].some((index) => !unitsByIndex.has(index))) {
    throw new ReviewJobError(
      'malformed-output',
      'The submitted Standard review corpus does not contain all registered review units.',
    );
  }

  const unexpected = rows.filter((row) =>
    row.cat_componentindex === undefined || !expected.has(row.cat_componentindex));
  if (unexpected.length > 0) {
    throw new ReviewJobError(
      'malformed-output',
      `The Standard review job returned ${unexpected.length} unexpected result row(s).`,
    );
  }

  const results = new Map<number, unknown>();
  for (const index of STANDARD_REVIEW_UNIT_INDEXES) {
    const matching = rows.filter((row) => row.cat_componentindex === index);
    if (matching.length !== 1) {
      throw new ReviewJobError(
        'malformed-output',
        `Standard review unit ${index} returned ${matching.length} rows; exactly one is required.`,
      );
    }
    const row = matching[0];
    const unit = unitsByIndex.get(index)!;
    if (row.cat_itemstatus === ReviewJobItemStatus.Failed) {
      throw new ReviewJobError(
        'workflow-failed',
        row.cat_errormessage ?? `Standard review unit ${index} reported a failure.`,
      );
    }
    if (row.cat_componentid !== unit.unitId || row.cat_skillname !== unit.unitId) {
      throw new ReviewJobError(
        'malformed-output',
        `Standard review unit ${index} did not return the expected unit ID "${unit.unitId}".`,
      );
    }
    results.set(index, parseResultJson(row));
  }
  return results;
}
