import { useState } from 'react';
import {
  Body1,
  Button,
  Checkbox,
  Drawer,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerHeaderTitle,
  SearchBox,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  Add20Regular,
  ArrowDown20Regular,
  ArrowUp20Regular,
  ChevronLeft20Regular,
  Delete20Regular,
  Dismiss24Regular,
} from '@fluentui/react-icons';
import type { GridColumnDefinition } from './AdvancedDataGrid.types';

const useStyles = makeStyles({
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  search: {
    width: '100%',
    maxWidth: '100%',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  row: {
    minHeight: '44px',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  label: {
    flexGrow: 1,
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
  },
  footer: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
  },
});

function moveItem(values: string[], from: number, to: number): string[] {
  if (to < 0 || to >= values.length) return values;
  const next = [...values];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

interface ColumnEditorProps<TRecord> {
  open: boolean;
  columns: GridColumnDefinition<TRecord>[];
  visibleColumnIds: string[];
  onClose: () => void;
  onApply: (columnIds: string[]) => void;
  onReset: () => void;
  mountNode?: HTMLElement | null;
}

export function ColumnEditor<TRecord>({
  open,
  columns,
  visibleColumnIds,
  onClose,
  onApply,
  onReset,
  mountNode,
}: ColumnEditorProps<TRecord>) {
  const styles = useStyles();
  const [draft, setDraft] = useState(visibleColumnIds);
  const [showCatalog, setShowCatalog] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [draggedId, setDraggedId] = useState<string>();

  const availableColumns = columns
    .filter((column) => !draft.includes(column.columnId))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  const catalogSearchTerm = catalogSearch.trim().toLocaleLowerCase();
  const filteredAvailableColumns = catalogSearchTerm
    ? availableColumns.filter((column) => column.label.toLocaleLowerCase().includes(catalogSearchTerm))
    : availableColumns;
  const currentColumns = draft
    .map((columnId) => columns.find((column) => column.columnId === columnId))
    .filter((column): column is GridColumnDefinition<TRecord> => Boolean(column));

  return (
    <Drawer open={open} position="end" size="medium" mountNode={mountNode} onOpenChange={(_, data) => { if (!data.open) onClose(); }}>
      <DrawerHeader>
        <DrawerHeaderTitle
          action={<Button appearance="subtle" icon={<Dismiss24Regular />} aria-label="Close column editor" onClick={onClose} />}
        >
          {showCatalog ? 'Add columns' : 'Edit columns'}
        </DrawerHeaderTitle>
      </DrawerHeader>
      <DrawerBody>
        <div className={styles.body}>
          {showCatalog ? (
            <>
              <Button appearance="subtle" icon={<ChevronLeft20Regular />} onClick={() => { setShowCatalog(false); setCatalogSearch(''); }}>
                Current columns
              </Button>
              <Body1>Select columns to add to the grid.</Body1>
              {availableColumns.length > 0 && (
                <SearchBox
                  className={styles.search}
                  placeholder="Search columns"
                  value={catalogSearch}
                  aria-label="Search columns to add"
                  onChange={(_, data) => setCatalogSearch(data.value)}
                />
              )}
              <div className={styles.list}>
                {filteredAvailableColumns.map((column) => (
                  <Checkbox
                    key={column.columnId}
                    label={column.label}
                    onChange={(_, data) => {
                      if (data.checked) setDraft((current) => [...current, column.columnId]);
                    }}
                  />
                ))}
                {availableColumns.length === 0 && <Body1>All available columns are visible.</Body1>}
                {availableColumns.length > 0 && filteredAvailableColumns.length === 0 && (
                  <Body1>No columns match your search.</Body1>
                )}
              </div>
            </>
          ) : (
            <>
              <Body1>Reorder visible columns or remove optional columns. Name is always required.</Body1>
              <Button appearance="secondary" icon={<Add20Regular />} onClick={() => { setShowCatalog(true); setCatalogSearch(''); }}>
                Add columns
              </Button>
              <div className={styles.list}>
                {currentColumns.map((column, index) => (
                  <div
                    className={styles.row}
                    key={column.columnId}
                    draggable={!column.required}
                    onDragStart={() => setDraggedId(column.columnId)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (!draggedId || draggedId === column.columnId) return;
                      const from = draft.indexOf(draggedId);
                      const to = draft.indexOf(column.columnId);
                      setDraft((current) => moveItem(current, from, to));
                      setDraggedId(undefined);
                    }}
                  >
                    <Body1 className={styles.label}>{column.label}{column.required ? ' (required)' : ''}</Body1>
                    <div className={styles.actions}>
                      <Button
                        appearance="subtle"
                        size="small"
                        icon={<ArrowUp20Regular />}
                        aria-label={`Move ${column.label} left`}
                        disabled={index === 0}
                        onClick={() => setDraft((current) => moveItem(current, index, index - 1))}
                      />
                      <Button
                        appearance="subtle"
                        size="small"
                        icon={<ArrowDown20Regular />}
                        aria-label={`Move ${column.label} right`}
                        disabled={index === currentColumns.length - 1}
                        onClick={() => setDraft((current) => moveItem(current, index, index + 1))}
                      />
                      <Button
                        appearance="subtle"
                        size="small"
                        icon={<Delete20Regular />}
                        aria-label={`Remove ${column.label}`}
                        disabled={column.required}
                        onClick={() => setDraft((current) => current.filter((columnId) => columnId !== column.columnId))}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </DrawerBody>
      <DrawerFooter>
        <div className={styles.footer}>
          <Button
            appearance="primary"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            Apply
          </Button>
          <Button
            appearance="secondary"
            onClick={() => {
              onReset();
              onClose();
            }}
          >
            Reset defaults
          </Button>
          <Button appearance="subtle" onClick={onClose}>Cancel</Button>
        </div>
      </DrawerFooter>
    </Drawer>
  );
}
