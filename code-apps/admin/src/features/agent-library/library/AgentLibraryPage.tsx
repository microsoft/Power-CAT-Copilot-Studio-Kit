/**
 * AgentLibraryPage — Root page for the Agent Library feature (Phase 2).
 *
 * Merges agent templates and components into a unified gallery with
 * type tabs (All / Templates / Components) and category filtering.
 * Preserves all Phase 1 install/detection/privilege logic for components.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  makeStyles,
  tokens,
  Title1,
  Body1,
  Button,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import { Add20Regular } from '@fluentui/react-icons';
import { useAgentLibrary, useUserRole, useCloudType } from './provider/AgentLibraryProvider';
import GalleryFilters from './components/GalleryFilters';
import type { TemplateFilterValue } from './components/TemplateFilter';
import ComponentGallery from './components/ComponentGallery';
import ActionBar from './components/ActionBar';
import { useComponentCatalog } from './hooks/useComponentCatalog';
import { useMcpAppCatalog } from './hooks/useMcpAppCatalog';
import { installSolution as installSolutionService } from './services/SolutionInstallService';
import { useClient } from './provider/AgentLibraryProvider';
import { useInstalledSolutions } from './hooks/useInstalledSolutions';
import { useUserInstallPrivilege } from './hooks/useUserInstallPrivilege';
import { filterCatalogItems } from './utils/filterComponents';
import { agentTemplateCatalog, ICON_GRADIENTS } from './data/agentTemplateCatalog';
import type {
  InstallState,
  ComponentWithInstallState,
  CatalogItem,
  AgentTemplate,
} from './contracts/types';
import { GALLERY_CATEGORY_FILTERS } from './contracts/types';
import { getCloudUrls } from './utils/cloudUrls';

// Lazy imports for dialogs — created in later tasks
import AgentTemplateDialog from './components/AgentTemplateDialog';
import ComponentDialog from './components/ComponentDialog';
import InstallProgressDialog from './components/InstallProgressDialog';
import DeclarativeAgentDialog from './components/DeclarativeAgentDialog';
import NewTemplateDialog from './components/NewTemplateDialog';
import McpAppDialog from './components/McpAppDialog';

/** Auto-dismiss delay for success messages (ms). */
const SUCCESS_DISMISS_MS = 5_000;

/** Default squircle gradient applied to consumer-injected templates without one. */
const CUSTOM_TEMPLATE_GRADIENT = ICON_GRADIENTS.lavender;

/**
 * Fills in display-only defaults for consumer-injected (e.g. Dataverse-sourced)
 * templates that may not carry static-catalog fields like icon, gradient, or
 * category. Built-in catalog items already have all fields set and skip this.
 * Always marks the template `source: 'custom'` so it renders the Custom chip
 * and the admin edit affordance.
 */
function withTemplateDefaults(t: AgentTemplate): AgentTemplate {
  return {
    ...t,
    // These always win — consumer objects may carry undefined values that would
    // otherwise lose to the defaults if spread the other way around.
    type: 'template',
    source: 'custom',
    icon: t.icon ?? '',
    iconColor: t.iconColor ?? '',
    iconGradient: t.iconGradient ?? CUSTOM_TEMPLATE_GRADIENT,
    agentType: (t.agentType?.toLowerCase() as AgentTemplate['agentType']) ?? 'custom',
  };
}

interface InstallMessage {
  text: string;
  intent: 'info' | 'success' | 'error';
}

const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    paddingTop: '24px',
    paddingBottom: '24px',
    paddingLeft: '5%',
    maxWidth: '1280px',
    minHeight: '100%',
  },
  pageHeader: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '16px',
  },
  headerText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  subtitleText: {
    color: tokens.colorNeutralForeground2,
  },
  newTemplateButton: {
    marginTop: '8px',
  },
});

