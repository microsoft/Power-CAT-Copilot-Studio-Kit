/**
 * UsageHistoryTab - Usage credits view with independent local filters (NOT FilterContext).
 *
 * Fetches ALL usage history data once, derives dropdown values from cached data,
 * then applies client-side filtering (including date). Combobox filters use freeform
 * with onInput for search + onOptionSelect for selection (ExistingSrcCode pattern).
 */

import React, { useState, useMemo, useCallback } from "react";
import {
  makeStyles, tokens, Card, CardHeader, Body1Strong, Body1,
  Subtitle2, Tooltip, Combobox, Option, Select,
} from "@fluentui/react-components";
import { Info16Regular } from "@fluentui/react-icons";
import type { GridColumn, AgentUsageHistory, AgentDetails } from "../../contracts/types";
import { CHART_COLORS } from "../../contracts/types";
import { USAGE_METRICS, USAGE_CHARTS, TAB_DESCRIPTIONS } from "../../utils/metricDescriptions";
import { useUsageHistory } from "../../hooks/useUsageHistory";
import { useAgentDetails } from "../../hooks/useAgentDetails";
import { useConfigurations } from "../../hooks/useConfigurations";
import {
  deriveUniqueFeatures, aggregateCredits,
} from "../../utils/usageHistoryHelpers";
import type { ExportColumn } from "../../utils/exportColumns";
import { formatDate, formatNum } from "../../utils/exportColumns";
import ChartCard from "../ChartCard";
import FluentAreaChart from "../charts/FluentAreaChart";
import FluentDonutChart from "../charts/FluentDonutChart";
import FluentHorizontalBarChart from "../charts/FluentHorizontalBarChart";
import FluentDataGrid from "../FluentDataGrid";
import LoadingSpinner from "../LoadingSpinner";
import EmptyStates from "../EmptyStates";

// ---------------------------------------------------------------------------
// Date range helpers
// ---------------------------------------------------------------------------

function getMonthName(date: Date): string {
  return date.toLocaleString("default", { month: "long", year: "numeric" });
}

type DateRangeKey = "monthToDate" | "previousMonth" | "previousToPreviousMonth" | "last6months";

/** Returns start/end as YYYY-MM-DD strings to avoid timezone issues. */
function getDateRange(dateRange: DateRangeKey): { startStr: string; endStr: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  const pad = (n: number) => String(n).padStart(2, "0");
  const toStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  switch (dateRange) {
    case "previousMonth": {
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);
      return { startStr: toStr(start), endStr: toStr(end) };
    }
    case "previousToPreviousMonth": {
      const start = new Date(y, m - 2, 1);
      const end = new Date(y, m - 1, 0);
      return { startStr: toStr(start), endStr: toStr(end) };
    }
    case "last6months": {
      const start = new Date(y, m - 6, now.getDate());
      return { startStr: toStr(start), endStr: toStr(now) };
    }
    default: {
      const start = new Date(y, m, 1);
      return { startStr: toStr(start), endStr: toStr(now) };
    }
  }
}

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalL },
  headerRow: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS },
  filterBar: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalL, flexWrap: "wrap" },
  filterGroup: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS },
  filterLabel: { color: tokens.colorNeutralForeground3, whiteSpace: "nowrap" as const },
  filterCombobox: { minWidth: "180px" },
  filterSelect: { minWidth: "150px" },
  metricsBody: { display: "flex", alignItems: "stretch", gap: tokens.spacingHorizontalL, flexWrap: "wrap" as const, paddingLeft: tokens.spacingHorizontalM, paddingRight: tokens.spacingHorizontalM, paddingBottom: tokens.spacingVerticalS },
  kpiTile: { display: "flex", flexDirection: "column" as const, gap: tokens.spacingVerticalXXS, flex: "1 1 0", minWidth: "150px", paddingTop: tokens.spacingVerticalS, paddingBottom: tokens.spacingVerticalS },
  kpiLabel: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS, color: tokens.colorNeutralForeground2 },
  infoIcon: { color: tokens.colorNeutralForeground3, cursor: "help", display: "flex", alignItems: "center" },
  chartsRow: { display: "flex", gap: tokens.spacingHorizontalL, flexWrap: "wrap" },
  chartWide: { flex: "1 1 100%" },
  chartHalf: { flex: "1 1 45%", minWidth: "300px" },
});

