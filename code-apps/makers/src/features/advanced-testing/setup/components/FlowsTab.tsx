/**
 * Flows tab content for Advanced Testing setup, Phase 3 (simplified UI).
 *
 * End-user view: one collapsible "Test Automation processes" section
 * containing a single flat list of every process with an "On" / "Off" badge
 * and a per-row Turn on button. A primary "Turn on all" button orchestrates
 * activation in the correct internal order (plan §2.6 A3); buckets are
 * invisible to the user.
 *
 * Two sub-sections live below the main list:
 *  - Tester role assignment (optional)
 *  - Advanced (manual review), collapsed Accordion, low signal
 *
 * Implementation rules:
 *  - All collapsible regions use Fluent UI v9 `Accordion` (no custom chevron
 *    + role="button" hacks).
 *  - Diagnostics (A8 duplicates, A12 missing/unexpected) surface as
 *    `MessageBar` with plain language; no bucket jargon.
 *  - Flow activation is fully decoupled from Connection Reference health.
 *    Runtime activation errors surface inline.
 */

import { useMemo, useState } from "react";
import {
  Body1,
  Body1Strong,
  Button,
  Card,
  Divider,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Skeleton,
  SkeletonItem,
  Spinner,
  Tooltip,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import {
  ArrowClockwiseRegular,
  WarningRegular,
} from "@fluentui/react-icons";
import { useQueryClient } from "@tanstack/react-query";
import type { WorkflowRow, ProcessInventory } from "../contracts/types";
import {
  TEST_AUTOMATION_PROCESSES_KEY,
  useTestAutomationProcesses,
} from "../hooks/useTestAutomationProcesses";
import {
  ORCHESTRATOR_BUCKET_ORDER,
  getBucketRows,
  isDuplicate,
} from "../services/workflowService";
import { ActivateAllInOrderButton } from "./ActivateAllInOrderButton";
import { ProcessRow } from "./ProcessRow";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
  },
  commandBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalM,
  },
  card: {
    padding: tokens.spacingVerticalS,
    display: "flex",
    flexDirection: "column",
  },
  spinnerWrap: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: tokens.spacingVerticalXXL,
    paddingBottom: tokens.spacingVerticalXXL,
  },
  subsection: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
  },
});

interface FlowsTabProps {
  /** True when the Flows tab is the active tab. Drives RD-M3 gating. */
  enabled: boolean;
}

/** Flattens orchestrator buckets into a single ordered list while preserving bucket id for each row. */
function flattenOrchestrated(
  inv: ProcessInventory,
): { row: WorkflowRow; bucketId: (typeof ORCHESTRATOR_BUCKET_ORDER)[number] }[] {
  const out: { row: WorkflowRow; bucketId: (typeof ORCHESTRATOR_BUCKET_ORDER)[number] }[] = [];
  for (const bid of ORCHESTRATOR_BUCKET_ORDER) {
    for (const row of getBucketRows(inv, bid)) {
      out.push({ row, bucketId: bid });
    }
  }
  return out;
}

