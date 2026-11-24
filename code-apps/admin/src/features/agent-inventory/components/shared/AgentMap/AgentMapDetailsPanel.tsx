import {
  Badge,
  Body1,
  Body1Strong,
  Button,
  Caption1,
  Card,
  CardFooter,
  makeStyles,
  shorthands,
  Subtitle2,
  tokens,
} from '@fluentui/react-components';
import { ArrowDownRegular, BotRegular, DismissRegular } from '@fluentui/react-icons';
import type { AgentMapData, AgentMapEdge, AgentMapNode } from './AgentMap.types';
import { AgentMapCategoryIcon } from './AgentMapCategoryIcon';
import { agentMapCategoryColor, agentMapCategoryLabel } from './agentMapCategory';

interface AgentMapDetailsPanelProps {
  data: AgentMapData;
  selection?: AgentMapNode | AgentMapEdge;
  onClose: () => void;
}

const useStyles = makeStyles({
  root: {
    minWidth: 0,
    height: '100%',
    alignSelf: 'stretch',
    boxSizing: 'border-box',
    ...shorthands.padding(tokens.spacingVerticalL),
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalL),
    overflowX: 'hidden',
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow2,
  },
  body: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalM),
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shorthands.gap(tokens.spacingHorizontalM),
  },
  summaryHeader: {
    paddingBottom: tokens.spacingVerticalS,
  },
  headerBadge: {
    whiteSpace: 'nowrap',
  },
  nodeHero: {
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap(tokens.spacingHorizontalM),
    paddingBottom: tokens.spacingVerticalM,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  nodeIcon: {
    width: '44px',
    height: '44px',
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: tokens.colorNeutralForegroundOnBrand,
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
    '& > svg': {
      width: '24px',
      height: '24px',
    },
  },
  identity: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalXS),
  },
  title: {
    overflowWrap: 'anywhere',
  },
  badges: {
    display: 'flex',
    flexWrap: 'wrap',
    ...shorthands.gap(tokens.spacingHorizontalXS),
  },
  description: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalXS),
  },
  detailLabel: {
    color: tokens.colorNeutralForeground3,
  },
  metadataSection: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalS),
  },
  metadataGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
  },
  metadataItem: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalXS),
    ...shorthands.padding(tokens.spacingVerticalM, 0),
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  metadataValue: {
    overflowWrap: 'anywhere',
  },
  relationshipHero: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalXS),
  },
  endpoint: {
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap(tokens.spacingHorizontalM),
    ...shorthands.padding(tokens.spacingVerticalS, 0),
  },
  endpointIcon: {
    width: '40px',
    height: '40px',
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: tokens.colorNeutralForegroundOnBrand,
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    '& > svg': {
      width: '22px',
      height: '22px',
    },
  },
  connector: {
    minHeight: '36px',
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap(tokens.spacingHorizontalM),
    ...shorthands.padding(0, tokens.spacingHorizontalS),
  },
  connectorRail: {
    width: '36px',
    height: '36px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectorLine: {
    width: '2px',
    height: '12px',
    backgroundColor: tokens.colorNeutralStroke1,
    borderRadius: tokens.borderRadiusCircular,
  },
  connectorArrow: {
    width: '16px',
    height: '16px',
    marginTop: '-2px',
    color: tokens.colorNeutralForeground2,
  },
  relationshipExplanation: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalS),
    paddingTop: tokens.spacingVerticalM,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  explanationText: {
    color: tokens.colorNeutralForeground2,
  },
  agentSummary: {
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap(tokens.spacingHorizontalM),
    paddingBottom: tokens.spacingVerticalM,
  },
  agentIcon: {
    width: '40px',
    height: '40px',
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: tokens.colorNeutralForegroundOnBrand,
    backgroundColor: tokens.colorBrandBackground,
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
    '& > svg': {
      width: '22px',
      height: '22px',
    },
  },
  agentLabel: {
    color: tokens.colorBrandForeground2,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  summary: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    ...shorthands.gap(tokens.spacingHorizontalS),
  },
  summaryItem: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalXS),
    ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalM),
    backgroundColor: tokens.colorNeutralBackground2,
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
  },
  summaryValue: {
    color: tokens.colorBrandForeground1,
  },
  summaryLabel: {
    color: tokens.colorNeutralForeground2,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalS),
  },
  sectionHeading: {
    color: tokens.colorNeutralForeground2,
  },
  distributionRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...shorthands.gap(tokens.spacingHorizontalM),
    ...shorthands.padding(tokens.spacingVerticalS, 0),
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  distributionCount: {
    minWidth: '24px',
    justifyContent: 'center',
  },
  hint: {
    color: tokens.colorNeutralForeground2,
  },
  footer: {
    marginTop: 'auto',
    ...shorthands.padding(0),
  },
});

