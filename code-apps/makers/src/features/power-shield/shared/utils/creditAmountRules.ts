// Rules for the per-environment "Credits requested" amount (spec 026, R9) and the
// "Draw from tenant" tick (spec 031). Pure functions only, so the step, the reducer selectors
// and submit share one source of truth.

export const MIN_REQUESTED_CREDITS = 500;
export const MAX_REQUESTED_CREDITS = 2_147_483_647;

const MAX_DIGITS = String(MAX_REQUESTED_CREDITS).length;

export type AmountError = 'required' | 'notWhole' | 'belowMin' | 'aboveMax';
export type ParsedAmount = { ok: true; value: number } | { ok: false; error: AmountError };

/**
 * Parse raw input into a valid amount. Commas and whitespace are ignored; only ASCII digits
 * are accepted. Leading zeros are allowed. The digit count is checked before `Number()` so huge
 * strings never lose precision and slip under the maximum.
 */
export function parseRequestedAmount(raw: string | undefined): ParsedAmount {
  const cleaned = (raw ?? '').replace(/[\s,]/g, '');
  if (cleaned.length === 0) return { ok: false, error: 'required' };
  if (!/^[0-9]+$/.test(cleaned)) return { ok: false, error: 'notWhole' };
  const digits = cleaned.replace(/^0+(?=\d)/, '');
  if (digits.length > MAX_DIGITS) return { ok: false, error: 'aboveMax' };
  const value = Number(digits);
  if (value > MAX_REQUESTED_CREDITS) return { ok: false, error: 'aboveMax' };
  if (value < MIN_REQUESTED_CREDITS) return { ok: false, error: 'belowMin' };
  return { ok: true, value };
}

/** Short inline error text shown under a row's amount box. */
export function amountErrorText(error: AmountError): string {
  switch (error) {
    case 'required':
      return 'Required';
    case 'notWhole':
      return 'Whole numbers only';
    case 'belowMin':
      return `Minimum is ${MIN_REQUESTED_CREDITS.toLocaleString('en-US')}`;
    case 'aboveMax':
      return `Maximum is ${MAX_REQUESTED_CREDITS.toLocaleString('en-US')}`;
  }
}

/** A row's problem: a bad amount, or neither credits nor tenant draw (spec 031). */
export type RowError = AmountError | 'needsOne';

/**
 * The one rule for a wizard row (spec 031, FR-003). A blank amount is fine when tenant draw is
 * ticked. Anything typed must still be a valid amount, tick or not (FR-007).
 */
export function getRowError(raw: string | undefined, tenantDraw: boolean): RowError | null {
  if ((raw ?? '').replace(/[\s,]/g, '').length === 0) return tenantDraw ? null : 'needsOne';
  const parsed = parseRequestedAmount(raw);
  return parsed.ok ? null : parsed.error;
}

/** Short inline error text for a row. */
export function rowErrorText(error: RowError): string {
  return error === 'needsOne' ? 'Enter credits, tick tenant draw, or both.' : amountErrorText(error);
}

/** How many of the given environments break the row rule. */
export function countInvalidRows(
  ids: string[],
  amounts: Record<string, string>,
  draws: Record<string, boolean>,
): number {
  return ids.filter((id) => getRowError(amounts[id], draws[id] === true) !== null).length;
}

/** Sum of the valid amounts only; invalid or empty rows count as zero. */
export function sumValidAmounts(ids: string[], amounts: Record<string, string>): number {
  return ids.reduce((sum, id) => {
    const parsed = parseRequestedAmount(amounts[id]);
    return parsed.ok ? sum + parsed.value : sum;
  }, 0);
}

export interface SubmittableRows {
  /** Parsed amounts, only for rows that have one. */
  amounts: Record<string, number>;
  /** `true` for ticked rows only. */
  draws: Record<string, boolean>;
  /** Rows that break the row rule. Submit must stop when this isn't empty (FR-007). */
  invalidIds: string[];
}

/** Split the raw rows into what can be sent, and the rows that would be silently lost. */
export function toSubmittableRows(
  ids: string[],
  amounts: Record<string, string>,
  draws: Record<string, boolean>,
): SubmittableRows {
  const out: SubmittableRows = { amounts: {}, draws: {}, invalidIds: [] };
  for (const id of ids) {
    const ticked = draws[id] === true;
    if (getRowError(amounts[id], ticked) !== null) {
      out.invalidIds.push(id);
      continue;
    }
    const parsed = parseRequestedAmount(amounts[id]);
    if (parsed.ok) out.amounts[id] = parsed.value;
    if (ticked) out.draws[id] = true;
  }
  return out;
}
