import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock generated services to avoid @microsoft/power-apps module resolution failure
vi.mock('../../../../generated/services/Cat_policyrequestsService', () => ({ Cat_policyrequestsService: {} }));
vi.mock('../../../../generated/services/Cat_policyrequestenvironmentsService', () => ({ Cat_policyrequestenvironmentsService: {} }));
vi.mock('../../../../generated/services/Cat_policyrequestconnectorsService', () => ({ Cat_policyrequestconnectorsService: {} }));
vi.mock('../../../../generated/services/Cat_policyrequestanswersService', () => ({ Cat_policyrequestanswersService: {} }));
vi.mock('../../../../generated/services/Cat_policyrequestparticipantsService', () => ({ Cat_policyrequestparticipantsService: {} }));
vi.mock('../../../../generated/services/Cat_powershieldcustomconnectorpatternsService', () => ({ Cat_powershieldcustomconnectorpatternsService: {} }));
vi.mock('../../../../generated/services/AnnotationsService', () => ({ AnnotationsService: {} }));

import { deleteChildRecordsWithVerification } from '../../shared/services/dataverse/wizardSubmitService';

type FakeRecord = { id: string };

function makeOpts(overrides?: {
  getAllResults?: Array<{ success?: boolean; data?: FakeRecord[]; error?: { message?: string } }>;
  deleteOneFn?: (id: string) => Promise<void>;
}) {
  const results = overrides?.getAllResults ?? [
    { success: true, data: [{ id: 'r1' }, { id: 'r2' }] },
    { success: true, data: [] }, // verification pass — empty
  ];
  let callIndex = 0;
  const getAll = vi.fn(() => Promise.resolve(results[callIndex++] ?? { success: true, data: [] }));
  const deleteOne = overrides?.deleteOneFn
    ? vi.fn(overrides.deleteOneFn)
    : vi.fn(() => Promise.resolve());

  return {
    label: 'test-records',
    getAll,
    getId: (r: FakeRecord) => r.id,
    deleteOne,
  };
}

describe('deleteChildRecordsWithVerification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('deletes all records and verifies none remain', async () => {
    const opts = makeOpts();
    await deleteChildRecordsWithVerification(opts);

    // First call: fetch records to delete. Second call: verification query.
    expect(opts.getAll).toHaveBeenCalledTimes(2);
    expect(opts.deleteOne).toHaveBeenCalledTimes(2);
    expect(opts.deleteOne).toHaveBeenCalledWith('r1');
    expect(opts.deleteOne).toHaveBeenCalledWith('r2');
  });

  it('skips deletion when no records exist', async () => {
    const opts = makeOpts({
      getAllResults: [
        { success: true, data: [] },
        { success: true, data: [] },
      ],
    });
    await deleteChildRecordsWithVerification(opts);

    expect(opts.getAll).toHaveBeenCalledTimes(2);
    expect(opts.deleteOne).not.toHaveBeenCalled();
  });

  it('retries when records survive the first deletion pass', async () => {
    const opts = makeOpts({
      getAllResults: [
        { success: true, data: [{ id: 'r1' }] },  // initial fetch
        { success: true, data: [{ id: 'r1' }] },  // verification — still exists
        { success: true, data: [] },                // final verification — gone
      ],
    });
    await deleteChildRecordsWithVerification(opts);

    // Initial delete + retry delete
    expect(opts.deleteOne).toHaveBeenCalledTimes(2);
    // 3 getAll calls: fetch, verify, final-verify
    expect(opts.getAll).toHaveBeenCalledTimes(3);
  });

  it('throws when records persist after retry', async () => {
    const opts = makeOpts({
      getAllResults: [
        { success: true, data: [{ id: 'r1' }] },
        { success: true, data: [{ id: 'r1' }] },  // still exists
        { success: true, data: [{ id: 'r1' }] },  // STILL exists after retry
      ],
    });

    await expect(deleteChildRecordsWithVerification(opts)).rejects.toThrow(
      /Failed to delete all test-records.*after retry.*1 record/,
    );
  });

  it('throws when initial fetch fails', async () => {
    const opts = makeOpts({
      getAllResults: [
        { success: false, error: { message: 'Network error' } },
      ],
    });

    await expect(deleteChildRecordsWithVerification(opts)).rejects.toThrow(
      /Failed to fetch existing test-records.*Network error/,
    );
    expect(opts.deleteOne).not.toHaveBeenCalled();
  });
});
