import type { AgentUsageRecord } from '../contracts/types';
import {
  isDateInRange,
  localDateKey,
  parseUsageDate,
  startOfUsageWeek,
  type UsageDateRange,
} from './usageDateRanges';

export interface UsageDistributionItem {
  key: string;
  label: string;
  credits: number;
  percentage?: number;
}

export interface UsageTrendPoint {
  date: Date;
  weeklyCredits: number;
  cumulativeCredits: number;
}

export interface UsageInsights {
  detailRecords: AgentUsageRecord[];
  analysisRecords: AgentUsageRecord[];
  billedCredits: number;
  nonBilledCredits: number;
  totalCredits: number;
  activeWeeks: number;
  averagePerActiveWeek?: number;
  reportedUsers: number;
  reportedUsersDifference?: number;
  primaryFeature?: UsageDistributionItem;
  primaryChannel?: UsageDistributionItem;
  trend: UsageTrendPoint[];
  featureDistribution: UsageDistributionItem[];
  channelDistribution: UsageDistributionItem[];
  lastUsage?: Date;
  lastFeature?: string;
  lastFeatureCredits?: number;
  peakMonth?: Date;
  invalidDateCount: number;
  correctedNegativeCount: number;
}

export function formatUsageWeekLabel(row: AgentUsageRecord) {
  const from = parseUsageDate(row.fromDate) ?? parseUsageDate(row.usageDate);
  const to = parseUsageDate(row.toDate);
  if (!from) return 'Date unavailable';
  const start = from.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (!to) return start;
  const end = to.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${start}-${end}`;
}

interface DimensionTotal {
  key: string;
  label: string;
  credits: number;
}

function nonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function creditsFor(record: AgentUsageRecord) {
  return nonNegative(record.billedCredits) + nonNegative(record.nonBilledCredits);
}

function normalizedDimension(value: string | undefined, unknownLabel: string) {
  const label = value?.trim() || unknownLabel;
  return { key: label.toLocaleLowerCase(), label };
}

function compareDimension(left: DimensionTotal, right: DimensionTotal) {
  return right.credits - left.credits || left.label.localeCompare(right.label);
}

function distributionFor(
  records: AgentUsageRecord[],
  selector: (record: AgentUsageRecord) => string | undefined,
  unknownLabel: string,
  totalCredits: number,
) {
  const totals = new Map<string, DimensionTotal>();
  for (const record of records) {
    const dimension = normalizedDimension(selector(record), unknownLabel);
    const existing = totals.get(dimension.key);
    if (existing) {
      existing.credits += creditsFor(record);
      if (dimension.label.localeCompare(existing.label) < 0) existing.label = dimension.label;
    } else {
      totals.set(dimension.key, { ...dimension, credits: creditsFor(record) });
    }
  }
  return [...totals.values()]
    .filter((item) => item.credits > 0)
    .sort(compareDimension)
    .map((item) => ({
      ...item,
      percentage: totalCredits > 0 ? item.credits / totalCredits * 100 : undefined,
    }));
}

function reportingWeek(record: AgentUsageRecord, usageDate: Date) {
  return startOfUsageWeek(parseUsageDate(record.fromDate) ?? usageDate);
}

function trendFor(records: AgentUsageRecord[]) {
  const weekly = new Map<string, { date: Date; credits: number }>();
  for (const record of records) {
    const usageDate = parseUsageDate(record.usageDate);
    if (!usageDate) continue;
    const date = reportingWeek(record, usageDate);
    const key = localDateKey(date);
    const existing = weekly.get(key);
    if (existing) existing.credits += creditsFor(record);
    else weekly.set(key, { date, credits: creditsFor(record) });
  }

  let cumulativeCredits = 0;
  return [...weekly.values()]
    .sort((left, right) => left.date.getTime() - right.date.getTime())
    .map((point) => {
      cumulativeCredits += point.credits;
      return {
        date: point.date,
        weeklyCredits: point.credits,
        cumulativeCredits,
      };
    });
}

function latestRecord(records: AgentUsageRecord[]) {
  return records
    .map((record) => ({
      record,
      usageDate: parseUsageDate(record.usageDate),
      fromDate: parseUsageDate(record.fromDate),
    }))
    .filter((item): item is typeof item & { usageDate: Date } => Boolean(item.usageDate))
    .sort((left, right) =>
      right.usageDate.getTime() - left.usageDate.getTime()
      || (right.fromDate?.getTime() ?? 0) - (left.fromDate?.getTime() ?? 0)
      || right.record.id.localeCompare(left.record.id))[0];
}

function peakMonthFor(records: AgentUsageRecord[]) {
  const months = new Map<string, { date: Date; credits: number }>();
  for (const record of records) {
    const date = parseUsageDate(record.usageDate);
    if (!date) continue;
    const month = new Date(date.getFullYear(), date.getMonth(), 1);
    const key = localDateKey(month);
    const existing = months.get(key);
    if (existing) existing.credits += creditsFor(record);
    else months.set(key, { date: month, credits: creditsFor(record) });
  }
  return [...months.values()]
    .sort((left, right) =>
      right.credits - left.credits || right.date.getTime() - left.date.getTime())[0]?.date;
}

function recordsInRange(records: AgentUsageRecord[], range: Pick<UsageDateRange, 'start' | 'endExclusive'>) {
  return records.filter((record) => {
    const date = parseUsageDate(record.usageDate);
    return date ? isDateInRange(date, range) : false;
  });
}

/** Derives every Usage-tab analytical surface from one range-scoped record set. */
export function deriveUsageInsights(
  records: AgentUsageRecord[],
  range: UsageDateRange,
): UsageInsights {
  const invalidRecords = records.filter((record) => !parseUsageDate(record.usageDate));
  const analysisRecords = range.unbounded
    ? records.filter((record) => Boolean(parseUsageDate(record.usageDate)))
    : recordsInRange(records, range);
  const detailRecords = [
    ...analysisRecords,
    ...invalidRecords,
  ].sort((left, right) =>
    (parseUsageDate(right.usageDate)?.getTime() ?? -1)
    - (parseUsageDate(left.usageDate)?.getTime() ?? -1)
    || right.id.localeCompare(left.id));

  const billedCredits = analysisRecords.reduce(
    (sum, record) => sum + nonNegative(record.billedCredits),
    0,
  );
  const nonBilledCredits = analysisRecords.reduce(
    (sum, record) => sum + nonNegative(record.nonBilledCredits),
    0,
  );
  const totalCredits = billedCredits + nonBilledCredits;
  const trend = trendFor(analysisRecords);
  const reportedUsers = analysisRecords.reduce(
    (sum, record) => sum + nonNegative(record.users),
    0,
  );
  const previousRecords = range.comparisonAvailable
    ? recordsInRange(records, {
      start: range.comparisonStart,
      endExclusive: range.comparisonEndExclusive,
    })
    : undefined;
  const previousUsers = previousRecords?.reduce(
    (sum, record) => sum + nonNegative(record.users),
    0,
  );
  const featureDistribution = distributionFor(
    analysisRecords,
    (record) => record.featureName,
    'Unknown feature',
    totalCredits,
  );
  const channelDistribution = distributionFor(
    analysisRecords,
    (record) => record.channelId,
    'Unknown channel',
    totalCredits,
  );
  const latest = latestRecord(analysisRecords);

  return {
    detailRecords,
    analysisRecords,
    billedCredits,
    nonBilledCredits,
    totalCredits,
    activeWeeks: trend.length,
    averagePerActiveWeek: trend.length > 0 ? totalCredits / trend.length : undefined,
    reportedUsers,
    reportedUsersDifference: previousUsers === undefined ? undefined : reportedUsers - previousUsers,
    primaryFeature: featureDistribution[0],
    primaryChannel: channelDistribution[0],
    trend,
    featureDistribution,
    channelDistribution,
    lastUsage: latest?.usageDate,
    lastFeature: latest
      ? normalizedDimension(latest.record.featureName, 'Unknown feature').label
      : undefined,
    lastFeatureCredits: latest ? creditsFor(latest.record) : undefined,
    peakMonth: peakMonthFor(analysisRecords),
    invalidDateCount: invalidRecords.length,
    correctedNegativeCount: detailRecords.filter((record) =>
      record.billedCredits < 0 || record.nonBilledCredits < 0 || record.users < 0).length,
  };
}
