import {
  OverlayDrawer,
  DrawerHeader,
  DrawerHeaderTitle,
  DrawerBody,
  Button,
  Text,
  Label,
  Spinner,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { Dismiss24Regular } from '@fluentui/react-icons';
import type { ConnectorActionRow } from '../services/connectorActionService';

interface ConnectorActionDetailPanelProps {
  open: boolean;
  action: ConnectorActionRow | null;
  onClose: () => void;
  onSaved: () => void;
}

const useStyles = makeStyles({
  fieldRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    paddingBottom: tokens.spacingVerticalS,
  },
  fieldLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    fontWeight: tokens.fontWeightSemibold,
  },
  fieldValue: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
  },
});

function ReadOnlyField({ label, value }: { label: string; value?: string }) {
  const styles = useStyles();
  return (
    <div className={styles.fieldRow}>
      <Label className={styles.fieldLabel}>{label}</Label>
      <Text className={styles.fieldValue}>{value ?? '-'}</Text>
    </div>
  );
}

export function ConnectorActionDetailPanel({ open, action, onClose }: ConnectorActionDetailPanelProps) {
  function formatDate(val?: string): string {
    if (!val) return '-';
    return new Date(val).toLocaleString();
  }

  return (
    <OverlayDrawer
      open={open}
      onOpenChange={(_, data) => { if (!data.open) onClose(); }}
      position="end"
      size="medium"
    >
      <DrawerHeader>
        <DrawerHeaderTitle
          action={
            <Button
              appearance="subtle"
              aria-label="Close"
              icon={<Dismiss24Regular />}
              onClick={onClose}
            />
          }
        >
          {action?.actionName ?? 'Action Details'}
        </DrawerHeaderTitle>
      </DrawerHeader>
      <DrawerBody>
        {!action ? (
          <Spinner label="Loading..." />
        ) : (
          <>
            <ReadOnlyField label="Connector" value={action.connectorName} />
            <ReadOnlyField label="Name" value={action.actionName} />
            <ReadOnlyField label="Action Key" value={action.actionKey} />
            <ReadOnlyField label="Action Description" value={action.actionDescription} />
            <ReadOnlyField label="Last Sync Date Time" value={formatDate(action.lastSyncDateTime)} />
            <ReadOnlyField label="Created On" value={formatDate(action.createdOn)} />
          </>
        )}
      </DrawerBody>
    </OverlayDrawer>
  );
}
