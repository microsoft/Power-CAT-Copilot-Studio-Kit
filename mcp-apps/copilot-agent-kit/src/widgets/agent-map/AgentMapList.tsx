import { useMemo, useState } from "react";
import {
  Body1Strong,
  Button,
  Caption1,
  Subtitle2,
  makeStyles,
  shorthands,
  tokens,
} from "@fluentui/react-components";
import type {
  AgentMapViewEdge,
  AgentMapViewNode,
  FilteredAgentMapGraph,
} from "./agentMapViewModel";
import { AGENT_MAP_CATEGORY_LABELS } from "./agentMapPresentation";
import { AgentMapEdgeListRow, AgentMapNodeListRow } from "./AgentMapListRows";

const NODE_CHUNK_SIZE = 200;
const EDGE_CHUNK_SIZE = 250;

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    ...shorthands.gap(tokens.spacingVerticalL),
  },
  section: {
    display: "flex",
    flexDirection: "column",
    ...shorthands.gap(tokens.spacingVerticalM),
  },
  category: {
    display: "flex",
    flexDirection: "column",
    ...shorthands.gap(tokens.spacingVerticalS),
  },
  heading: {
    margin: 0,
  },
  list: {
    display: "flex",
    flexDirection: "column",
    listStyleType: "none",
    margin: 0,
    padding: 0,
    ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
    overflow: "hidden",
  },
  progress: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    ...shorthands.gap(tokens.spacingHorizontalS),
    flexWrap: "wrap",
  },
  showMore: {
    minHeight: "44px",
  },
});

export interface AgentMapListProps {
  graph: FilteredAgentMapGraph;
  selectedNodeId?: string;
  selectedEdgeId?: string;
  onSelectNode: (
    id: string,
    activator: HTMLElement | SVGElement | null,
    moveFocus: boolean,
  ) => void;
  onSelectEdge: (
    id: string,
    activator: HTMLElement | SVGElement | null,
    moveFocus: boolean,
  ) => void;
}

function byCategory(
  nodes: AgentMapViewNode[],
): Array<[AgentMapViewNode["category"], AgentMapViewNode[]]> {
  const grouped = new Map<AgentMapViewNode["category"], AgentMapViewNode[]>();
  nodes.forEach((node) => {
    const items = grouped.get(node.category) ?? [];
    items.push(node);
    grouped.set(node.category, items);
  });
  return [...grouped.entries()];
}

/** Render the complete keyboard-operable equivalent of the currently filtered graph. */
export function AgentMapList({
  graph,
  selectedNodeId,
  selectedEdgeId,
  onSelectNode,
  onSelectEdge,
}: AgentMapListProps) {
  const styles = useStyles();
  const [nodeWindow, setNodeWindow] = useState<{
    source: AgentMapViewNode[];
    limit: number;
  }>(() => ({ source: graph.nodes, limit: NODE_CHUNK_SIZE }));
  const [edgeWindow, setEdgeWindow] = useState<{
    source: AgentMapViewEdge[];
    limit: number;
  }>(() => ({ source: graph.edges, limit: EDGE_CHUNK_SIZE }));
  const nodeLimit = nodeWindow.source === graph.nodes ? nodeWindow.limit : NODE_CHUNK_SIZE;
  const edgeLimit = edgeWindow.source === graph.edges ? edgeWindow.limit : EDGE_CHUNK_SIZE;
  const nodeIndex = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node])),
    [graph.nodes],
  );
  const visibleNodes = useMemo(() => graph.nodes.slice(0, nodeLimit), [graph.nodes, nodeLimit]);
  const visibleEdges = useMemo(() => graph.edges.slice(0, edgeLimit), [edgeLimit, graph.edges]);
  const groupedNodes = useMemo(() => byCategory(visibleNodes), [visibleNodes]);

  return (
    <div className={styles.root}>
      <section className={styles.section} aria-labelledby="agent-map-components-heading">
        <Subtitle2 as="h3" className={styles.heading} id="agent-map-components-heading">
          Components
        </Subtitle2>
        {groupedNodes.map(([category, nodes]) => (
          <section
            className={styles.category}
            key={category}
            aria-labelledby={`agent-map-${category}-heading`}
          >
            <Body1Strong as="h4" className={styles.heading} id={`agent-map-${category}-heading`}>
              {AGENT_MAP_CATEGORY_LABELS[category]} ({nodes.length})
            </Body1Strong>
            <ul className={styles.list}>
              {nodes.map((node) => (
                <li key={node.id}>
                  <AgentMapNodeListRow
                    node={node}
                    selected={node.id === selectedNodeId}
                    matched={graph.matchedNodeIds.has(node.id)}
                    onSelectNode={onSelectNode}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
        {visibleNodes.length < graph.nodes.length && (
          <div className={styles.progress}>
            <Caption1>
              Showing {visibleNodes.length} of {graph.nodes.length} components.
            </Caption1>
            <Button
              appearance="subtle"
              className={styles.showMore}
              onClick={() => setNodeWindow({
                source: graph.nodes,
                limit: nodeLimit + NODE_CHUNK_SIZE,
              })}
            >
              Show more components
            </Button>
          </div>
        )}
      </section>

      <section className={styles.section} aria-labelledby="agent-map-relationships-heading">
        <Subtitle2 as="h3" className={styles.heading} id="agent-map-relationships-heading">
          Relationships
        </Subtitle2>
        <ul className={styles.list}>
          {visibleEdges.map((edge) => (
            <li key={edge.id}>
              <AgentMapEdgeListRow
                edge={edge}
                sourceLabel={nodeIndex.get(edge.source)?.label ?? edge.source}
                targetLabel={nodeIndex.get(edge.target)?.label ?? edge.target}
                selected={edge.id === selectedEdgeId}
                matched={graph.matchedEdgeIds.has(edge.id)}
                onSelectEdge={onSelectEdge}
              />
            </li>
          ))}
        </ul>
        {visibleEdges.length < graph.edges.length && (
          <div className={styles.progress}>
            <Caption1>
              Showing {visibleEdges.length} of {graph.edges.length} relationships.
            </Caption1>
            <Button
              appearance="subtle"
              className={styles.showMore}
              onClick={() => setEdgeWindow({
                source: graph.edges,
                limit: edgeLimit + EDGE_CHUNK_SIZE,
              })}
            >
              Show more relationships
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
