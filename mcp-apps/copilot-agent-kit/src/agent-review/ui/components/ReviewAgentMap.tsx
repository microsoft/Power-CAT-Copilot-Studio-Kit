import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  Badge, Button, Caption1, MessageBar, MessageBarBody, Text, makeStyles, mergeClasses, shorthands, tokens,
} from '@fluentui/react-components';
import { ArrowMaximizeRegular, DismissRegular } from '@fluentui/react-icons';
import type { XYPosition } from '@xyflow/react';
import { AgentMapCanvas, AgentMapCanvasBoundary } from '../../../widgets/agent-map/AgentMapCanvas.js';
import { AgentMapInspector, type AgentMapSelection } from '../../../widgets/agent-map/AgentMapInspector.js';
import { AgentMapList } from '../../../widgets/agent-map/AgentMapList.js';
import { AgentMapToolbar } from '../../../widgets/agent-map/AgentMapToolbar.js';
import { AGENT_MAP_PROVENANCE_LABELS } from '../../../widgets/agent-map/agentMapLabels.js';
import {
  toAgentMapViewGraph,
  type AgentMapFilters,
  type AgentMapViewEdge,
  type AgentMapViewGraph,
} from '../../../widgets/agent-map/agentMapViewModel.js';
import {
  createDefaultFilters, filterAgentMapGraph, restoreSavedCategories, revealCategory,
} from '../../../widgets/agent-map/filterAgentMapGraph.js';
import { updateMovedNodePosition } from '../../../widgets/agent-map/agentMapNodeState.js';
import { getNodeFindingBadge, isRootAgentNode, type NodeFindingBadge } from '../../../widgets/agent-map/nodeFindings.js';
import { REVIEW_MAP_FILTER_DEFAULTS_VERSION, type ReviewMapNavigation } from '../contracts.js';
import type { FindingView, ReviewAgentMapView, ReviewSummaryView, ReviewViewModel } from './viewTypes.js';
import { SummaryRail } from './SummaryRail.js';

/** The inline topic chip sits 8px above the map bottom and is 20px tall; the map fit keeps nodes above it. */
const TOPIC_CHIP_MAP_INSET_PX = 28;

const useStyles = makeStyles({
  root: {
    minWidth: 0, display: 'flex', flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalM),
    ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalM),
  },
  context: {
    minWidth: 0, display: 'flex', flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalXS),
    overflowWrap: 'anywhere',
  },
  split: {
    display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px',
    alignItems: 'start', minWidth: 0,
    ...shorthands.gap(tokens.spacingHorizontalM),
    '@media (max-width: 1199px)': { gridTemplateColumns: 'minmax(0, 1fr)' },
  },
  canvas: {
    minWidth: 0, height: '520px',
    '@media (max-width: 767px)': { height: '360px' },
    '> *': { height: '100%' },
  },
  content: { minWidth: 0 },
  // Inline, the map fills the height that the host gives the result. Nothing shows below it.
  inlineRoot: {
    position: 'relative', minWidth: 0, minHeight: 0,
    flexGrow: 1, flexShrink: 1, flexBasis: 'auto',
    display: 'flex', flexDirection: 'column',
  },
  inlineMessage: { ...shorthands.margin(tokens.spacingVerticalS, tokens.spacingHorizontalM, '0') },
  mapBox: {
    position: 'relative', minWidth: 0, minHeight: '220px',
    flexGrow: 1, flexShrink: 1, flexBasis: '360px',
    overflowX: 'hidden', overflowY: 'hidden',
  },
  mapFill: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    '> *': { height: '100%' },
  },
  canvasFailed: {
    position: 'absolute', top: tokens.spacingVerticalS, right: tokens.spacingHorizontalS, left: tokens.spacingHorizontalS,
    zIndex: 5, display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
    ...shorthands.gap(tokens.spacingVerticalS),
  },
  topicChip: {
    alignSelf: 'flex-start',
    ...shorthands.margin(tokens.spacingVerticalS, tokens.spacingHorizontalM, '0'),
  },
  topicChipOnMap: {
    position: 'absolute', left: tokens.spacingHorizontalS, bottom: tokens.spacingVerticalS, zIndex: 5,
    ...shorthands.margin('0'),
  },
  overlay: {
    position: 'absolute', top: '8px', right: '8px', zIndex: 10,
    width: 'min(320px, calc(100% - 16px))', maxHeight: 'calc(100% - 16px)', boxSizing: 'border-box',
    display: 'flex', flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalS),
    ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
    overflowX: 'hidden', overflowY: 'hidden',
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
    boxShadow: tokens.shadow16,
    ':focus-visible': {
      outlineWidth: '2px', outlineStyle: 'solid', outlineColor: tokens.colorStrokeFocus2, outlineOffset: '1px',
    },
  },
  overlayHeader: {
    display: 'flex', alignItems: 'flex-start', minWidth: 0,
    ...shorthands.gap(tokens.spacingHorizontalS),
  },
  overlayTitle: { flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' },
  truncate: { minWidth: 0, overflowX: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  clamp: {
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
    overflowX: 'hidden', overflowY: 'hidden', overflowWrap: 'anywhere',
  },
  overlayActions: {
    display: 'flex', flexWrap: 'wrap', alignItems: 'center',
    ...shorthands.gap(tokens.spacingHorizontalS),
  },
});

