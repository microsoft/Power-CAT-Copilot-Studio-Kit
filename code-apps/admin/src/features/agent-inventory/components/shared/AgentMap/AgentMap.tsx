import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Body1,
  Caption1,
  Card,
  makeStyles,
  MessageBar,
  MessageBarBody,
  shorthands,
  Text,
  tokens,
} from '@fluentui/react-components';
import type { AgentMapEdge, AgentMapNode, AgentMapProps } from './AgentMap.types';
import { AgentMapCanvas } from './AgentMapCanvas';
import { AgentMapDetailsPanel } from './AgentMapDetailsPanel';
import { AgentMapList } from './AgentMapList';
import {
  AgentMapToolbar,
  type AgentMapFilters,
  type AgentMapView,
} from './AgentMapToolbar';
import { validateAgentMapData } from './validateAgentMapData';
import {
  AGENT_MAP_CATEGORY_GROUPS,
} from './agentMapCategory';

type Selection = AgentMapNode | AgentMapEdge;
const ALL_CATEGORIES = new Set<AgentMapNode['category']>(
  AGENT_MAP_CATEGORY_GROUPS.map(group => group.category),
);
const ALL_EDGE_STYLES = new Set<NonNullable<AgentMapEdge['style']>>(['solid', 'dashed', 'dotted']);

function createDefaultFilters(): AgentMapFilters {
  return {
    query: '',
    categories: new Set(ALL_CATEGORIES),
    edgeStyles: new Set(ALL_EDGE_STYLES),
  };
}

function filterAgentMapData(
  graph: NonNullable<ReturnType<typeof validateAgentMapData>['data']>,
  filters: AgentMapFilters,
) {
  const query = filters.query.trim().toLocaleLowerCase();
  const categoryNodes = graph.nodes.filter(node => filters.categories.has(node.category));
  const categoryNodeIds = new Set(categoryNodes.map(node => node.id));
  const styledEdges = graph.edges.filter(edge =>
    filters.edgeStyles.has(edge.style ?? 'solid')
    && categoryNodeIds.has(edge.source)
    && categoryNodeIds.has(edge.target));
  if (!query) {
    return {
      data: { ...graph, nodes: categoryNodes, edges: styledEdges },
      matchedNodeIds: new Set(categoryNodes.map(node => node.id)),
      matchedEdgeIds: new Set(styledEdges.map(edge => edge.id)),
    };
  }

  const textMatches = (values: unknown[]) =>
    values.some(value => String(value ?? '').toLocaleLowerCase().includes(query));
  const directlyMatchedNodeIds = new Set(categoryNodes
    .filter(node => textMatches([
      node.label,
      node.subtitle,
      node.description,
      ...Object.values(node.metadata ?? {}),
    ]))
    .map(node => node.id));
  const matchingEdges = styledEdges.filter(edge => textMatches([
    edge.label,
    edge.source,
    edge.target,
    ...Object.values(edge.metadata ?? {}),
  ]));
  const matchedNodeIds = new Set(directlyMatchedNodeIds);
  const matchedEdgeIds = new Set(matchingEdges.map(edge => edge.id));
  matchingEdges.forEach(edge => {
    matchedNodeIds.add(edge.source);
    matchedNodeIds.add(edge.target);
  });
  styledEdges.forEach(edge => {
    if (directlyMatchedNodeIds.has(edge.source) || directlyMatchedNodeIds.has(edge.target)) {
      matchedEdgeIds.add(edge.id);
      matchedNodeIds.add(edge.source);
      matchedNodeIds.add(edge.target);
    }
  });
  const agent = categoryNodes.find(node => node.category === 'agent');
  if (agent && matchedNodeIds.size > 0) matchedNodeIds.add(agent.id);
  return {
    data: { ...graph, nodes: categoryNodes, edges: styledEdges },
    matchedNodeIds,
    matchedEdgeIds,
  };
}

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', ...shorthands.gap(tokens.spacingVerticalM) },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    ...shorthands.gap(tokens.spacingVerticalS),
  },
  heading: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalXS),
  },
  description: { color: tokens.colorNeutralForeground2 },
  status: { color: tokens.colorNeutralForeground2 },
  fullscreen: {
    backgroundColor: tokens.colorNeutralBackground1,
    ':fullscreen': {
      boxSizing: 'border-box',
      height: '100vh',
      overflowY: 'auto',
      ...shorthands.padding(tokens.spacingVerticalL, tokens.spacingHorizontalL),
    },
  },
  layout: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 340px',
    alignItems: 'stretch',
    ...shorthands.gap(tokens.spacingHorizontalL),
    minWidth: 0,
    '@media (max-width: 1300px)': { gridTemplateColumns: 'minmax(0, 1fr)' },
  },
  surface: {
    minWidth: 0,
    ...shorthands.padding(0),
    backgroundColor: 'transparent',
    boxShadow: 'none',
  },
  live: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
  },
});

function isNode(selection: Selection): selection is AgentMapNode {
  return 'category' in selection;
}

