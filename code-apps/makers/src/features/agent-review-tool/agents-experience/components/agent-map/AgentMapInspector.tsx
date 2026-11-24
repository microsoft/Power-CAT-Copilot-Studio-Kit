import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  Badge,
  Body1Strong,
  Caption1,
  Subtitle2,
  Button,
  Card,
  CardFooter,
  CardHeader,
  Divider,
  MessageBar,
  MessageBarBody,
  Spinner,
  Text,
  makeStyles,
  mergeClasses,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import { CursorClickRegular, DismissRegular, InfoRegular } from '@fluentui/react-icons';
import type {
  AgentMapDiagnostic,
  AgentMapGraph,
} from '../../contracts/AgentMap';
import {
  AGENT_MAP_PROVENANCE_LABELS,
  AGENT_MAP_RESOLUTION_LABELS,
  agentMapNodeIcon,
  getAgentMapNodeTypeLabel,
} from './agentMapPresentation';
import {
  AgentMapInspectorFields,
  AgentMapInspectorSection,
} from './AgentMapInspectorParts';
import { displayAgentMapDetail } from './agentMapDetailFormatting';
import {
  formatNodeReviewSummary,
  hasAttributedFindings,
  selectNodeFindings,
} from './nodeFindings';
import type { AgentMapFinding } from './nodeFindings';
import { createFindingRowFocus } from '../findings/findingsGroupedModel';
import { severityLabel } from '../severity';

export type AgentMapSelection =
  | { type: 'node'; id: string }
  | { type: 'edge'; id: string }
  | null;

