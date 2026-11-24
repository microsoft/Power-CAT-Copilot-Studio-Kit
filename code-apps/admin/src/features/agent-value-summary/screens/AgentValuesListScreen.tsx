/**
 * AgentValuesListScreen — Agent Value records behind an Agent Value Summary KPI.
 *
 * Reuses the Agent Inventory "All agents" experience (page chrome, filter
 * banner with Clear filter, a grid with Edit columns, search and
 * export). Agent names open the agent in Copilot Studio in a new tab.
 *
 * Route: `/agent-value-summary?view=agents&valueFilter=<kind>&…` (see agentValueFilter.ts).
 * Without a filter, every active Agent Value record is listed.
 */
import { Fragment, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Breadcrumb,
  BreadcrumbButton,
  BreadcrumbDivider,
  BreadcrumbItem,
  Button,
  Link,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { ArrowDownload24Regular, DismissRegular } from '@fluentui/react-icons';
// Agent Value Summary's own copy of the Agent Inventory grid (its own Fluent column panel);
// grid types are imported unchanged from Agent Inventory.
import { AgentValueDataGrid } from '../components/grid/AgentValueDataGrid';
import type {
  GridChoiceOption,
  GridColumnDefinition,
  GridSort,
} from '../../agent-inventory/components/shared/AdvancedDataGrid';
import {
  buildCopilotStudioAgentOverviewUrl,
  getConfiguredCopilotStudioBaseUrl,
} from '../../../shared/services/copilotStudioUrl';
import { useAgentValues } from '../hooks/useAgentValues';
import { useAgentDetails } from '../hooks/useAgentDetails';
import {
  buildAgentValueListRows,
  clearDrillthroughParams,
  describeDrillthrough,
  isInventoryDrillthrough,
  parseDrillthroughParams,
} from '../services/agentValueFilter';
import type { AgentValueListRow, AgentValueRecord } from '../contracts/types';

const useStyles = makeStyles({
  root: {
    width: '100%',
    minHeight: '100vh',
    boxSizing: 'border-box',
    background: `radial-gradient(124.48% 109.39% at 26.98% 6.02%, ${tokens.colorNeutralBackground1} 0%, ${tokens.colorNeutralBackground1} 37.08%, ${tokens.colorBrandBackground2} 100%)`,
  },
  chrome: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalL,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalXXL}`,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    '@media (max-width: 600px)': {
      alignItems: 'flex-start',
      flexDirection: 'column',
      padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    },
  },
  chromeActions: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    '@media (max-width: 600px)': {
      marginLeft: 0,
    },
  },
  breadcrumbButton: {
    minWidth: 'unset',
    paddingLeft: tokens.spacingHorizontalXS,
    paddingRight: tokens.spacingHorizontalXS,
    border: 'none',
    backgroundColor: 'transparent',
  },
  content: {
    width: '100%',
    boxSizing: 'border-box',
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalXXL} ${tokens.spacingVerticalXXL}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    overflowX: 'hidden',
    '@media (max-width: 600px)': {
      padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM} ${tokens.spacingVerticalL}`,
    },
  },
  filterBanner: {
    marginBottom: tokens.spacingVerticalM,
  },
  nameLink: {
    fontWeight: tokens.fontWeightSemibold,
    // Anchor links inherit the grid's smaller font; match Agent Inventory's Name link (fontSizeBase300).
    fontSize: tokens.fontSizeBase300,
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
  visuallyHidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    margin: '-1px',
    padding: 0,
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
});

/** Default order: by agent name. */
const DEFAULT_SORT: GridSort = { columnId: 'name', direction: 'ascending' };

const AGENT_VALUE_SUMMARY_PATH = '/agent-value-summary';

function formatDate(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
}

/** Distinct, sorted, non-blank values of a column, used as grid choice filters. */
function choiceOptions(rows: AgentValueListRow[], pick: (row: AgentValueListRow) => string): GridChoiceOption[] {
  const values = Array.from(new Set(rows.map(pick).filter((v) => v.trim() !== '')));
  return values.sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value }));
}

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';

