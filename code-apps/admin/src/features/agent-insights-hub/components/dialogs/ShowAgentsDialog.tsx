/**
 * ShowAgentsDialog - Searchable table of all Agent Insights configurations.
 *
 * 12-column scrollable table with edit/clone actions, search,
 * empty states, and Add Agent footer button.
 */

import React, { useState, useMemo, useCallback } from "react";
import {
  makeStyles, tokens, Dialog, DialogSurface, DialogBody, DialogTitle,
  DialogContent, DialogActions, Button, SearchBox, Body1,
  Spinner, Tooltip,
} from "@fluentui/react-components";
import { Edit20Regular, Copy20Regular, Delete20Regular, Bot20Regular, Add20Regular } from "@fluentui/react-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AgentConfiguration } from "../../contracts/types";
import { KPI_SOURCE_DISPLAY } from "../../contracts/types";
import { useConfigurations } from "../../hooks/useConfigurations";
import { queryKeys } from "../../hooks/queryKeys";
import { AgentConfigService } from "../../services/AgentConfigService";

export interface ShowAgentsDialogProps {
  onClose: () => void;
  onEdit: (config: AgentConfiguration) => void;
  onAddAgent: () => void;
}

const useStyles = makeStyles({
  searchRow: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    paddingBottom: tokens.spacingVerticalM,
  },
  searchBox: {
    flex: "1 1 auto",
  },
  counter: {
    flexShrink: 0,
    color: tokens.colorNeutralForeground3,
    whiteSpace: "nowrap",
  },
  tableWrapper: {
    overflowY: "auto",
    maxHeight: "500px",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    tableLayout: "fixed" as const,
  },
  th: {
    textAlign: "start",
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
    paddingLeft: tokens.spacingHorizontalS,
    paddingRight: tokens.spacingHorizontalS,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    position: "sticky",
    top: 0,
    backgroundColor: tokens.colorNeutralBackground1,
    zIndex: 1,
  },
  td: {
    paddingTop: tokens.spacingVerticalXS,
    paddingBottom: tokens.spacingVerticalXS,
    paddingLeft: tokens.spacingHorizontalS,
    paddingRight: tokens.spacingHorizontalS,
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
  },
  truncate: {
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    display: "block",
  },
  actions: {
    display: "flex",
    gap: tokens.spacingHorizontalXS,
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: tokens.spacingVerticalXXL,
    paddingBottom: tokens.spacingVerticalXXL,
    gap: tokens.spacingVerticalM,
  },
  emptyIcon: {
    color: tokens.colorNeutralForeground3,
  },
  emptyText: {
    color: tokens.colorNeutralForeground3,
  },
});

/**
 * Parses comma-separated KPI source codes into display names.
 * E.g. "1,3" -> "Application Insights, Usage History"
 */
function formatKpiSources(codes: string | undefined): string {
  if (!codes) return "";
  return codes
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => KPI_SOURCE_DISPLAY[c] ?? c)
    .join(", ");
}