const useStyles = makeStyles({
  panel: {
    width: '360px',
    minWidth: '360px',
    alignSelf: 'start',
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
    backgroundColor: tokens.colorNeutralBackground1,
    '@media (max-width: 1199px)': {
      width: '100%',
      minWidth: 0,
    },
  },
  header: {
    display: 'flex',
    // Top-aligned, not centred. A long component name wraps to two lines, and
    // centring left the icon floating at the middle of that block, apparently
    // attached to nothing.
    alignItems: 'flex-start',
    // No gap here on purpose. CardHeader already spaces the mark from the text
    // with `margin-right: var(--fui-CardHeader--gap)` on its image slot, so a
    // gap on this row stacked on top of it and pushed the two 22px apart.
    // Fluent's 12px stands on its own.
    ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalM),
    minWidth: 0,
  },
  headerIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    // Larger than the 22px line it sits against, so the mark carries the row
    // rather than trailing it. The category glyphs ship at different intrinsic
    // sizes -- the skill glyph is 18 -- so they are normalised here, not at
    // each call site. The offset below is measured, not guessed.
    width: '28px',
    height: '28px',
    marginTop: '-3px',
    '& svg': {
      width: '20px',
      height: '20px',
    },
  },
  // Only for the fallback category glyphs. An outline glyph alone at this size
  // looks undersized and accidental; a tile gives it the same visual weight as
  // an agent's own mark. Agents are excluded because their icon is already a
  // filled tile, and a second background would frame it.
  headerIconTile: {
    backgroundColor: tokens.colorNeutralBackground3,
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
  },
  headerIconImage: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
  },
  headerText: {
    display: 'flex',
    // A wrapping row, not a column. The badge sits beside the name the way the
    // group badges sit beside their heading on the All checks tab, and drops
    // to its own line only when the name leaves no room for it.
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalS,
    rowGap: tokens.spacingVerticalXXS,
    minWidth: 0,
  },
  headerBadge: {
    // The name may wrap; the badge must not compress. "Connected agent" would
    // otherwise collapse to an unreadable sliver.
    flexShrink: 0,
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalM),
    ...shorthands.padding(0, tokens.spacingHorizontalM, tokens.spacingVerticalM),
  },
  title: {
    margin: 0,
    // Explicit so the row height is deterministic. Without it the h3 inherits
    // the document line-height, which is what made an earlier icon offset
    // measure 3px out.
    lineHeight: tokens.lineHeightBase400,
    outline: 'none',
    ':focus-visible': {
      outline: `2px solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: '2px',
    },
  },
  badges: {
    display: 'flex',
    ...shorthands.gap(tokens.spacingHorizontalXS),
    flexWrap: 'wrap',
  },
  relationship: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalXXS),
  },
  referenceList: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalXS),
  },
  referenceButton: {
    width: '100%',
    minHeight: '44px',
    height: 'auto',
    justifyContent: 'flex-start',
    textAlign: 'start',
    whiteSpace: 'normal',
    ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalS),
  },
  /** Centred empty state: an invitation, not a paragraph of caveats. */
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    ...shorthands.gap(tokens.spacingVerticalXS),
    ...shorthands.padding(tokens.spacingVerticalXXL, tokens.spacingHorizontalM),
  },
  emptyIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '44px',
    height: '44px',
    marginBottom: tokens.spacingVerticalXS,
    ...shorthands.borderRadius(tokens.borderRadiusCircular),
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground3,
    fontSize: '20px',
  },
  emptyTitle: {
    color: tokens.colorNeutralForeground1,
  },
  emptyHint: {
    color: tokens.colorNeutralForeground3,
    maxWidth: '30ch',
  },
  findingList: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalXXS),
    marginTop: tokens.spacingVerticalXS,
  },
  /** A row is a button: selecting it opens the finding on the Findings tab. */
  findingRow: {
    display: 'flex',
    alignItems: 'flex-start',
    ...shorthands.gap(tokens.spacingHorizontalS),
    ...shorthands.padding(tokens.spacingVerticalXS, tokens.spacingHorizontalXS),
    ...shorthands.border('none'),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    backgroundColor: tokens.colorTransparentBackground,
    textAlign: 'start',
    cursor: 'pointer',
    width: '100%',
    ':hover': { backgroundColor: tokens.colorSubtleBackgroundHover },
    ':disabled': { cursor: 'default', ':hover': { backgroundColor: tokens.colorTransparentBackground } },
  },
  findingText: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  findingMeta: {
    display: 'flex',
    alignItems: 'center',
    ...shorthands.gap(tokens.spacingHorizontalXS),
  },
  findingSeverity: {
    color: tokens.colorNeutralForeground2,
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    ...shorthands.padding(0, tokens.spacingHorizontalM, tokens.spacingVerticalM),
  },
});

export interface AgentMapInspectorProps {
  graph: AgentMapGraph;
  selection: AgentMapSelection;
  focusVersion: number;
  onClear: () => void;
  onSelectNode: (id: string) => void;
  onSelectEdge: (id: string) => void;
  /**
   * Rendered in place of the inspector while nothing is selected.
   *
   * The map tab hands the review summary here, so the column carries something
   * useful from the moment the tab opens instead of an empty prompt.
   */
  idleContent?: ReactNode;
  connectedAgentStatus?: {
    state: 'idle' | 'loading' | 'loaded' | 'error' | 'unavailable';
    componentCount?: number;
    message?: string;
    onRetry?: () => void;
  };
  /** Every finding in the review; attached to a node by component id. */
  findings?: readonly AgentMapFinding[];
  /** Opens this stable finding row on the Review findings tab. */
  onOpenFinding?: (findingFocus: string) => void;
}

/** Show safe snapshot details and evidence for the selected component or relationship. */
export function AgentMapInspector({
  graph,
  selection,
  focusVersion,
  onClear,
  onSelectNode,
  onSelectEdge,
  idleContent,
  connectedAgentStatus,
  findings,
  onOpenFinding,
}: AgentMapInspectorProps) {
  const styles = useStyles();
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const nodeIndex = useMemo(() => new Map(graph.nodes.map(node => [node.id, node])), [graph.nodes]);
  const edgeIndex = useMemo(() => new Map(graph.edges.map(edge => [edge.id, edge])), [graph.edges]);
  const node = selection?.type === 'node' ? nodeIndex.get(selection.id) : undefined;
  const edge = selection?.type === 'edge' ? edgeIndex.get(selection.id) : undefined;

  const allFindings = useMemo(() => findings ?? [], [findings]);
  const anyAttributed = useMemo(() => hasAttributedFindings(allFindings), [allFindings]);
  const nodeFindings = useMemo(
    () => selectNodeFindings(node, allFindings, anyAttributed),
    [node, allFindings, anyAttributed],
  );

  useEffect(() => {
    if (focusVersion > 0) headingRef.current?.focus();
  }, [focusVersion]);

  const title = node?.label ?? (edge
    ? `${nodeIndex.get(edge.source)?.label ?? edge.source} ${edge.relationship} ${nodeIndex.get(edge.target)?.label ?? edge.target}`
    : 'Details');
  const connectedEdges = node
    ? graph.edges.filter(candidate => candidate.source === node.id || candidate.target === node.id)
    : [];
  const diagnostics: AgentMapDiagnostic[] = node
    ? [
        ...graph.diagnostics.filter(item => item.sourceId === node.id),
        ...node.warnings.map((message, index) => ({
          code: `node-warning-${index}`,
          severity: 'warning' as const,
          message,
          sourceId: node.id,
        })),
      ]
    : [];

  // With nothing selected, hand the column to the caller's idle content (the
  // review summary) rather than framing an empty prompt in an inspector shell.
  if (!node && !edge && idleContent) {
    return <>{idleContent}</>;
  }

  return (
    <Card
      appearance="outline"
      className={styles.panel}
      role="region"
      aria-labelledby="agent-map-inspector-heading"
    >
      <CardHeader
        className={styles.header}
        image={(
          <span
            className={mergeClasses(
              styles.headerIcon,
              // An agent's own mark is already a filled tile; a second
              // background would frame it.
              !node?.iconBase64 && styles.headerIconTile,
            )}
            aria-hidden="true"
          >
            {node
              // An agent carries its own mark, the same one the map and the
              // list show. Falling back to the category glyph here made the
              // inspector disagree with the node the maker just clicked.
              ? (node.iconBase64
                  ? <img className={styles.headerIconImage} src={node.iconBase64} alt="" />
                  : agentMapNodeIcon(node))
              : <InfoRegular />}
          </span>
        )}
        header={(
          <div className={styles.headerText}>
            {/* The ref/tabIndex/id live on the real h3 so focus changes announce correctly. */}
            <h3
              className={styles.title}
              ref={headingRef}
              tabIndex={-1}
              id="agent-map-inspector-heading"
            >
              <Subtitle2>{title}</Subtitle2>
            </h3>
            {(node || edge) && (
              // Default size and shape, matching the group badges on the All
              // checks tab, so the same kind of label looks the same in both
              // places.
              <Badge appearance="tint" color="brand" className={styles.headerBadge}>
                {node ? getAgentMapNodeTypeLabel(node) : 'Relationship'}
              </Badge>
            )}
          </div>
        )}
      />
      <div className={styles.body}>
        {!node && !edge && (
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true">
              <CursorClickRegular />
            </span>
            <Body1Strong className={styles.emptyTitle}>Nothing selected</Body1Strong>
            <Caption1 className={styles.emptyHint}>
              Choose a component or relationship in the map to see its evidence here.
            </Caption1>
            <Caption1 className={styles.emptyHint}>
              List view offers the same detail with full keyboard navigation.
            </Caption1>
          </div>
        )}

        {node && (
          <>
            <AgentMapInspectorSection title="Summary">
              <Text>{formatNodeReviewSummary(node, nodeFindings)}</Text>
              {node.description && <Text size={200}>{node.description}</Text>}
              <div className={styles.badges}>
                <Badge appearance="tint" color="brand" shape="rounded">
                  {getAgentMapNodeTypeLabel(node)}
                </Badge>
                <Badge
                  appearance="outline"
                  color={node.resolution === 'unresolved' ? 'danger' : 'informative'}
                  shape="rounded"
                >
                  {AGENT_MAP_RESOLUTION_LABELS[node.resolution]}
                </Badge>
              </div>
            </AgentMapInspectorSection>
            {nodeFindings.findings.length > 0 && (
              <>
                <Divider />
                <AgentMapInspectorSection
                  title={`Review findings (${nodeFindings.findings.length})`}
                >
                  <div className={styles.findingList}>
                    {nodeFindings.findings.map(finding => {
                      const findingFocus = createFindingRowFocus(
                        String(allFindings.indexOf(finding)),
                      );
                      return (
                        <button
                          key={findingFocus}
                          type="button"
                          className={styles.findingRow}
                          data-finding-focus={findingFocus}
                          onClick={() => onOpenFinding?.(findingFocus)}
                          disabled={!onOpenFinding}
                          title={onOpenFinding ? 'Open on the Review findings tab' : undefined}
                        >
                          <span className={styles.findingText}>
                            <span className={styles.findingMeta}>
                              <Caption1 className={styles.findingSeverity}>
                                {severityLabel(finding.sev)}
                              </Caption1>
                            </span>
                            <Caption1>{finding.title}</Caption1>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </AgentMapInspectorSection>
              </>
            )}
            <Divider />
            <AgentMapInspectorSection title="Identity">
              <AgentMapInspectorFields rows={[
                ['Schema name', node.schemaName],
                ['Component ID', node.componentId],
                ['Unique ID', node.componentIdUnique],
                ['Parent', node.parentId ? nodeIndex.get(node.parentId)?.label ?? node.parentId : undefined],
              ]} />
            </AgentMapInspectorSection>
            {Object.keys(node.details).length > 0 && (
              <>
                <Divider />
                <AgentMapInspectorSection title="Details">
                  <AgentMapInspectorFields rows={Object.entries(node.details).map(
                    ([label, value]) => [label, displayAgentMapDetail(value)],
                  )} />
                </AgentMapInspectorSection>
              </>
            )}
            {node.category === 'connected-agent' && connectedAgentStatus && (
              <>
                <Divider />
                <AgentMapInspectorSection title="Connected agent components">
                  {connectedAgentStatus.state === 'loading' && (
                    <Spinner size="tiny" label="Loading connected-agent botcomponents" />
                  )}
                  {connectedAgentStatus.state === 'loaded' && (
                    <MessageBar intent="success" role="status">
                      <MessageBarBody>
                        Loaded {connectedAgentStatus.componentCount ?? 0} components from the source
                        environment. They are now shown in Map and List views.
                      </MessageBarBody>
                    </MessageBar>
                  )}
                  {connectedAgentStatus.state === 'error' && (
                    <MessageBar intent="error" role="alert">
                      <MessageBarBody>
                        {connectedAgentStatus.message ?? 'The connected agent could not be loaded.'}
                        {connectedAgentStatus.onRetry && (
                          <Button appearance="transparent" onClick={connectedAgentStatus.onRetry}>
                            Retry
                          </Button>
                        )}
                      </MessageBarBody>
                    </MessageBar>
                  )}
                  {connectedAgentStatus.state === 'unavailable' && (
                    <Caption1>{connectedAgentStatus.message}</Caption1>
                  )}
                  {connectedAgentStatus.state === 'idle' && (
                    <Caption1>Select this node to load its current botcomponents.</Caption1>
                  )}
                </AgentMapInspectorSection>
              </>
            )}
            <Divider />
            <AgentMapInspectorSection title={`References (${connectedEdges.length})`}>
              <div className={styles.referenceList}>
                {connectedEdges.length === 0 && <Caption1>No relationships were captured.</Caption1>}
                {connectedEdges.map(reference => (
                  <Button
                    key={reference.id}
                    appearance="subtle"
                    className={styles.referenceButton}
                    onClick={() => onSelectEdge(reference.id)}
                  >
                    <Caption1>
                      {nodeIndex.get(reference.source)?.label ?? reference.source}
                      {' '}{reference.relationship}{' '}
                      {nodeIndex.get(reference.target)?.label ?? reference.target}
                    </Caption1>
                  </Button>
                ))}
              </div>
            </AgentMapInspectorSection>
            {diagnostics.length > 0 && (
              <>
                <Divider />
                <AgentMapInspectorSection title="Diagnostics">
                  {diagnostics.map(item => (
                    <Text key={`${item.code}-${item.message}`} size={200}>{item.message}</Text>
                  ))}
                </AgentMapInspectorSection>
              </>
            )}
          </>
        )}

        {edge && (
          <>
            <AgentMapInspectorSection title="Summary">
              <div className={styles.relationship}>
                <Text weight="semibold">{nodeIndex.get(edge.source)?.label ?? edge.source}</Text>
                <Text>{edge.relationship}</Text>
                <Text weight="semibold">{nodeIndex.get(edge.target)?.label ?? edge.target}</Text>
              </div>
              <div className={styles.badges}>
                <Badge appearance="tint" color="brand" shape="rounded">
                  {AGENT_MAP_PROVENANCE_LABELS[edge.provenance]}
                </Badge>
                <Badge
                  appearance="outline"
                  color={edge.resolution === 'unresolved' ? 'danger' : 'informative'}
                  shape="rounded"
                >
                  {AGENT_MAP_RESOLUTION_LABELS[edge.resolution]}
                </Badge>
              </div>
              {edge.provenance !== 'structural' && (
                <MessageBar intent="info">
                  <MessageBarBody>
                    Inferred from authored text. The name matched one configured component, but this
                    does not prove that the skill runs this component.
                  </MessageBarBody>
                </MessageBar>
              )}
            </AgentMapInspectorSection>
            <Divider />
            <AgentMapInspectorSection title="Evidence">
              <Text>{edge.evidence}</Text>
              <AgentMapInspectorFields rows={[
                ['Provenance', AGENT_MAP_PROVENANCE_LABELS[edge.provenance]],
                [
                  edge.provenance === 'structural' ? 'Confidence' : 'Text-match strength',
                  `${Math.round(edge.confidence * 100)}%`,
                ],
                ['Source field', edge.sourceField],
              ]} />
            </AgentMapInspectorSection>
            <Divider />
            <AgentMapInspectorSection title="References">
              <Button
                appearance="subtle"
                className={styles.referenceButton}
                onClick={() => onSelectNode(edge.source)}
              >
                <Caption1>Source: {nodeIndex.get(edge.source)?.label ?? edge.source}</Caption1>
              </Button>
              <Button
                appearance="subtle"
                className={styles.referenceButton}
                onClick={() => onSelectNode(edge.target)}
              >
                <Caption1>Target: {nodeIndex.get(edge.target)?.label ?? edge.target}</Caption1>
              </Button>
            </AgentMapInspectorSection>
          </>
        )}
      </div>
      {selection && (
        <CardFooter className={styles.footer}>
          <Button appearance="subtle" icon={<DismissRegular />} onClick={onClear}>
            Clear selection
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