interface Props {
  map?: ReviewAgentMapView;
  topicReviews?: ReviewViewModel['topicReviews'];
  findings: FindingView[];
  summary: ReviewSummaryView;
  showSummary?: boolean;
  active: boolean;
  navigation?: ReviewMapNavigation;
  onNavigationChange?: (navigation: ReviewMapNavigation) => void;
  /**
   * A node that opens findings was selected: a node with linked findings, or the root agent.
   * Other nodes are only selected.
   */
  onActivateNode: (nodeId: string, navigation: ReviewMapNavigation) => void;
  onOpenFinding: (findingId: string) => void;
  onViewAllFindings: () => void;
  /** Inline only: true while the host can show the result in fullscreen. */
  fullscreenAvailable?: boolean;
  /** Inline only: show the saved review in fullscreen. */
  onOpenFullscreen?: () => void;
}

type SavedFilters = ReviewMapNavigation['filters'];

function serializeFilters(filters: AgentMapFilters): SavedFilters {
  return {
    query: filters.query,
    categories: [...filters.categories],
    provenances: [...filters.provenances],
    includeUnresolved: filters.includeUnresolved,
    defaultsVersion: REVIEW_MAP_FILTER_DEFAULTS_VERSION,
  };
}

/**
 * Saved filters without the defaults marker come from releases that showed evaluation sets and
 * test cases by default. Their saved default becomes the current default. Marked filters are a
 * maker choice and stay unchanged, also when they equal an earlier default.
 */
function restoreFilters(saved: SavedFilters | undefined): AgentMapFilters {
  if (!saved) return createDefaultFilters();
  return {
    query: saved.query,
    categories: saved.defaultsVersion === REVIEW_MAP_FILTER_DEFAULTS_VERSION
      ? new Set(saved.categories)
      : restoreSavedCategories(saved.categories),
    provenances: new Set(saved.provenances),
    includeUnresolved: saved.includeUnresolved,
  };
}

/** Show the categories that a selected node or relationship needs. It returns the same filters when nothing changes. */
function revealSelection(
  filters: AgentMapFilters,
  selection: AgentMapSelection,
  graph: AgentMapViewGraph | undefined,
): AgentMapFilters {
  if (!selection || !graph) return filters;
  const categoryOf = (id: string) => graph.nodes.find(node => node.id === id)?.category;
  if (selection.type === 'node') return revealCategory(filters, categoryOf(selection.id));
  const edge = graph.edges.find(item => item.id === selection.id);
  return edge ? revealCategory(revealCategory(filters, categoryOf(edge.source)), categoryOf(edge.target)) : filters;
}

