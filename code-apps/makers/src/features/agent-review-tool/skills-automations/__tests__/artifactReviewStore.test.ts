/**
 * Tests for the Dataverse-backed review store.
 *
 * The store is what stops a team paying twice for the same review, so the key
 * building, the upsert-versus-create decision, and the refusal to store an
 * unfinished run are the behaviours worth pinning down. The generated service is
 * mocked: these tests describe the store's contract with Dataverse, not
 * Dataverse itself.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAll = vi.fn();
const create = vi.fn();
const update = vi.fn();
const remove = vi.fn();
const resumeArtifactReview = vi.fn();

vi.mock('../../../../generated/services/Cat_agentreviewsesService', () => ({
  Cat_agentreviewsesService: {
    getAll: (...args: unknown[]) => getAll(...args),
    create: (...args: unknown[]) => create(...args),
    update: (...args: unknown[]) => update(...args),
    delete: (...args: unknown[]) => remove(...args),
  },
}));

// The sweep loads this on demand. Mocked because resuming reaches the job
// service and the AI stage, neither of which this file is about.
vi.mock('../services/artifactReviewResume', () => ({
  resumeArtifactReview: (...args: unknown[]) => resumeArtifactReview(...args),
}));

import type { ArtifactReviewResult } from '../contracts/ArtifactReview';
import { ARTIFACT_EVALUATOR_VERSION } from '../contracts/ArtifactReview';
import {
  artifactReviewKey,
  claimActiveReview,
  deleteArtifactReview,
  DUPLICATE_LOOKUP_TIMEOUT_MS,
  findArtifactReview,
  keyForResult,
  listArtifactReviews,
  releaseActiveReview,
  RUNNING_REVIEW_TIMEOUT_MS,
  saveArtifactReview,
  sweepStaleArtifactReviews,
  type StoredArtifactReview,
} from '../services/artifactReviewStore';

function result(over: Partial<ArtifactReviewResult> = {}): ArtifactReviewResult {
  const score = { value: 80, status: 'complete' as const, coveragePercent: 100 };
  return {
    status: 'complete',
    evaluatorVersion: ARTIFACT_EVALUATOR_VERSION,
    artifactKind: 'skill',
    artifactName: 'expense-report',
    artifactHash: 'hash-a',
    selectedRuntimes: ['cowork'],
    scores: { quality: score, integrity: score, safety: score, readiness: score, safetyGate: 'none' },
    dimensions: (
      [
        'trigger-clarity',
        'task-focus',
        'instruction-quality',
        'portability',
        'safety-evidence',
        'packaging-quality',
      ] as const
    ).map((id) => ({ id, score: 4, assessment: 'assessment', evidence: '' })),
    runtimeVerdicts: [
      {
        runtime: 'cowork',
        verdict: 'runs',
        score: 80,
        findingIds: [],
        catalogueVersion: '1',
        catalogueSnapshotDate: '2026-01-01',
      },
    ],
    findings: [],
    recommendation: 'submit',
    aiAvailable: true,
    reviewedAt: '2026-01-01T10:00:00.000Z',
    ...over,
  };
}

/** A Dataverse row as the store expects to read it back. */
function row(over: Record<string, unknown> = {}) {
  const r = result();
  return {
    cat_agentreviewsid: 'row-1',
    cat_componentidunique: keyForResult(r),
    cat_agentname: r.artifactName,
    cat_reviewdate: r.reviewedAt,
    cat_reviewresultjson: JSON.stringify(r),
    ...over,
  };
}

beforeEach(() => {
  getAll.mockReset();
  create.mockReset();
  update.mockReset();
  remove.mockReset();
  // "No job answered" is the state the age-out rule is written for, so it is
  // the right default for every test that is not about resuming.
  resumeArtifactReview.mockReset().mockResolvedValue({ kind: 'unresolved' });
});

describe('artifactReviewKey', () => {
  it('treats the same bytes against different runtimes as different reviews', () => {
    expect(artifactReviewKey('h', ['cowork'])).not.toBe(artifactReviewKey('h', ['cowork', 'scout']));
  });

  it('ignores the order the runtimes were chosen in', () => {
    expect(artifactReviewKey('h', ['scout', 'cowork'])).toBe(artifactReviewKey('h', ['cowork', 'scout']));
  });

  it('treats different bytes as different reviews', () => {
    expect(artifactReviewKey('a', ['cowork'])).not.toBe(artifactReviewKey('b', ['cowork']));
  });
});

