/**
 * Dataverse persistence for Skills and Automations reviews.
 *
 * Reviews live in the shared `cat_agentreviews` table, discriminated by
 * `cat_agenttype = 3` (SkillOrAutomation), exactly as the Copilot Studio and
 * M365 Declarative Agent tabs use values 1 and 2.
 *
 * Storing these in the environment rather than the browser is deliberate. A
 * team adopting the Copilot Agent Kit needs one shared answer: without it a
 * colleague re-reviews a skill someone already reviewed, and every duplicate
 * spends a real AI call. Deduplication on `cat_componentidunique` is what makes
 * that possible, so it is the point of the table rather than a detail of it.
 *
 * Flat columns are written alongside the JSON blob so the landing-page list can
 * render without parsing every review.
 */

import { Cat_agentreviewsesService } from '../../../../generated/services/Cat_agentreviewsesService';
import { AGENT_TYPE } from '../../declarative-agent/contracts/constants';
import type { ArtifactReviewResult, TargetRuntime } from '../contracts/ArtifactReview';
import {
  artifactReviewKey,
  buildReviewRecord,
  keyForResult,
} from './artifactReviewRecord';
import { verdictBasisFor } from '../data/catalogueResolver';
import {
  describeDimensionInapplicability,
  describeInapplicability,
  dimensionAppliesTo,
  runtimeAcceptsKind,
} from './runtimeApplicability';
import {
  mergeRuntimeTargets,
  runtimeTargetIsEstablished,
  runtimeTargetsFromSkillMarkdown,
} from './runtimeTargeting';

/** A stored review plus the Dataverse identity needed to open or delete it. */
export interface StoredArtifactReview {
  reviewId: string;
  /** Deduplication key: artifact hash plus the runtimes it was judged against. */
  componentIdUnique: string;
  artifactName: string;
  reviewedOn?: Date;
  result: ArtifactReviewResult;
}

const AGENT_TYPE_FILTER = `cat_agenttype eq ${AGENT_TYPE.SKILL_OR_AUTOMATION}`;
const RETIRED_ARTIFACT_RULE_IDS = new Set([
  'SCR-GEN-01',
  'PKG-META',
  'LIM-DEPTH',
  'SHP-DESCLEN',
  'AUTO-INTERVAL',
  'AUTO-MONTHLY',
  'AUTO-CRON',
  'AUTO-DESC',
  'INST-README',
  'INST-JSON',
  'INST-SKILLMD',
]);

export { artifactReviewKey, keyForResult };

/**
 * States worth a row in the shared table.
 *
 * `in-progress` is here because the row is written *before* the AI call, so a
 * review survives the browser closing. `failed` is here so a run that stopped
 * can say so, instead of leaving a reserved row claiming to be running for
 * ever.
 *
 * `cancelled` is still excluded. The reader chose to discard that run, and
 * keeping a record of a discarded attempt would turn a list of artifacts back
 * into a log of attempts.
 */
function isStorable(result: ArtifactReviewResult): boolean {
  if (result.status === 'cancelled') return false;
  // A failed review earns a row only when it had already announced itself.
  // `startedAt` is written by the reservation, so its absence means the run
  // stopped before anything claimed to be in progress — an upload that could
  // not be identified, say. There is no running row to correct in that case,
  // and creating one would put rejected uploads into a list of reviewed
  // artifacts.
  if (result.status === 'failed') return typeof result.startedAt === 'string';
  return true;
}

/**
 * The single number the shared table wants.
 *
 * `SkillBundleScores` has four buckets and no overall figure, so the mean of
 * the runtime verdicts is used. It feeds `cat_overallscore`, which the other
 * two tabs also populate; the tab's own UI shows the four buckets rather than
 * this value.
 */
/**
 * The single number for a review.
 *
 * `SkillBundleScores` has four buckets and no overall figure, so the grid and
 * the stored Dataverse column both take the mean of the runtime verdict scores.
 * The rule lives in `artifactScore` so the two cannot drift apart.
 */

