import { useMemo, useState } from 'react';
import {
  Button,
  Dropdown,
  Field,
  Input,
  Option,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  ChevronDown20Regular,
  Dismiss20Regular,
  Filter20Filled,
  GroupList20Regular,
  Group20Regular,
} from '@fluentui/react-icons';
import type {
  GridColumnDefinition,
  GridFilter,
  GridFilterOperator,
  GridSortDirection,
} from './AdvancedDataGrid.types';
import { getDefaultFilterOperator } from './useGridState';

const useStyles = makeStyles({
  trigger: {
    width: '24px',
    minWidth: '24px',
    height: '24px',
    padding: 0,
  },
  surface: {
    width: '260px',
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  heading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
  },
  title: {
    fontWeight: tokens.fontWeightSemibold,
  },
  control: {
    width: '100%',
    minWidth: 0,
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-start',
    gap: tokens.spacingHorizontalS,
  },
  groupAction: {
    justifyContent: 'flex-start',
    width: '100%',
  },
  divider: {
    height: '1px',
    backgroundColor: tokens.colorNeutralStroke2,
  },
});

const DATA_PRESENCE_OPERATORS: Array<{ value: GridFilterOperator; label: string }> = [
  { value: 'hasData', label: 'Contains data' },
  { value: 'noData', label: 'Does not contain data' },
];

const OPERATORS: Record<GridColumnDefinition<unknown>['dataType'], Array<{ value: GridFilterOperator; label: string }>> = {
  text: [
    { value: 'equals', label: 'Equals' },
    { value: 'notEquals', label: 'Does not equal' },
    { value: 'contains', label: 'Contains' },
    { value: 'startsWith', label: 'Starts with' },
    { value: 'endsWith', label: 'Ends with' },
    ...DATA_PRESENCE_OPERATORS,
  ],
  choice: [
    { value: 'equals', label: 'Equals' },
    { value: 'notEquals', label: 'Does not equal' },
    ...DATA_PRESENCE_OPERATORS,
  ],
  boolean: [
    { value: 'equals', label: 'Equals' },
    { value: 'notEquals', label: 'Does not equal' },
    ...DATA_PRESENCE_OPERATORS,
  ],
  number: [
    { value: 'equals', label: 'Equals' },
    { value: 'notEquals', label: 'Not equal' },
    { value: 'greaterThan', label: 'Greater than' },
    { value: 'greaterThanOrEqual', label: 'Greater than or equal' },
    { value: 'lessThan', label: 'Less than' },
    { value: 'lessThanOrEqual', label: 'Less than or equal' },
    ...DATA_PRESENCE_OPERATORS,
  ],
  date: [
    { value: 'on', label: 'On' },
    { value: 'before', label: 'Before' },
    { value: 'after', label: 'After' },
    { value: 'onOrBefore', label: 'On or before' },
    { value: 'onOrAfter', label: 'On or after' },
    ...DATA_PRESENCE_OPERATORS,
  ],
  datetime: [
    { value: 'on', label: 'On' },
    { value: 'before', label: 'Before' },
    { value: 'after', label: 'After' },
    { value: 'onOrBefore', label: 'On or before' },
    { value: 'onOrAfter', label: 'On or after' },
    ...DATA_PRESENCE_OPERATORS,
  ],
};

interface ColumnMenuProps<TRecord> {
  column: GridColumnDefinition<TRecord>;
  activeSort?: GridSortDirection;
  activeFilter?: GridFilter;
  onApply: (sort: GridSortDirection | undefined, filter: GridFilter | undefined) => void;
  mountNode?: HTMLElement | null;
  isGrouped?: boolean;
  onToggleGroup?: () => void;
}