describe('listArtifactReviews', () => {
  it('reads only skill and automation reviews, not the other two tabs', async () => {
    getAll.mockResolvedValue({ success: true, data: [] });

    await listArtifactReviews();

    expect(getAll.mock.calls[0][0].filter).toContain('cat_agenttype eq 3');
  });

  it('asks for the newest reviews first', async () => {
    getAll.mockResolvedValue({ success: true, data: [] });

    await listArtifactReviews();

    expect(getAll.mock.calls[0][0].orderBy).toEqual(['cat_reviewdate desc']);
  });

  it('caps the query so one busy environment cannot stall the page', async () => {
    getAll.mockResolvedValue({ success: true, data: [] });

    await listArtifactReviews(5);

    expect(getAll.mock.calls[0][0].top).toBe(5);
  });

  it('returns the parsed review for each row', async () => {
    getAll.mockResolvedValue({ success: true, data: [row()] });

    const entries = await listArtifactReviews();

    expect(entries).toHaveLength(1);
    expect(entries[0].reviewId).toBe('row-1');
    expect(entries[0].result.artifactName).toBe('expense-report');
  });

  it('drops a row whose stored review cannot be parsed rather than rendering blanks', async () => {
    getAll.mockResolvedValue({
      success: true,
      data: [row(), row({ cat_agentreviewsid: 'row-2', cat_reviewresultjson: 'not json' })],
    });

    const entries = await listArtifactReviews();

    expect(entries.map((e) => e.reviewId)).toEqual(['row-1']);
  });

  it('drops a row that predates a contract change', async () => {
    getAll.mockResolvedValue({
      success: true,
      data: [row({ cat_reviewresultjson: JSON.stringify({ artifactName: 'old' }) })],
    });

    expect(await listArtifactReviews()).toEqual([]);
  });

  it('does not reuse a historical review containing retired unsupported findings', async () => {
    const retired = result({
      findings: [
        {
          ruleId: 'PKG-META',
          id: 'PKG-META:SKILL.md',
        } as ArtifactReviewResult['findings'][number],
      ],
    });
    getAll.mockResolvedValue({
      success: true,
      data: [row({ cat_reviewresultjson: JSON.stringify(retired) })],
    });

    expect(await listArtifactReviews()).toEqual([]);
  });

  it('does not reuse a historical review classified as an unsupported automation installer', async () => {
    const legacyInstaller = {
      ...result(),
      artifactKind: 'automation-installer',
    };
    getAll.mockResolvedValue({
      success: true,
      data: [row({ cat_reviewresultjson: JSON.stringify(legacyInstaller) })],
    });

    expect(await listArtifactReviews()).toEqual([]);
  });

  // A row saved before `basis` existed reads as `undefined` at run time, because
  // the parse asserts the stored JSON into the current type. The results panel
  // matches the basis on exact values, so such a row used to match neither
  // branch and silently dropped the evidence sentence the field was added to
  // show. Back-filling is exact: the basis describes what the runtime
  // publishes, not what the review found.
  it('back-fills the verdict basis on a row saved before the field existed', async () => {
    const legacy = result({
      selectedRuntimes: ['cowork', 'copilot-studio'],
      declaredRuntimes: ['cowork', 'copilot-studio'],
    });
    const stripped = {
      ...legacy,
      runtimeVerdicts: [
        { ...legacy.runtimeVerdicts[0], runtime: 'cowork' as const, basis: undefined },
        { ...legacy.runtimeVerdicts[0], runtime: 'copilot-studio' as const, basis: undefined },
      ],
    };
    getAll.mockResolvedValue({
      success: true,
      data: [row({ cat_reviewresultjson: JSON.stringify(stripped) })],
    });

    const entries = await listArtifactReviews();

    expect(entries[0].result.runtimeVerdicts.map((v) => v.basis)).toEqual([
      'tool-catalogue',
      'package-contract',
    ]);
  });

  it('leaves a stored basis alone rather than recomputing it', async () => {
    const current = result();
    const pinned = {
      ...current,
      runtimeVerdicts: [{ ...current.runtimeVerdicts[0], runtime: 'cowork' as const, basis: 'none' }],
    };
    getAll.mockResolvedValue({
      success: true,
      data: [row({ cat_reviewresultjson: JSON.stringify(pinned) })],
    });

    const entries = await listArtifactReviews();

    expect(entries[0].result.runtimeVerdicts[0].basis).toBe('none');
  });

  // Rows written before applicability existed still claim a Scout automation
  // "Runs" on Copilot Cowork, which has no automation import at all. They are in
  // the reader's grid right now, so the repair has to happen on read.
  it('repairs a stored verdict for a runtime that cannot install the format', async () => {
    const legacy = result({
      artifactKind: 'automation',
      selectedRuntimes: ['cowork', 'scout'],
      runtimeVerdicts: [
        {
          runtime: 'cowork',
          verdict: 'runs',
          score: 100,
          findingIds: [],
          basis: 'tool-catalogue',
          catalogueVersion: '1',
          catalogueSnapshotDate: '2026-01-01',
        },
        {
          runtime: 'scout',
          verdict: 'runs',
          score: 100,
          findingIds: [],
          basis: 'tool-catalogue',
          catalogueVersion: '1',
          catalogueSnapshotDate: '2026-01-01',
        },
      ],
    });
    getAll.mockResolvedValue({
      success: true,
      data: [row({ cat_reviewresultjson: JSON.stringify(legacy) })],
    });

    const verdicts = (await listArtifactReviews())[0].result.runtimeVerdicts;
    const cowork = verdicts.find((v) => v.runtime === 'cowork');

    expect(cowork?.verdict).toBe('not-applicable');
    expect(cowork?.score).toBeNull();
    expect(cowork?.notApplicableReason).toContain('Copilot Cowork');
    // Scout can install an automation, so its verdict is left exactly as stored.
    expect(verdicts.find((v) => v.runtime === 'scout')?.verdict).toBe('runs');
  });

  it('repairs stored dimensions that describe a part the format does not have', async () => {
    const legacy = result({ artifactKind: 'automation', selectedRuntimes: ['scout'] });
    getAll.mockResolvedValue({
      success: true,
      data: [row({ cat_reviewresultjson: JSON.stringify(legacy) })],
    });

    const dimensions = (await listArtifactReviews())[0].result.dimensions;
    const byId = Object.fromEntries(dimensions.map((d) => [d.id, d]));

    expect(byId.portability.score).toBeNull();
    expect(byId['packaging-quality'].score).toBeNull();
    expect(byId.portability.assessment).toContain('Not applicable');
    expect(byId['safety-evidence'].score).toBe(4);
  });

  it('keeps a dimension that carries evidence, even where the table says it does not apply', async () => {
    // Evidence outranks the applicability table. Dropping a scored dimension
    // that a finding actually landed on would delete that finding from the
    // score with nothing on screen to show it had gone.
    const base = result({ artifactKind: 'automation', selectedRuntimes: ['scout'] });
    const legacy = {
      ...base,
      dimensions: base.dimensions.map((d) =>
        d.id === 'portability' ? { ...d, evidence: 'A real finding' } : d,
      ),
    };
    getAll.mockResolvedValue({
      success: true,
      data: [row({ cat_reviewresultjson: JSON.stringify(legacy) })],
    });

    const dimensions = (await listArtifactReviews())[0].result.dimensions;

    expect(dimensions.find((d) => d.id === 'portability')?.score).toBe(4);
  });

  it('removes a stored positive skill claim that has no runtime-target evidence', async () => {
    const current = result({ artifactKind: 'skill' });
    getAll.mockResolvedValue({
      success: true,
      data: [row({ cat_reviewresultjson: JSON.stringify(current) })],
    });

    const stored = (await listArtifactReviews())[0].result;

    expect(stored.runtimeVerdicts[0].verdict).toBe('not-evaluated');
    expect(stored.runtimeVerdicts[0].score).toBeNull();
    expect(stored.runtimeVerdicts[0].basis).toBe('none');
    expect(stored.dimensions.every((d) => d.score === 4)).toBe(true);
  });

  it('keeps a stored positive claim when authoritative target metadata was persisted', async () => {
    const current = result({
      artifactKind: 'skill',
      declaredRuntimes: ['cowork'],
    });
    getAll.mockResolvedValue({
      success: true,
      data: [row({ cat_reviewresultjson: JSON.stringify(current) })],
    });

    expect((await listArtifactReviews())[0].result.runtimeVerdicts[0].verdict).toBe('runs');
  });

  it('never guesses when the row records no artifact kind', async () => {
    const legacy = result({ selectedRuntimes: ['cowork'] });
    delete (legacy as { artifactKind?: unknown }).artifactKind;
    getAll.mockResolvedValue({
      success: true,
      data: [row({ cat_reviewresultjson: JSON.stringify(legacy) })],
    });

    expect((await listArtifactReviews())[0].result.runtimeVerdicts[0].verdict).toBe('runs');
  });

  it('reports a failed read rather than showing an empty history', async () => {
    getAll.mockResolvedValue({ success: false, error: { message: 'Dataverse said no' } });

    await expect(listArtifactReviews()).rejects.toThrow('Dataverse said no');
  });
});

