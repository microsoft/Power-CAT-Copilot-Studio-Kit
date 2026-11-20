import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Button,
  makeStyles,
  Spinner,
  tokens,
} from '@fluentui/react-components';
import {
  Open16Regular,
  PersonArrowRight16Regular,
  ShieldCheckmark16Regular,
  ShieldError16Regular,
} from '@fluentui/react-icons';
import type { AgentInventoryRecord } from '../../contracts/types';
import { ReassignAgentDialog } from '../bulk-actions/ReassignAgentDialog';
import { QuarantineActionDialog, type QuarantineActionMode } from '../bulk-actions/QuarantineActionDialog';
import type { ActionCompletionSummary } from '../../services/actionCompletionService';
import { useAgentQuarantineStatus } from '../../hooks/useAgentQuarantineStatus';
import type { AgentQuarantineState } from '../../services/agentQuarantineStatusService';
import {
  buildCopilotStudioAgentOverviewUrl,
  getConfiguredCopilotStudioBaseUrl,
} from '../../../../shared/services/copilotStudioUrl';
import { AgentInventoryBreadcrumb } from '../AgentInventoryBreadcrumb';

const useStyles = makeStyles({
  root: {
    width: '100%',
    boxSizing: 'border-box',
    minHeight: '60px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalL,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalXXL}`,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    '@media (max-width: 1200px)': {
      alignItems: 'flex-start',
      flexDirection: 'column',
      padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
    },
  },
  identity: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
    minWidth: 0,
  },
  visuallyHidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    flexShrink: 0,
    '@media (max-width: 1200px)': {
      justifyContent: 'flex-start',
    },
  },
});

interface AgentDetailHeaderProps {
  agent: AgentInventoryRecord;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onNavigateDashboard: () => void;
  onNavigateAllAgents: () => void;
  onActionCompleted: (summary: ActionCompletionSummary) => void;
}

/**
 * Derives the header status badge label from the live quarantine flow result
 * (not the inventory table), falling back to the agent's published state:
 * - `quarantined` -> `Blocked`
 * - `active` -> `Available` when published, otherwise `Draft`
 * - `unavailable` or no flow response -> `NA`
 */
function deriveDisplayedStatus(
  state: AgentQuarantineState | undefined,
  isPublished: boolean,
): string {
  if (state === 'quarantined') return 'Blocked';
  if (state === 'active') return isPublished ? 'Available' : 'Draft';
  return 'NA';
}

export function AgentDetailHeader({
  agent,
  headingRef,
  onNavigateDashboard,
  onNavigateAllAgents,
  onActionCompleted,
}: AgentDetailHeaderProps) {
  const styles = useStyles();
  const [reassignOpen, setReassignOpen] = useState(false);
  const [quarantine, setQuarantine] = useState<{ open: boolean; mode: QuarantineActionMode }>({
    open: false,
    mode: 'quarantine',
  });
  const ppacMismatch = agent.hasPpacMismatch === 'yes';
  const quarantineStatusQuery = useAgentQuarantineStatus(
    agent.agentId,
    agent.environmentId,
    !ppacMismatch,
  );
  const copilotStudioBaseUrlQuery = useQuery({
    queryKey: ['copilot-studio-base-url'],
    queryFn: getConfiguredCopilotStudioBaseUrl,
    staleTime: Infinity,
    retry: 1,
  });
  const quarantineState = quarantineStatusQuery.data?.state;
  const isQuarantined = quarantineState === 'quarantined';
  const canShowQuarantine = !ppacMismatch
    && (quarantineState === 'quarantined' || quarantineState === 'active');
  const quarantineStatusLoading = !ppacMismatch && quarantineStatusQuery.isLoading;
  const displayedStatus = deriveDisplayedStatus(quarantineState, agent.published === 'yes');
  const statusColor = displayedStatus === 'Available'
    ? 'success'
    : displayedStatus === 'Blocked'
      ? 'danger'
      : displayedStatus === 'Draft'
        ? 'warning'
        : 'subtle';
  const copilotStudioBaseUrl = copilotStudioBaseUrlQuery.data;
  const viewAgentUrl = copilotStudioBaseUrl && agent.environmentId && agent.agentId
    ? buildCopilotStudioAgentOverviewUrl(
        copilotStudioBaseUrl,
        agent.environmentId,
        agent.agentId,
        agent.poweredBy === 'GitHub Copilot',
      )
    : undefined;

  return (
    <header className={styles.root}>
      <h1 ref={headingRef} tabIndex={-1} className={styles.visuallyHidden}>
        {agent.name}
      </h1>
      <div className={styles.identity}>
        <AgentInventoryBreadcrumb
          items={[
            { label: 'Agent Inventory', onClick: onNavigateDashboard },
            { label: 'All agents', onClick: onNavigateAllAgents },
            { label: agent.name },
          ]}
        />
        {quarantineStatusLoading ? (
          <Badge appearance="outline" color="subtle" shape="circular">
            Checking…
          </Badge>
        ) : (
          <Badge
            appearance={displayedStatus === 'Blocked' ? 'filled' : 'outline'}
            color={statusColor}
            shape="circular"
          >
            {displayedStatus}
          </Badge>
        )}
      </div>
      <div className={styles.actions}>
        <Button
          appearance="outline"
          icon={<PersonArrowRight16Regular />}
          onClick={() => setReassignOpen(true)}
        >
          Reassign
        </Button>
        {quarantineStatusLoading ? (
          <Button appearance="outline" disabled icon={<Spinner size="tiny" />}>
            Checking status…
          </Button>
        ) : canShowQuarantine ? (
          <Button
            appearance="outline"
            icon={isQuarantined ? <ShieldCheckmark16Regular /> : <ShieldError16Regular />}
            onClick={() => setQuarantine({ open: true, mode: isQuarantined ? 'unquarantine' : 'quarantine' })}
          >
            {isQuarantined ? 'Unquarantine' : 'Quarantine'}
          </Button>
        ) : null}
        {viewAgentUrl && (
          <Button
            appearance="primary"
            icon={<Open16Regular />}
            as="a"
            href={viewAgentUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            View agent
          </Button>
        )}
      </div>
      <ReassignAgentDialog
        open={reassignOpen}
        agents={[agent]}
        onClose={() => setReassignOpen(false)}
        onCompleted={(summary) => { setReassignOpen(false); onActionCompleted(summary); }}
      />
      <QuarantineActionDialog
        open={quarantine.open}
        mode={quarantine.mode}
        agents={[agent]}
        onClose={() => setQuarantine((prev) => ({ ...prev, open: false }))}
        onCompleted={(summary) => {
          setQuarantine((prev) => ({ ...prev, open: false }));
          onActionCompleted(summary);
        }}
      />
    </header>
  );
}
