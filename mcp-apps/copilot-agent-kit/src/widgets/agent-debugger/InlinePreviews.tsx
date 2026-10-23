import { makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { useMemo } from "react";
import type { UsageDiagnostics } from "../../agent-debugger/contracts/diagnostics";
import type { ProcessedTurn } from "../../agent-debugger/contracts/transcript";
import type { WorkflowTurn } from "../../agent-debugger/components/flow/WorkflowCanvasModel";
import { InlinePreviewList } from "../../agent-debugger/components/common/InlinePreviewList";
import type { Recommendation, RecommendationSeverity } from "../../agent-debugger/utils/recommendations";
import { fmtMs } from "../../agent-debugger/utils/format-ms";

// Finite, single-line previews of the Debugger tabs for the inline view. Each
// preview fits its row count, so the inline view never scrolls; full screen
// keeps the full tabs.

const useStyles = makeStyles({
  row: {
    display: "flex",
    alignItems: "center",
    columnGap: tokens.spacingHorizontalM,
    flex: "1 1 auto",
    minWidth: 0,
  },
  lead: { flexShrink: 0, fontWeight: tokens.fontWeightSemibold, whiteSpace: "nowrap" },
  text: { flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  meta: {
    flexShrink: 0,
    color: tokens.colorNeutralForeground2,
    whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums",
  },
  failed: { color: tokens.colorPaletteRedForeground1 },
  label: { flexShrink: 0, color: tokens.colorNeutralForeground2, whiteSpace: "nowrap" },
  value: { fontWeight: tokens.fontWeightSemibold },
  severity: {
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    height: "20px",
    paddingLeft: tokens.spacingHorizontalS,
    paddingRight: tokens.spacingHorizontalS,
    borderRadius: tokens.borderRadiusCircular,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    whiteSpace: "nowrap",
  },
  high: { backgroundColor: tokens.colorPaletteRedBackground2, color: tokens.colorPaletteRedForeground2 },
  medium: { backgroundColor: tokens.colorPaletteMarigoldBackground2, color: tokens.colorPaletteMarigoldForeground2 },
  low: { backgroundColor: tokens.colorNeutralBackground3, color: tokens.colorNeutralForeground2 },
});

const SEVERITY_RANK: Record<RecommendationSeverity, number> = { high: 0, medium: 1, low: 2 };
const SEVERITY_LABEL: Record<RecommendationSeverity, string> = { high: "High", medium: "Medium", low: "Low" };

function timeLabel(value: string | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  return new Date(value).toLocaleTimeString();
}

function count(value: number, one: string, other: string): string {
  return `${value} ${value === 1 ? one : other}`;
}

interface PreviewProps {
  /** Rows to show; see `inlinePreviewRows`. */
  maxRows: number;
  /** Opens the full tab in full screen. Without it, the preview pages its rows. */
  onShowAll?: () => void;
}

export function FlowPreview({ turns, maxRows, onShowAll }: PreviewProps & { turns: readonly WorkflowTurn[] }) {
  const styles = useStyles();
  return (
    <InlinePreviewList
      label="Execution flow"
      items={turns}
      maxRows={maxRows}
      noun={{ one: "turn", other: "turns" }}
      getKey={(turn) => turn.id}
      itemTitle={(turn) => `Turn ${turn.turnNumber}: ${turn.rows.map((row) => row.node.title).join(" → ") || "No execution steps"}`}
      renderRow={(turn) => (
        <span className={styles.row}>
          <span className={styles.lead}>Turn {turn.turnNumber}</span>
          <span className={styles.text}>{turn.rows.map((row) => row.node.title).join(" → ") || "No execution steps"}</span>
          <span className={styles.meta}>
            {fmtMs(turn.durationMs)}
            {turn.failedCount ? <span className={styles.failed}>{` · ${turn.failedCount} failed`}</span> : null}
          </span>
        </span>
      )}
      onShowAll={turns.length ? onShowAll : undefined}
      showAllLabel={`View all ${count(turns.length, "turn", "turns")} in full screen`}
      emptyText="No execution steps were recorded in this view."
    />
  );
}

export function ConversationPreview({ turns, maxRows, onShowAll }: PreviewProps & { turns: readonly ProcessedTurn[] }) {
  const styles = useStyles();
  return (
    <InlinePreviewList
      label="Conversation & activities"
      items={turns}
      maxRows={maxRows}
      noun={{ one: "message", other: "messages" }}
      getKey={(turn) => turn.id}
      itemTitle={(turn) => turn.content || "No message text"}
      renderRow={(turn) => (
        <span className={styles.row}>
          <span className={styles.lead}>{turn.role === "user" ? "User" : "Agent"}</span>
          <span className={styles.text}>{turn.content || "No message text"}</span>
          <span className={styles.meta}>{timeLabel(turn.timestamp)}</span>
        </span>
      )}
      onShowAll={turns.length ? onShowAll : undefined}
      showAllLabel={`View all ${count(turns.length, "message", "messages")} in full screen`}
      emptyText="No messages were recorded in this view."
    />
  );
}

export function InsightsPreview({ recommendations, maxRows, onShowAll }: PreviewProps & { recommendations: readonly Recommendation[] }) {
  const styles = useStyles();
  const sorted = useMemo(
    () => [...recommendations].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]),
    [recommendations],
  );
  return (
    <InlinePreviewList
      label="Agent insights"
      items={sorted}
      maxRows={maxRows}
      noun={{ one: "recommendation", other: "recommendations" }}
      getKey={(recommendation) => recommendation.id}
      itemTitle={(recommendation) => recommendation.title}
      renderRow={(recommendation) => (
        <span className={styles.row}>
          <span className={mergeClasses(styles.severity, styles[recommendation.severity] ?? styles.low)}>
            {SEVERITY_LABEL[recommendation.severity] ?? recommendation.severity}
          </span>
          <span className={styles.text}>{recommendation.title}</span>
          {recommendation.turnNumber ? <span className={styles.meta}>Turn {recommendation.turnNumber}</span> : null}
        </span>
      )}
      onShowAll={onShowAll}
      showAllLabel={sorted.length
        ? `View all ${count(sorted.length, "recommendation", "recommendations")} in full screen`
        : "View agent insights in full screen"}
      emptyText="No recommendations for this view."
    />
  );
}