describe('findArtifactReview', () => {
  it('matches on the artifact hash and the chosen runtimes together', async () => {
    getAll.mockResolvedValue({ success: true, data: [] });

    await findArtifactReview('hash-a', ['scout', 'cowork']);

    expect(getAll.mock.calls[0][0].filter).toContain("cat_componentidunique eq 'v3:hash-a:cowork,scout'");
  });

  it('returns the stored review when the same file was reviewed before', async () => {
    getAll.mockResolvedValue({ success: true, data: [row()] });

    const found = await findArtifactReview('hash-a', ['cowork']);

    expect(found?.reviewId).toBe('row-1');
  });

  /*
    The caller runs this before starting the review, so a lookup that never
    answers would leave the user with a closed dialog and no review. Reporting
    "no duplicate" costs at most one repeated AI call; hanging costs the task.
  */
  it('gives up rather than blocking the review when Dataverse does not answer', async () => {
    vi.useFakeTimers();
    getAll.mockReturnValue(new Promise(() => {}));

    const pending = findArtifactReview('hash-a', ['cowork']);
    await vi.advanceTimersByTimeAsync(DUPLICATE_LOOKUP_TIMEOUT_MS + 1);

    await expect(pending).resolves.toBeNull();
    vi.useRealTimers();
  });

  it('returns nothing when the file is new', async () => {
    getAll.mockResolvedValue({ success: true, data: [] });

    expect(await findArtifactReview('hash-new', ['cowork'])).toBeNull();
  });

  it('returns nothing rather than throwing when the lookup fails, so the review can still run', async () => {
    getAll.mockResolvedValue({ success: false, error: { message: 'offline' } });

    expect(await findArtifactReview('hash-a', ['cowork'])).toBeNull();
  });
});

