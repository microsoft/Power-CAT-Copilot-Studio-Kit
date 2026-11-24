import { useMemo } from 'react';
import {
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import type { AgentInventoryRecord, AgentUsageRecord } from '../../../contracts/types';
import type { UsageInsights } from '../../../utils/usageAnalytics';
import { formatUsageWeekLabel } from '../../../utils/usageAnalytics';
import { parseUsageDate, type UsageDateRange } from '../../../utils/usageDateRanges';
import { useAgentInventorySurfaceStyles } from '../../../styles/surfaceStyles';
import { BasicDataGrid } from '../../shared/BasicDataGrid';
import type { BasicDataGridColumn } from '../../shared/BasicDataGrid';
import ExportButton, { type ExportColumn } from '../../shared/ExportButton';
import { useAgentUsageStyles } from './AgentUsageTab.styles';

const useStyles = makeStyles({
  notAvailableBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: `2px ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusMedium,
    color: tokens.colorNeutralForeground2,
    backgroundColor: 'transparent',
    border: `${tokens.strokeWidthThin} dashed ${tokens.colorNeutralStrokeAccessible}`,
    fontSize: tokens.fontSizeBase100,
    lineHeight: tokens.lineHeightBase100,
    fontWeight: tokens.fontWeightSemibold,
  },
});

function sourceText(value?: string) {
  return value?.trim() || 'NA';
}

function SourceValue({ value }: { value?: string }) {
  const styles = useStyles();
  const text = value?.trim();
  return text || (
    <span className={styles.notAvailableBadge}>NA</span>
  );
}

const columns: BasicDataGridColumn<AgentUsageRecord>[] = [
  {
    key: 'usageDate',
    label: 'Week',
    width: '140px',
    sortable: true,
    render: formatUsageWeekLabel,
    searchValue: formatUsageWeekLabel,
    sortValue: (row) => parseUsageDate(row.fromDate)?.getTime()
      ?? parseUsageDate(row.usageDate)?.getTime()
      ?? -1,
  },
  {
    key: 'featureName',
    label: 'Feature',
    width: '180px',
    sortable: true,
    render: (row) => <SourceValue value={row.featureName} />,
    searchValue: (row) => sourceText(row.featureName),
  },
  {
    key: 'users',
    label: 'Reported users',
    width: '130px',
    sortable: true,
    alignment: 'end',
    render: (row) => row.users.toLocaleString(),
  },
  {
    key: 'toolInvoked',
    label: 'Tool invoked',
    width: '210px',
    sortable: true,
    render: (row) => <SourceValue value={row.toolInvoked} />,
    searchValue: (row) => sourceText(row.toolInvoked),
  },
  {
    key: 'knowledgeSources',
    label: 'Knowledge source',
    width: '210px',
    sortable: true,
    render: (row) => <SourceValue value={row.knowledgeSources} />,
    searchValue: (row) => sourceText(row.knowledgeSources),
  },
  {
    key: 'llmModel',
    label: 'Model',
    width: '130px',
    sortable: true,
    render: (row) => <SourceValue value={row.llmModel} />,
    searchValue: (row) => sourceText(row.llmModel),
  },
  {
    key: 'billedCredits',
    label: 'Billed credits',
    width: '130px',
    sortable: true,
    alignment: 'end',
    render: (row) => row.billedCredits.toLocaleString(),
  },
  {
    key: 'nonBilledCredits',
    label: 'Non-billed credits',
    width: '150px',
    sortable: true,
    alignment: 'end',
    render: (row) => row.nonBilledCredits.toLocaleString(),
  },
];

const exportColumns: ExportColumn[] = [
  { key: 'agentName', header: 'Agent name', width: 28 },
  { key: 'agentId', header: 'Agent ID', width: 38 },
  { key: 'environmentId', header: 'Environment ID', width: 38 },
  { key: 'usageDate', header: 'Usage date', width: 18 },
  { key: 'fromDate', header: 'From date', width: 18 },
  { key: 'toDate', header: 'To date', width: 18 },
  { key: 'featureName', header: 'Feature', width: 24 },
  { key: 'channelId', header: 'Channel', width: 24 },
  { key: 'reportedUsers', header: 'Reported users', width: 18 },
  { key: 'toolInvoked', header: 'Tool invoked', width: 28 },
  { key: 'knowledgeSources', header: 'Knowledge sources', width: 28 },
  { key: 'llmModel', header: 'Model', width: 18 },
  { key: 'billedCredits', header: 'Billed credits', width: 18 },
  { key: 'nonBilledCredits', header: 'Non-billed credits', width: 20 },
  { key: 'totalCredits', header: 'Total credits', width: 18 },
];

interface UsageRecordsGridProps {
  agent: AgentInventoryRecord;
  range: UsageDateRange;
  insights: UsageInsights;
}

export function UsageRecordsGrid({ agent, range, insights }: UsageRecordsGridProps) {
  const styles = useAgentUsageStyles();
  const surfaceStyles = useAgentInventorySurfaceStyles();
  const exportData = useMemo(() => insights.detailRecords.map((row) => ({
    agentName: agent.name ?? '',
    agentId: row.agentId ?? '',
    environmentId: row.environmentId ?? '',
    usageDate: row.usageDate ?? '',
    fromDate: row.fromDate ?? '',
    toDate: row.toDate ?? '',
    featureName: row.featureName ?? '',
    channelId: row.channelId ?? '',
    reportedUsers: row.users,
    toolInvoked: row.toolInvoked ?? '',
    knowledgeSources: row.knowledgeSources ?? '',
    llmModel: row.llmModel ?? '',
    billedCredits: row.billedCredits,
    nonBilledCredits: row.nonBilledCredits,
    totalCredits: row.billedCredits + row.nonBilledCredits,
  })), [insights.detailRecords, agent.name]);
  const safeName = agent.name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'agent';

  return (
    <BasicDataGrid
      key={`${agent.id}:${range.key}`}
      title="Recent usage records"
      subtitle="Weekly agent activity and credit consumption"
      columns={columns}
      records={insights.detailRecords}
      getRecordId={(row) => row.id}
      actions={(
        <ExportButton
          data={exportData}
          columns={exportColumns}
          filename={`${safeName}-usage`}
          iconOnly={false}
          label="Export"
        />
      )}
      pageSize={10}
      showSearch
      searchPlaceholder="Search usage records"
      emptyMessage="No usage records are available for this period."
      searchEmptyMessage="No usage records match your search."
      cardClassName={mergeClasses(surfaceStyles.section, styles.gridCard)}
      headerClassName={styles.gridHeader}
      minimumGridWidth="1180px"
    />
  );
}
