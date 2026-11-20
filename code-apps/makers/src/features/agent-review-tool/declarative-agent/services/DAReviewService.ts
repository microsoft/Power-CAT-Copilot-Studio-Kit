/**
 * DAReviewService.ts
 *
 * Dataverse CRUD for DA review records.
 * Wraps the generated Cat_agentreviewsesService for DA-specific operations.
 * Filters by cat_agenttype = 2 (M365DeclarativeAgent).
 *
 * Flat columns written on upsert:
 *   cat_agentname, cat_agentversion, cat_publishername, cat_sourcetype,
 *   cat_overallscore, cat_totalissues
 * These allow the grid and stat cards to be derived from Dataverse query
 * results without parsing the full JSON blob per row.
 *
 * JSON blob stored in cat_reviewresultjson (Memo, 1048576) — replaces the
 * file column approach which is not supported in Code Apps.
 */

import { Cat_agentreviewsesService } from '../../../../generated/services/Cat_agentreviewsesService';
import type { DAReviewRecord } from '../contracts/DAReviewRecord';
import { AGENT_TYPE } from '../contracts/constants';
import {
  buildDAReviewRecord,
  parseDAReviewResult,
  serializeDAReviewResult,
  type DAStoredReviewData,
} from './daReviewRecordContract';

// The row mapping lives in `daReviewRecordContract` so a host without the generated client can
// write the same shape. Re-exported here because every existing caller already imports it from this
// module, and one definition behind two names is still one definition.
export { parseDAReviewResult, serializeDAReviewResult };

/**
 * Reads a stored number column. The generated model types the score and issue
 * columns as strings, but Dataverse returns Integer columns as numbers.
 */
function parseStoredScore(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

function parseStoredCount(value: unknown): number | undefined {
  const count = parseStoredScore(value);
  return count === null ? undefined : Math.max(0, Math.trunc(count));
}

/**
 * Fetches all DA reviews (cat_agenttype = 2) from Dataverse.
 *
 * @returns Array of DAReviewRecord (flat columns only — no JSON blob)
 */
export async function getDAReviews(): Promise<DAReviewRecord[]> {
  const result = await Cat_agentreviewsesService.getAll({
    filter: `cat_agenttype eq ${AGENT_TYPE.M365_DECLARATIVE_AGENT}`,
    select: [
      'cat_agentreviewsid',
      'cat_componentidunique',
      'cat_agentname',
      'cat_agentversion',
      'cat_publishername',
      'cat_sourcetype',
      'cat_overallscore',
      'cat_totalissues',
      'cat_reviewdate',
      'cat_reviewstatus',
    ],
    orderBy: ['cat_reviewdate desc'],
  });

  if (!result.success || !result.data) {
    console.error('Failed to fetch DA reviews:', result.error);
    return [];
  }

  return result.data.map((row) => {
    const rowAny = row as unknown as Record<string, unknown>;
    return {
      reviewId: row.cat_agentreviewsid,
      componentIdUnique: row.cat_componentidunique ?? '',
      agentName: (rowAny['cat_agentname'] as string) ?? '',
      agentVersion: (rowAny['cat_agentversion'] as string) ?? '',
      publisherName: (rowAny['cat_publishername'] as string) ?? '',
      sourceType: ((rowAny['cat_sourcetype'] as string) ?? 'zip') as 'zip' | 'graph-api',
      overallScore: parseStoredScore(row.cat_overallscore),
      totalIssues: parseStoredCount(row.cat_totalissues),
      reviewedOn: row.cat_reviewdate ? new Date(row.cat_reviewdate) : undefined,
      iconBase64: null,
    };
  });
}

/**
 * Fetches a single DA review by ID with full JSON blob (manifest, health, evaluation).
 *
 * @param reviewId - Dataverse record ID
 * @returns Full DAReviewRecord including manifest and evaluation data
 */
export async function getDAReviewById(reviewId: string): Promise<DAReviewRecord | null> {
  const result = await Cat_agentreviewsesService.get(reviewId, {
    select: [
      'cat_agentreviewsid',
      'cat_componentidunique',
      'cat_agentname',
      'cat_agentversion',
      'cat_publishername',
      'cat_sourcetype',
      'cat_overallscore',
      'cat_totalissues',
      'cat_reviewdate',
      'cat_reviewresultjson',
    ],
  });

  if (!result.success || !result.data) {
    console.error('Failed to fetch DA review:', result.error);
    return null;
  }

  const row = result.data;
  const rowAny = row as unknown as Record<string, unknown>;

  let stored: DAStoredReviewData = {};

  const jsonText = rowAny['cat_reviewresultjson'] as string | undefined;
  if (jsonText) {
    try {
      stored = parseDAReviewResult(jsonText);
    } catch (error) {
      console.warn('Failed to parse DA review result JSON from cat_reviewresultjson', error);
    }
  }

  return {
    reviewId: row.cat_agentreviewsid,
    componentIdUnique: row.cat_componentidunique ?? '',
    agentName: (rowAny['cat_agentname'] as string) ?? '',
    agentVersion: (rowAny['cat_agentversion'] as string) ?? '',
    publisherName: (rowAny['cat_publishername'] as string) ?? '',
    sourceType: ((rowAny['cat_sourcetype'] as string) ?? 'zip') as 'zip' | 'graph-api',
    overallScore: parseStoredScore(row.cat_overallscore),
    totalIssues: parseStoredCount(row.cat_totalissues),
    reviewedOn: row.cat_reviewdate ? new Date(row.cat_reviewdate) : undefined,
    iconBase64: null,
    ...stored,
  };
}

/**
 * Creates or updates a DA review record in Dataverse.
 * Deduplication key: cat_componentidunique.
 * Review result JSON is stored in cat_reviewresultjson (Memo column).
 *
 * @param data - DA review data to save
 * @returns The reviewId of the created/updated record
 */
export async function upsertDAReview(data: DAReviewRecord): Promise<string> {
  // Check for existing record by componentIdUnique
  const existingResult = await Cat_agentreviewsesService.getAll({
    filter: `cat_componentidunique eq '${data.componentIdUnique}' and cat_agenttype eq ${AGENT_TYPE.M365_DECLARATIVE_AGENT}`,
    select: ['cat_agentreviewsid'],
    top: 1,
  });

  const existingId =
    existingResult.success &&
    existingResult.data &&
    existingResult.data.length > 0
      ? existingResult.data[0].cat_agentreviewsid
      : undefined;

  const record = buildDAReviewRecord(data);

  if (existingId) {
    const updateResult = await Cat_agentreviewsesService.update(
      existingId,
      record as unknown as Parameters<typeof Cat_agentreviewsesService.update>[1]
    );
    if (!updateResult.success) {
      const msg = (updateResult.error as Record<string, unknown> | undefined)?.['message'] as string | undefined;
      throw new Error(`Failed to update DA review: ${msg ?? JSON.stringify(updateResult.error)}`);
    }
    return existingId;
  }

  const createResult = await Cat_agentreviewsesService.create(
    record as unknown as Parameters<typeof Cat_agentreviewsesService.create>[0]
  );
  if (!createResult.success || !createResult.data) {
    const msg = (createResult.error as Record<string, unknown> | undefined)?.['message'] as string | undefined;
    throw new Error(`Failed to create DA review: ${msg ?? JSON.stringify(createResult.error)}`);
  }

  return createResult.data.cat_agentreviewsid;
}