function isNode(selection: AgentMapNode | AgentMapEdge): selection is AgentMapNode {
  return 'category' in selection;
}

function formatMetadataLabel(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, character => character.toUpperCase());
}

function statusColor(status: AgentMapNode['status'] | AgentMapEdge['status']) {
  if (status === 'error') return 'danger' as const;
  if (status === 'warning') return 'warning' as const;
  return 'success' as const;
}

export function AgentMapDetailsPanel({
  data,
  selection,
  onClose,
}: AgentMapDetailsPanelProps) {
  const styles = useStyles();
  const primaryAgent = data.nodes.find(node => node.category === 'agent');
  const visibleCategories = new Set(data.nodes.map(node => node.category)).size;
  const categorySummary = Array.from(
    data.nodes.reduce((counts, node) => {
      counts.set(node.category, (counts.get(node.category) ?? 0) + 1);
      return counts;
    }, new Map<AgentMapNode['category'], number>()),
  ).sort(([left], [right]) => left.localeCompare(right));
  const selectedEdge = selection && !isNode(selection) ? selection : undefined;
  const sourceNode = selectedEdge ? data.nodes.find(node => node.id === selectedEdge.source) : undefined;
  const targetNode = selectedEdge ? data.nodes.find(node => node.id === selectedEdge.target) : undefined;
  const relationshipVerb = selectedEdge?.label
    ? selectedEdge.label.charAt(0).toLocaleLowerCase() + selectedEdge.label.slice(1)
    : 'connects to';

  return (
    <Card className={styles.root} appearance="outline">
      <div className={`${styles.header} ${selection ? '' : styles.summaryHeader}`}>
        <Subtitle2 as="h2">
          {selection
            ? isNode(selection) ? 'Component details' : 'Relationship details'
            : 'Map summary'}
        </Subtitle2>
        {selection ? (
          <Button
            appearance="subtle"
            icon={<DismissRegular />}
            aria-label="Close details"
            onClick={onClose}
          />
        ) : (
          <Badge className={styles.headerBadge} appearance="outline">
            {data.nodes.length} components
          </Badge>
        )}
      </div>

      {selection ? (
        <div className={styles.body}>
          {isNode(selection) ? (
            <>
              <div className={styles.nodeHero}>
                <span
                  className={styles.nodeIcon}
                  style={{ backgroundColor: agentMapCategoryColor(selection.category) }}
                  aria-hidden="true"
                >
                  <AgentMapCategoryIcon category={selection.category} />
                </span>
                <div className={styles.identity}>
                  <Body1Strong className={styles.title}>{selection.label}</Body1Strong>
                  <div className={styles.badges}>
                    <Badge appearance="filled" color="brand">
                      {agentMapCategoryLabel(selection.category)}
                    </Badge>
                    {selection.status && selection.status !== 'default' && (
                      <Badge appearance="tint" color={statusColor(selection.status)}>
                        {selection.status}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              {selection.description && (
                <div className={styles.description}>
                  <Caption1 className={styles.detailLabel}>About this component</Caption1>
                  <Body1>{selection.description}</Body1>
                </div>
              )}
              {selection.metadata && Object.keys(selection.metadata).length > 0 && (
                <MetadataSection metadata={selection.metadata} styles={styles} />
              )}
            </>
          ) : (
            <>
              <div className={styles.relationshipHero}>
                <Endpoint node={sourceNode} fallback={selection.source} prefix="From" styles={styles} />
                <div className={styles.connector}>
                  <span className={styles.connectorRail} aria-hidden="true">
                    <span className={styles.connectorLine} />
                    <ArrowDownRegular className={styles.connectorArrow} />
                  </span>
                  <Badge appearance="outline">{selection.label || 'Connected to'}</Badge>
                  {selection.status && selection.status !== 'default' && (
                    <Badge appearance="tint" color={statusColor(selection.status)}>
                      {selection.status}
                    </Badge>
                  )}
                </div>
                <Endpoint node={targetNode} fallback={selection.target} prefix="To" styles={styles} />
              </div>
              <div className={styles.relationshipExplanation}>
                <Body1Strong>How this connection works</Body1Strong>
                <Body1 className={styles.explanationText}>
                  <strong>{sourceNode?.label ?? selection.source}</strong>{' '}
                  {relationshipVerb}{' '}
                  <strong>{targetNode?.label ?? selection.target}</strong> as part of the
                  agent&apos;s configured workflow.
                </Body1>
              </div>
              {selection.metadata && Object.keys(selection.metadata).length > 0 && (
                <MetadataSection metadata={selection.metadata} styles={styles} />
              )}
            </>
          )}
        </div>
      ) : (
        <>
          <div className={styles.body}>
            {primaryAgent && (
              <div className={styles.agentSummary}>
                <span className={styles.agentIcon} aria-hidden="true">
                  <BotRegular />
                </span>
                <div className={styles.identity}>
                  <Caption1 className={styles.agentLabel}>Primary agent</Caption1>
                  <Body1Strong className={styles.title}>{primaryAgent.label}</Body1Strong>
                </div>
              </div>
            )}
            <div className={styles.summary}>
              <SummaryItem value={data.nodes.length} label="Components" styles={styles} />
              <SummaryItem value={data.edges.length} label="Relationships" styles={styles} />
              <SummaryItem value={visibleCategories} label="Types" styles={styles} />
            </div>
            <div className={styles.section}>
              <Body1Strong className={styles.sectionHeading}>Component distribution</Body1Strong>
              {categorySummary.map(([category, count]) => (
                <div key={category} className={styles.distributionRow}>
                  <Body1>{agentMapCategoryLabel(category)}</Body1>
                  <Badge className={styles.distributionCount} appearance="outline">{count}</Badge>
                </div>
              ))}
            </div>
          </div>
          <CardFooter className={styles.footer}>
            <Caption1 className={styles.hint}>
              Select a component or relationship on the map to inspect its details.
            </Caption1>
          </CardFooter>
        </>
      )}
    </Card>
  );
}

interface ChildProps {
  styles: ReturnType<typeof useStyles>;
}

function MetadataSection({
  metadata,
  styles,
}: ChildProps & { metadata: NonNullable<AgentMapNode['metadata']> }) {
  return (
    <div className={styles.metadataSection}>
      <Body1Strong>Properties</Body1Strong>
      <div className={styles.metadataGrid}>
        {Object.entries(metadata).map(([key, value]) => (
          <div key={key} className={styles.metadataItem}>
            <Caption1 className={styles.detailLabel}>{formatMetadataLabel(key)}</Caption1>
            <Body1Strong className={styles.metadataValue}>
              {String(value ?? 'Not specified')}
            </Body1Strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function Endpoint({
  node,
  fallback,
  prefix,
  styles,
}: ChildProps & { node?: AgentMapNode; fallback: string; prefix: 'From' | 'To' }) {
  return (
    <div className={styles.endpoint}>
      {node && (
        <span
          className={styles.endpointIcon}
          style={{ backgroundColor: agentMapCategoryColor(node.category) }}
          aria-hidden="true"
        >
          <AgentMapCategoryIcon category={node.category} />
        </span>
      )}
      <div className={styles.identity}>
        <Caption1 className={styles.detailLabel}>
          {prefix}{node ? ` · ${agentMapCategoryLabel(node.category)}` : ''}
        </Caption1>
        <Body1Strong className={styles.title}>{node?.label ?? fallback}</Body1Strong>
      </div>
    </div>
  );
}

function SummaryItem({
  value,
  label,
  styles,
}: ChildProps & { value: number; label: string }) {
  return (
    <div className={styles.summaryItem}>
      <Subtitle2 className={styles.summaryValue}>{value}</Subtitle2>
      <Caption1 className={styles.summaryLabel}>{label}</Caption1>
    </div>
  );
}
