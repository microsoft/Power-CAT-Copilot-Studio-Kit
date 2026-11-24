/**
 * Dataverse access for the review job tables (spec 014).
 *
 * Uses the generated per-table services. Those resolve the environment from the
 * app's own data-source registration, which is the only path that works for the
 * current environment: the generic `MicrosoftDataverseService` operations are
 * the cross-environment API and need an explicit org URL, and calling them
 * without one fails with `Resource not found for the segment '<entity set>'` --
 * an error that reads like a missing table but is not.
 *
 * The services are produced by `pac code add-data-source -a dataverse -t <table>`.
 * Note `-a dataverse`: passing the connector id (`shared_commondataserviceforapps`)
 * instead reports success but registers nothing.
 */
import { Cat_agentreviewjobsService } from '../../../../../generated/services/Cat_agentreviewjobsService';
import { Cat_agentreviewjobitemsService } from '../../../../../generated/services/Cat_agentreviewjobitemsService';
import { isComponentRow, mapReviewJobItems, safeParse } from './reviewJobMapping';
import type { NodeKind } from '../../../review-core/rule';
import { routeForSubmission, toArc2BotId } from './aiWorkflowRouting';
export { AGENT_LEVEL_INDEX, RESOURCE_INDEX_BASE, isComponentRow, mapReviewJobItems } from './reviewJobMapping';
import {
  ReviewHarness,
  ReviewJobItemStatus,
  ReviewJobError,
  corpusKindToJobKind,
  type AgentComponentResult,
  type ReviewJobItemRow,
  type ReviewJobRow,
  type ReviewJobSubmissionCorpus,
} from '../../contracts/ReviewJob';

/** Columns the client reads while polling. Never selects the file columns. */
const POLL_SELECT = [
  'cat_agentreviewjobid',
  'cat_jobstatus',
  'cat_laststatus',
  'cat_errormessage',
  'cat_componentcount',
  'modifiedon',
];

/** Columns read from each per-component result row. */
const ITEM_SELECT = [
  'cat_agentreviewjobitemid',
  'cat_componentid',
  'cat_skillname',
  'cat_componentindex',
  'cat_itemstatus',
  'cat_correlationid',
  'cat_resultjson',
  'cat_errormessage',
  'createdon',
];

function unwrap<T>(
  result: { success: boolean; data?: T; error?: { message?: string } },
  what: string,
): T {
  if (!result.success || result.data === undefined || result.data === null) {
    throw new ReviewJobError(
      'workflow-failed',
      `${what} failed: ${result.error?.message ?? 'unknown error'}`,
    );
  }
  return result.data;
}

/**
 * Creates a job row, uploads the corpus, then marks the row Queued.
 *
 * The order matters and is not arbitrary. A file cannot be attached to a row
 * that does not exist yet, so create-then-upload is forced. If the row were
 * created already Queued, the Dataverse trigger would fire in the window
 * before the upload lands and the workflow would read an empty file column.
 * Setting the status last makes the corpus a precondition of the trigger.
 *
 * @param corpus - The whole-review corpus.
 * @returns The new job row id.
 */
export async function createReviewJob(
  corpus: ReviewJobSubmissionCorpus,
  signal?: AbortSignal,
): Promise<string> {
  const { assertReviewWorkflowAvailable } = await import('../../../services/ReviewWorkflowAvailabilityService');
  await assertReviewWorkflowAvailable(signal);
  signal?.throwIfAborted();
  const componentCount = corpus.review.componentCount
    ?? corpus.components?.length
    ?? corpus.standardReview?.reviewUnits.length
    ?? 0;
  // A `StandardReview` corpus is by definition the standard harness, so the
  // column is filled from the discriminator rather than left unset.
  const harness = corpus.harness
    ?? (corpus.jobKind === 'StandardReview' ? 'Standard' : undefined);
  // Which flow claims this row. Applies to every harness: both call sites of
  // this function (the Standard workflow and the shared AI provider, which
  // serves the Copilot, DeclarativeAgent and Skill paths) route the same way,
  // so no harness is left pointing at the frozen ART flow.
  const route = routeForSubmission(corpus.review.botId);
  // 1. Create without a status: the trigger filters on Queued, so this row is
  //    invisible to the workflow until the corpus is in place.
  //
  // The generated `create` type requires `ownerid`, `owneridtype` and
  // `statecode`. Dataverse assigns all three on insert, so they are omitted and
  // the record is cast to the parameter type rather than filled with values the
  // platform would overwrite anyway.
  const created = await Cat_agentreviewjobsService.create({
    cat_name: `${corpus.review.botName} - ${componentCount} components`,
    cat_jobkind: corpusKindToJobKind(corpus.jobKind),
    ...(harness ? { cat_harness: ReviewHarness[harness] } : {}),
    cat_correlationid: corpus.review.correlationId,
    cat_botid: route.botId,
    cat_botname: corpus.review.botName,
    cat_componentcount: componentCount,
  } as unknown as Parameters<typeof Cat_agentreviewjobsService.create>[0]);

  const jobId = unwrap(created, 'Create review job').cat_agentreviewjobid;
  if (!jobId) {
    throw new ReviewJobError('workflow-failed', 'Review job created without an id.');
  }

  // 2. Attach the corpus.
  const corpusFile = new File(
    [JSON.stringify(corpus)],
    'review-corpus.json',
    { type: 'application/octet-stream' },
  );
  const upload = await Cat_agentreviewjobsService.upload(
    jobId,
    'cat_inputfile',
    corpusFile,
    'review-corpus.json',
  );
  if (!upload.success) {
    throw new ReviewJobError(
      'workflow-failed',
      `Corpus upload failed: ${upload.error?.message ?? 'unknown error'}`,
    );
  }

  // 3. Release the row to its flow. This is the change the trigger reacts to,
  //    and the status decides which workflow sees it.
  //
  // The generated model still spells `cat_jobstatus` as the four original
  // choices. `ARC2Queued` (100000000) is a real option on the Dataverse column —
  // it is what the ARC2 trigger filters on — but `src/generated/**` is written
  // from metadata and is never hand-edited, so the payload is cast here instead.
  const queue = await Cat_agentreviewjobsService.update(jobId, {
    cat_jobstatus: route.queuedStatus,
  } as unknown as Parameters<typeof Cat_agentreviewjobsService.update>[1]);
  if (!queue.success) {
    throw new ReviewJobError(
      'workflow-failed',
      `Could not queue the review job: ${queue.error?.message ?? 'unknown error'}`,
    );
  }

  return jobId;
}

