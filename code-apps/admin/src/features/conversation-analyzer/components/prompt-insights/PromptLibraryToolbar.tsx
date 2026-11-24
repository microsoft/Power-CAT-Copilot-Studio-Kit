/** Header controls for the Prompt library: usage filter and search (PI-6, PI-8). */

import { SearchBox, ToggleButton, makeStyles, tokens } from '@fluentui/react-components';

export type LibraryFilter = 'all' | 'in-use' | 'never-run';

export interface LibraryCounts {
  all: number;
  'in-use': number;
  'never-run': number;
}

const FILTERS: { id: LibraryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'in-use', label: 'In use' },
  { id: 'never-run', label: 'Never run' },
];

const useStyles = makeStyles({
  root: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  group: {
    display: 'inline-flex',
    gap: tokens.spacingHorizontalXXS,
    padding: tokens.spacingHorizontalXXS,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  search: { minWidth: '260px' },
});

interface PromptLibraryToolbarProps {
  filter: LibraryFilter;
  counts: LibraryCounts;
  search: string;
  onFilterChange: (filter: LibraryFilter) => void;
  onSearchChange: (search: string) => void;
}

export function PromptLibraryToolbar({ filter, counts, search, onFilterChange, onSearchChange }: PromptLibraryToolbarProps) {
  const styles = useStyles();
  return (
    <div className={styles.root}>
      <div role="group" aria-label="Filter prompts by usage" className={styles.group}>
        {FILTERS.map((f) => (
          <ToggleButton
            key={f.id}
            size="small"
            appearance={filter === f.id ? 'primary' : 'subtle'}
            checked={filter === f.id}
            onClick={() => onFilterChange(f.id)}
          >
            {`${f.label} (${counts[f.id]})`}
          </ToggleButton>
        ))}
      </div>
      <SearchBox
        className={styles.search}
        placeholder="Search prompts or insights"
        aria-label="Search prompts or insights"
        value={search}
        onChange={(_e, d) => onSearchChange(d.value)}
      />
    </div>
  );
}
