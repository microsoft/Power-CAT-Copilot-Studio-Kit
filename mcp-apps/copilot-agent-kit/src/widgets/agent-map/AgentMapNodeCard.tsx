import { memo } from "react";
import {
  Badge,
  Body1Strong,
  Card,
  CardHeader,
  Caption1,
  makeStyles,
  mergeClasses,
  shorthands,
  tokens,
} from "@fluentui/react-components";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { DismissCircleFilled, InfoFilled, WarningFilled } from "@fluentui/react-icons";
import type { AgentMapViewNode } from "./agentMapViewModel";
import type { NodeFindingBadge } from "./nodeFindings";
import {
  AGENT_MAP_CATEGORY_COLORS,
  agentMapNodeIcon,
  agentMapNodeIconIsBranded,
  getAgentMapNodeTypeLabel,
} from "./agentMapPresentation";

export interface AgentMapFlowNodeData extends Record<string, unknown> {
  mapNode: AgentMapViewNode;
  dimmed: boolean;
  /** Review maps only: the count of saved review findings linked to this node. */
  findingBadge?: NodeFindingBadge;
}

export type AgentMapFlowNode = Node<AgentMapFlowNodeData, "agentMapNode">;

const FINDING_BADGE_COLOR = { error: "danger", warning: "warning", info: "informative" } as const;
const FINDING_BADGE_ICON = {
  error: <DismissCircleFilled />,
  warning: <WarningFilled />,
  info: <InfoFilled />,
} as const;

const useStyles = makeStyles({
  surface: {
    boxSizing: "border-box",
    width: "100%",
    height: "100%",
    minWidth: 0,
    ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
    ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
    // Rounded rather than a hard pill: two-line names need a taller card, and a
    // 999px radius on a 76px box eats the corners the text needs.
    borderRadius: "20px",
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow4,
    cursor: "pointer",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    ":hover": {
      ...shorthands.borderColor(tokens.colorNeutralStroke1Hover),
      boxShadow: tokens.shadow8,
    },
  },
  selected: {
    ...shorthands.border("2px", "solid", tokens.colorBrandStroke1),
  },
  unresolved: {
    ...shorthands.borderColor(tokens.colorPaletteRedBorderActive),
  },
  icon: {
    width: "28px",
    height: "28px",
    minWidth: "28px",
    maxWidth: "28px",
    minHeight: "28px",
    maxHeight: "28px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    overflow: "hidden",
    color: tokens.colorNeutralForegroundOnBrand,
    // Squircle rather than a circle, matching the workflow designer's icon tile.
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
  },
  /** Product glyphs sit on a light tile with a theme-safe foreground. */
  iconBranded: {
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground1,
  },
  iconImage: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
  },
  /** Single row: icon, label over category, badges — so the pill stays short. */
  header: {
    width: "100%",
    minWidth: 0,
    "& > *": { minWidth: 0 },
  },
  /**
   * Wrap to two lines rather than truncating. Component names are frequently
   * long file names, and the map is the one place a maker scans for a name.
   */
  title: {
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    overflowWrap: "anywhere",
    lineHeight: tokens.lineHeightBase200,
  },
  category: {
    display: "block",
    color: tokens.colorNeutralForeground3,
    lineHeight: tokens.lineHeightBase200,
  },
  badges: {
    display: "flex",
    alignItems: "center",
    ...shorthands.gap(tokens.spacingHorizontalXS),
    flexShrink: 0,
  },
  handle: {
    opacity: 0,
    pointerEvents: "none",
    // Centred rather than edge-mounted: the edge component derives its own
    // attachment point, so a fixed side handle would anchor the first paint
    // off-route.
    left: "50%",
    top: "50%",
  },
});

/** Render one read-only React Flow node with Fluent typography, badges, icons, and tokens. */
export const AgentMapNodeCard = memo(function AgentMapNodeCard({
  data,
  selected,
}: NodeProps<AgentMapFlowNode>) {
  const styles = useStyles();
  const node = data.mapNode;
  const unresolved = node.resolution === "unresolved";
  const findingBadge = data.findingBadge;
  return (
    <>
      <Handle className={styles.handle} type="target" position={Position.Left} />
      <Card
        appearance="outline"
        className={mergeClasses(
          styles.surface,
          selected && styles.selected,
          unresolved && styles.unresolved,
        )}
      >
        <CardHeader
          className={styles.header}
          image={(() => {
            if (node.iconBase64) {
              return (
                <span className={styles.icon} aria-hidden="true">
                  <img className={styles.iconImage} src={node.iconBase64} alt="" />
                </span>
              );
            }
            const branded = agentMapNodeIconIsBranded(node);
            return (
              <span
                className={mergeClasses(styles.icon, branded && styles.iconBranded)}
                style={branded
                  ? undefined
                  : { backgroundColor: AGENT_MAP_CATEGORY_COLORS[node.category] }}
                aria-hidden="true"
              >
                {agentMapNodeIcon(node)}
              </span>
            );
          })()}
          header={<Body1Strong className={styles.title}>{node.label}</Body1Strong>}
          description={(
            <Caption1 className={styles.category}>{getAgentMapNodeTypeLabel(node)}</Caption1>
          )}
          action={(data.dimmed || node.warnings.length > 0 || unresolved || findingBadge)
            ? (
                <div className={styles.badges}>
                  {data.dimmed && (
                    <Badge appearance="outline" color="informative" size="small" shape="rounded">
                      Search
                    </Badge>
                  )}
                  {node.warnings.length > 0 && (
                    <Badge appearance="tint" color="warning" size="small" shape="rounded">
                      {node.warnings.length}
                    </Badge>
                  )}
                  {unresolved && (
                    <Badge appearance="outline" color="danger" size="small" shape="rounded">
                      Unresolved
                    </Badge>
                  )}
                  {findingBadge && (
                    <Badge
                      appearance="filled"
                      color={FINDING_BADGE_COLOR[findingBadge.severity]}
                      size="small"
                      shape="rounded"
                      icon={FINDING_BADGE_ICON[findingBadge.severity]}
                      title={findingBadge.label}
                      data-finding-severity={findingBadge.severity}
                    >
                      {findingBadge.count}
                    </Badge>
                  )}
                </div>
              )
            : undefined}
        />
      </Card>
      <Handle className={styles.handle} type="source" position={Position.Right} />
    </>
  );
});
