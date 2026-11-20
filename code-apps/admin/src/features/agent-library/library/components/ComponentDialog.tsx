/**
 * ComponentDialog — Component Details Dialog (Figma node 1642:11275).
 *
 * READ-ONLY display of a single ComponentTemplate. All mutating actions
 * (Install / Download / View) are delegated to the `actionBar` prop,
 * EXCEPT for components with `requiresExternalConnection === true` (e.g. ServiceNow).
 *
 * For ServiceNow components, the dialog manages its own install flow:
 *   1. Downloads ZIP → parses connection references → fetches available connections
 *   2. Shows "Connect to data" section with ConnectionSetupView
 *   3. Import button disabled until all connections are resolved
 *   4. On Import: builds ComponentParameters, calls installFromBase64
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogSurface,
  DialogBody,
  Body1,
  Button,
  Link,
  Spinner,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  CommentMultiple20Regular,
  Dismiss20Regular,
  Document20Regular,
  Flash20Regular,
  Flow20Regular,
  BracesVariable20Regular,
  Wrench20Regular,
  HexagonThree16Filled,
  ArrowClockwise16Regular,
  Link20Regular,
  PlugConnected20Regular,
  PlugDisconnected20Regular,
  Prompt20Regular,
  Table20Regular,
  FormRegular,
} from '@fluentui/react-icons';

import { DialogSection } from './DialogSection';
import { SquircleIcon } from './SquircleIcon';
import VariablesTable from './VariablesTable';
import OutputsTable from './OutputsTable';
import { ConnectionSetupView } from './ConnectionSetup';
import { useClient, useAgentLibrary, useCloudType } from '../provider/AgentLibraryProvider';
import { downloadSolutionAsBase64, parseSolutionZipFromBase64 } from '../services/SolutionZipService';
import { parseConnectionReferences } from '../utils/customizationsParser';
import { fetchConnectionsForConnectors } from '../services/ConnectionService';
import { installFromBase64 } from '../services/SolutionInstallService';
import type { ComponentDialogProps, ConnectionSetupItem, SolutionConnectionReference, ConnectionComponentParam } from '../contracts/types';
import { buildCreateConnectionUrl } from '../utils/cloudUrls';

/** Maps technology tag names to their Fluent icons (same as AgentTemplateDialog). */
const TECH_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Connector: PlugDisconnected20Regular,
  'ServiceNow Connector': PlugDisconnected20Regular,
  Trigger: Flash20Regular,
  Topic: CommentMultiple20Regular,
  'Adaptive Cards': FormRegular,
  Prompt: Prompt20Regular,
  'AI Builder Prompt': Prompt20Regular,
  'MCP Server': Link20Regular,
  Workflow: Flow20Regular,
  Knowledge: Document20Regular,
  'Custom table': Table20Regular,
};

const useStyles = makeStyles({
  surface: {
    borderRadius: tokens.borderRadiusXLarge,
    maxWidth: '682px',
    width: '682px',
    padding: tokens.spacingHorizontalXXL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    paddingBottom: '16px',
    flex: '1 1 auto',
    overflowY: 'auto',
  },

  // Header
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  title: {
    fontSize: '20px',
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: '28px',
    flex: '1 1 0',
    minWidth: 0,
    color: tokens.colorNeutralForeground1,
    margin: '0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  dismissBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: tokens.borderRadiusSmall,
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    padding: '4px',
    flexShrink: 0,
    color: tokens.colorNeutralForeground2,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },

  // Description — below header row, not overlapping icon
  descriptionArea: {
    opacity: 0.7,
    lineHeight: '20px',
    paddingTop: '8px',
  },

  // Technology tags — gray outlined per Figma
  tagRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  tag: {
    backgroundColor: '#f0f0f0',
    borderTopWidth: '1px',
    borderRightWidth: '1px',
    borderBottomWidth: '1px',
    borderLeftWidth: '1px',
    borderTopStyle: 'solid',
    borderRightStyle: 'solid',
    borderBottomStyle: 'solid',
    borderLeftStyle: 'solid',
    borderTopColor: '#e0e0e0',
    borderRightColor: '#e0e0e0',
    borderBottomColor: '#e0e0e0',
    borderLeftColor: '#e0e0e0',
    borderRadius: '4px',
    paddingLeft: '4px',
    paddingRight: '8px',
    paddingTop: '4px',
    paddingBottom: '4px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: '#616161',
  },
  tagIcon: {
    fontSize: '16px',
    color: '#616161',
  },

  // Footer
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: tokens.spacingVerticalXS,
  },
  footerLeft: {
    width: '116px',
  },
  footerRight: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
  },
});

