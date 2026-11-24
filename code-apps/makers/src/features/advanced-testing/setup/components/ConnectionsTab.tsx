/**
 * Connections tab content for Advanced Testing setup.
 *
 * Layout (revised after live UI review):
 *  - The tab itself is the section container (no outer Accordion / collapsible
 *    header). The tab strip already names the section.
 *  - Slim toolbar above the card: Refresh button, right-aligned.
 *  - Single Fluent UI v9 `Card` containing the Connection Reference row.
 *  - Skeleton while loading; error MessageBar with Reload action when the
 *    query fails or returns null (Q17b).
 *
 * The "Test Automation processes" section lives in the separate Flows tab
 * (`FlowsTab.tsx`) starting Phase 3.
 */

import {
  Button,
  Card,
  Divider,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  MessageBarTitle,
  Skeleton,
  SkeletonItem,
  Spinner,
  Tooltip,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { ArrowClockwiseRegular } from "@fluentui/react-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useEnvironmentId } from "../hooks/useEnvironmentId";
import {
  AVAILABLE_CONNECTIONS_KEY,
  CR_QUERY_KEY,
  useConnectionReferences,
} from "../hooks/useConnectionReferences";
import { ConnectionReferenceRow } from "./ConnectionReferenceRow";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: tokens.spacingHorizontalS,
  },
  card: {
    padding: tokens.spacingVerticalM,
  },
  spinner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: tokens.spacingVerticalXXL,
    paddingBottom: tokens.spacingVerticalXXL,
  },
});

interface ConnectionsTabProps {
  /** True when the Connections tab is the active tab. Drives RD-M3 gating. */
  enabled: boolean;
}

export function ConnectionsTab({ enabled }: ConnectionsTabProps) {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const { environmentId, error: envIdError } = useEnvironmentId();
  const crQuery = useConnectionReferences(enabled);

  console.log("[AdvancedTesting:Setup:ConnectionsTab] render", {
    enabled,
    environmentId,
    envIdError,
    crIsLoading: crQuery.isLoading,
    crIsError: crQuery.isError,
    crError: crQuery.error?.message,
    slotCount: crQuery.data?.length,
  });

  const handleRefresh = () => {
    void queryClient.invalidateQueries({ queryKey: CR_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: AVAILABLE_CONNECTIONS_KEY });
  };

  const slots = crQuery.data ?? [];

  return (
    <div className={styles.root}>
      {envIdError ? (
        <MessageBar intent="warning">
          <MessageBarBody>
            <MessageBarTitle>Environment id unavailable</MessageBarTitle>
            {envIdError} Available connections cannot be listed until this is resolved.
          </MessageBarBody>
        </MessageBar>
      ) : null}

      <div className={styles.toolbar}>
        <Tooltip content="Refresh" relationship="label" withArrow>
          <Button
            appearance="subtle"
            icon={<ArrowClockwiseRegular />}
            onClick={handleRefresh}
            disabled={crQuery.isLoading}
            aria-label="Refresh connections"
          />
        </Tooltip>
      </div>

      <Card className={styles.card}>
        {crQuery.isLoading ? (
          <div className={styles.spinner}>
            <Spinner size="medium" label="Loading connection references..." />
          </div>
        ) : crQuery.isError ? (
          <MessageBar intent="error">
            <MessageBarBody>
              <MessageBarTitle>Could not load the connection references</MessageBarTitle>
              {crQuery.error?.message ?? "Unknown error."}
            </MessageBarBody>
            <MessageBarActions>
              <Button appearance="primary" onClick={() => void crQuery.refetch()}>
                Reload
              </Button>
            </MessageBarActions>
          </MessageBar>
        ) : slots.length > 0 ? (
          slots.map((slot, idx) => (
            <div key={slot.definition.logicalName}>
              <ConnectionReferenceRow
                slot={slot}
                environmentId={environmentId}
                enabled={enabled}
              />
              {idx < slots.length - 1 ? <Divider /> : null}
            </div>
          ))
        ) : (
          <Skeleton aria-label="Loading connection references">
            <SkeletonItem style={{ height: "48px" }} />
          </Skeleton>
        )}
      </Card>
    </div>
  );
}
