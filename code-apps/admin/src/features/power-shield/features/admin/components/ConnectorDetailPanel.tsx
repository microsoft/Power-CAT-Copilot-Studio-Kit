import {
  OverlayDrawer,
  DrawerHeader,
  DrawerHeaderTitle,
  DrawerBody,
  Button,
  Text,
  Label,
  Spinner,
  Tooltip,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { Dismiss24Regular } from '@fluentui/react-icons';
import type { ConnectorRow } from '../services/connectorService';
import { ConnectorActionsSubGrid } from './ConnectorActionsSubGrid';

interface ConnectorDetailPanelProps {
  open: boolean;
  connector: ConnectorRow | null;
  onClose: () => void;
}

const useStyles = makeStyles({
  metadataGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
    paddingBottom: tokens.spacingVerticalM,
  },
  fieldRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  fieldRowFullWidth: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    gridColumn: '1 / -1',
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
  descriptionValue: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
    display: '-webkit-box',
    WebkitLineClamp: '2',
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    cursor: 'default',
  },
});

function ReadOnlyField({ label, value, fullWidth, truncate }: { label: string; value?: string | number; fullWidth?: boolean; truncate?: boolean }) {
  const styles = useStyles();
  const displayValue = value ?? '-';
  const isLongText = truncate && typeof displayValue === 'string' && displayValue.length > 80;

  const content = (
    <div className={fullWidth ? styles.fieldRowFullWidth : styles.fieldRow}>
      <Label className={styles.fieldLabel}>{label}</Label>
      <Text className={truncate ? styles.descriptionValue : styles.fieldValue}>
        {displayValue}
      </Text>
    </div>
  );

  if (isLongText) {
    return (
      <Tooltip content={displayValue as string} relationship="description" withArrow positioning="below">
        {content}
      </Tooltip>
    );
  }

  return content;
}

export function ConnectorDetailPanel({ open, connector, onClose }: ConnectorDetailPanelProps) {
  function formatDate(val?: string): string {
    if (!val) return '-';
    return new Date(val).toLocaleString();
  }

  const styles = useStyles();

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
          {connector?.displayName ?? 'Connector Details'}
        </DrawerHeaderTitle>
      </DrawerHeader>
      <DrawerBody>
        {!connector ? (
          <Spinner label="Loading..." />
        ) : (
          <>
            <div className={styles.metadataGrid}>
              <ReadOnlyField label="Connector Key" value={connector.connectorKey} />
              <ReadOnlyField label="Category" value={connector.category} />
              <ReadOnlyField label="Release Tag" value={connector.releaseTag} />
              <ReadOnlyField label="Last Sync Date Time" value={formatDate(connector.lastSyncDateTime)} />
              <ReadOnlyField label="Created On" value={formatDate(connector.createdOn)} />
              <ReadOnlyField label="Description" value={connector.description} fullWidth truncate />
            </div>

            <Text
              as="h3"
              weight="semibold"
              size={400}
              style={{ paddingTop: tokens.spacingVerticalL, paddingBottom: tokens.spacingVerticalS }}
            >
              Connector Actions
            </Text>

            <ConnectorActionsSubGrid connectorId={connector.id} />
          </>
        )}
      </DrawerBody>
    </OverlayDrawer>
  );
}