/**
 * Reads the polling columns for a job row.
 *
 * @param jobId - Job row id.
 */
export async function getReviewJob(jobId: string): Promise<ReviewJobRow> {
  const result = await Cat_agentreviewjobsService.get(jobId, {
    select: POLL_SELECT as never,
  });
  return unwrap(result, 'Read review job') as unknown as ReviewJobRow;
}

/** How far before the client's own start time a matching job may have been created. */
const RESUME_MATCH_BACK_MS = 5 * 60 * 1000;

/** How long after the client's start time a matching job may have been created. */
const RESUME_MATCH_FORWARD_MS = 30 * 60 * 1000;

/**
 * Finds the job a review started, given only what the review row remembers.
 *
 * This is what lets a review survive the browser closing. The client that
 * submitted the job is gone, so the job id it held is gone with it — but the
 * job carries `cat_botid`, and for an upload that id is derived from the
 * artifact hash, which the review row stores. The job is therefore addressable
 * from the row alone.
 *
 * The time window exists because one artifact can be reviewed more than once,
 * and every one of those runs shares a botId. A job is created moments after
 * its row is reserved, so the first job at or after `startedAt` is the right
 * one. The window is bounded on both sides rather than open-ended: browser and
 * server clocks are not the same clock, so a little slack is needed backwards,
 * and an unbounded forward window would let a much later re-review be collected
 * onto an older row.
 *
 * @param botId - Synthetic bot id the job was submitted under.
 * @param startedAt - When the client reserved the review row.
 * @returns The matching job, or null when none can be matched or the read fails.
 */
export async function findLatestJobForBot(
  botId: string,
  startedAt: Date,
): Promise<ReviewJobRow | null> {
  // A quote would break out of the OData literal. No legitimate synthetic id
  // contains one, so this is a guard rather than an escape.
  if (botId.includes("'")) return null;

  const from = new Date(startedAt.getTime() - RESUME_MATCH_BACK_MS).toISOString();
  const to = new Date(startedAt.getTime() + RESUME_MATCH_FORWARD_MS).toISOString();

  // Both spellings are matched because the caller holds the bare id while an
  // ARC2 row stores it prefixed. Matching only one of them would have resume
  // silently find nothing for every job submitted on the other side of the
  // routing switch — the review would restart rather than reattach.
  const prefixed = toArc2BotId(botId);

  const result = await Cat_agentreviewjobsService.getAll({
    select: [...POLL_SELECT, 'cat_botid', 'createdon'] as never,
    filter:
      `(cat_botid eq '${botId}' or cat_botid eq '${prefixed}')`
      + ` and createdon ge ${from} and createdon le ${to}`,
    orderBy: ['createdon asc'] as never,
  });

  if (!result.success || !Array.isArray(result.data)) return null;

  const rows = result.data as unknown as ReviewJobRow[];
  return rows[0] ?? null;
}

/**
 * Finds the durable job for an immutable workflow request.
 *
 * Correlation IDs are generated by the client and are unique per logical run.
 * Looking up the row before creation makes submission idempotent when a browser
 * retries after the create call succeeds but before it receives the row ID.
 *
 * @param correlationId - Client-generated workflow correlation ID.
 * @returns The matching job, or null when no row exists.
 */
export async function findReviewJobByCorrelationId(
  correlationId: string,
): Promise<ReviewJobRow | null> {
  if (!correlationId.trim() || correlationId.includes("'")) return null;

  const result = await Cat_agentreviewjobsService.getAll({
    select: [
      ...POLL_SELECT,
      'cat_correlationid',
      'cat_botid',
      'cat_botname',
      'cat_jobkind',
      'createdon',
    ] as never,
    filter: `cat_correlationid eq '${correlationId}'`,
    orderBy: ['createdon desc'] as never,
    top: 1,
  });

  if (!result.success || !Array.isArray(result.data)) return null;
  return (result.data as unknown as ReviewJobRow[])[0] ?? null;
}

