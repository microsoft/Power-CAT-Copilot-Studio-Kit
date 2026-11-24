/**
 * Maps artifact-review progress onto the shared `ProgressStage[]` shape.
 *
 * The artifact review renders the same `ReviewProgressDialog` the Copilot
 * Studio and Standard reviews render. That is not only for visual consistency:
 * the dialog carries the workflow attribution mark, and this review is one of
 * the two pipelines that genuinely reaches a workflow.
 *
 * Exactly one of the six stages runs on the workflow agent. The other five run
 * in the browser. Marking any of those five would misdescribe where the work
 * happens — and would take credit away from the deterministic rules, which are
 * the part of this review that is not AI at all.
 */
import type { ProgressStage } from '../../hooks/useReviewMutation';
import { resolveReviewAiProvider } from '../../agents-experience/services/ai-providers/reviewAiBackend';
import type { ArtifactReviewProgress } from '../contracts/ArtifactReview';

type Stage = ArtifactReviewProgress['stage'];

/** Ordered stage list. Index position decides pending / active / completed. */
const STAGE_ORDER: ReadonlyArray<{ stage: Stage; label: string; percent: number }> = [
  { stage: 'reading', label: 'Reading the uploaded files', percent: 0 },
  { stage: 'detecting', label: 'Identifying the artifact type', percent: 15 },
  { stage: 'deterministic', label: 'Checking packaging, structure, safety and runtime fit', percent: 30 },
  { stage: 'ai', label: 'Reviewing wording and instructions with AI', percent: 55 },
  { stage: 'scoring', label: 'Scoring against the authoring rubric', percent: 85 },
  { stage: 'complete', label: 'Review complete', percent: 100 },
];

/**
 * The only stage served by the workflow agent.
 *
 * Held as a constant so the attribution test can assert against the same value
 * the adapter uses, rather than a copy that could drift.
 */
export const WORKFLOW_SERVED_STAGE: Stage = 'ai';

/**
 * When a run stops being normal and starts needing an explanation.
 *
 * Grounded in every artifact review this environment has recorded, matched to
 * its job row by timestamp (`cat_agentreviews.cat_agenttype = 3` against
 * `cat_agentreviewjob`, whose `modifiedon` records the terminal write):
 *
 *   - `chart-builder.zip`            — 2m33s, 3m16s
 *   - `agent-harness-explorer.zip`   — 7m35s, 9m03s, 9m25s, 10m03s, 10m04s,
 *                                      10m26s
 *
 * Every one of those jobs is named "… - 1 components", because at the time they
 * ran `buildReviewCorpus` emitted one component per skill bundle and an
 * uploaded archive carried one bundle. So each duration is one agent call over
 * the whole archive, and it scales with the size of that archive —
 * `agent-harness-explorer` carries 24 files and takes three times as long as
 * `chart-builder`. Nothing about it scaled with a count, which is why no single
 * expected duration could be stated honestly.
 *
 * Splitting (behind `VITE_ARTIFACT_REVIEW_PORTIONS`) changes that: a large
 * archive is sent as several components, which the workflow's loop then reviews
 * in parallel. The first split run of that same archive is now recorded —
 * `agent-harness-explorer - 6 components`, 2026-08-10 18:14:51 → 18:21:47, so
 * 6m56s against a six-run unsplit mean of 9m26s. That is 27% off, not the
 * six-fold cut a naive reading of "parallel" would predict, because each part
 * still pays a full agent round trip and the loop's concurrency is bounded.
 *
 * The threshold stays calibrated on the unsplit figures even so. One split run
 * is not a population, `agent-harness-explorer` is the largest archive anyone
 * has uploaded rather than the largest anyone could, and the failure this
 * constant guards against is firing "longer than usual" on a review that is
 * running normally — which is exactly what an earlier miscalibration did (see
 * below). Holding at twelve minutes keeps the note silent on every run measured
 * under either mode. Lower it only when several split runs across several
 * archive sizes have been recorded.
 *
 * An earlier version of this constant cited runs of 2m19s, 2m30s, 2m57s and
 * 3m03s and set the threshold at four minutes. Those figures cannot be traced
 * to any artifact review; they match the Copilot Studio reviews sharing this
 * job table, whose median is 3m10s across sixteen runs. Calibrating an artifact
 * affordance on that population made "longer than usual" fire on four of the
 * six real runs, which is the opposite of what the phrase claims.
 *
 * Twelve minutes sits past the slowest observed run under either mode without
 * cutting one short, and still leaves 33 minutes of the client-side ceiling for
 * the note to be worth reading. The margin over the slowest unsplit run
 * (10m26s) is thin; over the one split run (6m56s) it is wide. Revisit once
 * more than one archive size has been measured under splitting.
 *
 * It only changes what is displayed. Polling continues either way.
 */
