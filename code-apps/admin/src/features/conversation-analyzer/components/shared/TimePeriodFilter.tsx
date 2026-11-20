import { makeStyles, tokens, Body1, Option, Button, Caption1 } from '@fluentui/react-components';
import { DatePicker } from '@fluentui/react-datepicker-compat';
import { SearchRegular } from '@fluentui/react-icons';
import { useCallback, useState } from 'react';
import { useFilterContext } from '../../context/FilterContext';
import { TIME_PERIOD_OPTIONS } from '../../contracts/constants';
import type { TimePeriod } from '../../contracts/types';
import { SingleLineDropdown } from './SingleLineDropdown';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  dropdown: {
    minWidth: '180px',
  },
  dateRange: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  datePicker: {
    minWidth: '140px',
    maxWidth: '160px',
  },
});

export function TimePeriodFilter() {
  const styles = useStyles();
  const { timePeriod, setTimePeriod, customStartDate, customEndDate, setCustomStartDate, setCustomEndDate } = useFilterContext();

  // Track dropdown selection locally so switching to "Custom range" doesn't trigger data reload
  const [showCustom, setShowCustom] = useState(timePeriod === 'custom');

  const [localStart, setLocalStart] = useState<Date | null | undefined>(
    customStartDate ? new Date(customStartDate) : null,
  );
  const [localEnd, setLocalEnd] = useState<Date | null | undefined>(
    customEndDate ? new Date(customEndDate) : null,
  );

  const onSelect = useCallback(
    (_event: unknown, data: { optionValue?: string }) => {
      if (!data.optionValue) return;
      const selected = data.optionValue as TimePeriod;
      if (selected === 'custom') {
        // Only show the date pickers - don't update the context yet
        setShowCustom(true);
      } else {
        // Preset periods apply immediately
        setShowCustom(false);
        setTimePeriod(selected);
      }
    },
    [setTimePeriod],
  );

  const handleSearch = useCallback(() => {
    if (localStart && localEnd) {
      setTimePeriod('custom');
      setCustomStartDate(localStart.toISOString());
      setCustomEndDate(localEnd.toISOString());
    }
  }, [localStart, localEnd, setTimePeriod, setCustomStartDate, setCustomEndDate]);

  const displayValue = showCustom
    ? 'Custom range'
    : (TIME_PERIOD_OPTIONS.find((o) => o.value === timePeriod)?.label ?? 'Last 7 days');

  const selectedOptions = showCustom ? ['custom'] : [timePeriod];

  return (
    <div className={styles.root}>
      <Body1 id="conversation-analyzer-period-label">Time period</Body1>
      <SingleLineDropdown
        className={styles.dropdown}
        value={displayValue}
        selectedOptions={selectedOptions}
        onOptionSelect={onSelect}
        appearance="outline"
        aria-labelledby="conversation-analyzer-period-label"
      >
        {TIME_PERIOD_OPTIONS.map((opt) => (
          <Option key={opt.value} value={opt.value}>
            {opt.label}
          </Option>
        ))}
      </SingleLineDropdown>

      {showCustom && (
        <div className={styles.dateRange}>
          <Caption1>Start</Caption1>
          <DatePicker
            className={styles.datePicker}
            placeholder="Start date"
            value={localStart}
            onSelectDate={(date) => setLocalStart(date)}
            maxDate={localEnd ?? undefined}
            appearance="outline"
          />
          <Caption1>End</Caption1>
          <DatePicker
            className={styles.datePicker}
            placeholder="End date"
            value={localEnd}
            onSelectDate={(date) => setLocalEnd(date)}
            minDate={localStart ?? undefined}
            appearance="outline"
          />
          <Button
            appearance="primary"
            icon={<SearchRegular />}
            onClick={handleSearch}
            disabled={!localStart || !localEnd}
          >
            Search
          </Button>
        </div>
      )}
    </div>
  );
}
