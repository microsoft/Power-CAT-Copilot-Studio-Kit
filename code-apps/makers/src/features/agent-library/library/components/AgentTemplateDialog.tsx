/**
 * AgentTemplateDialog — Single-view agent template dialog.
 *
 * Figma node: 1540:12011
 *
 * All sections visible in one scrollable view:
 *   Header (read-only) → Instructions (read-only) → Environment dropdown
 *   → Connect to data (inline) → Knowledge sources → Technology used
 *
 * Flow: select environment → privilege check → if OK: parallel bots + connections
 *       → Install button enabled when all connections resolved
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Dropdown,
  Field,
  Input,
  Link,
  makeStyles,
  Option,
  Spinner,
  tokens,
} from '@fluentui/react-components';
import {
  ArrowClockwise16Regular,
  CommentMultiple20Regular,
  Dismiss24Regular,
  Document20Regular,
  Flash20Regular,
  Flow20Regular,
  FormRegular,
  Globe20Regular,
  Link20Regular,
  PlugDisconnected20Regular,
  PlugConnected20Regular,
  Prompt20Regular,
  Rename20Regular,
  Table20Regular,
  TextDescription20Regular,
  Wrench20Regular,
} from '@fluentui/react-icons';
import JSZip from 'jszip';
import { ConnectionSetupView } from './ConnectionSetup';
import { DialogSection } from './DialogSection';
import { SquircleIcon } from './SquircleIcon';
import { AgentTypeBadge } from './AgentTypeBadge';
import { HelpMenu } from './HelpMenu';
import {
  resolveTemplateZipBase64,
  parseSolutionZipFromBase64,
  rewriteSolutionZip,
  blobToBase64,
} from '../services/SolutionZipService';
import type { SolutionMetadata, RewriteOptions } from '../services/SolutionZipService';
import { fetchConnectionsForConnectors } from '../services/ConnectionService';
import {
  checkInstallPrivilegeInOrg,
} from '../services/EnvironmentService';
import { useOrganizations } from '../hooks/useOrganizations';
import { parseCustomizations, parseConnectionReferences } from '../utils/customizationsParser';
import { resolveUniqueSchemaName, stripSchemaPrefix, sanitizeSolutionName } from '../utils/schemaHelpers';
import { useBots } from '../hooks/useBots';
import { useSolutions } from '../hooks/useSolutions';
import { installFromBase64 } from '../services/SolutionInstallService';
import type {
  AgentTemplateDialogProps,
  ConnectionSetupItem,
  ConnectionComponentParam,
  PowerAppsClient,
  SolutionConnectionReference,
} from '../contracts/types';
import { useAgentLibrary, useClient, useCloudType } from '../provider/AgentLibraryProvider';
import { buildCreateConnectionUrl } from '../utils/cloudUrls';

/** Maps technology tag names to their Fluent icons (per Figma). */
const TECH_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Connector: PlugDisconnected20Regular,
  Trigger: Flash20Regular,
  Topic: CommentMultiple20Regular,
  'Adaptive Cards': FormRegular,
  Prompt: Prompt20Regular,
  'MCP Server': Link20Regular,
  Workflow: Flow20Regular,
  Knowledge: Document20Regular,
  'Custom table': Table20Regular,
};

/**
 * Fetches connections for all connector types in the given refs, auto-selects
 * the most recently created connection per connector, and returns ConnectionSetupItem[].
 */