const ComponentDialog: React.FC<ComponentDialogProps> = ({
  item,
  onClose,
  actionBar,
  onInstallComplete,
  onInstallStart,
}) => {
  const styles = useStyles();
  const client = useClient();
  const { environmentId } = useAgentLibrary();
  const cloudType = useCloudType();

  const hasOutputs = Array.isArray(item.outputs) && item.outputs.length > 0;
  const toolTags: string[] = item.toolsAndActions ?? item.technologyTags ?? [];
  const needsConnections = item.requiresExternalConnection;

  // Connection-aware install state (only used when requiresExternalConnection)
  const [connectionItems, setConnectionItems] = useState<ConnectionSetupItem[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [connectionRefs, setConnectionRefs] = useState<SolutionConnectionReference[]>([]);
  const [zipBase64, setZipBase64] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);

  /** Downloads ZIP, parses connection refs, fetches available connections. */
  const loadConnections = useCallback(async () => {
    if (!needsConnections) return;

    setConnectionsLoading(true);
    try {
      // Step 1: Download solution ZIP
      const base64 = await downloadSolutionAsBase64(client, item.zipUrl);
      setZipBase64(base64);

      // Step 2: Parse ZIP → extract connection references
      const { zip } = await parseSolutionZipFromBase64(base64);
      const refs = await parseConnectionReferences(zip);
      setConnectionRefs(refs);

      if (refs.length === 0) {
        setConnectionItems([]);
        setConnectionsLoading(false);
        return;
      }

      // Step 3: Fetch available connections in current environment
      const connectorNames = [...new Set(refs.map((r) => r.connectorName))];
      const connectionsMap = await fetchConnectionsForConnectors(client, connectorNames, 'current');

      // Step 4: Build ConnectionSetupItem[] with auto-selection
      const items: ConnectionSetupItem[] = refs.map((ref) => {
        const available = connectionsMap.get(ref.connectorName) ?? [];
        return {
          reference: ref,
          availableConnections: available,
          selectedConnectionId: available.length > 0 ? available[0].connectionId : null,
          loading: false,
          error: null,
        };
      });

      setConnectionItems(items);
    } catch (err) {
      console.error('[ComponentDialog] Failed to load connections:', err);
      setConnectionItems([]);
    } finally {
      setConnectionsLoading(false);
    }
  }, [client, item.zipUrl, needsConnections]);

  // Load connections on dialog open
  useEffect(() => {
    if (needsConnections) {
      void loadConnections();
    }
  }, [needsConnections, loadConnections]);

  /** Handle connection selection change from ConnectionSetupView. */
  const handleConnectionChange = useCallback((logicalName: string, connectionId: string) => {
    setConnectionItems((prev) =>
      prev.map((ci) =>
        ci.reference.logicalName === logicalName
          ? { ...ci, selectedConnectionId: connectionId }
          : ci,
      ),
    );
  }, []);

  /** Handle "Create new" connection link. */
  const handleCreateConnection = useCallback(
    (connectorName: string) => {
      window.open(
        buildCreateConnectionUrl(cloudType, environmentId, connectorName),
        '_blank',
      );
    },
    [environmentId, cloudType],
  );

  /** Whether all connection references have a selected connection. */
  const allConnectionsResolved =
    connectionItems.length > 0 &&
    connectionItems.every((ci) => ci.selectedConnectionId !== null);

  /** Whether the ServiceNow import button should be enabled. */
  const canImportServiceNow =
    needsConnections &&
    !connectionsLoading &&
    allConnectionsResolved &&
    zipBase64 !== null &&
    !installing;

  /** Handle ServiceNow import with connection parameters. */
  const handleServiceNowInstall = useCallback(async () => {
    if (!zipBase64 || !canImportServiceNow) return;

    setInstalling(true);
    onInstallStart?.();

    try {
      // Build ComponentParameters from resolved connections
      const componentParameters: ConnectionComponentParam[] = connectionItems
        .filter((ci) => ci.selectedConnectionId)
        .map((ci) => ({
          '@odata.type': 'Microsoft.Dynamics.CRM.connectionreference' as const,
          connectionreferencelogicalname: ci.reference.logicalName,
          connectionreferencedisplayname: ci.reference.displayName,
          connectorid: ci.reference.connectorId,
          connectionid: ci.selectedConnectionId!,
        }));

      const importJobId = crypto.randomUUID();
      const result = await installFromBase64(client, zipBase64, importJobId, componentParameters, 'current');

      onInstallComplete?.(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Installation failed. Please try again.';
      onInstallComplete?.({ success: false, errorMessage: message });
    } finally {
      setInstalling(false);
    }
  }, [zipBase64, canImportServiceNow, connectionItems, client, onInstallComplete, onInstallStart]);

  return (
    <Dialog open onOpenChange={(_e, data) => { if (!data.open) onClose(); }}>
      <DialogSurface className={styles.surface} aria-labelledby="component-dialog-title">
        <DialogBody style={{ display: 'flex', flexDirection: 'column', gap: '0', overflow: 'hidden' }}>
          <div className={styles.content}>

            {/* Header: icon + title + badge + dismiss */}
            <div>
              <div className={styles.headerRow}>
                <SquircleIcon
                  iconName={item.icon}
                  iconGradient={item.iconGradient}
                  iconSvg={item.iconSvg}
                  iconColor={item.iconColor}
                  size={48}
                />
                <h2 id="component-dialog-title" className={styles.title}>
                  {item.name}
                </h2>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '2px',
                  backgroundColor: tokens.colorNeutralBackground5,
                  borderRadius: '9999px',
                  paddingLeft: '8px',
                  paddingRight: '8px',
                  height: '24px',
                  minWidth: '24px',
                  flexShrink: 0,
                }}>
                  <HexagonThree16Filled style={{ fontSize: '16px', color: tokens.colorNeutralForeground3 }} />
                  <span style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    lineHeight: '16px',
                    color: tokens.colorNeutralForeground3,
                    paddingLeft: '2px',
                    paddingRight: '2px',
                  }}>Component</span>
                </span>
                <button
                  className={styles.dismissBtn}
                  onClick={onClose}
                  aria-label="Close"
                  type="button"
                >
                  <Dismiss20Regular />
                </button>
              </div>

              {/* Description — below header, 70% opacity per Figma */}
              <div className={styles.descriptionArea}>
                <Body1>
                  {item.description}
                  {item.learnMoreUrl && (
                    <>
                      {' '}
                      <Link href={item.learnMoreUrl} target="_blank" rel="noopener noreferrer">
                        Learn more
                      </Link>
                    </>
                  )}
                </Body1>
              </div>
            </div>

            {/* Inputs */}
            {item.inputs.length > 0 && (
              <DialogSection icon={<BracesVariable20Regular />} label={item.inputsLabel ?? 'Inputs'}>
                <VariablesTable inputs={item.inputs} />
              </DialogSection>
            )}

            {/* Outputs */}
            {hasOutputs && (
              <DialogSection icon={<BracesVariable20Regular />} label="Outputs">
                <OutputsTable outputs={item.outputs!} />
              </DialogSection>
            )}

            {/* Connect to data — ServiceNow / external connection components only */}
            {needsConnections && (
              <DialogSection
                icon={<PlugConnected20Regular />}
                label="Connect to data"
                action={
                  <Button
                    appearance="subtle"
                    size="small"
                    icon={<ArrowClockwise16Regular />}
                    onClick={() => void loadConnections()}
                    disabled={connectionsLoading}
                    aria-label="Refresh connections"
                  />
                }
              >
                {connectionsLoading ? (
                  <Spinner size="tiny" label="Loading connections..." />
                ) : connectionItems.length > 0 ? (
                  <ConnectionSetupView
                    items={connectionItems}
                    onConnectionChange={handleConnectionChange}
                    onCreateConnection={handleCreateConnection}
                  />
                ) : connectionRefs.length === 0 && !connectionsLoading ? (
                  <Body1 style={{ opacity: 0.6 }}>No connection references found in this solution.</Body1>
                ) : null}
              </DialogSection>
            )}

            {/* Technology used */}
            {toolTags.length > 0 && (
              <DialogSection
                icon={<Wrench20Regular />}
                label="Technology used"
                isLast
              >
                <div className={styles.tagRow}>
                  {toolTags.map((tag) => {
                    const TechIcon = TECH_ICON_MAP[tag] ?? Prompt20Regular;
                    return (
                      <span key={tag} className={styles.tag}>
                        <TechIcon className={styles.tagIcon} aria-hidden="true" />
                        {tag}
                      </span>
                    );
                  })}
                </div>
              </DialogSection>
            )}
          </div>

          {/* Footer */}
          <div className={styles.footer}>
            <div className={styles.footerLeft} />
            <div className={styles.footerRight}>
              {needsConnections ? (
                <>
                  {actionBar}
                  {item.installState !== 'installed' && (
                    <Button
                      appearance="primary"
                      disabled={!canImportServiceNow}
                      onClick={() => void handleServiceNowInstall()}
                      icon={installing ? <Spinner size="tiny" /> : undefined}
                    >
                      {installing ? 'Importing...' : 'Import'}
                    </Button>
                  )}
                </>
              ) : (
                actionBar
              )}
            </div>
          </div>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};

export default ComponentDialog;
