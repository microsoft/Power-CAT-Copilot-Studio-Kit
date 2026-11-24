/**
 * AgentDetailsPanel — full agent configuration panel.
 *
 * Data source: fetchAgentConfig() → queries `bots` + `botcomponents`
 * Dataverse tables, parses YAML exactly like the Agent Review Tool.
 *
 * Tabs: Overview · Instructions · Topics · Tools · Knowledge · Agents
 * Rendered inside analysisTabContent (no outer Card wrapper).
 */

import { useState } from "react";
import {
  makeStyles,
  tokens,
  Tab,
  TabList,
  Badge,
  Button,
  Text,
  Spinner,
  Tooltip,
  Overflow,
  OverflowItem,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  useOverflowMenu,
  useIsOverflowItemVisible,
} from "@fluentui/react-components";
import {
  AppsListRegular,
  TextBulletListSquareRegular,
  ChatMultipleRegular,
  WrenchRegular,
  BookOpenRegular,
  BotRegular,
  PuzzlePieceRegular,
  Info16Regular,
} from "@fluentui/react-icons";
import type { AgentConfig, AgentToolType, AgentKnowledgeType } from "../services/agent-config-service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AgentTab = "overview" | "instructions" | "topics" | "skills" | "tools" | "knowledge" | "agents";

const TAB_CONFIG: Array<{ id: AgentTab; label: string; icon: React.ReactElement }> = [
  { id: "overview",      label: "Overview",      icon: <AppsListRegular /> },
  { id: "instructions",  label: "Instructions",  icon: <TextBulletListSquareRegular /> },
  { id: "topics",        label: "Topics",        icon: <ChatMultipleRegular /> },
  { id: "skills",        label: "Skills",        icon: <PuzzlePieceRegular /> },
  { id: "tools",         label: "Tools",         icon: <WrenchRegular /> },
  { id: "knowledge",     label: "Knowledge",     icon: <BookOpenRegular /> },
  { id: "agents",        label: "Agents",        icon: <BotRegular /> },
];

export interface AgentDetailsPanelProps {
  agentConfig: AgentConfig | undefined;
  isLoading: boolean;
  /** Agent name from transcript props — shown when config hasn't loaded yet */
  agentName: string;
  /** Model name from conversation general info */
  modelName?: string;
}

// ---------------------------------------------------------------------------
// Badge configs (mirrors Agent Review Tool CSAgentDetailsDrawer)
// ---------------------------------------------------------------------------

type BadgeColor = "brand" | "danger" | "important" | "informative" | "severe" | "subtle" | "success" | "warning";

const TOOL_BADGE: Record<AgentToolType, { color: BadgeColor; label: string }> = {
  mcp:       { color: "informative", label: "MCP" },
  flow:      { color: "brand",       label: "Flow" },
  connector: { color: "success",     label: "Connector" },
  prompt:    { color: "warning",     label: "Prompt" },
  unknown:   { color: "subtle",      label: "Tool" },
};

