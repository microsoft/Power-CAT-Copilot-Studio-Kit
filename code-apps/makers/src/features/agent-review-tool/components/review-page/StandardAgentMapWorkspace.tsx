import { useMemo } from 'react';
import {
  MessageBar,
  MessageBarBody,
  Spinner,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { buildStandardAgentMapGraph } from '../../adapters/buildStandardAgentMapGraph';
import type { LocalStageAOutput } from '../../contracts/StageOutputs';
import type { ReviewAgentMapTarget } from '../../contracts/ReviewResult';
import { AgentMapTab } from '../../agents-experience/components/agent-map/AgentMapTab';

const useStyles = makeStyles({
  loading: {
    display: 'flex',
    justifyContent: 'center',
    padding: tokens.spacingVerticalXXL,
  },
  unavailable: {
    margin: tokens.spacingVerticalM,
  },
});

export interface StandardAgentMapWorkspaceProps {
  agentId: string;
  agentName: string;
  resultIdentity: string;
  stageA: LocalStageAOutput | null;
  rootIconBase64?: string;
  connectedAgentTargets?: readonly ReviewAgentMapTarget[];
  isLoading: boolean;
}

/** Render a local-only Standard map from the saved Stage A snapshot. */
export function StandardAgentMapWorkspace({
  agentId,
  agentName,
  resultIdentity,
  stageA,
  rootIconBase64,
  connectedAgentTargets,
  isLoading,
}: StandardAgentMapWorkspaceProps) {
  const styles = useStyles();
  const graph = useMemo(
    () => stageA && stageA.configurationAvailable !== false
      ? buildStandardAgentMapGraph({
          stageA,
          rootIconBase64,
          connectedAgentTargets,
        })
      : null,
    [connectedAgentTargets, rootIconBase64, stageA],
  );

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <Spinner label="Loading saved architecture..." />
      </div>
    );
  }

  if (!stageA || stageA.configurationAvailable === false || !graph) {
    return (
      <MessageBar intent="info" className={styles.unavailable}>
        <MessageBarBody>
          Architecture is unavailable because this review does not contain a readable source
          snapshot.
        </MessageBarBody>
      </MessageBar>
    );
  }

  return (
    <AgentMapTab
      key={resultIdentity}
      agentId={agentId}
      agentName={agentName}
      graph={graph}
      description="Explore the components and relationships saved with this review."
      note="Relationships use saved component identities. No live data was loaded."
      emptyMessage="No components were retained in this saved review."
    />
  );
}
