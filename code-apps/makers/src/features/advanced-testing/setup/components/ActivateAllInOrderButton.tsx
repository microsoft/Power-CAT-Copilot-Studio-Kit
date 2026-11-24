/**
 * "Turn on all" orchestrator button + progress.
 *
 * Wraps `workflowService.activateAllInOrder` which walks the four ordered
 * buckets sequentially (plan §2.6 A3). The bucket boundaries are hidden from
 * the user; we only show: which row is currently being activated, a single
 * ProgressBar across the whole walk, and a summary MessageBar at the end.
 *
 * Disabled when:
 *  - Discovery hasn't loaded yet.
 *  - Any A8 duplicate Custom Action exists (orchestrator blocked).
 *  - Every orchestrated row is already on (nothing to do).
 *  - A run is already in flight.
 *
 * On halt, the summary surfaces "X turned on, Y failed, Z skipped"; the user
 * can re-click after fixing the failed item (A10 idempotency makes re-runs
 * safe).
 */

import { useMemo, useState } from "react";
import {
  Button,
  Caption1,
  Field,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  MessageBarTitle,
  ProgressBar,
  Tooltip,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { PlayCircleRegular, DismissRegular } from "@fluentui/react-icons";
import type {
  ActivationProgress,
  ActivationRunResult,
  ProcessInventory,
} from "../contracts/types";
import {
  ORCHESTRATOR_BUCKET_ORDER,
  activateAllInOrder,
  getBucketRows,
} from "../services/workflowService";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
  },
  topRow: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    flexWrap: "wrap",
  },
  counter: {
    color: tokens.colorNeutralForeground2,
  },
});

export interface ActivateAllInOrderButtonProps {
  inventory: ProcessInventory | undefined;
  /** True while discovery is loading or refetching. */
  isLoading?: boolean;
  /** Called after the run finishes so the parent can invalidate discovery. */
  onRunComplete?: (result: ActivationRunResult) => void;
  /** Called when a run starts/stops so child rows can suppress per-row activates. */
  onRunningChange?: (isRunning: boolean) => void;
  /**
   * Called when a new run starts. Parent should clear any orchestrator-driven
   * per-row error overlays for the upcoming run.
   */
  onRunStart?: () => void;
  /**
   * Called once after the run completes with the map of `row.id -> error`
   * for every row that failed inside the orchestrator. Parent uses this to
   * surface inline MessageBars under the affected rows.
   */
  onRowErrors?: (errors: Map<string, string>) => void;
}

