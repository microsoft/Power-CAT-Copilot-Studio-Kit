/**
 * Minimal CSV export helper for the Conversation Analyzer feature.
 *
 * Generates a CSV blob and triggers a browser download. Used by the Agents
 * tab Export button (and reusable by future tabs). Stays lightweight on
 * purpose - the existing ExcelJS-based ExportButton in agent-insights-hub
 * is overkill for this feature's tabular shapes.
 */

export interface CsvColumn<T> {
  key: keyof T & string;
  header: string;
  format?: (row: T) => string | number | undefined;
}

function escape(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportToCsv<T>(filename: string, rows: T[], columns: CsvColumn<T>[]): void {
  const headerLine = columns.map((c) => escape(c.header)).join(',');
  const bodyLines = rows.map((row) =>
    columns
      .map((c) => {
        const v = c.format ? c.format(row) : (row as unknown as Record<string, unknown>)[c.key];
        return escape(v);
      })
      .join(','),
  );
  const csv = [headerLine, ...bodyLines].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