type FormattedField =
  | 'statecode'
  | 'statuscode'
  | '_ownerid_value'
  | '_owningbusinessunit_value'
  | '_createdby_value'
  | '_createdonbehalfby_value'
  | '_modifiedby_value'
  | '_modifiedonbehalfby_value';

/** Display text of a choice or lookup on an Agent Value record (blank when not returned). */
function formattedValue(record: AgentValueRecord | undefined, field: FormattedField): string {
  return record?.[`${field}${FORMATTED}`] ?? '';
}

/**
 * The other Agent Value (cat_agentvalue) table columns, hidden by default and offered in
 * Add columns. Blank for unclassified agents. Ids are prefixed so they stay unique.
 */
function agentValueRecordColumns(textCell: (value: string) => ReactNode): GridColumnDefinition<AgentValueListRow>[] {
  const text = (
    columnId: string,
    label: string,
    pick: (record: AgentValueRecord | undefined) => string,
    idealWidth = 200,
  ): GridColumnDefinition<AgentValueListRow> => ({
    columnId: `agentValue_${columnId}`,
    label,
    dataType: 'text',
    defaultVisible: false,
    minWidth: 120,
    idealWidth,
    getValue: (row) => pick(row.valueRecord),
    renderCell: (row) => textCell(pick(row.valueRecord)),
  });
  const date = (
    columnId: string,
    label: string,
    pick: (record: AgentValueRecord | undefined) => string | undefined,
  ): GridColumnDefinition<AgentValueListRow> => ({
    columnId: `agentValue_${columnId}`,
    label,
    dataType: 'date',
    defaultVisible: false,
    minWidth: 120,
    idealWidth: 150,
    getValue: (row) => pick(row.valueRecord) ?? '',
    renderCell: (row) => textCell(formatDate(pick(row.valueRecord))),
  });
  return [
    text('agentDescription', 'Agent description', (r) => r?.cat_agentdescription ?? '', 280),
    text('agentInstructions', 'Agent instructions', (r) => r?.cat_agentinstructions ?? '', 280),
    text('agentId', 'Agent ID', (r) => r?.cat_agentid ?? '', 280),
    text('environmentId', 'Environment ID', (r) => r?.cat_environmentid ?? '', 280),
    text('status', 'Status', (r) => formattedValue(r, 'statecode'), 120),
    text('statusReason', 'Status reason', (r) => formattedValue(r, 'statuscode'), 140),
    text('owner', 'Owner', (r) => formattedValue(r, '_ownerid_value')),
    text('owningBusinessUnit', 'Owning business unit', (r) => formattedValue(r, '_owningbusinessunit_value')),
    date('createdOn', 'Created on', (r) => r?.createdon),
    text('createdBy', 'Created by', (r) => formattedValue(r, '_createdby_value')),
    text('createdByDelegate', 'Created by (delegate)', (r) => formattedValue(r, '_createdonbehalfby_value')),
    date('modifiedOn', 'Modified on', (r) => r?.modifiedon),
    text('modifiedBy', 'Modified by', (r) => formattedValue(r, '_modifiedby_value')),
    text('modifiedByDelegate', 'Modified by (delegate)', (r) => formattedValue(r, '_modifiedonbehalfby_value')),
    date('recordCreatedOn', 'Record created on', (r) => r?.overriddencreatedon),
  ];
}