describe('saveArtifactReview', () => {
  it('stores a completed review', async () => {
    getAll.mockResolvedValue({ success: true, data: [] });
    create.mockResolvedValue({ success: true, data: { cat_agentreviewsid: 'new-1' } });

    expect(await saveArtifactReview(result())).toBe('new-1');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('stores a partial review, because it still carries an assessment', async () => {
    getAll.mockResolvedValue({ success: true, data: [] });
    create.mockResolvedValue({ success: true, data: { cat_agentreviewsid: 'new-2' } });

    expect(await saveArtifactReview(result({ status: 'partial' }))).toBe('new-2');
  });

  it('does not store a cancelled run, which produced no assessment', async () => {
    expect(await saveArtifactReview(result({ status: 'cancelled' }))).toBeNull();
    expect(create).not.toHaveBeenCalled();
    expect(getAll).not.toHaveBeenCalled();
  });

  it('stores a reserved review, so it survives the app closing', async () => {
    // This is the write that turns an invisible run into a visible one. Without
    // it, closing the browser mid-review left the grid showing nothing at all,
    // while the workflow carried on and the AI call was still charged.
    getAll.mockResolvedValue({ success: true, data: [] });
    create.mockResolvedValue({ success: true, data: { cat_agentreviewsid: 'row-run' } });

    const reserved = result({
      status: 'in-progress',
      dimensions: [],
      runtimeVerdicts: [],
      startedAt: '2025-01-01T00:00:00.000Z',
    });

    expect(await saveArtifactReview(reserved)).toBe('row-run');
    expect(create.mock.calls[0][0]).toMatchObject({ cat_reviewstatus: 335350001 });
  });

  it('clears the score and issue count on a row that has not been assessed', async () => {
    // Writing 0 would be read as "scored zero", which is a verdict. The absence
    // of a verdict and the worst possible verdict are different answers.
    //
    // Cleared with `null`, never `''`. Both columns are whole numbers in
    // Dataverse, so an empty string rejects the entire write. That is not a
    // cosmetic difference: it silently defeated reserving altogether, because
    // every reserved row failed to save and the review became visible only once
    // it finished and had real numbers to send.
    getAll.mockResolvedValue({ success: true, data: [] });
    create.mockResolvedValue({ success: true, data: { cat_agentreviewsid: 'row-run' } });

    await saveArtifactReview(
      result({
        status: 'in-progress',
        dimensions: [],
        runtimeVerdicts: [],
        startedAt: '2025-01-01T00:00:00.000Z',
      }),
    );

    expect(create.mock.calls[0][0]).toMatchObject({
      cat_overallscore: null,
      cat_totalissues: null,
    });
  });

  it('stores a failed review that had already announced itself', async () => {
    // The reserved row is claiming to be running. Something must correct it, or
    // the grid offers progress on a review that stopped.
    getAll.mockResolvedValue({ success: true, data: [{ cat_agentreviewsid: 'row-run' }] });
    update.mockResolvedValue({ success: true, data: {} });

    const stopped = result({ status: 'failed', startedAt: '2025-01-01T00:00:00.000Z' });

    expect(await saveArtifactReview(stopped)).toBe('row-run');
    expect(update.mock.calls[0][1]).toMatchObject({ cat_reviewstatus: 335350002 });
  });

  it('does not store a failure that happened before the review announced itself', async () => {
    // An upload that could not be identified never claimed to be in progress,
    // so there is no running row to correct. Adding one would put rejected
    // uploads into a list of reviewed artifacts.
    expect(await saveArtifactReview(result({ status: 'failed' }))).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('completes onto the row it reserved, rather than adding a second one', async () => {
    // Reservation and completion share `cat_componentidunique`, which is what
    // stops one review becoming two records.
    getAll.mockResolvedValue({ success: true, data: [{ cat_agentreviewsid: 'row-run' }] });
    update.mockResolvedValue({ success: true, data: {} });

    expect(await saveArtifactReview(result({ status: 'complete' }))).toBe('row-run');
    expect(create).not.toHaveBeenCalled();
    expect(update.mock.calls[0][1]).toMatchObject({ cat_reviewstatus: 335350000 });
  });

  it('updates the existing row when the same file is reviewed again', async () => {
    getAll.mockResolvedValue({ success: true, data: [{ cat_agentreviewsid: 'row-1' }] });
    update.mockResolvedValue({ success: true, data: {} });

    expect(await saveArtifactReview(result())).toBe('row-1');
    expect(update).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });

  it('marks the row as a skill or automation so the other tabs do not show it', async () => {
    getAll.mockResolvedValue({ success: true, data: [] });
    create.mockResolvedValue({ success: true, data: { cat_agentreviewsid: 'new-1' } });

    await saveArtifactReview(result());

    expect(create.mock.calls[0][0].cat_agenttype).toBe(3);
  });

  /*
    The stored score and the grid score come from the same function, so this
    also guards the pair from drifting apart. It is the rubric roll-up: the
    runtime verdict scores below are deliberately far from it, and must not
    move it.
  */
  it('records the finding count and the weighted rubric score', async () => {
    getAll.mockResolvedValue({ success: true, data: [] });
    create.mockResolvedValue({ success: true, data: { cat_agentreviewsid: 'new-1' } });

    await saveArtifactReview(
      result({
        findings: [{ id: 'a' } as never, { id: 'b' } as never],
        runtimeVerdicts: [
          {
            runtime: 'cowork',
            verdict: 'runs',
            score: 90,
            findingIds: [],
            catalogueVersion: '1',
            catalogueSnapshotDate: '2026-01-01',
          },
          {
            runtime: 'scout',
            verdict: 'runs-with-issues',
            score: 20,
            findingIds: [],
            catalogueVersion: '1',
            catalogueSnapshotDate: '2026-01-01',
          },
        ],
      }),
    );

    expect(create.mock.calls[0][0].cat_totalissues).toBe('2');
    expect(create.mock.calls[0][0].cat_overallscore).toBe('80');
  });

  it('never writes an overall score above the Dataverse maximum', async () => {
    getAll.mockResolvedValue({ success: true, data: [] });
    create.mockResolvedValue({ success: true, data: { cat_agentreviewsid: 'new-1' } });

    await saveArtifactReview(
      result({
        dimensions: result().dimensions.map((dimension) => ({
          ...dimension,
          score: 9,
        })),
      }),
    );

    expect(create.mock.calls[0][0].cat_overallscore).toBe('100');
  });

  it('reports a failed save rather than pretending the review was kept', async () => {
    getAll.mockResolvedValue({ success: true, data: [] });
    create.mockResolvedValue({ success: false, error: { message: 'write denied' } });

    await expect(saveArtifactReview(result())).rejects.toThrow('write denied');
  });
});

describe('deleteArtifactReview', () => {
  it('deletes by review id', async () => {
    remove.mockResolvedValue(undefined);

    await deleteArtifactReview('row-1');

    expect(remove).toHaveBeenCalledWith('row-1');
  });
});

/*
  A reserved row says "running". If the app closes, nothing is left to correct
  it, so without a sweep the grid would show a review that has been running for
  a week. The sweep is the only thing that makes a reserved row self-correcting,
  and therefore the only thing that makes reserving safe.
*/
describe('sweepStaleArtifactReviews', () => {
  // Built without a cast, so a field the sweep reads cannot silently be absent.
  const row = (over: Partial<ArtifactReviewResult>, reviewId: string): StoredArtifactReview => {
    const r = result(over);
    return {
      reviewId,
      componentIdUnique: `${r.artifactHash}:${r.selectedRuntimes.join(',')}`,
      artifactName: r.artifactName,
      reviewedOn: r.startedAt ? new Date(r.startedAt) : undefined,
      result: r,
    };
  };

  const started = (iso: string, reviewId = `row-${iso}`): StoredArtifactReview =>
    row({ status: 'in-progress', dimensions: [], runtimeVerdicts: [], startedAt: iso }, reviewId);

  const now = new Date('2025-01-01T12:00:00.000Z');

  it('leaves a review that is still within its allowed time alone', async () => {
    const fresh = started(new Date(now.getTime() - 60_000).toISOString());

    expect(await sweepStaleArtifactReviews([fresh], now)).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });

  it('marks a review that outlived its deadline as not finished', async () => {
    update.mockResolvedValue({ success: true, data: {} });
    const stale = started(new Date(now.getTime() - RUNNING_REVIEW_TIMEOUT_MS - 1).toISOString());

    expect(await sweepStaleArtifactReviews([stale], now)).toBe(1);
    expect(update.mock.calls[0][1]).toMatchObject({ cat_reviewstatus: 335350002 });
  });

  it('writes to the row it was given rather than searching for it again', async () => {
    // The sweep already holds the id. Going back through the upsert would cost
    // an extra read per stranded row for an answer it has.
    update.mockResolvedValue({ success: true, data: {} });
    const stale = started(new Date(now.getTime() - RUNNING_REVIEW_TIMEOUT_MS - 1).toISOString(), 'row-77');

    await sweepStaleArtifactReviews([stale], now);

    expect(update.mock.calls[0][0]).toBe('row-77');
    expect(getAll).not.toHaveBeenCalled();
  });

  it('ignores rows that were never running', async () => {
    const done = row({ status: 'complete' }, 'row-done');

    expect(await sweepStaleArtifactReviews([done], now)).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });

  it('leaves a row alone when its start time cannot be read', async () => {
    // Guessing an age from an unreadable timestamp could stop a review that is
    // still running. Doing nothing is the recoverable mistake.
    const broken = row(
      {
        status: 'in-progress',
        dimensions: [],
        runtimeVerdicts: [],
        startedAt: 'not-a-date',
        reviewedAt: 'not-a-date',
      },
      'row-broken',
    );

    expect(await sweepStaleArtifactReviews([broken], now)).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });

  it('keeps sweeping when one row cannot be written', async () => {
    // The sweep is housekeeping on the way to reading the list. One row that
    // will not update must not stop the rest of the list from being corrected.
    update
      .mockResolvedValueOnce({ success: false, error: { message: 'locked' } })
      .mockResolvedValueOnce({ success: true, data: {} });

    const old = new Date(now.getTime() - RUNNING_REVIEW_TIMEOUT_MS - 1).toISOString();

    expect(await sweepStaleArtifactReviews([started(old, 'a'), started(old, 'b')], now)).toBe(1);
    expect(update).toHaveBeenCalledTimes(2);
  });

  /*
    Resuming is what makes "continue in background" true. Everything above
    describes the fallback for a review whose job cannot be found; these
    describe the case the fallback exists to catch, which is now the common one.
  */

  it('collects a review that finished while its browser was away', async () => {
    update.mockResolvedValue({ success: true, data: {} });
    const collected = result({ status: 'complete', artifactName: 'expense-report' });
    resumeArtifactReview.mockResolvedValue({ kind: 'collected', result: collected });

    // Recent enough that the age-out rule would have left it alone. The row is
    // settled because the answer exists, not because the row is old.
    const fresh = started(new Date(now.getTime() - 60_000).toISOString(), 'row-42');

    expect(await sweepStaleArtifactReviews([fresh], now)).toBe(1);
    expect(update.mock.calls[0][0]).toBe('row-42');
    expect(update.mock.calls[0][1]).toMatchObject({ cat_reviewstatus: 335350000 });
  });

  it('leaves a row running while its job is still going, however old it is', async () => {
    // The deadline exists to stop rows claiming to run for ever. A row with a
    // live job behind it is not making a false claim, so it survives the
    // deadline — otherwise a long review would be declared dead mid-flight.
    resumeArtifactReview.mockResolvedValue({ kind: 'running', jobId: 'job-1' });
    const old = started(new Date(now.getTime() - RUNNING_REVIEW_TIMEOUT_MS - 1).toISOString());

    expect(await sweepStaleArtifactReviews([old], now)).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });

  it('does not touch a row this browser is already completing', async () => {
    // Both would write the same verdict, so nothing would be corrupted, but the
    // reader would watch the row settle twice and the results would be read
    // from Dataverse twice for one review.
    claimActiveReview('row-mine');
    const mine = started(new Date(now.getTime() - RUNNING_REVIEW_TIMEOUT_MS - 1).toISOString(), 'row-mine');

    expect(await sweepStaleArtifactReviews([mine], now)).toBe(0);
    expect(resumeArtifactReview).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();

    releaseActiveReview('row-mine');
  });

  it('sweeps a row again once the browser that claimed it lets go', async () => {
    // A run that ends without writing a result must not lock its row out of the
    // sweep for the life of the tab.
    claimActiveReview('row-freed');
    releaseActiveReview('row-freed');
    update.mockResolvedValue({ success: true, data: {} });

    const freed = started(
      new Date(now.getTime() - RUNNING_REVIEW_TIMEOUT_MS - 1).toISOString(),
      'row-freed',
    );

    expect(await sweepStaleArtifactReviews([freed], now)).toBe(1);
  });

  it('does not load the resume path when there is nothing running', async () => {
    // Listing reviews is the hot path. It must not pull in the job service and
    // the AI stage to discover it has no work to do.
    expect(await sweepStaleArtifactReviews([row({ status: 'complete' }, 'row-done')], now)).toBe(0);
    expect(resumeArtifactReview).not.toHaveBeenCalled();
  });
});
