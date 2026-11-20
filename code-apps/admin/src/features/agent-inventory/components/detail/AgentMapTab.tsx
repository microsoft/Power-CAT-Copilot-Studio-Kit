import { Component, useMemo, type ErrorInfo, type ReactNode } from 'react';
import {
  Button,
  Card,
  makeStyles,
  MessageBar,
  MessageBarBody,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import { createAgentComponentMap } from '../../data/createAgentComponentMap';
import type { AgentComponentSection } from '../../contracts/types';
import { AgentMap, type AgentMapData } from '../shared/AgentMap';
import { AgentMapList } from '../shared/AgentMap/AgentMapList';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalM),
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
    ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalM),
    backgroundColor: tokens.colorNeutralBackground1,
    border: 0,
    borderRadius: 0,
    boxShadow: 'none',
  },
});

interface AgentMapTabProps {
  agentName: string;
  sections: AgentComponentSection[];
}

interface AgentMapErrorBoundaryProps {
  data: AgentMapData;
  children: ReactNode;
}

class AgentMapErrorBoundary extends Component<
  AgentMapErrorBoundaryProps,
  { failed: boolean }
> {
  public state = { failed: false };

  public static getDerivedStateFromError() {
    return { failed: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[AgentMapErrorBoundary]', error, errorInfo);
  }

  public render() {
    if (!this.state.failed) return this.props.children;
    const nodeIds = new Set(this.props.data.nodes.map(node => node.id));
    const edgeIds = new Set(this.props.data.edges.map(edge => edge.id));
    return (
      <>
        <MessageBar intent="warning">
          <MessageBarBody>
            The interactive map encountered a problem. The accessible list view is available below.
          </MessageBarBody>
        </MessageBar>
        <Button appearance="primary" onClick={() => this.setState({ failed: false })}>
          Retry map
        </Button>
        <AgentMapList
          data={this.props.data}
          matchedNodeIds={nodeIds}
          matchedEdgeIds={edgeIds}
          onSelect={() => undefined}
        />
      </>
    );
  }
}

export default function AgentMapTab({
  agentName,
  sections,
}: AgentMapTabProps) {
  const styles = useStyles();
  const data = useMemo(
    () => createAgentComponentMap(agentName, sections),
    [agentName, sections],
  );

  return (
    <Card className={styles.root}>
      <AgentMapErrorBoundary data={data}>
        <AgentMap data={data} ariaLabel={`Components for ${agentName}`} />
      </AgentMapErrorBoundary>
    </Card>
  );
}
