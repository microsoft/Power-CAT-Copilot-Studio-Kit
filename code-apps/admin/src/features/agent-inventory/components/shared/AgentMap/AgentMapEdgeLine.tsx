import {
  Caption1,
  makeStyles,
  mergeClasses,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useInternalNode,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import type { AgentMapEdge } from './AgentMap.types';
import { floatingEdgePoints } from './floatingEdgeGeometry';

export type AgentMapFlowEdge = Edge<{ mapEdge: AgentMapEdge; dimmed: boolean }, 'agentMapEdge'>;

const useStyles = makeStyles({
  label: {
    position: 'absolute',
    maxWidth: '132px',
    ...shorthands.padding(tokens.spacingVerticalXXS, tokens.spacingHorizontalXS),
    ...shorthands.borderRadius(tokens.borderRadiusSmall),
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground2,
    boxShadow: tokens.shadow2,
    pointerEvents: 'none',
    textAlign: 'center',
  },
  selected: {
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
});

function dashPattern(style: AgentMapEdge['style']) {
  if (style === 'dashed') return '8 5';
  if (style === 'dotted') return '2 4';
  return undefined;
}

/** Render a labelled relationship that connects directly to radial node borders. */
export function AgentMapEdgeLine(props: EdgeProps<AgentMapFlowEdge>) {
  const styles = useStyles();
  const sourceNode = useInternalNode(props.source);
  const targetNode = useInternalNode(props.target);
  if (!props.data) return null;

  const floating = sourceNode?.measured?.width && targetNode?.measured?.width
    ? floatingEdgePoints(
        {
          x: sourceNode.internals.positionAbsolute.x,
          y: sourceNode.internals.positionAbsolute.y,
          width: sourceNode.measured.width,
          height: sourceNode.measured.height ?? 0,
        },
        {
          x: targetNode.internals.positionAbsolute.x,
          y: targetNode.internals.positionAbsolute.y,
          width: targetNode.measured.width,
          height: targetNode.measured.height ?? 0,
        },
      )
    : undefined;

  const [path, labelX, labelY] = getBezierPath({
    sourceX: floating?.source.x ?? props.sourceX,
    sourceY: floating?.source.y ?? props.sourceY,
    sourcePosition: floating?.source.position ?? props.sourcePosition,
    targetX: floating?.target.x ?? props.targetX,
    targetY: floating?.target.y ?? props.targetY,
    targetPosition: floating?.target.position ?? props.targetPosition,
    curvature: 0.2,
  });

  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        markerEnd={props.markerEnd}
        interactionWidth={44}
        style={{
          stroke: props.selected ? tokens.colorBrandStroke1 : tokens.colorNeutralStrokeAccessible,
          strokeWidth: props.selected ? 3 : props.data.dimmed ? 1 : 1.75,
          strokeDasharray: dashPattern(props.data.mapEdge.style),
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          opacity: props.data.dimmed ? 0.24 : 1,
        }}
      />
      {(props.selected || props.data.mapEdge.style !== 'solid') && !props.data.dimmed && (
        <EdgeLabelRenderer>
          <Caption1
            className={mergeClasses(styles.label, props.selected && styles.selected)}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {props.data.mapEdge.label}
          </Caption1>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
