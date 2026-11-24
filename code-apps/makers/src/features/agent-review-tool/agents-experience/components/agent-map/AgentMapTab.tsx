import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Button,
  Body1,
  Caption1,
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  MessageBar,
  MessageBarBody,
  Subtitle2,
  Text,
  makeStyles,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import { ArrowMinimizeRegular } from '@fluentui/react-icons';
import type { XYPosition } from '@xyflow/react';
import type { CopilotReviewDisplayPayload } from '../../../contracts/ReviewResult';
import type { AgentMapFinding } from './nodeFindings';
import type {
  AgentMapFilters,
  AgentMapGraph,
  AgentMapNode,
  AgentMapConnectedAgentSnapshot,
} from '../../contracts/AgentMap';
import {
  createDefaultFilters,
  filterAgentMapGraph,
} from '../../services/agent-map/filterAgentMapGraph';
import {
  buildAgentMapGraph,
  getCachedAgentMapGraph,
} from '../../services/agent-map/buildAgentMapGraph';
import { updateMovedNodePosition } from './agentMapNodeState';
import {
  AgentMapCanvas,
  AgentMapCanvasBoundary,
} from './AgentMapCanvas';
import {
  AgentMapInspector,
  type AgentMapInspectorProps,
  type AgentMapSelection,
} from './AgentMapInspector';
import { AgentMapList } from './AgentMapList';
import { AgentMapToolbar, type AgentMapView } from './AgentMapToolbar';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalXXL),
    ...shorthands.padding(tokens.spacingVerticalL, tokens.spacingHorizontalL),
    minWidth: 0,
  },
  intro: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalXS),
  },
  description: {
    margin: 0,
    color: tokens.colorNeutralForeground2,
  },
  note: {
    margin: 0,
    color: tokens.colorNeutralForeground3,
  },
  visuallyHidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
  split: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 360px',
    alignItems: 'start',
    ...shorthands.gap(tokens.spacingHorizontalL),
    minWidth: 0,
    '@media (max-width: 1199px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
  content: {
    minWidth: 0,
  },
  /** Near-full-screen dialog: the map is spatial, so give it the whole viewport. */
  dialogSurface: {
    maxWidth: '98vw',
    width: '98vw',
    height: '94vh',
    maxHeight: '94vh',
    ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalL),
    boxSizing: 'border-box',
  },
  /*
   * Fluent's DialogBody is a grid with its own `gridTemplateRows`, and its
   * content row does not stretch by default — which is why the map stayed at
   * its inline height inside a full-screen surface. Overriding the rows and
   * forcing `minHeight: 0` on the chain is what actually hands the height down.
   */
  dialogBody: {
    height: '100%',
    maxHeight: '100%',
    display: 'grid',
    gridTemplateRows: 'auto minmax(0, 1fr)',
    gridTemplateColumns: '1fr',
    minHeight: 0,
    ...shorthands.gap(tokens.spacingVerticalS),
  },
  dialogContent: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalS),
    minHeight: 0,
    height: '100%',
    overflow: 'hidden',
    // Fluent gives DialogContent a scroll gutter that steals width here.
    ...shorthands.padding(0),
  },
  splitExpanded: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 360px',
    // `stretch` so both columns get the dialog's height: the canvas sizes itself
    // to it, and the inspector needs it to know where to start scrolling.
    alignItems: 'stretch',
    ...shorthands.gap(tokens.spacingHorizontalL),
    minWidth: 0,
    minHeight: 0,
    height: '100%',
  },
  /** Only the panel wrapping the canvas may grow; the toolbar and status stay auto. */
  viewPanelExpanded: {
    minWidth: 0,
    minHeight: 0,
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  contentExpanded: {
    minWidth: 0,
    minHeight: 0,
    height: '100%',
    '& > *': { height: '100%' },
  },
  /**
   * Inspector column inside the full-screen dialog.
   *
   * A modal has a fixed viewport, so its detail pane must scroll internally --
   * there is no page behind it to scroll instead, and without this the panel is
   * simply clipped partway down (Identity and Details were unreachable).
   */
  inspectorExpanded: {
    minWidth: 0,
    minHeight: 0,
    height: '100%',
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  viewPanel: {
    minWidth: 0,
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    ...shorthands.gap(tokens.spacingVerticalM),
    ...shorthands.padding(tokens.spacingVerticalL),
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
  },
});

