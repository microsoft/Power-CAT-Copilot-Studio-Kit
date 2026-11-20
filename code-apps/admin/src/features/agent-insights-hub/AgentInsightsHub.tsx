/**
 * AgentInsightsHub - Root shell component for the Agent Insights Hub feature.
 * Thin layout shell: providers -> header with tabs -> filter bar -> tab content.
 * All tab content is lazy-loaded via React.lazy + Suspense.
 * "Logs" overflow menu holds Sync Logs + Transcripts Staging per Fluent UI v9.
 */
import { lazy, Suspense, useState, useCallback } from "react";
import {
  makeStyles, tokens, Title3, Body1, TabList, Tab, Spinner, Button, Tooltip,
  Menu, MenuTrigger, MenuPopover, MenuList, MenuItem,
  type SelectTabData, type SelectTabEvent,
} from "@fluentui/react-components";
import {
  MoreHorizontal20Regular, QuestionCircle20Regular, DataUsage20Regular,
} from "@fluentui/react-icons";
import { useNavigate } from "react-router-dom";
import { FilterProvider } from "./context/FilterContext";
import { DialogProvider, useDialogContext } from "./context/DialogContext";
import type { AgentConfiguration, TranscriptMetrics } from "./contracts/types";
import FilterBar from "./components/FilterBar";
import { useUsageHistory } from "./hooks/useUsageHistory";
import GenerateMetricsDialog from "./components/dialogs/GenerateMetricsDialog";
import AddAgentDialog from "./components/dialogs/AddAgentDialog";
import ShowAgentsDialog from "./components/dialogs/ShowAgentsDialog";
import FeedbackDialog from "./components/dialogs/FeedbackDialog";
import ErrorBoundary from "./components/ErrorBoundary";
import { useFeatureTelemetry } from "../../shared/hooks/useFeatureTelemetry";

// Lazy tab imports (module-level, never inside render)
const OverviewTab = lazy(() => import("./components/tabs/OverviewTab"));
const DailyMetricsTab = lazy(() => import("./components/tabs/DailyMetricsTab"));
const TopicsTab = lazy(() => import("./components/tabs/TopicsTab"));
const ActionsTab = lazy(() => import("./components/tabs/ActionsTab"));
const ToolsTab = lazy(() => import("./components/tabs/ToolsTab"));
const ErrorsTab = lazy(() => import("./components/tabs/ErrorsTab"));
const TranscriptsTab = lazy(() => import("./components/tabs/TranscriptsTab"));
const UsageHistoryTab = lazy(() => import("./components/tabs/UsageHistoryTab"));
const SyncLogsTab = lazy(() => import("./components/tabs/SyncLogsTab"));
const TranscriptsStagingTab = lazy(() => import("./components/tabs/TranscriptsStagingTab"));

const TAB_IDS = [
  "overview", "daily-metrics", "topics", "tools", "actions",
  "errors", "transcripts", "usage-history",
] as const;

const OVERFLOW_TAB_IDS = ["sync-logs", "transcripts-staging"] as const;

type TabId = (typeof TAB_IDS)[number] | (typeof OVERFLOW_TAB_IDS)[number];

const TAB_LABELS: Record<TabId, string> = {
  "overview": "Overview", "daily-metrics": "Daily Metrics", "topics": "Topics",
  "tools": "Tools", "actions": "Actions", "errors": "Errors",
  "transcripts": "Transcripts", "usage-history": "Usage History",
  "sync-logs": "Sync Logs", "transcripts-staging": "Transcripts Staging",
};

const TAB_COMPONENTS: Record<TabId, React.LazyExoticComponent<React.ComponentType>> = {
  "overview": OverviewTab, "daily-metrics": DailyMetricsTab, "topics": TopicsTab,
  "actions": ActionsTab, "tools": ToolsTab, "errors": ErrorsTab,
  "transcripts": TranscriptsTab, "usage-history": UsageHistoryTab,
  "transcripts-staging": TranscriptsStagingTab, "sync-logs": SyncLogsTab,
};

const OVERFLOW_SET: ReadonlySet<TabId> = new Set(OVERFLOW_TAB_IDS);
const TABS_WITHOUT_FILTER: ReadonlySet<TabId> = new Set(["sync-logs", "usage-history", "transcripts-staging"]);

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    minHeight: "100%",
    backgroundColor: tokens.colorNeutralBackground3,
  },
  header: {
    display: "flex",
    flexDirection: "column",
    maxWidth: "1280px",
    width: "100%",
    marginLeft: "auto",
    marginRight: "auto",
    paddingTop: tokens.spacingVerticalM,
    paddingRight: tokens.spacingHorizontalXL,
    paddingBottom: tokens.spacingVerticalNone,
    paddingLeft: tokens.spacingHorizontalXL,
  },
  titleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    margin: "0",
  },
  description: {
    color: tokens.colorNeutralForeground3,
    marginBottom: tokens.spacingVerticalXXXL,
  },
  tabRow: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
  },
  content: {
    flex: "1 1 auto",
    backgroundColor: tokens.colorNeutralBackground3,
    maxWidth: "1280px",
    width: "100%",
    marginLeft: "auto",
    marginRight: "auto",
    paddingTop: tokens.spacingVerticalM,
    paddingRight: tokens.spacingHorizontalXL,
    paddingBottom: tokens.spacingVerticalM,
    paddingLeft: tokens.spacingHorizontalXL,
  },
});

