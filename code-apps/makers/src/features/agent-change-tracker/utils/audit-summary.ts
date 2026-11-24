/**
 * Pure aggregation for the Audit Summary tab.
 *
 * Every figure is derived from the *same* `ChangeLogEntry[]` the Change history
 * tab renders, so the two tabs can never disagree — the "Change history" count
 * pill and "Total changes" are the same number by construction.
 *
 * No I/O here: the caller supplies already-filtered entries plus the reference
 * "now", which keeps this module deterministic and unit-testable.
 */

import {
  COMPONENT_TYPE_LABEL,
  ChangeType,
  ComponentType,
  type ChangeLogEntry,
} from '../contracts/change-tracker';

const DAY_MS = 86_400_000;

/** Buckets in the activity chart. Chart.md: 6-8 keeps x-axis labels readable. */
export const ACTIVITY_BUCKETS = 8;

/**
 * Window used when the date filter is "All time" *and* there is no data to
 * derive a range from.
 */
export const ALL_TIME_SPAN_DAYS = 120;

/** Shortest activity window, so a burst inside one day still charts sensibly. */
const MIN_SPAN_MS = 7 * DAY_MS;

/** Span beyond which bucket labels switch to month + year. */
const MULTI_YEAR_SPAN_MS = 400 * DAY_MS;

/** Mutually exclusive change kinds. These sum to the total change count. */
export type ChangeKind = 'Added' | 'Updated' | 'Removed' | 'Published';

export const CHANGE_KINDS: readonly ChangeKind[] = ['Added', 'Updated', 'Removed', 'Published'];

export interface RankedItem {
  /** Stable identity for selection/filtering. */
  key: string;
  label: string;
  count: number;
  /** Percentage of all entries, 0-100, rounded. */
  share: number;
  /** Bar width relative to the largest item, 0-100. Chart.md "max across items". */
  fill: number;
}

export interface ActivityBucket {
  label: string;
  count: number;
  /** Bucket start, for tooltips and testing. */
  start: number;
}

export interface BusiestDay {
  date: string;
  count: number;
  topArea?: string;
}

export interface AuditSummaryModel {
  totalChanges: number;
  peopleCount: number;
  publishCount: number;
  /** Publishes as a percentage of all changes, 0-100. */
  publishShare: number;
  /** Recent half vs earlier half, as a percentage. `null` when no activity. */
  totalTrend: number | null;
  publishTrend: number | null;
  /** Change in the number of distinct people between the two halves. */
  peopleTrend: number | null;
  busiestDay?: BusiestDay;
  contributors: RankedItem[];
  components: RankedItem[];
  kinds: { kind: ChangeKind; count: number }[];
  activity: ActivityBucket[];
  byAgent: RankedItem[];
}

function entryTime(entry: ChangeLogEntry): number {
  return Date.parse(entry.changedOn ?? '');
}

/**
 * A publish shows up as an agent-level edit to `publishedon` rather than its own
 * change type.
 *
 * Copilot Studio has a defect where some saves regress `publishedon` to an
 * earlier value; those are not real publishes and are excluded, mirroring
 * `isPublishedDateRollback` in the timeline.
 */
export function isPublishEntry(entry: ChangeLogEntry): boolean {
  if (entry.fieldName?.toLowerCase() !== 'publishedon') return false;
  if (!entry.oldValue || !entry.newValue) return true;
  const oldTime = Date.parse(entry.oldValue);
  const newTime = Date.parse(entry.newValue);
  if (!Number.isFinite(oldTime) || !Number.isFinite(newTime)) return true;
  return newTime >= oldTime;
}

/**
 * Classify an entry into exactly one kind.
 *
 * Publishes are reported as `Published` instead of `Updated` so the four kinds
 * partition the entries and sum to the total.
 */
export function changeKindOf(entry: ChangeLogEntry): ChangeKind {
  if (isPublishEntry(entry)) return 'Published';
  if (entry.changeType === ChangeType.Created) return 'Added';
  if (entry.changeType === ChangeType.Deleted) return 'Removed';
  return 'Updated';
}

/** Days spanned by the active date filter; "All time" falls back to a window. */
export function spanDaysFor(dateFilterDays: number | null): number {
  return dateFilterDays && dateFilterDays > 0 ? dateFilterDays : ALL_TIME_SPAN_DAYS;
}

/**
 * The window the trend and activity chart are computed over.
 *
 * A fixed date filter anchors to "now". "All time" instead spans the real data
 * range, so an agent whose changes are years old charts across those years
 * rather than collapsing into one bucket at the edge of an arbitrary window.
 */
