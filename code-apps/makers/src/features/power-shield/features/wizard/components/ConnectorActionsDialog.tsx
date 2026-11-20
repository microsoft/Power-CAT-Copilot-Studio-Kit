import { useState, useEffect } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Spinner,
  Badge,
  Switch,
  Tooltip,
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  DataGrid,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridBody,
  DataGridRow,
  DataGridCell,
  createTableColumn,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import type { TableColumnDefinition } from '@fluentui/react-components';
import {
  CheckmarkCircle16Regular,
  DismissCircle16Regular,
  CircleHalfFill16Regular,
} from '@fluentui/react-icons';
import { useConnectorActions } from '../hooks/useConnectorActions';
import type { Connector } from '../../../models/connector';
import type { ConnectorAction } from '../../../models/connectorAction';
import type { ActionOverrideMap } from '../../../models/connectorAction';

interface ConnectorActionsDialogProps {
  connector: Connector | null;
  open: boolean;
  onClose: () => void;
  /** Current overrides from WizardContext for this connector. */
  initialOverrides: ActionOverrideMap;
  /** Called with the final overrides when the user clicks Save. */
  onSave: (overrides: ActionOverrideMap) => void;
}

const useStyles = makeStyles({
  surface: {
    width: '1100px',
    maxWidth: '95vw',
  },
  subtitle: {
    display: 'block',
    marginBottom: tokens.spacingVerticalM,
    color: tokens.colorNeutralForeground3,
  },
  bulkControls: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    marginBottom: tokens.spacingVerticalS,
  },
  statusCell: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  descriptionCell: {
    color: tokens.colorNeutralForeground2,
    whiteSpace: 'normal',
    lineHeight: tokens.lineHeightBase200,
  },
  emptyMsg: {
    padding: `${tokens.spacingVerticalL} 0`,
    color: tokens.colorNeutralForeground3,
    textAlign: 'center',
  },
  headerCell: {
    fontWeight: tokens.fontWeightSemibold,
  },
});

function StatusIcon({ status }: { status: 'Allow' | 'Block' }) {
  if (status === 'Allow') {
    return <CheckmarkCircle16Regular style={{ color: tokens.colorPaletteGreenForeground1 }} />;
  }
  return <DismissCircle16Regular style={{ color: tokens.colorPaletteRedForeground1 }} />;
}

function ActionStatusBadge({ status }: { status: ConnectorAction['actionStatus'] }) {
  const styles = useStyles();
  if (status === 'Allow') {
    return (
      <span className={styles.statusCell}>
        <CheckmarkCircle16Regular style={{ color: tokens.colorPaletteGreenForeground1 }} />
        <Badge color="success" appearance="tint" size="small">Allow</Badge>
      </span>
    );
  }
  if (status === 'Block') {
    return (
      <span className={styles.statusCell}>
        <DismissCircle16Regular style={{ color: tokens.colorPaletteRedForeground1 }} />
        <Badge color="danger" appearance="tint" size="small">Block</Badge>
      </span>
    );
  }
  return (
    <span className={styles.statusCell}>
      <CircleHalfFill16Regular style={{ color: tokens.colorNeutralForeground3 }} />
      <Badge color="subtle" appearance="tint" size="small">Unknown</Badge>
    </span>
  );
}

function DescriptionCell({ text }: { text: string | undefined }) {
  const styles = useStyles();
  return <span className={styles.descriptionCell}>{text ?? '-'}</span>;
}

