/**
 * CSAgentDetailsDrawer
 *
 * Sliding drawer showing structured agent details extracted during Stage A.
 * Tabs: Overview, Instructions, Topics, Tools, Knowledge, Agents, Evaluations
 *
 * Reads from LocalStageAOutput (stored as stageAOutput JSON in the review record).
 * All fields are optional — backward compatible with reviews that pre-date enrichment.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Button,
  Tab,
  TabList,
  Badge,
  Text,
  Body1,
  Body1Strong,
  Card,
  CardHeader,
  Subtitle2,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  DrawerHeader,
  DrawerHeaderTitle,
  InlineDrawer,
  OverlayDrawer,
  Overflow,
  OverflowItem,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  useOverflowMenu,
  useIsOverflowItemVisible,
  useRestoreFocusSource,
  useId,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import {
  Dismiss24Regular,
  AppsListRegular,
  TextBulletListSquareRegular,
  ChatMultipleRegular,
  WrenchRegular,
  BookOpenRegular,
  BotRegular,
  ClipboardTaskListLtrRegular,
} from '@fluentui/react-icons';
import type {
  LocalStageAOutput, ToolType, KnowledgeSourceType, ResourceDetail,
  StageBTopicComponent, ToolDetail, KnowledgeDetail, TopicRuleApplicability,
} from '../../contracts/StageOutputs';
import { ASSESSMENT_LABELS } from '../../utils/reviewAssessment';

export interface CSAgentDetailsDrawerProps {
  open: boolean;
  stageAOutput: LocalStageAOutput | null;
  onClose: () => void;
  /** True for ZIP-sourced reviews — hides the Evals tab */
  isZipSource?: boolean;
  /** When true, renders as an overlay panel on top of content instead of inline */
  overlay?: boolean;
}

const MOBILE_TAB_BREAKPOINT = 400;
const TABLET_TAB_BREAKPOINT = 480;

function getAgentDetailsMinimumVisibleTabs(viewportWidth: number): number {
  if (viewportWidth < MOBILE_TAB_BREAKPOINT) return 2;
  if (viewportWidth < TABLET_TAB_BREAKPOINT) return 3;
  return 4;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  drawer: {
    width: '460px',
    maxWidth: '100%',
    minWidth: 0,
    borderLeft: `1px solid ${tokens.colorNeutralStroke2}`,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  tabs: {
    padding: '0 8px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    flexShrink: 0,
    minWidth: 0,
    overflow: 'hidden',
  },
  tabBody: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    '& > *': {
      flexShrink: 0,
    },
  },
  statGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
  },
  statCard: {
    padding: '10px 12px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: '6px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  statLabel: {
    fontSize: '11px',
    color: tokens.colorNeutralForeground3,
    fontWeight: 500,
  },
  statValue: {
    fontSize: '20px',
    fontWeight: 700,
    color: tokens.colorNeutralForeground1,
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: tokens.colorNeutralForeground3,
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    marginTop: '4px',
  },
  card: {
    padding: '10px 12px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: '6px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  cardName: {
    fontSize: '13px',
    fontWeight: 600,
    color: tokens.colorNeutralForeground1,
  },
  cardDesc: {
    fontSize: '12px',
    color: tokens.colorNeutralForeground2,
    lineHeight: 1.5,
    overflowWrap: 'anywhere',
    whiteSpace: 'pre-wrap',
  },
  cardUrl: {
    fontSize: '11px',
    color: tokens.colorBrandForeground1,
    textDecoration: 'none',
    wordBreak: 'break-all',
    ':hover': { textDecoration: 'underline' },
  },
  badgeRow: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
    marginTop: '2px',
  },
  instructionsBox: {
    fontFamily: 'Consolas, "Courier New", monospace',
    fontSize: '12px',
    lineHeight: 1.6,
    color: tokens.colorNeutralForeground1,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    backgroundColor: tokens.colorNeutralBackground2,
    padding: '12px',
    borderRadius: '4px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  emptyState: {
    fontSize: '13px',
    color: tokens.colorNeutralForeground3,
    fontStyle: 'italic',
    textAlign: 'center',
    padding: '24px 0',
  },
  varChip: {
    fontSize: '11px',
    color: tokens.colorNeutralForeground2,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: '3px',
    padding: '1px 6px',
  },
  varRow: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap',
    marginTop: '4px',
  },
  testInput: {
    fontSize: '12px',
    color: tokens.colorNeutralForeground2,
    fontStyle: 'italic',
    lineHeight: 1.4,
  },
  instructionsPreview: {
    maxHeight: '120px',
    overflowY: 'auto',
    flexShrink: 0,
  },
  instructionsPreviewAction: {
    alignSelf: 'flex-start',
    flexShrink: 0,
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topicPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    paddingBottom: '8px',
  },
  varSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  orchestrationValue: {
    fontSize: '13px',
    fontWeight: 600,
    color: tokens.colorBrandForeground1,
    marginTop: '2px',
  },
  cardNameSmall: {
    fontSize: '12px',
    fontWeight: 600,
    color: tokens.colorNeutralForeground1,
  },
  agentName: {
    fontSize: '16px',
    fontWeight: 700,
    color: tokens.colorNeutralForeground1,
    lineHeight: 1.3,
  },
  settingsTable: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: '6px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    overflow: 'hidden',
  },
  settingsRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '8px 12px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    ':last-child': { borderBottom: 'none' },
  },
  settingsLabel: {
    fontSize: '12px',
    color: tokens.colorNeutralForeground3,
    fontWeight: 500,
    flexShrink: 0,
  },
  settingsValue: {
    fontSize: '12px',
    color: tokens.colorNeutralForeground1,
    fontWeight: 600,
    textAlign: 'right' as const,
    wordBreak: 'break-word' as const,
  },
  resourceSection: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM, minWidth: 0 },
});

