import { describe, expect, it } from 'vitest';
import { parsePageNumber, visiblePageNumbers } from '../pagination';

describe('assessment pagination', () => {
  it.each([
    { current: 0, total: 1, pages: [0] },
    { current: 0, total: 3, pages: [0, 1, 2] },
    { current: 0, total: 20, pages: [0, 1, 2, 3, 4] },
    { current: 5, total: 20, pages: [3, 4, 5, 6, 7] },
    { current: 18, total: 20, pages: [15, 16, 17, 18, 19] },
    { current: 19, total: 20, pages: [15, 16, 17, 18, 19] },
  ])('keeps page $current visible in a bounded window of $total pages', ({ current, total, pages }) => {
    expect(visiblePageNumbers(current, total)).toEqual(pages);
  });

  it.each([
    { input: '1', total: 1, page: 0 },
    { input: '1', total: 200, page: 0 },
    { input: '75', total: 200, page: 74 },
    { input: '200', total: 200, page: 199 },
  ])('maps direct entry $input to its zero-based page', ({ input, total, page }) => {
    expect(parsePageNumber(input, total)).toBe(page);
  });

  it.each(['', '0', '-1', '201', '1.5', '1e2', 'NaN', 'abc', ' 75 ', '9007199254740992'])(
    'rejects invalid or out-of-range page input %j',
    input => {
      expect(parsePageNumber(input, 200)).toBeUndefined();
    },
  );
});
