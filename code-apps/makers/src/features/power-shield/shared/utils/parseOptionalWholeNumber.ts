/**
 * Read an optional whole-number column from Dataverse. The generated models type whole numbers
 * as `string`, and the API may return a number, a numeric string, null or "". Anything that isn't
 * a finite number becomes `undefined`, so the UI shows "—" rather than "0".
 */
export function parseOptionalWholeNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}
