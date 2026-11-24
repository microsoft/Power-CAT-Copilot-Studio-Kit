/**
 * Which cloud flow claims a review job, and how the job says so.
 *
 * **One flow now serves every harness.** The ARC2 workflow `78aaaaaa-…` is
 * turned off and its branches were merged into ART's `71b31233-…`, so there is
 * no longer a second claimant to separate rows from:
 *
 * | Flow | Id | Trigger filter | State |
 * |---|---|---|---|
 * | ART (the only one) | `71b31233-…` | `cat_jobstatus eq 1 and cat_inputfile_name ne null` | On |
 * | ARC2 (retired)     | `78aaaaaa-…` | `cat_jobstatus eq 100000000 and cat_inputfile_name ne null and startswith(cat_botid,'arc2:')` | Off |
 *
 * While both flows ran, the separation had to come from our side: ARC2 rows were
 * queued at {@link ReviewJobStatus.ARC2Queued} and carried an `arc2:` prefix on
 * `cat_botid`, because ART's filter does not exclude them. Both halves were
 * required together — setting one without the other produced a row no flow would
 * pick up, surfacing as a "workflow did not pick up this job" timeout.
 *
 * With 782 off, that combination now means *nothing* claims the row, so routing
 * is pinned to ART. The helpers below are kept rather than deleted: historical
 * rows still carry the prefix, and resume matches both spellings.
 */
import { ReviewJobStatus, type ReviewJobStatusValue } from '../../contracts/ReviewJob';

/** Marks a job row as belonging to the ARC2 workflow. Matched by its trigger with `startswith`. */
export const ARC2_BOT_ID_PREFIX = 'arc2:';

/**
 * Whether new jobs are routed to ARC2 instead of ART.
 *
 * A named constant rather than a literal so the kill switch is one edit: flipping
 * it to `false` restores ART routing for every harness without touching call sites.
 *
 * **Off.** Flow 782 is retired; ART is the only workflow watching this table, and
 * a row queued the ARC2 way would be claimed by nothing at all.
 */
export const ARC2_ROUTING_ENABLED = false;

/** Adds the routing prefix, leaving an already-prefixed id unchanged. */
export function toArc2BotId(botId: string): string {
  return botId.startsWith(ARC2_BOT_ID_PREFIX) ? botId : `${ARC2_BOT_ID_PREFIX}${botId}`;
}

/** Removes the routing prefix so stored ids compare against un-prefixed ones. */
export function stripArc2BotId(botId: string): string {
  return botId.startsWith(ARC2_BOT_ID_PREFIX)
    ? botId.slice(ARC2_BOT_ID_PREFIX.length)
    : botId;
}

/** Whether this row was queued for ARC2. */
export function isArc2BotId(botId: string | undefined | null): boolean {
  return typeof botId === 'string' && botId.startsWith(ARC2_BOT_ID_PREFIX);
}

/**
 * The `cat_botid` to write, and the status that releases the row to a flow.
 *
 * Returned together because they are one decision. Splitting them is what
 * produces the un-claimable combination described above.
 */
export function routeForSubmission(botId: string): {
  botId: string;
  queuedStatus: ReviewJobStatusValue;
} {
  return ARC2_ROUTING_ENABLED
    ? { botId: toArc2BotId(botId), queuedStatus: ReviewJobStatus.ARC2Queued }
    : { botId, queuedStatus: ReviewJobStatus.Queued };
}
