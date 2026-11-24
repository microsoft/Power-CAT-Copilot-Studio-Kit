import { useState, useCallback, useEffect } from 'react';
import {
  makeStyles,
  tokens,
  Card,
  Text,
  Button,
  Spinner,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Dropdown,
  Option,
  Link,
  Divider,
  Switch,
  Tooltip,
} from '@fluentui/react-components';
import {
  CheckmarkCircleRegular,
  WarningRegular,
  PlugConnectedRegular,
  OpenRegular,
  AddRegular,
  ArrowClockwiseRegular,
  Info16Regular,
  CloudFlowRegular,
  ChevronDownRegular,
  ChevronRightRegular,
} from '@fluentui/react-icons';
import { getContext } from '@microsoft/power-apps/app';
import { useLayoutStyles } from '../../../shared/styles';
import { PowerShieldBreadcrumb } from '../../../shared/components/PowerShieldBreadcrumb';
import { useNotify } from '../../../shared/hooks/useNotify';
import { ConnectionHelperDialog } from './ConnectionHelperDialog';
import {
  getPowerShieldConnectionReferences,
  getAvailableConnections,
  mapConnectionToReference,
  normalizeConnectionId,
} from '../services/connectionReferenceService';
import {
  getPowerShieldFlows,
  activateFlow,
  checkDataSyncStatus,
  invalidateHealthCache,
} from '../services/workflowService';
import type { ConnectionReference, AvailableConnection } from '../../../models/connectionReference';
import type { CloudFlow } from '../../../models/workflow';
import type { DataSyncStatus } from '../services/workflowService';

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    marginBottom: tokens.spacingVerticalL,
  },
  subtitle: {
    color: tokens.colorNeutralForeground3,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    marginBottom: tokens.spacingVerticalXL,
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
  },
  sectionIcon: {
    fontSize: '20px',
    color: tokens.colorBrandForeground1,
  },
  sectionToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    cursor: 'pointer',
    userSelect: 'none' as const,
  },
  chevron: {
    fontSize: '16px',
    color: tokens.colorNeutralForeground2,
    transition: 'transform 0.2s ease',
  },
  card: {
    padding: tokens.spacingVerticalM,
  },
  refRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalS} 0`,
    flexWrap: 'wrap',
  },
  refInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    flex: '1 1 250px',
    minWidth: '200px',
  },
  refActions: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexShrink: 0,
  },
  dropdown: {
    minWidth: '250px',
  },
  flowRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalS} 0`,
  },
  flowInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  syncStatus: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingVerticalM,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  syncRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  spinner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacingVerticalXXL,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Build the Maker Portal "New Connection" URL. */