export const SLOW_REVIEW_AFTER_MS = 12 * 60 * 1000;

/**
 * Reassurance shown once {@link SLOW_REVIEW_AFTER_MS} passes.
 *
 * States the typical duration so "longer than usual" is a measurable claim, and
 * must not imply that waiting is futile — the two slowest recorded runs took
 * 9m03s and 10m26s and both produced a full result.
 *
 * Two things it must not say, each of which it said at some point:
 *
 * - That cancelling stops the review. It does not, and the dialog no longer
 *   offers to. `cancel()` aborts a client `AbortController`; the workflow run
 *   carries on to completion and the AI call is already paid for. Once a review
 *   starts, it finishes.
 * - That the review stops by itself at the ceiling. `DEFAULT_DEADLINE_MS` is
 *   documented as a client-side ceiling — "the job keeps running server-side
 *   after this fires". Only this window stops.
 *
 * One thing it may now say, which it could not before: that the result
 * survives the app closing. This was false until `resumeArtifactReview`
 * existed: the review record is still assembled in the browser, but a reserved
 * row now carries its own artifact hash, the job was always submitted under
 * that hash, and the history sweep looks the job up and finishes the review on
 * whichever browser opens the tab next. The earlier "keep the app open"
 * instruction is therefore retired, not softened.
 *
 * What it must not say is that the reader may leave the dialog. That is true —
 * the run is held above the router — but "Continue in background" sits in the
 * same dialog footer, and has been there since the first second of the review.
 * Copy that narrates a visible control adds a sentence and no information, and
 * it implies the button was not enough. So the note carries only what the
 * button cannot: how long this normally takes, that a longer wait means a busy
 * service rather than a stalled review, that closing the whole app is also
 * safe, and when the app gives up.
 *
 * "Not finished" is no longer what closing the app produces, so the note no
 * longer explains it. It now means the job genuinely failed or cannot be found,
 * which the grid states in its own words at the point it happens.
 */
export const SLOW_REVIEW_NOTE =
  'Most reviews finish within ten minutes. A longer wait means the service is busy, not that the review has stopped. Closing or refreshing the app is safe — the result is collected the next time you open Skills and automations. The app stops waiting after 45 minutes.';

/**
 * Reword the shared provider's progress message for this domain.
 *
 * `WorkflowReviewAiProvider` is shared with the Copilot Studio review, where a
 * "component" really is one — a topic or an action. An uploaded archive has no
 * components; it has one skill and its resources. Reusing the agent word there
 * produced "analysing 1 components" beside a folder of files, which was both
 * ungrammatical and wrong about what was being counted. Rewording here rather
 * than in the shared provider keeps the agent pipeline's own vocabulary intact.
 *
 * Naming the skill is the point: a message that names what is being worked on
 * can be checked against the file the user uploaded, where a bare count cannot.
 *
 * Lives beside the other progress text, not in the AI stage that calls it, so
 * every user-facing wait string for this tab is in one file.
 *
 * @param skillName - Declared frontmatter name, or the uploaded file name.
 * @param hasStarted - True once the workflow reports the run as running.
 */
export function describeAiProgress(skillName: string, hasStarted: boolean): string {
  return hasStarted
    ? `Reviewing ${skillName} against the authoring rubric`
    : `Handing ${skillName} to the review agent`;
}

/**
 * Highest percent the AI stage may report on its own.
 *
 * Three below the scoring stage's 85 on purpose: the last part finishing does
 * not end the stage, because the agent still writes its coverage pass after
 * it. A bar that landed exactly on 85 would claim the next stage had started
 * while this one was still running.
 */
const AI_STAGE_CEILING = 82;

/**
 * Percent for the AI stage, moved by how many parts have been reviewed.
 *
 * Every other stage carries a fixed percent, which is honest because they are
 * short. This one is not: it holds the whole agent run, and a bar frozen at one
 * number for minutes gives the user no way to tell a slow review from a dead
 * one. The count driving it is measured from the job's child rows, so the bar
 * only moves when work has actually finished.
 *
 * @param base - The stage's own percent, used when there is nothing to count.
 * @param progress - Latest progress event, or undefined before the first one.
 */