interface SharedAgentMapProps {
  agentId: string;
  agentName: string;
  orgUrl?: string | null;
  /** Shown in the details column until a component or relationship is selected. */
  idleContent?: ReactNode;
  /** Review findings, attached to nodes by component id in the inspector. */
  findings?: readonly AgentMapFinding[];
  /** Opens a finding on the Review findings tab. */
  onOpenFinding?: (findingId: string) => void;
}

interface GhcphAgentMapProps extends SharedAgentMapProps {
  payload: CopilotReviewDisplayPayload;
  graph?: never;
  description?: never;
  note?: never;
  emptyMessage?: never;
  /**
   * Reads a connected agent so the map can expand it.
   *
   * Injected rather than imported because the two live Dataverse reads this component performs are
   * the only thing in it that is app-specific: a second host renders the same map against its own
   * generated client. Left undefaulted on purpose — importing this app's hook here would drag the
   * generated Dataverse client into every module that touches this file, which is exactly what the
   * other host cannot take. Each host passes its own.
   */
  useConnectedAgent?: UseConnectedAgentMap;
  /** Fetches agent avatars, injected for the same reason as {@link useConnectedAgent}. */
  loadIcons?: LoadAgentMapIcons;
}

interface PrebuiltAgentMapProps extends SharedAgentMapProps {
  graph: AgentMapGraph;
  payload?: never;
  description: string;
  note?: string;
  emptyMessage?: string;
}

export type AgentMapTabProps = GhcphAgentMapProps | PrebuiltAgentMapProps;

/**
 * The slice of a query result the map reads, declared structurally.
 *
 * A React Query result satisfies this, and so does any other loader a host cares to write.
 */
export interface ConnectedAgentQueryResult {
  data?: AgentMapConnectedAgentSnapshot;
  isFetching: boolean;
  isError: boolean;
  error: { message: string } | null;
  refetch: () => unknown;
}

export type UseConnectedAgentMap = (
  target: { nodeId: string; schemaName: string } | null,
  orgUrl?: string | null,
) => ConnectedAgentQueryResult;

export type LoadAgentMapIcons = (
  rootAgentId: string | undefined,
  connectedSchemaNames: readonly string[],
  orgUrl?: string | null,
) => Promise<Record<string, string>>;

/** A host that supplies no loader: every connected agent draws, none expands. */
const NO_CONNECTED_AGENT: UseConnectedAgentMap = () => ({
  isFetching: false,
  isError: false,
  error: null,
  refetch: () => undefined,
});

type ConnectedAgentStatus = AgentMapInspectorProps['connectedAgentStatus'];

/** Select the correct graph source without exposing live Microsoft Copilot harness loaders to prebuilt maps. */
export function AgentMapTab(props: AgentMapTabProps) {
  return props.graph
    ? <PrebuiltAgentMapSource {...props} />
    : <GhcphAgentMapSource {...props} />;
}

