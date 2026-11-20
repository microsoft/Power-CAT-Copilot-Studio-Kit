import {
  getAgentValueEnvironmentKey,
  getUnclassifiedAgents,
  isNonBlank,
} from './agentValueFilter';
import type {
  AgentValueRecord,
  AgentDetailsRecord,
  ValueBenefitCount,
  AgentTypeCount,
  AgentBehaviorCount,
  ClassificationTrendPoint,
  ValueByEnvironmentRow,
  DashboardKpis,
} from '../contracts/types';

// ---------------------------------------------------------------------------
// Aggregation: Value Benefit Counts
// ---------------------------------------------------------------------------

/**
 * Groups records by `cat_agentvaluebenefit` and counts each distinct benefit.
 * Blank/null benefit values are filtered out.
 */
export function computeValueBenefitCounts(
  records: AgentValueRecord[],
): ValueBenefitCount[] {
  const map = new Map<string, number>();
  for (const r of records) {
    if (!isNonBlank(r.cat_agentvaluebenefit)) continue;
    map.set(
      r.cat_agentvaluebenefit,
      (map.get(r.cat_agentvaluebenefit) ?? 0) + 1,
    );
  }
  return Array.from(map, ([valueBenefit, count]) => ({ valueBenefit, count }));
}

// ---------------------------------------------------------------------------
// Aggregation: Agent Type Counts
// ---------------------------------------------------------------------------

/**
 * Groups records by `cat_agenttypes` and counts each distinct type.
 * Blank/null type values are filtered out.
 */
export function computeAgentTypeCounts(
  records: AgentValueRecord[],
): AgentTypeCount[] {
  const map = new Map<string, number>();
  for (const r of records) {
    if (!isNonBlank(r.cat_agenttypes)) continue;
    map.set(r.cat_agenttypes, (map.get(r.cat_agenttypes) ?? 0) + 1);
  }
  return Array.from(map, ([agentType, count]) => ({ agentType, count }));
}

// ---------------------------------------------------------------------------
// Aggregation: Agent Behavior Counts
// ---------------------------------------------------------------------------

/**
 * Groups records by `cat_agentbehaviors` and counts each distinct behavior.
 * Blank/null behavior values are filtered out.
 */
export function computeAgentBehaviorCounts(
  records: AgentValueRecord[],
): AgentBehaviorCount[] {
  const map = new Map<string, number>();
  for (const r of records) {
    if (!isNonBlank(r.cat_agentbehaviors)) continue;
    map.set(r.cat_agentbehaviors, (map.get(r.cat_agentbehaviors) ?? 0) + 1);
  }
  return Array.from(map, ([agentBehavior, count]) => ({
    agentBehavior,
    count,
  }));
}

// ---------------------------------------------------------------------------
// Aggregation: Classification Trend (line chart)
// ---------------------------------------------------------------------------

/**
 * Filters records with a non-blank classification date, groups by "mm-yyyy",
 * counts per month, and returns results sorted ascending by date.
 */
export function computeClassificationTrend(
  records: AgentValueRecord[],
): ClassificationTrendPoint[] {
  const map = new Map<string, { sortDate: Date; totalClassified: number }>();

  for (const r of records) {
    if (!isNonBlank(r.cat_classificationdate)) continue;

    const date = new Date(r.cat_classificationdate);
    if (isNaN(date.getTime())) continue;

    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const label = `${month}-${year}`;

    const existing = map.get(label);
    if (existing) {
      existing.totalClassified += 1;
    } else {
      // Use first day of the month for sorting
      map.set(label, {
        sortDate: new Date(year, date.getMonth(), 1),
        totalClassified: 1,
      });
    }
  }

  return Array.from(map, ([monthLabel, data]) => ({
    monthLabel,
    sortDate: data.sortDate,
    totalClassified: data.totalClassified,
  })).sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime());
}

// ---------------------------------------------------------------------------
// Aggregation: Value by Environment (data grid)
// ---------------------------------------------------------------------------

/**
 * Filters records where both environment and benefit are non-blank,
 * groups by (environment id, benefit), and counts per group.
 */