const KNOWLEDGE_BADGE: Record<AgentKnowledgeType, { color: BadgeColor; label: string }> = {
  SharePoint: { color: "success",     label: "SharePoint" },
  Web:        { color: "informative", label: "Web" },
  Dataverse:  { color: "brand",       label: "Dataverse" },
  File:       { color: "subtle",      label: "File" },
  Unknown:    { color: "subtle",      label: "Unknown" },
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
  },
  tabBar: {
    paddingLeft: tokens.spacingHorizontalXS,
    paddingRight: tokens.spacingHorizontalXS,
    paddingBottom: tokens.spacingVerticalXS,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    minWidth: 0,
    overflow: "hidden",
  },
  tabBody: {
    padding: tokens.spacingVerticalM,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    maxHeight: "480px",
    overflowY: "auto",
  },
  loadingCenter: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: `${tokens.spacingVerticalXL} 0`,
  },
  // KPI row — mirrors Agent Insights Hub MetricCard layout
  // CSS grid: 5 columns by default, responsive via media queries
  kpiRow: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    "@media (max-width: 900px)": { gridTemplateColumns: "repeat(3, 1fr)" },
    "@media (max-width: 600px)": { gridTemplateColumns: "repeat(2, 1fr)" },
  },
  kpiTile: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXXS,
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
  },
  kpiLabelRow: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
  },
  kpiLabel: {
    color: tokens.colorNeutralForeground2,
  },
  kpiInfoIcon: {
    color: tokens.colorNeutralForeground3,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "unset",
    width: "20px",
    height: "20px",
    padding: 0,
    border: "none",
    backgroundColor: "transparent",
    cursor: "help",
  },
  kpiValue: {
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
    whiteSpace: "nowrap",
  },
  sectionTitle: {
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground3,
    textTransform: "uppercase",
    letterSpacing: "0.4px",
    marginTop: tokens.spacingVerticalXS,
  },
  agentCard: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS}`,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXXS,
  },
  agentNameText: {
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightBold,
    color: tokens.colorNeutralForeground1,
    lineHeight: tokens.lineHeightBase400,
  },
  agentDescText: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    lineHeight: tokens.lineHeightBase200,
  },
  settingsTable: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    overflow: "hidden",
    "@media (max-width: 900px)": { gridTemplateColumns: "1fr 1fr" },
    "@media (max-width: 600px)": { gridTemplateColumns: "1fr" },
  },
  settingsCell: {
    // Horizontal layout: label on left, value on right — same line
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS}`,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRight: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  settingsCellLast: {
    borderBottom: "none",
  },
  settingsCellNoRight: {
    borderRight: "none",
  },
  settingsLabel: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    fontWeight: tokens.fontWeightSemibold,
    textTransform: "uppercase",
    letterSpacing: "0.3px",
    flexShrink: 0,
  },
  settingsValue: {
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  instructionsBox: {
    fontFamily: 'Consolas, "Courier New", monospace',
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase400,
    color: tokens.colorNeutralForeground1,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  itemCard: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS}`,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXXS,
  },
  itemHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalXS,
    minWidth: 0,
  },
  itemName: {
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
    flex: "1 1 0",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  itemDesc: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    lineHeight: tokens.lineHeightBase200,
  },
  itemUrl: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorBrandForeground1,
    wordBreak: "break-all",
    textDecoration: "none",
    ":hover": { textDecoration: "underline" },
  },
  varRow: {
    display: "flex",
    gap: tokens.spacingHorizontalXS,
    flexWrap: "wrap",
    marginTop: tokens.spacingVerticalXXS,
  },
  varLabel: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    fontWeight: tokens.fontWeightSemibold,
  },
  varChip: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground2,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusSmall,
    padding: `1px ${tokens.spacingHorizontalXS}`,
  },
  topicPanel: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
    paddingBottom: tokens.spacingVerticalS,
  },
  emptyState: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground3,
    fontStyle: "italic",
    textAlign: "center",
    paddingTop: tokens.spacingVerticalXL,
    paddingBottom: tokens.spacingVerticalXL,
    display: "block",
  },
});

// ---------------------------------------------------------------------------
// Overflow menu
// ---------------------------------------------------------------------------

interface OverflowMenuProps {
  activeTab: AgentTab;
  onSelect: (tab: AgentTab) => void;
  counts: Record<AgentTab, number>;
}

function OverflowMenuButton({ activeTab, onSelect, counts }: OverflowMenuProps) {
  const { ref, isOverflowing } = useOverflowMenu<HTMLButtonElement>();
  if (!isOverflowing) return null;
  return (
    <Menu>
      <MenuTrigger disableButtonEnhancement>
        <Tab ref={ref} value="__overflow__" aria-label="More tabs">
          <span aria-hidden="true">•••</span>
        </Tab>
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          {TAB_CONFIG.map((tab) => (
            <OverflowMenuItem key={tab.id} tab={tab} activeTab={activeTab} onSelect={onSelect} count={counts[tab.id]} />
          ))}
        </MenuList>
      </MenuPopover>
    </Menu>
  );
}

function OverflowMenuItem({
  tab, activeTab, onSelect, count,
}: { tab: (typeof TAB_CONFIG)[number]; activeTab: AgentTab; onSelect: (t: AgentTab) => void; count: number }) {
  const isVisible = useIsOverflowItemVisible(tab.id);
  if (isVisible) return null;
  return (
    <MenuItem
      icon={tab.icon}
      onClick={() => onSelect(tab.id)}
      aria-current={activeTab === tab.id ? "true" : undefined}
      style={{ fontWeight: activeTab === tab.id ? tokens.fontWeightSemibold : undefined }}
    >
      {count > 0 ? `${tab.label} (${count})` : tab.label}
    </MenuItem>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AgentDetailsPanel({ agentConfig, isLoading }: AgentDetailsPanelProps) {
  const styles = useStyles();
  const [activeTab, setActiveTab] = useState<AgentTab>("overview");

  const topics    = agentConfig?.topics      ?? [];
  const skills    = agentConfig?.skills      ?? [];
  const tools     = agentConfig?.tools       ?? [];
  const knowledge = agentConfig?.knowledge   ?? [];
  const agents    = agentConfig?.childAgents ?? [];
  const instrs    = agentConfig?.instructions ?? "";

  const counts: Record<AgentTab, number> = {
    overview: 0, instructions: 0,
    topics: topics.length, skills: skills.length, tools: tools.length,
    knowledge: knowledge.length, agents: agents.length,
  };

  return (
    <div className={styles.root}>
      {/* Tab bar */}
      <div className={styles.tabBar}>
        <Overflow minimumVisible={3}>
          <TabList
            size="small"
            selectedValue={activeTab}
            onTabSelect={(_, d) => setActiveTab(d.value as AgentTab)}
            style={{ display: "flex", flexWrap: "nowrap", minWidth: 0 }}
          >
            {TAB_CONFIG.map((tab) => (
              <OverflowItem key={tab.id} id={tab.id} priority={tab.id === activeTab ? 2 : 1}>
                <Tab value={tab.id} icon={tab.icon}>
                  {tab.label}{counts[tab.id] > 0 ? ` (${counts[tab.id]})` : ""}
                </Tab>
              </OverflowItem>
            ))}
            <OverflowMenuButton activeTab={activeTab} onSelect={setActiveTab} counts={counts} />
          </TabList>
        </Overflow>
      </div>

      {/* Tab body */}
      <div className={styles.tabBody}>
        {isLoading && (
          <div className={styles.loadingCenter}>
            <Spinner size="small" label="Loading agent details..." />
          </div>
        )}

        {!isLoading && (
          <>
            {/* ── Overview — unified KPI tiles (5 per row, responsive) ── */}
            {activeTab === "overview" && (() => {
              const s = agentConfig?.settings;
              const fmtOrch = (v?: string) => {
                if (!v) return "";
                const l = v.toLowerCase();
                return l === "generative" || l === "1" ? "Generative" : l === "classic" || l === "0" ? "Classic" : v;
              };

              type KpiItem = { label: string; value: string | number; tooltip: string };
              const kpis: KpiItem[] = [
                {
                  label: s?.isGenerativeDesigner ? "Skills" : "Topics",
                  value: s?.isGenerativeDesigner ? skills.length : topics.length,
                  tooltip: s?.isGenerativeDesigner
                    ? "Number of skills available to this new-designer (generative) agent. Skills are reusable capabilities the agent can invoke during a conversation."
                    : "Number of custom topics that define conversational flows and user intents for this agent. Topics are triggered when users ask questions matching their intent phrases.",
                },
                {
                  label: "Tools", value: tools.length,
                  tooltip: "Number of actions and tools the agent can use during conversations — including Power Automate flows, connectors, AI prompts, and MCP servers.",
                },
                {
                  label: "Knowledge", value: knowledge.length,
                  tooltip: "Number of knowledge sources connected to this agent for generative answers, such as SharePoint documents, public websites, and uploaded files.",
                },
                {
                  label: "Child Agents", value: agents.length,
                  tooltip: "Number of agents connected to this agent. Child agents are orchestrated by this agent; connected agents are peer agents called via the connected agent action.",
                },
              ];

              if (s?.orchestrationType) kpis.push({
                label: "Orchestration", value: fmtOrch(s.orchestrationType),
                tooltip: "Controls how the agent routes conversations to topics. Generative orchestration uses AI to dynamically select the best topic. Classic orchestration uses trigger phrases for deterministic routing.",
              });
              if (s?.language) kpis.push({
                label: "Language", value: s.language,
                tooltip: "The primary language the agent uses to understand user input and generate responses. Copilot Studio supports 50+ languages.",
              });
              if (s?.authenticationMode) kpis.push({
                label: "Authentication", value: s.authenticationMode,
                tooltip: "Determines how users are authenticated when interacting with the agent. Options include No Authentication, Microsoft Entra ID, and Generic OAuth2.",
              });
              if (s?.useModelKnowledge !== undefined) kpis.push({
                label: "Model Knowledge", value: s.useModelKnowledge ? "Enabled" : "Disabled",
                tooltip: "When enabled, the agent uses the AI model's built-in knowledge (training data up to the model's cutoff) to answer questions when no configured knowledge source has a match.",
              });
              if (s?.isSemanticSearchEnabled !== undefined) kpis.push({
                label: "Semantic Search", value: s.isSemanticSearchEnabled ? "Enabled" : "Disabled",
                tooltip: "When enabled, the agent uses semantic (meaning-based) search across knowledge sources instead of keyword matching, improving answer relevance for natural language queries.",
              });
              if (s?.optInUseLatestModels !== undefined) kpis.push({
                label: "Latest AI Models", value: s.optInUseLatestModels ? "Opted in" : "Default",
                tooltip: "When opted in, the agent automatically adopts the latest AI model versions released by Microsoft, gaining improved capabilities as new models become available.",
              });
              if (s?.isMemoryEnabled !== undefined) kpis.push({
                label: "Memory", value: s.isMemoryEnabled ? "Enabled" : "Disabled",
                tooltip: "When enabled, this new-designer (generative) agent remembers key details across turns and sessions, so users don't have to repeat information already shared.",
              });

              return (
                <div className={styles.kpiRow}>
                  {kpis.map(({ label, value, tooltip }) => (
                    <div key={label} className={styles.kpiTile}>
                      <div className={styles.kpiLabelRow}>
                        <Text size={200} className={styles.kpiLabel}>{label}</Text>
                        <Tooltip content={tooltip} relationship="description" positioning="above-start">
                          <Button
                            appearance="transparent"
                            size="small"
                            className={styles.kpiInfoIcon}
                            aria-label={`More information about ${label}`}
                          >
                            <Info16Regular aria-hidden="true" />
                          </Button>
                        </Tooltip>
                      </div>
                      <Text size={400} weight="semibold" className={styles.kpiValue}>{value}</Text>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* ── Instructions ── */}
            {activeTab === "instructions" && (
              instrs
                ? <div className={styles.instructionsBox}>{instrs}</div>
                : <span className={styles.emptyState}>No agent instructions defined.</span>
            )}

            {/* ── Topics — always expanded flat cards, no accordion ── */}
            {activeTab === "topics" && (
              topics.length === 0
                ? <span className={styles.emptyState}>No user-defined topics found.</span>
                : topics.map((t) => (
                    <div key={t.topicName} className={styles.itemCard}>
                      <div className={styles.itemHeader}>
                        <span className={styles.itemName}>{t.modelName || t.topicName}</span>
                        <Badge
                          appearance="tint"
                          color={t.status === "Enabled" ? "success" : "subtle"}
                          size="small"
                        >
                          {t.status ?? "Enabled"}
                        </Badge>
                      </div>
                      <div className={styles.topicPanel}>
                        {t.modelDescription && (
                          <Text size={200} style={{ color: tokens.colorNeutralForeground2, lineHeight: tokens.lineHeightBase300 }}>
                            {t.modelDescription}
                          </Text>
                        )}
                        {t.inputVariables && t.inputVariables.length > 0 && (
                          <div>
                            <span className={styles.varLabel}>Inputs</span>
                            <div className={styles.varRow}>
                              {t.inputVariables.map((v) => <span key={v.name} className={styles.varChip}>{v.name}</span>)}
                            </div>
                          </div>
                        )}
                        {t.outputVariables && t.outputVariables.length > 0 && (
                          <div>
                            <span className={styles.varLabel}>Outputs</span>
                            <div className={styles.varRow}>
                              {t.outputVariables.map((v) => <span key={v.name} className={styles.varChip}>{v.name}</span>)}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
            )}

            {/* ── Skills — new designer (generative) agents (InlineAgentSkill) ── */}
            {activeTab === "skills" && (
              skills.length === 0
                ? <span className={styles.emptyState}>No skills configured.</span>
                : skills.map((sk) => (
                    <div key={sk.name} className={styles.itemCard}>
                      <div className={styles.itemHeader}>
                        <span className={styles.itemName}>{sk.name}</span>
                        <Badge
                          appearance="tint"
                          color={sk.status === "Enabled" ? "success" : "subtle"}
                          size="small"
                        >
                          {sk.status ?? "Enabled"}
                        </Badge>
                      </div>
                      {sk.description && (
                        <div className={styles.topicPanel}>
                          <Text size={200} style={{ color: tokens.colorNeutralForeground2, lineHeight: tokens.lineHeightBase300 }}>
                            {sk.description}
                          </Text>
                        </div>
                      )}
                    </div>
                  ))
            )}

            {/* ── Tools ── */}
            {activeTab === "tools" && (
              tools.length === 0
                ? <span className={styles.emptyState}>No tools configured.</span>
                : tools.map((tool) => {
                    const cfg = TOOL_BADGE[tool.toolType];
                    return (
                      <div key={tool.name} className={styles.itemCard}>
                        <div className={styles.itemHeader}>
                          <span className={styles.itemName}>{tool.displayName || tool.name}</span>
                          <div style={{ display: "flex", gap: tokens.spacingHorizontalXS, alignItems: "center" }}>
                            <Badge appearance="tint" color={cfg.color} size="small">{cfg.label}</Badge>
                            <Badge
                              appearance="tint"
                              color={tool.status === "Enabled" ? "success" : "subtle"}
                              size="small"
                            >
                              {tool.status ?? "Enabled"}
                            </Badge>
                          </div>
                        </div>
                        {tool.description && <span className={styles.itemDesc}>{tool.description}</span>}
                      </div>
                    );
                  })
            )}

            {/* ── Knowledge ── */}
            {activeTab === "knowledge" && (
              knowledge.length === 0
                ? <span className={styles.emptyState}>No knowledge sources configured.</span>
                : knowledge.map((k) => {
                    const cfg = KNOWLEDGE_BADGE[k.sourceType];
                    return (
                      <div key={k.name} className={styles.itemCard}>
                        <div className={styles.itemHeader}>
                          <span className={styles.itemName}>{k.name}</span>
                          <div style={{ display: "flex", gap: tokens.spacingHorizontalXS, alignItems: "center" }}>
                            <Badge appearance="tint" color={cfg.color} size="small">{cfg.label}</Badge>
                            <Badge
                              appearance="tint"
                              color={k.status === "Enabled" ? "success" : "subtle"}
                              size="small"
                            >
                              {k.status ?? "Enabled"}
                            </Badge>
                          </div>
                        </div>
                        {k.url && (
                          <a href={k.url} target="_blank" rel="noopener noreferrer" className={styles.itemUrl}>{k.url}</a>
                        )}
                      </div>
                    );
                  })
            )}

            {/* ── Agents ── */}
            {activeTab === "agents" && (
              agents.length === 0
                ? <span className={styles.emptyState}>No child agents configured.</span>
                : agents.map((a) => (
                    <div key={a.name} className={styles.itemCard}>
                      <div className={styles.itemHeader}>
                        <span className={styles.itemName}>{a.name}</span>
                        <div style={{ display: "flex", gap: tokens.spacingHorizontalXS, alignItems: "center" }}>
                          {a.relationship && (
                            <Badge appearance="tint" color="informative" size="small">{a.relationship}</Badge>
                          )}
                          <Badge
                            appearance="tint"
                            color={a.status === "Enabled" ? "success" : "subtle"}
                            size="small"
                          >
                            {a.status ?? "Enabled"}
                          </Badge>
                        </div>
                      </div>
                      {a.description && <span className={styles.itemDesc}>{a.description}</span>}
                    </div>
                  ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
