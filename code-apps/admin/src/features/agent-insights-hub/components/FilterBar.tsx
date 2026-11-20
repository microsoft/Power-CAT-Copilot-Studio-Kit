/**
 * FilterBar - Global filter bar for Agent Insights Hub.
 *
 * Shown on all tabs except Sync Logs and Usage History.
 * Controls: Combobox (agent), Select (date range), Combobox (channel),
 * Select (data mode), DatePicker (custom range when selected).
 * All controls have accessible labels (aria-label).
 */

import React, { useMemo, useState, useCallback } from "react";
import {
  makeStyles,
  tokens,
  Combobox,
  Option,
  Select,
  Input,
  Label,
} from "@fluentui/react-components";
import { useFilterContext } from "../context/FilterContext";
import { useConfigurations } from "../hooks/useConfigurations";
import {
  DATE_RANGE_OPTIONS,
  CHANNEL_OPTIONS,
  DATA_MODE_OPTIONS,
} from "../contracts/types";
const useStyles = makeStyles({
  bar: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    flexWrap: "wrap",
    minHeight: "32px",
    marginBottom: tokens.spacingVerticalM,
  },
  filterGroup: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
  },
  label: {
    whiteSpace: "nowrap",
  },
  control: {
    minWidth: "140px",
  },
  dateInput: {
    minWidth: "140px",
  },
});

function toDateInputValue(date: Date): string {
  return date.toISOString().split("T")[0];
}

function getDateInputBounds() {
  const today = new Date();
  const maxPast = new Date(today);
  maxPast.setFullYear(today.getFullYear() - 1);
  return {
    today: toDateInputValue(today),
    maxPast: toDateInputValue(maxPast),
  };
}

/** Global filter bar with agent, date range, channel, and data mode controls. */
const FilterBar: React.FC = () => {
  const styles = useStyles();
  const [dateInputBounds] = useState(getDateInputBounds);
  const {
    selectedConfigId,
    setSelectedConfigId,
    dateRange,
    setDateRange,
    customStartDate,
    customEndDate,
    setCustomStartDate,
    setCustomEndDate,
    selectedChannel,
    setSelectedChannel,
    dataMode,
    setDataMode,
  } = useFilterContext();

  const { data: configurations = [], isLoading } = useConfigurations();

  const agentOptions = useMemo(
    () => [
      { value: "all", label: "All agents" },
      ...configurations.map((c) => ({
        value: c.cat_copilotconfigurationid,
        label: c.cat_name,
      })),
    ],
    [configurations]
  );

  const selectedAgentLabel = useMemo(() => {
    const found = agentOptions.find((o) => o.value === selectedConfigId);
    return found?.label ?? "All agents";
  }, [agentOptions, selectedConfigId]);

  // Searchable agent combobox: track input text separately
  const [agentQuery, setAgentQuery] = useState("");
  const [agentOpen, setAgentOpen] = useState(false);

  const filteredAgentOptions = useMemo(() => {
    if (!agentQuery) return agentOptions;
    const q = agentQuery.toLowerCase();
    return agentOptions.filter((o) => o.label.toLowerCase().includes(q));
  }, [agentOptions, agentQuery]);

  const handleAgentSelect = useCallback(
    (_: unknown, d: { optionValue?: string }) => {
      if (d.optionValue) setSelectedConfigId(d.optionValue);
      setAgentQuery("");
    },
    [setSelectedConfigId]
  );

  return (
    <div className={styles.bar}>
      {/* Agent filter — searchable Combobox */}
      <div className={styles.filterGroup}>
        <Combobox
          aria-label="Filter by agent"
          placeholder={isLoading ? "Loading agents..." : "Search agents..."}
          freeform
          value={agentOpen ? agentQuery : selectedAgentLabel}
          selectedOptions={[selectedConfigId]}
          onOptionSelect={handleAgentSelect}
          onChange={(e) => setAgentQuery((e.target as HTMLInputElement).value)}
          onOpenChange={(_, d) => {
            setAgentOpen(d.open);
            if (d.open) setAgentQuery("");
          }}
          className={styles.control}
          size="small"
          appearance="outline"
        >
          {filteredAgentOptions.map((opt) => (
            <Option key={opt.value} value={opt.value} text={opt.label}>
              {opt.label}
            </Option>
          ))}
        </Combobox>
      </div>

      {/* Date range filter */}
      <div className={styles.filterGroup}>
        <Select
          aria-label="Filter by date range"
          value={dateRange}
          onChange={(_, d) => setDateRange(d.value)}
          className={styles.control}
          size="small"
          appearance="outline"
        >
          {DATE_RANGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </div>

      {/* Custom date range inputs with validation */}
      {dateRange === "custom" && (() => {
        const { today, maxPast } = dateInputBounds;
        return (
          <>
            <div className={styles.filterGroup}>
              <Label className={styles.label} size="small" htmlFor="filter-start-date">
                From
              </Label>
              <Input
                id="filter-start-date"
                type="date"
                value={customStartDate}
                onChange={(_, d) => {
                  setCustomStartDate(d.value);
                  if (customEndDate && d.value > customEndDate) setCustomEndDate(d.value);
                }}
                min={maxPast}
                max={customEndDate || today}
                className={styles.dateInput}
                size="small"
                appearance="outline"
                aria-label="Start date"
              />
            </div>
            <div className={styles.filterGroup}>
              <Label className={styles.label} size="small" htmlFor="filter-end-date">
                To
              </Label>
              <Input
                id="filter-end-date"
                type="date"
                value={customEndDate}
                onChange={(_, d) => setCustomEndDate(d.value)}
                min={customStartDate || maxPast}
                max={today}
                className={styles.dateInput}
                size="small"
                appearance="outline"
                aria-label="End date"
              />
            </div>
          </>
        );
      })()}

      {/* Channel filter */}
      <div className={styles.filterGroup}>
        <Select
          aria-label="Filter by channel"
          value={selectedChannel}
          onChange={(_, d) => setSelectedChannel(d.value)}
          className={styles.control}
          size="small"
          appearance="outline"
        >
          {CHANNEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </div>

      {/* Data mode filter */}
      <div className={styles.filterGroup}>
        <Select
          aria-label="Filter by data mode"
          value={dataMode}
          onChange={(_, d) =>
            setDataMode(d.value as "production" | "test" | "both")
          }
          className={styles.control}
          size="small"
          appearance="outline"
        >
          {DATA_MODE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </div>

    </div>
  );
};

export default React.memo(FilterBar);