/** Dialog showing all agent configurations with search, edit, and clone. */
const ShowAgentsDialog: React.FC<ShowAgentsDialogProps> = ({ onClose, onEdit, onAddAgent }) => {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const { data: configs = [], isLoading } = useConfigurations();
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AgentConfiguration | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return configs;
    const term = search.toLowerCase();
    return configs.filter(
      (c) =>
        (c.cat_name ?? "").toLowerCase().includes(term) ||
        (c.cat_agentname ?? "").toLowerCase().includes(term) ||
        (c.cat_copilotid ?? "").toLowerCase().includes(term),
    );
  }, [configs, search]);

  const handleClone = useCallback(
    (config: AgentConfiguration) => {
      // Build in-memory clone — NOT saved to Dataverse yet.
      // Clearing copilotconfigurationid signals "create" mode to AddAgentDialog.
      const tempClone: AgentConfiguration = {
        ...config,
        cat_copilotconfigurationid: "",
        cat_name: `${config.cat_name} (Copy)`,
        cat_copilotid: "",
        cat_dataverseurl: "",
        _cat_agents_value: "",
        cat_agentname: "",
      };
      onEdit(tempClone);
    },
    [onEdit],
  );

  const deleteMutation = useMutation({
    mutationFn: (id: string) => AgentConfigService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agentConfigurations() });
      setDeleteTarget(null);
    },
  });

  const handleDeleteConfirm = useCallback(() => {
    if (deleteTarget) deleteMutation.mutate(deleteTarget.cat_copilotconfigurationid);
  }, [deleteTarget, deleteMutation]);

  /** Renders a truncated cell with tooltip. */
  const renderTruncated = (value: string | undefined) => {
    const text = value ?? "";
    if (!text) return <Body1>{""}</Body1>;
    return (
      <Tooltip content={text} relationship="label">
        <Body1 className={styles.truncate}>{text}</Body1>
      </Tooltip>
    );
  };

  return (
    <>
      <Dialog open onOpenChange={(_, d) => { if (!d.open) onClose(); }}>
        <DialogSurface style={{ maxWidth: "min(95vw, 900px)", maxHeight: "85vh" }}>
          <DialogBody>
            <DialogTitle>Agent Configurations</DialogTitle>
            <DialogContent>
              <div className={styles.searchRow}>
                <SearchBox
                  className={styles.searchBox}
                  placeholder="Search by name..."
                  value={search}
                  onChange={(_, d) => setSearch(d.value ?? "")}
                  dismiss={{ onClick: () => setSearch("") }}
                  aria-label="Search configurations"
                  size="small"
                />
                <Body1 className={styles.counter}>
                  {filtered.length} of {configs.length} agents
                </Body1>
              </div>

              {isLoading ? (
                <Spinner label="Loading configurations..." />
              ) : filtered.length === 0 ? (
                <div className={styles.emptyState}>
                  <Bot20Regular style={{ fontSize: "48px" }} className={styles.emptyIcon} />
                  {configs.length === 0 ? (
                    <>
                      <Body1 className={styles.emptyText}>No agent configurations found</Body1>
                      <Button appearance="primary" onClick={onAddAgent}>Add First Agent</Button>
                    </>
                  ) : (
                    <Body1 className={styles.emptyText}>No agents match your search</Body1>
                  )}
                </div>
              ) : (
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th className={styles.th} style={{ width: "22%" }}>Name</th>
                        <th className={styles.th} style={{ width: "25%" }}>App Insights App ID</th>
                        <th className={styles.th} style={{ width: "18%" }}>KPI Source</th>
                        <th className={styles.th} style={{ width: "10%" }}>User Details</th>
                        <th className={styles.th} style={{ width: "12%" }}>User Feedback</th>
                        <th className={styles.th} style={{ width: "13%" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((config) => (
                        <tr key={config.cat_copilotconfigurationid}>
                          <td className={styles.td}>{renderTruncated(config.cat_name)}</td>
                          <td className={styles.td}>{renderTruncated(config.cat_azureappinsightsapplicationid)}</td>
                          <td className={styles.td}>{renderTruncated(formatKpiSources(config.cat_kpisourcecodes))}</td>
                          <td className={styles.td}>
                            <Body1>{config.cat_iscaptureuserdetailsenabled ? "Yes" : "No"}</Body1>
                          </td>
                          <td className={styles.td}>
                            <Body1>{config.cat_iscaptureuserfeedbackenabled ? "Yes" : "No"}</Body1>
                          </td>
                          <td className={styles.td}>
                            <div className={styles.actions}>
                              <Tooltip content="Edit" relationship="label">
                                <Button
                                  appearance="subtle"
                                  icon={<Edit20Regular />}
                                  aria-label={`Edit ${config.cat_name}`}
                                  onClick={() => onEdit(config)}
                                  size="small"
                                />
                              </Tooltip>
                              <Tooltip content="Clone" relationship="label">
                                <Button
                                  appearance="subtle"
                                  icon={<Copy20Regular />}
                                  aria-label={`Clone ${config.cat_name}`}
                                  onClick={() => handleClone(config)}
                                  size="small"
                                />
                              </Tooltip>
                              <Tooltip content="Delete" relationship="label">
                                <Button
                                  appearance="subtle"
                                  icon={<Delete20Regular />}
                                  aria-label={`Delete ${config.cat_name}`}
                                  onClick={() => setDeleteTarget(config)}
                                  size="small"
                                />
                              </Tooltip>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </DialogContent>
            <DialogActions style={{ flexWrap: "wrap", gap: "8px" }}>
              <Button appearance="secondary" onClick={onClose}>Close</Button>
              <Button appearance="primary" icon={<Add20Regular />} onClick={onAddAgent}>Add Agent</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {deleteTarget && (
        <Dialog open onOpenChange={(_, d) => { if (!d.open) setDeleteTarget(null); }}>
          <DialogSurface>
            <DialogBody>
              <DialogTitle>Delete Agent Configuration</DialogTitle>
              <DialogContent>
                <Body1>
                  Are you sure you want to delete <strong>{deleteTarget.cat_name}</strong>? This action cannot be undone.
                </Body1>
              </DialogContent>
              <DialogActions>
                <Button appearance="secondary" onClick={() => setDeleteTarget(null)} disabled={deleteMutation.isPending}>
                  Cancel
                </Button>
                <Button appearance="primary" onClick={handleDeleteConfirm} disabled={deleteMutation.isPending}>
                  {deleteMutation.isPending ? "Deleting..." : "Delete"}
                </Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      )}
    </>
  );
};

export default React.memo(ShowAgentsDialog);
