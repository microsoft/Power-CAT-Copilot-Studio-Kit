/**
 * Pure derivation utilities for Advanced Testing Setup status.
 *
 * Extracted from `SetupScreen.tsx` so the landing page (`AdvancedTesting.tsx`)
 * and the Setup screen can share the exact same warning rules. Single source
 * of truth: if a section shows a warning Badge inside Setup, the landing-page
 * indicator on the gear reflects it.
 *
 * These functions are intentionally pure (no React, no React Query) so they
 * can be unit-tested and consumed from any render context.
 */

import {
  ADVANCED_TESTING_EV_SCHEMA_NAMES,
  isAllowedPowerAutomateEndpoint,
} from "../services/environmentVariableService";
import {
  ORCHESTRATOR_BUCKET_ORDER,
  getBucketRows,
} from "../services/workflowService";
import type {
  ConnectionReferenceSlot,
  EnvironmentVariable,
  ProcessInventory,
} from "../contracts/types";

/** Schema name of the EV that selects the Power Automate regional endpoint. */
export const POWER_AUTOMATE_ENDPOINT_SCHEMA_NAME = "cat_PowerAutomateEndpoint";

/** Section-level badge state used by SetupScreen panel headers. */
export type BadgeState = { kind: "none" } | { kind: "warn"; label: string };

/** Human-readable section names used in the landing-page indicator tooltip. */
export type SectionLabel = "Connections" | "Flows" | "Environment variables";

/** Overall Setup status summary consumed by the landing-page indicator. */
export interface SetupStatusSummary {
  /**
   * - `"unknown"`: at least one query is still loading or has not yet
   *   reached a terminal state. The caller should hide the indicator.
   * - `"error"`: at least one query has errored and none are still loading.
   * - `"warning"`: all three queries succeeded and at least one section has
   *   a warning.
   * - `"ok"`: all three queries succeeded and no section has a warning.
   */
  overall: "ok" | "warning" | "error" | "unknown";
  /** Sections currently flagged with a warning. Empty unless `overall === "warning"`. */
  sectionsWithWarnings: SectionLabel[];
}

/** Per-section status input passed to {@link summarizeSetupStatus}. */
export interface SectionStatusInput {
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
  badge: BadgeState;
}

/**
 * Connections section warning. Aggregates across every Required Connection
 * Reference slot. Label uses the form `n not installed, m not mapped` (zero
 * parts omitted). Returns `{ kind: "none" }` until the query has succeeded
 * so the UI never renders a warning on partial or stale data.
 */
export function deriveConnectionsBadge(
  slots: ConnectionReferenceSlot[] | undefined,
  status: { isLoading: boolean; isError: boolean; isSuccess: boolean },
): BadgeState {
  if (!status.isSuccess || status.isLoading || status.isError || !slots) {
    return { kind: "none" };
  }
  let notInstalled = 0;
  let notMapped = 0;
  for (const slot of slots) {
    if (slot.record === null) {
      notInstalled += 1;
    } else if (!slot.record.connectionId) {
      notMapped += 1;
    }
  }
  const parts: string[] = [];
  if (notInstalled > 0) parts.push(`${notInstalled} not installed`);
  if (notMapped > 0) parts.push(`${notMapped} not mapped`);
  if (parts.length === 0) return { kind: "none" };
  return { kind: "warn", label: parts.join(", ") };
}

/**
 * Flows section warning. Surfaces problems in priority order: duplicates
 * blocked first (data integrity), then N of M orchestrated flows off.
 * Returns `none` while loading, on error, or when inventory is undefined.
 */
export function deriveFlowsBadge(
  inventory: ProcessInventory | undefined,
  isLoading: boolean,
  isError: boolean,
): BadgeState {
  if (isLoading || isError || !inventory) return { kind: "none" };
  if (inventory.duplicates.length > 0) {
    return { kind: "warn", label: "Duplicates blocked" };
  }
  const orchestrated = ORCHESTRATOR_BUCKET_ORDER.flatMap((bid) =>
    getBucketRows(inventory, bid),
  );
  const total = orchestrated.length;
  const off = orchestrated.filter((r) => !r.isActive).length;
  if (total === 0) return { kind: "none" };
  if (off === 0) return { kind: "none" };
  return { kind: "warn", label: `${off} of ${total} off` };
}

/**
 * Environment Variables section warning. Two distinct problems: definitions
 * missing (the solution is not fully imported) and region not set (the
 * Power Automate endpoint EV is unset or not on the allow-list).
 */
export function deriveEnvVarsBadge(
  variables: EnvironmentVariable[] | undefined,
  isLoading: boolean,
  isError: boolean,
): BadgeState {
  if (isLoading || isError || !variables) return { kind: "none" };
  const expected = ADVANCED_TESTING_EV_SCHEMA_NAMES.length;
  if (variables.length < expected) {
    return { kind: "warn", label: "Definitions missing" };
  }
  const endpoint = variables.find(
    (v) => v.definition.schemaName === POWER_AUTOMATE_ENDPOINT_SCHEMA_NAME,
  );
  if (endpoint) {
    const effective = endpoint.currentValue?.value ?? endpoint.definition.defaultValue ?? "";
    if (!isAllowedPowerAutomateEndpoint(effective)) {
      return { kind: "warn", label: "Region not set" };
    }
  }
  return { kind: "none" };
}

/**
 * Combines per-section status into a single overall summary for the
 * landing-page indicator. Pure function so it can be unit-tested.
 *
 * Precedence: `unknown` (any loading) > `error` (any errored) > `warning`
 * (all success and at least one section has a warning) > `ok`.
 */
export function summarizeSetupStatus(sections: {
  connections: SectionStatusInput;
  flows: SectionStatusInput;
  envVars: SectionStatusInput;
}): SetupStatusSummary {
  const all = [sections.connections, sections.flows, sections.envVars];
  if (all.some((s) => s.isLoading)) {
    return { overall: "unknown", sectionsWithWarnings: [] };
  }
  if (all.some((s) => s.isError)) {
    return { overall: "error", sectionsWithWarnings: [] };
  }
  if (!all.every((s) => s.isSuccess)) {
    return { overall: "unknown", sectionsWithWarnings: [] };
  }
  const labels: SectionLabel[] = [];
  if (sections.connections.badge.kind === "warn") labels.push("Connections");
  if (sections.flows.badge.kind === "warn") labels.push("Flows");
  if (sections.envVars.badge.kind === "warn") labels.push("Environment variables");
  if (labels.length === 0) {
    return { overall: "ok", sectionsWithWarnings: [] };
  }
  return { overall: "warning", sectionsWithWarnings: labels };
}
