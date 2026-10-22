/* eslint-disable react-refresh/only-export-components */

import { useState, useCallback } from "react";
import {
  Text,
  Button,
  Spinner,
  tokens,
  makeStyles,
  mergeClasses,
} from "@fluentui/react-components";
import {
  BotSparkle24Regular,
  TasksApp24Regular,
  ChatBubblesQuestion16Regular,
  ChevronDown20Regular,
  ChevronUp20Regular,
  ArrowDownload24Regular,
  Clock16Regular,
  ErrorCircle16Regular,
  Copy16Regular,
  Checkmark16Regular,
  // Step-type icons — Fluent UI replacements for former custom PNG icons
  Code20Regular,
  ChatSparkle20Regular,
  BookOpenLightbulb20Regular,
  Connector20Regular,
  Wrench20Regular,
  Flow20Regular,
  Server20Regular,
  BrainSparkle20Regular,
  Prompt20Regular,
  Bot20Regular,
} from "@fluentui/react-icons";
import type { ConnectedAgentInfo } from "../../contracts/connected-agent";
import type { ComponentInfo } from "../../services/botcomponents-service";
import { guessStepSubtitle, resolveExecutionTimeString } from "../../utils/step-classification";
import { formatDuration as formatDurationMs } from "../../utils/format-duration";
import { ReasoningBlock } from "./ReasoningBlock";
import { SkillIcon } from "./SkillIcon";
import { GENERATIVE_THINKING_TASK_ID } from "../../utils/transcript/parse-generative-transcript";
import { COMPONENT_COLORS, DEFAULT_COMPONENT_COLOR } from "../../theme/component-colors";


/**
 * Normalizes spaced acronyms in display names.
 * "Meeting Management M C P Server" → "Meeting Management MCP Server"
 * Matches sequences of 2+ single uppercase letters separated by spaces.
 */
function normalizeSpacedAcronyms(name: string): string {
  return name.replace(
    /\b([A-Z])(?: ([A-Z]))+\b/g,
    (match) => match.replace(/ /g, "")
  );
}

// ─── Styles ────────────────────────────────────────────────────────

