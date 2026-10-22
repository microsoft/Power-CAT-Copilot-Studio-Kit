import { memo } from "react";
import { Caption1, makeStyles, shorthands, tokens } from "@fluentui/react-components";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useInternalNode,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import type { AgentMapViewEdge } from "./agentMapViewModel";
import { floatingEdgePoints } from "./floatingEdgeGeometry";
import {
  agentMapProvenanceColor,
  agentMapProvenanceDash,
} from "./agentMapPresentation";

export interface AgentMapFlowEdgeData extends Record<string, unknown> {
  mapEdge: AgentMapViewEdge;
  dimmed: boolean;
}

export type AgentMapFlowEdge = Edge<AgentMapFlowEdgeData, "agentMapEdge">;

const useStyles = makeStyles({
  label: {
    position: "absolute",
    maxWidth: "132px",
    ...shorthands.padding(tokens.spacingVerticalXXS, tokens.spacingHorizontalXS),
    ...shorthands.borderRadius(tokens.borderRadiusSmall),
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground2,
    boxShadow: tokens.shadow2,
    pointerEvents: "none",
    textAlign: "center",
  },
  selected: {
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
});

/** Render an evidence-styled React Flow relationship and its plain-language label. */
export const AgentMapEdgeLine = memo(function AgentMapEdgeLine(
  props: EdgeProps<AgentMapFlowEdge>,
) {
  const styles = useStyles();
  const {
    id,
    source,
    target,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerEnd,
    selected,
    data,
  } = props;

  // Live node geometry, so the endpoints follow a node while it is dragged.
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  if (!data) return null;

  // Float the endpoints when both node boxes are measured; fall back to the
  // handle-based coordinates on the first render, before measurement.
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
    sourceX: floating?.source.x ?? sourceX,
    sourceY: floating?.source.y ?? sourceY,
    sourcePosition: floating?.source.position ?? sourcePosition,
    targetX: floating?.target.x ?? targetX,
    targetY: floating?.target.y ?? targetY,
    targetPosition: floating?.target.position ?? targetPosition,
    curvature: data.mapEdge.provenance === "structural" ? 0.15 : 0.3,
  });
  const edge = data.mapEdge;
  const color = edge.resolution === "unresolved"
    ? tokens.colorPaletteRedBorderActive
    : agentMapProvenanceColor(edge.provenance);
  const showLabel = selected || edge.provenance !== "structural";
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={44}
        style={{
          stroke: color,
          strokeWidth: selected
            ? 3
            : data.dimmed
              ? 1
              : edge.provenance === "structural"
                ? 1.5
                : 2.25,
          strokeDasharray: agentMapProvenanceDash(edge.provenance),
        }}
      />
      {showLabel && (
        <EdgeLabelRenderer>
          <Caption1
            className={selected ? `${styles.label} ${styles.selected}` : styles.label}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              opacity: 1,
            }}
          >
            {edge.relationship}
          </Caption1>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