function GhcphAgentMapSource({
  agentId, agentName, payload, orgUrl, idleContent, findings, onOpenFinding,
  useConnectedAgent = NO_CONNECTED_AGENT, loadIcons,
}: GhcphAgentMapProps) {
  const [connectedAgentTarget, setConnectedAgentTarget] = useState<{
    nodeId: string;
    schemaName: string;
  } | null>(null);

  // Icons are decoration fetched after first paint: the map renders immediately
  // with category glyphs and upgrades in place once they arrive.
  const [agentIcons, setAgentIcons] = useState<Record<string, string>>();
  const connectedSchemaNames = useMemo(
    () => payload.model.connectedAgents
      .map(agent => agent.botSchemaName ?? '')
      .filter(Boolean),
    [payload.model.connectedAgents],
  );
  useEffect(() => {
    if (!loadIcons) return;
    let cancelled = false;
    void loadIcons(agentId || undefined, connectedSchemaNames, orgUrl)
      .then(icons => {
        if (!cancelled && Object.keys(icons).length > 0) setAgentIcons(icons);
      });
    return () => { cancelled = true; };
  }, [agentId, connectedSchemaNames, orgUrl, loadIcons]);

  const baseGraph = useMemo(
    () => getCachedAgentMapGraph({ agentId, agentName, payload, agentIcons }),
    [agentId, agentName, payload, agentIcons],
  );
  const canLoadConnectedAgents = orgUrl !== 'zip' && useConnectedAgent !== NO_CONNECTED_AGENT;
  const connectedAgentQuery = useConnectedAgent(
    canLoadConnectedAgents ? connectedAgentTarget : null,
    orgUrl || undefined,
  );
  const connectedAgentExpansion = useMemo(() => {
    if (
      !connectedAgentTarget ||
      !connectedAgentQuery.data ||
      connectedAgentQuery.data.agentSchemaName !== connectedAgentTarget.schemaName
    ) {
      return undefined;
    }
    return {
      sourceNodeId: connectedAgentTarget.nodeId,
      snapshot: connectedAgentQuery.data,
    };
  }, [connectedAgentQuery.data, connectedAgentTarget]);
  const graph = useMemo(
    () => connectedAgentExpansion
      ? buildAgentMapGraph({
          agentId,
          agentName,
          model: payload.model,
          skillBundleReviews: payload.skillBundleReviews,
          agentIcons,
          expandedConnectedAgent: connectedAgentExpansion,
        })
      : baseGraph,
    [agentId, agentName, agentIcons, baseGraph, connectedAgentExpansion, payload],
  );
  const onSourceNodeSelected = useCallback((node: AgentMapNode) => {
    if (
      node.category === 'connected-agent'
      && node.depth === 1
      && node.targetAgentSchemaName
    ) {
      setConnectedAgentTarget({
        nodeId: node.id,
        schemaName: node.targetAgentSchemaName,
      });
    }
  }, []);
  const getConnectedAgentStatus = useCallback((node?: AgentMapNode): ConnectedAgentStatus => {
    if (node?.category !== 'connected-agent' || node.depth !== 1) return undefined;
    if (!canLoadConnectedAgents) {
      return {
        state: 'unavailable',
        message: 'ZIP reviews cannot resolve live connected agents.',
      };
    }
    if (connectedAgentTarget?.nodeId !== node.id) return { state: 'idle' };
    if (connectedAgentQuery.isFetching) return { state: 'loading' };
    if (connectedAgentQuery.isError) {
      return {
        state: 'error',
        message: connectedAgentQuery.error?.message
          ?? 'The connected agent could not be loaded.',
        onRetry: () => { void connectedAgentQuery.refetch(); },
      };
    }
    if (connectedAgentExpansion) {
      return {
        state: 'loaded',
        componentCount: connectedAgentExpansion.snapshot.model.tools.length
          + connectedAgentExpansion.snapshot.model.skills.length
          + connectedAgentExpansion.snapshot.model.knowledge.length
          + connectedAgentExpansion.snapshot.model.connectedAgents.length
          + connectedAgentExpansion.snapshot.model.triggers.length
          + connectedAgentExpansion.snapshot.model.evaluationSets.length
          + connectedAgentExpansion.snapshot.model.testCases.length
          + connectedAgentExpansion.snapshot.model.unknownKinds.length,
      };
    }
    return { state: 'idle' };
  }, [
    canLoadConnectedAgents,
    connectedAgentExpansion,
    connectedAgentQuery,
    connectedAgentTarget,
  ]);

  return (
    <AgentMapPresentation
      agentId={agentId}
      agentName={agentName}
      graph={graph}
      orgUrl={orgUrl}
      idleContent={idleContent}
      findings={findings}
      onOpenFinding={onOpenFinding}
      emptyMessage="No Microsoft Copilot botcomponents were captured in this review."
      summaryMode="skill-references"
      onSourceNodeSelected={onSourceNodeSelected}
      getConnectedAgentStatus={getConnectedAgentStatus}
      canLoadConnectedAgents={canLoadConnectedAgents}
    />
  );
}

