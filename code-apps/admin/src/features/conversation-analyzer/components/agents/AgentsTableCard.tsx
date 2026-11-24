import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  makeStyles,
  tokens,
  Card,
  CardHeader,
  Subtitle2,
  Badge,
  Option,
  SearchBox,
  Spinner,
} from '@fluentui/react-components';
import { useAgentsTable, type AgentTableRow } from '../../hooks/useAgentsTable';
import { PAGE_SIZE_AGENTS } from '../../contracts/constants';
import type { HealthStatus } from '../../contracts/types';
import { EmptyState } from '../shared/EmptyState';
import { RetryMessageBar } from '../shared/RetryMessageBar';
import { SingleLineDropdown } from '../shared/SingleLineDropdown';
import { AgentsGrid } from './AgentsGrid';
import {
  DEFAULT_AGENT_SORT,
  parseStatusParam,
  sortAgentRows,
  type AgentSortState,
  type AgentStatusFilterValue,
} from './agentGridUtils';
import { AgentStatusFilter } from './AgentStatusFilter';
import { AgentsTablePagination } from './AgentsTablePagination';

const ALL_ENVIRONMENTS = '__all__';

const useStyles = makeStyles({
  card: {
    padding: 0,
    gap: 0,
    borderRadius: tokens.borderRadiusXLarge,
    overflow: 'hidden',
  },
  header: {
    paddingTop: tokens.spacingVerticalL,
    paddingLeft: tokens.spacingHorizontalL,
    paddingRight: tokens.spacingHorizontalL,
  },
  title: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS },
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
  },
  spacer: { flex: 1 },
  environment: { minWidth: 'min(320px, 100%)', maxWidth: '100%' },
  environmentListbox: { width: '360px', maxWidth: 'calc(100vw - 32px)' },
  search: { width: '240px' },
  body: { minHeight: '200px', paddingLeft: tokens.spacingHorizontalL, paddingRight: tokens.spacingHorizontalL },
  center: { display: 'flex', justifyContent: 'center', padding: tokens.spacingVerticalXXL },
});

function emptyCounts(): Record<HealthStatus, number> {
  return { critical: 0, attention: 0, healthy: 0, unknown: 0 };
}

/** "All agents" card: status segmented filter, environment, search, grid and pager. */
export function AgentsTableCard() {
  const styles = useStyles();
  const [searchParams, setSearchParams] = useSearchParams();
  const status = parseStatusParam(searchParams.get('status'));
  const [search, setSearch] = useState('');
  const [environment, setEnvironment] = useState(ALL_ENVIRONMENTS);
  const [sortState, setSortState] = useState<AgentSortState>(DEFAULT_AGENT_SORT);
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, refetch } = useAgentsTable();
  const allRows = useMemo(() => data ?? [], [data]);

  const environmentOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of allRows) {
      const key = r.environmentUrl ?? r.environmentName;
      if (key && !map.has(key)) map.set(key, r.environmentName ?? key);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [allRows]);

  const scopedRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allRows.filter((r: AgentTableRow) => {
      if (environment !== ALL_ENVIRONMENTS && (r.environmentUrl ?? r.environmentName) !== environment) return false;
      return !term || r.name.toLowerCase().includes(term);
    });
  }, [allRows, environment, search]);

  const counts = useMemo(() => {
    const c = emptyCounts();
    for (const r of scopedRows) c[r.status]++;
    return c;
  }, [scopedRows]);

  const filteredRows = useMemo(
    () => sortAgentRows(status === 'all' ? scopedRows : scopedRows.filter((r) => r.status === status), sortState),
    [scopedRows, status, sortState],
  );

  const totalRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE_AGENTS));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE_AGENTS, currentPage * PAGE_SIZE_AGENTS);

  const handleStatusChange = useCallback(
    (next: AgentStatusFilterValue) => {
      const params = new URLSearchParams(searchParams);
      if (next === 'all') params.delete('status');
      else params.set('status', next);
      setSearchParams(params, { replace: true });
      setPage(1);
    },
    [searchParams, setSearchParams],
  );

  const handleSortChange = useCallback((next: AgentSortState) => {
    setSortState(next);
    setPage(1);
  }, []);

  const selectedEnvLabel =
    environment === ALL_ENVIRONMENTS
      ? 'All environments'
      : environmentOptions.find(([k]) => k === environment)?.[1] ?? 'All environments';

  return (
    <Card className={styles.card}>
      <CardHeader
        className={styles.header}
        header={
          <div className={styles.title}>
            <Subtitle2 as="h2">All agents</Subtitle2>
            {!isLoading && (
              <Badge appearance="tint" color="informative" shape="rounded">
                {`${allRows.length.toLocaleString()} ${allRows.length === 1 ? 'agent' : 'agents'}`}
              </Badge>
            )}
          </div>
        }
      />
      <div className={styles.toolbar}>
        <AgentStatusFilter value={status} counts={counts} total={scopedRows.length} onChange={handleStatusChange} />
        <div className={styles.spacer} />
        <SingleLineDropdown
          className={styles.environment}
          listbox={{ className: styles.environmentListbox }}
          aria-label="Environment"
          value={selectedEnvLabel}
          selectedOptions={[environment]}
          onOptionSelect={(_e, d) => {
            setEnvironment(d.optionValue ?? ALL_ENVIRONMENTS);
            setPage(1);
          }}
        >
          <Option value={ALL_ENVIRONMENTS}>All environments</Option>
          {environmentOptions.map(([key, label]) => (
            <Option key={key} value={key}>{label}</Option>
          ))}
        </SingleLineDropdown>
        <SearchBox
          className={styles.search}
          placeholder="Search agents"
          aria-label="Search agents"
          value={search}
          onChange={(_e, d) => {
            setSearch(d.value);
            setPage(1);
          }}
        />
      </div>
      <div className={styles.body}>
        {isError ? (
          <RetryMessageBar
            title="Couldn't load agents"
            message={error?.message}
            onRetry={() => void refetch()}
          />
        ) : isLoading ? (
          <div className={styles.center}><Spinner size="small" label="Loading agents..." /></div>
        ) : totalRows === 0 ? (
          <EmptyState
            illustration
            title="No agents match your search."
            description="Try a different name or clear the search."
            minHeight="280px"
          />
        ) : (
          <AgentsGrid rows={pageRows} sortState={sortState} onSortChange={handleSortChange} ariaLabel="All agents" />
        )}
      </div>
      {!isLoading && totalRows > 0 && (
        <AgentsTablePagination
          page={currentPage}
          totalPages={totalPages}
          totalRows={totalRows}
          pageSize={PAGE_SIZE_AGENTS}
          onPageChange={setPage}
        />
      )}
    </Card>
  );
}