export function activityWindow(
  entries: readonly ChangeLogEntry[],
  now: number,
  dateFilterDays: number | null,
  explicit?: { start: number; end: number } | null,
): { start: number; end: number } {
  // A custom range supplies its own bounds. Deriving them from a day count
  // would anchor the window to "now", so a range that ends in the past would
  // plot its activity against the wrong dates.
  if (explicit && Number.isFinite(explicit.start) && Number.isFinite(explicit.end)) {
    return explicit;
  }

  if (dateFilterDays && dateFilterDays > 0) {
    return { start: now - dateFilterDays * DAY_MS, end: now };
  }

  const times = entries.map(entryTime).filter((time) => Number.isFinite(time));
  if (times.length === 0) {
    return { start: now - ALL_TIME_SPAN_DAYS * DAY_MS, end: now };
  }

  const earliest = Math.min(...times);
  const latest = Math.max(...times);
  if (latest - earliest >= MIN_SPAN_MS) return { start: earliest, end: latest };

  // A burst inside a short period: pad so the bars are not all in one bucket.
  const padding = (MIN_SPAN_MS - (latest - earliest)) / 2;
  return { start: earliest - padding, end: latest + padding };
}

/**
 * Percent change between the recent and earlier halves of the window.
 *
 * The comparison is deliberately *within* the selected window rather than
 * against the preceding one: audit rows are purged after 30 days (see
 * `AUDIT_RETENTION_DAYS` in `date-range.ts`), so for the default 30-day filter
 * the preceding period holds no data and would report a permanent, meaningless
 * spike.
 *
 * Returns `null` only when there is no activity at all.
 */
export function trendPercent(
  entries: readonly ChangeLogEntry[],
  window: { start: number; end: number },
): number | null {
  if (entries.length === 0) return null;
  const midpoint = window.start + (window.end - window.start) / 2;
  let recent = 0;
  for (const entry of entries) {
    const time = entryTime(entry);
    if (Number.isFinite(time) && time >= midpoint) recent += 1;
  }
  const earlier = entries.length - recent;
  // Growth from a zero baseline has no finite percentage. Report the
  // conventional +100% rather than hiding the badge, which previously left the
  // metric blank for any agent whose activity was entirely recent.
  if (earlier === 0) return 100;
  // A quiet recent half is an exact -100%.
  if (recent === 0) return -100;
  return Math.round(((recent - earlier) / earlier) * 100);
}

/**
 * Change in the number of *distinct* people between the two halves of the
 * window.
 *
 * Counting people cannot reuse {@link trendPercent}: that counts entries, and
 * one person making 50 edits must still count as one person.
 */
export function peopleTrendPercent(
  entries: readonly ChangeLogEntry[],
  window: { start: number; end: number },
): number | null {
  if (entries.length === 0) return null;
  const midpoint = window.start + (window.end - window.start) / 2;
  const recent = new Set<string>();
  const earlier = new Set<string>();
  for (const entry of entries) {
    const name = entry.changedByName?.trim();
    if (!name) continue;
    const time = entryTime(entry);
    if (!Number.isFinite(time)) continue;
    (time >= midpoint ? recent : earlier).add(name);
  }
  if (recent.size === 0 && earlier.size === 0) return null;
  if (earlier.size === 0) return 100;
  if (recent.size === 0) return -100;
  return Math.round(((recent.size - earlier.size) / earlier.size) * 100);
}

function rank(
  entries: readonly ChangeLogEntry[],
  keyOf: (entry: ChangeLogEntry) => string | undefined,
  labelOf: (key: string) => string = (key) => key,
  limit?: number,
): RankedItem[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const key = keyOf(entry);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const total = entries.length || 1;
  const ordered = [...counts.entries()].sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  );
  const max = ordered.length > 0 ? ordered[0][1] : 1;
  const sliced = limit ? ordered.slice(0, limit) : ordered;
  return sliced.map(([key, count]) => ({
    key,
    label: labelOf(key),
    count,
    share: Math.round((count / total) * 100),
    fill: Math.round((count / max) * 100),
  }));
}

function busiestDayOf(
  entries: readonly ChangeLogEntry[],
  componentTypeOf: (entry: ChangeLogEntry) => number,
  componentLabelOf: (type: number) => string,
): BusiestDay | undefined {
  const byDay = new Map<string, ChangeLogEntry[]>();
  for (const entry of entries) {
    const time = entryTime(entry);
    if (!Number.isFinite(time)) continue;
    const day = new Date(time).toDateString();
    const bucket = byDay.get(day);
    if (bucket) bucket.push(entry);
    else byDay.set(day, [entry]);
  }
  if (byDay.size === 0) return undefined;

  const [date, dayEntries] = [...byDay.entries()].sort(
    (left, right) => right[1].length - left[1].length || Date.parse(right[0]) - Date.parse(left[0]),
  )[0];

  const topArea = rank(
    dayEntries,
    (entry) => String(componentTypeOf(entry)),
    (key) => componentLabelOf(Number(key)),
    1,
  )[0]?.label;

  return { date, count: dayEntries.length, topArea };
}