async function buildConnectionItems(
  client: PowerAppsClient,
  connectionRefs: SolutionConnectionReference[],
  orgUrl: string,
): Promise<ConnectionSetupItem[]> {
  const connectorNames = [...new Set(connectionRefs.map((r) => r.connectorName))];
  const connectionsMap = await fetchConnectionsForConnectors(client, connectorNames, orgUrl);
  return connectionRefs.map((ref) => {
    const available = connectionsMap.get(ref.connectorName) ?? [];
    const sorted = [...available].sort(
      (a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime(),
    );
    return {
      reference: ref,
      availableConnections: available,
      selectedConnectionId: sorted[0]?.connectionId ?? null,
      loading: false,
      error: null,
    };
  });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = makeStyles({
  surface: {
    maxWidth: '839px',
    width: '839px',
    borderRadius: tokens.borderRadiusXLarge,
    boxShadow: tokens.shadow16,
    paddingLeft: '24px',
    paddingRight: '24px',
    paddingTop: '24px',
    paddingBottom: '8px',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0',
    padding: '0',
  },
  titleRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '16px',
  },
  agentName: {
    fontSize: '24px',
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: '32px',
    color: tokens.colorNeutralForeground1,
    fontFamily: tokens.fontFamilyBase,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: '1 1 0',
    minWidth: 0,
    margin: 0,
  },
  agentBadge: {
    flexShrink: 0,
  },
  descriptionText: {
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightRegular,
    lineHeight: tokens.lineHeightBase300,
    color: '#424242',
    marginTop: '4px',
  },
  learnMoreLink: {
    color: '#01678c',
    fontSize: tokens.fontSizeBase300,
  },
  dismissButton: {
    flexShrink: 0,
  },
  content: {
    overflowY: 'auto',
    maxHeight: 'calc(100vh - 280px)',
    paddingRight: '2px',
    paddingBottom: '16px',
    paddingTop: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  /* Instructions formatted box */
  instructionsBox: {
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 0 0 3px rgba(98,70,234,0.1)',
    paddingLeft: '20px',
    paddingRight: '20px',
    paddingTop: '17px',
    paddingBottom: '17px',
    fontSize: tokens.fontSizeBase300,
    lineHeight: '22.75px',
    color: '#101828',
  },
  connectorPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    borderTopWidth: '0.571px',
    borderRightWidth: '0.571px',
    borderBottomWidth: '0.571px',
    borderLeftWidth: '0.571px',
    borderTopStyle: 'solid',
    borderRightStyle: 'solid',
    borderBottomStyle: 'solid',
    borderLeftStyle: 'solid',
    borderTopColor: '#d1d5dc',
    borderRightColor: '#d1d5dc',
    borderBottomColor: '#d1d5dc',
    borderLeftColor: '#d1d5dc',
    borderRadius: '20px',
    paddingLeft: '12px',
    paddingRight: '12px',
    paddingTop: '2px',
    paddingBottom: '2px',
    verticalAlign: 'middle',
    marginLeft: '2px',
    marginRight: '2px',
  },
  connectorPillIcon: {
    fontSize: '16px',
    color: '#464feb',
    flexShrink: 0,
  },
  connectorPillText: {
    fontSize: '13px',
    fontWeight: tokens.fontWeightSemibold,
    color: '#464feb',
    whiteSpace: 'nowrap',
  },
  envDropdown: {
    minWidth: '200px',
    width: '100%',
  },
  privilegeError: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorPaletteRedForeground1,
    marginTop: '4px',
  },
  /* Knowledge sources */
  knowledgeField: {
    width: '100%',
  },
  /* Technology badges */
  techBadgesRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  techBadge: {
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
  techBadgeIcon: {
    fontSize: '16px',
    color: '#616161',
  },
  /* Footer */
  footerActions: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: '16px',
    paddingBottom: '12px',
  },
  footerRight: {
    display: 'flex',
    gap: '8px',
  },
  footerLeft: {
    display: 'flex',
  },
  /* Section label for Technology used (no icon) */
  techSectionLabel: {
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
    marginBottom: '8px',
  },
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const AgentTemplateDialog: React.FC<AgentTemplateDialogProps> = ({ item, onClose, onSuccess, onInstallStart, onInstallProgress }) => {
  const styles = useStyles();
  const { environmentId, userEmail } = useAgentLibrary();
  const client = useClient();
  const cloudType = useCloudType();

  // ZIP pre-fetch state
  const [pendingZipBase64, setPendingZipBase64] = useState<string | null>(null);
  const [parsedZip, setParsedZip] = useState<JSZip | null>(null);
  const [parsedMetadata, setParsedMetadata] = useState<SolutionMetadata | null>(null);
  const [connectionRefs, setConnectionRefs] = useState<SolutionConnectionReference[]>([]);

  // Environment state — org list is cached via React Query (10 min staleTime)
  const { data: organizations = [] } = useOrganizations();
  const [selectedOrgUrl, setSelectedOrgUrl] = useState<string>('');
  const [targetEnvId, setTargetEnvId] = useState<string>(environmentId);

  // Privilege state
  const [hasTargetPrivilege, setHasTargetPrivilege] = useState<boolean>(false);
  const [privilegeChecking, setPrivilegeChecking] = useState<boolean>(false);
  const [zipHasRoles, setZipHasRoles] = useState<boolean>(false);
  const [currentEnvName, setCurrentEnvName] = useState<string>('');

  // Seed the current env name from the cached orgs list as soon as it's available,
  // so the dropdown label doesn't wait on the privilege check network round-trip.
  // The privilege check may later overwrite this with the same value (idempotent).
  useEffect(() => {
    if (currentEnvName) return;
    const match = organizations.find((o) => o.EnvironmentId === environmentId);
    if (match?.FriendlyName) {
      setCurrentEnvName(match.FriendlyName);
    }
  }, [organizations, environmentId, currentEnvName]);

  // Connection state
  const [connectionItems, setConnectionItems] = useState<ConnectionSetupItem[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(false);

  // Knowledge source values
  const [knowledgeValues, setKnowledgeValues] = useState<Map<string, string>>(new Map());
  const [knowledgeValidation, setKnowledgeValidation] = useState<Map<string, 'valid' | 'invalid' | 'idle'>>(new Map());

  // Bots from target environment (for schema dedup)
  const { bots, loading: botsLoading } = useBots(
    hasTargetPrivilege ? selectedOrgUrl : undefined,
  );

  // Solutions from target environment (for solution name dedup)
  const { solutions, loading: solutionsLoading } = useSolutions(
    hasTargetPrivilege ? selectedOrgUrl : undefined,
  );

  // Derive resolved schema name reactively from bots
  const resolvedSchemaName = useMemo(() => {
    if (!parsedMetadata) return '';
    const baseName = stripSchemaPrefix(
      parsedMetadata.agentSchemaName,
      parsedMetadata.publisherPrefix,
    );
    const baseSchema = `${parsedMetadata.publisherPrefix}_${baseName}`;
    const existingSchemas = bots.map((b) => b.schemaname).filter(Boolean);
    const resolved = resolveUniqueSchemaName(baseSchema, existingSchemas);
    console.log('[AgentTemplateDialog] Schema dedup:', {
      originalSchemaName: parsedMetadata.agentSchemaName,
      baseSuffix: baseName,
      baseSchema,
      existingBotSchemas: existingSchemas,
      resolvedSchemaName: resolved,
      changed: resolved !== baseSchema,
    });
    return resolved;
  }, [parsedMetadata, bots]);

  // Derive resolved solution unique name — same _2, _3 pattern, against existing solution names
  const resolvedSolutionName = useMemo(() => {
    if (!parsedMetadata) return '';
    const baseName = sanitizeSolutionName(item.name);
    const existingSolutionNames = solutions.map((s) => s.uniquename).filter(Boolean);
    const resolved = resolveUniqueSchemaName(baseName, existingSolutionNames);
    console.log('[AgentTemplateDialog] Solution name dedup:', {
      originalName: item.name,
      sanitized: baseName,
      existingSolutionNames,
      resolvedSolutionName: resolved,
    });
    return resolved;
  }, [parsedMetadata, solutions, item.name]);

  // -----------------------------------------------------------------------
  // On mount: pre-fetch ZIP (organizations are fetched via useOrganizations hook)
  // -----------------------------------------------------------------------
  useEffect(() => {
    resolveTemplateZipBase64(client, item)
      .then(async (base64) => {
        setPendingZipBase64(base64);
        const { zip, metadata } = await parseSolutionZipFromBase64(base64);
        setParsedZip(zip);
        setParsedMetadata(metadata);
        const { connectionReferences, hasSecurityRoles } = await parseCustomizations(zip);
        setConnectionRefs(connectionReferences);
        setZipHasRoles(hasSecurityRoles);
        console.log('[AgentTemplateDialog] ZIP parsed, connections:', connectionReferences.length, 'hasRoles:', hasSecurityRoles);
      })
      .catch((err) => console.warn('[AgentTemplateDialog] ZIP pre-fetch failed:', err));
  }, [item.zipUrl, item.getZipBytes, client]);

  // -----------------------------------------------------------------------
  // Auto-select current environment once orgs + userEmail are ready
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (organizations.length > 0 && userEmail && !selectedOrgUrl) {
      // Default to 'current' environment
      setSelectedOrgUrl('current');
    }
  }, [organizations, userEmail, selectedOrgUrl]);

  // -----------------------------------------------------------------------
  // Environment selection → privilege check FIRST, then parallel bots + connections
  // -----------------------------------------------------------------------
  const handleEnvironmentChange = useCallback(
    async (_ev: unknown, data: { optionValue?: string }) => {
      const orgUrl = data.optionValue ?? 'current';
      setSelectedOrgUrl(orgUrl);
      setHasTargetPrivilege(false);
      setConnectionItems([]);
      setPrivilegeChecking(true);
      setConnectionsLoading(false);

      try {
        // Step 1: Check privilege FIRST
        const privilegeResult = await checkInstallPrivilegeInOrg(client, orgUrl, userEmail, zipHasRoles);
        setHasTargetPrivilege(privilegeResult.hasPrivilege);
        setTargetEnvId(privilegeResult.environmentId ?? '');
        if (orgUrl === 'current' && privilegeResult.environmentName) {
          setCurrentEnvName(privilegeResult.environmentName);
        }
        setPrivilegeChecking(false);

        console.log('[AgentTemplateDialog] Environment selected:', {
          orgUrl,
          hasPrivilege: privilegeResult.hasPrivilege,
          environmentId: privilegeResult.environmentId,
          connectionRefsCount: connectionRefs.length,
        });

        if (!privilegeResult.hasPrivilege) {
          // No privilege — don't fetch connections or bots
          return;
        }

        // Step 2: Privilege OK → fetch connections in parallel
        // (useBots fires automatically via hook since hasTargetPrivilege is now true)
        if (connectionRefs.length > 0) {
          setConnectionsLoading(true);
          const items = await buildConnectionItems(client, connectionRefs, orgUrl);
          setConnectionItems(items);
          setConnectionsLoading(false);
        }
      } catch (err) {
        console.warn('[AgentTemplateDialog] Environment check failed:', err);
        setHasTargetPrivilege(false);
        setPrivilegeChecking(false);
      }
    },
    [client, userEmail, connectionRefs],
  );

  // Auto-trigger env check when selectedOrgUrl is set for the first time (current env)
  useEffect(() => {
    if (selectedOrgUrl && userEmail) {
      void handleEnvironmentChange(null, { optionValue: selectedOrgUrl });
    }
    // Only run when selectedOrgUrl first becomes non-empty
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgUrl]);

  // -----------------------------------------------------------------------
  // Re-fetch connections when ZIP finishes parsing (connectionRefs populated)
  // AND we already have privilege in the selected environment
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (
      connectionRefs.length > 0 &&
      hasTargetPrivilege &&
      selectedOrgUrl &&
      connectionItems.length === 0 &&
      !connectionsLoading
    ) {
      const fetchConnections = async () => {
        setConnectionsLoading(true);
        try {
          console.log('[AgentTemplateDialog] Late connection fetch for:', selectedOrgUrl);
          const items = await buildConnectionItems(client, connectionRefs, selectedOrgUrl);
          setConnectionItems(items);
        } catch (err) {
          console.warn('[AgentTemplateDialog] Late connection fetch failed:', err);
        } finally {
          setConnectionsLoading(false);
        }
      };
      void fetchConnections();
    }
  }, [client, connectionRefs, hasTargetPrivilege, selectedOrgUrl, connectionItems.length, connectionsLoading]);

  // -----------------------------------------------------------------------
  // Connection handlers
  // -----------------------------------------------------------------------
  const handleConnectionChange = useCallback((logicalName: string, connectionId: string) => {
    setConnectionItems((prev) =>
      prev.map((ci) =>
        ci.reference.logicalName === logicalName ? { ...ci, selectedConnectionId: connectionId } : ci,
      ),
    );
  }, []);

  const handleRefreshConnections = useCallback(async () => {
    if (!selectedOrgUrl || connectionRefs.length === 0) return;
    setConnectionsLoading(true);
    try {
      const items = await buildConnectionItems(client, connectionRefs, selectedOrgUrl);
      setConnectionItems(items);
    } catch (err) {
      console.warn('[AgentTemplateDialog] Refresh connections failed:', err);
    } finally {
      setConnectionsLoading(false);
    }
  }, [client, connectionRefs, selectedOrgUrl]);

  const handleCreateConnection = useCallback(
    (connectorName: string) => {
      const envId = targetEnvId || environmentId;
      if (envId) {
        const url = buildCreateConnectionUrl(cloudType, envId, connectorName);
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    },
    [targetEnvId, environmentId, cloudType],
  );

  // -----------------------------------------------------------------------
  // Knowledge source handler + SharePoint URL validation
  // -----------------------------------------------------------------------
  const handleKnowledgeChange = useCallback((label: string, kind: string, value: string) => {
    setKnowledgeValues((prev) => {
      const next = new Map(prev);
      next.set(label, value);
      return next;
    });

    const trimmed = value.trim();
    if (!trimmed) {
      setKnowledgeValidation((prev) => { const n = new Map(prev); n.set(label, 'idle'); return n; });
      return;
    }

    if (kind === 'SharePointSearchSource') {
      const SP_URL_PATTERN = /^https:\/\/[a-zA-Z0-9-]+\.(sharepoint\.com|sharepoint-df\.com|sharepointonline\.com)\/[^?#]+$/i;
      const isValid = SP_URL_PATTERN.test(trimmed) && !/\.aspx(\b|$)/i.test(trimmed);
      setKnowledgeValidation((prev) => { const n = new Map(prev); n.set(label, isValid ? 'valid' : 'invalid'); return n; });
    } else if (kind === 'PublicSiteSearchSource') {
      const PUBLIC_URL_PATTERN = /^https?:\/\/[a-zA-Z0-9-]+(\.[a-zA-Z]{2,})+\/?.*$/i;
      setKnowledgeValidation((prev) => { const n = new Map(prev); n.set(label, PUBLIC_URL_PATTERN.test(trimmed) ? 'valid' : 'invalid'); return n; });
    }
  }, []);

  // -----------------------------------------------------------------------
  // Shared: rewrite ZIP with resolved schema + solution name (and optional
  // SharePoint URL override for templates that expose a SharePointSearchSource
  // knowledge field — e.g. companyPolicyQa CA)
  // -----------------------------------------------------------------------
  const buildRewrittenZip = useCallback(async (): Promise<Blob> => {
    if (!parsedZip || !parsedMetadata) throw new Error('ZIP not parsed yet');

    // Pull the first valid SharePoint URL out of knowledge inputs (if any).
    // Install is allowed even when no URL is provided; the rewrite path is
    // simply skipped and the template's default site URL is preserved.
    let sharePointUrl: string | undefined;
    for (const source of item.knowledgeSources ?? []) {
      if (source.kind !== 'SharePointSearchSource') continue;
      const value = (knowledgeValues.get(source.label) ?? '').trim();
      if (value && knowledgeValidation.get(source.label) === 'valid') {
        sharePointUrl = value;
        break;
      }
    }

    const rewriteOptions: RewriteOptions = {
      newAgentSchemaName: resolvedSchemaName,
      newSolutionUniqueName: resolvedSolutionName,
      targetPublisherPrefix: parsedMetadata.publisherPrefix,
      sharePointUrl,
    };

    console.log('[AgentTemplateDialog] Rewriting ZIP:', rewriteOptions);
    return rewriteSolutionZip(parsedZip, parsedMetadata, rewriteOptions);
  }, [parsedZip, parsedMetadata, resolvedSchemaName, resolvedSolutionName, item.knowledgeSources, knowledgeValues, knowledgeValidation]);

  // -----------------------------------------------------------------------
  // Download handler — rewrite ZIP and trigger browser download
  // -----------------------------------------------------------------------
  const handleDownload = useCallback(async () => {
    // Built-in templates expose a public zipUrl — open it directly.
    if (item.zipUrl) {
      window.open(item.zipUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    // Consumer-injected (custom) templates supply the ZIP bytes via getZipBytes
    // (e.g. a Dataverse file column) — resolve them and trigger a download.
    if (item.getZipBytes) {
      const bytes = await item.getZipBytes();
      const blob = new Blob([bytes as BlobPart], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      const baseName = (item.templateFileName || item.name || 'agent-template').replace(/\.zip$/i, '');
      anchor.download = `${baseName}.zip`;
      anchor.click();
      URL.revokeObjectURL(url);
    }
  }, [item.zipUrl, item.getZipBytes, item.templateFileName, item.name]);

  // -----------------------------------------------------------------------
  // Install handler — close dialog, hand off import to page-level banner
  // -----------------------------------------------------------------------
  const currentEnvLabel = currentEnvName ? `Current environment (${currentEnvName})` : 'Current environment';

  const handleInstall = useCallback(async () => {
    if (!parsedZip || !parsedMetadata) return;

    // Resolve environment display name for the banner
    const envName = selectedOrgUrl === 'current'
      ? currentEnvLabel
      : organizations.find((o) => o.Url === selectedOrgUrl)?.FriendlyName ?? selectedOrgUrl;

    // Build the import promise (but don't await — page will track it)
    const importPromise = (async (): Promise<{ success: boolean; errorMessage?: string }> => {
      try {
        const rewrittenBlob = await buildRewrittenZip();
        const rewrittenBase64 = await blobToBase64(rewrittenBlob);

        // Re-parse connection refs from rewritten ZIP (logical names may change)
        let finalParams: ConnectionComponentParam[] = [];
        if (connectionItems.length > 0) {
          const rewrittenZip = await JSZip.loadAsync(rewrittenBlob);
          const rewrittenRefs = await parseConnectionReferences(rewrittenZip);

          finalParams = rewrittenRefs
            .map((ref) => {
              const matchingItem = connectionItems.find(
                (ci) => ci.reference.connectorName === ref.connectorName,
              );
              return {
                '@odata.type': 'Microsoft.Dynamics.CRM.connectionreference' as const,
                connectionreferencelogicalname: ref.logicalName,
                connectionreferencedisplayname: ref.displayName,
                connectorid: ref.connectorId,
                connectionid: matchingItem?.selectedConnectionId ?? '',
              };
            })
            .filter((p) => p.connectionid !== '');
        }

        return await installFromBase64(
          client,
          rewrittenBase64,
          crypto.randomUUID(),
          finalParams.length > 0 ? finalParams : undefined,
          selectedOrgUrl,
          onInstallProgress,
        );
      } catch (err) {
        return { success: false, errorMessage: err instanceof Error ? err.message : 'Import failed.' };
      }
    })();

    // Close dialog immediately and hand off to page
    if (onInstallStart) {
      onInstallStart({
        envName,
        solutionName: resolvedSolutionName,
        schemaName: resolvedSchemaName,
        orgUrl: selectedOrgUrl,
        targetEnvironmentId: targetEnvId || environmentId,
        importPromise,
      });
    } else {
      // Fallback: wait for result in-dialog (shouldn't happen with new wiring)
      const result = await importPromise;
      if (result.success) {
        onSuccess?.(`"${resolvedSolutionName}" installed successfully in ${envName}.`);
      }
    }
  }, [client, parsedZip, parsedMetadata, connectionItems, buildRewrittenZip, selectedOrgUrl, organizations, resolvedSchemaName, resolvedSolutionName, onInstallStart, onInstallProgress, onSuccess]);

  // -----------------------------------------------------------------------
  // Install button disabled logic
  // -----------------------------------------------------------------------
  const allConnectionsResolved = connectionRefs.length === 0 ||
    connectionItems.every((ci) => ci.selectedConnectionId);

  const installDisabled =
    !pendingZipBase64 ||
    !selectedOrgUrl ||
    privilegeChecking ||
    !hasTargetPrivilege ||
    !allConnectionsResolved ||
    connectionsLoading ||
    botsLoading ||
    solutionsLoading;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  const hasKnowledgeSources = (item.knowledgeSources?.length ?? 0) > 0;
  const hasTechnologyUsed = (item.technologyUsed?.length ?? 0) > 0;
  const showConnections = hasTargetPrivilege && connectionRefs.length > 0 && !privilegeChecking;

  return (
    <Dialog open>
      <DialogSurface className={styles.surface}>
        <DialogBody className={styles.body}>
          {/* ============================================================= */}
          {/* HEADER — read-only title + description + Agent badge          */}
          {/* ============================================================= */}
          <DialogTitle as="div">
            <div className={styles.titleRow}>
              <SquircleIcon
                iconGradient={item.iconGradient}
                iconSvg={item.iconSvg}
                iconName={item.icon}
                iconColor={item.iconColor}
                size={48}
              />
              <span className={styles.agentName}>{item.name}</span>
              <AgentTypeBadge label="Custom Agent" />
              <Button
                className={styles.dismissButton}
                appearance="subtle"
                shape="circular"
                size="small"
                icon={<Dismiss24Regular />}
                onClick={onClose}
                aria-label="Close dialog"
              />
            </div>
          </DialogTitle>

          {/* ============================================================= */}
          {/* CONTENT                                                       */}
          {/* ============================================================= */}
          <DialogContent className={styles.content}>
                {/* ─── DESCRIPTION (read-only) ─── */}
                <DialogSection icon={<TextDescription20Regular />} label="Description">
                  <div style={{ lineHeight: '20px', fontSize: '14px', color: '#101828' }}>
                    {item.description}
                    {item.learnMoreUrl && (
                      <>
                        {' '}
                        <Link className={styles.learnMoreLink} href={item.learnMoreUrl} target="_blank" rel="noopener noreferrer">
                          Learn more
                        </Link>
                      </>
                    )}
                  </div>
                </DialogSection>

                {/* ─── KNOWLEDGE SOURCES (before Environment — only for templates with knowledge) ─── */}
                {hasKnowledgeSources && (
                  <DialogSection icon={<Rename20Regular />} label="Knowledge">
                    {item.knowledgeSources!.map((source) => {
                      const validation = knowledgeValidation.get(source.label) ?? 'idle';
                      return (
                        <div key={source.label}>
                          <Field
                            className={styles.knowledgeField}
                            label={`${source.label}${source.required ? ' *' : ''}`}
                            validationState={validation === 'invalid' ? 'error' : undefined}
                            validationMessage={
                              validation === 'invalid'
                                ? source.kind === 'SharePointSearchSource'
                                  ? 'SharePoint site not valid'
                                  : 'Invalid URL'
                                : undefined
                            }
                          >
                            <Input
                              placeholder={source.placeholder}
                              value={knowledgeValues.get(source.label) ?? ''}
                              onChange={(_e, data) => handleKnowledgeChange(source.label, source.kind, data.value)}
                            />
                          </Field>
                        </div>
                      );
                    })}
                  </DialogSection>
                )}

                {/* ─── ENVIRONMENT DROPDOWN ─── */}
                <DialogSection icon={<Globe20Regular />} label="Environment">
                  <Dropdown
                    className={styles.envDropdown}
                    placeholder="Select target environment"
                    value={
                      selectedOrgUrl === 'current'
                        ? currentEnvLabel
                        : organizations.find((o) => o.Url === selectedOrgUrl)?.FriendlyName ?? selectedOrgUrl
                    }
                    selectedOptions={[selectedOrgUrl]}
                    onOptionSelect={handleEnvironmentChange}
                    disabled={organizations.length === 0}
                  >
                    <Option key="current" value="current" text={currentEnvLabel}>
                      {currentEnvLabel}
                    </Option>
                    {organizations
                      .filter((org) => org.Url && org.Url.toLowerCase() !== 'current')
                      .sort((a, b) => (a.FriendlyName ?? a.Url).localeCompare(b.FriendlyName ?? b.Url))
                      .map((org) => (
                        <Option
                          key={org.Url}
                          value={org.Url}
                          text={org.FriendlyName ?? org.Url}
                        >
                          {org.FriendlyName ?? org.Url}
                        </Option>
                      ))}
                  </Dropdown>
                  {privilegeChecking && (
                    <Spinner size="tiny" label="Checking permissions..." />
                  )}
                  {!privilegeChecking && !hasTargetPrivilege && selectedOrgUrl && (
                    <div className={styles.privilegeError}>
                      {zipHasRoles
                        ? "This template includes security roles, which require the System Administrator role to install. Ask your admin to assign you this role for the selected environment, or choose an environment where you already have it."
                        : "You need the System Customizer or System Admin role in this environment to install the template solution. Contact your admin or select a different environment"}
                    </div>
                  )}
                </DialogSection>

                {/* ─── CONNECT TO DATA (inline) ─── */}
                {showConnections && (
                  <DialogSection
                    icon={<PlugConnected20Regular />}
                    label="Connect to data"
                    action={
                      <Button
                        appearance="transparent"
                        size="small"
                        icon={<ArrowClockwise16Regular />}
                        onClick={() => void handleRefreshConnections()}
                        disabled={connectionsLoading}
                        aria-label="Refresh connections"
                        style={{ minWidth: 'auto', padding: 0 }}
                      />
                    }
                  >
                    {connectionsLoading ? (
                      <Spinner size="small" label="Loading connections..." />
                    ) : (
                      <ConnectionSetupView
                        items={connectionItems}
                        onConnectionChange={handleConnectionChange}
                        onCreateConnection={handleCreateConnection}
                      />
                    )}
                  </DialogSection>
                )}

                {/* ─── TECHNOLOGY USED ─── */}
                {hasTechnologyUsed && (
                  <DialogSection icon={<Wrench20Regular />} label="Technology used">
                    <div className={styles.techBadgesRow}>
                      {item.technologyUsed!.map((tech) => {
                        const TechIcon = TECH_ICON_MAP[tech] ?? Prompt20Regular;
                        return (
                        <span key={tech} className={styles.techBadge}>
                          <TechIcon className={styles.techBadgeIcon} aria-hidden="true" />
                          {tech}
                        </span>
                        );
                      })}
                    </div>
                  </DialogSection>
                )}
          </DialogContent>

          {/* ============================================================= */}
          {/* FOOTER — Install + Download                                   */}
          {/* ============================================================= */}
          <DialogActions className={styles.footerActions}>
            <div className={styles.footerLeft}>
              <HelpMenu />
            </div>
            <div className={styles.footerRight}>
              <Button
                appearance="primary"
                onClick={() => void handleInstall()}
                disabled={installDisabled}
              >
                Install
              </Button>
              <Button
                appearance="secondary"
                onClick={() => void handleDownload()}
                disabled={!item.zipUrl && !item.getZipBytes}
              >
                Download
              </Button>
            </div>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};

export default AgentTemplateDialog;
