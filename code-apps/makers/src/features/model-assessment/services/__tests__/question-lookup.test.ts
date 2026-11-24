import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTestCaseDetails } from '../model-assessment-service';

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../../../../generated/services/MicrosoftDataverseService', () => ({
  MicrosoftDataverseService: { ListRecordsWithOrganization: mocks.list },
}));

const id = (n: number) => `00000000-0000-0000-0000-${n.toString(16).padStart(12, '0')}`;

describe('question lookup batching', () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => vi.useRealTimers());

  it('runs up to three batches concurrently, preserving all labels', async () => {
    vi.useFakeTimers();
    let active = 0;
    let peak = 0;
    mocks.list.mockImplementation(async (...args: unknown[]) => {
      active += 1;
      peak = Math.max(active, peak);
      const ids = String(args[7]).match(/[0-9a-f-]{36}/g) ?? [];
      expect(ids.length).toBeLessThanOrEqual(20);
      await new Promise((resolve) => setTimeout(resolve, 100));
      active -= 1;
      return { success: true, data: { value: ids.map((key) => ({ botcomponentid: key, name: `Question ${key}` })) } };
    });
    const start = Date.now();
    const pending = getTestCaseDetails(Array.from({ length: 81 }, (_, n) => id(n)));
    await vi.runAllTimersAsync();
    const labels = await pending;
    expect(Object.keys(labels)).toHaveLength(81);
    expect(labels[id(80)]).toEqual({ name: `Question ${id(80)}`, questions: [], multiTurn: false });
    expect(mocks.list).toHaveBeenCalledTimes(5);
    expect(peak).toBe(3);
    expect(Date.now() - start).toBe(200);
  });

  it('deduplicates IDs regardless of case and ignores invalid identifiers', async () => {
    mocks.list.mockResolvedValue({ success: true, data: { value: [] } });
    await getTestCaseDetails([id(15), id(15).toUpperCase(), 'not-a-guid']);
    expect(mocks.list).toHaveBeenCalledTimes(1);
    expect(mocks.list.mock.calls[0][7]).toBe(`botcomponentid eq ${id(15)}`);
  });

  it('surfaces connector failures instead of reporting an empty lookup as success', async () => {
    mocks.list.mockResolvedValue({ success: false, error: { message: 'Access denied' } });
    await expect(getTestCaseDetails([id(1)])).rejects.toThrow('Failed to load botcomponents');
  });

  it('reads every user turn of a multi-turn test case, in order', async () => {
    const data = [
      'kind: MultiTurnEvaluationCase',
      'activities:',
      '  - activity:',
      '      value:',
      '        from:',
      '          role: user',
      '        text:',
      '          - Add a support ticket.',
      '  - activity:',
      '      value:',
      '        from:',
      '          role: agent',
      '        text:',
      '          - Which environment?',
      '  - activity:',
      '      value:',
      '        from:',
      '          role: user',
      '        text:',
      '          - "Environment: \'HelpDesk\'."',
    ].join('\n');
    mocks.list.mockResolvedValue({
      success: true,
      data: { value: [{ botcomponentid: id(2), name: 'Add a support ticket.', data }] },
    });
    const details = await getTestCaseDetails([id(2)]);
    expect(mocks.list.mock.calls[0][6]).toBe('botcomponentid,name,data');
    expect(details[id(2)].questions).toEqual(['Add a support ticket.', "Environment: 'HelpDesk'."]);
  });
});
