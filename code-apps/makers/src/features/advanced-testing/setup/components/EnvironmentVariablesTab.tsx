/**
 * Environment Variables tab content for Advanced Testing setup, Phase 6.
 *
 * Layout (revised after live UI review):
 *  - The tab itself is the section container (no outer Accordion).
 *  - Slim toolbar above the card: docs Info link + Refresh button, right-aligned.
 *  - Single Fluent UI v9 `Card` containing one `EnvVarRow` per definition,
 *    separated by `Divider`s.
 *  - Bottom row: primary Save button, right-aligned. Disabled state explains
 *    itself via a Tooltip.
 *  - Warning bars (forced-pick, missing definitions, multi-value dedupe, save
 *    result) stack between the toolbar and the card.
 *
 * State machine:
 *  - Parent tracks per-row edited string in `edits`. A row is "dirty" when its
 *    canonicalized edit differs from the canonicalized server value (RD-M1 for
 *    decimals; raw string compare for text).
 *  - RD-8 forced-pick: if `cat_PowerAutomateEndpoint` server value is empty or
 *    outside the allow-list, that row renders with `validationState="error"`
 *    and Save is enabled even without a dirty edit (so the user can correct
 *    it without first making a change).
 *  - On save, only dirty + forced-pick rows are PATCH/POSTed sequentially.
 *  - On mutation success, the EV query is invalidated; the refetched data
 *    re-baselines `edits` via the "adjust state on prop change" pattern
 *    (https://react.dev/reference/react/useState#storing-information-from-previous-renders).
 *
 * All Fluent UI v9; no em-dashes anywhere.
 */

import { useMemo, useState } from "react";
import {
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
} from "@fluentui/react-icons";
import { useQueryClient } from "@tanstack/react-query";
import type { EnvironmentVariable } from "../contracts/types";
import {
  ENVIRONMENT_VARIABLES_KEY,
  useEnvironmentVariables,
  useSaveEnvironmentVariableMutation,
} from "../hooks/useEnvironmentVariables";
import {
  isAllowedPowerAutomateEndpoint,
  POWER_AUTOMATE_ENDPOINT_OPTIONS,
} from "../services/environmentVariableService";
import { EnvVarRow } from "./EnvVarRow";

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
    padding: "0",
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
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: tokens.spacingHorizontalS,
    paddingTop: tokens.spacingVerticalXS,
  },
});

const POWER_AUTOMATE_ENDPOINT_SCHEMA = "cat_PowerAutomateEndpoint";

interface EnvironmentVariablesTabProps {
  /** True when the EV tab is the active tab. Drives RD-M3 gating. */
  enabled: boolean;
}

/** Effective server-side string for a variable, falling back to its default. */
function effectiveServerValue(v: EnvironmentVariable): string {
  return v.currentValue?.value ?? v.definition.defaultValue ?? "";
}

/** RD-M1 decimal canonicalization. NaN-safe: returns raw on parse failure. */
function canonicalizeDecimal(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  const n = Number(trimmed);
  if (Number.isNaN(n)) return trimmed;
  return n.toString();
}

/** Compare a current edit to the server value with RD-M1 canonicalization. */
function isDirty(v: EnvironmentVariable, edit: string): boolean {
  const server = effectiveServerValue(v);
  if (v.definition.kind === "decimal") {
    return canonicalizeDecimal(edit) !== canonicalizeDecimal(server);
  }
  return edit !== server;
}

interface RowValidation {
  state: "none" | "success" | "warning" | "error";
  message?: string;
}

function validateRow(
  v: EnvironmentVariable,
  edit: string,
  forcedPick: boolean,
): RowValidation {
  if (v.definition.kind === "decimal") {
    const trimmed = edit.trim();
    if (trimmed === "") {
      return { state: "error", message: "Enter a number." };
    }
    if (Number.isNaN(Number(trimmed))) {
      return { state: "error", message: "Enter a valid number." };
    }
    return { state: "none" };
  }
  if (
    v.definition.kind === "text" &&
    v.definition.schemaName === POWER_AUTOMATE_ENDPOINT_SCHEMA
  ) {
    if (forcedPick && !isAllowedPowerAutomateEndpoint(edit)) {
      return {
        state: "error",
        message: `Select one of: ${POWER_AUTOMATE_ENDPOINT_OPTIONS.join(", ")}.`,
      };
    }
    return { state: "none" };
  }
  return { state: "none" };
}