export default function AgentLibraryPage() {
  const styles = useStyles();
  const {
    environmentId,
    templateId,
    host,
    agentTemplates,
    onCreateTemplate,
    onUpdateTemplate,
    onDeleteTemplate,
  } = useAgentLibrary();
  const client = useClient();
  const cloudType = useCloudType();
  const { copilotStudio: copilotStudioBaseUrl } = getCloudUrls(cloudType);
  const userRole = useUserRole();
  const isAdmin = userRole === 'admin';
  // Admin authoring affordances render only when the host wired persistence.
  const canCreate = isAdmin && !!onCreateTemplate;
  const canEdit = isAdmin && !!onUpdateTemplate;
  const canDelete = isAdmin && !!onDeleteTemplate;

  // Phase 2 filter state
  const [selectedTab, setSelectedTab] = useState<string>('templates');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  // Templates-tab "All templates" multi-select filter (source / agent type / specific templates).
  const [templateFilter, setTemplateFilter] = useState<TemplateFilterValue>({
    sources: [],
    agentTypes: [],
  });
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  // True when the dialog was opened via `templateId` deep link (skips Build Options for DA)
  const [openedViaDeepLink, setOpenedViaDeepLink] = useState(false);
  // Admin-only "New Template" authoring dialog (UI only — no backend yet)
  const [newTemplateOpen, setNewTemplateOpen] = useState(false);
  // Admin-only "Edit Template" dialog — holds the template being edited (UI only)
  const [editTemplateItem, setEditTemplateItem] = useState<CatalogItem | null>(null);

  // Phase 1 install state (preserved)
  const [localInstallStateMap, setLocalInstallStateMap] = useState<ReadonlyMap<string, InstallState>>(
    new Map(),
  );
  const [installMessage, setInstallMessage] = useState<InstallMessage | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Install progress dialog state
  const [progressDialog, setProgressDialog] = useState<{
    open: boolean;
    type: 'template' | 'component';
    status: 'installing' | 'installed' | 'error';
    progress: number;
    errorMessage?: string;
    launchUrl?: string;
  }>({ open: false, type: 'template', status: 'installing', progress: 0 });

  const { data: catalog } = useComponentCatalog();
  const { data: mcpApps } = useMcpAppCatalog();
  const { hasPrivilege } = useUserInstallPrivilege();

  // Catalog-derived names for solution detection
  const solutionNames = useMemo(
    () => catalog.map((c) => c.solutionUniqueName),
    [catalog],
  );
  const componentNames = useMemo(
    () => catalog.map((c) => c.copilotStudioComponentName),
    [catalog],
  );

  // Solution detection
  const { data: detectionData } = useInstalledSolutions(solutionNames, componentNames);

  // Merge server detection with local install state overrides
  const installStateMap = useMemo(() => {
    const merged = new Map<string, InstallState>();
    for (const c of catalog) {
      const localState = localInstallStateMap.get(c.id);
      if (localState) {
        merged.set(c.id, localState);
        continue;
      }

      const isDetectedInstalled = detectionData?.installedNames.has(c.solutionUniqueName) ?? false;
      if (isDetectedInstalled) {
        const installedVersion = detectionData?.installedVersions.get(c.solutionUniqueName) ?? '0';
        const catalogVersion = c.solutionVersion;
        const isUpToDate = installedVersion >= catalogVersion;
        merged.set(c.id, isUpToDate ? 'installed' : 'not-installed');
      }
    }
    return merged;
  }, [catalog, detectionData, localInstallStateMap]);

  // Components with install state
  const components: ComponentWithInstallState[] = useMemo(
    () => catalog.map((c) => ({
      ...c,
      installState: installStateMap.get(c.id) ?? 'not-installed' as InstallState,
    })),
    [catalog, installStateMap],
  );

  // Resolve host-scoped display overrides, then build the unified catalog.
  // Templates whose `hosts` array excludes the current host are filtered out here
  // (components are always shown — no per-host filtering). If `host` is undefined,
  // no filtering is applied (backward compatible).
  const effectiveAgentTemplates = useMemo(() => {
    return agentTemplateCatalog
      .filter((t) => !host || !t.hosts || t.hosts.includes(host))
      .map((t) => {
        const override = host ? t.hostOverrides?.[host] : undefined;
        return override ? { ...t, ...override } : t;
      });
  }, [host]);

  // Consumer-injected custom templates (e.g. from Dataverse), normalized with
  // display defaults and prepended ahead of the built-in static catalog.
  const customAgentTemplates = useMemo(
    () => (agentTemplates ?? []).map(withTemplateDefaults),
    [agentTemplates],
  );

  const allItems: CatalogItem[] = useMemo(
    () => [
      ...customAgentTemplates,
      ...effectiveAgentTemplates,
      ...components.map((c) => ({ ...c, type: 'component' as const })),
      ...mcpApps,
    ],
    [customAgentTemplates, effectiveAgentTemplates, components, mcpApps],
  );

  // Auto-open item when templateId is provided by the host app
  const hasAutoOpened = useRef(false);
  useEffect(() => {
    if (!templateId || hasAutoOpened.current || allItems.length === 0) return;
    const match = allItems.find((item) => item.id === templateId);
    if (match) {
      setSelectedItem(match);
      setOpenedViaDeepLink(true);
      hasAutoOpened.current = true;
    }
  }, [templateId, allItems]);

  // Items visible under the current tab (category filter not yet applied).
  // Recomputes only when the catalog or the tab changes — not on category change.
  const itemsForTab = useMemo(
    () => filterCatalogItems(allItems, selectedTab, ''),
    [allItems, selectedTab],
  );

  // Categories present under the current tab, used to populate the dropdown.
  // - MCP Apps tab: derived from mcp-app items' own `categories` taxonomy.
  // - Components / All tabs: component categories ordered per GALLERY_CATEGORY_FILTERS.
  // Category filter never applies to agent templates.
  const allCategories = useMemo<string[]>(() => {
    if (selectedTab === 'mcp-apps') {
      const present = new Set<string>();
      for (const item of itemsForTab) {
        if (item.type === 'mcp-app' && item.categories) {
          for (const c of item.categories) present.add(c);
        }
      }
      return Array.from(present).sort((a, b) => a.localeCompare(b));
    }
    const present = new Set<string>();
    for (const item of itemsForTab) {
      if (item.type === 'component' && item.categories) {
        for (const c of item.categories) present.add(c);
      }
    }
    return GALLERY_CATEGORY_FILTERS
      .slice(1)
      .map((f) => f.value as string)
      .filter((v) => present.has(v));
  }, [itemsForTab, selectedTab]);

  // Apply category filter on the already-tab-filtered items (single pass).
  // Category filter only applies to components — templates are never filtered.
  // On the Templates tab, the "All templates" multi-select (source / agent type)
  // is applied instead — both axes AND together.
  const filteredItems = useMemo(() => {
    if (selectedTab === 'templates') {
      const { sources, agentTypes } = templateFilter;
      if (sources.length === 0 && agentTypes.length === 0) {
        return itemsForTab;
      }
      return itemsForTab.filter((item) => {
        if (item.type !== 'template') return true;
        const source = item.source ?? 'system';
        const agentType = item.agentType ?? 'custom';
        const okSource = sources.length === 0 || sources.includes(source);
        const okType = agentTypes.length === 0 || agentTypes.includes(agentType);
        return okSource && okType;
      });
    }
    if (selectedCategory === '') return itemsForTab;
    return itemsForTab.filter((item) => {
      if (item.type === 'component') return item.categories.includes(selectedCategory);
      // MCP apps use their own industry taxonomy, surfaced only on the MCP Apps
      // tab. On the "All" tab the dropdown lists component categories, so MCP
      // cards are left unfiltered there rather than hidden by a mismatched term.
      if (item.type === 'mcp-app') {
        return selectedTab === 'mcp-apps'
          ? (item.categories ?? []).includes(selectedCategory)
          : true;
      }
      return true;
    });
  }, [itemsForTab, selectedCategory, selectedTab, templateFilter]);

  // Reset category when the active tab no longer contains the selected value
  // or when switching to the Templates tab (category filter doesn't apply to templates).
  useEffect(() => {
    if (selectedTab === 'templates' && selectedCategory !== '') {
      setSelectedCategory('');
    } else if (selectedCategory && !allCategories.includes(selectedCategory)) {
      setSelectedCategory('');
    }
  }, [selectedTab, selectedCategory, allCategories]);

  // Clear the template filter when leaving the Templates tab so it doesn't
  // silently persist while hidden.
  useEffect(() => {
    if (selectedTab !== 'templates') {
      setTemplateFilter((prev) =>
        prev.sources.length || prev.agentTypes.length
          ? { sources: [], agentTypes: [] }
          : prev,
      );
    }
  }, [selectedTab]);

  // Selected component with latest install state (only for component items)
  const selectedComponentWithState = useMemo(() => {
    if (!selectedItem || selectedItem.type !== 'component') return null;
    return components.find((c) => c.id === selectedItem.id) ?? null;
  }, [selectedItem, components]);

  // Auto-dismiss success messages
  useEffect(() => {
    if (installMessage?.intent === 'success') {
      dismissTimerRef.current = setTimeout(() => {
        setInstallMessage(null);
      }, SUCCESS_DISMISS_MS);
    }
    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, [installMessage]);

  const handleItemClick = useCallback((item: CatalogItem) => {
    setSelectedItem(item);
    setOpenedViaDeepLink(false);
  }, []);

  // Admin-only entry point for authoring a new template.
  const handleNewTemplate = useCallback(() => {
    setNewTemplateOpen(true);
  }, []);

  // Admin-only entry point for the Edit Template dialog (from a card's edit button).
  const handleEditTemplate = useCallback((item: CatalogItem) => {
    setEditTemplateItem(item);
  }, []);

  const handleClearFilters = useCallback(() => {
    setSelectedTab('');
    setSelectedCategory('');
    setTemplateFilter({ sources: [], agentTypes: [] });
  }, []);

  const handleDownload = useCallback(() => {
    if (!selectedComponentWithState?.downloadUrl) return;
    window.open(selectedComponentWithState.downloadUrl, '_blank', 'noopener,noreferrer');
  }, [selectedComponentWithState]);

  // Install with progress dialog
  const handleInstall = useCallback(async () => {
    if (!selectedComponentWithState) return;
    const { id } = selectedComponentWithState;

    setLocalInstallStateMap((prev) => new Map(prev).set(id, 'installing'));
    setSelectedItem(null); // Close the component dialog
    setProgressDialog({ open: true, type: 'component', status: 'installing', progress: 0 });

    try {
      const result = await installSolutionService(client, selectedComponentWithState, crypto.randomUUID(), (pct) => {
        setProgressDialog((prev) => ({ ...prev, progress: pct }));
      });
      if (result.success) {
        setLocalInstallStateMap((prev) => new Map(prev).set(id, 'installed'));
        const viewUrl = `${copilotStudioBaseUrl}/environments/${environmentId}/${selectedComponentWithState.copilotStudioPath}`;
        setProgressDialog({ open: true, type: 'component', status: 'installed', progress: 100, launchUrl: viewUrl });
      } else {
        const errorMsg = result.errorMessage ?? 'Installation failed. Please try again.';
        setLocalInstallStateMap((prev) => new Map(prev).set(id, 'failed'));
        setProgressDialog({ open: true, type: 'component', status: 'error', progress: 0, errorMessage: errorMsg });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Installation failed. Please try again.';
      setLocalInstallStateMap((prev) => new Map(prev).set(id, 'failed'));
      setProgressDialog({ open: true, type: 'component', status: 'error', progress: 0, errorMessage: message });
    }
  }, [selectedComponentWithState, client, environmentId, copilotStudioBaseUrl]);

  // View button with deep linking to Copilot Studio
  const handleView = useCallback(() => {
    if (!selectedComponentWithState) return;

    try {
      const componentId = detectionData?.componentIds.get(
        selectedComponentWithState.copilotStudioComponentName,
      );

      let url: string;
      if (componentId) {
        url = `${copilotStudioBaseUrl}/environments/${environmentId}/${selectedComponentWithState.copilotStudioPath}/${componentId}`;
      } else {
        url = `${copilotStudioBaseUrl}/environments/${environmentId}/${selectedComponentWithState.copilotStudioPath}`;
      }

      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('[AgentLibrary] Failed to build deep link:', err);
      window.open(copilotStudioBaseUrl, '_blank', 'noopener,noreferrer');
    }
  }, [selectedComponentWithState, detectionData, environmentId, copilotStudioBaseUrl]);

  const installState = selectedComponentWithState
    ? (installStateMap.get(selectedComponentWithState.id) ?? 'not-installed')
    : 'not-installed';

  return (
    <div className={styles.page}>
      {/* Page-level MessageBar for install progress */}
      {installMessage && (
        <MessageBar intent={installMessage.intent}>
          <MessageBarBody>{installMessage.text}</MessageBarBody>
        </MessageBar>
      )}

      {/* Page Header */}
      <div className={styles.pageHeader}>
        <div className={styles.headerText}>
          <Title1>Agent library</Title1>
          <Body1 className={styles.subtitleText}>
            Browse ready-made agent templates and components. Pick one to get started in seconds.
          </Body1>
        </div>
        {canCreate && (
          <Button
            className={styles.newTemplateButton}
            appearance="primary"
            icon={<Add20Regular />}
            onClick={handleNewTemplate}
          >
            New Template
          </Button>
        )}
      </div>

      {/* Filters */}
      <GalleryFilters
        selectedTab={selectedTab}
        onTabChange={setSelectedTab}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        categories={allCategories}
        templateFilter={templateFilter}
        onTemplateFilterChange={setTemplateFilter}
      />

      {/* Gallery — two-section layout on "All" tab, single grid on others */}
      <ComponentGallery
        items={filteredItems}
        onCardClick={handleItemClick}
        onClearFilters={handleClearFilters}
        onCardEdit={canEdit ? handleEditTemplate : undefined}
        showSections={selectedTab === ''}
      />

      {/* MCP App Dialog — about + category tags, Learn more + Download (no install) */}
      {selectedItem && selectedItem.type === 'mcp-app' && (
        <McpAppDialog
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      )}

      {/* Declarative Agent Dialog */}
      {selectedItem && selectedItem.type === 'template' && selectedItem.agentType === 'declarative' && (
        <DeclarativeAgentDialog
          item={selectedItem}
          onClose={() => {
            setSelectedItem(null);
            setOpenedViaDeepLink(false);
          }}
          deepLinkMode={openedViaDeepLink}
        />
      )}

      {/* Agent Template Dialog (custom agents) */}
      {selectedItem && selectedItem.type === 'template' && selectedItem.agentType !== 'declarative' && (
        <AgentTemplateDialog
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onInstallProgress={(pct) => {
            setProgressDialog((prev) => ({ ...prev, progress: pct }));
          }}
          onInstallStart={({ schemaName, orgUrl, targetEnvironmentId, importPromise }) => {
            setSelectedItem(null);
            setProgressDialog({ open: true, type: 'template', status: 'installing', progress: 0 });
            importPromise.then(async (result) => {
              if (result.success) {
                // Query for the bot ID using the schema name in the target environment
                let botDeepLink = `${copilotStudioBaseUrl}/environments/${targetEnvironmentId}/bots`;
                try {
                  const botResult = await client.executeAsync<Record<string, string>, { value: Array<{ botid: string }> }>({
                    connectorOperation: {
                      tableName: 'commondataserviceforapps',
                      operationName: 'ListRecordsWithOrganization',
                      parameters: {
                        organization: orgUrl,
                        entityName: 'bots',
                        $select: 'botid',
                        $filter: `schemaname eq '${schemaName}'`,
                        $top: '1',
                      },
                    },
                  });
                  const bots = (botResult as unknown as { data: { value: Array<{ botid: string }> } }).data?.value ?? [];
                  if (bots.length > 0 && bots[0].botid) {
                    botDeepLink = `${copilotStudioBaseUrl}/environments/${targetEnvironmentId}/bots/${bots[0].botid}`;
                  }
                } catch (err) {
                  console.warn('[AgentLibraryPage] Failed to get bot ID for deep link:', err);
                }
                setProgressDialog({ open: true, type: 'template', status: 'installed', progress: 100, launchUrl: botDeepLink });
              } else {
                setProgressDialog({ open: true, type: 'template', status: 'error', progress: 0, errorMessage: result.errorMessage });
              }
            });
          }}
        />
      )}

      {/* Component Dialog */}
      {selectedItem && selectedItem.type === 'component' && selectedComponentWithState && (
        <ComponentDialog
          item={selectedComponentWithState}
          onClose={() => setSelectedItem(null)}
          onInstallComplete={(result) => {
            const componentName = selectedComponentWithState.name;
            const id = selectedComponentWithState.id;
            if (result.success) {
              setLocalInstallStateMap((prev) => new Map(prev).set(id, 'installed'));
              setInstallMessage({ text: `"${componentName}" installed successfully.`, intent: 'success' });
            } else {
              const errorMsg = result.errorMessage ?? `Failed to install "${componentName}". Please try again.`;
              setLocalInstallStateMap((prev) => new Map(prev).set(id, 'failed'));
              setInstallMessage({ text: errorMsg, intent: 'error' });
            }
          }}
          onInstallStart={() => {
            const id = selectedComponentWithState.id;
            const componentName = selectedComponentWithState.name;
            setLocalInstallStateMap((prev) => new Map(prev).set(id, 'installing'));
            setInstallMessage({ text: `Installing "${componentName}"...`, intent: 'info' });
          }}
          actionBar={
            <ActionBar
              installState={installState}
              hasInstallPrivilege={
                selectedComponentWithState.requiresExternalConnection
                  ? false  // ServiceNow: dialog manages its own Import button
                  : hasPrivilege
              }
              onInstall={() => void handleInstall()}
              onDownload={handleDownload}
              onView={() => void handleView()}
            />
          }
        />
      )}

      {/* New Template Dialog (admin only — wired to onCreateTemplate) */}
      {canCreate && (
        <NewTemplateDialog
          open={newTemplateOpen}
          onClose={() => setNewTemplateOpen(false)}
          onSubmit={(values, file) => onCreateTemplate!(values, file as File)}
        />
      )}

      {/* Edit Template Dialog (admin only — wired to onUpdateTemplate) */}
      {canEdit && editTemplateItem && editTemplateItem.type === 'template' && (
        <NewTemplateDialog
          key={editTemplateItem.id}
          mode="edit"
          open
          onClose={() => setEditTemplateItem(null)}
          initialValues={{
            name: editTemplateItem.name,
            description: editTemplateItem.cardDescription ?? editTemplateItem.description,
            agentType: editTemplateItem.agentType === 'declarative' ? 'declarative' : 'custom',
            publishStatus: editTemplateItem.publishStatus ?? 'active',
            accent: editTemplateItem.accent,
            icon: editTemplateItem.icon,
            source: editTemplateItem.source === 'custom' ? 'Custom' : 'System',
            fileName: editTemplateItem.templateFileName,
            learnMoreUrl: editTemplateItem.learnMoreUrl,
            setupGuideUrl: editTemplateItem.setupGuideUrl,
          }}
          onSubmit={(values, file) => onUpdateTemplate!(editTemplateItem.id, values, file)}
          onDelete={
            canDelete
              ? () => onDeleteTemplate!(editTemplateItem.id, editTemplateItem.name)
              : undefined
          }
        />
      )}

      {/* Install Progress Dialog */}
      <InstallProgressDialog
        open={progressDialog.open}
        type={progressDialog.type}
        status={progressDialog.status}
        progress={progressDialog.progress}
        errorMessage={progressDialog.errorMessage}
        onClose={() => setProgressDialog((prev) => ({ ...prev, open: false }))}
        onLaunch={() => {
          if (progressDialog.launchUrl) {
            window.open(progressDialog.launchUrl, '_blank', 'noopener,noreferrer');
          }
          setProgressDialog((prev) => ({ ...prev, open: false }));
        }}
      />
    </div>
  );
}