function buildNewConnectionUrl(envId: string, connectorId: string): string {
  const apiName = connectorId.includes('/') ? connectorId.split('/').pop()! : connectorId;
  return `https://make.powerapps.com/environments/${encodeURIComponent(envId)}/connections/available?apiName=${encodeURIComponent(apiName)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP-with-Entra-ID helper config (PowerShield APIFlow / BAPAPI)
// ─────────────────────────────────────────────────────────────────────────────

interface HttpHelperConfig {
  refKey: 'apiflow' | 'bapapi';
  settings: ReadonlyArray<{ label: string; value: string }>;
}

/**
 * Connection references that use the *HTTP with Microsoft Entra ID
 * (preauthorized)* connector and require two URL fields users typically have
 * to look up in documentation. We surface a helper dialog at connection-create
 * time so the values can be copied directly. Keyed by exact `displayName`.
 */
const POWER_SHIELD_HTTP_REF_HELPERS: Record<string, HttpHelperConfig> = {
  'PowerShield APIFlow': {
    refKey: 'apiflow',
    settings: [
      { label: 'Base Resource URL', value: 'https://api.flow.microsoft.com' },
      { label: 'Microsoft Entra ID Resource URI', value: 'https://service.powerapps.com/' },
    ],
  },
  'PowerShield BAPAPI': {
    refKey: 'bapapi',
    settings: [
      { label: 'Base Resource URL', value: 'https://api.bap.microsoft.com' },
      { label: 'Microsoft Entra ID Resource URI', value: 'https://api.bap.microsoft.com' },
    ],
  },
};

/**
 * Returns the helper config for a connection reference if (and only if) BOTH
 * the displayName and connector match an expected entry. The connector check
 * is a defense-in-depth safety net so a renamed reference targeting a
 * different connector cannot silently surface HTTP-specific guidance.
 */
function getHttpHelper(ref: ConnectionReference): HttpHelperConfig | null {
  const config = POWER_SHIELD_HTTP_REF_HELPERS[ref.displayName];
  if (!config) return null;
  const apiName = ref.connectorId.includes('/')
    ? ref.connectorId.split('/').pop()
    : ref.connectorId;
  if (!apiName) return null;
  return apiName.toLowerCase().endsWith('shared_webcontents') ||
    apiName.toLowerCase() === 'shared_webcontents'
    ? config
    : null;
}

/** User-friendly description for each PowerShield cloud flow. */
function getFlowDescription(flowName: string): string {
  const lower = flowName.toLowerCase();
  if (lower.includes('sync connectors'))
    return 'Loads the list of all available Power Platform connectors and their actions so they can be managed in Request Center.';
  if (lower.includes('dlp request'))
    return 'Applies custom connector URL patterns and action-level overrides when a DLP policy request is approved.';
  return 'This cloud flow supports Request Center functionality.';
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface ConnectionHealthScreenProps {
  /**
   * When true, render only the inner content (no breadcrumb, page header, or
   * outer pageContainer wrapper). Use this when embedding inside a parent
   * screen that already provides the page chrome (e.g., a tabbed container).
   */
  embedded?: boolean;
}

export function ConnectionHealthScreen({ embedded = false }: ConnectionHealthScreenProps = {}) {
  const styles = useStyles();
  const layoutStyles = useLayoutStyles();
  const { notifySuccess, notifyError } = useNotify();

  // Environment ID for Maker Portal URLs
  const [envId, setEnvId] = useState<string>('');
  const [envIdError, setEnvIdError] = useState<string | null>(null);

  // Connection References state
  const [connectionRefs, setConnectionRefs] = useState<ConnectionReference[]>([]);
  const [availableConnectionsMap, setAvailableConnectionsMap] = useState<
    Record<string, AvailableConnection[]>
  >({});
  const [connectionsErrorMap, setConnectionsErrorMap] = useState<Record<string, string>>({});
  const [selectedConnections, setSelectedConnections] = useState<Record<string, string>>({});
  const [isLoadingRefs, setIsLoadingRefs] = useState(true);
  const [refsError, setRefsError] = useState<string | null>(null);
  const [mappingInProgress, setMappingInProgress] = useState<Record<string, boolean>>({});

  // Cloud Flows state
  const [flows, setFlows] = useState<CloudFlow[]>([]);
  const [isLoadingFlows, setIsLoadingFlows] = useState(true);
  const [flowsError, setFlowsError] = useState<string | null>(null);
  const [activatingFlows, setActivatingFlows] = useState<Record<string, boolean>>({});

  // Data sync status (post-activation)
  const [syncStatus, setSyncStatus] = useState<DataSyncStatus | null>(null);
  const [isCheckingSync, setIsCheckingSync] = useState(false);

  // Collapsible sections
  const [isRefsExpanded, setIsRefsExpanded] = useState(true);
  const [isFlowsExpanded, setIsFlowsExpanded] = useState(true);

  // ─── HTTP-with-Entra-ID helper dialog ──────────────────────────────────────
  // Single dialog instance, parameterized by which row triggered it.
  const [helperDialog, setHelperDialog] = useState<{
    displayName: string;
    settings: ReadonlyArray<{ label: string; value: string }>;
    makerUrl: string;
  } | null>(null);

  const handleOpenHelper = useCallback(
    (
      displayName: string,
      settings: ReadonlyArray<{ label: string; value: string }>,
      makerUrl: string,
    ) => {
      setHelperDialog({ displayName, settings, makerUrl });
    },
    [],
  );

  // ─── Resolve Environment ID ────────────────────────────────────────────────
  const resolveEnvId = useCallback(async () => {
    try {
      const ctx = await getContext();
      setEnvIdError(null);
      const id = (ctx.app as unknown as Record<string, unknown>).environmentId as string;
      if (id) {
        setEnvId(id);
      } else {
        setEnvIdError('Environment id is unavailable from the Power Apps SDK context.');
      }
    } catch (err) {
      console.warn('[ConnectionHealth] Could not resolve environment ID from SDK context', err);
      setEnvIdError(
        err instanceof Error
          ? err.message
          : 'Could not resolve the environment id from the Power Apps SDK context.',
      );
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resolveEnvId only sets state inside async branches; the rule traces through useCallback and reports a false positive.
    void resolveEnvId();
  }, [resolveEnvId]);

  // ─── Load Connection References ────────────────────────────────────────────
  const loadConnectionRefs = useCallback(async () => {
    setIsLoadingRefs(true);
    setRefsError(null);
    try {
      const refs = await getPowerShieldConnectionReferences();
      setConnectionRefs(refs);

      // Make Dataverse the authoritative source for each loaded ref's selection.
      // (Previous implementation merged with prev-wins which left stale values after
      // refreshes / external changes / failed saves.)
      setSelectedConnections((prev) => {
        const next = { ...prev };
        for (const ref of refs) {
          next[ref.id] = ref.connectionId ?? '';
        }
        return next;
      });

      // For each unique connector type, fetch available connections (needs envId)
      if (envId) {
        const uniqueConnectors = [...new Set(refs.map((r) => r.connectorId).filter(Boolean))];
        const connectionsMap: Record<string, AvailableConnection[]> = {};
        const errorMap: Record<string, string> = {};
        await Promise.all(
          uniqueConnectors.map(async (connId) => {
            const result = await getAvailableConnections(connId, envId);
            connectionsMap[connId] = result.connections;
            if (result.error) errorMap[connId] = result.error;
          }),
        );
        setAvailableConnectionsMap(connectionsMap);
        setConnectionsErrorMap(errorMap);
      }
    } catch (err) {
      setRefsError(err instanceof Error ? err.message : 'Failed to load connection references');
    } finally {
      setIsLoadingRefs(false);
    }
  }, [envId]);

  // ─── Load Cloud Flows ──────────────────────────────────────────────────────
  const loadFlows = useCallback(async () => {
    setIsLoadingFlows(true);
    setFlowsError(null);
    try {
      const result = await getPowerShieldFlows();
      setFlows(result);
    } catch (err) {
      setFlowsError(err instanceof Error ? err.message : 'Failed to load cloud flows');
    } finally {
      setIsLoadingFlows(false);
    }
  }, []);

  // ─── Initial Load ──────────────────────────────────────────────────────────
  useEffect(() => {
    void loadConnectionRefs();
    void loadFlows();
    // Load sync status on mount (lightweight count queries)
    void (async () => {
      setIsCheckingSync(true);
      try {
        const status = await checkDataSyncStatus();
        setSyncStatus(status);
      } catch {
        // Silently ignore — user can click Refresh
      } finally {
        setIsCheckingSync(false);
      }
    })();
  }, [loadConnectionRefs, loadFlows]);

  // ─── Refresh All ───────────────────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    await Promise.all([loadConnectionRefs(), loadFlows()]);
    notifySuccess('Status refreshed');
  }, [loadConnectionRefs, loadFlows, notifySuccess]);

  // ─── Map Connection (auto-save on dropdown selection) ────────────────────
  const [mappingSuccess, setMappingSuccess] = useState<Record<string, boolean>>({});
  const [mappingError, setMappingError] = useState<Record<string, boolean>>({});

  const handleMapConnection = useCallback(
    async (refId: string, connectionName: string) => {
      setMappingInProgress((prev) => ({ ...prev, [refId]: true }));
      setMappingSuccess((prev) => ({ ...prev, [refId]: false }));
      setMappingError((prev) => ({ ...prev, [refId]: false }));
      try {
        await mapConnectionToReference(refId, connectionName);
        invalidateHealthCache();
        setMappingSuccess((prev) => ({ ...prev, [refId]: true }));
        notifySuccess('Connection mapped successfully');
        await loadConnectionRefs();
      } catch (err) {
        setMappingError((prev) => ({ ...prev, [refId]: true }));
        notifyError(err instanceof Error ? err.message : 'Failed to map connection');
      } finally {
        setMappingInProgress((prev) => ({ ...prev, [refId]: false }));
      }
    },
    [loadConnectionRefs, notifySuccess, notifyError],
  );

  // ─── Refresh Connections for a Single Connector ────────────────────────────
  const [refreshingConnectors, setRefreshingConnectors] = useState<Record<string, boolean>>({});
  const handleRefreshConnector = useCallback(
    async (connectorId: string) => {
      if (!envId) return;
      setRefreshingConnectors((prev) => ({ ...prev, [connectorId]: true }));
      try {
        const result = await getAvailableConnections(connectorId, envId);
        setAvailableConnectionsMap((prev) => ({ ...prev, [connectorId]: result.connections }));
        setConnectionsErrorMap((prev) => {
          const next = { ...prev };
          if (result.error) next[connectorId] = result.error;
          else delete next[connectorId];
          return next;
        });
        if (result.error) notifyError(result.error);
      } catch {
        notifyError('Failed to refresh connections');
      } finally {
        setRefreshingConnectors((prev) => ({ ...prev, [connectorId]: false }));
      }
    },
    [envId, notifyError],
  );

  // ─── Auto-refresh connections on tab re-focus (after "Create New Connection") ─
  useEffect(() => {
    if (!envId) return;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Debounce to avoid rapid re-fetches when switching tabs quickly
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const uniqueConnectors = [...new Set(connectionRefs.map((r) => r.connectorId).filter(Boolean))];
          uniqueConnectors.forEach((connId) => {
            void (async () => {
              try {
                const result = await getAvailableConnections(connId, envId);
                setAvailableConnectionsMap((prev) => ({ ...prev, [connId]: result.connections }));
                setConnectionsErrorMap((prev) => {
                  const next = { ...prev };
                  if (result.error) next[connId] = result.error;
                  else delete next[connId];
                  return next;
                });
              } catch {
                // Silent — user can manually refresh
              }
            })();
          });
        }, 1000);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [envId, connectionRefs]);

  // ─── Activate Flow ─────────────────────────────────────────────────────────
  const handleActivateFlow = useCallback(
    async (flowId: string) => {
      setActivatingFlows((prev) => ({ ...prev, [flowId]: true }));
      try {
        await activateFlow(flowId);
        invalidateHealthCache();
        notifySuccess('Flow activated. It will run on its configured schedule.');
        await loadFlows();
      } catch (err) {
        notifyError(err instanceof Error ? err.message : 'Failed to activate flow');
      } finally {
        setActivatingFlows((prev) => ({ ...prev, [flowId]: false }));
      }
    },
    [loadFlows, notifySuccess, notifyError],
  );

  // ─── Check Data Sync ───────────────────────────────────────────────────────
  const handleCheckSync = useCallback(async () => {
    setIsCheckingSync(true);
    try {
      const status = await checkDataSyncStatus();
      setSyncStatus(status);
    } catch {
      notifyError('Failed to check data sync status');
    } finally {
      setIsCheckingSync(false);
    }
  }, [notifyError]);

  // ─── Derived State ─────────────────────────────────────────────────────────
  const allRefsMapped = connectionRefs.length > 0 && connectionRefs.every((r) => r.connectionId);
  const allFlowsActive = flows.length > 0 && flows.every((f) => f.isActivated);
  const isSyncFlowOn = flows.some(
    (f) => f.name.toLowerCase().includes('sync connectors') && f.isActivated,
  );

  // Connection References section is "loading" until refs, environment id, AND
  // every per-connector available-connections fetch have settled. Rendering rows
  // before available connections resolve causes the dropdown to appear empty and
  // the row status to fall into the "mapped but invisible" branch (orange ⚠),
  // which is misleading on slow networks. Keep the single section-level Spinner
  // visible until everything is ready.
  const uniqueConnectorIds = [
    ...new Set(connectionRefs.map((r) => r.connectorId).filter(Boolean)),
  ];
  const allAvailableConnectionsLoaded = uniqueConnectorIds.every(
    (id) => availableConnectionsMap[id] !== undefined || !!connectionsErrorMap[id],
  );
  const isRefsSectionLoading =
    isLoadingRefs ||
    (!envId && !envIdError) ||
    (connectionRefs.length > 0 && !allAvailableConnectionsLoaded);

  // ─── Render ────────────────────────────────────────────────────────────────
  const content = (
    <>
      {!embedded && (
        <>
          <PowerShieldBreadcrumb
            segments={[
              { label: 'Settings', route: '/settings' },
              { label: 'Connection Health' },
            ]}
          />

          <div className={styles.header}>
            <Text size={600} weight="semibold">
              Connection Health
            </Text>
            <Text size={300} className={styles.subtitle}>
              Manage connection references and cloud flows for the Request Center experience.
            </Text>
          </div>
        </>
      )}

      {/* ─── Connection References ────────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div
            className={styles.sectionToggle}
            role="button"
            tabIndex={0}
            aria-expanded={isRefsExpanded}
            onClick={() => setIsRefsExpanded((v) => !v)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsRefsExpanded((v) => !v); } }}
          >
            {isRefsExpanded ? (
              <ChevronDownRegular className={styles.chevron} />
            ) : (
              <ChevronRightRegular className={styles.chevron} />
            )}
            <PlugConnectedRegular className={styles.sectionIcon} />
            <Text size={400} weight="semibold">
              Connection References
            </Text>
            <Tooltip content="Learn how to set up Request Center connection references" relationship="label" withArrow>
              <Link
                href="https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/POWER_SHIELD.md#prerequisites"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Connection references documentation (opens in a new tab)"
                onClick={(e) => e.stopPropagation()}
                style={{ display: 'inline-flex', alignItems: 'center', color: tokens.colorNeutralForeground3 }}
              >
                <Info16Regular />
              </Link>
            </Tooltip>
          </div>
          {isRefsExpanded && (
            <Button
              appearance="subtle"
              icon={<ArrowClockwiseRegular />}
              onClick={() => void handleRefresh()}
              disabled={isLoadingRefs}
            >
              Refresh
            </Button>
          )}
        </div>

        {isRefsExpanded && (
          <>
            {envIdError && (
              <MessageBar intent="warning">
                <MessageBarBody>
                  <MessageBarTitle>Environment id unavailable</MessageBarTitle>
                  {envIdError} Available connections cannot be listed until this is resolved.
                </MessageBarBody>
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<ArrowClockwiseRegular />}
                  onClick={() => void resolveEnvId()}
                >
                  Retry
                </Button>
              </MessageBar>
            )}

            <Card className={styles.card}>
              {isRefsSectionLoading ? (
                <div className={styles.spinner}>
                  <Spinner size="medium" label="Loading connection references..." />
                </div>
              ) : refsError ? (
                <MessageBar intent="error">
                  <MessageBarBody>{refsError}</MessageBarBody>
                </MessageBar>
              ) : connectionRefs.length === 0 ? (
                <Text size={300}>No Request Center connection references found in this environment.</Text>
              ) : (
                connectionRefs.map((ref, idx) => {
                  const httpHelper = getHttpHelper(ref);
                  return (
                    <div key={ref.id}>
                      {idx > 0 && <Divider />}
                      <ConnectionReferenceRow
                        ref_={ref}
                        envId={envId}
                        availableConnections={availableConnectionsMap[ref.connectorId] ?? []}
                        selectedConnection={selectedConnections[ref.id] ?? ''}
                        connectionsLoadError={connectionsErrorMap[ref.connectorId]}
                        onSelectAndSave={(val) => {
                          setSelectedConnections((prev) => ({ ...prev, [ref.id]: val }));
                          void handleMapConnection(ref.id, val);
                        }}
                        onRefreshConnections={() => void handleRefreshConnector(ref.connectorId)}
                        isMapping={!!mappingInProgress[ref.id]}
                        mappingJustSucceeded={!!mappingSuccess[ref.id]}
                        hasMappingError={!!mappingError[ref.id]}
                        isRefreshing={!!refreshingConnectors[ref.connectorId]}
                        httpHelper={httpHelper}
                        onOpenHelper={
                          httpHelper
                            ? (makerUrl) =>
                                handleOpenHelper(
                                  ref.displayName,
                                  httpHelper.settings,
                                  makerUrl,
                                )
                            : undefined
                        }
                      />
                    </div>
                  );
                })
              )}
            </Card>
          </>
        )}
      </div>

      {/* ─── Cloud Flows ─────────────────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div
            className={styles.sectionToggle}
            role="button"
            tabIndex={0}
            aria-expanded={isFlowsExpanded}
            onClick={() => setIsFlowsExpanded((v) => !v)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsFlowsExpanded((v) => !v); } }}
          >
            {isFlowsExpanded ? (
              <ChevronDownRegular className={styles.chevron} />
            ) : (
              <ChevronRightRegular className={styles.chevron} />
            )}
            <CloudFlowRegular className={styles.sectionIcon} />
            <Text size={400} weight="semibold">
              Cloud Flows
            </Text>
          </div>
        </div>

        {isFlowsExpanded && (
          <>
            {!allRefsMapped && (
              <MessageBar intent="warning">
                <MessageBarBody>
                  Complete Step 1 first - all connection references must be mapped before turning on
                  flows.
                </MessageBarBody>
              </MessageBar>
            )}

            <Card className={styles.card}>
              {isLoadingFlows ? (
                <div className={styles.spinner}>
                  <Spinner size="medium" label="Loading cloud flows..." />
                </div>
              ) : flowsError ? (
                <MessageBar intent="error">
                  <MessageBarBody>{flowsError}</MessageBarBody>
                </MessageBar>
              ) : flows.length === 0 ? (
                <MessageBar intent="warning">
                  <MessageBarBody>
                    <MessageBarTitle>Flows not found</MessageBarTitle>
                    The Request Center cloud flows were not found. Please verify they are included in the
                    Dataverse solution.
                  </MessageBarBody>
                </MessageBar>
              ) : (
                flows.map((flow, idx) => (
                  <div key={flow.id}>
                    {idx > 0 && <Divider />}
                    <div className={styles.flowRow}>
                      <div className={styles.flowInfo}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS }}>
                          <Text weight="semibold">{flow.name}</Text>
                          <Tooltip
                            content={getFlowDescription(flow.name)}
                            relationship="description"
                            withArrow
                          >
                            <Button
                              appearance="subtle"
                              size="small"
                              icon={<Info16Regular />}
                              aria-label={`About ${flow.name}`}
                              style={{ minWidth: 'auto', padding: 0 }}
                            />
                          </Tooltip>
                        </div>
                      </div>
                      <Switch
                        checked={flow.isActivated}
                        disabled={flow.isActivated || !allRefsMapped || !!activatingFlows[flow.id]}
                        label={activatingFlows[flow.id] ? 'Turning on...' : flow.isActivated ? 'On' : 'Off'}
                        onChange={(_ev, data) => {
                          if (data.checked && !flow.isActivated) {
                            void handleActivateFlow(flow.id);
                          }
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </Card>
          </>
        )}

        {/* Data Sync Verification — always visible */}
        <div className={styles.syncStatus}>
            <div className={styles.sectionHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS }}>
                <Text size={300} weight="semibold">
                  Data Sync Status
                </Text>
                <Tooltip
                  content="Verifies that the Connectors and Connector Actions tables have been populated with data by the sync flows. Both tables must contain data for Request Center to work."
                  relationship="description"
                  withArrow
                >
                  <Button
                    appearance="subtle"
                    size="small"
                    icon={<Info16Regular />}
                    aria-label="About Data Sync Status"
                    style={{ minWidth: 'auto', padding: 0 }}
                  />
                </Tooltip>
              </div>
              <Button
                appearance="subtle"
                size="small"
                icon={<ArrowClockwiseRegular />}
                onClick={() => void handleCheckSync()}
                disabled={isCheckingSync}
              >
                Refresh
              </Button>
            </div>
            {isCheckingSync ? (
              <Spinner size="tiny" label="Checking..." />
            ) : syncStatus ? (
              <>
                <div className={styles.syncRow}>
                  {syncStatus.hasConnectorData ? (
                    <CheckmarkCircleRegular style={{ color: tokens.colorPaletteGreenForeground1 }} />
                  ) : (
                    <WarningRegular style={{ color: tokens.colorPaletteYellowForeground1 }} />
                  )}
                  <Text size={200}>
                    Connectors:{' '}
                    {syncStatus.hasConnectorData ? 'Success' : 'Pending'}
                  </Text>
                </div>
                <div className={styles.syncRow}>
                  {syncStatus.hasConnectorActionData ? (
                    <CheckmarkCircleRegular style={{ color: tokens.colorPaletteGreenForeground1 }} />
                  ) : (
                    <WarningRegular style={{ color: tokens.colorPaletteYellowForeground1 }} />
                  )}
                  <Text size={200}>
                    Connector Actions:{' '}
                    {syncStatus.hasConnectorActionData ? 'Success' : 'Pending'}
                  </Text>
                </div>
                {!syncStatus.allSynced && (
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    {isSyncFlowOn
                      ? "The 'Sync Connectors' flow is on and runs daily. To sync data immediately, open Power Automate and run it manually. Click Refresh to check again."
                      : "Turn on the 'Sync Connectors' flow above, then run it from Power Automate to sync data. Click Refresh to check again."}
                  </Text>
                )}
              </>
            ) : (
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                Click Refresh to verify that data has been synced.
              </Text>
            )}
          </div>
      </div>
    </>
  );

  if (embedded)
    return (
      <>
        {content}
        {helperDialog && (
          <ConnectionHelperDialog
            open
            displayName={helperDialog.displayName}
            settings={helperDialog.settings}
            makerPortalUrl={helperDialog.makerUrl}
            onClose={() => setHelperDialog(null)}
          />
        )}
      </>
    );
  return (
    <div className={layoutStyles.pageContainer}>
      {content}
      {helperDialog && (
        <ConnectionHelperDialog
          open
          displayName={helperDialog.displayName}
          settings={helperDialog.settings}
          makerPortalUrl={helperDialog.makerUrl}
          onClose={() => setHelperDialog(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: Connection Reference Row
// ─────────────────────────────────────────────────────────────────────────────

const useRowStyles = makeStyles({
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalS} 0`,
    flexWrap: 'wrap',
  },
  info: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    flex: '1 1 250px',
    minWidth: '200px',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  dropdown: {
    width: '320px',
  },
});