export function AgentMap({ data, ariaLabel = 'Agent map' }: AgentMapProps) {
  const styles = useStyles();
  const rootRef = useRef<HTMLElement>(null);
  const validation = useMemo(() => validateAgentMapData(data), [data]);
  const [view, setView] = useState<AgentMapView>('map');
  const [filters, setFilters] = useState<AgentMapFilters>(createDefaultFilters);
  const [expanded, setExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [canvasVersion, setCanvasVersion] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const titleId = useId();
  const mapTabId = useId();
  const listTabId = useId();
  const viewPanelId = useId();
  const filteredGraph = useMemo(
    () => validation.data ? filterAgentMapData(validation.data, filters) : undefined,
    [filters, validation.data],
  );
  const select = useCallback((id?: string) => {
    setSelectedId(id);
    const nextSelection = validation.data?.nodes.find(node => node.id === id)
      ?? validation.data?.edges.find(edge => edge.id === id);
    setAnnouncement(nextSelection
      ? `${isNode(nextSelection) ? nextSelection.label : nextSelection.label || 'Relationship'} selected`
      : 'Agent Map selection cleared');
  }, [validation.data]);

  useEffect(() => {
    const handleFullscreenChange = () => setExpanded(document.fullscreenElement === rootRef.current);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  if (!validation.data || !filteredGraph) {
    return (
      <MessageBar intent="error">
        <MessageBarBody>
          The Agent Map data is invalid: {validation.errors.join(' ')}
        </MessageBarBody>
      </MessageBar>
    );
  }

  const graph = validation.data;
  const availableCategories = new Set(graph.nodes.map(node => node.category));
  const availableEdgeStyles = new Set(graph.edges.map(edge => edge.style ?? 'solid'));
  const selection = graph.nodes.find(node => node.id === selectedId)
    ?? graph.edges.find(edge => edge.id === selectedId);
  const reset = () => {
    select(undefined);
    setFilters(createDefaultFilters());
    setCanvasVersion(version => version + 1);
  };
  const toggleExpanded = async () => {
    try {
      if (document.fullscreenElement === rootRef.current) await document.exitFullscreen();
      else await rootRef.current?.requestFullscreen();
    } catch {
      setAnnouncement('Full-screen mode is unavailable in this browser context.');
    }
  };
  const handleCanvasError = () => {
    setView('list');
    setAnnouncement('Map view is unavailable. List view selected.');
  };

  return (
    <section ref={rootRef} className={`${styles.root} ${styles.fullscreen}`} aria-label={ariaLabel}>
      <div className={styles.header}>
        <div className={styles.heading}>
          <Body1 id={titleId}>
            See how this agent connects to its tools, skills, knowledge, triggers, and connected agents.
          </Body1>
          <Caption1 className={styles.description}>
            Line patterns identify the relationship type. Select any component or relationship to inspect its details.
          </Caption1>
        </div>
      </div>
      <AgentMapToolbar
        filters={filters}
        availableCategories={availableCategories}
        availableEdgeStyles={availableEdgeStyles}
        view={view}
        expanded={expanded}
        onFiltersChange={nextFilters => {
          setFilters(nextFilters);
          select(undefined);
          setCanvasVersion(version => version + 1);
        }}
        onViewChange={setView}
        onReset={reset}
        onToggleExpanded={() => { void toggleExpanded(); }}
        mapTabId={mapTabId}
        listTabId={listTabId}
        viewPanelId={viewPanelId}
      />
      {validation.warnings.length > 0 && (
        <MessageBar intent="warning">
          <MessageBarBody>{validation.warnings.join(' ')}</MessageBarBody>
        </MessageBar>
      )}
      <Text className={styles.status} role="status" aria-live="polite">
        Showing {filteredGraph.data.nodes.length} of {graph.nodes.length} components and{' '}
        {filteredGraph.data.edges.length} of {graph.edges.length} relationships.
        {filters.query.trim()
          ? ` ${filteredGraph.matchedNodeIds.size} components match the current search context.`
          : ''}
      </Text>
      {filteredGraph.data.nodes.length === 0 ? (
        <MessageBar><MessageBarBody>No components are available for this map.</MessageBarBody></MessageBar>
      ) : (
        <div className={styles.layout}>
          <Card
            id={viewPanelId}
            role="tabpanel"
            aria-labelledby={view === 'map' ? mapTabId : listTabId}
            className={styles.surface}
            appearance="subtle"
          >
            {view === 'map' ? (
              <AgentMapCanvas
                key={canvasVersion}
                data={filteredGraph.data}
                matchedNodeIds={filteredGraph.matchedNodeIds}
                matchedEdgeIds={filteredGraph.matchedEdgeIds}
                selectedId={selectedId}
                onSelect={select}
                onCanvasError={handleCanvasError}
              />
            ) : (
              <AgentMapList
                data={filteredGraph.data}
                matchedNodeIds={filteredGraph.matchedNodeIds}
                matchedEdgeIds={filteredGraph.matchedEdgeIds}
                selectedId={selectedId}
                onSelect={select}
              />
            )}
          </Card>
          <AgentMapDetailsPanel
            data={filteredGraph.data}
            selection={selection}
            onClose={() => select(undefined)}
          />
        </div>
      )}
      <div className={styles.live} aria-live="polite">
        {announcement}
      </div>
    </section>
  );
}
