/**
 * Connection Reference row, Advanced Testing Setup.
 *
 * Accepts a {@link ConnectionReferenceSlot} pairing the static definition
 * (`REQUIRED_CRS` entry) with the live Dataverse record (or `null` when the
 * CR row is absent from this environment).
 *
 * Two render modes:
 *  - `slot.record === null` (Not Installed): name + sub-text + a single
 *    "Not installed" status icon + "+ Create New Connection" link (uses the
 *    definition's connectorId). No Dropdown, no mapping mutation, no
 *    available-connections fetch.
 *  - `slot.record !== null` (live record): full single-row layout matching
 *    Power Shield's `ConnectionReferenceRow`:
 *      [name + logical sub-text] [Dropdown] [status icon] [refresh] [+ Create New Connection]
 *    Auto-saves on dropdown change. Status icon reflects the mapping state:
 *      - Saving: Spinner
 *      - Mapped + connection visible to current user: green check
 *      - Mapped but not visible to current user: calm blue info icon
 *        (Dropdown disabled; override via "+ Create New Connection")
 *      - Save error: warning (retry by re-selecting)
 *
 * RD-10 reconciliation: after a successful save the CR query refetches. If
 * the persisted `connectionId` differs from what was selected, a warning
 * MessageBar surfaces the concurrent edit.
 */

import { useMemo, useState } from "react";
import {
  Button,
  Dropdown,
  Link,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Option,
  Spinner,
  Text,
  Tooltip,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import {
  AddRegular,
  ArrowClockwiseRegular,
  CheckmarkCircleRegular,
  ErrorCircleRegular,
  InfoRegular,
  OpenRegular,
  WarningRegular,
} from "@fluentui/react-icons";
import type { ConnectionReferenceSlot } from "../contracts/types";
import { normalizeConnectionId } from "../services/connectionReferenceService";
import {
  useAvailableConnections,
  useMapConnectionMutation,
} from "../hooks/useConnectionReferences";

const useRowStyles = makeStyles({
  row: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
    flexWrap: "wrap",
  },
  info: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    flex: "1 1 250px",
    minWidth: "200px",
  },
  logicalName: {
    color: tokens.colorNeutralForeground3,
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    flexWrap: "wrap",
  },
  dropdown: {
    width: "320px",
  },
  inlineLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
  },
  notInstalledLabel: {
    color: tokens.colorPaletteRedForeground1,
  },
});

const MAKER_PORTAL_BASE = "https://make.powerapps.com";

function buildNewConnectionUrl(envId: string | null, connectorId: string): string {
  const apiName = connectorId.includes("/") ? connectorId.split("/").pop()! : connectorId;
  const tail = `/connections/available?apiName=${encodeURIComponent(apiName)}`;
  return envId
    ? `${MAKER_PORTAL_BASE}/environments/${encodeURIComponent(envId)}${tail}`
    : `${MAKER_PORTAL_BASE}${tail}`;
}

