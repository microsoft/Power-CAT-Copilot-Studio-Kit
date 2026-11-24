import { useCallback, useMemo, useState } from 'react';
import type { DataGridProps } from '@fluentui/react-components';

/** Retains selected rows across pages and sorting, but never across filter scopes. */
export function useConversationSelection<T extends { id: string }>(
  scope: string,
  rows: readonly T[],
  disabled: boolean,
) {
  const [selection, setSelection] = useState(() => ({ scope, rows: new Map<string, T>() }));
  if (selection.scope !== scope) {
    setSelection({ scope, rows: new Map<string, T>() });
  }
  const selected = selection.rows;
  const rowsById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const selectedItems = useMemo(() => new Set(selected.keys()), [selected]);
  const selectedRows = useMemo(() => [...selected.values()], [selected]);

  const onSelectionChange = useCallback<NonNullable<DataGridProps['onSelectionChange']>>(
    (_event, data) => {
      if (disabled) return;
      setSelection((current) => {
        const previous = current.scope === scope ? current.rows : new Map<string, T>();
        const next = new Map<string, T>();
        // Fluent's header deselection clears every ID, including rows that are not currently visible.
        for (const [id, row] of previous) {
          if (!rowsById.has(id)) next.set(id, row);
        }
        for (const id of data.selectedItems) {
          if (typeof id !== 'string') continue;
          const row = rowsById.get(id) ?? previous.get(id);
          if (row) next.set(id, row);
        }
        return { scope, rows: next };
      });
    },
    [disabled, rowsById, scope],
  );

  /** Replaces the selection with the given rows (select first N matching, CV-12). */
  const selectRows = useCallback((next: readonly T[]) => {
    if (!disabled) setSelection({ scope, rows: new Map(next.map((row) => [row.id, row])) });
  }, [disabled, scope]);

  const clearSelection = useCallback(() => {
    if (!disabled) setSelection({ scope, rows: new Map<string, T>() });
  }, [disabled, scope]);

  return { selectedItems, selectedRows, onSelectionChange, selectRows, clearSelection };
}