const useStyles = makeStyles({
  card: {
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusLarge,
    padding: tokens.spacingHorizontalM,
    marginTop: tokens.spacingVerticalS,
    marginBottom: tokens.spacingVerticalS,
    width: "100%",
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  cardFlushTop: {
    marginTop: 0,
  },
  agentHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  agentHeaderButton: {
    width: "100%",
    minHeight: "unset",
    border: "none",
    backgroundColor: "transparent",
    color: "inherit",
    textAlign: "left",
    cursor: "pointer",
    borderRadius: tokens.borderRadiusMedium,
    paddingTop: tokens.spacingVerticalXXS,
    paddingBottom: tokens.spacingVerticalXXS,
    paddingInlineStart: tokens.spacingHorizontalXS,
    paddingInlineEnd: tokens.spacingHorizontalXS,
    marginInlineStart: `calc(-1 * ${tokens.spacingHorizontalXS})`,
    marginInlineEnd: `calc(-1 * ${tokens.spacingHorizontalXS})`,
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground3Hover,
    },
    ":focus-visible": {
      outlineStyle: "solid",
      outlineWidth: tokens.strokeWidthThick,
      outlineColor: tokens.colorStrokeFocus2,
      outlineOffset: "-2px",
    },
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    flexShrink: 0,
  },
  chevron: {
    color: tokens.colorNeutralForeground3,
    flexShrink: 0,
  },
  agentInfo: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalSNudge,
  },
  agentIcon: {
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    width: "36px",
    height: "36px",
    borderRadius: tokens.borderRadiusLarge,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  agentName: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
  },
  agentLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  duration: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXXS,
  },
  childConversationId: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
    marginTop: tokens.spacingVerticalS,
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`,
    backgroundColor: tokens.colorNeutralBackground4,
    borderRadius: tokens.borderRadiusMedium,
    fontSize: tokens.fontSizeBase100,
    fontFamily: tokens.fontFamilyMonospace,
    color: tokens.colorNeutralForeground3,
    overflow: "hidden",
  },
  childConversationIdText: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    flex: 1,
    minWidth: 0,
  },
  extraRecordLink: {
    flexShrink: 0,
    color: tokens.colorBrandForegroundLink,
    textDecoration: "none",
  },
  copyBtn: {
    minWidth: "auto",
    padding: tokens.spacingHorizontalXXS,
    flexShrink: 0,
  },
  topicsContainer: {
    display: "flex",
    flexDirection: "column",
    marginTop: tokens.spacingVerticalS,
  },
  topicConnector: {
    display: "flex",
    justifyContent: "center",
    height: tokens.spacingVerticalL,
  },
  topicConnectorLine: {
    width: tokens.strokeWidthThin,
    height: "100%",
    backgroundColor: tokens.colorNeutralStroke2,
  },
  topicCard: {
    backgroundColor: tokens.colorNeutralBackground4,
    borderRadius: tokens.borderRadiusMedium,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: tokens.spacingHorizontalS,
    width: "100%",
    minHeight: "unset",
    color: "inherit",
    textAlign: "left",
    cursor: "pointer",
    border: `${tokens.strokeWidthThin} solid transparent`,
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground4Hover,
    },
  },
  topicCardSelected: {
    border: `${tokens.strokeWidthThin} solid ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorNeutralBackground4Selected,
  },
  topicIconContainer: {
    width: "28px",
    height: "28px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  topicIconImg: {
    width: "24px",
    height: "24px",
    objectFit: "contain" as const,
  },
  topicName: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
  },
  topicLabel: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  topicDuration: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXXS,
  },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: tokens.spacingVerticalS,
    paddingTop: tokens.spacingVerticalS,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  totalCount: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXXS,
  },
  errorText: {
    color: tokens.colorPaletteRedForeground1,
    fontSize: tokens.fontSizeBase200,
    marginTop: tokens.spacingVerticalXXS,
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXXS,
  },
  statusText: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    marginTop: tokens.spacingVerticalXS,
  },
  instruction: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
    marginTop: tokens.spacingVerticalS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalSNudge}`,
    backgroundColor: tokens.colorNeutralBackground4,
    borderRadius: tokens.borderRadiusSmall,
    fontStyle: "italic",
    lineHeight: tokens.lineHeightBase300,
  },
});

// ─── Component ─────────────────────────────────────────────────────

interface ConnectedAgentCardProps {
  connectedAgent: ConnectedAgentInfo;
  onFetchChildTranscript?: (agent: ConnectedAgentInfo) => void;
  componentNameBySchemaName?: Record<string, ComponentInfo>;
  /** Currently selected child topic key (controlled from DebugPanel). */
  selectedTopicKey?: string | null;
  /** Called when a child topic is clicked. */
  onTopicSelect?: (topicKey: string | null) => void;
  /** Dataverse org URL for constructing record links. */
  environmentUrl?: string;
  /** True in snapshot mode — hides the Load button since there is no Dataverse access. */
  snapshotMode?: boolean;
  /**
   * Called when the card header is activated — lets the parent select this
   * connected-agent step (so its detail panel updates) alongside the local
   * expand/collapse toggle.
   */
  onSelect?: () => void;
  /** Whether the card should expand for the current automatic selection. */
  initiallyExpanded?: boolean;
  /** Removes the top margin when this is the first activity in an aligned layout. */
  flushTop?: boolean;
}

/** Look up botcomponent display name for a schema name. */
function resolveComponentName(
  schemaName: string | undefined,
  map?: Record<string, ComponentInfo>
): string {
  if (!map || !schemaName) return "";
  const info = map[schemaName];
  if (!info) return "";
  return (info.modelDisplayName?.trim() || info.name)?.trim() || "";
}

export function ConnectedAgentCard({
  connectedAgent,
  onFetchChildTranscript,
  componentNameBySchemaName,
  selectedTopicKey,
  onTopicSelect,
  environmentUrl,
  snapshotMode,
  onSelect,
  initiallyExpanded = false,
  flushTop = false,
}: ConnectedAgentCardProps) {
  const styles = useStyles();
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [copied, setCopied] = useState(false);

  const handleToggle = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  // Header activation: select this step (updates the detail panel) and toggle
  // the card between collapsed (name + conversation id only) and expanded.
  const handleHeaderActivate = useCallback(() => {
    onSelect?.();
    setExpanded((prev) => !prev);
  }, [onSelect]);

  const handleFetch = useCallback(() => {
    onFetchChildTranscript?.(connectedAgent);
  }, [connectedAgent, onFetchChildTranscript]);

  const handleCopyConversationId = useCallback(() => {
    if (connectedAgent.childConversationId) {
      navigator.clipboard.writeText(connectedAgent.childConversationId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [connectedAgent.childConversationId]);

  // Prefer the pre-parsed seconds value when present, fall back to parsing the
  // raw "hh:mm:ss.fffffff" string. Lightweight child agents synthesise both
  // fields, but heavyweight connected agents may only carry the string when
  // DynamicPlanStepFinished hasn't been processed yet.
  const durationFormatted =
    connectedAgent.executionTimeSeconds && connectedAgent.executionTimeSeconds > 0
      ? formatDuration(connectedAgent.executionTime) ?? `${connectedAgent.executionTimeSeconds.toFixed(2)}s`
      : formatDuration(connectedAgent.executionTime);

  // Reasoning steps are surfaced inline as plain text, not counted as components.
  const totalTopics = connectedAgent.childTopics.filter(
    (t) => t.schemaId !== GENERATIVE_THINKING_TASK_ID
  ).length;

  const isChildAgent = connectedAgent.agentKind === "child";
  const AgentIcon = isChildAgent ? TasksApp24Regular : BotSparkle24Regular;
  const agentKindLabel = isChildAgent ? "Child agent" : "Connected agent";

  // Resolve agent display name: botcomponent lookup by dialog schema (most specific,
  // may carry an authored variant suffix like "-Auth") → bot schema (the child bot's
  // canonical authored name in botcomponents) → PascalCase-derived fallback.
  const agentDisplayName = normalizeSpacedAcronyms(
    resolveComponentName(connectedAgent.dialogSchemaName, componentNameBySchemaName) ||
    resolveComponentName(connectedAgent.botSchemaName, componentNameBySchemaName) ||
    connectedAgent.displayName
  );

  return (
    <div className={mergeClasses(styles.card, flushTop && styles.cardFlushTop)}>
      {/* Agent Header — click to select this step and toggle expand/collapse */}
      <Button
        appearance="transparent"
        className={mergeClasses(styles.agentHeader, styles.agentHeaderButton)}
        aria-expanded={expanded}
        aria-label={`${agentDisplayName}, ${agentKindLabel}. ${expanded ? "Collapse" : "Expand"} details`}
        onClick={handleHeaderActivate}
      >
        <span className={styles.agentInfo}>
          <span className={styles.agentIcon} aria-hidden="true">
            <AgentIcon />
          </span>
          <span>
            <Text className={styles.agentName}>
              {agentDisplayName}
            </Text>
            <br />
            <Text className={styles.agentLabel}>{agentKindLabel}</Text>
          </span>
        </span>
        <span className={styles.headerRight}>
          {expanded && durationFormatted && (
            <span className={styles.duration}>
              <Clock16Regular />
              {durationFormatted}
            </span>
          )}
          {expanded ? (
            <ChevronUp20Regular className={styles.chevron} aria-hidden="true" />
          ) : (
            <ChevronDown20Regular className={styles.chevron} aria-hidden="true" />
          )}
        </span>
      </Button>

      {/* Child Conversation ID — clickable Dataverse link per transcript record */}
      {connectedAgent.childConversationId && (
        <div className={styles.childConversationId}>
          {(() => {
            const baseUrl = environmentUrl?.replace(/\/+$/, "");
            // Validate: baseUrl must be a Dynamics 365 org URL, record IDs must be UUIDs
            const isValidUrl = (() => {
              try {
                return baseUrl ? /\.crm\d*\.dynamics\.com$/i.test(new URL(baseUrl).hostname) : false;
              } catch { return false; }
            })();
            const dataverseUrls = isValidUrl
              ? (connectedAgent.childTranscriptRecordIds ?? [])
                  .filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
                  .map((id) => `${baseUrl}/main.aspx?forceUCI=1&pagetype=entityrecord&etn=conversationtranscript&id=${id}`)
              : [];
            return (
              <>
                {dataverseUrls.length > 0 ? (
                  <a
                    href={dataverseUrls[0]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.childConversationIdText}
                    style={{ color: tokens.colorBrandForegroundLink, textDecoration: "none" }}
                    onClick={(e) => e.stopPropagation()}
                    title={dataverseUrls.length > 1 ? "Open transcript record 1 in Dataverse" : "Open transcript in Dataverse"}
                  >
                    {connectedAgent.childConversationId}
                  </a>
                ) : (
                  <span className={styles.childConversationIdText}>
                    {connectedAgent.childConversationId}
                  </span>
                )}
                {dataverseUrls.slice(1).map((url, i) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.extraRecordLink}
                    onClick={(e) => e.stopPropagation()}
                    title={`Open transcript record ${i + 2} in Dataverse`}
                  >
                    #{i + 2}
                  </a>
                ))}
              </>
            );
          })()}
          <Button
            appearance="transparent"
            size="small"
            className={styles.copyBtn}
            icon={copied ? <Checkmark16Regular /> : <Copy16Regular />}
            onClick={(e) => { e.stopPropagation(); handleCopyConversationId(); }}
            aria-label="Copy conversation ID"
          />
        </div>
      )}

      {/* Child Topics — use topic details for duration resolution from executions */}
      {connectedAgent.isFetched && expanded && (
        <div className={styles.topicsContainer}>
          {(() => {
            const details = buildConnectedAgentTopicDetails(connectedAgent, componentNameBySchemaName);
            return connectedAgent.childTopics.map((topic, index) => {
              // A vertical connector line separates consecutive activities (skipped
              // before the first) — matching the parent-flow timeline.
              const connector = index > 0 ? (
                <div className={styles.topicConnector} aria-hidden="true">
                  <div className={styles.topicConnectorLine} />
                </div>
              ) : null;
              // Reasoning steps render inline as muted plain text (a subtle
              // left-accented ReasoningBlock, same as the parent flow) instead of
              // a clickable component card — so the thought is visible directly in
              // the list without opening the detail view.
              if (topic.schemaId === GENERATIVE_THINKING_TASK_ID) {
                return (
                  <div key={index}>
                    {connector}
                    <ReasoningBlock text={topic.thought ?? ""} variant="connected" />
                  </div>
                );
              }
              const topicKey = `${topic.schemaId}:${index}`;
              const isSelected = selectedTopicKey === topicKey;
              const detail = details.find((d) => d.key === topicKey);
              const topicDisplayName = detail?.displayName || normalizeSpacedAcronyms(
                resolveComponentName(topic.schemaId, componentNameBySchemaName) ||
                topic.displayName
              );
              const duration = formatDuration(detail?.executionTime ?? topic.executionTime);
              return (
              <div key={index}>
                {connector}
                <Button
                  appearance="transparent"
                  className={mergeClasses(styles.topicCard, isSelected && styles.topicCardSelected)}
                  onClick={(e) => { e.stopPropagation(); onTopicSelect?.(isSelected ? null : topicKey); }}
                  aria-pressed={isSelected}
                  aria-label={topicDisplayName}
                >
                <span
                  className={styles.topicIconContainer}
                  aria-hidden="true"
                >
                  {(() => { const TopicIcon = getTopicIcon(topic.schemaId, topic.type, detail?.observation); return <TopicIcon style={{ width: "20px", height: "20px", color: getTopicIconColor(topic.schemaId, topic.type) }} />; })()}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <Text className={styles.topicName}>{topicDisplayName}</Text>
                  <br />
                  <Text className={styles.topicLabel}>
                    {detail?.typeLabel ?? formatTopicType(
                      topic.type,
                      topic.observation,
                      topic.schemaId,
                      componentNameBySchemaName?.[topic.schemaId]
                    )}
                  </Text>
                </span>
                {duration && (
                  <span className={styles.topicDuration}>
                    <Clock16Regular />
                    {duration}
                  </span>
                )}
                </Button>
              </div>
              );
            });
          })()}
        </div>
      )}

      {/* Loading state */}
      {expanded && connectedAgent.isFetching && (
        <div style={{ marginTop: tokens.spacingVerticalS, textAlign: "center" }}>
          <Spinner size="tiny" label="Fetching connected agent transcript..." />
        </div>
      )}

      {/* Error state */}
      {expanded && connectedAgent.fetchError && (
        <div className={styles.errorText}>
          <ErrorCircle16Regular />
          {connectedAgent.fetchError}
        </div>
      )}

      {expanded && connectedAgent.isFetched && connectedAgent.childTopics.length === 0 && (
        <Text className={styles.statusText}>No child steps captured</Text>
      )}

      {/* Fetch or retry when not yet fetched — hidden in snapshot mode */}
      {expanded &&
        !snapshotMode &&
        !connectedAgent.isFetched &&
        !connectedAgent.isFetching && (
          <Button
            style={{ marginTop: tokens.spacingVerticalS }}
            appearance="subtle"
            size="small"
            icon={<ArrowDownload24Regular />}
            onClick={handleFetch}
          >
            {connectedAgent.fetchError ? "Retry connected agent details" : "Load connected agent details"}
          </Button>
        )}
      {expanded && snapshotMode && !connectedAgent.isFetched && (
        <Text
          style={{
            fontSize: "11px",
            color: "var(--colorNeutralForeground3)",
            marginTop: tokens.spacingVerticalXS,
            display: "block",
            fontStyle: "italic",
          }}
        >
          Child agent details not available in snapshot mode
        </Text>
      )}

      {/* Footer with total and toggle */}
      {expanded && connectedAgent.isFetched && totalTopics > 0 && (
        <div className={styles.footer}>
          <Text className={styles.totalCount}>
            <ChatBubblesQuestion16Regular />
            Total {totalTopics}
          </Text>
          <Button
            appearance="transparent"
            size="small"
            icon={
              expanded ? (
                <ChevronUp20Regular />
              ) : (
                <ChevronDown20Regular />
              )
            }
            iconPosition="after"
            onClick={handleToggle}
            aria-expanded={expanded}
          >
            {expanded ? "Show less" : "Show more"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Returns the user-facing subtitle for a child topic. Prefers `guessStepSubtitle`
 * (shared with the parent debug panel) when we have a real schemaId — that way
 * "Topic" / "Knowledge" / "Tool" / "Connector Action" / "Code" / "Custom Prompt"
 * / "Flow" / "Connected agent" / "Deep reasoning" classifications match the
 * parent exactly. Falls back to a coarse type → label map for plan-only entries
 * extracted from `DynamicPlanReceived` (no execution data, schemaId-only).
 */
function formatTopicType(
  type: string,
  observation?: unknown,
  schemaId?: string,
  componentInfo?: ComponentInfo
): string {
  // MCPServer is synthesized by extractChildTopics from DynamicServerInitialize
  // — it isn't a plan step, so don't try guessStepSubtitle (which would just
  // echo the raw type string back).
  if (type === "MCPServer") return "Model Context Protocol";
  if (schemaId) {
    const subtitle = guessStepSubtitle(schemaId, type, componentInfo, observation);
    if (subtitle) return subtitle;
  }
  // Custom prompt override (legacy fallback when no schemaId).
  if ((type === "ConnectorAction" || type === "Action") && hasPredictionOutput(observation))
    return "Custom Prompt";
  switch (type) {
    case "CustomTopic":
      return "Topic";
    case "KnowledgeSource":
      return "Knowledge";
    case "ConnectorAction":
      return "Connector Action";
    case "LlmSkill":
      return "Tool";
    case "Action":
      return "Action";
    case "BuiltIn":
      return "Built-in Tool";
    default:
      return type || "Step";
  }
}

/** Checks whether an observation contains predictionOutput — definitive AI Builder signal. */
function hasPredictionOutput(observation: unknown): boolean {
  if (!observation || typeof observation !== "object") return false;
  const obs = observation as Record<string, unknown>;
  return "predictionOutput" in obs || "predictionId" in obs;
}

/**
 * Returns a Fluent UI icon component for connected agent child topics. Mirrors the
 * parent flow's `pickStepIcon` so the SAME component type shows the SAME icon
 * everywhere (parent activity cards, connected-agent topics, and the detail-panel
 * header) across both classic and new-designer transcripts.
 */
export function getTopicIcon(
  schemaId: string,
  type: string,
  observation?: unknown
): React.ComponentType<React.SVGProps<SVGSVGElement>> {
  if (type === "MCPServer") return Server20Regular;
  if (schemaId === "P:CodeTool") return Code20Regular;
  if (schemaId === "P:ReasonerTool") return BrainSparkle20Regular;
  if (type === "KnowledgeSource" || schemaId.startsWith("P:UniversalSearch"))
    return BookOpenLightbulb20Regular;
  // Real new-designer skills (InlineAgentSkill) → custom purple-gradient skill glyph.
  if (type === "Skill") return SkillIcon;
  // "LlmSkill" is Copilot Studio's internal name for an LLM-invocable *tool* (e.g. an
  // MCP/connector tool). It is labelled "Tool" everywhere (see guessStepSubtitle /
  // formatTopicType), so it must use the wrench tool icon — not the skill glyph.
  // Checked before the connector / ".action." branches so its label and icon agree.
  if (type === "LlmSkill") return Wrench20Regular;
  // Connected / child agents → bot (consistent with the parent flow).
  if (type === "Agent") return Bot20Regular;
  if (type === "CustomTopic" || schemaId.includes(".topic."))
    return ChatSparkle20Regular;
  if (schemaId.includes("InvokeFlowTaskAction") || type === "Flow")
    return Flow20Regular;
  // Custom Prompt detection: observation ground truth first, then name pattern
  if (hasPredictionOutput(observation) || schemaId.includes("InvokeAIBuilderModelTaskAction") || /\.action\.customprompt/i.test(schemaId))
    return Prompt20Regular;
  // Power Automate Cloud Flow added as agent action (no `{Connector}-{Operation}` dash).
  if (schemaId.includes(".action.")) {
    const actionSegment = schemaId.split(".action.").pop() ?? "";
    if (actionSegment && !/^[A-Za-z0-9]+-/.test(actionSegment)) return Flow20Regular;
  }
  // Classic connector actions — ConnectorAction type or `.action.` schemaId.
  if (type === "ConnectorAction" || schemaId.includes(".action."))
    return Connector20Regular;
  // New-designer generic/MCP tools (toolKind "tool" → type "Action") → wrench,
  // matching the parent flow's "Tool" icon (was incorrectly the connector icon).
  if (type === "Action" || type === "Tool") return Wrench20Regular;
  return ChatSparkle20Regular;
}

/**
 * Icon colour (hex) for a connected-agent topic — mirrors the parent flow's
 * `stepCardIcon*` palette so a given component type is the same colour in the
 * connected-agent card as it is on the parent activity cards.
 */
function getTopicIconColor(schemaId: string, type: string): string {
  if (type === "MCPServer") return COMPONENT_COLORS["MCP server"];
  if (schemaId === "P:CodeTool") return COMPONENT_COLORS.Code;
  if (schemaId === "P:ReasonerTool") return COMPONENT_COLORS["Deep reasoning"];
  if (type === "KnowledgeSource" || schemaId.startsWith("P:UniversalSearch"))
    return COMPONENT_COLORS.Knowledge;
  if (type === "Skill") return COMPONENT_COLORS.Skill;
  if (type === "LlmSkill") return COMPONENT_COLORS.Tool; // LLM tool (labelled "Tool")
  if (schemaId.includes("InvokeFlowTaskAction") || type === "Flow") return COMPONENT_COLORS.Flow;
  if (schemaId.includes(".action.")) {
    const seg = schemaId.split(".action.").pop() ?? "";
    if (seg && !/^[A-Za-z0-9]+-/.test(seg)) return COMPONENT_COLORS.Flow; // cloud flow added as action
  }
  if (type === "ConnectorAction" || schemaId.includes(".action."))
    return COMPONENT_COLORS["Connector Action"];
  if (type === "Action" || type === "Tool") return COMPONENT_COLORS.Tool;
  return DEFAULT_COMPONENT_COLOR; // topic / agent / custom prompt / default
}

/** Formats "hh:mm:ss.fffffff" into a short duration label like "16.42s" or "1m 23s". */
function formatDuration(executionTime?: string): string | undefined {
  if (!executionTime) return undefined;
  const parts = String(executionTime).trim().split(":");
  if (parts.length < 3) return undefined;
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  const seconds = parseFloat(parts[2]) || 0;
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  if (totalSeconds <= 0) return undefined;
  // Delegate to the shared formatter so durations scale (ms -> s -> m -> h -> d)
  // consistently with the rest of the Agent Debugger.
  return formatDurationMs(totalSeconds * 1000);
}

// ─── Topic Detail Types & Helpers ──────────────────────────────────

export interface ConnectedAgentTopicDetail {
  key: string;
  schemaId: string;
  /** Plan step id of the producing step exec — used to correlate with the parent turn's stepExecutions. */
  stepId?: string;
  displayName: string;
  rawType: string;
  typeLabel: string;
  hasExecution: boolean;
  thought?: string;
  stateLabel?: string;
  executionTime?: string;
  inputs: Array<[string, string]>;
  output?: string;
  observation?: unknown;
}

interface StepExecLike {
  taskDialogId?: string;
  stepId?: string;
  thought?: string;
  arguments?: Record<string, unknown>;
  observation?: unknown;
  executionTime?: string;
  triggeredAt?: string;
  finishedAt?: string;
  state?: number | string;
}

/** Collects StepExecution entries from the connected agent's child transcript turns. */
export function collectExecutionEntries(
  connectedAgent: ConnectedAgentInfo
): StepExecLike[] {
  const entries: StepExecLike[] = [];
  if (!connectedAgent.childTranscript) return entries;
  for (const turn of connectedAgent.childTranscript) {
    const execs = turn.debugInfo?.stepExecutions;
    if (Array.isArray(execs)) {
      for (const exec of execs) entries.push(exec as StepExecLike);
    }
  }
  return entries;
}

/** Formats an observation value for display. */
export function formatObservation(obs: unknown): string {
  if (obs === null || obs === undefined) return "";
  if (typeof obs === "string") return obs;

  const rec = obs as Record<string, unknown>;

  // Search results format
  const searchResult = rec?.search_result as Record<string, unknown> | undefined;
  const searchResults = (searchResult?.search_results ?? rec?.search_results) as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(searchResults) && searchResults.length > 0) {
    const lines = searchResults.slice(0, 5).map((r, i) => {
      const title = String(r?.title ?? r?.name ?? `Result ${i + 1}`);
      const url = String(r?.url ?? "");
      const snippet = String(r?.snippet ?? r?.text ?? "").slice(0, 150);
      return `- ${title}${url ? `\n  ${url}` : ""}${snippet ? `\n  ${snippet}...` : ""}`;
    });
    return `Search results:\n${lines.join("\n")}`;
  }

  // Generic object
  try {
    const json = JSON.stringify(obs, null, 2);
    if (json === "{}" || json === "[]") return "";
    return json;
  } catch {
    return String(obs);
  }
}

/** Builds topic detail records by correlating child topics with child transcript executions. */
export function buildConnectedAgentTopicDetails(
  connectedAgent: ConnectedAgentInfo,
  componentNameBySchemaName?: Record<string, ComponentInfo>
): ConnectedAgentTopicDetail[] {
  const executionEntries = collectExecutionEntries(connectedAgent);

  // Map by taskDialogId → latest execution
  const latestBySchemaId = new Map<string, StepExecLike>();
  for (const exec of executionEntries) {
    if (exec.taskDialogId) latestBySchemaId.set(exec.taskDialogId, exec);
  }

  return connectedAgent.childTopics.map((topic, index) => {
    // Prefer the topic's own execution data (populated by buildChildTopicsFromTurns
    // which iterates step executions one-per-invocation, preserving multiple
    // invocations of the same taskDialogId). Fall back to the global per-schema
    // map for legacy plan-only topics that didn't carry execution data.
    const fallbackExec = latestBySchemaId.get(topic.schemaId);
    const hasExecution = Boolean(topic.hasExecution || fallbackExec);

    const topicThought = typeof topic.thought === "string" ? topic.thought.trim() : "";
    const fallbackThought = fallbackExec?.thought?.trim() || "";
    const thought = topicThought || fallbackThought || undefined;

    const argSource = topic.arguments ?? fallbackExec?.arguments;
    const inputs: Array<[string, string]> = [];
    if (argSource && typeof argSource === "object") {
      for (const [k, v] of Object.entries(argSource)) {
        inputs.push([k, typeof v === "string" ? v : JSON.stringify(v)]);
      }
    }

    const observation = topic.observation ?? fallbackExec?.observation;
    const output = formatObservation(observation);

    const stateLabel = (() => {
      if (!hasExecution) return undefined;
      const s = topic.state ?? fallbackExec?.state;
      if (typeof s === "string") return s === "completed" ? "Completed" : s === "failed" ? "Failed" : s;
      return undefined;
    })();

    const displayName = normalizeSpacedAcronyms(
      resolveComponentName(topic.schemaId, componentNameBySchemaName) || topic.displayName
    );

    // Recover the real duration when the orchestrator zeroed it for nested
    // sub-plans — the resolver falls back to finishedAt-triggeredAt.
    const resolvedExecutionTime = resolveExecutionTimeString({
      executionTime: topic.executionTime ?? fallbackExec?.executionTime,
      triggeredAt: fallbackExec?.triggeredAt,
      finishedAt: fallbackExec?.finishedAt,
    });

    return {
      key: `${topic.schemaId}:${index}`,
      schemaId: topic.schemaId,
      stepId: topic.stepId ?? fallbackExec?.stepId,
      displayName,
      rawType: topic.type,
      typeLabel: formatTopicType(
        topic.type,
        observation,
        topic.schemaId,
        componentNameBySchemaName?.[topic.schemaId]
      ),
      hasExecution,
      thought,
      stateLabel,
      executionTime: resolvedExecutionTime,
      inputs,
      output,
      observation,
    };
  });
}

export default ConnectedAgentCard;
