import {
  Component,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Caption1, makeStyles, shorthands, tokens } from '@fluentui/react-components';
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { AgentMapData } from './AgentMap.types';
import { agentMapCategoryLabel } from './agentMapCategory';
import { createRadialAgentMapLayout } from './createRadialAgentMapLayout';
import { AgentMapNodeCard, type AgentMapFlowNode } from './AgentMapNodeCard';
import { AgentMapEdgeLine, type AgentMapFlowEdge } from './AgentMapEdgeLine';

const nodeTypes = { agentMapNode: AgentMapNodeCard };
const edgeTypes = { agentMapEdge: AgentMapEdgeLine };
const fitViewOptions = { padding: 0.18, duration: 0 };
const proOptions = { hideAttribution: true };
const ariaLabelConfig = {
  'node.a11yDescription.keyboardDisabled':
    'Press Enter or Space to select this component. Press Escape to clear the selection.',
  'edge.a11yDescription.default':
    'Press Enter or Space to select this relationship. Press Escape to clear the selection.',
};

const useStyles = makeStyles({
  canvas: {
    width: '100%',
    height: '600px',
    minWidth: 0,
    overflow: 'hidden',
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
    backgroundColor: tokens.colorNeutralBackground1,
    backgroundImage: `
      radial-gradient(60% 55% at 34% 42%, color-mix(in srgb, ${tokens.colorPaletteBerryBorderActive} 16%, transparent) 0%, transparent 70%),
      radial-gradient(52% 50% at 62% 38%, color-mix(in srgb, ${tokens.colorBrandBackground} 14%, transparent) 0%, transparent 72%),
      radial-gradient(58% 55% at 50% 72%, color-mix(in srgb, ${tokens.colorPaletteTealBorderActive} 12%, transparent) 0%, transparent 72%)
    `,
    backgroundRepeat: 'no-repeat',
    '@media (max-width: 1023px)': { height: '520px' },
    '@media (max-width: 639px)': { height: '440px' },
    '& .react-flow__node:focus-visible, & .react-flow__edge:focus-visible': {
      outline: `2px solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: '2px',
    },
    '& .react-flow__edge:focus-visible .react-flow__edge-path': {
      stroke: `${tokens.colorStrokeFocus2} !important`,
      strokeWidth: '3px !important',
    },
    '& .react-flow__controls': {
      boxShadow: tokens.shadow4,
      ...shorthands.borderRadius(tokens.borderRadiusMedium),
      overflow: 'hidden',
    },
    '& .react-flow__controls-button': {
      width: '28px',
      height: '28px',
      backgroundColor: tokens.colorNeutralBackground1,
      color: tokens.colorNeutralForeground1,
    },
    '@media (prefers-contrast)': { backgroundImage: 'none' },
  },
  legend: {
    width: 'max-content',
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalXS),
    ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow4,
  },
  legendTitle: { color: tokens.colorNeutralForeground2 },
  legendRow: {
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap(tokens.spacingHorizontalS),
  },
  legendLine: {
    width: '24px',
    flexShrink: 0,
    borderTopWidth: '2px',
    borderTopColor: tokens.colorNeutralStrokeAccessible,
  },
});

interface AgentMapCanvasProps {
  data: AgentMapData;
  matchedNodeIds: ReadonlySet<string>;
  matchedEdgeIds: ReadonlySet<string>;
  selectedId?: string;
  onSelect: (id?: string) => void;
  onCanvasError: () => void;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  onError: () => void;
}

class CanvasErrorBoundary extends Component<ErrorBoundaryProps, { failed: boolean }> {
  public state = { failed: false };

  public static getDerivedStateFromError() {
    return { failed: true };
  }

  public componentDidCatch() {
    this.props.onError();
  }

  public render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function AgentMapCanvas({
  data,
  matchedNodeIds,
  matchedEdgeIds,
  selectedId,
  onSelect,
  onCanvasError,
}: AgentMapCanvasProps) {
  const styles = useStyles();
  const positions = useMemo(() => createRadialAgentMapLayout(data.nodes), [data.nodes]);
  const nodeLabels = useMemo(
    () => new Map(data.nodes.map(node => [node.id, node.label])),
    [data.nodes],
  );
  const initialNodes = useMemo<AgentMapFlowNode[]>(() => data.nodes.map(node => ({
    id: node.id,
    type: 'agentMapNode',
    position: positions.get(node.id) ?? { x: 0, y: 0 },
    data: { mapNode: node, dimmed: !matchedNodeIds.has(node.id) },
    selectable: true,
    draggable: true,
    deletable: false,
    ariaRole: 'button',
    ariaLabel: [
      node.label,
      agentMapCategoryLabel(node.category),
      node.status && node.status !== 'default' ? `${node.status} status` : undefined,
    ].filter(Boolean).join(', '),
  })), [data.nodes, matchedNodeIds, positions]);
  const initialEdges = useMemo<AgentMapFlowEdge[]>(() => data.edges.map(edge => ({
    id: edge.id,
    type: 'agentMapEdge',
    source: edge.source,
    target: edge.target,
    data: { mapEdge: edge, dimmed: !matchedEdgeIds.has(edge.id) },
    focusable: true,
    selectable: true,
    deletable: false,
    ariaRole: 'button',
    ariaLabel: `${edge.label || 'Relationship'} from ${nodeLabels.get(edge.source) || edge.source} to ${nodeLabels.get(edge.target) || edge.target}`,
    markerEnd: edge.directed === false
      ? undefined
      : {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: tokens.colorNeutralStrokeAccessible,
        },
  })), [data.edges, matchedEdgeIds, nodeLabels]);
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);

  const renderedNodes = useMemo(() => nodes.map(node => ({
    ...node,
    selected: node.id === selectedId,
    domAttributes: { ...node.domAttributes, 'aria-pressed': node.id === selectedId },
  })), [nodes, selectedId]);
  const renderedEdges = useMemo(() => edges.map(edge => ({
    ...edge,
    selected: edge.id === selectedId,
    domAttributes: { ...edge.domAttributes, 'aria-pressed': edge.id === selectedId },
  })), [edges, selectedId]);

  const handleNodesChange = (changes: NodeChange<AgentMapFlowNode>[]) => {
    setNodes(current => applyNodeChanges(changes, current));
  };
  const handleEdgesChange = (changes: EdgeChange<AgentMapFlowEdge>[]) => {
    setEdges(current => applyEdgeChanges(changes, current));
  };
  return (
    <CanvasErrorBoundary onError={onCanvasError}>
      <div className={styles.canvas} aria-label="Interactive agent architecture map">
        <ReactFlowProvider>
          <ReactFlow
            aria-label="Interactive agent architecture map"
            nodes={renderedNodes}
            edges={renderedEdges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={fitViewOptions}
            proOptions={proOptions}
            nodesDraggable
            nodesConnectable={false}
            elementsSelectable
            deleteKeyCode={null}
            ariaLabelConfig={ariaLabelConfig}
            onNodeClick={(_, node) => onSelect(node.id)}
            onEdgeClick={(_, edge) => onSelect(edge.id)}
            onPaneClick={() => onSelect(undefined)}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
            <Panel position="top-left" className={styles.legend}>
              <Caption1 className={styles.legendTitle}>Relationship evidence</Caption1>
              <span className={styles.legendRow}>
                <span className={styles.legendLine} aria-hidden="true" />
                <Caption1>Configured on the agent</Caption1>
              </span>
              {data.edges.some(edge => edge.style === 'dashed') && (
                <span className={styles.legendRow}>
                  <span className={styles.legendLine} style={{ borderTopStyle: 'dashed' }} aria-hidden="true" />
                  <Caption1>Delegated relationship</Caption1>
                </span>
              )}
              {data.edges.some(edge => edge.style === 'dotted') && (
                <span className={styles.legendRow}>
                  <span className={styles.legendLine} style={{ borderTopStyle: 'dotted' }} aria-hidden="true" />
                  <Caption1>Triggered relationship</Caption1>
                </span>
              )}
            </Panel>
            <Controls showInteractive={false} />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </CanvasErrorBoundary>
  );
}
