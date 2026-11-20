import type { NumericRange } from '../../contracts/CostEfficiency';

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});
const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatRange(
  range: Readonly<NumericRange>,
  formatter: Intl.NumberFormat,
): string {
  if (range.upperBound === range.lowerBound) {
    return formatter.format(range.lowerBound);
  }
  if (range.upperBound !== undefined) {
    return `${formatter.format(range.lowerBound)}-${formatter.format(range.upperBound)}`;
  }
  return `${range.lowerBoundInclusive ? '' : 'More than '}${formatter.format(range.lowerBound)}`;
}

/**
 * Reports whether a range is a genuine estimate that needs a hedge word. An
 * exact value needs no hedge, and "More than" already carries one, so "about"
 * would double it.
 */
function needsHedge(range: Readonly<NumericRange>): boolean {
  if (range.upperBound === range.lowerBound) return false;
  if (range.upperBound === undefined && !range.lowerBoundInclusive) return false;
  return true;
}

function centsToDollars(range: Readonly<NumericRange>): NumericRange {
  return {
    lowerBound: range.lowerBound / 100,
    lowerBoundInclusive: range.lowerBoundInclusive,
    ...(range.upperBound === undefined
      ? {}
      : { upperBound: range.upperBound / 100 }),
  };
}

/** Capitalizes a lowercase contract union value for display. */
export function titleCase(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

/** Formats a whole count with thousands separators. */
export function formatCount(value: number): string {
  return numberFormatter.format(value);
}

/** Formats a credit range, keeping an open-ended upper bound explicit. */
export function formatCreditRange(range: Readonly<NumericRange>): string {
  return formatRange(range, numberFormatter);
}

/**
 * Formats a cent-denominated range as whole US dollars, adding "about" only
 * when the value is a genuine estimate.
 */
export function formatPaygAmount(cents: Readonly<NumericRange>): string {
  const amount = formatRange(centsToDollars(cents), currencyFormatter);
  return needsHedge(cents) ? `about ${amount}` : amount;
}