export function EnvironmentVariablesTab({ enabled }: EnvironmentVariablesTabProps) {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const evQuery = useEnvironmentVariables(enabled);
  const saveMutation = useSaveEnvironmentVariableMutation();

  // Per-row edited string, keyed by definition id. Re-baselined whenever the
  // server data changes (initial load, refresh, post-save invalidation).
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [topMessage, setTopMessage] = useState<{
    intent: "success" | "error";
    text: string;
  } | null>(null);
  // React Query uses structural sharing: when the server returns identical
  // data, the `data` reference is reused, so identity-based comparison would
  // miss a Refresh that produced no value change. `dataUpdatedAt` increments
  // on every successful fetch and is the correct re-baseline trigger.
  const [prevDataUpdatedAt, setPrevDataUpdatedAt] = useState<number>(0);

  console.log("[AdvancedTesting:Setup:EnvVarTab] render", {
    enabled,
    isLoading: evQuery.isLoading,
    isError: evQuery.isError,
    error: evQuery.error?.message,
    variableCount: evQuery.data?.variables.length,
    missing: evQuery.data?.missingSchemaNames,
    dataUpdatedAt: evQuery.dataUpdatedAt,
  });

  if (evQuery.data && evQuery.dataUpdatedAt !== prevDataUpdatedAt) {
    setPrevDataUpdatedAt(evQuery.dataUpdatedAt);
    const next: Record<string, string> = {};
    for (const v of evQuery.data.variables) {
      next[v.definition.id] = effectiveServerValue(v);
    }
    setEdits(next);
    setRowErrors({});
  }

  const variables = useMemo(
    () => evQuery.data?.variables ?? [],
    [evQuery.data],
  );

  // Forced-pick mode for the Power Automate region row.
  const forcedPickActive = useMemo(() => {
    const ev = variables.find(
      (v) => v.definition.schemaName === POWER_AUTOMATE_ENDPOINT_SCHEMA,
    );
    if (!ev) return false;
    return !isAllowedPowerAutomateEndpoint(effectiveServerValue(ev));
  }, [variables]);

  const rowValidations = useMemo(() => {
    const m = new Map<string, RowValidation>();
    for (const v of variables) {
      const edit = edits[v.definition.id] ?? "";
      const isPaeRow = v.definition.schemaName === POWER_AUTOMATE_ENDPOINT_SCHEMA;
      m.set(v.definition.id, validateRow(v, edit, isPaeRow && forcedPickActive));
    }
    return m;
  }, [variables, edits, forcedPickActive]);

  const dirtyVars = useMemo(
    () =>
      variables.filter((v) => isDirty(v, edits[v.definition.id] ?? "")),
    [variables, edits],
  );

  // Rows that must be saved this round: dirty + forced-pick (so the user can
  // correct an out-of-allow-list endpoint even if they haven't changed it).
  const rowsToSave = useMemo(() => {
    const set = new Map(dirtyVars.map((v) => [v.definition.id, v]));
    if (forcedPickActive) {
      const ev = variables.find(
        (v) => v.definition.schemaName === POWER_AUTOMATE_ENDPOINT_SCHEMA,
      );
      if (ev) set.set(ev.definition.id, ev);
    }
    return Array.from(set.values());
  }, [dirtyVars, forcedPickActive, variables]);

  const hasValidationError = Array.from(rowValidations.values()).some(
    (rv) => rv.state === "error",
  );

  const saveDisabled =
    saveMutation.isPending ||
    rowsToSave.length === 0 ||
    hasValidationError;

  const handleRefresh = () => {
    setTopMessage(null);
    setRowErrors({});
    void queryClient.invalidateQueries({ queryKey: ENVIRONMENT_VARIABLES_KEY });
  };

  const handleChange = (defId: string, next: string) => {
    setEdits((prev) => ({ ...prev, [defId]: next }));
    setRowErrors((prev) => {
      if (!prev[defId]) return prev;
      const rest = { ...prev };
      delete rest[defId];
      return rest;
    });
    setTopMessage(null);
  };

  const handleSave = async () => {
    if (rowsToSave.length === 0) return;
    setTopMessage(null);
    const failures: Record<string, string> = {};
    let saved = 0;

    for (const v of rowsToSave) {
      const rawEdit = edits[v.definition.id] ?? "";
      const valueToSave =
        v.definition.kind === "decimal" ? canonicalizeDecimal(rawEdit) : rawEdit;
      try {
        await saveMutation.mutateAsync({
          definitionId: v.definition.id,
          schemaName: v.definition.schemaName,
          value: valueToSave,
          existingValueId: v.currentValue?.id ?? null,
        });
        saved += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Save failed.";
        failures[v.definition.id] = msg;
      }
    }

    setRowErrors(failures);
    if (Object.keys(failures).length === 0) {
      setTopMessage({
        intent: "success",
        text:
          saved === 1
            ? "Saved 1 environment variable."
            : `Saved ${saved} environment variables.`,
      });
    } else if (saved > 0) {
      setTopMessage({
        intent: "error",
        text: `Saved ${saved} of ${rowsToSave.length}. See errors below.`,
      });
    } else {
      setTopMessage({
        intent: "error",
        text: "Save failed. See errors below.",
      });
    }
  };

  const saveDisabledReason = (): string | undefined => {
    if (saveMutation.isPending) return "Saving...";
    if (hasValidationError) return "Fix the highlighted fields before saving.";
    if (rowsToSave.length === 0) return "No changes to save.";
    return undefined;
  };

  const toolbar = (
    <div className={styles.toolbar}>
      <Tooltip content="Refresh" relationship="label" withArrow>
        <Button
          appearance="subtle"
          icon={<ArrowClockwiseRegular />}
          onClick={handleRefresh}
          disabled={evQuery.isLoading || saveMutation.isPending}
          aria-label="Refresh environment variables"
        />
      </Tooltip>
    </div>
  );

  const saveButton = (
    <Button
      appearance="primary"
      onClick={() => void handleSave()}
      disabled={saveDisabled}
    >
      Save
    </Button>
  );

  return (
    <div className={styles.root}>
      {evQuery.isLoading ? (
        <div className={styles.spinnerWrap}>
          <Spinner size="medium" label="Loading environment variables..." />
        </div>
      ) : evQuery.isError ? (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>Could not load environment variables</MessageBarTitle>
            {evQuery.error?.message ?? "Unknown error."}
          </MessageBarBody>
        </MessageBar>
      ) : !evQuery.data ? (
        <Skeleton aria-label="Loading environment variables">
          <SkeletonItem style={{ height: "120px" }} />
        </Skeleton>
      ) : variables.length === 0 ? (
        <>
          {toolbar}
          <MessageBar intent="warning">
            <MessageBarBody>
              <MessageBarTitle>No environment variables found</MessageBarTitle>
              Install or update the Copilot Studio Kit solution, then click Refresh.
            </MessageBarBody>
          </MessageBar>
        </>
      ) : (
        <>
          {toolbar}

          {evQuery.data.missingSchemaNames.length > 0 ? (
            <MessageBar intent="warning">
              <MessageBarBody>
                <MessageBarTitle>Some expected variables are missing</MessageBarTitle>
                {evQuery.data.missingSchemaNames.join(", ")}
                {". Reinstall or update the Copilot Studio Kit solution."}
              </MessageBarBody>
            </MessageBar>
          ) : null}

          {forcedPickActive ? (
            <MessageBar intent="warning">
              <MessageBarBody>
                <MessageBarTitle>Pick a Power Automate region</MessageBarTitle>
                The current value is empty or not one of{" "}
                {POWER_AUTOMATE_ENDPOINT_OPTIONS.join(", ")}. Select a supported
                region and click Save.
              </MessageBarBody>
            </MessageBar>
          ) : null}

          {topMessage ? (
            <MessageBar intent={topMessage.intent}>
              <MessageBarBody>{topMessage.text}</MessageBarBody>
            </MessageBar>
          ) : null}

          <Card className={styles.card}>
            {variables.map((v, idx) => {
              const validation = rowValidations.get(v.definition.id);
              const isPaeRow = v.definition.schemaName === POWER_AUTOMATE_ENDPOINT_SCHEMA;
              return (
                <div key={v.definition.id}>
                  <EnvVarRow
                    envVar={v}
                    value={edits[v.definition.id] ?? ""}
                    validationState={validation?.state}
                    validationMessage={validation?.message}
                    rowError={rowErrors[v.definition.id] ?? null}
                    disabled={saveMutation.isPending}
                    required={isPaeRow && forcedPickActive}
                    onChange={(next) => handleChange(v.definition.id, next)}
                  />
                  {idx < variables.length - 1 ? <Divider /> : null}
                </div>
              );
            })}
          </Card>

          <div className={styles.footer}>
            {saveMutation.isPending ? (
              <Spinner size="tiny" label="Saving..." />
            ) : null}
            {saveDisabled && saveDisabledReason() ? (
              <Tooltip
                content={saveDisabledReason()!}
                relationship="description"
                withArrow
              >
                {saveButton}
              </Tooltip>
            ) : (
              saveButton
            )}
          </div>
        </>
      )}
    </div>
  );
}