/** Short, locale-formatted date (e.g. "May 13, 2026"). */
function formatDate(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

interface ConnectionReferenceRowProps {
  slot: ConnectionReferenceSlot;
  environmentId: string | null;
  /** True when the Connections tab is active (drives RD-M3 gating). */
  enabled: boolean;
}

export function ConnectionReferenceRow({
  slot,
  environmentId,
  enabled,
}: ConnectionReferenceRowProps) {
  if (slot.record === null) {
    return <NotInstalledRow definition={slot.definition} environmentId={environmentId} />;
  }
  return (
    <MappedRow
      cr={slot.record}
      environmentId={environmentId}
      enabled={enabled}
    />
  );
}

interface NotInstalledRowProps {
  definition: ConnectionReferenceSlot["definition"];
  environmentId: string | null;
}

function NotInstalledRow({ definition, environmentId }: NotInstalledRowProps) {
  const styles = useRowStyles();
  const newConnectionUrl = buildNewConnectionUrl(environmentId, definition.connectorId);

  return (
    <div className={styles.row}>
      <div className={styles.info}>
        <Text weight="semibold">{definition.displayName}</Text>
        <Text size={200} className={styles.logicalName}>
          {definition.logicalName}
        </Text>
      </div>
      <div className={styles.actions}>
        <Tooltip
          content="This connection reference is not installed in this environment. Install or update the Copilot Studio Kit solution to add it."
          relationship="label"
          withArrow
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              color: tokens.colorPaletteRedForeground1,
            }}
          >
            <ErrorCircleRegular fontSize={20} aria-hidden />
            <Text size={300} className={styles.notInstalledLabel}>
              Not installed
            </Text>
          </span>
        </Tooltip>
        {environmentId ? (
          <Link
            href={newConnectionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.inlineLink}
          >
            <AddRegular fontSize={12} />
            Create New Connection
            <OpenRegular fontSize={12} />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

interface MappedRowProps {
  cr: NonNullable<ConnectionReferenceSlot["record"]>;
  environmentId: string | null;
  enabled: boolean;
}

function MappedRow({ cr, environmentId, enabled }: MappedRowProps) {
  const styles = useRowStyles();
  const availableQuery = useAvailableConnections(cr.connectorId, environmentId, enabled);
  const mapMutation = useMapConnectionMutation();

  const connections = useMemo(() => {
    const list = availableQuery.data?.connections ?? [];
    // Sort newest first by createdTime. Rows with missing/unparseable dates
    // sink to the end so valid ones surface at the top.
    return [...list].sort((a, b) => {
      const ta = Date.parse(a.createdTime);
      const tb = Date.parse(b.createdTime);
      const aValid = Number.isFinite(ta);
      const bValid = Number.isFinite(tb);
      if (aValid && bValid) return tb - ta;
      if (aValid) return -1;
      if (bValid) return 1;
      return 0;
    });
  }, [availableQuery.data]);
  const connectionsLoadError = availableQuery.data?.error ?? null;

  const matchedConnection = useMemo(() => {
    if (!cr.connectionId) return undefined;
    return connections.find((c) => c.normalizedId === cr.connectionId);
  }, [cr.connectionId, connections]);

  const hasDataverseMapping = !!cr.connectionId;
  const isMappedAndVisible = !!matchedConnection;
  const isMappedButInvisible =
    hasDataverseMapping &&
    !isMappedAndVisible &&
    !connectionsLoadError &&
    availableQuery.isSuccess;

  // RD-10 concurrent-edit tracking.
  const [lastAttempted, setLastAttempted] = useState<{
    expectedNormalized: string;
  } | null>(null);
  const concurrentEditDetected = useMemo(() => {
    if (!lastAttempted) return false;
    if (mapMutation.isPending) return false;
    if (!cr.connectionId) return true; // persisted reverted to unmapped
    return cr.connectionId !== lastAttempted.expectedNormalized;
  }, [cr.connectionId, lastAttempted, mapMutation.isPending]);

  const handleSelect = (rawName: string | null) => {
    if (!rawName) return;
    const picked = connections.find((c) => c.name === rawName);
    if (!picked) return;
    const normalized = picked.normalizedId ?? normalizeConnectionId(picked.name);
    if (!normalized) {
      console.warn(
        "[AdvancedTesting:Setup] selected connection has no extractable id",
        picked,
      );
      return;
    }
    if (normalized === cr.connectionId) return;
    setLastAttempted({ expectedNormalized: normalized });
    mapMutation.mutate({ connectionReferenceId: cr.id, connectionName: picked.name });
  };

  const isLoadingConnections = enabled && availableQuery.isLoading;
  const newConnectionUrl = buildNewConnectionUrl(environmentId, cr.connectorId);

  return (
    <>
      <div className={styles.row}>
        <div className={styles.info}>
          <Text weight="semibold">{cr.displayName}</Text>
          {cr.logicalName ? (
            <Text size={200} className={styles.logicalName}>
              {cr.logicalName}
            </Text>
          ) : null}
        </div>

        <div className={styles.actions}>
          <Dropdown
            className={styles.dropdown}
            aria-label={`Connection for ${cr.displayName}`}
            placeholder={
              isMappedButInvisible
                ? "Already set up"
                : isLoadingConnections
                  ? "Loading connections..."
                  : "Select a connection..."
            }
            value={matchedConnection?.displayName ?? ""}
            selectedOptions={matchedConnection ? [matchedConnection.name] : []}
            disabled={
              isLoadingConnections || mapMutation.isPending || isMappedButInvisible
            }
            onOptionSelect={(_event, data) => handleSelect(data.optionValue ?? null)}
          >
            {connections.length === 0 ? (
              <Option key="__none" value="" disabled>
                {isLoadingConnections ? "Loading..." : "No connections available"}
              </Option>
            ) : (
              connections.map((conn) => {
                const dateStr = formatDate(conn.createdTime);
                const label = dateStr ? `${conn.displayName} (${dateStr})` : conn.displayName;
                const subParts = [conn.status, conn.createdBy].filter(Boolean);
                return (
                  <Option key={conn.name} value={conn.name} text={label}>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <Text size={200}>{label}</Text>
                      {subParts.length > 0 ? (
                        <Text
                          size={100}
                          style={{ color: tokens.colorNeutralForeground3 }}
                        >
                          {subParts.join(" \u00B7 ")}
                        </Text>
                      ) : null}
                    </div>
                  </Option>
                );
              })
            )}
          </Dropdown>

          {mapMutation.isPending ? (
            <Spinner size="tiny" aria-label="Saving connection mapping..." />
          ) : mapMutation.isError ? (
            <Tooltip
              content={`Failed to save: ${mapMutation.error?.message ?? "Unknown error"}. Select a connection again to retry.`}
              relationship="label"
              withArrow
            >
              <WarningRegular
                style={{
                  color: tokens.colorPaletteDarkOrangeForeground1,
                  fontSize: "20px",
                  cursor: "help",
                }}
                aria-label="Mapping failed"
              />
            </Tooltip>
          ) : isMappedAndVisible ? (
            <CheckmarkCircleRegular
              style={{ color: tokens.colorPaletteGreenForeground1, fontSize: "20px" }}
              aria-label="Connection mapped"
            />
          ) : isMappedButInvisible ? (
            <Tooltip
              content="Already set up by another admin or user. You can continue, or use + Create New Connection on the right to replace it."
              relationship="label"
              withArrow
            >
              <InfoRegular
                tabIndex={0}
                role="img"
                style={{
                  color: tokens.colorBrandForeground1,
                  fontSize: "20px",
                  cursor: "help",
                  outline: "none",
                }}
                aria-label="Connection already set up"
              />
            </Tooltip>
          ) : null}

          <Tooltip
            content="Refresh available connections"
            relationship="label"
            withArrow
          >
            <Button
              appearance="subtle"
              size="small"
              icon={<ArrowClockwiseRegular />}
              onClick={() => void availableQuery.refetch()}
              disabled={availableQuery.isFetching}
              aria-label={`Refresh connections for ${cr.displayName}`}
            />
          </Tooltip>

          {environmentId ? (
            <Link
              href={newConnectionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.inlineLink}
            >
              <AddRegular fontSize={12} />
              Create New Connection
              <OpenRegular fontSize={12} />
            </Link>
          ) : null}
        </div>
      </div>

      {connectionsLoadError ? (
        <MessageBar intent="error" style={{ marginTop: tokens.spacingVerticalS }}>
          <MessageBarBody>
            <MessageBarTitle>Could not load connections</MessageBarTitle>
            {connectionsLoadError}
          </MessageBarBody>
        </MessageBar>
      ) : null}

      {concurrentEditDetected ? (
        <MessageBar intent="warning" style={{ marginTop: tokens.spacingVerticalS }}>
          <MessageBarBody>
            <MessageBarTitle>Concurrent update detected</MessageBarTitle>
            Another admin updated this connection reference; reloaded to current state.
          </MessageBarBody>
        </MessageBar>
      ) : null}
    </>
  );
}