function TabContent({ activeTab }: { activeTab: TabId }) {
  const ActiveComponent = TAB_COMPONENTS[activeTab];
  return (
    <ErrorBoundary key={activeTab}>
      <Suspense fallback={<Spinner label="Loading tab..." />}>
        <ActiveComponent />
      </Suspense>
    </ErrorBoundary>
  );
}

function DialogOutlet() {
  const { activeDialog, dialogData, closeDialog, openDialog } = useDialogContext();
  const [editConfig, setEditConfig] = useState<AgentConfiguration | undefined>(undefined);
  const [openedFromShowAgents, setOpenedFromShowAgents] = useState(false);

  const handleShowAgentsEdit = useCallback((config: AgentConfiguration) => {
    setEditConfig(config);
    setOpenedFromShowAgents(true);
    openDialog("addAgent");
  }, [openDialog]);

  const handleAddAgentClose = useCallback(() => {
    setEditConfig(undefined);
    if (openedFromShowAgents) {
      setOpenedFromShowAgents(false);
      openDialog("showAgents");
    } else {
      closeDialog();
    }
  }, [closeDialog, openDialog, openedFromShowAgents]);

  const handleShowAgentsAddAgent = useCallback(() => {
    setEditConfig(undefined);
    setOpenedFromShowAgents(true);
    openDialog("addAgent");
  }, [openDialog]);

  return (
    <>
      {activeDialog === "generateMetrics" && <GenerateMetricsDialog onClose={closeDialog} />}
      {activeDialog === "addAgent" && (
        <AddAgentDialog
          mode={editConfig?.cat_copilotconfigurationid ? "edit" : "create"}
          editData={editConfig}
          onClose={handleAddAgentClose}
        />
      )}
      {activeDialog === "showAgents" && (
        <ShowAgentsDialog onClose={closeDialog} onEdit={handleShowAgentsEdit} onAddAgent={handleShowAgentsAddAgent} />
      )}
      {activeDialog === "feedback" && (
        <FeedbackDialog data={(dialogData as TranscriptMetrics[]) ?? []} onClose={closeDialog} />
      )}
    </>
  );
}

function InsightsShell() {
  const styles = useStyles();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const navigate = useNavigate();

  const { data: usageHistoryData } = useUsageHistory();
  const hasUsageHistory = (usageHistoryData?.length ?? 0) > 0;
  const visibleTabs = hasUsageHistory ? TAB_IDS : TAB_IDS.filter((id) => id !== "usage-history");

  const handleTabSelect = useCallback((_: SelectTabEvent, data: SelectTabData) => {
    setActiveTab(data.value as TabId);
  }, []);

  const showFilter = !TABS_WITHOUT_FILTER.has(activeTab);
  const isOverflowTab = OVERFLOW_SET.has(activeTab);

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <Title3 as="h1" className={styles.title}>Agent Insights Hub</Title3>
          <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS }}>
            <Tooltip content="Opens Dashboard & forecasting — build custom dashboards, track metrics, and forecast trends" relationship="description">
              <Button
                appearance="secondary"
                icon={<DataUsage20Regular />}
                onClick={() => navigate('/agent-metric-studio')}
              >
                Build dashboard &amp; forecast
              </Button>
            </Tooltip>
            <Tooltip content="Help" relationship="label">
              <Button
                appearance="transparent"
                icon={<QuestionCircle20Regular />}
                aria-label="Help"
                onClick={() => window.open("https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/AGENT_INSIGHTS_HUB.md", "_blank", "noopener,noreferrer")}
              />
            </Tooltip>
          </div>
        </div>
        <Body1 className={styles.description}>
          Monitor agent performance, usage metrics, and conversation analytics across your Copilot Studio agents.
        </Body1>
        <div className={styles.tabRow}>
          <TabList appearance="subtle" size="medium" selectedValue={activeTab} onTabSelect={handleTabSelect}>
            {visibleTabs.map((id) => (
              <Tab key={id} value={id}>{TAB_LABELS[id]}</Tab>
            ))}
            {isOverflowTab && <Tab key={activeTab} value={activeTab}>{TAB_LABELS[activeTab]}</Tab>}
          </TabList>
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <Button role="tab" appearance="transparent" icon={<MoreHorizontal20Regular />} aria-label="More tabs" />
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                {OVERFLOW_TAB_IDS.filter((id) => id !== activeTab).map((id) => (
                  <MenuItem key={id} onClick={() => setActiveTab(id)}>{TAB_LABELS[id]}</MenuItem>
                ))}
              </MenuList>
            </MenuPopover>
          </Menu>
        </div>
      </div>

      <div className={styles.content}>
        {showFilter && <FilterBar />}
        <TabContent activeTab={activeTab} />
      </div>

      <DialogOutlet />
    </div>
  );
}

export default function AgentInsightsHub() {
  useFeatureTelemetry('agent-insights-hub', 'Agent Insights Hub');
  return (
    <FilterProvider>
      <DialogProvider>
        <InsightsShell />
      </DialogProvider>
    </FilterProvider>
  );
}