export function computeValueByEnvironment(
  records: AgentValueRecord[],
): ValueByEnvironmentRow[] {
  const map = new Map<string, ValueByEnvironmentRow>();

  for (const r of records) {
    if (
      !isNonBlank(r.cat_environmentdisplayname) ||
      !isNonBlank(r.cat_agentvaluebenefit)
    )
      continue;

    const environmentKey = getAgentValueEnvironmentKey(r);
    const key = `${environmentKey}||${r.cat_agentvaluebenefit}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(key, {
        environmentKey,
        environmentDisplayName: r.cat_environmentdisplayname,
        agentValueBenefit: r.cat_agentvaluebenefit,
        count: 1,
      });
    }
  }

  return Array.from(map.values());
}

// ---------------------------------------------------------------------------
// Unclassified agents (Untapped potential)
// ---------------------------------------------------------------------------

/**
 * Returns inventory agents that have no active Agent Value classification,
 * matched on environment + agent id (see `createClassificationLookup`) — the
 * same rule the "Untapped potential" drillthrough list uses.
 */
export function computeUnclassifiedAgents(
  agentDetails: AgentDetailsRecord[],
  records: AgentValueRecord[],
): AgentDetailsRecord[] {
  return getUnclassifiedAgents(agentDetails, records);
}

// ---------------------------------------------------------------------------
// Dashboard KPIs
// ---------------------------------------------------------------------------

/** Safely rounds (value / divisor * 100) to the nearest integer. Returns 0 when divisor is 0. */
function safePercentage(value: number, divisor: number): number {
  if (divisor === 0) return 0;
  return Math.round((value / divisor) * 100);
}

/** Finds the item with the maximum count in a list. Returns fallback for empty lists. */
function findMax<T extends { count: number }>(
  items: T[],
  getName: (item: T) => string,
): { name: string; count: number } {
  if (items.length === 0) return { name: '', count: 0 };
  let max = items[0];
  for (let i = 1; i < items.length; i++) {
    if (items[i].count > max.count) max = items[i];
  }
  return { name: getName(max), count: max.count };
}

/** Finds the item with the minimum count in a list. Returns fallback for empty lists. */
function findMin<T extends { count: number }>(
  items: T[],
  getName: (item: T) => string,
): { name: string; count: number } {
  if (items.length === 0) return { name: '', count: 0 };
  let min = items[0];
  for (let i = 1; i < items.length; i++) {
    if (items[i].count < min.count) min = items[i];
  }
  return { name: getName(min), count: min.count };
}

/**
 * Computes all derived KPI values for the dashboard.
 *
 * @param allAgentsCount   Total agents from the Agent Details table.
 * @param untappedCount    Inventory agents without an active classification.
 * @param records          All active AgentValueRecord rows.
 * @param benefitCounts    Pre-computed value-benefit counts.
 * @param typeCounts       Pre-computed agent-type counts.
 * @param behaviorCounts   Pre-computed agent-behavior counts.
 */
export function computeDashboardKpis(
  allAgentsCount: number,
  untappedCount: number,
  records: AgentValueRecord[],
  benefitCounts: ValueBenefitCount[],
  typeCounts: AgentTypeCount[],
  behaviorCounts: AgentBehaviorCount[],
): DashboardKpis {
  const classifiedAgentsCount = records.length;
  const classifiedPercentage = safePercentage(classifiedAgentsCount, allAgentsCount);

  const untappedPercentage = safePercentage(untappedCount, allAgentsCount);

  const topBenefit = findMax(benefitCounts, (b) => b.valueBenefit);
  const topType = findMax(typeCounts, (t) => t.agentType);
  const topBehavior = findMax(behaviorCounts, (b) => b.agentBehavior);

  const commonValueBenefit = findMax(benefitCounts, (b) => b.valueBenefit);
  const rareValueBenefit = findMin(benefitCounts, (b) => b.valueBenefit);

  return {
    allAgentsCount,
    classifiedAgentsCount,
    classifiedPercentage,
    untappedCount,
    untappedPercentage,
    topValueBenefit: topBenefit.name,
    topValueBenefitPercentage: safePercentage(topBenefit.count, classifiedAgentsCount),
    topAgentType: topType.name,
    topAgentTypePercentage: safePercentage(topType.count, classifiedAgentsCount),
    topAgentBehavior: topBehavior.name,
    topAgentBehaviorPercentage: safePercentage(topBehavior.count, classifiedAgentsCount),
    commonValueBenefit,
    rareValueBenefit,
  };
}