// ─── Badge config ─────────────────────────────────────────────────────────────

type BadgeColor = 'brand' | 'danger' | 'important' | 'informative' | 'severe' | 'subtle' | 'success' | 'warning';

const TOOL_TYPE_CONFIG: Record<ToolType, { color: BadgeColor; label: string }> = {
  mcp:       { color: 'informative', label: 'MCP' },
  flow:      { color: 'brand',       label: 'Flow' },
  connector: { color: 'success',     label: 'Connector' },
  prompt:    { color: 'warning',     label: 'AI Prompt' },
  unknown:   { color: 'informative', label: 'Tool' },
};

const KNOWLEDGE_TYPE_CONFIG: Record<KnowledgeSourceType, { color: BadgeColor; label: string }> = {
  SharePoint: { color: 'success',     label: 'SharePoint' },
  Web:        { color: 'informative', label: 'Web' },
  Dataverse:  { color: 'brand',       label: 'Dataverse' },
  File:       { color: 'informative', label: 'File' },
  Unknown:    { color: 'informative', label: 'Unknown' },
};

// ─── Tab type ─────────────────────────────────────────────────────────────────

type DrawerTab = 'overview' | 'instructions' | 'topics' | 'tools' | 'knowledge' | 'agents' | 'evaluations';

const TAB_CONFIG: Array<{ id: DrawerTab; label: string; icon: React.ReactElement }> = [
  { id: 'overview',      label: 'Overview',      icon: <AppsListRegular /> },
  { id: 'instructions',  label: 'Instructions',  icon: <TextBulletListSquareRegular /> },
  { id: 'topics',        label: 'Topics',        icon: <ChatMultipleRegular /> },
  { id: 'tools',         label: 'Tools',         icon: <WrenchRegular /> },
  { id: 'knowledge',     label: 'Knowledge',     icon: <BookOpenRegular /> },
  { id: 'agents',        label: 'Agents',        icon: <BotRegular /> },
  { id: 'evaluations',   label: 'Evals',         icon: <ClipboardTaskListLtrRegular /> },
];

// ─── Overflow menu ────────────────────────────────────────────────────────────

interface OverflowMenuProps {
  activeTab: DrawerTab;
  onTabSelect: (tab: DrawerTab) => void;
  counts: Record<DrawerTab, number>;
}

