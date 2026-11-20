/**
 * Tests for collecting a review whose browser went away.
 *
 * This is the behaviour behind "continue in background". The parts worth
 * pinning down are the ones a reader would notice if they broke: a finished
 * review must come back scored rather than as a failure, a review still running
 * must not be declared dead, and nothing here may throw — it runs inside the
 * query that paints the history grid.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findLatestJobForBot = vi.fn();
const runAiStage = vi.fn();

vi.mock('../../agents-experience/services/jobs/ReviewJobService', () => ({
  findLatestJobForBot: (...args: unknown[]) => findLatestJobForBot(...args),
}));

vi.mock('../services/artifactAiStage', () => ({
  createArtifactAiStage: (...args: unknown[]) => {
    createArtifactAiStageSpy(...args);
    return (...inner: unknown[]) => runAiStage(...inner);
  },
}));

const createArtifactAiStageSpy = vi.fn();

import { ReviewJobStatus } from '../../agents-experience/contracts/ReviewJob';
import type { ArtifactFinding, ArtifactReviewResult } from '../contracts/ArtifactReview';
import { resumeArtifactReview } from '../services/artifactReviewResume';

const now = new Date('2025-01-01T12:00:00.000Z');

function reserved(over: Partial<ArtifactReviewResult> = {}): ArtifactReviewResult {
  return {
    status: 'in-progress',
    artifactKind: 'skill',
    artifactName: 'expense-report.zip',
    artifactHash: 'hash-a',
    selectedRuntimes: ['cowork'],
    scores: {
      quality: { value: 0, status: 'not-assessed', coveragePercent: 0 },
      integrity: { value: 0, status: 'not-assessed', coveragePercent: 0 },
      safety: { value: 0, status: 'not-assessed', coveragePercent: 0 },
      readiness: { value: 0, status: 'not-assessed', coveragePercent: 0 },
      safetyGate: 'none',
    },
    dimensions: [],
    runtimeVerdicts: [],
    findings: [],
    files: [
      { path: 'expense-report/SKILL.md', bytes: 10, text: '# Expense report', isBinary: false },
      { path: 'expense-report/scripts/extract.py', bytes: 20, text: 'print(1)', isBinary: false },
    ],
    uncompressedBytes: 30,
    recommendation: { headline: '', actions: [] },
    aiAvailable: false,
    reviewedAt: '2025-01-01T11:50:00.000Z',
    startedAt: '2025-01-01T11:50:00.000Z',
    ...over,
  };
}

const finding = (id: string): ArtifactFinding => ({
  id,
  ruleId: 'rule-x',
  dimension: 'quality',
  severity: 'medium',
  title: 'Something to fix',
  detail: 'detail',
  runtimes: ['cowork'],
});

beforeEach(() => {
  findLatestJobForBot.mockReset();
  runAiStage.mockReset();
  createArtifactAiStageSpy.mockReset();
});

describe('resumeArtifactReview', () => {
  it('reports the review as still running while its job is going', async () => {
    findLatestJobForBot.mockResolvedValue({
      cat_agentreviewjobid: 'job-1',
      cat_jobstatus: ReviewJobStatus.Running,
    });

    const outcome = await resumeArtifactReview(reserved(), now);

    expect(outcome).toEqual({ kind: 'running', jobId: 'job-1' });
    expect(runAiStage).not.toHaveBeenCalled();
  });

  it('collects a finished job and scores it as a complete review', async () => {
    findLatestJobForBot.mockResolvedValue({
      cat_agentreviewjobid: 'job-1',
      cat_jobstatus: ReviewJobStatus.Succeeded,
    });
    runAiStage.mockResolvedValue([finding('f1')]);

    const outcome = await resumeArtifactReview(reserved(), now);

    expect(outcome.kind).toBe('collected');
    if (outcome.kind !== 'collected') return;
    expect(outcome.result.status).toBe('complete');
    expect(outcome.result.aiAvailable).toBe(true);
    expect(outcome.result.findings.map((f) => f.id)).toContain('f1');
    // The review is the artifact's, not the resuming browser's: identity and
    // the reader's runtime choice must survive being collected elsewhere.
    expect(outcome.result.artifactHash).toBe('hash-a');
    expect(outcome.result.selectedRuntimes).toEqual(['cowork']);
  });

  it('collects the job it found rather than starting a new one', async () => {
    findLatestJobForBot.mockResolvedValue({
      cat_agentreviewjobid: 'job-7',
      cat_jobstatus: ReviewJobStatus.Succeeded,
    });
    runAiStage.mockResolvedValue([]);

    await resumeArtifactReview(reserved(), now);

    expect(createArtifactAiStageSpy).toHaveBeenCalledWith({ existingJobId: 'job-7' });
  });

  it('keeps the deterministic findings the first pass had already stored', async () => {
    findLatestJobForBot.mockResolvedValue({
      cat_agentreviewjobid: 'job-1',
      cat_jobstatus: ReviewJobStatus.Succeeded,
    });
    runAiStage.mockResolvedValue([finding('ai-1')]);

    const outcome = await resumeArtifactReview(
      reserved({ findings: [finding('det-1')] }),
      now,
    );

    expect(outcome.kind).toBe('collected');
    if (outcome.kind !== 'collected') return;
    expect(outcome.result.findings.map((f) => f.id).sort()).toEqual(['ai-1', 'det-1']);
  });

  it('closes a failed job as partial, keeping what the first pass found', async () => {
    // A missing AI judgement is not a bad one. Scoring the deterministic
    // findings as if they were the whole review would flatter the artifact.
    findLatestJobForBot.mockResolvedValue({
      cat_agentreviewjobid: 'job-1',
      cat_jobstatus: ReviewJobStatus.Failed,
      cat_errormessage: 'the agent timed out',
    });

    const outcome = await resumeArtifactReview(
      reserved({ findings: [finding('det-1')] }),
      now,
    );

    expect(outcome.kind).toBe('collected');
    if (outcome.kind !== 'collected') return;
    expect(outcome.result.status).toBe('partial');
    expect(outcome.result.aiAvailable).toBe(false);
    expect(outcome.result.error).toContain('the agent timed out');
    expect(outcome.result.findings.map((f) => f.id)).toEqual(['det-1']);
  });

  it('closes the review as partial when the AI results cannot be read', async () => {
    findLatestJobForBot.mockResolvedValue({
      cat_agentreviewjobid: 'job-1',
      cat_jobstatus: ReviewJobStatus.Succeeded,
    });
    runAiStage.mockRejectedValue(new Error('results unavailable'));

    const outcome = await resumeArtifactReview(reserved(), now);

    expect(outcome.kind).toBe('collected');
    if (outcome.kind !== 'collected') return;
    expect(outcome.result.status).toBe('partial');
    expect(outcome.result.error).toContain('results unavailable');
  });

  it('closes the review as partial when the files it read were never stored', async () => {
    // Rows written before the file list was retained. Without a bundle there is
    // nothing to match the workflow's per-component results against.
    findLatestJobForBot.mockResolvedValue({
      cat_agentreviewjobid: 'job-1',
      cat_jobstatus: ReviewJobStatus.Succeeded,
    });

    const outcome = await resumeArtifactReview(reserved({ files: undefined }), now);

    expect(outcome.kind).toBe('collected');
    if (outcome.kind !== 'collected') return;
    expect(outcome.result.status).toBe('partial');
    expect(runAiStage).not.toHaveBeenCalled();
  });

  it('gives no answer when no job can be found, leaving the row to age out', async () => {
    findLatestJobForBot.mockResolvedValue(null);

    expect(await resumeArtifactReview(reserved(), now)).toEqual({ kind: 'unresolved' });
  });

  it('gives no answer rather than throwing when the job lookup fails', async () => {
    findLatestJobForBot.mockRejectedValue(new Error('throttled'));

    expect(await resumeArtifactReview(reserved(), now)).toEqual({ kind: 'unresolved' });
  });

  it('gives no answer when the start time cannot be read', async () => {
    // Without a start time there is no window to search, and guessing one risks
    // collecting a different run of the same artifact onto this row.
    const outcome = await resumeArtifactReview(
      reserved({ startedAt: 'not-a-date', reviewedAt: 'not-a-date' }),
      now,
    );

    expect(outcome).toEqual({ kind: 'unresolved' });
    expect(findLatestJobForBot).not.toHaveBeenCalled();
  });

  it('ignores a review that is not running', async () => {
    const outcome = await resumeArtifactReview(reserved({ status: 'complete' }), now);

    expect(outcome).toEqual({ kind: 'unresolved' });
    expect(findLatestJobForBot).not.toHaveBeenCalled();
  });

  it('looks the job up under the id derived from the artifact bytes', async () => {
    // The tie between a row and its job. Change either side and every review in
    // flight at the time is stranded.
    findLatestJobForBot.mockResolvedValue(null);

    await resumeArtifactReview(reserved(), now);

    expect(findLatestJobForBot).toHaveBeenCalledWith(
      'upload:hash-a',
      new Date('2025-01-01T11:50:00.000Z'),
    );
  });
});

describe('resumeArtifactReview — rebuilding the bundle', () => {
  /*
    The workflow keys its results by skill name, which the bundle adapter reads
    out of the stored paths. Rebuilding those paths wrongly renames every
    resource and the results no longer join back to anything.
  */
  const bundleFrom = async (files: ArtifactReviewResult['files']) => {
    findLatestJobForBot.mockResolvedValue({
      cat_agentreviewjobid: 'job-1',
      cat_jobstatus: ReviewJobStatus.Succeeded,
    });
    runAiStage.mockResolvedValue([]);

    await resumeArtifactReview(reserved({ files }), now);
    return runAiStage.mock.calls[0][0] as { rootFolderName?: string; files: unknown[] };
  };

  it('recovers the single wrapping folder the archive had', async () => {
    const artifact = await bundleFrom([
      { path: 'expense-report/SKILL.md', bytes: 1, text: 'a', isBinary: false },
      { path: 'expense-report/scripts/run.py', bytes: 1, text: 'b', isBinary: false },
    ]);

    expect(artifact.rootFolderName).toBe('expense-report');
  });

  it('reports no wrapping folder when a file sits at the archive root', async () => {
    const artifact = await bundleFrom([
      { path: 'SKILL.md', bytes: 1, text: 'a', isBinary: false },
      { path: 'scripts/run.py', bytes: 1, text: 'b', isBinary: false },
    ]);

    expect(artifact.rootFolderName).toBeUndefined();
  });

  it('reports no wrapping folder when the archive holds several', async () => {
    const artifact = await bundleFrom([
      { path: 'skill-a/SKILL.md', bytes: 1, text: 'a', isBinary: false },
      { path: 'skill-b/SKILL.md', bytes: 1, text: 'b', isBinary: false },
    ]);

    expect(artifact.rootFolderName).toBeUndefined();
  });

  it('passes every stored file through, including ones whose text was dropped', async () => {
    // Large archives store only part of their text. Dropping those files
    // entirely would change the bundle's shape, not just its detail.
    const artifact = await bundleFrom([
      { path: 'expense-report/SKILL.md', bytes: 1, text: 'a', isBinary: false },
      { path: 'expense-report/big.md', bytes: 900_000, isBinary: false, omitted: true },
    ]);

    expect(artifact.files).toHaveLength(2);
  });
});
