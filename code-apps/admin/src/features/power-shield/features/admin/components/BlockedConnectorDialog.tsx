import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Button,
  Field,
  Input,
  Textarea,
  RadioGroup,
  Radio,
  Spinner,
  Text,
  Badge,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { DeleteRegular, SearchRegular, DismissRegular } from '@fluentui/react-icons';
import { semanticColors } from '../../../theme/powerShieldTheme.tokens';
import { searchConnectorDropdownData } from '../../../shared/services/dataverse/connectorService';
import type { ConnectorDropdownItem } from '../../../shared/services/dataverse/connectorService';
import { createBlockedConnector, updateBlockedConnector, deleteBlockedConnector } from '../services/blockedConnectorService';
import type { BlockedConnector } from '../../../models/blockedConnector';
import { useNotify } from '../../../shared/hooks/useNotify';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';

type BlockType = 'connector' | 'publisher';

const MIN_SEARCH_LENGTH = 3;

interface BlockedConnectorDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  existingItems: BlockedConnector[];
  editData: BlockedConnector | null;
}

const useStyles = makeStyles({
  field: {
    marginTop: tokens.spacingVerticalM,
  },
  searchRow: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'flex-start',
  },
  searchInput: {
    flex: 1,
  },
  resultsList: {
    maxHeight: '200px',
    overflowY: 'auto',
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    marginTop: tokens.spacingVerticalXS,
  },
  resultItem: {
    display: 'flex',
    flexDirection: 'column',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    cursor: 'pointer',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: tokens.colorNeutralStroke2,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
    ':last-child': {
      borderBottomWidth: '0px',
    },
  },
  resultItemSelected: {
    backgroundColor: tokens.colorBrandBackground2,
    ':hover': {
      backgroundColor: tokens.colorBrandBackground2Hover,
    },
  },
  resultItemDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
    ':hover': {
      backgroundColor: 'transparent',
    },
  },
  resultName: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
  },
  resultMeta: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    alignItems: 'center',
  },
  resultKey: {
    color: tokens.colorNeutralForeground3,
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
  },
  resultPublisher: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  selectedChip: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    backgroundColor: tokens.colorBrandBackground2,
    borderRadius: tokens.borderRadiusMedium,
    marginTop: tokens.spacingVerticalXS,
  },
  selectedChipText: {
    flex: 1,
  },
  hintText: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    marginTop: tokens.spacingVerticalXS,
    fontStyle: 'italic',
  },
  emptyState: {
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    textAlign: 'center' as const,
  },
  fetchError: {
    display: 'block',
    color: tokens.colorPaletteRedForeground2,
    marginTop: tokens.spacingVerticalXS,
  },
  resultCount: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    marginTop: tokens.spacingVerticalXS,
  },
});

