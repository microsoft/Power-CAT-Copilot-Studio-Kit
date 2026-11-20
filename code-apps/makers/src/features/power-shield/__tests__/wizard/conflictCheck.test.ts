import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IN_PROGRESS_BLOCKING_STATUSES } from '../../models/status';
import type { RequestStatus } from '../../models/status';
import { checkInProgressConflict } from '../../shared/services/dataverse/wizardSubmitService';
import { Cat_policyrequestsService } from '../../../../generated/services/Cat_policyrequestsService';
import type { Cat_policyrequests } from '../../../../generated/models/Cat_policyrequestsModel';

function mockGetAll(data: Partial<Cat_policyrequests>[], success = true) {
  return vi.spyOn(Cat_policyrequestsService, 'getAll').mockResolvedValue({
    success,
    data: data as Cat_policyrequests[],
  } as Awaited<ReturnType<typeof Cat_policyrequestsService.getAll>>);
}

describe('IN_PROGRESS_BLOCKING_STATUSES — blocking status list', () => {
  const expected: RequestStatus[] = [
    'Draft',
    'Submitted',
    'UnderReview',
    'Approved',
    'Implementing',
    'AutoRejected',
  ];

  it('contains exactly 6 blocking statuses', () => {
    expect(IN_PROGRESS_BLOCKING_STATUSES).toHaveLength(6);
  });

  it.each(expected)('includes "%s" as a blocking status', (status) => {
    expect(IN_PROGRESS_BLOCKING_STATUSES).toContain(status);
  });

  const nonBlocking: RequestStatus[] = [
    'Withdrawn',
    'Rejected',
    'Implemented',
    'ImplementedWithErrors',
  ];

  it.each(nonBlocking)('does NOT include "%s" as a blocking status', (status) => {
    expect(IN_PROGRESS_BLOCKING_STATUSES).not.toContain(status);
  });
});

describe('checkInProgressConflict — conflict detection', () => {
  const serviceTreeId = 'st-aaaaaaaa-0000-0000-0000-000000000001';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when no blocking requests exist for the service tree', async () => {
    mockGetAll([]);
    const result = await checkInProgressConflict(serviceTreeId);
    expect(result).toBeNull();
  });

  it('returns conflict object when a blocking request exists', async () => {
    mockGetAll([
      { cat_policyrequestid: 'req-001', cat_policyrequestname: 'REQ-0042' },
    ]);
    const result = await checkInProgressConflict(serviceTreeId);
    expect(result).not.toBeNull();
    expect(result?.requestId).toBe('req-001');
    expect(result?.requestNumber).toBe('REQ-0042');
  });

  it('queries using the serviceTreeId in the filter', async () => {
    const spy = mockGetAll([]);
    await checkInProgressConflict(serviceTreeId);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: expect.stringContaining(serviceTreeId),
      }),
    );
  });

  it('excludes the current draft when excludeRequestId is provided', async () => {
    const draftId = 'req-draft-001';
    const spy = mockGetAll([]);
    await checkInProgressConflict(serviceTreeId, draftId);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: expect.stringContaining(draftId),
      }),
    );
  });

  it('returns null when only the excluded draft matches (edit mode)', async () => {
    const draftId = 'req-draft-001';
    // The service excludes the draft server-side in the OData filter
    mockGetAll([]);
    const result = await checkInProgressConflict(serviceTreeId, draftId);
    expect(result).toBeNull();
  });
});
