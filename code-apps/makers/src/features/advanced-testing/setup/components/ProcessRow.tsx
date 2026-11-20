/**
 * Per-row UI for a single Test Automation process (Cloud Flow or Custom Action).
 *
 * Simplified for end-users: one line, name + On/Off badge + Activate button.
 * The bucket the row belongs to is invisible to the user; the parent decides
 * activation order under the hood (plan §2.6 A3).
 *
 * Per RD-M4: per-row control is a one-way `Button` "Activate". Once
 * `statecode === 1` the button is replaced with the On `Badge`. Deactivation
 * is intentionally out of scope.
 *
 * Gates that disable Activate:
 *  - Row is in an A8 duplicate group (tooltip explains).
 *  - `disabledReason` set externally (e.g. CR-health gate for Tester role row).
 *  - An orchestrator run is in flight (`isRunInFlight`).
 *
 * Activation error remap happens inside `workflowService.activateProcess`;
 * this row only surfaces the resulting string inline in a `MessageBar`.
 */

import { useState } from "react";
import {
  Badge,
  Button,
  MessageBar,
  MessageBarBody,
  Spinner,
  Text,
  Tooltip,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import {
  CheckmarkCircleRegular,
  PlayRegular,
  WarningRegular,
} from "@fluentui/react-icons";
import type { BucketId, WorkflowRow } from "../contracts/types";
import {
  BUCKET_POLICIES,
  activateProcess,
} from "../services/workflowService";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    flexWrap: "wrap",
  },
  name: {
    flex: "1 1 250px",
    minWidth: "200px",
  },
  trailing: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
  },
});

export interface ProcessRowProps {
  row: WorkflowRow;
  /** Bucket the orchestrator places this row in. Drives activation policy. */
  bucketId: BucketId;
  /** True when the row is one of the A8 duplicate Custom Actions. */
  isDuplicateBlocked?: boolean;
  /** Non-null when an external gate disables Activate (e.g. CR-health for Tester role). */
  disabledReason?: string | null;
  /** True while `ActivateAllInOrderButton` is running, to suppress per-row activates. */
  isRunInFlight?: boolean;
  /**
   * Error string surfaced by the orchestrator for this row, e.g. from the last
   * "Turn on all" run. Renders in the same inline MessageBar as per-row
   * activation errors. Cleared when the user starts a new per-row activation
   * or when the parent passes `null`.
   */
  externalError?: string | null;
  /**
   * Called when a per-row Activate completes so the parent can refetch and
   * clear any stale orchestrator error attributed to this row (see
   * `FlowsTab.rowErrors`). The row id is forwarded so the parent can drop the
   * matching entry from its error map.
   */
  onActivated?: (rowId: string) => void;
}

export function ProcessRow({
  row,
  bucketId,
  isDuplicateBlocked = false,
  disabledReason = null,
  isRunInFlight = false,
  externalError = null,
  onActivated,
}: ProcessRowProps) {
  const styles = useStyles();
  const [isActivating, setIsActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimisticActive, setOptimisticActive] = useState(false);

  const isActive = row.isActive || optimisticActive;

  const handleActivate = async () => {
    setError(null);
    setIsActivating(true);
    try {
      const policy = BUCKET_POLICIES[bucketId];
      console.log(
        `[AdvancedTesting:Setup:FlowsTab] per-row activate id=${row.id} name="${row.name}"`,
      );
      const res = await activateProcess(row, policy);
      if (res.kind === "activated" || res.kind === "already-active") {
        setOptimisticActive(true);
        onActivated?.(row.id);
      } else {
        setError(res.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsActivating(false);
    }
  };

  const baseDisabled = isActive || isActivating || isRunInFlight;
  const disabled = baseDisabled || isDuplicateBlocked || !!disabledReason;

  let tooltipContent: string | null = null;
  if (isDuplicateBlocked) {
    tooltipContent =
      "This process name appears in more than one solution. Resolve the duplicate before turning it on.";
  } else if (disabledReason) {
    tooltipContent = disabledReason;
  } else if (isRunInFlight) {
    tooltipContent = "Turn on all is currently running.";
  }

  const button = (
    <Button
      appearance="primary"
      size="small"
      icon={isActivating ? <Spinner size="tiny" /> : <PlayRegular />}
      onClick={() => void handleActivate()}
      disabled={disabled}
      aria-label={`Turn on ${row.name}`}
    >
      {isActivating ? "Turning on..." : "Turn on"}
    </Button>
  );

  return (
    <div className={styles.root}>
      <div className={styles.row}>
        <Text size={300} weight="semibold" className={styles.name}>
          {row.name}
        </Text>
        <div className={styles.trailing}>
          {isActive ? (
            <Badge appearance="tint" color="success" icon={<CheckmarkCircleRegular />}>
              On
            </Badge>
          ) : isDuplicateBlocked ? (
            <Badge appearance="tint" color="warning" icon={<WarningRegular />}>
              Duplicate
            </Badge>
          ) : (
            <Badge appearance="tint" color="warning">
              Off
            </Badge>
          )}
          {!isActive ? (
            tooltipContent ? (
              <Tooltip content={tooltipContent} relationship="label" withArrow>
                <span>{button}</span>
              </Tooltip>
            ) : (
              button
            )
          ) : null}
        </div>
      </div>

      {!isActive && (error || externalError) ? (
        <MessageBar intent="error">
          <MessageBarBody>{error ?? externalError}</MessageBarBody>
        </MessageBar>
      ) : null}
    </div>
  );
}
