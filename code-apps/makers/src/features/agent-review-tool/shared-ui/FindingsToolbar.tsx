/**
 * Search and narrowing for the consolidated list.
 *
 * Controlled throughout: the filter belongs to the screen, which may need to restore it from a URL
 * or reset it when the reader switches review. Holding it here would make those cases impossible.
 */

import {
  Caption1,
  Dropdown,
  Option,
  SearchBox,
  Tooltip,
  Button,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { ArrowSortRegular } from '@fluentui/react-icons';

import { STATUS_LABEL, type FindingStatus, type FindingsFilter } from './consolidatedFindings';

export interface FindingsToolbarProps {
  filter: FindingsFilter;
  onFilterChange: (next: FindingsFilter) => void;
  /** Families present in this review, from `familyOptions`. */
  families: readonly string[];
  /** Statuses present in this review, from `statusOptions`. */
  statuses: readonly FindingStatus[];
  /** Right-aligned count of what is currently shown. */
  shown: number;
}

const ALL = '__all__';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  search: { minWidth: '200px', flexGrow: 1, maxWidth: '320px' },
  dropdown: { minWidth: '160px' },
  count: { marginLeft: 'auto', color: tokens.colorNeutralForeground3, flexShrink: 0 },
});

export function FindingsToolbar({ filter, onFilterChange, families, statuses, shown }: FindingsToolbarProps) {
  const styles = useStyles();
  const patch = (next: Partial<FindingsFilter>) => onFilterChange({ ...filter, ...next });

  const sortingByFamily = filter.order === 'family';

  return (
    <div className={styles.root}>
      <SearchBox
        className={styles.search}
        placeholder="Search"
        value={filter.query ?? ''}
        onChange={(_, data) => patch({ query: data.value })}
      />

      <Dropdown
        className={styles.dropdown}
        aria-label="Filter by component"
        value={filter.family ?? 'All components'}
        selectedOptions={[filter.family ?? ALL]}
        onOptionSelect={(_, data) =>
          patch({ family: data.optionValue === ALL ? undefined : data.optionValue })}
      >
        <Option value={ALL}>All components</Option>
        {families.map(f => <Option key={f} value={f}>{f}</Option>)}
      </Dropdown>

      <Dropdown
        className={styles.dropdown}
        aria-label="Filter by status"
        value={filter.status ? STATUS_LABEL[filter.status] : 'All status'}
        selectedOptions={[filter.status ?? ALL]}
        onOptionSelect={(_, data) =>
          patch({ status: data.optionValue === ALL ? undefined : data.optionValue as FindingStatus })}
      >
        <Option value={ALL}>All status</Option>
        {statuses.map(s => <Option key={s} value={s}>{STATUS_LABEL[s]}</Option>)}
      </Dropdown>

      <Tooltip
        content={sortingByFamily ? 'Sort by severity' : 'Sort by component'}
        relationship="label"
      >
        <Button
          appearance="subtle"
          icon={<ArrowSortRegular />}
          onClick={() => patch({ order: sortingByFamily ? 'severity' : 'family' })}
        />
      </Tooltip>

      <Caption1 className={styles.count}>
        {shown} {shown === 1 ? 'result' : 'results'}
      </Caption1>
    </div>
  );
}
