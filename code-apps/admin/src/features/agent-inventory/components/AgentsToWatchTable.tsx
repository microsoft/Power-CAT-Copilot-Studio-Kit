import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { AgentWatchRow } from '../contracts/types';
import { InventoryStatusBadge } from './InventoryStatusBadge';
import { useAgentInventorySurfaceStyles } from '../styles/surfaceStyles';
import { BasicDataGrid } from './shared/BasicDataGrid';
import type { BasicDataGridColumn } from './shared/BasicDataGrid';

interface AgentsToWatchTableProps {
  rows: AgentWatchRow[];
}

export function AgentsToWatchTable({
  rows,
}: AgentsToWatchTableProps) {
  const surfaceStyles = useAgentInventorySurfaceStyles();
  const columns = useMemo<BasicDataGridColumn<AgentWatchRow>[]>(() => [
    {
      key: 'name',
      label: 'Name',
      width: '202px',
      sortable: true,
      render: (row) => <Link to={`/agent-inventory/agents/${row.id}`}>{row.name}</Link>,
    },
    {
      key: 'status',
      label: 'Status',
      width: '106px',
      sortable: true,
      render: (row) => <InventoryStatusBadge status={row.status} />,
      searchValue: (row) => row.status,
    },
    {
      key: 'owner',
      label: 'Owner',
      width: '141px',
      sortable: true,
    },
    {
      key: 'environment',
      label: 'Environment',
      width: '220px',
      sortable: true,
    },
    {
      key: 'poweredBy',
      label: 'Powered by',
      width: '121px',
      sortable: true,
    },
    {
      key: 'billedCredits',
      label: 'Billed credits',
      width: '111px',
      sortable: true,
      alignment: 'end',
      render: (row) => row.billedCredits ? row.billedCredits.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '',
    },
    {
      key: 'lastUsage',
      label: 'Last usage',
      width: '95px',
      sortable: true,
      render: (row) => row.lastUsage ? new Date(row.lastUsage).toLocaleDateString() : '',
      searchValue: (row) => row.lastUsage ? new Date(row.lastUsage).toLocaleDateString() : '',
    },
    {
      key: 'riskSignal',
      label: 'Risk signal',
      width: '153px',
      sortable: true,
    },
  ], []);

  return (
    <BasicDataGrid
      title="High usage and governance signals"
      columns={columns}
      records={rows}
      getRecordId={(row) => row.id}
      pageSize={10}
      searchPlaceholder="Search agents"
      cardClassName={surfaceStyles.card}
      minimumGridWidth="1149px"
    />
  );
}