function OverflowMenu({ activeTab, onTabSelect, counts, tabs }: OverflowMenuProps & { tabs: typeof TAB_CONFIG }) {
  const { ref, isOverflowing } = useOverflowMenu<HTMLButtonElement>();
  const activeTabVisible = useIsOverflowItemVisible(activeTab);
  if (!isOverflowing) return null;
  return (
    <Menu>
      <MenuTrigger disableButtonEnhancement>
        <Button ref={ref} appearance="subtle" size="small" role="tab" aria-selected={!activeTabVisible} aria-label="More agent detail tabs">•••</Button>
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          {tabs.map(tab => (
            <OverflowMenuItem key={tab.id} tab={tab} activeTab={activeTab} onTabSelect={onTabSelect} count={counts[tab.id]} />
          ))}
        </MenuList>
      </MenuPopover>
    </Menu>
  );
}

interface OverflowMenuItemProps {
  tab: typeof TAB_CONFIG[number];
  activeTab: DrawerTab;
  onTabSelect: (tab: DrawerTab) => void;
  count: number;
}

function OverflowMenuItem({ tab, activeTab, onTabSelect, count }: OverflowMenuItemProps) {
  const isVisible = useIsOverflowItemVisible(tab.id);
  if (isVisible) return null;
  const label = count > 0 ? `${tab.label} (${count})` : tab.label;
  return (
    <MenuItem
      icon={tab.icon}
      onClick={() => onTabSelect(tab.id)}
      style={{ fontWeight: activeTab === tab.id ? 600 : undefined }}
    >
      {label}
    </MenuItem>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function applicabilityLabel(status: TopicRuleApplicability['status']): string {
  return status === 'applicable' ? 'Applicable'
    : status === 'not-applicable' ? ASSESSMENT_LABELS['not-applicable'] : ASSESSMENT_LABELS['not-assessed'];
}

function ResourceIdentity({ resource }: { resource: ResourceDetail }) {
  const styles = useStyles();
  return (
    <>
      {resource.componentId && <Body1 className={styles.cardDesc}>Component ID: {resource.componentId}</Body1>}
      {resource.schemaName && <Body1 className={styles.cardDesc}>Schema name: {resource.schemaName}</Body1>}
      {resource.kind && <Body1 className={styles.cardDesc}>Kind: {resource.kind}</Body1>}
      {resource.targetSchemaName && <Body1 className={styles.cardDesc}>Target schema name: {resource.targetSchemaName}</Body1>}
      {resource.targetId && <Body1 className={styles.cardDesc}>Target ID: {resource.targetId}</Body1>}
      {resource.parentComponentId && <Body1 className={styles.cardDesc}>Parent component ID: {resource.parentComponentId}</Body1>}
      {resource.reason && <Body1 className={styles.cardDesc}>{resource.reason}</Body1>}
    </>
  );
}

function ResourceSection({ title, resources }: { title: string; resources?: ResourceDetail[] }) {
  const styles = useStyles();
  return (
    <section className={styles.resourceSection}>
      <Subtitle2 as="h3">{title}{resources ? ` (${resources.length})` : ''}</Subtitle2>
      {resources?.length ? resources.map((resource, index) => (
        <Card key={`${resource.componentId ?? resource.schemaName ?? resource.name}-${index}`} appearance="outline">
          <CardHeader header={<Body1Strong className={styles.cardDesc}>{resource.name}</Body1Strong>} />
          {resource.description !== undefined && <Body1 className={styles.cardDesc}>Description: {resource.description || '(empty)'}</Body1>}
          <ResourceIdentity resource={resource} />
        </Card>
      )) : (
        <Body1 className={styles.cardDesc}>
          {resources ? `No ${title.toLowerCase()} were recorded.` : 'Details were not recorded in this saved review.'}
        </Body1>
      )}
    </section>
  );
}

/** Show only saved resource identities, keeping agents, entities and unknown kinds distinct. */
export function CSAgentDetailsDrawer({ open, stageAOutput, onClose, isZipSource = false, overlay = false }: CSAgentDetailsDrawerProps) {
  const styles = useStyles();
  const [activeTab, setActiveTab] = useState<DrawerTab>('overview');
  const [minimumVisibleTabs, setMinimumVisibleTabs] = useState(() =>
    getAgentDetailsMinimumVisibleTabs(typeof window === 'undefined' ? TABLET_TAB_BREAKPOINT : window.innerWidth),
  );
  const restoreFocus = useRestoreFocusSource();
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const tabSetId = useId('agent-details-tabs');
  const showFullInstructions = () => {
    // Retain focus inside the drawer before the focused preview button unmounts.
    panelRef.current?.focus();
    setActiveTab('instructions');
  };
  useEffect(() => {
    if (open && !overlay) closeRef.current?.focus();
  }, [open, overlay]);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const updateMinimumVisibleTabs = () => setMinimumVisibleTabs(getAgentDetailsMinimumVisibleTabs(window.innerWidth));
    updateMinimumVisibleTabs();
    window.addEventListener('resize', updateMinimumVisibleTabs);
    return () => window.removeEventListener('resize', updateMinimumVisibleTabs);
  }, []);

  const topics: StageBTopicComponent[] = stageAOutput?.topicComponents ?? stageAOutput?.topics?.map(TopicName => ({ TopicName })) ?? [];
  const tools: ToolDetail[] = stageAOutput?.toolDetails ?? stageAOutput?.tools?.map(name => ({ name, toolType: 'unknown' })) ?? [];
  const knowledge: KnowledgeDetail[] = stageAOutput?.knowledgeDetails ?? stageAOutput?.knowledgeSources?.map(name => ({ name, sourceType: 'Unknown' })) ?? [];
  const agents       = stageAOutput?.childAgents ?? [];
  const connectedAgents = stageAOutput?.connectedAgents ?? [];
  const testCases    = stageAOutput?.testCaseDetails ?? [];
  const instructions = stageAOutput?.agentInstructions ?? '';

  // Filter out Evals tab for ZIP reviews — test cases are not in solution ZIPs
  const visibleTabs = TAB_CONFIG.filter(t => !(isZipSource && t.id === 'evaluations'));
  const selectedTab = visibleTabs.find(tab => tab.id === activeTab)?.id ?? visibleTabs[0]?.id ?? 'overview';
  const activePanelId = `${tabSetId}-panel-${selectedTab}`;
  const activeTabId = `${tabSetId}-tab-${selectedTab}`;

  const Drawer = overlay ? OverlayDrawer : InlineDrawer;

  return (
    <Drawer open={open} position="end" className={styles.drawer} separator
      role={overlay ? 'dialog' : 'region'} aria-label="Agent details" {...restoreFocus}
      onKeyDown={(event: React.KeyboardEvent<HTMLElement>) => {
        if (!overlay && event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
      {...(overlay ? { onOpenChange: (_: unknown, data: { open: boolean }) => { if (!data.open) onClose(); } } : {})}
    >
      <DrawerHeader>
        <DrawerHeaderTitle
          action={
            <Button ref={closeRef} appearance="subtle" aria-label="Close agent details" icon={<Dismiss24Regular />} onClick={onClose} />
          }
        >
          Agent Details
        </DrawerHeaderTitle>
      </DrawerHeader>

      {/* Tab bar with overflow */}
      <div className={styles.tabs}>
        <Overflow minimumVisible={minimumVisibleTabs}>
          <TabList
            size="small"
            aria-label="Agent snapshot details"
            selectedValue={selectedTab}
            onTabSelect={(_, d) => setActiveTab(d.value as DrawerTab)}
            style={{ display: 'flex', flexWrap: 'nowrap', minWidth: 0 }}
          >
            {visibleTabs.map(tab => {
              const count = tab.id === 'topics' ? topics.length
                : tab.id === 'tools' ? tools.length
                : tab.id === 'knowledge' ? knowledge.length
                : tab.id === 'agents' ? agents.length + connectedAgents.length
                : tab.id === 'evaluations' ? testCases.length
                : 0;
              return (
                <OverflowItem key={tab.id} id={tab.id} priority={tab.id === selectedTab ? 2 : 1}>
                  <Tab
                    value={tab.id}
                    icon={tab.icon}
                    id={`${tabSetId}-tab-${tab.id}`}
                    aria-controls={`${tabSetId}-panel-${tab.id}`}
                  >
                    {tab.label}{count > 0 ? ` (${count})` : ''}
                  </Tab>
                </OverflowItem>
              );
            })}
            <OverflowMenu
              activeTab={selectedTab}
              onTabSelect={setActiveTab}
              tabs={visibleTabs}
              counts={{
                overview: 0, instructions: 0,
                topics: topics.length, tools: tools.length,
                knowledge: knowledge.length, agents: agents.length + connectedAgents.length,
                evaluations: testCases.length,
              }}
            />
          </TabList>
        </Overflow>
      </div>

      {/* Tab body */}
      <div
        ref={panelRef}
        className={styles.tabBody}
        role="tabpanel"
        id={activePanelId}
        aria-labelledby={activeTabId}
        tabIndex={0}
      >

        {/* ── Overview ── */}
        {selectedTab === 'overview' && (
          <>
            {stageAOutput?.configurationAvailable === false && (
              <MessageBar intent="info" aria-live="polite">
                <MessageBarBody>
                  <MessageBarTitle>Configuration unavailable</MessageBarTitle>
                  Source configuration was unavailable. Empty resource lists do not confirm that components are absent.
                </MessageBarBody>
              </MessageBar>
            )}
            {(stageAOutput?.botName || stageAOutput?.botId) && (
              <div className={styles.card}>
                {stageAOutput.botName && <span className={styles.agentName}>{stageAOutput.botName}</span>}
                {stageAOutput.botId && <Body1 className={styles.cardDesc}>Agent ID: {stageAOutput.botId}</Body1>}
                {stageAOutput.agentDescription !== undefined && (
                  <span className={styles.cardDesc}>Description: {stageAOutput.agentDescription || '(empty)'}</span>
                )}
              </div>
            )}
            <div className={styles.statGrid}>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Topics</span>
                <span className={styles.statValue}>{stageAOutput?.topicComponents || stageAOutput?.topics ? topics.length : 'Unavailable'}</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Tools</span>
                <span className={styles.statValue}>{stageAOutput?.toolCount ?? (stageAOutput?.toolDetails || stageAOutput?.tools ? tools.length : 'Unavailable')}</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Knowledge</span>
                <span className={styles.statValue}>{stageAOutput?.knowledgeCount ?? (stageAOutput?.knowledgeDetails || stageAOutput?.knowledgeSources ? knowledge.length : 'Unavailable')}</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Child Agents</span>
                <span className={styles.statValue}>{stageAOutput?.childAgents ? agents.length : 'Unavailable'}</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Test Cases</span>
                <span className={styles.statValue}>{isZipSource ? 'N/A' : stageAOutput?.testCaseCount ?? 'Unavailable'}</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Orchestration</span>
                <span className={styles.orchestrationValue}>
                  {stageAOutput?.orchestrationMode === 'generative' ? 'Generative'
                    : stageAOutput?.orchestrationMode === 'classic' ? 'Classic' : 'Not assessed'}
                </span>
              </div>
            </div>

            {stageAOutput?.agentSettings && (() => {
              const s = stageAOutput.agentSettings!;
              const rows: Array<{ label: string; value: string }> = [];
              if (s.language) rows.push({ label: 'Language', value: s.language });
              if (s.authenticationMode) rows.push({ label: 'Authentication', value: s.authenticationMode });
              if (s.useModelKnowledge !== undefined) rows.push({ label: 'Model Knowledge', value: s.useModelKnowledge ? 'Enabled' : 'Disabled' });
              if (s.isSemanticSearchEnabled !== undefined) rows.push({ label: 'Semantic Search', value: s.isSemanticSearchEnabled ? 'Enabled' : 'Disabled' });
              if (s.optInUseLatestModels !== undefined) rows.push({ label: 'Latest AI Models', value: s.optInUseLatestModels ? 'Opted in' : 'Default' });
              if (rows.length === 0) return null;
              return (
                <>
                  <div className={styles.sectionTitle}>Settings</div>
                  <div className={styles.settingsTable}>
                    {rows.map(row => (
                      <div key={row.label} className={styles.settingsRow}>
                        <span className={styles.settingsLabel}>{row.label}</span>
                        <span className={styles.settingsValue}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}

            {instructions && (
              <>
                <div className={styles.sectionTitle}>Instructions Preview</div>
                <div className={mergeClasses(styles.instructionsBox, styles.instructionsPreview)}>
                  {instructions.slice(0, 400)}{instructions.length > 400 ? '…' : ''}
                </div>
                <Button
                  appearance="subtle"
                  size="small"
                  className={styles.instructionsPreviewAction}
                  onClick={showFullInstructions}
                >
                  View full instructions
                </Button>
              </>
            )}
            <ResourceSection title="Entities" resources={stageAOutput?.entities} />
            <ResourceSection title="Configuration components" resources={stageAOutput?.configurationComponents} />
            <ResourceSection title="Unclassified components" resources={stageAOutput?.unknownComponents} />
            {!!stageAOutput?.parsingErrors?.length && (
              <section className={styles.resourceSection}>
                <Subtitle2 as="h3">Configuration read limitations</Subtitle2>
                {stageAOutput.parsingErrors.map((error, index) => <Body1 key={index} className={styles.cardDesc}>{error}</Body1>)}
              </section>
            )}
          </>
        )}

        {/* ── Instructions ── */}
        {selectedTab === 'instructions' && (
          instructions
            ? <div className={styles.instructionsBox}>{instructions}</div>
            : <Text className={styles.emptyState}>{stageAOutput?.agentInstructions === undefined
                ? 'Instruction text was not recorded in this saved review.' : 'The saved instruction text is empty.'}</Text>
        )}

        {/* ── Topics ── */}
        {selectedTab === 'topics' && (
          topics.length === 0
            ? <Text className={styles.emptyState}>{stageAOutput?.topicComponents || stageAOutput?.topics
                ? 'No user-defined topics were recorded.' : 'Topic details were not recorded in this saved review.'}</Text>
            : <Accordion collapsible multiple>
                {topics.map((t, i) => (
                  <AccordionItem key={i} value={`topic-${i}`}>
                    <AccordionHeader expandIconPosition="end">
                      <Text size={300} weight="semibold">{t.ModelName ?? t.TopicName}</Text>
                    </AccordionHeader>
                    <AccordionPanel>
                      <div className={styles.topicPanel}>
                        <Body1 className={styles.cardDesc}>Topic: {t.TopicName}</Body1>
                        {t.TopicId && <Body1 className={styles.cardDesc}>Component ID: {t.TopicId}</Body1>}
                        {t.SchemaName && <Body1 className={styles.cardDesc}>Schema name: {t.SchemaName}</Body1>}
                        {t.TriggerKind && <Body1 className={styles.cardDesc}>Trigger kind: {t.TriggerKind}</Body1>}
                        {t.ModelName !== undefined && <Body1 className={styles.cardDesc}>Model name: {t.ModelName || '(empty)'}</Body1>}
                        {t.RoutingApplicability && <Body1 className={styles.cardDesc}>Routing applicability: {applicabilityLabel(t.RoutingApplicability.status)}. {t.RoutingApplicability.reason}</Body1>}
                        {t.NamingApplicability && <Body1 className={styles.cardDesc}>Naming applicability: {applicabilityLabel(t.NamingApplicability.status)}. {t.NamingApplicability.reason}</Body1>}
                        {t.ModelDescription && (
                          <Text size={200} className={styles.cardDesc}>{t.ModelDescription}</Text>
                        )}
                        {t.InputVariables && t.InputVariables.length > 0 && (
                          <div className={styles.varSection}>
                            <Text size={100} className={styles.statLabel}>Inputs</Text>
                            <div className={styles.varRow}>
                              {t.InputVariables.map((v, vi) => (
                                <div key={vi} className={styles.varSection}>
                                  <Body1Strong>{v.VariableName}</Body1Strong>
                                  <Body1 className={styles.cardDesc}>{v.VariableDescription ?? 'Description was not recorded.'}</Body1>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {t.OutputVariables && t.OutputVariables.length > 0 && (
                          <div className={styles.varSection}>
                            <Text size={100} className={styles.statLabel}>Outputs</Text>
                            <div className={styles.varRow}>
                              {t.OutputVariables.map((v, vi) => (
                                <div key={vi} className={styles.varSection}>
                                  <Body1Strong>{v.VariableName}</Body1Strong>
                                  <Body1 className={styles.cardDesc}>{v.VariableDescription ?? 'Description was not recorded.'}</Body1>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </AccordionPanel>
                  </AccordionItem>
                ))}
              </Accordion>
        )}

        {/* ── Tools ── */}
        {selectedTab === 'tools' && (
          tools.length === 0
            ? <Text className={styles.emptyState}>{stageAOutput?.toolDetails || stageAOutput?.tools
                ? 'No tools were recorded.' : 'Tool details were not recorded in this saved review.'}</Text>
            : tools.map((tool, i) => {
                const cfg = TOOL_TYPE_CONFIG[tool.toolType] ?? TOOL_TYPE_CONFIG.unknown;
                return (
                  <div key={i} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <span className={styles.cardName}>{tool.displayName ?? tool.name}</span>
                      <Badge shape="rounded" appearance="tint" color={cfg.color} size="small">{cfg.label}</Badge>
                    </div>
                    {tool.description && (
                      <span className={styles.cardDesc}>{tool.description}</span>
                    )}
                    {tool.displayName && tool.displayName !== tool.name && <Body1 className={styles.cardDesc}>Name: {tool.name}</Body1>}
                    <ResourceIdentity resource={tool} />
                  </div>
                );
              })
        )}

        {/* ── Knowledge ── */}
        {selectedTab === 'knowledge' && (
          knowledge.length === 0
            ? <Text className={styles.emptyState}>{stageAOutput?.knowledgeDetails || stageAOutput?.knowledgeSources
                ? 'No knowledge sources were recorded.' : 'Knowledge details were not recorded in this saved review.'}</Text>
            : knowledge.map((k, i) => {
                const cfg = KNOWLEDGE_TYPE_CONFIG[k.sourceType] ?? KNOWLEDGE_TYPE_CONFIG.Unknown;
                return (
                  <div key={i} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <span className={styles.cardName}>{k.name}</span>
                      <Badge shape="rounded" appearance="tint" color={cfg.color} size="small">{cfg.label}</Badge>
                    </div>
                    {k.url && (
                      <a href={k.url} target="_blank" rel="noopener noreferrer" className={styles.cardUrl}>
                        {k.url}
                      </a>
                    )}
                    {k.description !== undefined && <Body1 className={styles.cardDesc}>Description: {k.description || '(empty)'}</Body1>}
                    <ResourceIdentity resource={k} />
                  </div>
                );
              })
        )}

        {/* ── Agents ── */}
        {selectedTab === 'agents' && (
          <>
            <ResourceSection title="Child agents" resources={stageAOutput?.childAgents} />
            <ResourceSection title="Connected agents" resources={stageAOutput?.connectedAgents} />
          </>
        )}

        {/* ── Evaluations ── */}
        {selectedTab === 'evaluations' && (
          testCases.length === 0
            ? <Text className={styles.emptyState}>No test cases defined.</Text>
            : testCases.map((tc, i) => (
                <div key={i} className={styles.card}>
                  <div className={styles.cardHeader}>
                    <span className={styles.cardNameSmall}>{tc.name}</span>
                    <Badge
                      shape="rounded"
                      appearance="tint"
                      color="informative"
                      size="small"
                    >
                      {tc.source}
                    </Badge>
                  </div>
                  {tc.input && tc.input !== tc.name && (
                    <span className={styles.testInput}>{tc.input}</span>
                  )}
                  <ResourceIdentity resource={tc} />
                </div>
              ))
        )}

      </div>
    </Drawer>
  );
}
