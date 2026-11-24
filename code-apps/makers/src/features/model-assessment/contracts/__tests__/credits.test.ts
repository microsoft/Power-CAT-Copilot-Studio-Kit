import { expect, it } from 'vitest';
import { creditsBreakdown, creditsTotal, formatCredits } from '../credits';

it('shows credits to two decimals without hiding tiny non-zero amounts', () => {
  expect(formatCredits(1.40278)).toBe('1.40');
  expect(formatCredits(0.004)).toBe('<0.01');
  expect(formatCredits(0)).toBe('0.00');
  expect(formatCredits(1234.5)).toBe('1,234.50');
});

it('totals the rounded parts so the breakdown adds up', () => {
  const credits = { conversation: 0.1652, evaluators: 1.1958 };
  expect(creditsBreakdown(credits)).toBe('0.17 to answer · 1.20 to score');
  expect(formatCredits(creditsTotal(credits))).toBe('1.37');
  expect(formatCredits(creditsTotal({ conversation: 0.001, evaluators: 0.002 }))).toBe('<0.01');
});
