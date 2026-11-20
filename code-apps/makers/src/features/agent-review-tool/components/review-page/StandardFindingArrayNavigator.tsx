import { useMemo, useState } from 'react';
import {
  Caption1,
  Combobox,
  Field,
  Option,
  makeStyles,
  shorthands,
  tokens,
  type ComboboxProps,
} from '@fluentui/react-components';
import type {
  FindingNavigatorOption,
} from '../../utils/standardFindingNavigation';

export type { FindingNavigatorOption } from '../../utils/standardFindingNavigation';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalS),
    minWidth: 0,
  },
  selector: {
    width: '100%',
    minWidth: 0,
  },
  positionRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  position: {
    color: tokens.colorNeutralForeground2,
    whiteSpace: 'nowrap',
  },
});

export interface StandardFindingArrayNavigatorProps {
  options: readonly FindingNavigatorOption[];
  selectedId: string;
  collectionLabel: string;
  itemLabel: string;
  onSelect: (id: string) => void;
}

interface StandardFindingItemPickerProps {
  options: readonly FindingNavigatorOption[];
  selectedId: string;
  label: string;
  excludedId?: string;
  showLabel?: boolean;
  onSelect: (id: string) => void;
}

/** Search and select one stable finding item. */
export function StandardFindingItemPicker({
  options,
  selectedId,
  label,
  excludedId,
  showLabel = true,
  onSelect,
}: StandardFindingItemPickerProps) {
  const styles = useStyles();
  const [query, setQuery] = useState('');
  const availableOptions = useMemo(
    () => options.filter(option => option.id !== excludedId),
    [excludedId, options],
  );
  const selected = availableOptions.find(option => option.id === selectedId);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleOptions = useMemo(
    () => normalizedQuery
      ? availableOptions.filter(option => option.searchText.includes(normalizedQuery))
      : availableOptions,
    [availableOptions, normalizedQuery],
  );

  const selectOption: ComboboxProps['onOptionSelect'] = (_event, data) => {
    if (data.optionValue && availableOptions.some(option => option.id === data.optionValue)) {
      onSelect(data.optionValue);
    }
    setQuery('');
  };

  const combobox = (
    <Combobox
      className={styles.selector}
      aria-label={label}
      placeholder={label}
      value={query || selected?.label || ''}
      selectedOptions={selected ? [selected.id] : []}
      onChange={event => setQuery(event.target.value)}
      onOptionSelect={selectOption}
      onBlur={() => setQuery('')}
    >
      {visibleOptions.length > 0 ? visibleOptions.map(option => (
        <Option key={option.id} value={option.id} text={option.label}>
          {option.label}
        </Option>
      )) : (
        <Option disabled>No matching items</Option>
      )}
    </Combobox>
  );

  return showLabel
    ? <Field label={label}>{combobox}</Field>
    : combobox;
}

/** Select one saved finding entry without rendering the full collection. */
export function StandardFindingArrayNavigator({
  options,
  selectedId,
  collectionLabel,
  itemLabel,
  onSelect,
}: StandardFindingArrayNavigatorProps) {
  const styles = useStyles();
  const selected = options.find(option => option.id === selectedId);

  if (options.length <= 1 || !selected) return null;

  const selectedIndex = options.findIndex(option => option.id === selected.id);

  return (
    <div className={styles.root}>
      <StandardFindingItemPicker
        options={options}
        selectedId={selected.id}
        label={`Search or select ${collectionLabel.toLocaleLowerCase()}`}
        showLabel={false}
        onSelect={onSelect}
      />
      <div className={styles.positionRow}>
        <Caption1 aria-live="polite" className={styles.position}>
          {itemLabel} {selectedIndex + 1} of {options.length}
        </Caption1>
      </div>
    </div>
  );
}