const format = (value: number | undefined) => value === undefined
  ? "Not reported" : value.toLocaleString(undefined, { maximumFractionDigits: 2 });

interface UsageMetric {
  label: string;
  value: string;
  detail?: string;
}

export function UsagePreview({ usage, maxRows, onShowAll }: PreviewProps & { usage: UsageDiagnostics }) {
  const styles = useStyles();
  const metrics = useMemo<UsageMetric[]>(() => {
    const reported = usage.reported;
    return [
      {
        label: "Estimated Copilot Credits",
        value: usage.estimatedCredits === undefined ? "Not available" : format(usage.estimatedCredits),
        detail: usage.confidence === "none" ? "No estimate" : `${usage.confidence === "low" ? "Low" : "Medium"} confidence`,
      },
      { label: "Copilot Credits", value: format(reported.copilotCredits) },
      { label: "AI Builder credits", value: format(reported.aiBuilderCredits) },
      { label: "Total tokens", value: format(reported.totalTokens) },
      { label: "Prompt tokens", value: format(reported.promptTokens) },
      { label: "Completion tokens", value: format(reported.completionTokens) },
      { label: "Models reported", value: reported.models.join(", ") || "Not reported" },
    ];
  }, [usage]);
  return (
    <InlinePreviewList
      label="Usage and credits"
      caption="Diagnostic estimate, not a billing statement. Missing metrics are not zero."
      items={metrics}
      maxRows={maxRows}
      noun={{ one: "metric", other: "metrics" }}
      getKey={(metric) => metric.label}
      itemTitle={(metric) => `${metric.label}: ${metric.value}${metric.detail ? ` (${metric.detail})` : ""}`}
      renderRow={(metric) => (
        <span className={styles.row}>
          <span className={styles.label}>{metric.label}</span>
          <span className={mergeClasses(styles.text, styles.value)}>{metric.value}</span>
          {metric.detail ? <span className={styles.meta}>{metric.detail}</span> : null}
        </span>
      )}
      onShowAll={onShowAll}
      showAllLabel="View all usage details in full screen"
    />
  );
}