function parseResult(json: string | undefined): ArtifactReviewResult | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const candidate = parsed as ArtifactReviewResult;
    // A row can predate a contract change. Dropping it beats rendering blanks.
    if (typeof candidate.artifactHash !== 'string') return null;
    if (typeof candidate.reviewedAt !== 'string') return null;
    if (!Array.isArray(candidate.selectedRuntimes)) return null;
    if ((parsed as Record<string, unknown>).artifactKind === 'automation-installer') return null;
    if (
      Array.isArray(candidate.findings) &&
      candidate.findings.some((finding) => RETIRED_ARTIFACT_RULE_IDS.has(finding.ruleId))
    ) {
      return null;
    }
    return migrateResult(candidate);
  } catch {
    return null;
  }
}

/**
 * Bring a stored row up to the current result contract.
 *
 * Rows are written once and read for as long as they are kept, so a field added
 * after a row was saved is absent from that row for ever. TypeScript cannot see
 * this: the parse above asserts the stored JSON into `ArtifactReviewResult`, so
 * a required field reads as present and is `undefined` at run time.
 *
 * `RuntimeVerdict.basis` is the case that made this necessary. The results
 * panel prints a different evidence sentence for each basis and matches on
 * exact values, so a row saved before the field existed matched neither branch
 * and silently dropped the line the field was added to show. Back-filling from
 * the runtime is exact, not a guess — the basis is a property of what the
 * runtime publishes, not of the review, and the live path derives it the same
 * way through the same function.
 *
 * Migrate rather than reject: these rows are otherwise complete, and a reader
 * looking at their own past review would rather see it than be told it is gone.
 */
function migrateResult(result: ArtifactReviewResult): ArtifactReviewResult {
  const skillMarkdown =
    result.files?.find((file) => /(?:^|[/\\])skill\.md$/i.test(file.path))?.text ?? '';
  const withTargets = {
    ...result,
    declaredRuntimes: mergeRuntimeTargets(
      runtimeTargetsFromSkillMarkdown(skillMarkdown),
      result.declaredRuntimes ?? [],
    ),
  };
  return migrateApplicability(migrateBasis(withTargets));
}

function migrateBasis(result: ArtifactReviewResult): ArtifactReviewResult {
  if (!Array.isArray(result.runtimeVerdicts)) return result;
  if (result.runtimeVerdicts.every((v) => typeof v?.basis === 'string')) return result;

  return {
    ...result,
    runtimeVerdicts: result.runtimeVerdicts.map((verdict) =>
      typeof verdict?.basis === 'string'
        ? verdict
        : { ...verdict, basis: verdictBasisFor(verdict.runtime) },
    ),
  };
}

/**
 * Repair rows that answered a question the artifact's format never posed.
 *
 * Before applicability existed, a Scout automation was scored against all three
 * runtimes. No finding names Cowork, so Cowork's verdict fell through to "Runs,
 * 100 / 100" — a positive compatibility claim about a runtime with no
 * automation import at all. Those rows are still in the grid, still saying it.
 *
 * Repairing on read rather than rewriting the stored row keeps the migration
 * reversible and costs one pass over data already in memory. The rule is a pure
 * function of (runtime, kind), so a repaired row is identical to the same
 * artifact reviewed fresh today.
 *
 * Dimensions are repaired on the same trip, using `evidence` as the test for
 * whether any finding landed there — it is set only when at least one did. A
 * dimension carrying real evidence keeps its score even if the table says it
 * does not apply, because dropping it would delete the evidence from the score
 * with nothing on screen to show it had gone.
 */
