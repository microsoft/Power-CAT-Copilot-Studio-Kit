/**
 * ColumnEditorPanel — Edit columns / Add columns panel for the Agent values list.
 *
 * Follows docs/fluent-ui-v9 Drawer and Button standards: overlay drawer from the right,
 * title with a close icon button, header back navigation for the Add columns step, and a
 * footer with the primary action first followed by secondary actions, 12px apart.
 */
import { useState } from 'react';
import {
  Body1,
  Button,
  Checkbox,
  Drawer,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerHeaderNavigation,
  DrawerHeaderTitle,
  SearchBox,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  Add20Regular,
  ArrowDown20Regular,
  ArrowLeft24Regular,
  ArrowUp20Regular,
  Delete20Regular,
  Dismiss24Regular,
} from '@fluentui/react-icons';
import type { GridColumnDefinition } from '../../../agent-inventory/components/shared/AdvancedDataGrid';

const useStyles = makeStyles({
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  addButton: {
    alignSelf: 'flex-start',
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
    flexWrap: 'wrap',
    // Drawer.md / Button.md: 12px between footer buttons.
    gap: tokens.spacingHorizontalM,
  },
});

function moveItem(values: string[], from: number, to: number): string[] {
  if (to < 0 || to >= values.length) return values;
  const next = [...values];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

interface ColumnEditorPanelProps<TRecord> {
  open: boolean;
  columns: GridColumnDefinition<TRecord>[];
  visibleColumnIds: string[];
  onClose: () => void;
  onApply: (columnIds: string[]) => void;
  onReset: () => void;
  mountNode?: HTMLElement | null;
}

/** Overlay drawer to reorder, remove and add grid columns; changes apply on Apply. */
export function ColumnEditorPanel<TRecord>({
  open,
  columns,
  visibleColumnIds,
  onClose,
  onApply,
  onReset,
  mountNode,
}: ColumnEditorPanelProps<TRecord>) {
  const styles = useStyles();
  const [draft, setDraft] = useState(visibleColumnIds);
  // Columns offered on the Add columns step, captured when the step opens so checked items stay listed.
  const [catalogIds, setCatalogIds] = useState<string[] | null>(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [draggedId, setDraggedId] = useState<string>();

  const columnsById = new Map(columns.map((column) => [column.columnId, column]));
  const currentColumns = draft
    .map((columnId) => columnsById.get(columnId))
    .filter((column): column is GridColumnDefinition<TRecord> => Boolean(column));
  const catalogColumns = (catalogIds ?? [])
    .map((columnId) => columnsById.get(columnId))
    .filter((column): column is GridColumnDefinition<TRecord> => Boolean(column));
  const catalogSearchTerm = catalogSearch.trim().toLocaleLowerCase();
  const filteredCatalogColumns = catalogSearchTerm
    ? catalogColumns.filter((column) => column.label.toLocaleLowerCase().includes(catalogSearchTerm))
    : catalogColumns;

  const openCatalog = () => {
    setCatalogIds(
      columns
        .filter((column) => !draft.includes(column.columnId))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
        .map((column) => column.columnId),
    );
    setCatalogSearch('');
  };
  const closeCatalog = () => {
    setCatalogIds(null);
    setCatalogSearch('');
  };
  const toggleColumn = (columnId: string, checked: boolean) => {
    setDraft((current) => (checked
      ? (current.includes(columnId) ? current : [...current, columnId])
      : current.filter((id) => id !== columnId)));
  };
  const showCatalog = catalogIds !== null;

  return (
    <Drawer
      open={open}
      position="end"
      size="medium"
      mountNode={mountNode}
      onOpenChange={(_, data) => { if (!data.open) onClose(); }}
    >
      <DrawerHeader>
        {showCatalog && (
          <DrawerHeaderNavigation>
            <Button
              appearance="subtle"
              icon={<ArrowLeft24Regular />}
              aria-label="Back to current columns"
              onClick={closeCatalog}
            />
          </DrawerHeaderNavigation>
        )}
        <DrawerHeaderTitle
          action={<Button appearance="subtle" icon={<Dismiss24Regular />} aria-label="Close" onClick={onClose} />}
        >
          {showCatalog ? 'Add columns' : 'Edit columns'}
        </DrawerHeaderTitle>
      </DrawerHeader>
      <DrawerBody>
        <div className={styles.body}>
          {showCatalog ? (
            <>
              <Body1>Select the columns to show in the grid.</Body1>
              {catalogColumns.length > 0 && (
                <SearchBox
                  className={styles.search}
                  placeholder="Search columns"
                  value={catalogSearch}
                  aria-label="Search columns to add"
                  onChange={(_, data) => setCatalogSearch(data.value)}
                />
              )}
              <div className={styles.list} role="group" aria-label="Available columns">
                {filteredCatalogColumns.map((column) => (
                  <Checkbox
                    key={column.columnId}
                    label={column.label}
                    checked={draft.includes(column.columnId)}
                    onChange={(_, data) => toggleColumn(column.columnId, data.checked === true)}
                  />
                ))}
                {catalogColumns.length === 0 && <Body1>All available columns are already shown.</Body1>}
                {catalogColumns.length > 0 && filteredCatalogColumns.length === 0 && (
                  <Body1>No columns match your search.</Body1>
                )}
              </div>
            </>
          ) : (
            <>
              <Body1>Reorder or remove columns. Name is always shown.</Body1>
              <Button appearance="secondary" icon={<Add20Regular />} className={styles.addButton} onClick={openCatalog}>
                Add columns
              </Button>
              <div className={styles.list} role="list" aria-label="Current columns">
                {currentColumns.map((column, index) => (
                  <div
                    className={styles.row}
                    key={column.columnId}
                    role="listitem"
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
                        aria-label={`Move ${column.label} up`}
                        disabled={index === 0}
                        onClick={() => setDraft((current) => moveItem(current, index, index - 1))}
                      />
                      <Button
                        appearance="subtle"
                        size="small"
                        icon={<ArrowDown20Regular />}
                        aria-label={`Move ${column.label} down`}
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
          <Button appearance="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </DrawerFooter>
    </Drawer>
  );
}
