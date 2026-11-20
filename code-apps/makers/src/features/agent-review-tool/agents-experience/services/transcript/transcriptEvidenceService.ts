import { MicrosoftDataverseService } from '../../../../../generated/services/MicrosoftDataverseService';
import type {
  EvidenceState,
  ObservationWindow,
  ParsedTranscriptEvidence,
} from '../../contracts/TranscriptEvidence';
import { buildEvidenceState } from './buildCoverage';
import { parseToolCallTraces } from './parseToolCallTraces';

/**
 * Reads an agent's conversation transcripts and turns them into
 * provisioning-gap evidence.
 *
 * `CSK - Maker` already grants Read on `conversationtranscript` at
 * Organization depth, so this needs no extra role. A failure here is therefore
 * far more likely to mean transcript capture is switched off for the
 * environment than that the user lacks a role — the surfaced reason says so.
 */

/** Default observation window. Long enough to catch weekly agents. */
export const DEFAULT_WINDOW_DAYS = 30;

/**
 * Hard ceiling on transcripts read for one agent. Reaching it marks the window
 * truncated, which lowers the confidence of every finding derived from it.
 *
 * Raised from 500 to align with the Admin app's debugger, which pages through
 * up to 2 000 transcript rows. At 500, a high-volume agent's window could
 * cover only a few days instead of the intended 30, producing premature
 * "not observed" findings.
 */
export const MAX_RECORDS = 2000;

/** Page budget, guarding against a runaway paging loop. */
export const MAX_PAGES = 40;

/** Rows per page. Transcript `content` is large, so pages are kept modest. */
export const PAGE_SIZE = 100;

/** Columns needed for evidence. `content` dominates the payload size. */
const SELECT_COLUMNS = 'conversationtranscriptid,content,createdon';

/**
 * Sentinel the Dataverse connector resolves to the environment this app is
 * deployed to. Established convention in this app — see
 * `agent-change-tracker/services/tracking-org.ts`, which ships it in
 * production, and `hooks/useFRE.ts`. Using it avoids any dependency on the SDK
 * surfacing an organization URL.
 */
export const CURRENT_ORGANIZATION = 'current';

/**
 * Chooses the organization to read transcripts from, or `null` to read nothing.
 *
 * The subtlety this encodes: `cat_sourceenvironment` is **empty** for a review
 * that ran in this app's own environment, because `ReviewService` stores
 * `orgUrl ?? ''` as that key. Empty therefore means "here", NOT "unknown".
 * Treating it as unknown disables the read and reports observed use as
 * unavailable for every ordinary same-environment review.
 *
 * @param isZipReview - Uploaded file: there is no environment to read.
 * @param isSavedReviewLoading - The saved record has not arrived yet, so its
 *   source environment is not yet known. Reading now could target the wrong org.
 * @param routeOrgUrl - Organization from the route, set for a cross-environment run.
 * @param savedSourceEnvironment - `cat_sourceenvironment` from the saved review.
 * @returns An organization for the connector, or `null` to skip the read.
 */
export function resolveEvidenceOrganization(options: {
  isZipReview: boolean;
  isSavedReviewLoading: boolean;
  routeOrgUrl?: string | null;
  savedSourceEnvironment?: string | null;
}): string | null {
  if (options.isZipReview || options.isSavedReviewLoading) return null;
  return (
    options.routeOrgUrl?.trim()
    || options.savedSourceEnvironment?.trim()
    || CURRENT_ORGANIZATION
  );
}

type TranscriptRow = {
  conversationtranscriptid?: string;
  content?: string;
  createdon?: string;
};

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

/** Pulls the `$skiptoken` value out of an OData `@odata.nextLink`. */
export function extractSkiptoken(nextLink: unknown): string | undefined {
  if (typeof nextLink !== 'string' || !nextLink) return undefined;

  // The commondataserviceforapps connector returns a nextLink of the form
  //   .../nextLink?organization=<org>&next=<encoded inner OData query>
  // so the real $skiptoken is nested inside `next`, not at the top level.
  try {
    const url = new URL(nextLink, 'https://placeholder.local');
    const next = url.searchParams.get('next');
    if (next) {
      const qIndex = next.indexOf('?');
      const qs = qIndex >= 0 ? next.substring(qIndex + 1) : next;
      const token = new URLSearchParams(qs).get('$skiptoken');
      if (token) return token;
    }
  } catch {
    /* fall through to the direct-match form below */
  }

  // Fallback: a native Web API nextLink carrying $skiptoken at the top level.
  const match = /[?&]\$skiptoken=([^&]+)/i.exec(nextLink);
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/** Builds the window the reviewer sees, anchored on a caller-supplied clock. */
export function buildObservationWindow(options: {
  days: number;
  now: Date;
  conversations: number;
  truncated: boolean;
}): ObservationWindow {
  const end = options.now;
  const start = new Date(end.getTime() - options.days * 24 * 60 * 60 * 1000);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    days: options.days,
    conversations: options.conversations,
    truncated: options.truncated,
  };
}