function PrebuiltAgentMapSource({
  agentId,
  agentName,
  graph,
  orgUrl,
  idleContent,
  findings,
  onOpenFinding,
  description,
  note,
  emptyMessage = 'No components were captured in this saved review.',
}: PrebuiltAgentMapProps) {
  return (
    <AgentMapPresentation
      agentId={agentId}
      agentName={agentName}
      graph={graph}
      orgUrl={orgUrl}
      idleContent={idleContent}
      findings={findings}
      onOpenFinding={onOpenFinding}
      description={description}
      note={note}
      emptyMessage={emptyMessage}
      summaryMode="components"
      includeEveryGraphCategory
    />
  );
}

interface AgentMapPresentationProps extends SharedAgentMapProps {
  graph: AgentMapGraph;
  /** An explainer above the map. Omitted where the map speaks for itself. */
  description?: string;
  note?: string;
  emptyMessage: string;
  summaryMode: 'skill-references' | 'components';
  includeEveryGraphCategory?: boolean;
  onSourceNodeSelected?: (node: AgentMapNode) => void;
  getConnectedAgentStatus?: (node?: AgentMapNode) => ConnectedAgentStatus;
  canLoadConnectedAgents?: boolean;
}

function AgentMapPresentation({
  agentName,
  graph,
  idleContent,
  findings,
  onOpenFinding,
  description,
  note,
  emptyMessage,
  summaryMode,
  includeEveryGraphCategory = false,
  onSourceNodeSelected,
  getConnectedAgentStatus,
  canLoadConnectedAgents = false,
}: AgentMapPresentationProps) {
  const styles = useStyles();
  const availableCategories = useMemo(
    () => new Set(graph.nodes.map(node => node.category)),
    [graph.nodes],
  );
  const [filters, setFilters] = useState<AgentMapFilters>(() =>
    createDefaultFilters(includeEveryGraphCategory ? availableCategories : undefined));
  const [view, setView] = useState<AgentMapView>('map');
  const [layoutResetKey, setLayoutResetKey] = useState(0);
  const [selection, setSelection] = useState<AgentMapSelection>(null);
  const [focusVersion, setFocusVersion] = useState(0);
  const [canvasError, setCanvasError] = useState(false);
  const [selectionAnnouncement, setSelectionAnnouncement] = useState('');
  const [movedNodePositions, setMovedNodePositions] = useState<
    ReadonlyMap<string, XYPosition>
  >(() => new Map());
  const activatorRef = useRef<HTMLElement | SVGElement | null>(null);

  const filtered = useMemo(
    () => filterAgentMapGraph(graph, filters),
    [graph, filters],
  );
  const nodeIndex = useMemo(() => new Map(graph.nodes.map(node => [node.id, node])), [graph.nodes]);
  const edgeIndex = useMemo(() => new Map(graph.edges.map(edge => [edge.id, edge])), [graph.edges]);

  const selectNode = useCallback((
    id: string,
    activator: HTMLElement | SVGElement | null,
    moveFocus: boolean,
  ) => {
    const node = nodeIndex.get(id);
    if (activator) activatorRef.current = activator;
    setSelection({ type: 'node', id });
    if (node) onSourceNodeSelected?.(node);
    if (moveFocus) {
      setSelectionAnnouncement(
        `Selected ${node?.label ?? 'component'}. Details opened.${
          node?.category === 'connected-agent' && canLoadConnectedAgents
            ? ' Loading its botcomponents.'
            : ''
        }`,
      );
      setFocusVersion(version => version + 1);
    }
  }, [canLoadConnectedAgents, nodeIndex, onSourceNodeSelected]);
  const selectEdge = useCallback((
    id: string,
    activator: HTMLElement | SVGElement | null,
    moveFocus: boolean,
  ) => {
    if (activator) activatorRef.current = activator;
    setSelection({ type: 'edge', id });
    if (moveFocus) {
      const edge = edgeIndex.get(id);
      const source = edge ? nodeIndex.get(edge.source)?.label ?? edge.source : 'source';
      const target = edge ? nodeIndex.get(edge.target)?.label ?? edge.target : 'target';
      setSelectionAnnouncement(
        `Selected relationship ${source} ${edge?.relationship ?? 'to'} ${target}. Details opened.`,
      );
      setFocusVersion(version => version + 1);
    }
  }, [edgeIndex, nodeIndex]);
  const clearSelection = useCallback((restoreFocus = true) => {
    setSelection(null);
    if (restoreFocus) {
      setSelectionAnnouncement('Selection cleared.');
      requestAnimationFrame(() => activatorRef.current?.focus());
    }
  }, []);
  const reset = useCallback(() => {
    setFilters(createDefaultFilters(
      includeEveryGraphCategory ? availableCategories : undefined,
    ));
    setMovedNodePositions(new Map());
    setLayoutResetKey(current => current + 1);
    clearSelection(false);
  }, [availableCategories, clearSelection, includeEveryGraphCategory]);
  const rememberMovedNodePosition = useCallback((nodeId: string, position: XYPosition) => {
    setMovedNodePositions(current => updateMovedNodePosition(current, nodeId, position));
  }, []);
  /** Stable identity: the canvas passes this straight to React Flow's `onPaneClick`. */
  const clearSelectionSilently = useCallback(() => clearSelection(false), [clearSelection]);
  const updateFilters = useCallback((nextFilters: AgentMapFilters) => {
    setFilters(nextFilters);
    setSelection(null);
  }, []);

  const selectedNodeId = selection?.type === 'node' ? selection.id : undefined;
  const selectedEdgeId = selection?.type === 'edge' ? selection.id : undefined;
  const mapCompatibleCount = graph.summary.componentCount;
  const selectedNode = selectedNodeId ? nodeIndex.get(selectedNodeId) : undefined;
  const connectedAgentStatus = getConnectedAgentStatus?.(selectedNode);

  const [expanded, setExpanded] = useState(false);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const wasExpanded = useRef(false);

  useEffect(() => {
    // Focus must be restored by hand. Fluent restores through tabster, which
    // only tracks elements marked as a restore target by `<DialogTrigger>` —
    // and this dialog is opened from a plain toolbar button. The collapsed
    // toolbar also unmounts while the dialog is open, so the button to return
    // to is a new element by the time it closes. Without this, focus is left on
    // <body> and the next Tab restarts at the top of the document.
    if (wasExpanded.current && !expanded) expandButtonRef.current?.focus();
    wasExpanded.current = expanded;
  }, [expanded]);

  const mapBody = (isExpanded: boolean) => (
    <>
      <AgentMapToolbar
        filters={filters}
        view={view}
        onFiltersChange={updateFilters}
        onViewChange={setView}
        onReset={reset}
        onExpand={isExpanded ? undefined : () => setExpanded(true)}
        isExpanded={isExpanded}
        expandButtonRef={isExpanded ? undefined : expandButtonRef}
        availableCategories={availableCategories}
      />
      {/*
        The counts are announced but not drawn. Filtering is self-evident on screen — the map and the
        list redraw — so the line only restated what the reader could already see; it stays in the
        live region because a screen reader has no equivalent view of that change.
      */}
      <Text className={styles.visuallyHidden} role="status" aria-live="polite">
        {filters.query.trim()
          ? (
              <>
                Highlighting {filtered.matchedNodeIds.size} components and{' '}
                {filtered.matchedEdgeIds.size} relationships. Showing{' '}
                {filtered.nodes.length} components and {filtered.edges.length} relationships
                after filters.
                {summaryMode === 'skill-references' && (
                  <> {graph.summary.skillReferenceCount} possible skill references were captured.</>
                )}
              </>
            )
          : (
              <>
                Showing {filtered.nodes.length} of {graph.summary.nodeCount} components and{' '}
                {filtered.edges.length} of {graph.summary.edgeCount} relationships.{' '}
                {summaryMode === 'skill-references' && (
                  <>
                    {graph.summary.linkedSkillCount} of{' '}
                    {graph.summary.linkedSkillCount + graph.summary.unlinkedSkillCount} skills have a
                    possible configured tool or knowledge reference with inspectable authored evidence.
                  </>
                )}
              </>
            )}
      </Text>
      <span className={styles.visuallyHidden} role="status" aria-live="polite">
        {selectionAnnouncement}
      </span>

      <div
        className={isExpanded ? styles.viewPanelExpanded : styles.viewPanel}
        role="tabpanel"
        id={`agent-map-view-panel-${view}`}
        aria-labelledby={`agent-map-view-tab-${view}`}
      >
        {filtered.nodes.length === 0 ? (
          <div className={styles.empty}>
            <Subtitle2 as="h3">No matching map items</Subtitle2>
            <Text>Change the search or filters to restore components and relationships.</Text>
            <Button appearance="primary" onClick={reset}>Reset filters</Button>
          </div>
        ) : (
          <div className={isExpanded ? styles.splitExpanded : styles.split}>
            <div className={isExpanded ? styles.contentExpanded : styles.content}>
              {view === 'map' ? (
                <AgentMapCanvasBoundary
                  onError={() => {
                    setCanvasError(true);
                    setView('list');
                  }}
                >
                  <AgentMapCanvas
                    key={layoutResetKey}
                    graph={filtered}
                    movedPositions={movedNodePositions}
                    onNodePositionChange={rememberMovedNodePosition}
                    expanded={isExpanded}
                    selectedNodeId={selectedNodeId}
                    selectedEdgeId={selectedEdgeId}
                    onSelectNode={selectNode}
                    onSelectEdge={selectEdge}
                    onClearSelection={clearSelectionSilently}
                  />
                </AgentMapCanvasBoundary>
              ) : (
                <AgentMapList
                  graph={filtered}
                  selectedNodeId={selectedNodeId}
                  selectedEdgeId={selectedEdgeId}
                  onSelectNode={selectNode}
                  onSelectEdge={selectEdge}
                />
              )}
            </div>
            <div className={isExpanded ? styles.inspectorExpanded : undefined}>
              <AgentMapInspector
                graph={graph}
                selection={selection}
                focusVersion={focusVersion}
                onClear={() => clearSelection(true)}
                onSelectNode={id => {
                  if (nodeIndex.has(id)) selectNode(id, null, false);
                }}
                onSelectEdge={id => {
                  if (edgeIndex.has(id)) setSelection({ type: 'edge', id });
                }}
                idleContent={idleContent}
                connectedAgentStatus={connectedAgentStatus}
                findings={findings}
                onOpenFinding={onOpenFinding}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className={styles.root}>
      {description || note ? (
        <div className={styles.intro}>
          {description ? (
            <Body1 as="p" className={styles.description}>
              {description}
            </Body1>
          ) : null}
          {/*
            Explanatory text, not a MessageBar. A MessageBar signals a condition
            that needs attention; this is a permanent caption, and stacking it
            under the page-level "Viewing a saved review" bar gave two nested bars
            of the same intent. The error and empty-state bars below stay, because
            those are real conditions.
          */}
          {note ? <Caption1 as="p" className={styles.note}>{note}</Caption1> : null}
        </div>
      ) : null}
      {canvasError && (
        <MessageBar intent="error" role="alert">
          <MessageBarBody>
            The map canvas could not render. The complete architecture remains available in List view.
          </MessageBarBody>
        </MessageBar>
      )}
      {mapCompatibleCount === 0 && (
        <MessageBar intent="info">
          <MessageBarBody>
            {emptyMessage}
          </MessageBarBody>
        </MessageBar>
      )}

      {/*
        Rendered in one place or the other, never both: a second ReactFlow
        instance would double the node subscriptions and fight over the
        viewport. The trade-off is that zoom resets when expanding, which is
        acceptable because the dialog fits the graph on open anyway.
      */}
      {!expanded && mapBody(false)}

      <Dialog
        open={expanded}
        onOpenChange={(_, data) => setExpanded(data.open)}
      >
        <DialogSurface className={styles.dialogSurface}>
          <DialogBody className={styles.dialogBody}>
            <DialogTitle
              action={(
                // The toolbar's expand control drops out in this state, so this
                // is the single exit affordance rather than an unlabelled X
                // sitting next to a labelled "Exit full screen" button.
                <Button
                  appearance="subtle"
                  icon={<ArrowMinimizeRegular />}
                  onClick={() => setExpanded(false)}
                >
                  Exit full screen
                </Button>
              )}
            >
              {agentName} — agent map
            </DialogTitle>
            <DialogContent className={styles.dialogContent}>
              {expanded && mapBody(true)}
            </DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
