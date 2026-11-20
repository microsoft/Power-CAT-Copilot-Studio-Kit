import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../../../../shared/services/dataversePaging', () => ({ listDataverseRows: mocks.list }));
vi.mock('../../../../generated/services/MicrosoftDataverseService', () => ({ MicrosoftDataverseService: {} }));

import { getKitTestResults } from '../model-assessment-service';

const RUN = '00000000-0000-4000-8000-000000000001';
const PARENT = '00000000-0000-4000-8000-000000000002';

describe('getKitTestResults conversation questions', () => {
  beforeEach(() => { mocks.list.mockReset(); });

  it.each(['Conversation heading', undefined])('loads ordered child questions even when the parent has an utterance: %s', async (utterance) => {
    mocks.list.mockImplementation(async (_org: string, entity: string, options: { filter: string }) => {
      if (entity === 'cat_copilottestruns') return [];
      if (options.filter.startsWith('_cat_parent_value eq null')) {
        return [{
          cat_copilottestresultid: PARENT, _cat_copilottestrunid_value: RUN,
          cat_testutterance: utterance, cat_testtypecode: 5, cat_resultcode: 2,
        }];
      }
      return [
        { _cat_parent_value: PARENT.toUpperCase(), cat_testutterance: ' First ' },
        { _cat_parent_value: PARENT, cat_testutterance: 'Second' },
        { _cat_parent_value: PARENT, cat_testutterance: 'First' },
      ];
    });
    const results = await getKitTestResults([RUN]);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      code: 2, questions: ['First', 'Second', 'First'],
      utterance: utterance ?? 'First\nSecond\nFirst',
    });
    expect(mocks.list).toHaveBeenCalledWith('current', 'cat_copilottestresults', {
      select: '_cat_parent_value,cat_copilottestresultid,_cat_copilottestid_value,cat_testutterance,cat_testtypecode,cat_comparisonoperator,cat_resultcode,cat_response',
      filter: `_cat_parent_value eq ${PARENT}`, orderby: 'createdon asc',
    });
  });

  it('does not query child rows for ordinary single-turn results', async () => {
    mocks.list.mockImplementation(async (_org: string, entity: string) => entity === 'cat_copilottestruns' ? [] : [{
      cat_copilottestresultid: PARENT, _cat_copilottestrunid_value: RUN,
      cat_testutterance: 'Hello', cat_testtypecode: 1, cat_resultcode: 1,
    }]);
    const results = await getKitTestResults([RUN]);
    expect(results[0]).toMatchObject({ utterance: 'Hello', code: 1 });
    expect(results[0].questions).toBeUndefined();
    expect(mocks.list).toHaveBeenCalledTimes(2);
  });

  it('surfaces child-query failures rather than showing an incomplete conversation', async () => {
    mocks.list.mockResolvedValueOnce([{
      cat_copilottestresultid: PARENT, _cat_copilottestrunid_value: RUN,
      cat_testtypecode: 5, cat_resultcode: 1,
    }]).mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('Child results unavailable'));
    await expect(getKitTestResults([RUN])).rejects.toThrow('Child results unavailable');
  });

  it('preserves the one recorded turn and inserts remaining defined turns without inventing results', async () => {
    const test = '00000000-0000-4000-8000-000000000010';
    const first = '00000000-0000-4000-8000-000000000011';
    const second = '00000000-0000-4000-8000-000000000012';
    mocks.list.mockImplementation(async (_org: string, entity: string, options: { filter: string }) => {
      if (entity === 'cat_copilottestruns') return [];
      if (entity === 'cat_copilottests') return [
        { _cat_parent_value: test, cat_copilottestid: first, cat_order: 1, cat_testutterance: 'Edited greeting', cat_testtypecode: 1 },
        { _cat_parent_value: test, cat_copilottestid: second, cat_order: 2, cat_testutterance: 'Show the card', cat_testtypecode: 3 },
      ];
      if (options.filter.startsWith('_cat_parent_value eq null')) return [{
        cat_copilottestresultid: PARENT, _cat_copilottestrunid_value: RUN, _cat_copilottestid_value: test,
        cat_testtypecode: 5, cat_resultcode: 2,
      }];
      return [{
        _cat_parent_value: PARENT, cat_copilottestresultid: 'child', _cat_copilottestid_value: first,
        cat_testutterance: 'Historical greeting', cat_testtypecode: 1, cat_comparisonoperator: 1, cat_resultcode: 2,
      }];
    });
    const [result] = await getKitTestResults([RUN]);
    expect(result.code).toBe(2);
    expect(result.questions).toEqual(['Historical greeting', 'Show the card']);
    expect(result.turns).toEqual([
      { id: 'child', testId: first, utterance: 'Historical greeting', testType: 1, operator: 1, code: 2, response: undefined },
      { id: second, testId: second, utterance: 'Show the card', testType: 3, operator: undefined, fromDefinition: true },
    ]);
  });
});
