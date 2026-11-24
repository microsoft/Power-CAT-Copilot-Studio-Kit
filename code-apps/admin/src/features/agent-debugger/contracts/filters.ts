/**
 * Filter state for the command bar and the advanced-filters drawer.
 *
 * Mirrors `FILTER_DEFAULTS` and the `*_OPTIONS` tables in
 * `design/assets/workspace.js`. The design keeps only Agent, Conversation and
 * Session inline; every other predicate lives in the drawer and surfaces as a
 * removable chip once applied.
 */
import { matchesChannel } from "../../../shared/constants/channels";

/** A `<select>`/radio choice. */
export interface FilterOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export const TIME_RANGE_OPTIONS: readonly FilterOption[] = [
  { value: '', label: 'All' },
  { value: '30m', label: 'Last 30 minutes' },
  { value: '1h', label: 'Last 1 hour' },
  { value: '4h', label: 'Last 4 hours' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: 'custom', label: 'Custom range\u2026' },
];

export const CHANNEL_FILTER_OPTIONS: readonly FilterOption[] = [
  { value: 'all', label: 'All channels' },
  { value: 'msteams', label: 'Teams' },
  { value: 'webchat', label: 'Web Chat' },
  { value: 'directline', label: 'Direct Line' },
  { value: 'pva-studio', label: 'Test Panel' },
  { value: 'pva-autonomous', label: 'Autonomous' },
  { value: 'pva-published-engine-direct', label: 'Published Engine' },
  { value: 'pva-maker-evaluation', label: 'Copilot Evaluation' },
  { value: 'm365copilot', label: 'M365 Copilot' },
  { value: 'sharepoint', label: 'SharePoint' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'unknown', label: 'Unknown' },
];

export const OUTCOME_OPTIONS: readonly FilterOption[] = [
  { value: 'all', label: 'All outcomes' },
  { value: 'Resolved', label: 'Resolved' },
  { value: 'Escalated', label: 'Escalated' },
  { value: 'Abandoned', label: 'Abandoned' },
  { value: 'None', label: 'No outcome recorded' },
];

export const SESSION_TYPE_OPTIONS: readonly FilterOption[] = [
  { value: 'all', label: 'All session types' },
  { value: 'Engaged', label: 'Engaged' },
  { value: 'Unengaged', label: 'Unengaged' },
];

/** A step slower than this is what "Has slow steps" means in the design. */
export const SLOW_STEP_FILTER_MS = 10000;

export interface DebuggerFilters {
  /** '' means "All"; 'custom' pairs with `customFrom`/`customTo`. */
  timeRange: string;
  /** ISO-like `YYYY-MM-DDTHH:mm`, or '' when unset. */
  customFrom: string;
  customTo: string;
  channel: string;
  errorsOnly: boolean;
  slowOnly: boolean;
  twoTurnsOnly: boolean;
  outcome: string;
  sessionType: string;
  locale: string;
  stepTypes: string[];
}

/** Parsed, conversation-level values used by every content-based filter. */
export interface TranscriptFacets {
  userTurnCount: number;
  channels: string[];
  hasError: boolean;
  maxStepDurationMs: number;
  outcomes: string[];
  sessionTypes: string[];
  locales: string[];
  stepTypes: string[];
}

export const FILTER_DEFAULTS: DebuggerFilters = {
  timeRange: '',
  customFrom: '',
  customTo: '',
  channel: 'all',
  errorsOnly: false,
  slowOnly: false,
  twoTurnsOnly: false,
  outcome: 'all',
  sessionType: 'all',
  locale: 'all',
  stepTypes: [],
};

/** Splits a stored `YYYY-MM-DDTHH:mm` value into its date and time halves. */
export function partsOf(value: string): { d: string; t: string } {
  const [d = '', t = ''] = String(value || '').split('T');
  return { d, t: t.slice(0, 5) };
}