export function ColumnMenu<TRecord>({
  column,
  activeSort,
  activeFilter,
  onApply,
  mountNode,
  isGrouped,
  onToggleGroup,
}: ColumnMenuProps<TRecord>) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [surfaceEl, setSurfaceEl] = useState<HTMLElement | null>(null);
  const [sort, setSort] = useState<GridSortDirection | undefined>(activeSort);
  const [operator, setOperator] = useState<GridFilterOperator>(
    activeFilter?.operator ?? getDefaultFilterOperator(column.dataType),
  );
  const [value, setValue] = useState<string | string[]>(activeFilter?.value ?? '');
  const operators = useMemo(() => OPERATORS[column.dataType], [column.dataType]);
  const isChoice = column.dataType === 'choice' || column.dataType === 'boolean';

  const valuelessOperator = operator === 'hasData' || operator === 'noData';
  const hasValue = Array.isArray(value) ? value.length > 0 : value.trim().length > 0;
  const filter = valuelessOperator
    ? { columnId: column.columnId, operator, value: '' }
    : hasValue
      ? { columnId: column.columnId, operator, value }
      : undefined;
  const active = Boolean(activeSort || activeFilter || isGrouped);

  // In fullscreen the popover mounts inside the card via `mountNode`. Mount the
  // nested dropdown listboxes into the popover surface itself so they stay inside
  // the popover's containment tree — otherwise their option clicks read as
  // "outside" and dismiss the whole popover.
  const dropdownMountNode = mountNode ? surfaceEl : undefined;

  return (
    <Popover
      open={open}
      mountNode={mountNode}
      onOpenChange={(_, data) => {
        if (data.open) {
          setSort(activeSort);
          setOperator(activeFilter?.operator ?? getDefaultFilterOperator(column.dataType));
          setValue(activeFilter?.value ?? '');
        }
        setOpen(data.open);
      }}
      positioning={{ position: 'below', align: 'start', offset: 6 }}
    >
      <PopoverTrigger disableButtonEnhancement>
        <Button
          className={styles.trigger}
          appearance={active ? 'subtle' : 'transparent'}
          icon={activeFilter ? <Filter20Filled /> : <ChevronDown20Regular />}
          aria-label={`Sort and filter ${column.label}`}
        />
      </PopoverTrigger>
      <PopoverSurface ref={setSurfaceEl} className={styles.surface} aria-label={`${column.label} options`}>
        <div className={styles.heading}>
          <span className={styles.title}>{column.label}</span>
          <Button
            appearance="subtle"
            size="small"
            icon={<Dismiss20Regular />}
            aria-label="Close sort and filter"
            onClick={() => setOpen(false)}
          />
        </div>
        {onToggleGroup ? (
          <>
            <Button
              className={styles.groupAction}
              appearance="subtle"
              icon={isGrouped ? <Group20Regular /> : <GroupList20Regular />}
              onClick={() => {
                onToggleGroup();
                setOpen(false);
              }}
            >
              {isGrouped ? 'Ungroup' : 'Group by'}
            </Button>
            <div className={styles.divider} />
          </>
        ) : null}
        <Field label="Sort">
          <Dropdown
            className={styles.control}
            mountNode={dropdownMountNode}
            value={sort === 'ascending'
              ? column.dataType === 'number' ? 'Smallest to largest' : 'A to Z'
              : sort === 'descending'
                ? column.dataType === 'number' ? 'Largest to smallest' : 'Z to A'
                : 'No sorting'}
            selectedOptions={sort ? [sort] : ['none']}
            onOptionSelect={(_, data) => setSort(
              data.optionValue === 'none' ? undefined : data.optionValue as GridSortDirection,
            )}
          >
            <Option value="none">No sorting</Option>
            <Option value="ascending">{column.dataType === 'number' ? 'Smallest to largest' : 'A to Z'}</Option>
            <Option value="descending">{column.dataType === 'number' ? 'Largest to smallest' : 'Z to A'}</Option>
          </Dropdown>
        </Field>
        <Field label="Condition">
          <Dropdown
            className={styles.control}
            mountNode={dropdownMountNode}
            value={operators.find((item) => item.value === operator)?.label}
            selectedOptions={[operator]}
            onOptionSelect={(_, data) => setOperator(data.optionValue as GridFilterOperator)}
          >
            {operators.map((item) => (
              <Option key={item.value} value={item.value}>{item.label}</Option>
            ))}
          </Dropdown>
        </Field>
        {valuelessOperator ? null : isChoice ? (
          <Field label="Value">
            <Dropdown
              className={styles.control}
              mountNode={dropdownMountNode}
              value={(column.choiceOptions ?? []).find((option) => option.value === value)?.label}
              selectedOptions={typeof value === 'string' && value ? [value] : []}
              onOptionSelect={(_, data) => setValue(String(data.optionValue ?? ''))}
            >
              {(column.choiceOptions ?? []).map((option) => (
                <Option key={option.value} value={option.value}>{option.label}</Option>
              ))}
            </Dropdown>
          </Field>
        ) : (
          <Field label="Value">
            <Input
              className={styles.control}
              type={column.dataType === 'number' ? 'number' : column.dataType === 'date' || column.dataType === 'datetime' ? 'date' : 'text'}
              value={Array.isArray(value) ? '' : value}
              onChange={(_, data) => setValue(data.value)}
            />
          </Field>
        )}
        <div className={styles.footer}>
          <Button
            appearance="primary"
            onClick={() => {
              onApply(sort, filter);
              setOpen(false);
            }}
          >
            Apply
          </Button>
          <Button
            appearance="secondary"
            onClick={() => {
              setSort(undefined);
              setValue('');
              onApply(undefined, undefined);
              setOpen(false);
            }}
          >
            Clear
          </Button>
        </div>
      </PopoverSurface>
    </Popover>
  );
}