function aiStagePercent(
  base: number,
  progress: ArtifactReviewProgress | undefined,
): number {
  const total = progress?.totalParts ?? 0;
  // One part is not a split. Interpolating across it would send the bar from
  // the base straight to the ceiling on a single completion, which reads as a
  // stall followed by a jump rather than as progress.
  if (total < 2) return base;
  const done = Math.min(Math.max(progress?.completedParts ?? 0, 0), total);
  return Math.round(base + ((AI_STAGE_CEILING - base) * done) / total);
}

/**
 * Counted progress line for an archive that was split for parallel review.
 *
 * A large archive is split so the agent can review it in parallel, which is an
 * implementation detail the user never asked for. What they can act on is how
 * much is left, so this reports a count and nothing else — no part names, and
 * not the workflow's own last-completed ping, which names whichever part
 * finished most recently and therefore moves up and down at random.
 *
 * Returns undefined when the archive was not split, so an unsplit review keeps
 * its existing wording rather than gaining a meaningless "1 of 1".
 *
 * @param completed - Parts finished, counted from the job's child rows.
 * @param total - Parts the archive was split into.
 */
export function describePartProgress(
  completed: number | undefined,
  total: number | undefined,
): string | undefined {
  if (!total || total < 2) return undefined;
  const done = Math.min(Math.max(completed ?? 0, 0), total);
  return `${done} of ${total} parts reviewed`;
}

/**
 * Detail line for the AI stage.
 *
 * Prefers the counted line, which only ever rises, and falls back to the
 * backend's last-completed ping for an unsplit review, where that ping names
 * the one thing being worked on and cannot race.
 */
function describeAiDetail(progress: ArtifactReviewProgress | undefined): string | undefined {
  if (!progress) return undefined;
  const parts = describePartProgress(progress.completedParts, progress.totalParts);
  if (parts) return `${progress.message} — ${parts}`;
  if (progress.lastCompleted) return `${progress.message} — last completed: ${progress.lastCompleted}`;
  return progress.message;
}

/**
 * Build the dialog's stage list from the current progress.
 *
 * @param progress - Latest progress event, or undefined before the first one.
 * @param failed - Whether the review stopped on an error at the current stage.
 */
export function buildArtifactProgressStages(
  progress: ArtifactReviewProgress | undefined,
  failed = false,
): ProgressStage[] {
  const currentIndex = progress
    ? STAGE_ORDER.findIndex((s) => s.stage === progress.stage)
    : 0;
  const index = currentIndex < 0 ? 0 : currentIndex;

  // The mark states which backend is serving the stage, so a forced switch to
  // the prompt backend must remove it rather than keep claiming a workflow.
  const onWorkflow = resolveReviewAiProvider() === 'workflow';

  return STAGE_ORDER.map((entry, i) => {
    let status: ProgressStage['status'];
    if (i < index) status = 'completed';
    else if (i > index) status = 'pending';
    else if (failed) status = 'error';
    else status = entry.stage === 'complete' ? 'completed' : 'active';

    const isActiveAiStage = entry.stage === WORKFLOW_SERVED_STAGE && i === index;

    // On the AI stage the backend reports what it actually finished. That line
    // is the only proof the workflow is alive during a run that can last
    // minutes, so it outranks the generic phase message when present.
    const detail = isActiveAiStage ? describeAiDetail(progress) : progress?.message;

    return {
      stageName: entry.label,
      // Only the running AI stage earns a moving percent. Once it is behind us
      // its bar is full anyway, and interpolating a stage that has not started
      // would show progress against work nobody has begun.
      progress: isActiveAiStage && !failed ? aiStagePercent(entry.percent, progress) : entry.percent,
      status,
      // Only the active stage carries live detail; on the others the message
      // would describe a different step.
      detail: i === index && !failed ? detail : undefined,
      ...(onWorkflow && entry.stage === WORKFLOW_SERVED_STAGE
        ? { attribution: 'workflow-agent' as const }
        : {}),
    };
  });
}

/**
 * One-line description of what the review covers, for the dialog footer.
 *
 * Returns undefined until the counts are known, because a placeholder like
 * "0 files" during the reading stage would be read as a real measurement.
 */
export function buildArtifactScopeSummary(
  progress: ArtifactReviewProgress | undefined,
): string | undefined {
  if (!progress?.fileCount) return undefined;
  const skills = progress.skillCount ?? 1;
  const skillPart = `${skills} ${skills === 1 ? 'skill' : 'skills'}`;
  const filePart = `${progress.fileCount} ${progress.fileCount === 1 ? 'file' : 'files'}`;
  return `${skillPart} · ${filePart}`;
}
