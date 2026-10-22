import { useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  Badge,
  Body1Strong,
  Button,
  Caption1,
  Card,
  CardFooter,
  CardHeader,
  Divider,
  MessageBar,
  MessageBarBody,
  Spinner,
  Subtitle2,
  Text,
  makeStyles,
  mergeClasses,
  shorthands,
  tokens,
} from "@fluentui/react-components";
import { CursorClickRegular, DismissRegular, InfoRegular } from "@fluentui/react-icons";
import type { AgentMapDiagnostic, AgentMapViewGraph } from "./agentMapViewModel";
import {
  AGENT_MAP_PROVENANCE_LABELS,
  AGENT_MAP_RESOLUTION_LABELS,
  agentMapNodeIcon,
  getAgentMapNodeTypeLabel,
} from "./agentMapPresentation";
import {
  AgentMapInspectorFields,
  AgentMapInspectorSection,
} from "./AgentMapInspectorParts";
import { displayAgentMapDetail } from "./agentMapDetailFormatting";
import type { FindingView } from "../../agent-review/ui/components/viewTypes.js";
import { createFindingRowFocus } from "../../agent-review/ui/components/findings/findingsGroupedModel.js";
import { getNodeFindings } from "./nodeFindings.js";

export type AgentMapSelection =
  | { type: "node"; id: string }
  | { type: "edge"; id: string }
  | null;

export type AgentMapConnectedAgentStatus =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "loaded"; componentCount?: number }
  | { state: "error"; message?: string };

