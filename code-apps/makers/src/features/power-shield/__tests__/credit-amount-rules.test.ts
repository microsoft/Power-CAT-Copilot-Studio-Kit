import { describe, expect, it } from 'vitest';
import {
  amountErrorText,
  countInvalidRows,
  getRowError,
  parseRequestedAmount,
  rowErrorText,
  sumValidAmounts,
  toSubmittableRows,
} from '../shared/utils/creditAmountRules';
import { parseOptionalWholeNumber } from '../shared/utils/parseOptionalWholeNumber';

describe('parseRequestedAmount', () => {
  it.each([
    ['500', 500],
    ['2000', 2000],
    ['1,500', 1500],
    ['  2 000 ', 2000],
    ['000750', 750],
    ['2147483647', 2_147_483_647],
    ['0002147483647', 2_147_483_647],
  ])('accepts %j as %d', (raw, value) => {
    expect(parseRequestedAmount(raw)).toEqual({ ok: true, value });
  });

  it.each([
    [undefined, 'required'],
    ['', 'required'],
    [' , ', 'required'],
    ['12.5', 'notWhole'],
    ['-600', 'notWhole'],
    ['1e3', 'notWhole'],
    ['abc', 'notWhole'],
    ['٥٠٠', 'notWhole'],
    ['499', 'belowMin'],
    ['0', 'belowMin'],
    ['2147483648', 'aboveMax'],
    ['99999999999999999999999', 'aboveMax'],
  ])('rejects %j with %s', (raw, error) => {
    expect(parseRequestedAmount(raw)).toEqual({ ok: false, error });
  });

  it('has text for every error', () => {
    expect(amountErrorText('required')).toBe('Required');
    expect(amountErrorText('notWhole')).toBe('Whole numbers only');
    expect(amountErrorText('belowMin')).toBe('Minimum is 500');
    expect(amountErrorText('aboveMax')).toBe('Maximum is 2,147,483,647');
  });
});

describe('row rule (spec 031)', () => {
  it.each([
    ['blank, not ticked', '', false, 'needsOne'],
    ['blank, ticked', '', true, null],
    ['spaces only, ticked', ' , ', true, null],
    ['valid, not ticked', '1,000', false, null],
    ['valid, ticked', '1000', true, null],
    ['too small, ticked', '499', true, 'belowMin'],
    ['decimal, ticked', '600.5', true, 'notWhole'],
  ] as const)('%s', (_label, raw, ticked, expected) => {
    expect(getRowError(raw, ticked)).toBe(expected);
  });

  it('has text for the needs-one error', () => {
    expect(rowErrorText('needsOne')).toBe('Enter credits, tick tenant draw, or both.');
    expect(rowErrorText('belowMin')).toBe('Minimum is 500');
  });
});

describe('row aggregates', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  // a: credits only. b: bad amount + tick. c: valid both. d: nothing. e: tick only.
  const amounts = { a: '1,000', b: '499', c: '2500' };
  const draws = { b: true, c: true, e: true };

  it('counts rows that break the rule', () => {
    expect(countInvalidRows(ids, amounts, draws)).toBe(2);
    expect(countInvalidRows([], amounts, draws)).toBe(0);
  });

  it('sums only valid amounts', () => {
    expect(sumValidAmounts(ids, amounts)).toBe(3500);
  });

  it('splits rows into amounts, ticks and invalid ids', () => {
    expect(toSubmittableRows(ids, amounts, draws)).toEqual({
      amounts: { a: 1000, c: 2500 },
      draws: { c: true, e: true },
      invalidIds: ['b', 'd'],
    });
  });

  it('never turns a bad amount with a tick into a tick-only row', () => {
    const rows = toSubmittableRows(['b'], amounts, draws);
    expect(rows.draws).toEqual({});
    expect(rows.invalidIds).toEqual(['b']);
  });
});

describe('parseOptionalWholeNumber', () => {
  it.each([
    [null, undefined],
    [undefined, undefined],
    ['', undefined],
    ['  ', undefined],
    ['abc', undefined],
    [Number.NaN, undefined],
    ['1500', 1500],
    [2000, 2000],
    [0, 0],
  ])('maps %j to %j', (input, expected) => {
    expect(parseOptionalWholeNumber(input)).toBe(expected);
  });
});