/** Agent Value records (or inventory agents for inventory KPIs) behind an Agent Value Summary KPI. */
export default function AgentValuesListScreen() {
  const styles = useStyles();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const exportActionRef = useRef<(() => void) | null>(null);

  const filter = useMemo(() => parseDrillthroughParams(searchParams), [searchParams]);
  const inventoryList = isInventoryDrillthrough(filter);

  const valuesQuery = useAgentValues();
  const detailsQuery = useAgentDetails();
  const baseUrlQuery = useQuery({
    queryKey: ['copilot-studio-base-url'],
    queryFn: getConfiguredCopilotStudioBaseUrl,
    staleTime: Infinity,
    retry: 1,
  });

  const records = useMemo(() => valuesQuery.data ?? [], [valuesQuery.data]);
  const agentDetails = useMemo(() => detailsQuery.data ?? [], [detailsQuery.data]);
  const rows = useMemo(
    () => buildAgentValueListRows(filter, records, agentDetails),
    [filter, records, agentDetails],
  );

  // Inventory KPIs need Agent Details to list rows; record KPIs only use it for the designer type.
  const isLoading = valuesQuery.isPending || (inventoryList && detailsQuery.isPending);
  const error = valuesQuery.error ?? (inventoryList ? detailsQuery.error : null);
  const totalCount = inventoryList ? agentDetails.length : records.length;
  const filterLabel = filter ? describeDrillthrough(filter) : null;
  // "Number of Agents" lists every inventory agent, so there is no filter to announce.
  const bannerLabel = filter && filter.kind !== 'all-agents' ? filterLabel : null;
  const listTitle = inventoryList ? 'Agents' : 'Agent values';
  // Versioned grid ids: column choices saved while testing earlier builds are ignored,
  // so every list opens with only its default columns (optional ones stay in Add columns).
  const gridId = inventoryList ? 'agent-value-summary-agents-v2' : 'agent-value-records-v2';
  // Links wait for Agent Details so new-designer agents get the right Copilot Studio URL;
  // if it fails, the classic URL is used.
  const baseUrl = detailsQuery.isPending ? undefined : baseUrlQuery.data;
  const countText = isLoading
    ? 'Loading matching agents…'
    : `Showing ${rows.length.toLocaleString()} of ${totalCount.toLocaleString()} ${inventoryList ? 'agents' : 'agent value records'}.`;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = filterLabel
      ? `${filterLabel} | Agent Value Summary | Copilot Studio Kit`
      : 'Agent values | Agent Value Summary | Copilot Studio Kit';
    return () => { document.title = previousTitle; };
  }, [filterLabel]);

  // The triggering KPI unmounts on navigation; land keyboard/screen-reader focus on the page heading.
  useEffect(() => {
    headingRef.current?.focus();
  }, [filter]);

  const clearFilter = () => {
    setSearchParams(clearDrillthroughParams(searchParams), { replace: true });
  };

  const columns = useMemo<GridColumnDefinition<AgentValueListRow>[]>(() => {
    const textCell = (value: string) =>
      value ? value : (
        <span className={styles.muted}>
          <span aria-hidden>—</span>
          <span className={styles.visuallyHidden}>Not set</span>
        </span>
      );
    return [
      {
        columnId: 'name',
        label: 'Name',
        dataType: 'text',
        required: true,
        defaultVisible: true,
        minWidth: 160,
        idealWidth: 215,
        getValue: (row) => row.name,
        renderCell: (row) => {
          const url = baseUrl && row.environmentId && row.agentId
            ? buildCopilotStudioAgentOverviewUrl(baseUrl, row.environmentId, row.agentId, row.isGenerativeDesigner)
            : undefined;
          return url ? (
            <Link
              className={styles.nameLink}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${row.name} (opens in Copilot Studio in a new tab)`}
            >
              {row.name}
            </Link>
          ) : (
            row.name
          );
        },
      },
      {
        columnId: 'agentType',
        label: 'Agent type',
        dataType: 'choice',
        choiceOptions: choiceOptions(rows, (r) => r.agentType),
        defaultVisible: true,
        minWidth: 110,
        idealWidth: 130,
        getValue: (row) => row.agentType,
        renderCell: (row) => textCell(row.agentType),
      },
      {
        columnId: 'environmentName',
        label: 'Environment',
        dataType: 'text',
        defaultVisible: true,
        minWidth: 140,
        idealWidth: 220,
        getValue: (row) => row.environmentName,
        renderCell: (row) => textCell(row.environmentName),
      },
      {
        columnId: 'valueBenefit',
        label: 'Agent value benefit',
        dataType: 'choice',
        choiceOptions: choiceOptions(rows, (r) => r.valueBenefit),
        defaultVisible: true,
        minWidth: 150,
        idealWidth: 210,
        getValue: (row) => row.valueBenefit,
        renderCell: (row) => textCell(row.valueBenefit),
      },
      {
        columnId: 'agentBehavior',
        label: 'Agent behavior',
        dataType: 'choice',
        choiceOptions: choiceOptions(rows, (r) => r.agentBehavior),
        defaultVisible: true,
        minWidth: 110,
        idealWidth: 140,
        // Blank behaviors sort as undefined so the grid keeps unclassified agents last.
        getValue: (row) => row.agentBehavior || undefined,
        renderCell: (row) => textCell(row.agentBehavior),
      },
      {
        columnId: 'classificationDate',
        label: 'Classification date',
        dataType: 'date',
        defaultVisible: true,
        minWidth: 120,
        idealWidth: 150,
        getValue: (row) => row.classificationDate,
        renderCell: (row) => formatDate(row.classificationDate),
      },
      // Add columns: the other Agent Value table columns (hidden until added), on every list.
      ...agentValueRecordColumns(textCell),
    ];
  }, [baseUrl, rows, styles.muted, styles.nameLink, styles.visuallyHidden]);

  const breadcrumbItems = [
    { label: 'Agent Value Summary', onClick: () => navigate(AGENT_VALUE_SUMMARY_PATH) },
    { label: listTitle },
  ];

  return (
    <div className={styles.root}>
      <h1 ref={headingRef} tabIndex={-1} className={styles.visuallyHidden}>
        {filterLabel ? `${listTitle}: ${filterLabel}` : listTitle}
      </h1>
      <div role="status" aria-live="polite" aria-atomic="true" className={styles.visuallyHidden}>
        {countText}
      </div>
      <header className={styles.chrome}>
        <Breadcrumb aria-label="Breadcrumb">
          {breadcrumbItems.map((item, index) => {
            const current = index === breadcrumbItems.length - 1;
            return (
              <Fragment key={item.label}>
                {index > 0 && <BreadcrumbDivider />}
                <BreadcrumbItem>
                  <BreadcrumbButton
                    className={styles.breadcrumbButton}
                    current={current}
                    onClick={current ? undefined : item.onClick}
                  >
                    {item.label}
                  </BreadcrumbButton>
                </BreadcrumbItem>
              </Fragment>
            );
          })}
        </Breadcrumb>
        <div className={styles.chromeActions}>
          <Button
            appearance="outline"
            icon={<ArrowDownload24Regular />}
            onClick={() => exportActionRef.current?.()}
          >
            Export
          </Button>
        </div>
      </header>
      <div className={styles.content}>
        {bannerLabel && (
          <MessageBar intent="info" className={styles.filterBanner} aria-label="Active filter">
            <MessageBarBody>
              Filtered by <strong>{bannerLabel}</strong> — {countText.charAt(0).toLowerCase()}{countText.slice(1)}
            </MessageBarBody>
            <MessageBarActions>
              <Button appearance="transparent" icon={<DismissRegular />} onClick={clearFilter}>
                Clear filter
              </Button>
            </MessageBarActions>
          </MessageBar>
        )}
        <AgentValueDataGrid
          key={gridId}
          gridId={gridId}
          ariaLabel={filterLabel ?? 'Agent values'}
          title={listTitle}
          records={rows}
          columns={columns}
          getRecordKey={(row) => row.id}
          searchPlaceholder="Search name, environment, value benefit"
          isLoading={isLoading}
          error={error}
          onRetry={() => {
            void valuesQuery.refetch();
            if (inventoryList) void detailsQuery.refetch();
          }}
          emptyMessage={bannerLabel ? 'No agents match this filter.' : 'No agents have a value classification yet.'}
          noResultsMessage="No agents match the current search and filters."
          initialSort={DEFAULT_SORT}
          exportActionRef={exportActionRef}
          showToolbarExport={false}
          fillAvailableHeight
        />
      </div>
    </div>
  );
}
