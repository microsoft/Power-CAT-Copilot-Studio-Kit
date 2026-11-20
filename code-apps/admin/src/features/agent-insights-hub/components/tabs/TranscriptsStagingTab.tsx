/**
 * TranscriptsStagingTab - Transcript staging records with workflow status filter.
 *
 * Independent local filter state (NOT FilterContext). Shows FluentDataGrid with
 * workflow status filter, refresh button, Badge-colored status/source columns.
 * Logic ported from ExistingSrcCode/TranscriptStagingPage, Fluent UI v9 applied.
 */

import React, { useState, useMemo, useCallback } from "react";
import {
  makeStyles, tokens, Badge, Button, Select, Tooltip,
} from "@fluentui/react-components";
import { ArrowSync16Regular } from "@fluentui/react-icons";
import { useQueryClient } from "@tanstack/react-query";
import type { GridColumn, TranscriptStaging } from "../../contracts/types";
import { WORKFLOW_STATUS_LABELS, STAGING_DATA_SOURCE_LABELS } from "../../contracts/types";
import { useTranscriptStaging } from "../../hooks/useTranscriptStaging";
import { queryKeys } from "../../hooks/queryKeys";
import { TAB_DESCRIPTIONS } from "../../utils/metricDescriptions";
import FluentDataGrid from "../FluentDataGrid";
import LoadingSpinner from "../LoadingSpinner";

type BadgeColor = "informative" | "success" | "danger" | "warning";

const WF_BADGE_COLOR: Record<number, BadgeColor> = {
  1: "informative",
  2: "success",
  3: "danger",
};

const DS_BADGE_COLOR: Record<number, BadgeColor> = {
  1: "success",
  2: "warning",
};

function formatDateTime(value?: string): string {
  if (!value) return "-";
  const d = new Date(value);
  return d.toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function resolveDataSource(code?: number): string {
  if (!code) return "-";
  return STAGING_DATA_SOURCE_LABELS[code] ?? String(code);
}

function resolveWorkflowStatus(code?: number): string {
  if (!code) return "-";
  return WORKFLOW_STATUS_LABELS[code] ?? String(code);
}

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalL,
    padding: tokens.spacingHorizontalXL,
  },
  filterBar: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
  },
  filterSelect: { minWidth: "160px" },
});

function TranscriptsStagingTab() {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const [workflowStatus, setWorkflowStatus] = useState("all");
  const { data = [], isLoading } = useTranscriptStaging(workflowStatus);

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.transcriptStaging(workflowStatus) });
  }, [queryClient, workflowStatus]);

  const columns: GridColumn<TranscriptStaging>[] = useMemo(() => [
    {
      key: "cat_name",
      label: "Name",
      width: "140px",
      sortable: true,
    },
    {
      key: "cat_agentname",
      label: "Agent name",
      width: "160px",
      sortable: true,
    },
    {
      key: "cat_conversationdate",
      label: "Conversation date",
      width: "170px",
      sortable: true,
      render: (r) => formatDateTime(r.cat_conversationdate),
    },
    {
      key: "cat_conversationid",
      label: "Conversation ID",
      width: "160px",
      sortable: true,
    },
    {
      key: "cat_channelid",
      label: "Channel ID",
      width: "120px",
      sortable: true,
    },
    {
      key: "cat_datasourcecode",
      label: "Data source",
      width: "120px",
      sortable: true,
      searchValue: (r) => resolveDataSource(r.cat_datasourcecode),
      render: (r) => {
        const label = resolveDataSource(r.cat_datasourcecode);
        const color = DS_BADGE_COLOR[r.cat_datasourcecode ?? 0] ?? "informative";
        return <Badge appearance="tint" color={color}>{label}</Badge>;
      },
    },
    {
      key: "cat_workflowstatus",
      label: "Workflow status",
      width: "140px",
      sortable: true,
      searchValue: (r) => resolveWorkflowStatus(r.cat_workflowstatus),
      render: (r) => {
        const label = resolveWorkflowStatus(r.cat_workflowstatus);
        const color = WF_BADGE_COLOR[r.cat_workflowstatus ?? 0] ?? "informative";
        return <Badge appearance="tint" color={color}>{label}</Badge>;
      },
    },
    {
      key: "cat_transcriptguid",
      label: "Transcript ID",
      width: "160px",
      sortable: true,
    },
    {
      key: "createdon",
      label: "Created on",
      width: "160px",
      sortable: true,
      render: (r) => formatDateTime(r.createdon),
    },
  ], []);

  const actions = useMemo(() => (
    <div className={styles.filterBar}>
      <Tooltip content="Refresh" relationship="label">
        <Button
          appearance="subtle"
          icon={<ArrowSync16Regular />}
          aria-label="Refresh"
          onClick={handleRefresh}
          size="small"
        />
      </Tooltip>
      <Select
        aria-label="Filter by workflow status"
        value={workflowStatus}
        onChange={(_, d) => setWorkflowStatus(d.value)}
        className={styles.filterSelect}
        size="small"
        appearance="outline"
      >
        <option value="all">All statuses</option>
        {Object.entries(WORKFLOW_STATUS_LABELS).map(([k, label]) => (
          <option key={k} value={k}>{label}</option>
        ))}
      </Select>
    </div>
  ), [workflowStatus, handleRefresh]);

  if (isLoading) return <LoadingSpinner label="Loading transcript staging..." />;

  return (
    <div className={styles.root}>
      <FluentDataGrid<TranscriptStaging>
        title="Transcript staging"
        titleTooltip={TAB_DESCRIPTIONS.transcriptsStaging}
        columns={columns}
        data={data as (TranscriptStaging & Record<string, unknown>)[]}
        pageSize={15}
        searchPlaceholder="Search transcript staging..."
        actions={actions}
      />
    </div>
  );
}

export default TranscriptsStagingTab;