/**
 * Counts the distinct components the workflow has finished so far.
 *
 * Drives real "n of m" progress. The in-loop `Update_a_row` ping tells the
 * client something finished but not how many: parallel iterations overwrite
 * each other's value, so it races by design. The child rows do not -- each
 * iteration inserts its own -- so counting them is the only accurate measure.
 *
 * Counts distinct component indexes rather than raw rows, because a retried
 * iteration can leave more than one row for the same component and would
 * otherwise report more progress than was actually made.
 *
 * @param jobId - Job row id.
 * @returns Completed component count, or undefined if the count is unavailable.
 */
export async function countCompletedComponents(
  jobId: string,
): Promise<number | undefined> {
  const result = await Cat_agentreviewjobitemsService.getAll({
    select: ['cat_componentindex'] as never,
    filter: `_cat_jobid_value eq ${jobId}`,
  });

  if (!result.success || !Array.isArray(result.data)) return undefined;

  const rows = result.data as unknown as ReviewJobItemRow[];
  const seen = new Set<number | string>();
  for (const row of rows) {
    // Agent-level and per-resource rows are not components; counting them would
    // report more progress than there are components (13 of 12).
    if (!isComponentRow(row)) continue;
    seen.add(row.cat_componentindex ?? `row:${row.cat_agentreviewjobitemid}`);
  }
  return seen.size;
}

/**
 * Reads every raw child row for a review job without collapsing duplicate indexes.
 *
 * @param jobId - Job row id.
 */
export async function getReviewJobItemRows(jobId: string): Promise<ReviewJobItemRow[]> {
  const result = await Cat_agentreviewjobitemsService.getAll({
    select: ITEM_SELECT as never,
    filter: `_cat_jobid_value eq ${jobId}`,
    orderBy: ['cat_componentindex asc', 'createdon asc'] as never,
  });

  if (!result.success || !Array.isArray(result.data)) {
    throw new ReviewJobError(
      'malformed-output',
      `Could not read review result rows: ${result.error?.message ?? 'no rows returned'}`,
    );
  }

  return result.data as unknown as ReviewJobItemRow[];
}

/**
 * Reads the per-component results the workflow wrote as child rows.
 *
 * The loop creates one row per agent-node call, so a run that fails part-way
 * still yields the components that completed. A component can legitimately have
 * more than one row -- a resubmitted run, or a retried loop iteration whose
 * create succeeded before a later action failed -- so rows are ordered oldest
 * first and {@link mapReviewJobItems} keeps the newest usable one per component.
 *
 * @param jobId - Job row id.
 * @param node - Which reviewer produced the rows, so a failed component can name
 *   the rules that went unassessed. Defaults to the in-agent skill reviewer.
 */
export async function getReviewJobResults(
  jobId: string,
  node?: NodeKind,
): Promise<AgentComponentResult[]> {
  return mapReviewJobItems(await getReviewJobItemRows(jobId), node);
}

/**
 * Reads the raw payload an agent-level stage wrote, or null when it is absent.
 *
 * Agent-level stages run once for the whole review rather than once per
 * component, so each writes a single child row at a reserved index. A missing
 * row is not an error: the node may not exist in this environment's workflow
 * yet, or it may have failed while the per-component results succeeded. The
 * caller records the stage as unavailable; it does not submit a new AI request.
 *
 * A retried loop iteration re-runs the whole success branch, so the same index
 * can legitimately have more than one row. Rows arrive oldest first and the
 * newest usable one wins -- the same rule {@link mapReviewJobItems} applies to
 * component rows. Concatenating them instead would duplicate every finding.
 *
 * @param jobId - Job row id.
 * @param index - Reserved index, from {@link AGENT_LEVEL_INDEX}.
 * @returns The parsed payload, or null when no usable row exists.
 */
export async function getAgentLevelResult(
  jobId: string,
  index: number,
): Promise<unknown | null> {
  const result = await Cat_agentreviewjobitemsService.getAll({
    select: ITEM_SELECT as never,
    filter: `_cat_jobid_value eq ${jobId} and cat_componentindex eq ${index}`,
    orderBy: ['createdon asc'] as never,
  });

  if (!result.success || !Array.isArray(result.data)) return null;

  const rows = result.data as unknown as ReviewJobItemRow[];
  let latest: unknown | null = null;
  for (const row of rows) {
    if (row.cat_itemstatus !== undefined && row.cat_itemstatus !== ReviewJobItemStatus.Succeeded) {
      console.warn(`[CopilotReview] Agent-level item ${row.cat_agentreviewjobitemid} did not succeed.`);
      latest = null;
      continue;
    }
    const parsed = safeParse(row.cat_resultjson ?? '');
    if (parsed && typeof parsed === 'object') latest = parsed;
  }
  return latest;
}
