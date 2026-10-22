/** Collapse outcome labels formatted as "<outcome> (<reason>)" when both values match. */
export function dedupeOutcome(value: string): string {
  const match = value.match(/^\s*(.+?)\s*\(\s*(.+?)\s*\)\s*$/);
  return match && match[1].toLowerCase() === match[2].toLowerCase() ? match[1] : value;
}
