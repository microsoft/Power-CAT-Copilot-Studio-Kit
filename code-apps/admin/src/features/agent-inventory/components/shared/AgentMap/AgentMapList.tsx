import {
  Badge,
  Body1Strong,
  Button,
  Caption1,
  makeStyles,
  mergeClasses,
  shorthands,
  Subtitle2,
  tokens,
} from '@fluentui/react-components';
import { ArrowRight16Regular } from '@fluentui/react-icons';
import type { AgentMapData } from './AgentMap.types';
import { AgentMapCategoryIcon } from './AgentMapCategoryIcon';
import {
  AGENT_MAP_CATEGORY_GROUPS,
  agentMapCategoryColor,
  agentMapCategoryLabel,
} from './agentMapCategory';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalL),
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalS),
  },
  sectionHeading: {
    margin: 0,
  },
  groups: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalM),
  },
  group: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalXS),
  },
  groupHeading: {
    margin: 0,
    color: tokens.colorNeutralForeground1,
  },
  groupFrame: {
    overflow: 'hidden',
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(0),
    ...shorthands.margin(0),
    ...shorthands.padding(0),
    listStyleType: 'none',
    '& > li + li': {
      borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke3}`,
    },
  },
  item: {
    width: '100%',
    minHeight: '52px',
    ...shorthands.padding(tokens.spacingVerticalXS, tokens.spacingHorizontalM),
    justifyContent: 'flex-start',
    textAlign: 'left',
    borderRadius: 0,
  },
  selected: {
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorNeutralForeground1,
  },
  dimmed: {
    opacity: 0.4,
  },
  nodeContent: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
  icon: {
    flex: '0 0 auto',
    minWidth: '24px',
    width: '24px',
    height: '24px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    flex: '1 1 0',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  itemTitle: {
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  caption: { color: tokens.colorNeutralForeground3 },
  relationshipFrame: {
    overflow: 'hidden',
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
  },
  relationshipItem: {
    width: '100%',
    minHeight: '52px',
    ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
    justifyContent: 'flex-start',
    textAlign: 'left',
    borderRadius: 0,
  },
  relationshipContent: {
    width: '100%',
    minWidth: 0,
    display: 'grid',
    gridTemplateColumns: 'minmax(140px, 1fr) minmax(120px, auto) minmax(140px, 1fr) auto',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    '@media (max-width: 700px)': {
      gridTemplateColumns: 'minmax(0, 1fr) auto',
    },
  },
  relationshipNode: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  relationshipType: {
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground2,
    '@media (max-width: 700px)': {
      justifyContent: 'flex-start',
      gridColumn: '1 / -1',
      gridRow: 2,
    },
  },
  relationshipTarget: {
    '@media (max-width: 700px)': {
      gridColumn: '1 / -1',
      gridRow: 3,
    },
  },
  relationshipBadge: {
    justifySelf: 'end',
  },
});

interface AgentMapListProps {
  data: AgentMapData;
  matchedNodeIds: ReadonlySet<string>;
  matchedEdgeIds: ReadonlySet<string>;
  selectedId?: string;
  onSelect: (id: string) => void;
}

export function AgentMapList({
  data,
  matchedNodeIds,
  matchedEdgeIds,
  selectedId,
  onSelect,
}: AgentMapListProps) {
  const styles = useStyles();
  const componentGroups = AGENT_MAP_CATEGORY_GROUPS.map(group => ({
    ...group,
    nodes: data.nodes.filter(node => node.category === group.category),
  })).filter(group => group.nodes.length > 0);
  const nodesById = new Map(data.nodes.map(node => [node.id, node]));

  return (
    <div className={styles.root}>
      <section className={styles.section} aria-labelledby="agent-map-nodes-heading">
        <Subtitle2 as="h3" id="agent-map-nodes-heading" className={styles.sectionHeading}>
          Components
        </Subtitle2>
        <div className={styles.groups}>
          {componentGroups.map(group => {
            const headingId = `agent-map-group-${group.category}`;
            return (
              <section key={group.category} className={styles.group} aria-labelledby={headingId}>
                <Body1Strong as="h4" id={headingId} className={styles.groupHeading}>
                  {agentMapCategoryLabel(group.category)} ({group.nodes.length})
                </Body1Strong>
                <div className={styles.groupFrame}>
                  <ul className={styles.list}>
                    {group.nodes.map(node => (
                      <li key={node.id}>
                        <Button
                          className={mergeClasses(
                            styles.item,
                            selectedId === node.id && styles.selected,
                            !matchedNodeIds.has(node.id) && styles.dimmed,
                          )}
                          appearance="subtle"
                          onClick={() => onSelect(node.id)}
                          aria-pressed={selectedId === node.id}
                        >
                          <span className={styles.nodeContent}>
                            <span
                              className={styles.icon}
                              style={{ color: agentMapCategoryColor(node.category) }}
                              aria-hidden="true"
                            >
                              <AgentMapCategoryIcon category={node.category} />
                            </span>
                            <span className={styles.itemText}>
                              <Body1Strong className={styles.itemTitle}>{node.label}</Body1Strong>
                              {(node.subtitle || (node.status && node.status !== 'default')) && (
                                <Caption1 className={styles.caption}>
                                  {[node.subtitle, node.status !== 'default' ? node.status : undefined]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </Caption1>
                              )}
                            </span>
                          </span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            );
          })}
        </div>
      </section>
      <section className={styles.section} aria-labelledby="agent-map-edges-heading">
        <Subtitle2 as="h3" id="agent-map-edges-heading" className={styles.sectionHeading}>
          Relationships
        </Subtitle2>
        <div className={styles.relationshipFrame}>
          <ul className={styles.list}>
            {data.edges.map(edge => {
              const source = nodesById.get(edge.source);
              const target = nodesById.get(edge.target);
              const relationshipContext = target?.category === 'agent'
                ? 'Starts the agent'
                : source?.category === 'agent'
                  ? 'Configured on the agent'
                  : 'Related component';
              return (
                <li key={edge.id}>
                  <Button
                    className={mergeClasses(
                      styles.relationshipItem,
                      selectedId === edge.id && styles.selected,
                      !matchedEdgeIds.has(edge.id) && styles.dimmed,
                    )}
                    appearance="subtle"
                    onClick={() => onSelect(edge.id)}
                    aria-pressed={selectedId === edge.id}
                  >
                    <span className={styles.relationshipContent}>
                      <Body1Strong className={styles.relationshipNode}>
                        {source?.label ?? edge.source}
                      </Body1Strong>
                      <span className={styles.relationshipType}>
                        <ArrowRight16Regular aria-hidden="true" />
                        <Caption1>{edge.label || 'Related to'}</Caption1>
                      </span>
                      <Body1Strong className={mergeClasses(
                        styles.relationshipNode,
                        styles.relationshipTarget,
                      )}>
                        {target?.label ?? edge.target}
                      </Body1Strong>
                      <Badge className={styles.relationshipBadge} appearance="outline" size="small">
                        {relationshipContext}
                      </Badge>
                    </span>
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </div>
  );
}