function migrateApplicability(result: ArtifactReviewResult): ArtifactReviewResult {
  const kind = result.artifactKind;
  if (!kind) return result;

  const verdicts = Array.isArray(result.runtimeVerdicts) ? result.runtimeVerdicts : [];
  const dimensions = Array.isArray(result.dimensions) ? result.dimensions : [];

  const staleVerdict = verdicts.some(
    (v) => v && v.verdict !== 'not-applicable' && !runtimeAcceptsKind(v.runtime, kind),
  );
  const unsupportedPositiveClaim = verdicts.some(
    (verdict) =>
      verdict &&
      (verdict.verdict === 'runs' || verdict.verdict === 'runs-with-issues') &&
      !runtimeTargetIsEstablished(verdict.runtime, kind, result.declaredRuntimes ?? []),
  );
  const staleDimension = dimensions.some(
    (d) => d && d.score !== null && !d.evidence && !dimensionAppliesTo(d.id, kind),
  );
  if (!staleVerdict && !unsupportedPositiveClaim && !staleDimension) return result;

  return {
    ...result,
    runtimeVerdicts: verdicts.map((verdict) => {
      if (verdict && verdict.verdict !== 'not-applicable' && !runtimeAcceptsKind(verdict.runtime, kind)) {
        return {
            ...verdict,
            verdict: 'not-applicable' as const,
            score: null,
            findingIds: [],
            basis: 'none' as const,
            stalenessNote: undefined,
            notApplicableReason: describeInapplicability(verdict.runtime, kind),
          };
      }
      if (
        verdict &&
        (verdict.verdict === 'runs' || verdict.verdict === 'runs-with-issues') &&
        !runtimeTargetIsEstablished(verdict.runtime, kind, result.declaredRuntimes ?? [])
      ) {
        return {
          ...verdict,
          verdict: 'not-evaluated' as const,
          score: null,
          basis: 'none' as const,
          stalenessNote: undefined,
          notApplicableReason: undefined,
        };
      }
      return verdict;
    }),
    dimensions: dimensions.map((dimension) =>
      dimension && dimension.score !== null && !dimension.evidence && !dimensionAppliesTo(dimension.id, kind)
        ? {
            ...dimension,
            score: null,
            assessment: describeDimensionInapplicability(dimension.id, kind),
          }
        : dimension,
    ),
  };
}

function toStored(row: Record<string, unknown>): StoredArtifactReview | null {
  const result = parseResult(row['cat_reviewresultjson'] as string | undefined);
  if (!result) return null;
  const reviewDate = row['cat_reviewdate'] as string | undefined;
  return {
    reviewId: row['cat_agentreviewsid'] as string,
    componentIdUnique: (row['cat_componentidunique'] as string) ?? '',
    artifactName: (row['cat_agentname'] as string) ?? result.artifactName,
    reviewedOn: reviewDate ? new Date(reviewDate) : undefined,
    result,
  };
}

/**
 * Every skill and automation review in the environment, newest first.
 *
 * The JSON blob is selected here because the list renders verdict badges and a
 * finding count, which are not available as flat columns. Reviews are capped in
 * the query so one busy environment cannot stall the landing page.
 */
export async function listArtifactReviews(top = 50): Promise<StoredArtifactReview[]> {
  const response = await Cat_agentreviewsesService.getAll({
    filter: AGENT_TYPE_FILTER,
    select: [
      'cat_agentreviewsid',
      'cat_componentidunique',
      'cat_agentname',
      'cat_reviewdate',
      'cat_reviewresultjson',
    ],
    orderBy: ['cat_reviewdate desc'],
    top,
  });

  if (!response.success || !response.data) {
    throw new Error(readErrorMessage(response.error, 'Failed to load reviews'));
  }

  return response.data
    .map((row) => toStored(row as unknown as Record<string, unknown>))
    .filter((entry): entry is StoredArtifactReview => entry !== null);
}

/**
 * One stored review, by its Dataverse id.
 *
 * This is what makes a review addressable. `/agent-review-tool/skills/:reviewId`
 * has nothing but the id when the page is opened cold — a refresh, a bookmark or
 * a link pasted to a colleague — so it cannot rely on the landing page's list
 * having been fetched first.
 *
 * Returns `null` rather than throwing when the row is gone, so the page can say
 * "this review is unavailable" instead of showing a failure the user cannot act
 * on. A genuine transport failure still throws.
 */
export async function getArtifactReview(reviewId: string): Promise<StoredArtifactReview | null> {
  const response = await Cat_agentreviewsesService.getAll({
    filter: `cat_agentreviewsid eq ${reviewId} and ${AGENT_TYPE_FILTER}`,
    select: [
      'cat_agentreviewsid',
      'cat_componentidunique',
      'cat_agentname',
      'cat_reviewdate',
      'cat_reviewresultjson',
    ],
    top: 1,
  });

  if (!response.success) {
    throw new Error(readErrorMessage(response.error, 'Failed to load the review'));
  }
  if (!response.data || response.data.length === 0) return null;

  return toStored(response.data[0] as unknown as Record<string, unknown>);
}

