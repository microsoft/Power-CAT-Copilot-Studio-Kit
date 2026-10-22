import { memo, type MouseEvent } from "react";
import {
  Badge,
  Button,
  Caption1,
  Text,
  makeStyles,
  mergeClasses,
  shorthands,
  tokens,
} from "@fluentui/react-components";
import { ArrowRightRegular } from "@fluentui/react-icons";
import type { AgentMapViewEdge, AgentMapViewNode } from "./agentMapViewModel";
import {
  AGENT_MAP_CATEGORY_LABELS,
  AGENT_MAP_PROVENANCE_LABELS,
  AGENT_MAP_RESOLUTION_LABELS,
  agentMapNodeIcon,
  getAgentMapNodeTypeLabel,
} from "./agentMapPresentation";

const useStyles = makeStyles({
  row: {
    width: "100%",
    minHeight: "48px",
    justifyContent: "flex-start",
    ...shorthands.borderRadius(0),
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
    ":last-child": { borderBottomStyle: "none" },
  },
  dimmed: {
    backgroundColor: tokens.colorNeutralBackground3,
  },
  rowContent: {
    display: "flex",
    alignItems: "center",
    ...shorthands.gap(tokens.spacingHorizontalS),
    width: "100%",
    minWidth: 0,
    textAlign: "start",
  },
  rowMain: {
    display: "flex",
    flexDirection: "column",
    ...shorthands.gap(tokens.spacingVerticalXXS),
    flexGrow: 1,
    minWidth: 0,
  },
  /**
   * Icon tile, sized so a maker-supplied agent image cannot alter the row
   * height. The map shows each agent's own icon, so the list does too.
   */
  rowIcon: {
    width: "20px",
    height: "20px",
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  rowIconImage: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    ...shorthands.borderRadius(tokens.borderRadiusSmall),
  },
  rowTitle: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  relationship: {
    display: "grid",
    gridTemplateColumns: "minmax(120px, 1fr) auto minmax(120px, 1fr) auto",
    alignItems: "center",
    ...shorthands.gap(tokens.spacingHorizontalS),
    width: "100%",
    minWidth: 0,
    textAlign: "start",
    "@media (max-width: 767px)": {
      gridTemplateColumns: "1fr",
    },
  },
  relationshipWords: {
    display: "inline-flex",
    alignItems: "center",
    ...shorthands.gap(tokens.spacingHorizontalXS),
    color: tokens.colorNeutralForeground2,
  },
  badges: {
    display: "flex",
    ...shorthands.gap(tokens.spacingHorizontalXS),
    flexWrap: "wrap",
    justifyContent: "flex-end",
    "@media (max-width: 767px)": { justifyContent: "flex-start" },
  },
});

interface AgentMapNodeListRowProps {
  node: AgentMapViewNode;
  selected: boolean;
  matched: boolean;
  onSelectNode: (
    id: string,
    activator: HTMLElement | SVGElement | null,
    moveFocus: boolean,
  ) => void;
}

/** Render one memoized component row in the accessible Agent Map list. */
export const AgentMapNodeListRow = memo(function AgentMapNodeListRow({
  node,
  selected,
  matched,
  onSelectNode,
}: AgentMapNodeListRowProps) {
  const styles = useStyles();
  const selectNode = (event: MouseEvent<HTMLButtonElement>) => {
    onSelectNode(node.id, event.currentTarget, event.detail === 0);
  };
  return (
    <Button
      appearance={selected ? "secondary" : "subtle"}
      className={mergeClasses(styles.row, !matched && styles.dimmed)}
      onClick={selectNode}
      aria-label={`${matched ? "" : "Shown for search context. "}Inspect ${
        getAgentMapNodeTypeLabel(node)
      } ${node.label}`}
      aria-current={selected ? "true" : undefined}
    >
      <span className={styles.rowContent}>
        <span className={styles.rowIcon} aria-hidden="true">
          {node.iconBase64
            ? <img className={styles.rowIconImage} src={node.iconBase64} alt="" />
            : agentMapNodeIcon(node)}
        </span>
        <span className={styles.rowMain}>
          <Text weight="semibold" className={styles.rowTitle}>{node.label}</Text>
          <Caption1>{node.subtitle ?? AGENT_MAP_CATEGORY_LABELS[node.category]}</Caption1>
        </span>
        {!matched && (
          <Badge appearance="outline" color="informative" size="small" shape="rounded">
            Search context
          </Badge>
        )}
        {node.resolution !== "resolved" && (
          <Badge appearance="outline" color="danger" size="small" shape="rounded">
            {AGENT_MAP_RESOLUTION_LABELS[node.resolution]}
          </Badge>
        )}
      </span>
    </Button>
  );
});

interface AgentMapEdgeListRowProps {
  edge: AgentMapViewEdge;
  sourceLabel: string;
  targetLabel: string;
  selected: boolean;
  matched: boolean;
  onSelectEdge: (
    id: string,
    activator: HTMLElement | SVGElement | null,
    moveFocus: boolean,
  ) => void;
}

/** Render one memoized relationship row in the accessible Agent Map list. */
export const AgentMapEdgeListRow = memo(function AgentMapEdgeListRow({
  edge,
  sourceLabel,
  targetLabel,
  selected,
  matched,
  onSelectEdge,
}: AgentMapEdgeListRowProps) {
  const styles = useStyles();
  const selectEdge = (event: MouseEvent<HTMLButtonElement>) => {
    onSelectEdge(edge.id, event.currentTarget, event.detail === 0);
  };
  return (
    <Button
      appearance={selected ? "secondary" : "subtle"}
      className={mergeClasses(styles.row, !matched && styles.dimmed)}
      onClick={selectEdge}
      aria-label={`${matched ? "" : "Shown for search context. "}Inspect relationship: ${
        sourceLabel
      } ${edge.relationship} ${targetLabel}`}
      aria-current={selected ? "true" : undefined}
    >
      <span className={styles.relationship}>
        <Text weight="semibold" className={styles.rowTitle}>{sourceLabel}</Text>
        <span className={styles.relationshipWords}>
          <ArrowRightRegular aria-hidden="true" />
          <Caption1>{edge.relationship}</Caption1>
        </span>
        <Text weight="semibold" className={styles.rowTitle}>{targetLabel}</Text>
        <span className={styles.badges}>
          {!matched && (
            <Badge appearance="outline" color="informative" size="small" shape="rounded">
              Search context
            </Badge>
          )}
          <Badge appearance="tint" color="informative" size="small" shape="rounded">
            {AGENT_MAP_PROVENANCE_LABELS[edge.provenance]}
          </Badge>
          {edge.resolution !== "resolved" && (
            <Badge appearance="outline" color="danger" size="small" shape="rounded">
              {AGENT_MAP_RESOLUTION_LABELS[edge.resolution]}
            </Badge>
          )}
        </span>
      </span>
    </Button>
  );
});
