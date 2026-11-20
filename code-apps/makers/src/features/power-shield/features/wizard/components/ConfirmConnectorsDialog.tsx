import {
  makeStyles,
  tokens,
  Text,
  Button,
  Badge,
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Divider,
} from '@fluentui/react-components';
import {
  CheckmarkCircle20Regular,
  DismissCircle16Regular,
  PlugConnected20Regular,
  Globe20Regular,
} from '@fluentui/react-icons';
import type { WizardSelectedConnector, WizardCustomConnectorPattern } from '../contexts/wizardTypes';
import type { ActionOverrideMap } from '../../../models/connectorAction';

interface ConfirmConnectorsDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  selectedConnectors: WizardSelectedConnector[];
  connectorActionOverrides: Record<string, ActionOverrideMap>;
  customConnectorPatterns: WizardCustomConnectorPattern[];
}

const DATA_GROUP_LABELS: Record<number, string> = {
  1: 'Non-business',
  2: 'Business',
  3: 'Blocked',
};

const useStyles = makeStyles({
  surface: {
    width: '720px',
    maxWidth: '95vw',
    maxHeight: '85vh',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    paddingLeft: tokens.spacingHorizontalL,
  },
  connectorItem: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  blockedGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    marginBottom: tokens.spacingVerticalS,
  },
  blockedActions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalXS,
    paddingLeft: tokens.spacingHorizontalL,
  },
  patternRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
  },
});

/** Builds a map of connector names → list of blocked action keys. */
function getBlockedActionsByConnector(
  connectors: WizardSelectedConnector[],
  overrides: Record<string, ActionOverrideMap>,
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const c of connectors) {
    const map = overrides[c.connectorId];
    if (!map) continue;
    const blocked = Object.entries(map)
      .filter(([, status]) => status === 'Block')
      .map(([key]) => key);
    if (blocked.length > 0) {
      result.set(c.displayName, blocked);
    }
  }
  return result;
}

export function ConfirmConnectorsDialog({
  open,
  onConfirm,
  onCancel,
  selectedConnectors,
  connectorActionOverrides,
  customConnectorPatterns,
}: ConfirmConnectorsDialogProps) {
  const styles = useStyles();

  const blockedByConnector = getBlockedActionsByConnector(selectedConnectors, connectorActionOverrides);
  const hasBlockedActions = blockedByConnector.size > 0;
  const hasCustomPatterns = customConnectorPatterns.length > 0;

  return (
    <Dialog open={open} onOpenChange={(_, data) => { if (!data.open) onCancel(); }}>
      <DialogSurface className={styles.surface}>
        <DialogTitle>Confirm Connector Selections</DialogTitle>
        <DialogBody>
          <DialogContent className={styles.content}>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              Please review your selections before proceeding. You can go back to make changes.
            </Text>

            {/* Selected Connectors */}
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <PlugConnected20Regular />
                <Text weight="semibold" size={400}>
                  Selected Connectors
                </Text>
                <Badge appearance="filled" color="informative" size="small">
                  {selectedConnectors.length}
                </Badge>
              </div>
              <div className={styles.list}>
                {selectedConnectors.map((c) => (
                  <div key={c.connectorId} className={styles.connectorItem}>
                    <CheckmarkCircle20Regular
                      style={{ color: tokens.colorPaletteGreenForeground1, flexShrink: 0 }}
                    />
                    <Text size={300}>{c.displayName}</Text>
                  </div>
                ))}
              </div>
            </div>

            {/* Blocked Actions */}
            {hasBlockedActions && (
              <>
                <Divider />
                <div className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <DismissCircle16Regular style={{ color: tokens.colorPaletteRedForeground1 }} />
                    <Text weight="semibold" size={400}>
                      Blocked Actions
                    </Text>
                  </div>
                  <div className={styles.list}>
                    {[...blockedByConnector.entries()].map(([connectorName, actions]) => (
                      <div key={connectorName} className={styles.blockedGroup}>
                        <Text weight="semibold" size={300}>{connectorName}</Text>
                        <div className={styles.blockedActions}>
                          {actions.map((action) => (
                            <Badge key={action} appearance="tint" color="danger" size="medium">
                              {action}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Custom Connector Patterns */}
            {hasCustomPatterns && (
              <>
                <Divider />
                <div className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <Globe20Regular />
                    <Text weight="semibold" size={400}>
                      Custom Connector Patterns
                    </Text>
                    <Badge appearance="filled" color="informative" size="small">
                      {customConnectorPatterns.length}
                    </Badge>
                  </div>
                  <div className={styles.list}>
                    {customConnectorPatterns.map((p) => (
                      <div key={p.tempId} className={styles.patternRow}>
                        <Text size={300} font="monospace">{p.hostUrlPattern}</Text>
                        <Badge
                          appearance="tint"
                          color={p.dataGroup === 3 ? 'danger' : p.dataGroup === 2 ? 'success' : 'warning'}
                          size="small"
                        >
                          {DATA_GROUP_LABELS[p.dataGroup] ?? `Group ${p.dataGroup}`}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" onClick={onConfirm}>
              Confirm &amp; Continue
            </Button>
            <Button appearance="secondary" onClick={onCancel}>
              Go Back
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