export function ConnectorActionsDialog({
  connector,
  open,
  onClose,
  initialOverrides,
  onSave,
}: ConnectorActionsDialogProps) {
  const styles = useStyles();
  const { actions, isLoading, error } = useConnectorActions(connector?.id ?? null);

  // Local override state — held here until user clicks "Save"
  const [localOverrides, setLocalOverrides] = useState<ActionOverrideMap>({});

  // Seed local overrides — default all actions to "Allow" unless the maker previously saved a Block override
  // Actions blocked by admin are forced to 'Block' and cannot be changed
  useEffect(() => {
    if (actions.length === 0) return;
    const seed: ActionOverrideMap = {};
    for (const a of actions) {
      if (a.actionStatus === 'Allow' || a.actionStatus === 'Block') {
        if (a.blockedByAdmin) {
          seed[a.actionKey] = 'Block';
        } else {
          seed[a.actionKey] = initialOverrides[a.actionKey] ?? 'Allow';
        }
      }
    }
    setLocalOverrides(seed);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions]);

  function handleToggle(actionKey: string, checked: boolean) {
    setLocalOverrides((prev) => ({ ...prev, [actionKey]: checked ? 'Allow' : 'Block' }));
  }

  function handleAllowAll() {
    setLocalOverrides((prev) => {
      const updated = { ...prev };
      for (const a of actions) {
        if (!a.blockedByAdmin) {
          updated[a.actionKey] = 'Allow';
        }
      }
      return updated;
    });
  }

  function handleBlockAll() {
    setLocalOverrides(Object.fromEntries(actions.map((a) => [a.actionKey, 'Block' as const])));
  }

  function handleSave() {
    onSave(localOverrides);
    onClose();
  }

  // Columns are defined inside the component so they can close over localOverrides + handleToggle
  const columns: TableColumnDefinition<ConnectorAction>[] = [
    createTableColumn<ConnectorAction>({
      columnId: 'actionName',
      renderHeaderCell: () => 'Action Name',
      renderCell: (item) => <Text weight="semibold">{item.actionName}</Text>,
    }),
    createTableColumn<ConnectorAction>({
      columnId: 'actionStatus',
      renderHeaderCell: () => 'Action Status',
      renderCell: (item) => {
        if (item.actionStatus === 'Unknown') {
          return <ActionStatusBadge status="Unknown" />;
        }
        if (item.blockedByAdmin) {
          return (
            <Tooltip content="This action is blocked by an admin and cannot be changed" relationship="description">
              <span className={styles.statusCell} style={{ opacity: 0.6 }}>
                <StatusIcon status="Block" />
                <Switch checked={false} label="Block" disabled />
              </span>
            </Tooltip>
          );
        }
        const currentStatus: 'Allow' | 'Block' = localOverrides[item.actionKey] ?? item.actionStatus;
        return (
          <span className={styles.statusCell}>
            <StatusIcon status={currentStatus} />
            <Switch
              checked={currentStatus === 'Allow'}
              label={currentStatus === 'Allow' ? 'Allow' : 'Block'}
              onChange={(_, d) => handleToggle(item.actionKey, d.checked)}
            />
          </span>
        );
      },
    }),
    createTableColumn<ConnectorAction>({
      columnId: 'actionDescription',
      renderHeaderCell: () => 'Action Description',
      renderCell: (item) => <DescriptionCell text={item.actionDescription} />,
    }),
  ];

  return (
    <Dialog open={open} onOpenChange={(_, data) => { if (!data.open) onClose(); }}>
      <DialogSurface className={styles.surface}>
        <DialogTitle>
          {connector?.displayName ?? ''} Connector Actions
        </DialogTitle>
        <DialogBody>
          <DialogContent>
            <Text className={styles.subtitle} size={200}>
              All connector actions are allowed by default. Toggle to block specific actions.
            </Text>

            {error && (
              <MessageBar intent="error">
                <MessageBarBody>Failed to load connector actions.</MessageBarBody>
              </MessageBar>
            )}

            {isLoading && <Spinner size="small" label="Loading actions..." />}

            {!isLoading && !error && actions.length === 0 && (
              <Text className={styles.emptyMsg}>No actions found for this connector.</Text>
            )}

            {!isLoading && !error && actions.length > 0 && (
              <>
                <div className={styles.bulkControls}>
                  <Button size="small" appearance="outline" icon={<CheckmarkCircle16Regular />} onClick={handleAllowAll}>
                    Allow All
                  </Button>
                  <Button size="small" appearance="outline" icon={<DismissCircle16Regular />} onClick={handleBlockAll}>
                    Block All
                  </Button>
                </div>
                <DataGrid
                  items={actions}
                  columns={columns}
                  getRowId={(item) => item.id}
                  resizableColumns
                  columnSizingOptions={{
                    actionName:        { defaultWidth: 260, minWidth: 140 },
                    actionStatus:      { defaultWidth: 190, minWidth: 140 },
                    actionDescription: { defaultWidth: 560, minWidth: 200 },
                  }}
                >
                  <DataGridHeader>
                    <DataGridRow>
                      {({ renderHeaderCell }) => (
                        <DataGridHeaderCell className={styles.headerCell}>{renderHeaderCell()}</DataGridHeaderCell>
                      )}
                    </DataGridRow>
                  </DataGridHeader>
                  <DataGridBody<ConnectorAction>>
                    {({ item, rowId }) => (
                      <DataGridRow<ConnectorAction> key={rowId}>
                        {({ renderCell }) => (
                          <DataGridCell>{renderCell(item)}</DataGridCell>
                        )}
                      </DataGridRow>
                    )}
                  </DataGridBody>
                </DataGrid>
              </>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" onClick={handleSave} disabled={isLoading || !!error}>
              Save
            </Button>
            <Button appearance="secondary" onClick={onClose}>Cancel</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
