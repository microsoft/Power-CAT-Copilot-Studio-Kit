import { useMemo, useState } from 'react';
import {
  makeStyles,
  tokens,
  Body1,
  Body1Strong,
  Button,
  Caption1,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Dropdown,
  Field,
  Input,
  Menu,
  MenuButton,
  MenuItemCheckbox,
  MenuItemRadio,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Option,
  Spinner,
  Subtitle2,
  Tooltip,
} from '@fluentui/react-components';
import { DismissRegular } from '@fluentui/react-icons';
import { AuditSummary } from './AuditSummary';
import { useAllAgentsChangeLog } from '../hooks/useChangeTracker';
import {
  CHANGE_TYPE_LABEL,
  COMPONENT_TYPE_LABEL,
  ChangeType,
  ComponentType,
  type ChangeLogEntry,
  type TrackingConfig,
} from '../contracts/change-tracker';
import { DatePicker } from '@fluentui/react-datepicker-compat';
import { type ChangeKind } from '../utils/audit-summary';
import { componentIcon } from '../utils/component-icons';
import {
  clampIsoDate,
  customRangeBounds,
  customRangeDays,
  defaultCustomRange,
  emptyCustomRange,
  formatCustomRangeLabel,
  fromIsoDate,
  isCustomRangeComplete,
  retentionWindow,
  retentionWindowDates,
  toIsoDate,
  type CustomRange,
} from '../utils/date-range';

/** Time-window options, matching the Change history filter exactly. */
type DateFilter = '30m' | '1d' | '7d' | '30d' | 'custom';

const DATE_FILTER_LABEL: Record<DateFilter, string> = {
  '30m': 'Last 30 mins',
  '1d': 'Last 24 hours',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  custom: 'Custom range',
};

const DATE_FILTER_DAYS: Record<Exclude<DateFilter, 'custom'>, number> = {
  '30m': 30 / (60 * 24),
  '1d': 1,
  '7d': 7,
  '30d': 30,
};

const DEFAULT_DATE_FILTER: DateFilter = '30d';

const useStyles = makeStyles({
  root: {
    flex: '1 1 auto',
    minWidth: 0,
    height: '100%',
    overflowY: 'auto',
    scrollbarGutter: 'stable',
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalL,
    boxSizing: 'border-box',
    '@media (max-width: 639px)': {
      padding: tokens.spacingVerticalM,
    },
  },
  toolbar: {
    // Label left, filters right — mirroring the Change history / Audit summary
    // filter row so alignment is identical in both places.
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalM,
    // No padding here: the container's 12px `gap` is the single source of
    // vertical rhythm, so every block-to-block gap in the tab is equal.
    flexShrink: 0,
  },
  title: {
    flexShrink: 0,
    // Real <h2>; Fluent's Text keeps the UA heading margin and this is a flex
    // item, so the margin has to be reset explicitly.
    margin: 0,
  },
  // Mirrors ChangeTimeline's `toolbarActions` exactly so both tabs present an
  // identical filter row.
  filterRow: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    // Stays right-aligned whether it sits beside the title or wraps below it.
    marginLeft: 'auto',
    // Sized from its own width rather than the viewport's — see the matching
    // note on ChangeTimeline's `toolbarActions`.
    flex: '1 1 460px',
    minWidth: 0,
    minHeight: '32px',
    paddingTop: tokens.spacingVerticalS,
  },
  filterDropdown: {
    minWidth: 0,
    flex: '1 1 132px',
  },
  dateRangeSurface: {
    maxWidth: '380px',
  },
  dateRangeContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    paddingTop: tokens.spacingVerticalS,
  },
  dateRangeHint: {
    color: tokens.colorNeutralForeground3,
  },
  dateTimeRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: tokens.spacingHorizontalS,
    minWidth: 0,
  },
  dateField: {
    flex: '1 1 auto',
    minWidth: 0,
  },
  timeField: {
    flex: '0 0 120px',
  },
  filterMenuButton: {
    minWidth: 0,
    width: '100%',
    flex: '1 1 132px',
    justifyContent: 'space-between',
    fontWeight: tokens.fontWeightRegular,
  },
  dateMenuButton: {
    minWidth: 0,
    width: '100%',
    // Holds the longest labels — "Last 30 days" or a full custom range — so it
    // starts wider than its siblings, matching ChangeTimeline's filter row.
    flex: '1 1 170px',
    justifyContent: 'space-between',
    fontWeight: tokens.fontWeightRegular,
    whiteSpace: 'nowrap',
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalXXL,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
});

