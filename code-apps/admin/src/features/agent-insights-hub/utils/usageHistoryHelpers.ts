/**
 * Usage History Helpers - Derivation and aggregation utilities.
 *
 * Derives unique dropdown values from cached query data (per S-2 — no
 * separate API calls). Generic deriveUniqueValues supports any field.
 */

import type { AgentUsageHistory } from "../contracts/types";

// ---------------------------------------------------------------------------
// Generic Derivation
// ---------------------------------------------------------------------------

/** Extract unique non-empty string values from a given field across all records. */
export function deriveUniqueValues<T>(data: T[], key: keyof T): string[] {
  const seen = new Set<string>();
  for (const item of data) {
    const val = item[key];
    if (val != null && String(val).trim() !== "") {
      seen.add(String(val));
    }
  }
  return Array.from(seen).sort();
}

// ---------------------------------------------------------------------------
// Typed Derivations
// ---------------------------------------------------------------------------

/** Derive unique environment IDs from usage history data. */
export function deriveUniqueEnvironments(
  data: AgentUsageHistory[]
): string[] {
  return deriveUniqueValues(data, "cat_environmentid");
}

/** Derive unique agent IDs from usage history data. */
export function deriveUniqueAgents(data: AgentUsageHistory[]): string[] {
  return deriveUniqueValues(data, "cat_agentid");
}

/** Derive unique feature names from usage history data. */
export function deriveUniqueFeatures(data: AgentUsageHistory[]): string[] {
  return deriveUniqueValues(data, "cat_featurename");
}

// ---------------------------------------------------------------------------
// Credit Aggregation
// ---------------------------------------------------------------------------

interface CreditAggregation {
  label: string;
  billed: number;
  nonBilled: number;
}

/**
 * Aggregate billed and non-billed credits by a grouping dimension.
 *
 * @param data - Usage history records
 * @param groupBy - Dimension to group by: 'date' (cat_usagedate),
 *   'agent' (cat_agentid), or 'feature' (cat_featurename)
 * @returns Sorted array of aggregated credit totals per group
 */
export function aggregateCredits(
  data: AgentUsageHistory[],
  groupBy: "date" | "agent" | "feature" | "environment"
): CreditAggregation[] {
  const keyField = getGroupByField(groupBy);
  const map = new Map<string, { billed: number; nonBilled: number }>();

  for (const item of data) {
    const rawKey = item[keyField];
    const label =
      rawKey != null && String(rawKey).trim() !== ""
        ? String(rawKey)
        : "Unknown";

    const groupKey = groupBy === "date" ? label.substring(0, 10) : label;

    const existing = map.get(groupKey);
    const billed = item.cat_billedcopilotcredits ?? 0;
    const nonBilled = item.cat_nonbilledcopilotcredits ?? 0;

    if (existing) {
      existing.billed += billed;
      existing.nonBilled += nonBilled;
    } else {
      map.set(groupKey, { billed, nonBilled });
    }
  }

  const result: CreditAggregation[] = [];
  for (const [label, totals] of map) {
    result.push({ label, billed: totals.billed, nonBilled: totals.nonBilled });
  }

  result.sort((a, b) => a.label.localeCompare(b.label));
  return result;
}

/** Map groupBy dimension to the corresponding AgentUsageHistory property. */
function getGroupByField(
  groupBy: "date" | "agent" | "feature" | "environment"
): keyof AgentUsageHistory {
  switch (groupBy) {
    case "date":
      return "cat_usagedate";
    case "agent":
      return "cat_agentid";
    case "feature":
      return "cat_featurename";
    case "environment":
      return "cat_environmentid";
  }
}
