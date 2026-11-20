import {
  Badge,
  Body1Strong,
  Caption1,
  Card,
  CardHeader,
  makeStyles,
  mergeClasses,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { AgentMapNode } from './AgentMap.types';
import { AgentMapCategoryIcon } from './AgentMapCategoryIcon';
import { agentMapCategoryColor, agentMapCategoryLabel } from './agentMapCategory';

export type AgentMapFlowNode = Node<{ mapNode: AgentMapNode; dimmed: boolean }, 'agentMapNode'>;

const useStyles = makeStyles({
  card: {
    width: '240px',
    height: '76px',
    boxSizing: 'border-box',
    ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    borderRadius: '20px',
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow4,
    cursor: 'pointer',
    overflow: 'hidden',
    ':hover': {
      ...shorthands.borderColor(tokens.colorNeutralStroke1Hover),
      boxShadow: tokens.shadow8,
    },
  },
  selected: {
    ...shorthands.border('2px', 'solid', tokens.colorBrandStroke1),
    boxShadow: tokens.shadow8,
  },
  agentCard: {
    width: '260px',
    height: '84px',
  },
  warning: { ...shorthands.borderColor(tokens.colorPaletteYellowBorderActive) },
  error: { ...shorthands.borderColor(tokens.colorPaletteRedBorderActive) },
  dimmed: { opacity: 0.34 },
  icon: {
    width: '28px',
    height: '28px',
    minWidth: '28px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: tokens.colorNeutralForegroundOnBrand,
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
  },
  header: {
    width: 'auto',
    minWidth: 0,
    '& > *': { minWidth: 0 },
  },
  label: {
    display: '-webkit-box',
    overflow: 'hidden',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflowWrap: 'anywhere',
    lineHeight: tokens.lineHeightBase200,
  },
  caption: {
    display: 'block',
    color: tokens.colorNeutralForeground3,
    textTransform: 'capitalize',
    lineHeight: tokens.lineHeightBase200,
  },
  handle: {
    opacity: 0,
    pointerEvents: 'none',
    left: '50%',
    top: '50%',
  },
});

export function AgentMapNodeCard({ data, selected }: NodeProps<AgentMapFlowNode>) {
  const styles = useStyles();
  const { mapNode } = data;
  return (
    <>
      <Handle className={styles.handle} type="target" position={Position.Left} />
      <Card
        appearance="outline"
        className={mergeClasses(
          styles.card,
          mapNode.category === 'agent' && styles.agentCard,
          selected && styles.selected,
          data.dimmed && styles.dimmed,
          mapNode.status === 'warning' && styles.warning,
          mapNode.status === 'error' && styles.error,
        )}
      >
        <CardHeader
          className={styles.header}
          image={(
            <span
              className={styles.icon}
              style={{ backgroundColor: agentMapCategoryColor(mapNode.category) }}
              aria-hidden="true"
            >
              <AgentMapCategoryIcon category={mapNode.category} />
            </span>
          )}
          header={<Body1Strong className={styles.label}>{mapNode.label}</Body1Strong>}
          description={(
            <Caption1 className={styles.caption}>
              {mapNode.subtitle || agentMapCategoryLabel(mapNode.category)}
              {mapNode.status && mapNode.status !== 'default' ? ` · ${mapNode.status}` : ''}
            </Caption1>
          )}
          action={data.dimmed ? <Badge appearance="outline" size="small">Search</Badge> : undefined}
        />
      </Card>
      <Handle className={styles.handle} type="source" position={Position.Right} />
    </>
  );
}