function UsageHistoryTab() {
  const styles = useStyles();

  // Filter state (ExistingSrcCode pattern)
  const [selectedEnvironment, setSelectedEnvironment] = useState("all");
  const [selectedAgent, setSelectedAgent] = useState("all");
  const [dateRange, setDateRange] = useState<DateRangeKey>("monthToDate");
  const [selectedFeature, setSelectedFeature] = useState("all");

  // Combobox search text + open state for type-to-filter
  const [environmentSearch, setEnvironmentSearch] = useState("");
  const [agentSearch, setAgentSearch] = useState("");
  const [envOpen, setEnvOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);

  // Fetch ALL data once (no server-side filter — client-side filtering per ExistingSrcCode)
  const { data: rawData = [], isLoading } = useUsageHistory();

  // Fetch agent details for name resolution
  const { data: agentDetailsList = [] } = useAgentDetails();

  // Fetch configs to filter by KPI source "Usage History" (code "3")
  const { data: configs = [] } = useConfigurations();
  const usageHistoryConfigNamesByAgentId = useMemo(() => {
    const names = new Map<string, string>();
    for (const c of configs) {
      const codes = c.cat_kpisourcecodes?.split(",").map((s) => s.trim()) ?? [];
      if (codes.includes("3")) {
        if (c.cat_copilotid) names.set(c.cat_copilotid, c.cat_name);
        if (c._cat_agents_value) names.set(c._cat_agents_value, c.cat_name);
      }
    }
    return names;
  }, [configs]);

  const usageHistoryAgentIds = useMemo(
    () => new Set(usageHistoryConfigNamesByAgentId.keys()),
    [usageHistoryConfigNamesByAgentId]
  );

  // Filter data to only agents with "Usage History" KPI source enabled
  const allData = useMemo(() => {
    if (usageHistoryAgentIds.size === 0) return rawData;
    return rawData.filter((r) => {
      const agentId = r.cat_agentid ?? r._cat_agent_value;
      return agentId && usageHistoryAgentIds.has(agentId);
    });
  }, [rawData, usageHistoryAgentIds]);

  // Dual-key lookup map
  const agentDetailsMap = useMemo(() => {
    const map = new Map<string, AgentDetails>();
    for (const ad of agentDetailsList) {
      if (ad.cat_agentid) map.set(ad.cat_agentid, ad);
      if (ad.cat_agentdetailsid) map.set(ad.cat_agentdetailsid, ad);
    }
    return map;
  }, [agentDetailsList]);

  const getAgentDetailsForRecord = useCallback((record: AgentUsageHistory): AgentDetails | null => {
    if (record._cat_agent_value) {
      const ad = agentDetailsMap.get(record._cat_agent_value);
      if (ad) return ad;
    }
    if (record.cat_agentid) {
      const ad = agentDetailsMap.get(record.cat_agentid);
      if (ad) return ad;
    }
    return null;
  }, [agentDetailsMap]);

  const resolveAgentName = useCallback((record: AgentUsageHistory): string => {
    const ad = getAgentDetailsForRecord(record);
    return ad?.cat_name ?? record.cat_agentid ?? "Unknown";
  }, [getAgentDetailsForRecord]);

  const resolveEnvironmentName = useCallback((record: AgentUsageHistory): string => {
    const ad = getAgentDetailsForRecord(record);
    return ad?.cat_environmentname ?? record.cat_environmentid ?? "Unknown";
  }, [getAgentDetailsForRecord]);

  // Derive dropdown options from ALL data
  const availableEnvironments = useMemo(() => {
    const envMap = new Map<string, string>();
    allData.forEach((d) => {
      const agent = getAgentDetailsForRecord(d);
      const envName = agent?.cat_environmentname;
      const envId = agent?.cat_environmentid ?? d.cat_environmentid;
      if (envName && envId) envMap.set(envId, envName);
    });
    return Array.from(envMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allData, getAgentDetailsForRecord]);

  const availableAgents = useMemo(() => {
    const agMap = new Map<string, { name: string; label: string }>();
    allData.forEach((d) => {
      const agent = getAgentDetailsForRecord(d);
      const agentId = d.cat_agentid ?? d._cat_agent_value;
      const label = agentId ? usageHistoryConfigNamesByAgentId.get(agentId) : undefined;
      const fallbackName = agent?.cat_name;
      if (agentId && (label || fallbackName)) {
        agMap.set(agentId, {
          name: fallbackName ?? label ?? agentId,
          label: label ?? fallbackName ?? agentId,
        });
      }
    });
    return Array.from(agMap.entries())
      .map(([id, agent]) => ({ id, ...agent }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [allData, getAgentDetailsForRecord, usageHistoryConfigNamesByAgentId]);

  const availableFeatures = useMemo(() => deriveUniqueFeatures(allData), [allData]);

  // Filtered options for Combobox search
  const filteredEnvironments = useMemo(() => {
    if (!environmentSearch) return availableEnvironments;
    const s = environmentSearch.toLowerCase();
    return availableEnvironments.filter((e) => e.name.toLowerCase().includes(s));
  }, [availableEnvironments, environmentSearch]);

  const filteredAgents = useMemo(() => {
    if (!agentSearch) return availableAgents;
    const s = agentSearch.toLowerCase();
    return availableAgents.filter((a) => a.label.toLowerCase().includes(s));
  }, [availableAgents, agentSearch]);

  // Client-side filtering (date + environment + agent + feature)
  const filtered = useMemo(() => {
    const { startStr, endStr } = getDateRange(dateRange);
    return allData.filter((r) => {
      if (r.cat_usagedate) {
        const dateOnly = r.cat_usagedate.substring(0, 10);
        if (dateOnly < startStr || dateOnly > endStr) return false;
      }
      if (selectedEnvironment !== "all") {
        const agent = getAgentDetailsForRecord(r);
        const envId = agent?.cat_environmentid ?? r.cat_environmentid;
        if (envId !== selectedEnvironment) return false;
      }
      if (selectedAgent !== "all") {
        const agentId = r.cat_agentid ?? r._cat_agent_value;
        if (agentId !== selectedAgent) return false;
      }
      if (selectedFeature !== "all" && r.cat_featurename !== selectedFeature) return false;
      return true;
    });
  }, [allData, dateRange, selectedEnvironment, selectedAgent, selectedFeature, getAgentDetailsForRecord]);

  const tableColumns = useMemo((): GridColumn<AgentUsageHistory>[] => [
    { key: "cat_agentid", label: "Agent", width: "180px", sortable: true, render: (r) => resolveAgentName(r), searchValue: (r) => resolveAgentName(r) },
    { key: "cat_environmentid", label: "Environment", width: "180px", sortable: true, render: (r) => resolveEnvironmentName(r), searchValue: (r) => resolveEnvironmentName(r) },
    { key: "cat_usagedate", label: "Usage date", width: "120px", sortable: true, render: (r) => r.cat_usagedate ? new Date(r.cat_usagedate).toLocaleDateString() : "" },
    { key: "cat_featurename", label: "Feature", width: "150px", sortable: true },
    { key: "cat_billedcopilotcredits", label: "Billed credits", width: "130px", sortable: true, alignment: "end", render: (r) => (r.cat_billedcopilotcredits ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 }) },
    { key: "cat_nonbilledcopilotcredits", label: "Non-billed credits", width: "140px", sortable: true, alignment: "end", render: (r) => (r.cat_nonbilledcopilotcredits ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 }) },
  ], [resolveAgentName, resolveEnvironmentName]);

  // Aggregations
  const totalBilled = useMemo(() => filtered.reduce((s, r) => s + (r.cat_billedcopilotcredits ?? 0), 0), [filtered]);
  const totalNonBilled = useMemo(() => filtered.reduce((s, r) => s + (r.cat_nonbilledcopilotcredits ?? 0), 0), [filtered]);
  const byDate = useMemo(() => aggregateCredits(filtered, "date"), [filtered]);
  const byFeature = useMemo(() => aggregateCredits(filtered, "feature"), [filtered]);

  const byEnvironment = useMemo(() => {
    const envMap = new Map<string, { name: string; billed: number }>();
    for (const r of filtered) {
      const ad = getAgentDetailsForRecord(r);
      const envId = ad?.cat_environmentid ?? r.cat_environmentid ?? "unknown";
      const envName = ad?.cat_environmentname ?? r.cat_environmentid ?? "Unknown";
      const existing = envMap.get(envId);
      const billed = r.cat_billedcopilotcredits ?? 0;
      if (existing) existing.billed += billed;
      else envMap.set(envId, { name: envName, billed });
    }
    return Array.from(envMap.values()).sort((a, b) => b.billed - a.billed).slice(0, 5);
  }, [filtered, getAgentDetailsForRecord]);

  const exportData = useMemo(() =>
    filtered.map((r) => ({ ...r, _agentName: resolveAgentName(r), _environmentName: resolveEnvironmentName(r) })),
  [filtered, resolveAgentName, resolveEnvironmentName]);

  const exportColumns = useMemo((): ExportColumn[] => [
    { key: "cat_usagedate", header: "Date", width: 14, formatter: formatDate },
    { key: "_agentName", header: "Agent", width: 24 },
    { key: "_environmentName", header: "Environment", width: 24 },
    { key: "cat_featurename", header: "Feature", width: 20 },
    { key: "cat_billedcopilotcredits", header: "Billed Credits", width: 14, formatter: formatNum },
    { key: "cat_nonbilledcopilotcredits", header: "Non-Billed Credits", width: 16, formatter: formatNum },
  ], []);

  if (isLoading) return <LoadingSpinner label="Loading usage history..." />;
  if (!rawData.length) return <EmptyStates variant="no-data" />;

  const hasFilteredResults = filtered.length > 0;

  return (
    <div className={styles.root}>
      {/* Filters — ExistingSrcCode pattern: label + control pairs */}
      <div className={styles.filterBar}>
        <div className={styles.filterGroup}>
          <Body1 className={styles.filterLabel}>Environment</Body1>
          <Combobox
            className={styles.filterCombobox}
            value={envOpen
              ? environmentSearch
              : selectedEnvironment === "all"
                ? "All environments"
                : availableEnvironments.find((e) => e.id === selectedEnvironment)?.name ?? ""}
            selectedOptions={[selectedEnvironment]}
            onChange={(e) => setEnvironmentSearch((e.target as HTMLInputElement).value)}
            onOptionSelect={(_, data) => { setSelectedEnvironment(data.optionValue ?? "all"); setEnvironmentSearch(""); }}
            onOpenChange={(_, d) => { setEnvOpen(d.open); if (d.open) setEnvironmentSearch(""); }}
            placeholder="Search environments..."
            freeform
            size="small"
            appearance="outline"
          >
            <Option value="all">All environments</Option>
            {filteredEnvironments.map((e) => <Option key={e.id} value={e.id}>{e.name}</Option>)}
          </Combobox>
        </div>

        <div className={styles.filterGroup}>
          <Body1 className={styles.filterLabel}>Agent</Body1>
          <Combobox
            className={styles.filterCombobox}
            value={agentOpen
              ? agentSearch
              : selectedAgent === "all"
                ? "All agents"
                : availableAgents.find((a) => a.id === selectedAgent)?.label ?? ""}
            selectedOptions={[selectedAgent]}
            onChange={(e) => setAgentSearch((e.target as HTMLInputElement).value)}
            onOptionSelect={(_, data) => { setSelectedAgent(data.optionValue ?? "all"); setAgentSearch(""); }}
            onOpenChange={(_, d) => { setAgentOpen(d.open); if (d.open) setAgentSearch(""); }}
            placeholder="Search agents..."
            freeform
            size="small"
            appearance="outline"
          >
            <Option value="all">All agents</Option>
            {filteredAgents.map((a) => <Option key={a.id} value={a.id} text={a.label}>{a.label}</Option>)}
          </Combobox>
        </div>

        <div className={styles.filterGroup}>
          <Body1 className={styles.filterLabel}>Date</Body1>
          <Select
            className={styles.filterSelect}
            value={dateRange}
            onChange={(_, d) => setDateRange(d.value as DateRangeKey)}
            size="small"
            appearance="outline"
          >
            <option value="monthToDate">Month to date</option>
            <option value="previousMonth">{getMonthName(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1))}</option>
            <option value="previousToPreviousMonth">{getMonthName(new Date(new Date().getFullYear(), new Date().getMonth() - 2, 1))}</option>
            <option value="last6months">Last 6 months</option>
          </Select>
        </div>

        <div className={styles.filterGroup}>
          <Body1 className={styles.filterLabel}>Feature</Body1>
          <Select
            className={styles.filterSelect}
            value={selectedFeature}
            onChange={(_, d) => setSelectedFeature(d.value)}
            size="small"
            appearance="outline"
          >
            <option value="all">All features</option>
            {availableFeatures.map((f) => <option key={f} value={f}>{f}</option>)}
          </Select>
        </div>
      </div>

      {!hasFilteredResults ? (
        <EmptyStates variant="no-filter-results" message="No data matches the current filters. Try adjusting the environment, agent, feature, or date range filters to see results." />
      ) : (
        <>
          {/* Credit consumption KPIs */}
          <Card appearance="filled">
            <CardHeader header={<div className={styles.headerRow}><Body1Strong>Credit consumption</Body1Strong><Tooltip content={TAB_DESCRIPTIONS.usageHistory} relationship="description"><span className={styles.infoIcon}><Info16Regular /></span></Tooltip></div>} />
            <div className={styles.metricsBody}>
              <div className={styles.kpiTile}>
                <div className={styles.kpiLabel}>
                  <Body1>Billed credits</Body1>
                  <Tooltip content={USAGE_METRICS.billedCredits} relationship="description">
                    <span className={styles.infoIcon}><Info16Regular /></span>
                  </Tooltip>
                </div>
                <Subtitle2>{totalBilled.toLocaleString()}</Subtitle2>
              </div>
              <div className={styles.kpiTile}>
                <div className={styles.kpiLabel}>
                  <Body1>Non-billed credits</Body1>
                  <Tooltip content={USAGE_METRICS.nonBilledCredits} relationship="description">
                    <span className={styles.infoIcon}><Info16Regular /></span>
                  </Tooltip>
                </div>
                <Subtitle2>{totalNonBilled.toLocaleString()}</Subtitle2>
              </div>
            </div>
          </Card>

          {/* Credit consumption over time */}
          <div className={styles.chartWide}>
            <ChartCard title="Credit consumption over time" tooltip={USAGE_CHARTS.creditConsumption}>
              <FluentAreaChart
                chartTitle="Credits Over Time"
                series={[
                  { legend: "Billed credits", data: byDate.map((d) => ({ x: new Date(d.label), y: d.billed })), color: CHART_COLORS.slot1 },
                  { legend: "Non-billed credits", data: byDate.map((d) => ({ x: new Date(d.label), y: d.nonBilled })), color: CHART_COLORS.slot2 },
                ]}
              />
            </ChartCard>
          </div>

          {/* Bottom charts */}
          <div className={styles.chartsRow}>
            <div className={styles.chartHalf}>
              <ChartCard title="Credits usage by environment (Top 5)" tooltip="Top 5 environments by billed credit consumption.">
                <FluentHorizontalBarChart items={byEnvironment.map((e) => ({ label: e.name, value: Math.round(e.billed * 100) / 100 }))} />
              </ChartCard>
            </div>
            <div className={styles.chartHalf}>
              <ChartCard title="Credits by feature" tooltip={USAGE_CHARTS.creditsByFeature}>
                <FluentDonutChart chartTitle="Credits by Feature" items={byFeature.map((f) => ({ legend: f.label, data: f.billed + f.nonBilled }))} />
              </ChartCard>
            </div>
          </div>

          {/* Data table */}
          <FluentDataGrid<AgentUsageHistory>
            title="Message consumption details"
            columns={tableColumns}
            pageSize={10}
            data={filtered as (AgentUsageHistory & Record<string, unknown>)[]}
            searchPlaceholder="Search usage history..."
            exportColumns={exportColumns}
            exportFilename="usage-history"
            exportData={exportData as unknown as Record<string, unknown>[]}
          />
        </>
      )}
    </div>
  );
}

export default UsageHistoryTab;