function startOfDay(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function startOfMonth(time: number): number {
  const date = new Date(time);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function addMonths(time: number, count: number): number {
  const date = new Date(time);
  date.setMonth(date.getMonth() + count);
  return date.getTime();
}

/**
 * Bucket boundaries for the activity chart.
 *
 * Boundaries are snapped to whole days (or months for long spans) so every
 * bucket formats to a *distinct* label. Evenly dividing the span instead can
 * put two buckets inside the same day, producing duplicate chart keys — React
 * then drops or duplicates children and the view stops responding correctly.
 */
function bucketStarts(window: { start: number; end: number }): {
  starts: number[];
  format: Intl.DateTimeFormatOptions;
} {
  const { start, end } = window;

  if (end - start >= MULTI_YEAR_SPAN_MS) {
    const first = startOfMonth(start);
    const months = Math.max(
      1,
      (new Date(end).getFullYear() - new Date(first).getFullYear()) * 12 +
        (new Date(end).getMonth() - new Date(first).getMonth()) +
        1,
    );
    const perBucket = Math.max(1, Math.ceil(months / ACTIVITY_BUCKETS));
    const count = Math.min(ACTIVITY_BUCKETS, Math.ceil(months / perBucket));
    return {
      starts: Array.from({ length: count }, (_, index) => addMonths(first, index * perBucket)),
      format: { month: 'short', year: 'numeric' },
    };
  }

  const first = startOfDay(start);
  const days = Math.max(1, Math.ceil((end - first) / DAY_MS));
  const perBucket = Math.max(1, Math.ceil(days / ACTIVITY_BUCKETS));
  const count = Math.min(ACTIVITY_BUCKETS, Math.ceil(days / perBucket));
  return {
    starts: Array.from({ length: count }, (_, index) => first + index * perBucket * DAY_MS),
    format: { day: 'numeric', month: 'short' },
  };
}

function activityOf(
  entries: readonly ChangeLogEntry[],
  window: { start: number; end: number },
): ActivityBucket[] {
  const { starts, format } = bucketStarts(window);
  const counts = new Array<number>(starts.length).fill(0);

  for (const entry of entries) {
    const time = entryTime(entry);
    if (!Number.isFinite(time)) continue;
    // Last bucket whose start is at or before this entry.
    let index = 0;
    for (let i = starts.length - 1; i >= 0; i -= 1) {
      if (time >= starts[i]) {
        index = i;
        break;
      }
    }
    counts[index] += 1;
  }

  return starts.map((bucketStart, index) => ({
    count: counts[index],
    start: bucketStart,
    label: new Date(bucketStart).toLocaleDateString(undefined, format),
  }));
}

export interface AuditSummaryOptions {
  /** Reference time; injected so results are deterministic under test. */
  now: number;
  /** Days covered by the active date filter, or `null` for "All time". */
  dateFilterDays: number | null;
  /**
   * Explicit window for a custom range. Takes precedence over
   * {@link dateFilterDays}, which can only express a span relative to `now`.
   */
  dateWindow?: { start: number; end: number } | null;
  /** Tracking-config id to agent name, for the "Changes by agent" breakdown. */
  agentNames?: ReadonlyMap<string, string>;
  /**
   * Component classifier. Must match the one the history filter uses, otherwise
   * the "What component changed" card and the component filter would disagree
   * (the timeline remaps some entries, e.g. model swaps and publish events).
   */
  componentTypeOf?: (entry: ChangeLogEntry) => number;
  /** Label for a classified component type. */
  componentLabelOf?: (type: number) => string;
}

/** Aggregate already-filtered change entries into the Audit Summary model. */
export function buildAuditSummary(
  entries: readonly ChangeLogEntry[],
  options: AuditSummaryOptions,
): AuditSummaryModel {
  const { now, dateFilterDays, agentNames, dateWindow } = options;
  const componentTypeOf = options.componentTypeOf ?? ((entry) => entry.componentType as number);
  const componentLabelOf =
    options.componentLabelOf ??
    ((type: number) => COMPONENT_TYPE_LABEL[type as ComponentType] ?? String(type));
  const window = activityWindow(entries, now, dateFilterDays, dateWindow);

  const publishes = entries.filter(isPublishEntry);
  const people = new Set(entries.map((entry) => entry.changedByName).filter(Boolean));
  const total = entries.length;

  const kindCounts = new Map<ChangeKind, number>(CHANGE_KINDS.map((kind) => [kind, 0]));
  for (const entry of entries) {
    const kind = changeKindOf(entry);
    kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
  }

  return {
    totalChanges: total,
    peopleCount: people.size,
    publishCount: publishes.length,
    publishShare: total > 0 ? Math.round((publishes.length / total) * 100) : 0,
    totalTrend: trendPercent(entries, window),
    publishTrend: trendPercent(publishes, window),
    peopleTrend: peopleTrendPercent(entries, window),
    busiestDay: busiestDayOf(entries, componentTypeOf, componentLabelOf),
    contributors: rank(entries, (entry) => entry.changedByName),
    components: rank(
      entries,
      (entry) => String(componentTypeOf(entry)),
      (key) => componentLabelOf(Number(key)),
    ),
    kinds: CHANGE_KINDS.map((kind) => ({ kind, count: kindCounts.get(kind) ?? 0 })),
    activity: activityOf(entries, window),
    byAgent: agentNames
      ? rank(
          entries,
          // Local preview entries carry no configId; fall back to the agent id
          // so the breakdown works against both stores.
          (entry) => entry.configId || entry.agentId,
          (key) => agentNames.get(key) ?? key,
        )
      : [],
  };
}