export interface AllAgentsAuditViewProps {
  configs: TrackingConfig[] | undefined;
  /** Open a single agent's own tracker view. */
  onSelectAgent: (configId: string) => void;
}

/**
 * "All agents" scope: one audit summary across every tracked agent.
 *
 * Uses the same filter controls and the same `AuditSummary` as the per-agent
 * view, so the two scopes read identically.
 */
export function AllAgentsAuditView({ configs, onSelectAgent }: AllAgentsAuditViewProps) {
  const styles = useStyles();
  const { entries, agentNames, isLoading, trackedCount } = useAllAgentsChangeLog(configs);

  const [changeTypeFilter, setChangeTypeFilter] = useState<ChangeType[]>([]);
  const [componentTypeFilter, setComponentTypeFilter] = useState<ComponentType[]>([]);
  const [changedByFilter, setChangedByFilter] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<DateFilter>(DEFAULT_DATE_FILTER);
  const [customRange, setCustomRange] = useState<CustomRange>(() => emptyCustomRange());
  const [draftRange, setDraftRange] = useState<CustomRange>(() => emptyCustomRange());
  const [customRangeOpen, setCustomRangeOpen] = useState(false);

  const changedByOptions = useMemo(() => {
    const names = new Set<string>();
    entries.forEach((entry) => {
      if (entry.changedByName) names.add(entry.changedByName.trim());
    });
    return [...names].sort((left, right) => left.localeCompare(right));
  }, [entries]);

  const componentOptions = useMemo(() => {
    const types = new Set<ComponentType>();
    entries.forEach((entry) => {
      if (entry.componentType !== undefined) types.add(entry.componentType);
    });
    return [...types].sort((left, right) => left - right);
  }, [entries]);

  // Captured once per mount: calling Date.now() during render is impure and
  // would shift the window on unrelated re-renders.
  const [now] = useState(() => Date.now());
  const retention = useMemo(() => retentionWindow(now), [now]);
  const retentionDates = useMemo(() => retentionWindowDates(now), [now]);

  const dateWindow = useMemo(() => {
    if (dateFilter === 'custom') {
      return customRangeBounds(customRange);
    }
    return { start: now - DATE_FILTER_DAYS[dateFilter] * 86_400_000, end: now };
  }, [dateFilter, now, customRange]);

  const applyDateFilter = (value: DateFilter) => {
    if (value === 'custom') {
      // Opening the editor is not a commitment; Cancel leaves the current
      // filter untouched.
      setDraftRange((current) =>
        isCustomRangeComplete(customRange)
          ? customRange
          : isCustomRangeComplete(current)
            ? current
            : defaultCustomRange(Date.now()),
      );
      setCustomRangeOpen(true);
      return;
    }
    setDateFilter(value);
  };

  const commitCustomRange = () => {
    setCustomRange(draftRange);
    setDateFilter('custom');
    setCustomRangeOpen(false);
  };

  const filteredEntries = useMemo(
    () =>
      entries.filter((entry: ChangeLogEntry) => {
        if (changeTypeFilter.length && (entry.changeType === undefined || !changeTypeFilter.includes(entry.changeType)))
          return false;
        if (
          componentTypeFilter.length &&
          (entry.componentType === undefined || !componentTypeFilter.includes(entry.componentType))
        ) {
          return false;
        }
        if (
          changedByFilter.length &&
          (!entry.changedByName || !changedByFilter.includes(entry.changedByName.trim()))
        ) {
          return false;
        }
        if (dateWindow.start !== null || dateWindow.end !== null) {
          const time = Date.parse(entry.changedOn ?? '');
          if (!Number.isFinite(time)) return false;
          if (dateWindow.start !== null && time < dateWindow.start) return false;
          if (dateWindow.end !== null && time > dateWindow.end) return false;
        }
        return true;
      }),
    [entries, changeTypeFilter, componentTypeFilter, changedByFilter, dateWindow],
  );

  const filtersActive =
    changeTypeFilter.length > 0 ||
    componentTypeFilter.length > 0 ||
    changedByFilter.length > 0 ||
    dateFilter !== DEFAULT_DATE_FILTER;

  const clearFilters = () => {
    setChangeTypeFilter([]);
    setComponentTypeFilter([]);
    setChangedByFilter([]);
    setDateFilter(DEFAULT_DATE_FILTER);
    setCustomRange(emptyCustomRange());
  };

  const selectedKinds = useMemo<ChangeKind[]>(
    () =>
      changeTypeFilter.map((type) =>
        type === ChangeType.Created ? 'Added' : type === ChangeType.Deleted ? 'Removed' : 'Updated',
      ),
    [changeTypeFilter],
  );

  const toggleKindFilter = (kind: ChangeKind) => {
    const type =
      kind === 'Added'
        ? ChangeType.Created
        : kind === 'Removed'
          ? ChangeType.Deleted
          : kind === 'Updated'
            ? ChangeType.Updated
            : undefined;
    if (type === undefined) return;
    setChangeTypeFilter((current) =>
      current.includes(type) ? current.filter((value) => value !== type) : [...current, type],
    );
  };

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <Subtitle2 as="h2" className={styles.title}>Audit summary</Subtitle2>

        <div className={styles.filterRow}>
          <Menu
            checkedValues={{ user: changedByFilter }}
            onCheckedValueChange={(_, data) => {
              if (data.name === 'user') setChangedByFilter(data.checkedItems);
            }}
          >
            <MenuTrigger disableButtonEnhancement>
              <MenuButton
                className={styles.filterMenuButton}
                size="small"
                disabled={changedByOptions.length === 0}
                aria-label="Filter by user full name"
              >
                {changedByFilter.length > 1
                  ? `${changedByFilter.length} users selected`
                  : changedByFilter[0] ?? 'All users'}
              </MenuButton>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                {changedByOptions.map((name) => (
                  <MenuItemCheckbox key={name} name="user" value={name}>
                    {name}
                  </MenuItemCheckbox>
                ))}
              </MenuList>
            </MenuPopover>
          </Menu>

          <Dropdown
            className={styles.filterDropdown}
            size="small"
            multiselect
            placeholder="All changes"
            selectedOptions={changeTypeFilter.map(String)}
            value={
              changeTypeFilter.length > 1
                ? `${changeTypeFilter.length} changes selected`
                : changeTypeFilter[0] !== undefined
                  ? CHANGE_TYPE_LABEL[changeTypeFilter[0]]
                  : ''
            }
            onOptionSelect={(_, data) =>
              setChangeTypeFilter(data.selectedOptions.map(Number) as ChangeType[])
            }
            aria-label="Filter by change type"
          >
            <Option value={String(ChangeType.Created)}>Added</Option>
            <Option value={String(ChangeType.Updated)}>Updated</Option>
            <Option value={String(ChangeType.Deleted)}>Removed</Option>
          </Dropdown>

          <Menu
            checkedValues={{ date: [dateFilter] }}
            onCheckedValueChange={(_, data) =>
              applyDateFilter((data.checkedItems[0] as DateFilter) ?? DEFAULT_DATE_FILTER)
            }
          >
            <MenuTrigger disableButtonEnhancement>
              <MenuButton className={styles.dateMenuButton} size="small" aria-label="Filter by date">
                {dateFilter === 'custom' && isCustomRangeComplete(customRange)
                  ? formatCustomRangeLabel(customRange)
                  : DATE_FILTER_LABEL[dateFilter]}
              </MenuButton>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                {(Object.keys(DATE_FILTER_LABEL) as DateFilter[]).map((value) => (
                  <MenuItemRadio key={value} name="date" value={value}>
                    {DATE_FILTER_LABEL[value]}
                  </MenuItemRadio>
                ))}
              </MenuList>
            </MenuPopover>
          </Menu>

          <Dialog
            open={customRangeOpen}
            // Dismissing discards the draft, exactly like Cancel.
            onOpenChange={(_, data) => setCustomRangeOpen(data.open)}
          >
            <DialogSurface className={styles.dateRangeSurface}>
              <DialogBody>
                <DialogTitle>Set date range</DialogTitle>
                <DialogContent className={styles.dateRangeContent}>
                  <div className={styles.dateTimeRow}>
                    <Field label="From" className={styles.dateField}>
                      <DatePicker
                        value={fromIsoDate(draftRange.from)}
                        minDate={retentionDates.min}
                        maxDate={fromIsoDate(draftRange.to) ?? retentionDates.max}
                        placeholder="Select a start date"
                        appearance="outline"
                        onSelectDate={(date) =>
                          setDraftRange((current) => ({
                            ...current,
                            from: date
                              ? clampIsoDate(toIsoDate(date), retention.min, retention.max)
                              : '',
                          }))
                        }
                      />
                    </Field>
                    <Field label="Time" className={styles.timeField}>
                      <Input
                        type="time"
                        // Both rows label their time box "Time"; the accessible
                        // name has to say which one it is.
                        aria-label="Start time"
                        value={draftRange.fromTime}
                        onChange={(_, data) =>
                          setDraftRange((current) => ({ ...current, fromTime: data.value }))
                        }
                      />
                    </Field>
                  </div>
                  <div className={styles.dateTimeRow}>
                    <Field label="To" className={styles.dateField}>
                      <DatePicker
                        value={fromIsoDate(draftRange.to)}
                        minDate={fromIsoDate(draftRange.from) ?? retentionDates.min}
                        maxDate={retentionDates.max}
                        placeholder="Select an end date"
                        appearance="outline"
                        onSelectDate={(date) =>
                          setDraftRange((current) => ({
                            ...current,
                            to: date
                              ? clampIsoDate(toIsoDate(date), retention.min, retention.max)
                              : '',
                          }))
                        }
                      />
                    </Field>
                    <Field label="Time" className={styles.timeField}>
                      <Input
                        type="time"
                        aria-label="End time"
                        value={draftRange.toTime}
                        onChange={(_, data) =>
                          setDraftRange((current) => ({ ...current, toTime: data.value }))
                        }
                      />
                    </Field>
                  </div>
                  <Caption1 className={styles.dateRangeHint}>
                    Audit history is retained for the last 30 days, so earlier dates can't be
                    selected. Leave the times blank to cover whole days.
                  </Caption1>
                </DialogContent>
                <DialogActions>
                  <Button appearance="secondary" onClick={() => setCustomRangeOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    appearance="primary"
                    disabled={!isCustomRangeComplete(draftRange)}
                    onClick={commitCustomRange}
                  >
                    Apply
                  </Button>
                </DialogActions>
              </DialogBody>
            </DialogSurface>
          </Dialog>

          <Dropdown
            className={styles.filterDropdown}
            size="small"
            multiselect
            placeholder="All components"
            selectedOptions={componentTypeFilter.map(String)}
            value={
              componentTypeFilter.length > 1
                ? `${componentTypeFilter.length} components selected`
                : componentTypeFilter[0] !== undefined
                  ? COMPONENT_LABEL(componentTypeFilter[0])
                  : ''
            }
            onOptionSelect={(_, data) =>
              setComponentTypeFilter(data.selectedOptions.map((value) => Number(value) as ComponentType))
            }
            aria-label="Filter by component type"
          >
            {componentOptions.map((type) => (
              <Option key={type} value={String(type)}>
                {COMPONENT_LABEL(type)}
              </Option>
            ))}
          </Dropdown>

          {filtersActive && (
            <Tooltip content="Clear filters" relationship="label">
              <Button
                appearance="subtle"
                size="small"
                icon={<DismissRegular />}
                onClick={clearFilters}
                aria-label="Clear filters"
              />
            </Tooltip>
          )}
        </div>
      </div>

      {isLoading && entries.length === 0 ? (
        <div className={styles.center}>
          <Spinner size="small" label="Loading change history for all tracked agents..." />
        </div>
      ) : trackedCount === 0 ? (
        <div className={styles.center}>
          <Body1Strong>No agents tracked</Body1Strong>
          <Body1>Use “Track Agent” to opt an agent into change tracking.</Body1>
        </div>
      ) : (
        <AuditSummary
          entries={filteredEntries}
          dateFilterDays={
            dateFilter === 'custom'
              ? customRangeDays(customRange)
              : DATE_FILTER_DAYS[dateFilter]
          }
          dateWindow={
            dateFilter === 'custom' && dateWindow.start !== null && dateWindow.end !== null
              ? { start: dateWindow.start, end: dateWindow.end }
              : null
          }
          rangeLabel={
            dateFilter === 'custom' && isCustomRangeComplete(customRange)
              ? formatCustomRangeLabel(customRange)
              : DATE_FILTER_LABEL[dateFilter].toLowerCase()
          }
          agentNames={agentNames}
          componentTypeOf={(entry) => entry.componentType as number}
          componentLabelOf={(type) => COMPONENT_LABEL(type as ComponentType)}
          componentIconOf={componentIcon}
          selectedUsers={changedByFilter}
          selectedComponents={componentTypeFilter}
          selectedKinds={selectedKinds}
          onToggleUser={(name) =>
            setChangedByFilter((current) =>
              current.includes(name) ? current.filter((value) => value !== name) : [...current, name],
            )
          }
          onToggleComponent={(type) =>
            setComponentTypeFilter((current) =>
              current.includes(type as ComponentType)
                ? current.filter((value) => value !== type)
                : [...current, type as ComponentType],
            )
          }
          onToggleKind={toggleKindFilter}
          onSelectAgent={onSelectAgent}
          onClearFilters={clearFilters}
          hasActiveFilters={filtersActive}
        />
      )}
    </div>
  );
}

/** Label helper backed by the shared contract, so labels match the rest of the feature. */
function COMPONENT_LABEL(type: ComponentType): string {
  return COMPONENT_TYPE_LABEL[type] ?? String(type);
}