export function ActivateAllInOrderButton({
  inventory,
  isLoading = false,
  onRunComplete,
  onRunningChange,
  onRunStart,
  onRowErrors,
}: ActivateAllInOrderButtonProps) {
  const styles = useStyles();
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<ActivationProgress | null>(null);
  const [runIndex, setRunIndex] = useState(0);
  const [result, setResult] = useState<ActivationRunResult | null>(null);

  const { totalOrchestrated, inactiveOrchestrated } = useMemo(() => {
    if (!inventory) return { totalOrchestrated: 0, inactiveOrchestrated: 0 };
    let total = 0;
    let inactive = 0;
    for (const bid of ORCHESTRATOR_BUCKET_ORDER) {
      const rows = getBucketRows(inventory, bid);
      total += rows.length;
      for (const r of rows) {
        if (!r.isActive) inactive++;
      }
    }
    return { totalOrchestrated: total, inactiveOrchestrated: inactive };
  }, [inventory]);

  const hasDuplicates = (inventory?.duplicates.length ?? 0) > 0;
  const disabledReason = !inventory
    ? "Loading processes..."
    : isLoading
      ? "Refreshing..."
      : hasDuplicates
        ? "Resolve duplicate processes before turning them on."
        : totalOrchestrated === 0
          ? "No processes found in this environment."
          : inactiveOrchestrated === 0
            ? "All processes are already on."
            : null;
  const disabled = isRunning || disabledReason !== null;

  const handleRun = async () => {
    if (!inventory) return;
    setResult(null);
    setProgress(null);
    setRunIndex(0);
    setIsRunning(true);
    onRunningChange?.(true);
    onRunStart?.();

    let activatedSoFar = 0;
    try {
      const run = await activateAllInOrder(inventory, (p) => {
        setProgress(p);
        if (p.phase === "done" || p.phase === "failed") {
          activatedSoFar += 1;
          setRunIndex(activatedSoFar);
        }
      });
      setResult(run);
      const errorMap = new Map<string, string>();
      for (const bucket of run.buckets) {
        for (const outcome of bucket.outcomes) {
          if (outcome.kind === "failed") {
            errorMap.set(outcome.row.id, outcome.error);
          }
        }
      }
      onRowErrors?.(errorMap);
      onRunComplete?.(run);
    } catch (e) {
      setResult({
        buckets: [],
        totals: { activated: 0, alreadyActive: 0, failed: 0, skipped: 0 },
        stoppedBeforeBucket: null,
      });
      console.error("[AdvancedTesting:Setup:FlowsTab] activateAllInOrder threw:", e);
    } finally {
      setIsRunning(false);
      onRunningChange?.(false);
    }
  };

  const button = (
    <Button
      appearance="primary"
      icon={<PlayCircleRegular />}
      onClick={() => void handleRun()}
      disabled={disabled}
      aria-label="Turn on all Test Automation processes"
    >
      {isRunning ? "Turning on..." : "Turn on all"}
    </Button>
  );

  let counterText: string | null = null;
  if (inventory && !isRunning) {
    if (totalOrchestrated === 0) {
      counterText = null;
    } else if (inactiveOrchestrated === 0) {
      counterText = `All ${totalOrchestrated} processes are on.`;
    } else {
      counterText = `${inactiveOrchestrated} of ${totalOrchestrated} processes are off.`;
    }
  }

  const summary = result ? buildSummary(result) : null;

  return (
    <div className={styles.root}>
      <div className={styles.topRow}>
        {disabledReason && !isRunning ? (
          <Tooltip content={disabledReason} relationship="label" withArrow>
            <span>{button}</span>
          </Tooltip>
        ) : (
          button
        )}
        {counterText ? <Caption1 className={styles.counter}>{counterText}</Caption1> : null}
      </div>

      {isRunning && progress && inactiveOrchestrated > 0 ? (
        <Field
          validationMessage={`Turning on: ${progress.row.name}`}
          validationState="none"
        >
          <ProgressBar
            value={Math.min(runIndex, inactiveOrchestrated)}
            max={inactiveOrchestrated}
            shape="rounded"
            aria-label="Turning on processes"
          />
        </Field>
      ) : null}

      {summary ? (
        <MessageBar intent={summary.intent}>
          <MessageBarBody>
            <MessageBarTitle>{summary.title}</MessageBarTitle>
            {summary.body}
          </MessageBarBody>
          <MessageBarActions
            containerAction={
              <Button
                appearance="transparent"
                icon={<DismissRegular />}
                aria-label="Dismiss summary"
                onClick={() => setResult(null)}
              />
            }
          />
        </MessageBar>
      ) : null}
    </div>
  );
}

function buildSummary(result: ActivationRunResult): {
  intent: "success" | "warning" | "error";
  title: string;
  body: string;
} {
  const { activated, failed, skipped } = result.totals;

  if (failed > 0) {
    const noun = failed === 1 ? "flow" : "flows";
    return {
      intent: "error",
      title: `${failed} ${noun} didn't turn on`,
      body: `See the error shown next to the ${noun} below.`,
    };
  }
  if (activated > 0) {
    const noun = activated === 1 ? "flow" : "flows";
    return { intent: "success", title: "All set", body: `${activated} ${noun} turned on.` };
  }
  if (skipped > 0) {
    return {
      intent: "warning",
      title: "Nothing to turn on",
      body: "No eligible flows were found in this run.",
    };
  }
  return { intent: "warning", title: "Nothing to turn on", body: "No changes were made." };
}
