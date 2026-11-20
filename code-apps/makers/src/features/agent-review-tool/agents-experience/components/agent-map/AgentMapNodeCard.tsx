import { memo } from 'react';
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
} from '@fluentui/react-components';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { AgentMapNode } from '../../contracts/AgentMap';
import {
  AGENT_MAP_CATEGORY_COLORS,
  agentMapNodeIcon,
  agentMapNodeIconIsBranded,
  getAgentMapNodeTypeLabel,
} from './agentMapPresentation';

export interface AgentMapFlowNodeData extends Record<string, unknown> {
  mapNode: AgentMapNode;
  dimmed: boolean;
}

export type AgentMapFlowNode = Node<AgentMapFlowNodeData, 'agentMapNode'>;

const useStyles = makeStyles({
  surface: {
    boxSizing: 'border-box',
    width: '100%',
    height: '100%',
    minWidth: 0,
    ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    // Rounded rather than a hard pill: two-line names need a taller card, and a
    // 999px radius on a 76px box eats the corners the text needs.
    borderRadius: '20px',
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow4,
    cursor: 'pointer',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    ':hover': {
      ...shorthands.borderColor(tokens.colorNeutralStroke1Hover),
      boxShadow: tokens.shadow8,
    },
  },
  selected: {
    ...shorthands.border('2px', 'solid', tokens.colorBrandStroke1),
  },
  unresolved: {
    ...shorthands.borderColor(tokens.colorPaletteRedBorderActive),
  },
  icon: {
    width: '28px',
    height: '28px',
    minWidth: '28px',
    maxWidth: '28px',
    minHeight: '28px',
    maxHeight: '28px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
    color: tokens.colorNeutralForegroundOnBrand,
    // Squircle rather than a circle, matching the workflow designer's icon tile.
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
  },
  /** Product glyphs sit on a light tile with a theme-safe foreground. */
  iconBranded: {
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground1,
  },
  /** Fills its 28px tile; the tile is what guarantees the footprint. */
  iconImage: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    display: 'block',
  },
  /** Single row: icon, label over category, badges — so the pill stays short. */
  header: {
    width: '100%',
    minWidth: 0,
    // CardHeader lays out as a grid; without minWidth:0 on the text cell the
    // long-name column refuses to shrink and the label truncates even when
    // there is room to wrap.
    '& > *': { minWidth: 0 },
  },
  /**
   * Wrap to two lines rather than truncating.
   *
   * Component names are frequently long file names — the previous single-line
   * ellipsis cut "ZAVA-Visual-Merchandising-Standards-v4.2.docx" to something
   * unrecognisable, and the map is the one place a maker is scanning for a name.
   */
  title: {
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    overflowWrap: 'anywhere',
    lineHeight: tokens.lineHeightBase200,
  },
  category: {
    display: 'block',
    color: tokens.colorNeutralForeground3,
    lineHeight: tokens.lineHeightBase200,
  },
  badges: {
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap(tokens.spacingHorizontalXS),
    flexShrink: 0,
  },
  handle: {
    opacity: 0,
    pointerEvents: 'none',
    // Centred rather than edge-mounted. The edge component derives its own
    // attachment point, and a handle sitting on the left or right border would
    // otherwise anchor the first paint off-route.
    left: '50%',
    top: '50%',
  },
});

/** Render one read-only React Flow node with Fluent typography, badges, icons, and tokens. */
export const AgentMapNodeCard = memo(function AgentMapNodeCard({
  data,
  selected,
}: NodeProps<AgentMapFlowNode>) {
  const styles = useStyles();
  const node = data.mapNode;
  const unresolved = node.resolution === 'unresolved';
  return (
    <>
      {/*
        Handles stay mounted because React Flow needs them to register a
        connectable node, but they are positioned at the card's centre and hidden:
        `AgentMapEdgeLine` computes its own border intersection, so a fixed
        left/right handle would only pull the line off the direct route.
      */}
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
            // Wrapped in the same fixed-size tile as a category glyph. Setting
            // width/height on the <img> alone was not enough — CardHeader's
            // image slot lets the natural size through, and a 35KB agent icon
            // then swallowed the node.
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
          description={<Caption1 className={styles.category}>{getAgentMapNodeTypeLabel(node)}</Caption1>}
          action={(data.dimmed || node.warnings.length > 0 || unresolved)
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
                </div>
              )
            : undefined}
        />
      </Card>
      <Handle className={styles.handle} type="source" position={Position.Right} />
    </>
  );
});