export function ReviewAgentMap({
  map, topicReviews = [], findings, summary, showSummary = true, active, navigation, onNavigationChange, onActivateNode, onOpenFinding,
  fullscreenAvailable = false, onOpenFullscreen,
}: Props) {
  const styles = useStyles();
  const graph = useMemo(() => map?.state === 'ready' ? toAgentMapViewGraph(map.graph) : undefined, [map]);
  const [view, setView] = useState<'map' | 'list'>(navigation?.view ?? 'map');
  const [selection, setSelection] = useState<AgentMapSelection>(navigation?.selection ?? null);
  const [filters, setFilters] = useState<AgentMapFilters>(
    () => revealSelection(restoreFilters(navigation?.filters), navigation?.selection ?? null, graph),
  );
  const [movedPositions, setMovedPositions] = useState<ReadonlyMap<string, XYPosition>>(
    () => new Map(navigation?.movedPositions ?? []),
  );
  const [focusVersion, setFocusVersion] = useState(0);
  const [resetVersion, setResetVersion] = useState(0);
  const [canvasError, setCanvasError] = useState<string>();
  // Inline details of the relationship that the maker opened. A saved view never restores them.
  const [overlay, setOverlay] = useState<AgentMapSelection>(null);
  const activator = useRef<HTMLElement | SVGElement | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const focusOverlay = useRef(false);
  const selectionRef = useRef(selection);
  const shownFullscreen = useRef(showSummary);
  const filtered = useMemo(() => graph ? filterAgentMapGraph(graph, filters) : undefined, [filters, graph]);
  // A node with linked findings shows their count. It and the root agent open the findings on selection.
  const findingBadges = useMemo(() => {
    const badges = new Map<string, NodeFindingBadge>();
    for (const node of graph?.nodes ?? []) {
      const badge = getNodeFindingBadge(findings, node);
      if (badge) badges.set(node.id, badge);
    }
    return badges;
  }, [findings, graph]);
  const rootNodeIds = useMemo(
    () => new Set((graph?.nodes ?? []).filter(isRootAgentNode).map(node => node.id)),
    [graph],
  );

  useEffect(() => {
    onNavigationChange?.({ view, selection, filters: serializeFilters(filters), movedPositions: [...movedPositions] });
  }, [filters, movedPositions, onNavigationChange, selection, view]);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  // A saved selection can need a category that is hidden by default. Show it when its graph arrives.
  useEffect(() => {
    setFilters(previous => revealSelection(previous, selectionRef.current, graph));
  }, [graph]);

  // Inline details are transient. A return from fullscreen shows the clean map.
  useEffect(() => {
    if (shownFullscreen.current === showSummary) return;
    const leftFullscreen = shownFullscreen.current && !showSummary;
    shownFullscreen.current = showSummary;
    focusOverlay.current = false;
    setOverlay(null);
    if (leftFullscreen) setSelection(null);
  }, [showSummary]);

  useEffect(() => {
    if (!active) setOverlay(null);
  }, [active]);

  // A keyboard selection moves focus into its details.
  useEffect(() => {
    if (!focusOverlay.current || !overlayRef.current) return;
    focusOverlay.current = false;
    overlayRef.current.focus();
  });

  const selectNode = useCallback((id: string, element: HTMLElement | SVGElement | null = null, focus = true) => {
    activator.current = element;
    const nextSelection: AgentMapSelection = { type: 'node', id };
    const nextFilters = revealSelection(filters, nextSelection, graph);
    const nextNavigation: ReviewMapNavigation = {
      view, selection: nextSelection, filters: serializeFilters(nextFilters), movedPositions: [...movedPositions],
    };
    if (nextFilters !== filters) setFilters(nextFilters);
    setSelection(nextSelection);
    // A node has no inline details card. A selected node closes the relationship details.
    if (!showSummary) {
      focusOverlay.current = false;
      setOverlay(null);
    }
    if (focus) setFocusVersion(value => value + 1);
    onNavigationChange?.(nextNavigation);
    if (findingBadges.has(id) || rootNodeIds.has(id)) onActivateNode(id, nextNavigation);
  }, [filters, findingBadges, graph, movedPositions, onActivateNode, onNavigationChange, rootNodeIds, showSummary, view]);
  const selectEdge = useCallback((id: string, element: HTMLElement | SVGElement | null = null, focus = true) => {
    activator.current = element;
    const nextSelection: AgentMapSelection = { type: 'edge', id };
    setFilters(previous => revealSelection(previous, nextSelection, graph));
    setSelection(nextSelection);
    if (!showSummary) {
      focusOverlay.current = focus;
      setOverlay(nextSelection);
    }
    if (focus) setFocusVersion(value => value + 1);
  }, [graph, showSummary]);
  const clear = useCallback(() => {
    focusOverlay.current = false;
    setSelection(null);
    setOverlay(null);
    activator.current?.focus();
  }, []);
  const positionChanged = useCallback((id: string, position: XYPosition) => {
    setMovedPositions(previous => updateMovedNodePosition(previous, id, position));
  }, []);
  const diagramFailed = useCallback((error: Error) => {
    setCanvasError(error.message);
    setView('list');
  }, []);
  const reset = useCallback(() => {
    setFilters(createDefaultFilters());
    setSelection(null);
    setOverlay(null);
    setMovedPositions(new Map());
    setCanvasError(undefined);
    setResetVersion(value => value + 1);
  }, []);

  const topicIncomplete = topicReviews.some(review => review.status !== 'complete');
  const topicChip = (className: string) => (
    <Badge className={className} appearance="tint" color="warning" shape="rounded">Topic evaluation incomplete</Badge>
  );
  const topicStatus = topicReviews.length > 0 && (
    <section className={styles.context} aria-label="Standard topic evaluations">
      {topicIncomplete && (
        <MessageBar intent="warning">
          <MessageBarBody>Standard topic evaluation is incomplete. Read each component status below.</MessageBarBody>
        </MessageBar>
      )}
      {topicReviews.map(review => (
        <div className={styles.context} key={review.componentIdUnique}>
          <Caption1>{review.name} ({review.componentKind}): {review.status}</Caption1>
          {review.summary && <Caption1>{review.summary}</Caption1>}
          {review.reason && <Caption1>{review.reason}</Caption1>}
          {review.validationIssues.map((issue, index) => (
            <Caption1 key={`${issue.code}:${index}`}>{issue.code}: {issue.message}</Caption1>
          ))}
        </div>
      ))}
    </section>
  );

  if (!graph || !filtered || map?.state !== 'ready') {
    const reason = map?.state === 'unavailable' ? map.reason : 'The agent map is not available for this saved review.';
    if (!showSummary) {
      return (
        <div className={styles.inlineRoot} role="region" aria-label="Saved agent map">
          <MessageBar intent="warning" className={styles.inlineMessage}>
            <MessageBarBody>{reason}</MessageBarBody>
          </MessageBar>
          {topicIncomplete && topicChip(styles.topicChip)}
        </div>
      );
    }
    return (
      <div className={styles.root}>
        <MessageBar intent="warning">
          <MessageBarBody>{reason}</MessageBarBody>
        </MessageBar>
        {topicStatus}
        {active && <SummaryRail summary={summary} />}
      </div>
    );
  }

  const canvas = (
    <AgentMapCanvasBoundary onError={diagramFailed} resetKey={resetVersion}>
      <AgentMapCanvas
        graph={filtered}
        expanded
        frameless={!showSummary}
        legend={showSummary ? 'panel' : 'toggle'}
        inline={!showSummary}
        inlineBottomInset={!showSummary && topicIncomplete ? TOPIC_CHIP_MAP_INSET_PX : 0}
        selectedNodeId={selection?.type === 'node' ? selection.id : undefined}
        selectedEdgeId={selection?.type === 'edge' ? selection.id : undefined}
        movedPositions={movedPositions}
        nodeFindingBadges={findingBadges}
        allFindingsNodeIds={rootNodeIds}
        onNodePositionChange={positionChanged}
        onSelectNode={selectNode}
        onSelectEdge={selectEdge}
        onClearSelection={clear}
      />
    </AgentMapCanvasBoundary>
  );

  if (!showSummary) {
    const overlayEdge = overlay?.type === 'edge' ? graph.edges.find(edge => edge.id === overlay.id) : undefined;
    const canOpenFullscreen = fullscreenAvailable && onOpenFullscreen ? onOpenFullscreen : undefined;
    return (
      <div className={styles.inlineRoot} role="region" aria-label="Saved agent map">
        <div className={styles.mapBox}>
          {active && !canvasError && <div className={styles.mapFill}>{canvas}</div>}
          {canvasError && (
            <div className={styles.canvasFailed}>
              <MessageBar intent="error" role="alert">
                <MessageBarBody>The diagram could not be drawn: {canvasError}.</MessageBarBody>
              </MessageBar>
              {canOpenFullscreen && <Button size="small" icon={<ArrowMaximizeRegular />} onClick={canOpenFullscreen}>Open full screen</Button>}
            </div>
          )}
          {topicIncomplete && topicChip(mergeClasses(styles.topicChip, styles.topicChipOnMap))}
          {overlayEdge && (
            <EdgeOverlay
              key={`edge:${overlayEdge.id}`}
              containerRef={overlayRef}
              edge={overlayEdge}
              graph={graph}
              onOpenFullscreen={canOpenFullscreen}
              onClose={clear}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {topicStatus}
      {canvasError && (
        <MessageBar intent="error" role="alert">
          <MessageBarBody>The diagram could not be drawn: {canvasError}. Use List to read the saved components.</MessageBarBody>
        </MessageBar>
      )}
      <AgentMapToolbar filters={filters} view={view} onFiltersChange={setFilters} onViewChange={setView} onReset={reset} />
      <div className={styles.split}>
        <div className={styles.content} role="tabpanel" aria-labelledby={`agent-map-view-tab-${view}`}>
          {view === 'map' && active && <div className={styles.canvas}>{canvas}</div>}
          {view === 'list' && (
            <AgentMapList
              graph={filtered}
              selectedNodeId={selection?.type === 'node' ? selection.id : undefined}
              selectedEdgeId={selection?.type === 'edge' ? selection.id : undefined}
              onSelectNode={selectNode}
              onSelectEdge={selectEdge}
            />
          )}
        </div>
        <AgentMapInspector
          graph={graph} selection={selection} focusVersion={focusVersion}
          onClear={clear} onSelectNode={selectNode} onSelectEdge={selectEdge}
          findings={findings} onOpenFinding={onOpenFinding}
          idleContent={active ? <SummaryRail summary={summary} /> : undefined}
        />
      </div>
    </div>
  );
}

interface OverlayFrameProps {
  containerRef: RefObject<HTMLDivElement>;
  title: string;
  caption: string;
  onClose: () => void;
  children: ReactNode;
}

function OverlayFrame({ containerRef, title, caption, onClose, children }: OverlayFrameProps) {
  const styles = useStyles();
  return (
    <div ref={containerRef} className={styles.overlay} role="group" aria-label="Map selection details" tabIndex={-1}>
      <div className={styles.overlayHeader}>
        <div className={styles.overlayTitle}>
          <Text weight="semibold" className={styles.truncate} title={title}>{title}</Text>
          <Caption1 className={styles.truncate}>{caption}</Caption1>
        </div>
        <Button appearance="subtle" size="small" icon={<DismissRegular />} aria-label="Close details" onClick={onClose} />
      </div>
      {children}
    </div>
  );
}

function EdgeOverlay({ containerRef, edge, graph, onOpenFullscreen, onClose }: {
  containerRef: RefObject<HTMLDivElement>;
  edge: AgentMapViewEdge;
  graph: AgentMapViewGraph;
  onOpenFullscreen?: () => void;
  onClose: () => void;
}) {
  const styles = useStyles();
  const label = (id: string) => graph.nodes.find(node => node.id === id)?.label ?? id;
  return (
    <OverlayFrame
      containerRef={containerRef}
      title={`${label(edge.source)} ${edge.directed ? '→' : '↔'} ${label(edge.target)}`}
      caption={edge.relationship}
      onClose={onClose}
    >
      <Caption1>{AGENT_MAP_PROVENANCE_LABELS[edge.provenance]}</Caption1>
      {edge.evidence && <Caption1 className={styles.clamp}>{edge.evidence}</Caption1>}
      {onOpenFullscreen && (
        <div className={styles.overlayActions}>
          <Button size="small" icon={<ArrowMaximizeRegular />} onClick={onOpenFullscreen}>Open full screen</Button>
        </div>
      )}
    </OverlayFrame>
  );
}