/** Human label for the custom range, e.g. `2025-01-04 09:00 → now`. */
export function customRangeLabel(filters: DebuggerFilters): string {
  const from = partsOf(filters.customFrom);
  const to = partsOf(filters.customTo);
  if (!from.d && !to.d) return 'Custom range';
  const fmt = (p: { d: string; t: string }) => (p.d ? `${p.d}${p.t ? ` ${p.t}` : ''}` : '\u2026');
  return `${fmt(from)} \u2192 ${to.d ? fmt(to) : 'now'}`;
}

/** Number of filters that differ from their default — badges the drawer button. */
export function countActiveFilters(filters: DebuggerFilters): number {
  let n = 0;
  if (filters.timeRange) n += 1;
  if (filters.channel !== 'all') n += 1;
  if (filters.errorsOnly) n += 1;
  if (filters.slowOnly) n += 1;
  if (filters.twoTurnsOnly) n += 1;
  if (filters.outcome !== 'all') n += 1;
  if (filters.sessionType !== 'all') n += 1;
  if (filters.locale !== 'all') n += 1;
  return n + filters.stepTypes.length;
}

/** Clears one filter by the key its chip carries. */
export function clearFilterKey(filters: DebuggerFilters, key: string): DebuggerFilters {
  if (key.startsWith('stepTypes:')) {
    const value = key.slice('stepTypes:'.length);
    return { ...filters, stepTypes: filters.stepTypes.filter((t) => t !== value) };
  }
  if (key === 'timeRange') {
    return { ...filters, timeRange: '', customFrom: '', customTo: '' };
  }
  return { ...filters, [key]: FILTER_DEFAULTS[key as keyof DebuggerFilters] };
}

/** True when evaluating the filters requires transcript content. */
export function hasContentFilters(filters: DebuggerFilters): boolean {
  return (
    filters.channel !== "all" ||
    filters.errorsOnly ||
    filters.slowOnly ||
    filters.twoTurnsOnly ||
    filters.outcome !== "all" ||
    filters.sessionType !== "all" ||
    filters.locale !== "all" ||
    filters.stepTypes.length > 0
  );
}

/** Exact client-side predicate applied after Dataverse rows have been merged and parsed. */
export function matchesTranscriptFilters(
  facets: TranscriptFacets,
  filters: DebuggerFilters,
): boolean {
  if (
    filters.channel !== "all" &&
    !facets.channels.some((channel) => matchesChannel(channel, filters.channel))
  ) {
    return false;
  }
  if (filters.errorsOnly && !facets.hasError) return false;
  if (filters.twoTurnsOnly && facets.userTurnCount < 2) return false;
  if (filters.slowOnly && facets.maxStepDurationMs < SLOW_STEP_FILTER_MS) return false;
  if (filters.outcome !== "all" && !facets.outcomes.includes(filters.outcome)) return false;
  if (
    filters.sessionType !== "all" &&
    !facets.sessionTypes.includes(filters.sessionType)
  ) {
    return false;
  }
  if (filters.locale !== "all" && !facets.locales.includes(filters.locale)) return false;
  if (
    filters.stepTypes.length > 0 &&
    !filters.stepTypes.every((type) => facets.stepTypes.includes(type))
  ) {
    return false;
  }
  return true;
}

/** Validation message for the custom range, or undefined when it is usable. */
export function customRangeError(filters: DebuggerFilters): string | undefined {
  if (filters.timeRange !== "custom") return undefined;
  if (!filters.customFrom && !filters.customTo) {
    return "Set at least a From or To date.";
  }
  const from = filters.customFrom ? new Date(filters.customFrom).getTime() : undefined;
  const to = filters.customTo ? new Date(filters.customTo).getTime() : undefined;
  if (from !== undefined && Number.isNaN(from)) return "The From date is invalid.";
  if (to !== undefined && Number.isNaN(to)) return "The To date is invalid.";
  if (from !== undefined && to !== undefined && from > to) {
    return "The From date must be earlier than the To date.";
  }
  return undefined;
}
