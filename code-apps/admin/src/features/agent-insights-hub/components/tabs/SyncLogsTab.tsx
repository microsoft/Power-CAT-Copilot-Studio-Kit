/**
 * SyncLogsTab - Simplest tab: data table only with refresh button.
 *
 * No filter bar, no metric cards, no charts. Shows sync execution logs
 * with status badges and clickable Cloud Flow Instance URLs.
 */

import React, { useMemo, useCallback } from "react";
import {
  makeStyles, tokens, Badge, Button, Tooltip,
} from "@fluentui/react-components";
import { ArrowSync16Regular, Open16Regular } from "@fluentui/react-icons";
import { useQueryClient } from "@tanstack/react-query";
import type { GridColumn, SyncLog } from "../../contracts/types";
import { EXECUTION_STATUS_LABELS } from "../../contracts/types";
import { useSyncLogs } from "../../hooks/useSyncLogs";
import { queryKeys } from "../../hooks/queryKeys";
import { TAB_DESCRIPTIONS } from "../../utils/metricDescriptions";
import FluentDataGrid from "../FluentDataGrid";
import LoadingSpinner from "../LoadingSpinner";

// ---------------------------------------------------------------------------
// Status badge color mapping
// ---------------------------------------------------------------------------

type BadgeColor = "informative" | "warning" | "success" | "danger" | "severe";

const STATUS_BADGE_COLOR: Record<number, BadgeColor> = {
  1: "informative",
  2: "warning",
  3: "success",
  4: "danger",
  5: "severe",
};

function formatDate(value?: string): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value?: string): string {
  if (!value) return "";
  const d = new Date(value);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
}

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalL,
  },
  link: {
    color: tokens.colorBrandForegroundLink,
    textDecoration: "none",
    ":hover": { textDecoration: "underline" },
  },
});

function SyncLogsTab() {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const { data = [], isLoading } = useSyncLogs();

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.syncLogs() });
  }, [queryClient]);

  const columns: GridColumn<SyncLog>[] = useMemo(() => [
    { key: "cat_name", label: "Name", width: "130px", sortable: true },
    {
      key: "cat_executionstatuscode",
      label: "Status",
      width: "100px",
      sortable: true,
      render: (row) => {
        const code = row.cat_executionstatuscode ?? 1;
        const label = EXECUTION_STATUS_LABELS[code] ?? "Unknown";
        const color = STATUS_BADGE_COLOR[code] ?? "informative";
        return <Badge appearance="tint" color={color}>{label}</Badge>;
      },
    },
    {
      key: "cat_cloudflowname",
      label: "Cloud Flow",
      width: "55px",
      sortable: false,
      render: (row) =>
        row.cat_cloudflowinstanceurl ? (
          <a href={row.cat_cloudflowinstanceurl} target="_blank" rel="noopener noreferrer" className={styles.link} aria-label="Open flow run">
            <Open16Regular />
          </a>
        ) : null,
    },
    { key: "cat_startdate", label: "Start Date", width: "100px", sortable: true, render: (row) => formatDate(row.cat_startdate) },
    { key: "cat_enddate", label: "End Date", width: "100px", sortable: true, render: (row) => formatDate(row.cat_enddate) },
    { key: "cat_flowduration", label: "Duration", width: "95px", sortable: true },
    { key: "cat_errormessage", label: "Error Message", width: "360px", sortable: false },
    { key: "createdon", label: "Created", width: "155px", sortable: true, render: (row) => formatDateTime(row.createdon) },
  ], []);

  const refreshButton = useMemo(
    () => (
      <Tooltip content="Refresh sync logs" relationship="label">
        <Button
          appearance="subtle"
          icon={<ArrowSync16Regular />}
          aria-label="Refresh sync logs"
          onClick={handleRefresh}
          size="small"
        />
      </Tooltip>
    ),
    [handleRefresh],
  );

  if (isLoading) return <LoadingSpinner label="Loading sync logs..." />;

  return (
    <div className={styles.root}>
      <FluentDataGrid<SyncLog>
        title="Sync logs"
        titleTooltip={TAB_DESCRIPTIONS.syncLogs}
        columns={columns}
        data={data as (SyncLog & Record<string, unknown>)[]}
        pageSize={15}
        searchPlaceholder="Search sync logs..."
        actions={refreshButton}
      />
    </div>
  );
}

export default SyncLogsTab;