/** Batch sizes to try when a page times out. Smaller pages are more likely to succeed. */
const PAGE_SIZE_FALLBACKS: readonly number[] = [PAGE_SIZE, 50, 25];

/**
 * Pages through `conversationtranscript` for one agent.
 *
 * Ported from the Admin `paginateConnectorQuery`, but calling the Makers typed
 * wrapper instead of the raw client, so the generated service stays the only
 * connector boundary.
 */
async function listTranscripts(options: {
  botId: string;
  organizationUrl: string;
  sinceIso: string;
}): Promise<{ success: boolean; rows: TranscriptRow[]; truncated: boolean }> {
  const safeBotId = escapeODataString(options.botId.trim());
  const filter =
    `_bot_conversationtranscriptid_value eq '${safeBotId}'` +
    ` and createdon ge ${options.sinceIso}`;

  for (const batchSize of PAGE_SIZE_FALLBACKS) {
    const attempt = await listTranscriptsAtPageSize(
      options.organizationUrl, filter, batchSize,
    );
    if (attempt !== 'timeout') return attempt;
  }
  return { success: false, rows: [], truncated: false };
}

/** Single attempt at a given page size. Returns `'timeout'` to signal a retry with a smaller batch. */
async function listTranscriptsAtPageSize(
  organizationUrl: string,
  filter: string,
  batchSize: number,
): Promise<{ success: boolean; rows: TranscriptRow[]; truncated: boolean } | 'timeout'> {
  const rows: TranscriptRow[] = [];
  let skiptoken: string | undefined;
  let page = 0;
  let truncated = false;

  while (true) {
    page += 1;
    let result;
    try {
      result = await MicrosoftDataverseService.ListRecordsWithOrganization(
        organizationUrl,
        'conversationtranscripts',
        `odata.maxpagesize=${batchSize}`,
        'application/json',
        undefined,
        undefined,
        SELECT_COLUMNS,
        filter,
        'createdon desc',
        undefined,
        undefined,
        // Do not pass $top when paginating. Dataverse documents that $top and
        // Prefer: odata.maxpagesize must not be combined; the connector
        // behaviour is unpredictable. The MAX_RECORDS guard below enforces the
        // ceiling instead.
        undefined,
        skiptoken,
      );
    } catch {
      // A timeout or network error on page 1 → retry with smaller batch.
      // After page 1, keep partial rows and mark truncated.
      if (rows.length === 0) return 'timeout';
      return { success: true, rows, truncated: true };
    }

    if (!result.success || !result.data) {
      if (rows.length === 0) {
        // First-page connector failure may be a timeout — signal retry.
        return 'timeout';
      }
      return { success: true, rows, truncated: true };
    }

    const data = result.data as { value?: TranscriptRow[]; '@odata.nextLink'?: string };
    const pageRows = data.value ?? [];
    rows.push(...pageRows);

    skiptoken = extractSkiptoken(data['@odata.nextLink']);

    if (rows.length >= MAX_RECORDS) {
      truncated = true;
      break;
    }
    if (!skiptoken || pageRows.length === 0) break;
    if (page >= MAX_PAGES) {
      truncated = true;
      break;
    }
  }

  return { success: true, rows, truncated };
}

/**
 * Produces the evidence state for one agent.
 *
 * Never throws. Any failure resolves to `no-access`, because a broken evidence
 * read must not take down the published-band planning calculator that shares
 * the tab.
 */
export async function loadTranscriptEvidence(options: {
  botId: string;
  organizationUrl: string;
  configuredSkills?: readonly string[];
  windowDays?: number;
  now?: Date;
}): Promise<EvidenceState> {
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  if (!options.botId?.trim() || !options.organizationUrl?.trim()) {
    return {
      status: 'no-access',
      reason: 'The agent or environment could not be identified, so transcripts were not read.',
    };
  }

  let listed: { success: boolean; rows: TranscriptRow[]; truncated: boolean };
  try {
    listed = await listTranscripts({
      botId: options.botId,
      organizationUrl: options.organizationUrl,
      sinceIso: since.toISOString(),
    });
  } catch {
    listed = { success: false, rows: [], truncated: false };
  }

  if (!listed.success) {
    return {
      status: 'no-access',
      reason:
        'Conversation transcripts could not be read for this environment. ' +
        'Transcript capture is most likely switched off in the environment settings.',
    };
  }

  const parsed: ParsedTranscriptEvidence[] = listed.rows.map((row) =>
    parseToolCallTraces(row.content),
  );

  const window = buildObservationWindow({
    days: windowDays,
    now,
    conversations: listed.rows.length,
    truncated: listed.truncated,
  });

  return buildEvidenceState({
    parsed,
    window,
    configuredSkills: options.configuredSkills ?? [],
  });
}