/**
 * The existing review for these exact bytes and runtimes, if there is one.
 *
 * This is what spares the user a duplicate AI call.
 *
 * Bounded, because the caller runs this *before* starting the review: an
 * environment that answers slowly, or not at all, would otherwise leave the user
 * looking at a dialog that closed and a review that never began. A duplicate row
 * costs one wasted AI call and is collapsed by the upsert on save; a review that
 * never starts costs the user the whole task. So the lookup gives up and reports
 * "no duplicate" rather than holding the review hostage.
 */
export const DUPLICATE_LOOKUP_TIMEOUT_MS = 8000;

export async function findArtifactReview(
  hash: string,
  runtimes: readonly TargetRuntime[],
): Promise<StoredArtifactReview | null> {
  const key = artifactReviewKey(hash, runtimes);
  const lookup = Cat_agentreviewsesService.getAll({
    filter: `cat_componentidunique eq '${key}' and ${AGENT_TYPE_FILTER}`,
    select: [
      'cat_agentreviewsid',
      'cat_componentidunique',
      'cat_agentname',
      'cat_reviewdate',
      'cat_reviewresultjson',
    ],
    top: 1,
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const response = await Promise.race([
    lookup,
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), DUPLICATE_LOOKUP_TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timer));

  if (!response || !response.success || !response.data || response.data.length === 0) return null;
  return toStored(response.data[0] as unknown as Record<string, unknown>);
}

/**
 * Create or replace the review for these bytes and runtimes.
 *
 * Re-reviewing an unchanged file against the same runtimes updates the existing
 * row instead of adding a second one, which is what keeps the list a list of
 * artifacts rather than a log of attempts.
 *
 * The same upsert is what reserves a row before the AI call runs and what
 * completes it afterwards, because both address the row by
 * `cat_componentidunique`. That is deliberate: one code path means a reserved
 * row and its finished result can never land in two separate records, and a
 * completion racing a sweep is harmless because both write the same key.
 */
export async function saveArtifactReview(result: ArtifactReviewResult): Promise<string | null> {
  if (!isStorable(result)) return null;

  const key = keyForResult(result);
  const existing = await Cat_agentreviewsesService.getAll({
    filter: `cat_componentidunique eq '${key}' and ${AGENT_TYPE_FILTER}`,
    select: ['cat_agentreviewsid'],
    top: 1,
  });

  const existingId =
    existing.success && existing.data && existing.data.length > 0
      ? existing.data[0].cat_agentreviewsid
      : undefined;

  const record = buildReviewRecord(result, key);

  if (existingId) {
    await updateReviewRow(existingId, record);
    return existingId;
  }

  const created = await Cat_agentreviewsesService.create(
    record as unknown as Parameters<typeof Cat_agentreviewsesService.create>[0],
  );
  if (!created.success || !created.data) {
    throw new Error(readErrorMessage(created.error, 'Failed to save the review'));
  }
  return created.data.cat_agentreviewsid;
}

async function updateReviewRow(
  reviewId: string,
  record: ReturnType<typeof buildReviewRecord>,
): Promise<void> {
  const updated = await Cat_agentreviewsesService.update(
    reviewId,
    record as unknown as Parameters<typeof Cat_agentreviewsesService.update>[1],
  );
  if (!updated.success) {
    throw new Error(readErrorMessage(updated.error, 'Failed to update the review'));
  }
}

/** Delete one review. */
export async function deleteArtifactReview(reviewId: string): Promise<void> {
  // The generated delete resolves to void and throws on failure, unlike the
  // create/update pair which return a result object.
  await Cat_agentreviewsesService.delete(reviewId);
}

/**
 * How long a reserved row may claim to be running before it is declared
 * stopped.
 *
 * Generous on purpose. The client gives up waiting after 45 minutes, but the
 * workflow behind it is not bound by that, and a row wrongly marked stopped
 * while its review is still going would tell the reader to spend a second AI
 * call for nothing. An hour clears the client ceiling with margin, so anything
 * still running by then really has been abandoned by every client that could
 * have collected it.
 */
export const RUNNING_REVIEW_TIMEOUT_MS = 60 * 60 * 1000;

/**
 * Rows this browser is running right now.
 *
 * The sweep and the runner can both finish the same review: the sweep sees the
 * job succeed a moment before the runner's own poll returns. Both writes go to
 * the same row and carry the same verdict, so nothing is corrupted, but the
 * reader would see the row settle twice and the results would be read from
 * Dataverse twice for one review. The runner claims its row for the duration
 * instead, which costs one `Set` and removes the race.
 *
 * Module-level because there is exactly one runner per browser tab, mounted
 * above the router, while the sweep runs inside the history query several
 * component layers below it — threading a ref between them would put this
 * detail into the props of everything in between.
 */
const activeReviewIds = new Set<string>();

/** Marks a reserved row as being completed by this browser. */
export function claimActiveReview(reviewId: string): void {
  activeReviewIds.add(reviewId);
}

/** Releases a claim, whether the review finished, failed or was abandoned. */
export function releaseActiveReview(reviewId: string): void {
  activeReviewIds.delete(reviewId);
}

/**
 * Resolve rows left claiming to be running.
 *
 * A review announces itself before its AI stage, and the browser that started
 * it completes the row afterwards. If that browser is closed in between, the
 * row is stranded: the workflow finishes and is paid for, but nothing writes
 * the result.
 *
 * The workflow, however, is still addressable. Every stranded row is offered to
 * {@link resumeArtifactReview}, which finds the job the review was waiting on
 * and collects it if it has finished. That is what makes a refresh survivable —
 * the review completes here, on the next visit to the tab, in whichever browser
 * gets there first.
 *
 * Only when no job can be found does the age-out rule apply. Rows younger than
 * {@link RUNNING_REVIEW_TIMEOUT_MS} are then left alone — they may genuinely
 * still be running, including in another colleague's browser right now. Older
 * ones are marked failed, which turns a misleading "Running" into an accurate
 * "Not finished" the reader can act on.
 *
 * Returns how many rows it changed, so the caller can decide whether the list
 * is worth refetching. Failures are counted as unchanged rather than thrown:
 * a sweep is housekeeping, and it must never stop the list from rendering.
 */
export async function sweepStaleArtifactReviews(
  entries: readonly StoredArtifactReview[],
  now: Date = new Date(),
): Promise<number> {
  const cutoff = now.getTime() - RUNNING_REVIEW_TIMEOUT_MS;

  const running = entries.filter(
    (entry) => entry.result.status === 'in-progress' && !activeReviewIds.has(entry.reviewId),
  );
  if (running.length === 0) return 0;

  // Imported here rather than at the top of the file because resuming reaches
  // into the job service and the whole AI stage, and listing reviews must not
  // depend on either. Most loads of this list have nothing to resume, so most
  // of them never pay for that graph at all.
  const { resumeArtifactReview } = await import('./artifactReviewResume');

  let changed = 0;
  for (const entry of running) {
    try {
      const outcome = await resumeArtifactReview(entry.result, now);

      if (outcome.kind === 'running') continue;

      if (outcome.kind === 'collected') {
        await writeResolved(entry.reviewId, outcome.result);
        changed += 1;
        continue;
      }

      // No job answered for this row. It may still be one that has not reached
      // Dataverse yet, so it is only stopped once it is too old to be genuine.
      const started = Date.parse(entry.result.startedAt ?? entry.result.reviewedAt);
      // An unparseable timestamp cannot be aged, and guessing would either
      // strand the row for ever or stop a review that is still running.
      if (Number.isNaN(started) || started >= cutoff) continue;

      await writeResolved(entry.reviewId, {
        ...entry.result,
        status: 'failed',
        reviewedAt: now.toISOString(),
        error:
          'This review did not finish. No record of the review agent working on it could be found, so there are no results to collect.',
      });
      changed += 1;
    } catch {
      // Left for the next sweep.
    }
  }

  return changed;
}

/**
 * Writes a settled result over its reserved row.
 *
 * Written straight to the known row id. Going through the upsert would re-query
 * for an id the sweep already holds, once per stranded row.
 */
async function writeResolved(reviewId: string, result: ArtifactReviewResult): Promise<void> {
  await updateReviewRow(reviewId, buildReviewRecord(result, keyForResult(result)));
}

function readErrorMessage(error: unknown, fallback: string): string {
  const message = (error as Record<string, unknown> | undefined)?.['message'];
  return typeof message === 'string' && message.length > 0 ? message : fallback;
}