export function FlowsTab({ enabled }: FlowsTabProps) {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const processesQuery = useTestAutomationProcesses(enabled);

  const [isRunInFlight, setIsRunInFlight] = useState(false);
  const [rowErrors, setRowErrors] = useState<Map<string, string>>(new Map());

  console.log("[AdvancedTesting:Setup:FlowsTab] render", {
    enabled,
    isLoading: processesQuery.isLoading,
    isError: processesQuery.isError,
    error: processesQuery.error?.message,
    rowCount: processesQuery.data?.rows.length,
    duplicates: processesQuery.data?.duplicates.length,
    missingGroups: processesQuery.data?.missing.length,
  });

  const handleRefresh = () => {
    void queryClient.invalidateQueries({ queryKey: TEST_AUTOMATION_PROCESSES_KEY });
  };

  const handleActivated = () => {
    void queryClient.invalidateQueries({ queryKey: TEST_AUTOMATION_PROCESSES_KEY });
  };

  const handleRowActivated = (rowId: string) => {
    setRowErrors((prev) => {
      if (!prev.has(rowId)) return prev;
      const next = new Map(prev);
      next.delete(rowId);
      return next;
    });
    void queryClient.invalidateQueries({ queryKey: TEST_AUTOMATION_PROCESSES_KEY });
  };

  const inv = processesQuery.data;

  const orchestratedFlat = useMemo(
    () => (inv ? flattenOrchestrated(inv) : []),
    [inv],
  );

  const refreshButton = (
    <Tooltip content="Refresh" relationship="label" withArrow>
      <Button
        appearance="subtle"
        icon={<ArrowClockwiseRegular />}
        onClick={handleRefresh}
        disabled={processesQuery.isLoading || isRunInFlight}
        aria-label="Refresh flows"
      />
    </Tooltip>
  );

  return (
    <div className={styles.root}>
      {processesQuery.isLoading ? (
        <div className={styles.spinnerWrap}>
          <Spinner size="medium" label="Loading processes..." />
        </div>
      ) : processesQuery.isError ? (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>Could not load processes</MessageBarTitle>
            {processesQuery.error?.message ?? "Unknown error."}
          </MessageBarBody>
        </MessageBar>
      ) : !inv ? (
        <Skeleton aria-label="Loading processes">
          <SkeletonItem style={{ height: "120px" }} />
        </Skeleton>
      ) : (
        <>
          <div className={styles.commandBar}>
            <ActivateAllInOrderButton
              inventory={inv}
              isLoading={processesQuery.isFetching}
              onRunComplete={handleActivated}
              onRunningChange={setIsRunInFlight}
              onRunStart={() => setRowErrors(new Map())}
              onRowErrors={setRowErrors}
            />
            {refreshButton}
          </div>

          {inv.duplicates.length > 0 ? (
            <MessageBar intent="error" icon={<WarningRegular />}>
              <MessageBarBody>
                <MessageBarTitle>
                  Duplicate process name{inv.duplicates.length === 1 ? "" : "s"} found
                </MessageBarTitle>
                {"Turn on all is blocked until the duplicates are resolved. "}
                {inv.duplicates
                  .map(
                    (d) =>
                      `"${d.name}" appears in ${d.rows.length} solutions.`,
                  )
                  .join(" ")}
              </MessageBarBody>
            </MessageBar>
          ) : null}

          {inv.missing.length > 0 ? (
            <MessageBar intent="warning">
              <MessageBarBody>
                <MessageBarTitle>Some expected processes are missing</MessageBarTitle>
                {inv.missing
                  .flatMap((m) => m.names)
                  .join(", ")}
                {". Reinstall or update the Copilot Studio Kit solution."}
              </MessageBarBody>
            </MessageBar>
          ) : null}

          {inv.unexpected.length > 0 ? (
            <MessageBar intent="warning">
              <MessageBarBody>
                <MessageBarTitle>Extra Test Automation flows found</MessageBarTitle>
                {inv.unexpected.map((r) => r.name).join(", ")}
                {". These aren't part of the standard setup. Review in Power Automate."}
              </MessageBarBody>
            </MessageBar>
          ) : null}

          {orchestratedFlat.length > 0 ? (
            <div className={styles.subsection}>
              <Body1Strong>Required</Body1Strong>
              <Card className={styles.card}>
                {orchestratedFlat.map(({ row, bucketId }, idx) => (
                  <div key={row.id}>
                    <ProcessRow
                      row={row}
                      bucketId={bucketId}
                      isDuplicateBlocked={isDuplicate(row, inv.duplicates)}
                      isRunInFlight={isRunInFlight}
                      externalError={rowErrors.get(row.id) ?? null}
                      onActivated={handleRowActivated}
                    />
                    {idx < orchestratedFlat.length - 1 ? <Divider /> : null}
                  </div>
                ))}
              </Card>
            </div>
          ) : (
            <Body1>
              No Test Automation processes found in this environment. Install or update
              the Copilot Studio Kit solution, then click Refresh.
            </Body1>
          )}

          {inv.independent.length > 0 ? (
            <div className={styles.subsection}>
              <Body1Strong>
                Optional ({inv.independent.length})
              </Body1Strong>
              <Card className={styles.card}>
                {inv.independent.map((row, idx) => {
                  const isLast = idx === inv.independent.length - 1;
                  return (
                    <div key={row.id}>
                      <ProcessRow
                        row={row}
                        bucketId="independent"
                        isDuplicateBlocked={isDuplicate(row, inv.duplicates)}
                        isRunInFlight={isRunInFlight}
                        onActivated={handleRowActivated}
                      />
                      {!isLast ? <Divider /> : null}
                    </div>
                  );
                })}
              </Card>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