interface ConnectionReferenceRowProps {
  ref_: ConnectionReference;
  envId: string;
  availableConnections: AvailableConnection[];
  selectedConnection: string;
  /** When set, the available-connections fetch for this connector failed. */
  connectionsLoadError?: string;
  onSelectAndSave: (value: string) => void;
  onRefreshConnections: () => void;
  isMapping: boolean;
  /** True for the brief moment after a save completes (before list refresh resolves). */
  mappingJustSucceeded: boolean;
  hasMappingError: boolean;
  isRefreshing: boolean;
  /** Helper config when this row is one of the special HTTP-with-Entra-ID refs. */
  httpHelper?: { refKey: string; settings: ReadonlyArray<{ label: string; value: string }> } | null;
  /**
   * Invoked from the row when the user clicks "+ Create New Connection" for an
   * HTTP-with-Entra-ID ref. The helper dialog itself handles launching the
   * Power Apps connection screen so the user can read the URL values first.
   */
  onOpenHelper?: (makerUrl: string) => void;
}

/** Format date as short string (e.g., "May 13, 2026"). */
function formatDate(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

function ConnectionReferenceRow({
  ref_,
  envId,
  availableConnections,
  selectedConnection,
  connectionsLoadError,
  onSelectAndSave,
  onRefreshConnections,
  isMapping,
  mappingJustSucceeded,
  hasMappingError,
  isRefreshing,
  httpHelper,
  onOpenHelper,
}: ConnectionReferenceRowProps) {
  const rowStyles = useRowStyles();

  // Match by normalized 32-char compact hex. Dataverse persists the connection id without
  // hyphens/prefix; the API Hub returns it as a hyphenated GUID, prefixed string, or full path.
  // All forms encode the same trailing 32 hex characters.
  const selectedNorm = normalizeConnectionId(selectedConnection);
  const matchedConnection = selectedNorm
    ? availableConnections.find((c) => c.normalizedId === selectedNorm)
    : undefined;

  const hasDataverseMapping = !!ref_.connectionId;
  const isMappedAndVisible = !!matchedConnection;
  const isMappedButInvisible =
    hasDataverseMapping && !isMappedAndVisible && !connectionsLoadError;

  return (
    <div className={rowStyles.row}>
      <div className={rowStyles.info}>
        <Text weight="semibold">{ref_.displayName}</Text>
        {connectionsLoadError && (
          <MessageBar intent="error" style={{ marginTop: tokens.spacingVerticalXS }}>
            <MessageBarBody>
              <MessageBarTitle>Could not load connections</MessageBarTitle>
              {connectionsLoadError}
            </MessageBarBody>
            <Button
              appearance="subtle"
              size="small"
              icon={<ArrowClockwiseRegular />}
              onClick={onRefreshConnections}
              disabled={isRefreshing}
            >
              Retry
            </Button>
          </MessageBar>
        )}
      </div>

      <div className={rowStyles.actions}>
        <Dropdown
          className={rowStyles.dropdown}
          placeholder="Select a connection..."
          value={matchedConnection?.displayName ?? ''}
          selectedOptions={matchedConnection ? [matchedConnection.name] : []}
          disabled={isMapping}
          onOptionSelect={(_, data) => {
            const val = data.optionValue as string;
            if (val && val !== matchedConnection?.name) {
              onSelectAndSave(val);
            }
          }}
        >
          {availableConnections.length === 0 ? (
            <Option key="__none" value="" disabled>
              No connections available
            </Option>
          ) : (
            availableConnections.map((conn) => {
              const dateStr = formatDate(conn.createdTime);
              const label = dateStr ? `${conn.displayName} (${dateStr})` : conn.displayName;
              return (
                <Option key={conn.name} value={conn.name} text={label}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <Text size={200}>{label}</Text>
                    <Text
                      size={100}
                      style={{ color: tokens.colorNeutralForeground3 }}
                    >
                      {conn.status} · {conn.createdBy}
                    </Text>
                  </div>
                </Option>
              );
            })
          )}
        </Dropdown>

        {/* Status indicator: saving spinner / mapped check / save error / mapped-but-invisible */}
        {isMapping ? (
          <Spinner size="tiny" aria-label="Saving connection mapping..." />
        ) : hasMappingError ? (
          <Tooltip content="Failed to save - select again to retry" relationship="label" withArrow>
            <WarningRegular
              style={{ color: tokens.colorPaletteDarkOrangeForeground1, fontSize: '20px', cursor: 'help' }}
              aria-label="Mapping failed"
            />
          </Tooltip>
        ) : isMappedAndVisible || mappingJustSucceeded ? (
          <CheckmarkCircleRegular
            style={{ color: tokens.colorPaletteGreenForeground1, fontSize: '20px' }}
            aria-label="Connection mapped"
          />
        ) : isMappedButInvisible ? (
          <Tooltip
            content="This reference is mapped to a connection that is not visible to you in this environment. Pick a connection from the dropdown to remap it."
            relationship="label"
            withArrow
          >
            <WarningRegular
              style={{ color: tokens.colorPaletteDarkOrangeForeground1, fontSize: '20px', cursor: 'help' }}
              aria-label="Mapped to a connection not visible to you"
            />
          </Tooltip>
        ) : null}

        <Button
          appearance="subtle"
          size="small"
          icon={<ArrowClockwiseRegular />}
          onClick={onRefreshConnections}
          disabled={isRefreshing}
          title="Refresh connections for this connector"
          aria-label={`Refresh connections for ${ref_.displayName}`}
        />

        {envId && (() => {
          const makerUrl = buildNewConnectionUrl(envId, ref_.connectorId);
          const showHelper = !!httpHelper && !!onOpenHelper;
          // Render the SAME visual treatment for every row (Fluent Link with
          // an external-link icon) regardless of whether the click opens the
          // helper dialog or navigates straight to the Maker Portal. For
          // helper rows we keep the href so middle-click / right-click /
          // keyboard "open in new tab" still work as expected, but intercept
          // the default click to open the dialog instead.
          return (
            <Link
              href={makerUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={
                showHelper
                  ? (e) => {
                      e.preventDefault();
                      onOpenHelper!(makerUrl);
                    }
                  : undefined
              }
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <AddRegular fontSize={12} />
              Create New Connection
              <OpenRegular fontSize={12} />
            </Link>
          );
        })()}
      </div>
    </div>
  );
}

export default ConnectionHealthScreen;
