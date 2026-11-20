/**
 * Applied-filter chips shown under the command row (`.w-tags` / `.w-tag`).
 *
 * Mirrors `activeFilters()` + `renderFilterTags()` in
 * `design/assets/workspace.js`. Each tag names the filter group underneath its
 * value so the row stays readable when several filters are active.
 */
import { Button } from '@fluentui/react-components';
import {
  CalendarLtr16Regular,
  Chat16Regular,
  CheckmarkCircle16Regular,
  Dismiss12Regular,
  ErrorCircle16Regular,
  Open16Regular,
  Person16Regular,
  PuzzlePiece16Regular,
  Timer16Regular,
} from '@fluentui/react-icons';
/* eslint-disable react-refresh/only-export-components */

import type { ReactNode } from 'react';
import { useShellStyles } from '../../styles/useShellStyles';
import type { DebuggerFilters, FilterOption } from '../../contracts/filters';
import {
  CHANNEL_FILTER_OPTIONS,
  OUTCOME_OPTIONS,
  SESSION_TYPE_OPTIONS,
  TIME_RANGE_OPTIONS,
} from '../../contracts/filters';

/** A single removable filter chip. */
export interface ActiveFilter {
  key: string;
  icon: ReactNode;
  group: string;
  label: string;
}

const labelOf = (
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string,
): string => options.find((o) => o.value === value)?.label ?? value;

/**
 * Derives the chip list from the applied filters. Only non-default values
 * produce a chip, so an untouched filter set renders nothing.
 */
export function activeFilters(
  filters: DebuggerFilters,
  customRangeLabel: string,
  localeOptions: readonly FilterOption[] = [],
): ActiveFilter[] {
  const out: ActiveFilter[] = [];

  if (filters.timeRange) {
    out.push({
      key: 'timeRange',
      icon: <CalendarLtr16Regular />,
      group: 'Time range',
      label:
        filters.timeRange === 'custom'
          ? customRangeLabel
          : labelOf(TIME_RANGE_OPTIONS, filters.timeRange),
    });
  }
  if (filters.channel !== 'all') {
    out.push({
      key: 'channel',
      icon: <Chat16Regular />,
      group: 'Channel',
      label: labelOf(CHANNEL_FILTER_OPTIONS, filters.channel),
    });
  }
  if (filters.errorsOnly) {
    out.push({
      key: 'errorsOnly',
      icon: <ErrorCircle16Regular />,
      group: 'Conversations',
      label: 'Errors only',
    });
  }
  if (filters.twoTurnsOnly) {
    out.push({
      key: 'twoTurnsOnly',
      icon: <Chat16Regular />,
      group: 'Conversations',
      label: 'At least 2 user turns',
    });
  }
  if (filters.slowOnly) {
    out.push({
      key: 'slowOnly',
      icon: <Timer16Regular />,
      group: 'Conversations',
      label: 'Has slow steps (\u226510s)',
    });
  }
  if (filters.outcome !== 'all') {
    out.push({
      key: 'outcome',
      icon: <CheckmarkCircle16Regular />,
      group: 'Outcome',
      label: labelOf(OUTCOME_OPTIONS, filters.outcome),
    });
  }
  if (filters.sessionType !== 'all') {
    out.push({
      key: 'sessionType',
      icon: <Person16Regular />,
      group: 'Session type',
      label: labelOf(SESSION_TYPE_OPTIONS, filters.sessionType),
    });
  }
  if (filters.locale !== 'all') {
    out.push({
      key: 'locale',
      icon: <Open16Regular />,
      group: 'Locale',
      label: labelOf(localeOptions, filters.locale),
    });
  }
  for (const type of filters.stepTypes) {
    out.push({
      key: `stepTypes:${type}`,
      icon: <PuzzlePiece16Regular />,
      group: 'Step type',
      label: type,
    });
  }
  return out;
}

export interface FilterTagsProps {
  filters: DebuggerFilters;
  customRangeLabel: string;
  localeOptions: readonly FilterOption[];
  onClear: (key: string) => void;
  onClearAll: () => void;
}

export function FilterTags({
  filters,
  customRangeLabel,
  localeOptions,
  onClear,
  onClearAll,
}: FilterTagsProps) {
  const shell = useShellStyles();
  const tags = activeFilters(filters, customRangeLabel, localeOptions);
  if (!tags.length) return null;

  return (
    <div className={shell.tags} role="list" aria-label="Applied filters">
      {tags.map((tag) => (
        <span className={shell.tag} role="listitem" key={tag.key}>
          <span className={shell.tagIcon} aria-hidden="true">
            {tag.icon}
          </span>
          <span className={shell.tagText}>
            <span className={shell.tagPrimary}>{tag.label}</span>
            <span className={shell.tagSecondary}>{tag.group}</span>
          </span>
          <Button
            appearance="transparent"
            type="button"
            className={shell.tagDismiss}
            aria-label={`Remove ${tag.group} filter ${tag.label}`}
            onClick={() => onClear(tag.key)}
          >
            <Dismiss12Regular />
          </Button>
        </span>
      ))}
      {tags.length > 1 && (
        <Button
          appearance="transparent"
          type="button"
          className="w-clearfilters"
          onClick={onClearAll}
        >
          Clear all
        </Button>
      )}
    </div>
  );
}

export default FilterTags;