const useStyles = makeStyles({
  panel: {
    width: "360px",
    minWidth: "360px",
    alignSelf: "start",
    display: "flex",
    flexDirection: "column",
    ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
    backgroundColor: tokens.colorNeutralBackground1,
    "@media (max-width: 1199px)": {
      width: "100%",
      minWidth: 0,
    },
  },
  header: {
    display: "flex",
    // Top-aligned, not centred: a long component name wraps to two lines, and
    // centring leaves the icon floating in the middle of that block.
    alignItems: "flex-start",
    ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalM),
    minWidth: 0,
  },
  headerIcon: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    width: "28px",
    height: "28px",
    marginTop: "-3px",
    "& svg": {
      width: "20px",
      height: "20px",
    },
  },
  // Only for the fallback category glyphs. An agent's own mark is already a
  // filled tile, and a second background would frame it.
  headerIconTile: {
    backgroundColor: tokens.colorNeutralBackground3,
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
  },
  headerIconImage: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
  },
  headerText: {
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: tokens.spacingHorizontalS,
    rowGap: tokens.spacingVerticalXXS,
    minWidth: 0,
  },
  headerBadge: {
    flexShrink: 0,
  },
  body: {
    display: "flex",
    flexDirection: "column",
    ...shorthands.gap(tokens.spacingVerticalM),
    ...shorthands.padding(0, tokens.spacingHorizontalM, tokens.spacingVerticalM),
  },
  title: {
    margin: 0,
    lineHeight: tokens.lineHeightBase400,
    outline: "none",
    ":focus-visible": {
      outline: `2px solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: "2px",
    },
  },
  badges: {
    display: "flex",
    ...shorthands.gap(tokens.spacingHorizontalXS),
    flexWrap: "wrap",
  },
  relationship: {
    display: "flex",
    flexDirection: "column",
    ...shorthands.gap(tokens.spacingVerticalXXS),
  },
  referenceList: {
    display: "flex",
    flexDirection: "column",
    ...shorthands.gap(tokens.spacingVerticalXS),
  },
  referenceButton: {
    width: "100%",
    minHeight: "44px",
    height: "auto",
    justifyContent: "flex-start",
    textAlign: "start",
    whiteSpace: "normal",
    ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalS),
  },
  /** Centred empty state: an invitation, not a paragraph of caveats. */
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    ...shorthands.gap(tokens.spacingVerticalXS),
    ...shorthands.padding(tokens.spacingVerticalXXL, tokens.spacingHorizontalM),
  },
  emptyIcon: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "44px",
    height: "44px",
    marginBottom: tokens.spacingVerticalXS,
    ...shorthands.borderRadius(tokens.borderRadiusCircular),
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground3,
    fontSize: "20px",
  },
  emptyTitle: {
    color: tokens.colorNeutralForeground1,
  },
  emptyHint: {
    color: tokens.colorNeutralForeground3,
    maxWidth: "30ch",
  },
  footer: {
    display: "flex",
    justifyContent: "flex-end",
    ...shorthands.padding(0, tokens.spacingHorizontalM, tokens.spacingVerticalM),
  },
});

export interface AgentMapInspectorProps {
  graph: AgentMapViewGraph;
  selection: AgentMapSelection;
  focusVersion: number;
  connectedAgentStatus?: AgentMapConnectedAgentStatus;
  onClear: () => void;
  onSelectNode: (id: string) => void;
  onSelectEdge: (id: string) => void;
  findings?: readonly FindingView[];
  onOpenFinding?: (findingId: string) => void;
  idleContent?: ReactNode;
}

/** Show deterministic snapshot details and evidence for the selected component or relationship. */
export function AgentMapInspector({
  graph,
  selection,
  focusVersion,
  connectedAgentStatus,
  onClear,
  onSelectNode,
  onSelectEdge,
  findings,
  onOpenFinding,
  idleContent,
}: AgentMapInspectorProps) {
  const styles = useStyles();
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const nodeIndex = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node])),
    [graph.nodes],
  );
  const edgeIndex = useMemo(
    () => new Map(graph.edges.map((edge) => [edge.id, edge])),
    [graph.edges],
  );
  const node = selection?.type === "node" ? nodeIndex.get(selection.id) : undefined;
  const edge = selection?.type === "edge" ? edgeIndex.get(selection.id) : undefined;
  const nodeFindings = node && findings ? getNodeFindings(findings, node) : undefined;

  useEffect(() => {
    if (focusVersion > 0) headingRef.current?.focus();
  }, [focusVersion]);

  const title = node?.label ?? (edge
    ? `${nodeIndex.get(edge.source)?.label ?? edge.source} ${edge.relationship} ${
      nodeIndex.get(edge.target)?.label ?? edge.target
    }`
    : idleContent ? "Review overview" : "Details");
  const connectedEdges = node
    ? graph.edges.filter((candidate) =>
      candidate.source === node.id || candidate.target === node.id)
    : [];
  const diagnostics: AgentMapDiagnostic[] = node
    ? [
        ...graph.diagnostics.filter((item) => item.sourceId === node.id),
        ...node.warnings.map((message, index) => ({
          code: `node-warning-${index}`,
          severity: "warning" as const,
          message,
          sourceId: node.id,
        })),
      ]
    : [];

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
              !node?.iconBase64 && styles.headerIconTile,
            )}
            aria-hidden="true"
          >
            {node
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
              <Badge appearance="tint" color="brand" className={styles.headerBadge}>
                {node ? getAgentMapNodeTypeLabel(node) : "Relationship"}
              </Badge>
            )}
          </div>
        )}
      />
      <div className={styles.body}>
        {!node && !edge && idleContent}
        {!node && !edge && !idleContent && (
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
              {node.subtitle && <Text>{node.subtitle}</Text>}
              {node.description && <Text size={200}>{node.description}</Text>}
              <div className={styles.badges}>
                <Badge appearance="tint" color="brand" shape="rounded">
                  {getAgentMapNodeTypeLabel(node)}
                </Badge>
                <Badge
                  appearance="outline"
                  color={node.resolution === "unresolved" ? "danger" : "informative"}
                  shape="rounded"
                >
                  {AGENT_MAP_RESOLUTION_LABELS[node.resolution]}
                </Badge>
              </div>
            </AgentMapInspectorSection>
            {nodeFindings && (
              <>
                <Divider />
                <AgentMapInspectorSection title={`Review findings (${nodeFindings.findings.length})`}>
                  {nodeFindings.scope === "agent" && (
                    <Caption1>All saved findings are shown for the reviewed agent.</Caption1>
                  )}
                  {nodeFindings.scope === "unavailable" && (
                    <MessageBar intent="info">
                      <MessageBarBody>
                        Component-level finding links were not recorded for this component in this saved review.
                        View all findings to read the full result.
                      </MessageBarBody>
                    </MessageBar>
                  )}
                  {nodeFindings.scope !== "unavailable" && nodeFindings.findings.length === 0 && (
                    <Caption1>
                      {nodeFindings.scope === "agent"
                        ? "No saved findings are available."
                        : "No review findings were linked to this component."}
                    </Caption1>
                  )}
                  <div className={styles.referenceList}>
                    {nodeFindings.findings.map(finding => {
                      const index = findings?.indexOf(finding) ?? -1;
                      return (
                        <Button
                          key={index}
                          appearance="subtle"
                          className={styles.referenceButton}
                          onClick={() => onOpenFinding?.(createFindingRowFocus(String(index)))}
                          disabled={!onOpenFinding}
                        >
                          <div className={styles.relationship}>
                            <Badge
                              appearance="tint"
                              color={finding.sev === "error" ? "danger" : finding.sev === "warning" ? "warning" : "informative"}
                              size="small"
                            >
                              {{ error: "Error", warning: "Warning", info: "Info" }[finding.sev]}
                            </Badge>
                            <Text weight="semibold">{finding.title}</Text>
                            <Caption1>{finding.fact || finding.sub}</Caption1>
                          </div>
                        </Button>
                      );
                    })}
                  </div>
                </AgentMapInspectorSection>
              </>
            )}
            <Divider />
            <AgentMapInspectorSection title="Identity">
              <AgentMapInspectorFields rows={[
                ["Schema name", node.schemaName],
                ["Component ID", node.componentId],
                ["Unique ID", node.componentIdUnique],
                [
                  "Parent",
                  node.parentId ? nodeIndex.get(node.parentId)?.label ?? node.parentId : undefined,
                ],
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
            {node.category === "connected-agent" && connectedAgentStatus && (
              <>
                <Divider />
                <AgentMapInspectorSection title="Connected agent components">
                  {connectedAgentStatus.state === "loading" && (
                    <Spinner size="tiny" label="Loading connected-agent components" />
                  )}
                  {connectedAgentStatus.state === "loaded" && (
                    <MessageBar intent="success" role="status">
                      <MessageBarBody>
                        Loaded {connectedAgentStatus.componentCount ?? 0} components from the
                        source environment. They are now shown in Map and List views.
                      </MessageBarBody>
                    </MessageBar>
                  )}
                  {connectedAgentStatus.state === "error" && (
                    <MessageBar intent="error" role="alert">
                      <MessageBarBody>
                        {connectedAgentStatus.message ?? "The connected agent could not be loaded."}
                      </MessageBarBody>
                    </MessageBar>
                  )}
                  {connectedAgentStatus.state === "idle" && (
                    <Caption1>Select this node to load its current components.</Caption1>
                  )}
                </AgentMapInspectorSection>
              </>
            )}
            <Divider />
            <AgentMapInspectorSection title={`References (${connectedEdges.length})`}>
              <div className={styles.referenceList}>
                {connectedEdges.length === 0 && (
                  <Caption1>No relationships were captured.</Caption1>
                )}
                {connectedEdges.map((reference) => (
                  <Button
                    key={reference.id}
                    appearance="subtle"
                    className={styles.referenceButton}
                    onClick={() => onSelectEdge(reference.id)}
                  >
                    <Caption1>
                      {nodeIndex.get(reference.source)?.label ?? reference.source}
                      {" "}{reference.relationship}{" "}
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
                  {diagnostics.map((item) => (
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
                  color={edge.resolution === "unresolved" ? "danger" : "informative"}
                  shape="rounded"
                >
                  {AGENT_MAP_RESOLUTION_LABELS[edge.resolution]}
                </Badge>
              </div>
              {edge.provenance !== "structural" && (
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
                ["Provenance", AGENT_MAP_PROVENANCE_LABELS[edge.provenance]],
                [
                  edge.provenance === "structural" ? "Confidence" : "Text-match strength",
                  `${Math.round(edge.confidence * 100)}%`,
                ],
                ["Source field", edge.sourceField],
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
