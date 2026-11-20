/**
 * TranscriptsTab - Session transcript metrics per Figma design (319:24281).
 *
 * Layout: metrics-card (5 KPIs with trends) → conversation-outcomes (left KPIs + right area chart)
 *         → row(engagement-breakdown + session-outcomes)
 *         → row(survey-satisfaction-score + satisfaction-score-trend) → data-table.
 */

import { useMemo } from "react";
import {
  makeStyles, tokens, Card, CardHeader, Subtitle2, Button, Badge, Tooltip, Text,
} from "@fluentui/react-components";
import {
  Comment20Regular, Info16Regular,
  BotSparkle20Regular, TasksApp20Regular, Bot20Regular,
} from "@fluentui/react-icons";
import { useFilterContext } from "../../context/FilterContext";
import { useTableHasData } from "../../hooks/useTableHasData";
import { useDialogContext } from "../../context/DialogContext";
import { useTranscriptMetrics } from "../../hooks/useTranscriptMetrics";
import { formatNumber, safeDiv, calculateTrend } from "../../utils/metricCalculations";
import { transcriptsExportColumns } from "../../utils/exportColumns";
import { SESSION_OUTCOME_COLORS, CHANNEL_DISPLAY_NAMES, CSAT_COLORS } from "../../contracts/types";
import { StackedBarChart } from "@fluentui/react-charting";
import { TRANSCRIPT_METRICS, TRANSCRIPT_CHARTS, TAB_DESCRIPTIONS } from "../../utils/metricDescriptions";
import type { GridColumn, TranscriptMetrics, ConnectedAgentDetail } from "../../contracts/types";
import MetricCard from "../MetricCard";
import ChartCard from "../ChartCard";
import FluentAreaChart from "../charts/FluentAreaChart";
import FluentDonutChart from "../charts/FluentDonutChart";
import FluentDataGrid from "../FluentDataGrid";
import LoadingSpinner from "../LoadingSpinner";
import EmptyStates from "../EmptyStates";


const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalL },
  headerRow: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS },
  infoIcon: { color: tokens.colorNeutralForeground3, cursor: "help", display: "flex", alignItems: "center" },
  metricsRow: { display: "flex", gap: tokens.spacingHorizontalL, flexWrap: "wrap", alignItems: "stretch" },
  colorResolved: { color: tokens.colorBrandForeground1 },
  colorEscalated: { color: tokens.colorPaletteBerryForeground1 },
  colorAbandoned: { color: tokens.colorPaletteTealForeground2 },
  trendBody: { display: "flex", gap: tokens.spacingHorizontalL, padding: `0 ${tokens.spacingHorizontalM} ${tokens.spacingVerticalM}` },
  trendKpis: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS, minWidth: "160px" },
  trendChart: { flex: "1 1 0", minWidth: 0, overflow: "hidden", minHeight: "200px" },
  chartRow: { display: "flex", gap: tokens.spacingHorizontalL, flexWrap: "wrap" },
  chartHalf: { flex: "1 1 0", minWidth: "300px" },
  chartLeft: { flex: "0 0 334px", minWidth: "300px" },
  chartRight: { flex: "1 1 0", minWidth: "300px" },
  surveyBody: { display: "flex", flexDirection: "column", justifyContent: "center", gap: tokens.spacingVerticalS, padding: `0 ${tokens.spacingHorizontalM} ${tokens.spacingVerticalM}`, flex: "1 1 auto" },
  typeCell: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS },
});

