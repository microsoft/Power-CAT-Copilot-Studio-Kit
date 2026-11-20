import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { makeStyles, tokens, Card, CardHeader, Subtitle2, Caption1, Button, Spinner } from '@fluentui/react-components';
import { ArrowRight16Regular, PeopleSearch24Regular } from '@fluentui/react-icons';
import { useAgentsTable } from '../../hooks/useAgentsTable';
import { PAGE_SIZE_DASHBOARD_AGENTS_PREVIEW } from '../../contracts/constants';
import { AgentsGrid } from '../agents/AgentsGrid';
import { DEFAULT_AGENT_SORT, sortAgentRows } from '../agents/agentGridUtils';
import { EmptyState } from '../shared/EmptyState';

const useStyles = makeStyles({
  card: { padding: 0, gap: 0, overflow: 'hidden' },
  header: {
    paddingTop: tokens.spacingVerticalL,
    paddingLeft: tokens.spacingHorizontalL,
    paddingRight: tokens.spacingHorizontalL,
    paddingBottom: tokens.spacingVerticalS,
  },
  footer: {
    display: 'block',
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    color: tokens.colorNeutralForeground3,
  },
  center: { display: 'flex', justifyContent: 'center', padding: tokens.spacingVerticalXXL },
  body: { paddingLeft: tokens.spacingHorizontalL, paddingRight: tokens.spacingHorizontalL },
});

/** Overview agent summary: the Agents grid limited to the top 5 agents by status priority (OV-10). */
export function AgentSummaryPreview() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { data, isLoading } = useAgentsTable();

  const total = data?.length ?? 0;
  const topRows = useMemo(
    () => sortAgentRows(data ?? [], DEFAULT_AGENT_SORT).slice(0, PAGE_SIZE_DASHBOARD_AGENTS_PREVIEW),
    [data],
  );

  return (
    <Card className={styles.card}>
      <CardHeader
        className={styles.header}
        header={<Subtitle2 as="h3">Agent summary</Subtitle2>}
        action={
          <Button
            appearance="subtle"
            size="small"
            icon={<ArrowRight16Regular />}
            iconPosition="after"
            onClick={() => navigate('/conversation-analyzer?tab=agents')}
          >
            View all
          </Button>
        }
      />
      {isLoading ? (
        <div className={styles.center}><Spinner size="small" label="Loading agents..." /></div>
      ) : topRows.length === 0 ? (
        <EmptyState
          icon={<PeopleSearch24Regular />}
          title="No agents to show."
          description="Sync agents from Agent Inventory to see them here."
          minHeight="160px"
        />
      ) : (
        <>
          <div className={styles.body}>
            <AgentsGrid rows={topRows} sortState={DEFAULT_AGENT_SORT} ariaLabel="Agent summary" />
          </div>
          <Caption1 className={styles.footer}>{`Showing ${topRows.length} of ${total.toLocaleString()} agents`}</Caption1>
        </>
      )}
    </Card>
  );
}