export function BlockedConnectorDialog({
  open,
  onClose,
  onSaved,
  existingItems,
  editData,
}: BlockedConnectorDialogProps) {
  const styles = useStyles();
  const { notifySuccess, notifyError } = useNotify();
  const isEditMode = !!editData;

  // Form fields
  const [name, setName] = useState('');
  const [blockType, setBlockType] = useState<BlockType>('connector');
  const [blockReason, setBlockReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [hasAttemptedSave, setHasAttemptedSave] = useState(false);

  // Connector search
  const [connectorQuery, setConnectorQuery] = useState('');
  const [selectedConnector, setSelectedConnector] = useState<ConnectorDropdownItem | null>(null);
  const [searchResults, setSearchResults] = useState<ConnectorDropdownItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Delete
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Derive exclusion sets from already-blocked items, excluding current edit item
  const blockedKeys = useMemo(
    () => new Set(existingItems.filter(i => i.connectorKey && i.id !== editData?.id).map(i => i.connectorKey)),
    [existingItems, editData],
  );
  const blockedPublishers = useMemo(
    () => new Set(existingItems.filter(i => i.publisherName && i.id !== editData?.id).map(i => i.publisherName!)),
    [existingItems, editData],
  );

  const canSearch = connectorQuery.trim().length >= MIN_SEARCH_LENGTH;

  // Pre-populate form in edit mode
  useEffect(() => {
    if (open && editData) {
      setName(editData.name);
      setBlockType(editData.connectorKey ? 'connector' : 'publisher');
      setBlockReason(editData.blockReason ?? '');
      setConnectorQuery('');
      setHasAttemptedSave(false);
      setSearchResults([]);
      setHasSearched(false);
      setSearchError(null);
      // In edit mode, create a synthetic selected connector from existing data
      setSelectedConnector({
        id: '',
        connectorKey: editData.connectorKey || '',
        displayName: editData.name,
        publisher: editData.publisherName ?? '',
      });
    } else if (open && !editData) {
      resetForm();
    }
  }, [open, editData]);

  // Validation
  const nameInvalid = !name.trim();
  const connectorInvalid = !selectedConnector;
  const blockReasonInvalid = !blockReason.trim();

  const showNameError = hasAttemptedSave && nameInvalid;
  const showConnectorError = hasAttemptedSave && connectorInvalid;
  const showBlockReasonError = hasAttemptedSave && blockReasonInvalid;

  function resetForm() {
    setName('');
    setBlockType('connector');
    setBlockReason('');
    setConnectorQuery('');
    setSelectedConnector(null);
    setSearchResults([]);
    setIsSearching(false);
    setSearchError(null);
    setHasSearched(false);
    setHasAttemptedSave(false);
  }

  function handleClose() {
    if (isSaving) return;
    resetForm();
    onClose();
  }

  function handleBlockTypeChange(value: BlockType) {
    setBlockType(value);
    setConnectorQuery('');
    setSelectedConnector(null);
    setName('');
    setSearchResults([]);
    setHasSearched(false);
    setSearchError(null);
  }

  async function handleSearch() {
    if (!canSearch) return;
    setIsSearching(true);
    setSearchError(null);
    setHasSearched(true);
    try {
      const results = await searchConnectorDropdownData(connectorQuery.trim(), blockType);
      setSearchResults(results);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed. Please try again.');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }

  function handleSelectConnector(connector: ConnectorDropdownItem) {
    // Don't allow selecting already-blocked items
    if (blockType === 'connector' && blockedKeys.has(connector.connectorKey)) return;
    if (blockType === 'publisher' && connector.publisher && blockedPublishers.has(connector.publisher)) return;

    setSelectedConnector(connector);
    setSearchResults([]);
    setHasSearched(false);
    setConnectorQuery('');

    // Auto-set name from selection
    setName(blockType === 'connector' ? connector.displayName : (connector.publisher || connector.displayName));
  }

  function handleClearSelection() {
    setSelectedConnector(null);
    setName('');
  }

  function isItemBlocked(c: ConnectorDropdownItem): boolean {
    if (blockType === 'connector') return blockedKeys.has(c.connectorKey);
    if (blockType === 'publisher' && c.publisher) return blockedPublishers.has(c.publisher);
    return false;
  }

  async function handleSave() {
    setHasAttemptedSave(true);
    if (nameInvalid || connectorInvalid || blockReasonInvalid) return;

    setIsSaving(true);
    try {
      if (isEditMode) {
        await updateBlockedConnector(editData.id, {
          name: name.trim(),
          connectorKey: blockType === 'connector' ? selectedConnector!.connectorKey : undefined,
          publisherName: blockType === 'publisher' ? selectedConnector!.publisher : undefined,
          blockReason: blockReason.trim() || undefined,
        });
        notifySuccess('Blocked connector updated successfully.');
      } else {
        await createBlockedConnector({
          name: name.trim(),
          connectorId: selectedConnector!.id,
          connectorKey: blockType === 'connector' ? selectedConnector!.connectorKey : undefined,
          publisherName: blockType === 'publisher' ? selectedConnector!.publisher : undefined,
          blockReason: blockReason.trim() || undefined,
        });
        notifySuccess('Blocked connector added successfully.');
      }
      resetForm();
      onSaved();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : `Failed to ${isEditMode ? 'update' : 'add'} blocked connector.`);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!editData) return;
    setIsDeleting(true);
    try {
      await deleteBlockedConnector(editData.id);
      notifySuccess('Blocked connector deleted successfully.');
      setDeleteOpen(false);
      resetForm();
      onSaved();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Failed to delete blocked connector.');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(_, data) => { if (!data.open) handleClose(); }}>
        <DialogSurface aria-labelledby="blocked-connector-dialog-title">
          <DialogTitle id="blocked-connector-dialog-title">
            {isEditMode ? 'Edit Blocked Connector' : 'Add Blocked Connector'}
          </DialogTitle>
          <DialogBody>
            <DialogContent>
              {isEditMode && (
                <Field
                  label="Name"
                  required
                  validationState={showNameError ? 'error' : 'none'}
                  validationMessage={showNameError ? 'Name is required.' : undefined}
                >
                  <Input
                    value={name}
                    onChange={(_, data) => setName(data.value)}
                    placeholder="e.g. Zoho Mail"
                  />
                </Field>
              )}

              <Field label="Block Type" required className={styles.field}>
                <RadioGroup
                  value={blockType}
                  onChange={(_, data) => handleBlockTypeChange(data.value as BlockType)}
                  layout="horizontal"
                  disabled={isEditMode}
                >
                  <Radio value="connector" label="Connector" />
                  <Radio value="publisher" label="Publisher" />
                </RadioGroup>
              </Field>

              <Field
                label={blockType === 'publisher' ? 'Publisher' : 'Connector'}
                required
                className={styles.field}
                validationState={showConnectorError ? 'error' : 'none'}
                validationMessage={showConnectorError
                  ? `Search and select a ${blockType === 'publisher' ? 'publisher' : 'connector'} from the results.`
                  : undefined}
              >
                {isEditMode ? (
                  <div className={styles.selectedChip}>
                    <Text className={styles.selectedChipText}>
                      {blockType === 'publisher'
                        ? (editData?.publisherName || editData?.name)
                        : (editData?.connectorKey || editData?.name)}
                    </Text>
                  </div>
                ) : selectedConnector ? (
                  <div className={styles.selectedChip}>
                    <div className={styles.selectedChipText}>
                      {blockType === 'publisher' ? (
                        <Text weight="semibold">{selectedConnector.publisher}</Text>
                      ) : (
                        <>
                          <Text weight="semibold">{selectedConnector.displayName}</Text>
                          <Text className={styles.resultKey} style={{ marginLeft: tokens.spacingHorizontalS }}>
                            {selectedConnector.connectorKey}
                          </Text>
                          {selectedConnector.publisher && (
                            <Text className={styles.resultPublisher} style={{ marginLeft: tokens.spacingHorizontalS }}>
                              · {selectedConnector.publisher}
                            </Text>
                          )}
                        </>
                      )}
                    </div>
                    <Button
                      appearance="subtle"
                      icon={<DismissRegular />}
                      size="small"
                      onClick={handleClearSelection}
                      aria-label="Clear selection"
                    />
                  </div>
                ) : (
                  <>
                    <div className={styles.searchRow}>
                      <Input
                        className={styles.searchInput}
                        placeholder={blockType === 'publisher' ? 'Type publisher name...' : 'Type connector name or key...'}
                        value={connectorQuery}
                        onChange={(_, data) => setConnectorQuery(data.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && canSearch) {
                            e.preventDefault();
                            void handleSearch();
                          }
                        }}
                      />
                      <Button
                        appearance="primary"
                        icon={<SearchRegular />}
                        disabled={!canSearch || isSearching}
                        onClick={() => void handleSearch()}
                      >
                        Search
                      </Button>
                    </div>

                    {isSearching && (
                      <Spinner
                        size="tiny"
                        label={blockType === 'publisher' ? 'Searching publishers...' : 'Searching connectors...'}
                        style={{ marginTop: tokens.spacingVerticalXS }}
                      />
                    )}

                    {searchError && (
                      <Text size={200} className={styles.fetchError}>
                        {searchError}
                      </Text>
                    )}

                    {!isSearching && !hasSearched && !searchError && (
                      <Text className={styles.hintText}>
                        Type at least {MIN_SEARCH_LENGTH} characters and click Search.
                      </Text>
                    )}

                    {!isSearching && hasSearched && searchResults.length === 0 && !searchError && (
                      <div className={styles.emptyState}>
                        No {blockType === 'publisher' ? 'publishers' : 'connectors'} found matching &quot;{connectorQuery.trim()}&quot;.
                      </div>
                    )}

                    {!isSearching && searchResults.length > 0 && (
                      <>
                        <Text className={styles.resultCount}>
                          {searchResults.length} {searchResults.length === 1 ? 'result' : 'results'} found
                        </Text>
                        <div className={styles.resultsList} role="listbox" aria-label="Search results">
                          {searchResults.map(c => {
                            const blocked = isItemBlocked(c);
                            const key = blockType === 'publisher' ? c.publisher : c.connectorKey;
                            return (
                              <div
                                key={key}
                                className={`${styles.resultItem} ${blocked ? styles.resultItemDisabled : ''}`}
                                role="option"
                                aria-selected={false}
                                aria-disabled={blocked}
                                tabIndex={blocked ? -1 : 0}
                                onClick={() => !blocked && handleSelectConnector(c)}
                                onKeyDown={(e) => {
                                  if ((e.key === 'Enter' || e.key === ' ') && !blocked) {
                                    e.preventDefault();
                                    handleSelectConnector(c);
                                  }
                                }}
                              >
                                {blockType === 'publisher' ? (
                                  <span className={styles.resultName}>{c.publisher}</span>
                                ) : (
                                  <>
                                    <span className={styles.resultName}>{c.displayName}</span>
                                    <div className={styles.resultMeta}>
                                      <span className={styles.resultKey}>{c.connectorKey}</span>
                                      {c.publisher && (
                                        <span className={styles.resultPublisher}>{c.publisher}</span>
                                      )}
                                    </div>
                                  </>
                                )}
                                {blocked && (
                                  <Badge appearance="tint" color="warning" size="small">
                                    Already blocked
                                  </Badge>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </>
                )}
              </Field>

              <Field
                label="Block Reason"
                required
                className={styles.field}
                validationState={showBlockReasonError ? 'error' : 'none'}
                validationMessage={showBlockReasonError ? 'Block reason is required.' : undefined}
              >
                <Textarea
                  value={blockReason}
                  onChange={(_, data) => setBlockReason(data.value)}
                  placeholder="Reason for blocking..."
                  rows={3}
                />
              </Field>
            </DialogContent>
            <DialogActions>
              {isEditMode && (
                <Button
                  appearance="subtle"
                  icon={<DeleteRegular />}
                  onClick={() => setDeleteOpen(true)}
                  disabled={isSaving}
                  style={{ marginRight: 'auto', color: semanticColors.error }}
                >
                  Delete
                </Button>
              )}
              <Button appearance="secondary" onClick={handleClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button
                appearance="primary"
                onClick={() => void handleSave()}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : isEditMode ? 'Save Changes' : 'Save'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {isEditMode && (
        <DeleteConfirmDialog
          open={deleteOpen}
          title="Delete Blocked Connector"
          message={`Are you sure you want to delete "${editData?.name ?? ''}"? This action cannot be undone.`}
          onConfirm={() => void handleDeleteConfirm()}
          onCancel={() => setDeleteOpen(false)}
          isSaving={isDeleting}
        />
      )}
    </>
  );
}