/** Formats a duration in seconds to a human-readable string (e.g. "13 sec", "2 min 5 sec"). */
function formatDurationSec(seconds: number): string {
  if (seconds <= 0) return "0 sec";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s} sec`;
  if (s === 0) return `${m} min`;
  return `${m} min ${s} sec`;
}

/** Returns the appropriate icon element for a connected-agent type string. */
function AgentTypeIcon({ type }: { type: string }) {
  const lower = type.toLowerCase();
  if (lower === "child") return <TasksApp20Regular />;
  if (lower.includes("copilot") || lower.includes("studio")) return <BotSparkle20Regular />;
  return <Bot20Regular />;
}

function fmtRate(value: number, total: number): string {
  if (total === 0) return "0";
  return ((value / total) * 100).toFixed(1);
}

function calcTrend(current: number, previous: number) {
  return calculateTrend(current, previous);
}

interface Agg {
  sessions: number; engaged: number; resolved: number; escalated: number;
  abandoned: number; unengaged: number; totalTurns: number; totalConversations: number;
  csatScoreSum: number; csatCount: number; likeCount: number; dislikeCount: number;
}

function aggregateSlice(data: TranscriptMetrics[]): Agg {
  let totalConversations = 0, sessions = 0, engaged = 0, resolved = 0;
  let escalated = 0, abandoned = 0, unengaged = 0, totalTurns = 0;
  let csatScoreSum = 0, csatCount = 0, likeCount = 0, dislikeCount = 0;
  for (const d of data) {
    totalConversations += d.cat_totalconversations ?? 0;
    sessions += d.cat_sessioncount ?? 0;
    engaged += d.cat_engagedcount ?? 0;
    unengaged += d.cat_unengagedcount ?? 0;
    resolved += d.cat_resolvedcount ?? 0;
    escalated += d.cat_escalatedcount ?? 0;
    abandoned += d.cat_abandonedcount ?? 0;
    totalTurns += d.cat_totalturns ?? 0;
    csatScoreSum += d.cat_csatscore ?? 0;
    csatCount += d.cat_csatcount ?? 0;
    likeCount += d.cat_feedbacklikecount ?? 0;
    dislikeCount += d.cat_feedbackdislikecount ?? 0;
  }
  return { totalConversations, sessions, engaged, resolved, escalated, abandoned, unengaged, totalTurns, csatScoreSum, csatCount, likeCount, dislikeCount };
}

function estimateSatisfactionBreakdown(avgScore: number, total: number) {
  if (total === 0) return { dissatisfied: 0, neutral: 0, satisfied: 0 };
  let satisfied: number, neutral: number, dissatisfied: number;
  if (avgScore >= 4) {
    satisfied = Math.round(total * 0.85); neutral = Math.round(total * 0.1); dissatisfied = total - satisfied - neutral;
  } else if (avgScore >= 3) {
    satisfied = Math.round(total * 0.5); neutral = Math.round(total * 0.3); dissatisfied = total - satisfied - neutral;
  } else {
    satisfied = Math.round(total * 0.2); neutral = Math.round(total * 0.3); dissatisfied = total - satisfied - neutral;
  }
  return { dissatisfied, neutral, satisfied };
}

export default function TranscriptsTab() {
  const filterCtx = useFilterContext();
  const { data: tableHasData } = useTableHasData("transcripts");
  const { openDialog } = useDialogContext();
  const { data, isLoading } = useTranscriptMetrics(filterCtx);
  const styles = useStyles();

  // Aggregate KPIs + compute trends by splitting data into halves by date
  const { kpis, trends } = useMemo(() => {
    const all = data ?? [];
    const sorted = [...all].sort((a, b) => a.cat_conversationdate.localeCompare(b.cat_conversationdate));
    const mid = Math.floor(sorted.length / 2);
    const prev = aggregateSlice(sorted.slice(0, mid));
    const curr = aggregateSlice(sorted.slice(mid));
    const full = aggregateSlice(all);

    const avgTurns = safeDiv(full.totalTurns, full.sessions);
    const csatScore = safeDiv(full.csatScoreSum, full.csatCount);
    const currAvgTurns = safeDiv(curr.totalTurns, curr.sessions);
    const prevAvgTurns = safeDiv(prev.totalTurns, prev.sessions);
    const currCsatScore = safeDiv(curr.csatScoreSum, curr.csatCount);
    const prevCsatScore = safeDiv(prev.csatScoreSum, prev.csatCount);

    return {
      kpis: {
        ...full, avgTurns, csatScore, feedbackCount: full.likeCount + full.dislikeCount,
        engagementRate: fmtRate(full.engaged, full.sessions),
        resolutionRate: fmtRate(full.resolved, full.sessions),
        escalationRate: fmtRate(full.escalated, full.sessions),
        abandonmentRate: fmtRate(full.abandoned, full.sessions),
      },
      trends: {
        sessions: calcTrend(curr.sessions, prev.sessions).percentageChange,
        engaged: calcTrend(curr.engaged, prev.engaged).percentageChange,
        resolved: calcTrend(curr.resolved, prev.resolved).percentageChange,
        escalated: calcTrend(curr.escalated, prev.escalated).percentageChange,
        abandoned: calcTrend(curr.abandoned, prev.abandoned).percentageChange,
        avgTurns: calcTrend(currAvgTurns, prevAvgTurns).percentageChange,
        feedback: calcTrend(curr.likeCount + curr.dislikeCount, prev.likeCount + prev.dislikeCount).percentageChange,
        csatScore: calcTrend(currCsatScore, prevCsatScore).percentageChange,
        sessionsNew: calcTrend(curr.sessions, prev.sessions).isNewMetric,
        engagedNew: calcTrend(curr.engaged, prev.engaged).isNewMetric,
        resolvedNew: calcTrend(curr.resolved, prev.resolved).isNewMetric,
        escalatedNew: calcTrend(curr.escalated, prev.escalated).isNewMetric,
        abandonedNew: calcTrend(curr.abandoned, prev.abandoned).isNewMetric,
        avgTurnsNew: calcTrend(currAvgTurns, prevAvgTurns).isNewMetric,
        feedbackNew: calcTrend(curr.likeCount + curr.dislikeCount, prev.likeCount + prev.dislikeCount).isNewMetric,
        csatScoreNew: calcTrend(currCsatScore, prevCsatScore).isNewMetric,
      },
    };
  }, [data]);

  const hasCsat = kpis.csatCount > 0;

  // Autonomous agents KPIs aggregated across all records in the current filter
  const autonomousKpis = useMemo(() => {
    const all = data ?? [];
    let totalRuns = 0;
    let totalSuccessful = 0;
    let weightedDurationSum = 0;
    let durationWeight = 0;
    for (const d of all) {
      const runs = d.cat_runs ?? 0;
      totalRuns += runs;
      totalSuccessful += d.cat_successfulruns ?? 0;
      if (runs > 0 && d.cat_averagedurationseconds != null) {
        weightedDurationSum += d.cat_averagedurationseconds * runs;
        durationWeight += runs;
      }
    }
    const successRate = totalRuns > 0 ? Math.round((totalSuccessful / totalRuns) * 100) : 0;
    const avgDurationSec = durationWeight > 0 ? weightedDurationSum / durationWeight : 0;
    return { totalRuns, successRate, avgDurationSec };
  }, [data]);

  const hasAutonomousData = autonomousKpis.totalRuns > 0;

  // Connected agents: parse and aggregate the JSON arrays from all records
  const connectedAgentRows = useMemo((): Array<ConnectedAgentDetail & { successRate: string }> => {
    const map = new Map<string, { count: number; success: number }>();
    for (const d of data ?? []) {
      if (!d.cat_connectedagentdetails) continue;
      let parsed: ConnectedAgentDetail[] = [];
      try { parsed = JSON.parse(d.cat_connectedagentdetails); } catch { continue; }
      for (const entry of parsed) {
        const key = `${entry.Agent}||${entry.Type}`;
        const ex = map.get(key) ?? { count: 0, success: 0 };
        ex.count += entry.Count ?? 0;
        ex.success += entry.Success ?? 0;
        map.set(key, ex);
      }
    }
    return Array.from(map.entries()).map(([key, v]) => {
      const [Agent, Type] = key.split("||");
      const rate = v.count > 0 ? Math.round((v.success / v.count) * 100) : 0;
      return { Agent, Type, Count: v.count, Success: v.success, successRate: `${rate}%` };
    }).sort((a, b) => b.Count - a.Count);
  }, [data]);

  const hasConnectedAgents = connectedAgentRows.length > 0;

  // Conversation outcomes: stacked area chart with custom hover (XX.X% (count sessions))
  const outcomesTrendSeries = useMemo(() => {
    if (!data?.length) return [];
    const map = new Map<string, { resolved: number; escalated: number; abandoned: number; unengaged: number }>();
    for (const d of data) {
      const key = d.cat_conversationdate.substring(0, 10);
      const ex = map.get(key) ?? { resolved: 0, escalated: 0, abandoned: 0, unengaged: 0 };
      ex.resolved += d.cat_resolvedcount ?? 0;
      ex.escalated += d.cat_escalatedcount ?? 0;
      ex.abandoned += d.cat_abandonedcount ?? 0;
      ex.unengaged += d.cat_unengagedcount ?? 0;
      map.set(key, ex);
    }
    const sorted = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
    const fmt = (count: number, total: number) => {
      const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0.0";
      return `${pct}% (${count.toLocaleString()} sessions)`;
    };
    return [
      { legend: "Resolved", data: sorted.map(([d, v]) => { const t = v.resolved + v.escalated + v.abandoned + v.unengaged; return { x: new Date(d), y: v.resolved, yAxisCalloutData: fmt(v.resolved, t) }; }), color: SESSION_OUTCOME_COLORS.resolved },
      { legend: "Escalated", data: sorted.map(([d, v]) => { const t = v.resolved + v.escalated + v.abandoned + v.unengaged; return { x: new Date(d), y: v.escalated, yAxisCalloutData: fmt(v.escalated, t) }; }), color: SESSION_OUTCOME_COLORS.escalated },
      { legend: "Abandoned", data: sorted.map(([d, v]) => { const t = v.resolved + v.escalated + v.abandoned + v.unengaged; return { x: new Date(d), y: v.abandoned, yAxisCalloutData: fmt(v.abandoned, t) }; }), color: SESSION_OUTCOME_COLORS.abandoned },
      { legend: "Unengaged", data: sorted.map(([d, v]) => { const t = v.resolved + v.escalated + v.abandoned + v.unengaged; return { x: new Date(d), y: v.unengaged, yAxisCalloutData: fmt(v.unengaged, t) }; }), color: SESSION_OUTCOME_COLORS.unengaged },
    ];
  }, [data]);

  const engagementDonut = useMemo(() => [
    { legend: "Engaged", data: kpis.engaged, color: SESSION_OUTCOME_COLORS.resolved },
    { legend: "Unengaged", data: kpis.unengaged, color: SESSION_OUTCOME_COLORS.unengaged },
  ], [kpis.engaged, kpis.unengaged]);

  const outcomesDonut = useMemo(() => [
    { legend: "Resolved", data: kpis.resolved, color: SESSION_OUTCOME_COLORS.resolved },
    { legend: "Escalated", data: kpis.escalated, color: SESSION_OUTCOME_COLORS.escalated },
    { legend: "Abandoned", data: kpis.abandoned, color: SESSION_OUTCOME_COLORS.abandoned },
  ], [kpis.resolved, kpis.escalated, kpis.abandoned]);

  const scoreTrendSeries = useMemo(() => {
    if (!data?.length || !hasCsat) return [];
    const map = new Map<string, { scoreSum: number; count: number }>();
    for (const d of data) {
      const cc = d.cat_csatcount ?? 0;
      if (cc === 0) continue;
      const key = d.cat_conversationdate.substring(0, 10);
      const ex = map.get(key) ?? { scoreSum: 0, count: 0 };
      ex.scoreSum += d.cat_csatscore ?? 0;
      ex.count += cc;
      map.set(key, ex);
    }
    const sorted = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-45);
    return [{
      legend: "Avg Score",
      data: sorted.map(([d, v]) => ({ x: new Date(d), y: Math.round(safeDiv(v.scoreSum, v.count) * 10) / 10 })),
      color: SESSION_OUTCOME_COLORS.resolved,
    }];
  }, [data, hasCsat]);

  const satisfactionBreakdown = useMemo(
    () => estimateSatisfactionBreakdown(kpis.csatScore, kpis.csatCount),
    [kpis.csatScore, kpis.csatCount],
  );

  // Table columns matching ExistingSrcCode with colored outcome cells + Badge data source
  const columns = useMemo((): GridColumn<Record<string, unknown>>[] => [
    { key: "cat_conversationdate", label: "Conversation Date", width: "130px", sortable: true,
      render: (r) => new Date(String(r.cat_conversationdate)).toLocaleDateString() },
    { key: "cat_channelid", label: "Channel", width: "100px", sortable: true,
      render: (r) => CHANNEL_DISPLAY_NAMES[String(r.cat_channelid)] ?? String(r.cat_channelid) },
    { key: "cat_datasourcecode", label: "Data Source", width: "100px", sortable: true,
      render: (r) => (
        <Badge appearance="tint" color={Number(r.cat_datasourcecode) === 1 ? "success" : "warning"} size="small">
          {Number(r.cat_datasourcecode) === 1 ? "Production" : "Test Data"}
        </Badge>
      ) },
    { key: "cat_engagedcount", label: "Engaged Count", width: "115px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_engagedcount ?? 0)) },
    { key: "cat_resolvedcount", label: "Resolved Count", width: "115px", sortable: true, alignment: "end",
      render: (r) => <span className={styles.colorResolved}>{formatNumber(Number(r.cat_resolvedcount ?? 0))}</span> },
    { key: "cat_escalatedcount", label: "Escalated Count", width: "120px", sortable: true, alignment: "end",
      render: (r) => <span className={styles.colorEscalated}>{formatNumber(Number(r.cat_escalatedcount ?? 0))}</span> },
    { key: "cat_abandonedcount", label: "Abandoned Count", width: "125px", sortable: true, alignment: "end",
      render: (r) => <span className={styles.colorAbandoned}>{formatNumber(Number(r.cat_abandonedcount ?? 0))}</span> },
    { key: "cat_unengagedcount", label: "Unengaged Count", width: "125px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_unengagedcount ?? 0)) },
    { key: "cat_totalturns", label: "Total Turns", width: "95px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_totalturns ?? 0)) },
    { key: "cat_feedbacklikecount", label: "Feedback Like Count", width: "145px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_feedbacklikecount ?? 0)) },
    { key: "cat_feedbackdislikecount", label: "Feedback Dislike Count", width: "160px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.cat_feedbackdislikecount ?? 0)) },
    { key: "cat_csatscore", label: "CSAT Score", width: "80px", sortable: true, alignment: "end",
      render: (r) => Number(r.cat_csatscore ?? 0) > 0 ? formatNumber(Number(r.cat_csatscore)) : "" },
    { key: "cat_csatcount", label: "CSAT Count", width: "80px", sortable: true, alignment: "end",
      render: (r) => Number(r.cat_csatcount ?? 0) > 0 ? formatNumber(Number(r.cat_csatcount)) : "" },
  ], []);

  // Connected agents grid columns
  const connectedAgentColumns = useMemo((): GridColumn<Record<string, unknown>>[] => [
    { key: "Agent", label: "Name", width: "220px", sortable: true },
    { key: "Type", label: "Type", width: "160px", sortable: true,
      render: (r) => (
        <span className={styles.typeCell}>
          <AgentTypeIcon type={String(r.Type ?? "")} />
          <Text size={200}>{String(r.Type ?? "")}</Text>
        </span>
      ),
      searchValue: (r) => String(r.Type ?? "") },
    { key: "Count", label: "Calls", width: "90px", sortable: true, alignment: "end",
      render: (r) => formatNumber(Number(r.Count ?? 0)) },
    { key: "successRate", label: "Success rate", width: "110px", sortable: true, alignment: "end" },
  ], [styles.typeCell]);

  if (!filterCtx.configurations.length && !filterCtx.loadingConfigurations) return <EmptyStates variant={filterCtx.configurationsError ? "no-data" : "no-configs"} />;
  if (isLoading) return <LoadingSpinner label="Loading transcript metrics..." />;
  if (!data?.length) return <EmptyStates variant={tableHasData ? "no-filter-results" : "no-data"} />;

  const satTotal = satisfactionBreakdown.dissatisfied + satisfactionBreakdown.neutral + satisfactionBreakdown.satisfied;

  return (
    <div className={styles.root}>
      {/* 1. Metrics card — KPIs with trends */}
      <Card appearance="filled">
        <CardHeader header={<div className={styles.headerRow}><Subtitle2>Transcript metrics</Subtitle2><Tooltip content={TAB_DESCRIPTIONS.transcripts} relationship="description"><span className={styles.infoIcon}><Info16Regular /></span></Tooltip></div>} />
        <div className={styles.metricsRow}>
          <MetricCard label="Conversation sessions" value={formatNumber(kpis.sessions)} tooltip={TRANSCRIPT_METRICS.sessions} trend={trends.sessions} isNewMetric={trends.sessionsNew} />
          <MetricCard label="Engaged" value={formatNumber(kpis.engaged)} unit={`(${kpis.engagementRate}%)`} tooltip={TRANSCRIPT_METRICS.engaged} trend={trends.engaged} isNewMetric={trends.engagedNew} />
          <MetricCard label="Avg. turns" value={kpis.avgTurns.toFixed(1)} tooltip={TRANSCRIPT_METRICS.totalTurns} trend={trends.avgTurns} isNewMetric={trends.avgTurnsNew} />
          <MetricCard label="Feedback" value={formatNumber(kpis.feedbackCount)} tooltip={`${TRANSCRIPT_METRICS.feedbackCount} (\u{1F44D} ${formatNumber(kpis.likeCount)} \u{1F44E} ${formatNumber(kpis.dislikeCount)})`} trend={trends.feedback} isNewMetric={trends.feedbackNew} />
          {hasCsat && <MetricCard label="Satisfaction score" value={`${kpis.csatScore.toFixed(1)}/5.0`} tooltip={TRANSCRIPT_METRICS.csatScore} trend={trends.csatScore} isNewMetric={trends.csatScoreNew} />}
        </div>
      </Card>

      {/* 2. Conversation outcomes — left KPIs with trends + right stacked area chart */}
      <Card appearance="filled">
        <CardHeader header={<div className={styles.headerRow}><Subtitle2>Conversation outcomes</Subtitle2><Tooltip content={TRANSCRIPT_CHARTS.sessionTrend} relationship="description"><span className={styles.infoIcon}><Info16Regular /></span></Tooltip></div>} />
        <div className={styles.trendBody}>
          <div className={styles.trendKpis}>
            <MetricCard label="Resolved" value={formatNumber(kpis.resolved)} unit={`(${kpis.resolutionRate}%)`} tooltip={TRANSCRIPT_METRICS.resolved} trend={trends.resolved} isNewMetric={trends.resolvedNew} />
            <MetricCard label="Escalated" value={formatNumber(kpis.escalated)} unit={`(${kpis.escalationRate}%)`} tooltip={TRANSCRIPT_METRICS.escalated} trend={trends.escalated} isNewMetric={trends.escalatedNew} invertTrend />
            <MetricCard label="Abandoned" value={formatNumber(kpis.abandoned)} unit={`(${kpis.abandonmentRate}%)`} tooltip={TRANSCRIPT_METRICS.abandoned} trend={trends.abandoned} isNewMetric={trends.abandonedNew} invertTrend />
          </div>
          <div className={styles.trendChart}>
            <FluentAreaChart chartTitle="Conversation outcomes" series={outcomesTrendSeries} />
          </div>
        </div>
      </Card>

      {/* 3. Autonomous agents + Connected agent details — side by side */}
      {(hasAutonomousData || hasConnectedAgents) && (
        <div className={styles.chartRow} style={{ alignItems: "stretch" }}>
          {hasAutonomousData && (
            <div style={{ flex: "0 0 auto", minWidth: "280px", maxWidth: "400px", display: "flex" }}>
              <Card appearance="filled" style={{ flex: 1, width: "100%" }}>
                <CardHeader header={
                  <div className={styles.headerRow}>
                    <Subtitle2>Autonomous agents</Subtitle2>
                    <Tooltip content="Metrics for autonomous agent runs triggered during the selected period." relationship="description">
                      <span className={styles.infoIcon}><Info16Regular /></span>
                    </Tooltip>
                  </div>
                } />
                <div className={styles.metricsRow}>
                  <MetricCard label="Runs" value={formatNumber(autonomousKpis.totalRuns)} tooltip={TRANSCRIPT_METRICS.runs} />
                  <MetricCard label="Successful runs" value={`${autonomousKpis.successRate}%`} tooltip={TRANSCRIPT_METRICS.successfulRuns} />
                  <MetricCard label="Average duration" value={formatDurationSec(autonomousKpis.avgDurationSec)} tooltip={TRANSCRIPT_METRICS.avgDuration} />
                </div>
              </Card>
            </div>
          )}
          {hasConnectedAgents && (
            <div style={{ flex: "1 1 0", minWidth: "300px", display: "flex", flexDirection: "column" }}>
              <FluentDataGrid
                title="Connected agent details"
                titleTooltip={TRANSCRIPT_CHARTS.connectedAgents}
                columns={connectedAgentColumns}
                data={connectedAgentRows as unknown as Record<string, unknown>[]}
                pageSize={3}
                searchPlaceholder="Search agents..."
                rowKey={(r) => `${(r as unknown as ConnectedAgentDetail).Agent}||${(r as unknown as ConnectedAgentDetail).Type}`}
              />
            </div>
          )}
        </div>
      )}

      {/* 4. Engagement Breakdown + Session Outcomes — DonutCharts with center totals */}
      <div className={styles.chartRow}>
        <div className={styles.chartHalf}>
          <ChartCard title="Engagement breakdown" tooltip={TRANSCRIPT_CHARTS.engagementBreakdown}>
            <FluentDonutChart chartTitle="Engagement breakdown" items={engagementDonut} />
          </ChartCard>
        </div>
        <div className={styles.chartHalf}>
          <ChartCard title="Session outcomes" tooltip={TRANSCRIPT_CHARTS.sessionOutcomes}>
            <FluentDonutChart chartTitle="Session outcomes" items={outcomesDonut} />
          </ChartCard>
        </div>
      </div>

      {/* 5. Survey satisfaction score + Satisfaction score trend (centered) */}
      {hasCsat && (
        <div className={styles.chartRow} style={{ justifyContent: "center" }}>
          <div className={styles.chartLeft}>
            <Card appearance="filled" style={{ height: "100%" }}>
              <CardHeader header={
                <div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS }}>
                  <Subtitle2>Survey satisfaction score</Subtitle2>
                  <Tooltip content={TRANSCRIPT_CHARTS.satisfactionScore} relationship="description">
                    <span style={{ display: "flex", alignItems: "center", color: tokens.colorNeutralForeground3, cursor: "help" }}>
                      <Info16Regular />
                    </span>
                  </Tooltip>
                </div>
              } />
              <div className={styles.surveyBody}>
                {satTotal > 0 && (
                  <StackedBarChart
                    data={{
                      chartTitle: "",
                      chartData: [
                        { legend: "Dissatisfied", data: satisfactionBreakdown.dissatisfied, color: CSAT_COLORS.dissatisfied },
                        { legend: "Neutral", data: satisfactionBreakdown.neutral, color: CSAT_COLORS.neutral },
                        { legend: "Satisfied", data: satisfactionBreakdown.satisfied, color: CSAT_COLORS.satisfied },
                      ],
                    }}
                    hideDenominator
                    hideNumberDisplay
                    barHeight={16}
                  />
                )}
              </div>
            </Card>
          </div>
          <div className={styles.chartRight}>
            <ChartCard title="Satisfaction score trend" tooltip="Daily average satisfaction scores over time to track customer sentiment.">
              <FluentAreaChart chartTitle="Satisfaction score trend" series={scoreTrendSeries} minHeight={160} />
            </ChartCard>
          </div>
        </div>
      )}

      {/* 6. Data table */}
      <FluentDataGrid
        title="Transcript metrics"
        columns={columns}
        data={data as unknown as Record<string, unknown>[]}
        pageSize={10}
        exportColumns={transcriptsExportColumns}
        exportFilename="transcript-metrics"
        searchPlaceholder="Search transcripts..."
        actions={
          kpis.feedbackCount > 0 ? (
            <Button
              appearance="secondary"
              icon={<Comment20Regular />}
              onClick={() => openDialog("feedback", data)}
              size="small"
            >
              All Feedbacks ({kpis.feedbackCount})
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}
