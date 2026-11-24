/**
 * RecommendationsPanel — displays actionable recommendations derived from
 * the conversation transcript. Rendered inside analysisTabContent.
 */

import React, { useCallback, useState } from "react";
import {
  makeStyles,
  mergeClasses,
  tokens,
  Card,
  Body1Strong,
  Caption1,
  Caption1Strong,
  Badge,
  Button,
  Tooltip,
} from "@fluentui/react-components";
import {
  ErrorCircle20Filled,
  Warning20Filled,
  Info20Regular,
  ArrowRight16Regular,
  CheckmarkCircle20Regular,
} from "@fluentui/react-icons";
import type { Recommendation, RecommendationSeverity } from "../utils/recommendations";
import { getMockRecommendations } from "../utils/recommendations";

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingVerticalM,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
  },
  summaryRow: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    paddingBottom: tokens.spacingVerticalXS,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    maxHeight: "800px",
    overflowY: "auto",
  },
  // Base card layout — Fluent UI Card fills width, flex row for icon + body
  recCard: {
    width: "100%",
    borderLeftWidth: tokens.strokeWidthThick,
    borderLeftStyle: "solid",
    borderLeftColor: tokens.colorNeutralStroke1,
  },
  recCardHigh: {
    borderLeftColor: tokens.colorPaletteRedBorderActive,
    backgroundColor: tokens.colorPaletteRedBackground1,
  },
  recCardMedium: {
    borderLeftColor: tokens.colorPaletteYellowBorderActive,
    backgroundColor: tokens.colorPaletteYellowBackground1,
  },
  recCardLow: {
    borderLeftColor: tokens.colorNeutralStroke1,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  cardInner: {
    display: "flex",
    flexDirection: "row",
    gap: tokens.spacingHorizontalM,
    alignItems: "flex-start",
  },
  severityIcon: {
    flexShrink: 0,
    marginTop: tokens.spacingVerticalXXS,
  },
  iconHigh:   { color: tokens.colorPaletteRedForeground1 },
  iconMedium: { color: tokens.colorPaletteYellowForeground1 },
  iconLow:    { color: tokens.colorNeutralForeground3 },
  cardBody: {
    flex: "1 1 0",
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXXS,
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  },
  cardHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalS,
    flexWrap: "wrap",
  },
  titleRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: tokens.spacingHorizontalXS,
    flex: "1 1 0",
    minWidth: 0,
    flexWrap: "wrap",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  },
  category: {
    flexShrink: 0,
  },
  // Explicit token properties — spread of typographyStyles breaks in Griffel
  suggestionLabel: {
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
    fontStyle: "italic",
  },
  suggestion: {
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    color: tokens.colorNeutralForeground2,
    fontStyle: "italic",
    display: "block",
  },
  // Wide tooltip content — fills available horizontal space up to 640px
  tooltipContent: {
    maxWidth: "900px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.spacingVerticalS,
    padding: `${tokens.spacingVerticalXL} 0`,
    textAlign: "center" as const,
  },
  emptyIcon: {
    color: tokens.colorPaletteGreenForeground1,
  },
  examplesBanner: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    border: `${tokens.strokeWidthThin} dashed ${tokens.colorNeutralStroke1}`,
    marginBottom: tokens.spacingVerticalS,
  },
});

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

type SeverityConfig = {
  icon: (className: string) => React.ReactElement;
  cardClass: "recCardHigh" | "recCardMedium" | "recCardLow";
  iconClass: "iconHigh" | "iconMedium" | "iconLow";
  badgeColor: "danger" | "warning" | "subtle";
  label: string;
};

const SEVERITY_CONFIG: Record<RecommendationSeverity, SeverityConfig> = {
  high:   { icon: (c) => <ErrorCircle20Filled className={c} />, cardClass: "recCardHigh",   iconClass: "iconHigh",   badgeColor: "danger",  label: "High" },
  medium: { icon: (c) => <Warning20Filled className={c} />,     cardClass: "recCardMedium", iconClass: "iconMedium", badgeColor: "warning", label: "Medium" },
  low:    { icon: (c) => <Info20Regular className={c} />,        cardClass: "recCardLow",   iconClass: "iconLow",    badgeColor: "subtle",  label: "Low" },
};

// Enforce Badge text ≤ 3 words per Fluent UI guidelines
function truncateCategory(cat: string): string {
  const words = cat.trim().split(/\s+/);
  return words.length > 3 ? words.slice(0, 3).join(" ") : cat;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface RecommendationsPanelProps {
  recommendations: Recommendation[];
  onTurnSelect: (turnId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// Characters shown before tooltip truncation kicks in
const TOOLTIP_THRESHOLD = 160;

export function RecommendationsPanel({ recommendations, onTurnSelect }: RecommendationsPanelProps) {
  const styles = useStyles();
  const [showExamples, setShowExamples] = useState(false);

  const handleGoToTurn = useCallback((turnId: string) => onTurnSelect(turnId), [onTurnSelect]);

  // Decide which list to render
  const isExampleMode = showExamples && recommendations.length === 0;
  const displayRecs = isExampleMode ? getMockRecommendations() : recommendations;

  const highCount   = displayRecs.filter((r) => r.severity === "high").length;
  const mediumCount = displayRecs.filter((r) => r.severity === "medium").length;
  const lowCount    = displayRecs.filter((r) => r.severity === "low").length;

  // No real issues — show empty state with "Show examples" option
  if (recommendations.length === 0 && !showExamples) {
    return (
      <div className={styles.root}>
        <div className={styles.emptyState}>
          <CheckmarkCircle20Regular className={styles.emptyIcon} style={{ width: 32, height: 32 }} />
          <Body1Strong>No issues detected</Body1Strong>
          <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
            The conversation transcript looks healthy — no performance, error, or quality issues were found.
          </Caption1>
          <Button
            appearance="subtle"
            size="small"
            onClick={() => setShowExamples(true)}
          >
            Preview all recommendation types
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>

      {/* Summary row */}
      <div className={styles.summaryRow}>
        <Caption1Strong>
          {recommendations.length} issue{recommendations.length !== 1 ? "s" : ""} found
        </Caption1Strong>
        {highCount > 0 && (
          <Badge appearance="tint" color="danger" shape="rounded" size="small">{highCount} High</Badge>
        )}
        {mediumCount > 0 && (
          <Badge appearance="tint" color="warning" shape="rounded" size="small">{mediumCount} Medium</Badge>
        )}
        {lowCount > 0 && (
          <Badge appearance="tint" color="subtle" shape="rounded" size="small">{lowCount} Low</Badge>
        )}
      </div>

      {/* Examples mode banner */}
      {isExampleMode && (
        <div className={styles.examplesBanner}>
          <Caption1 style={{ flex: "1 1 0", color: tokens.colorNeutralForeground2 }}>
            Showing example recommendations — these are mock examples of all possible types, not real issues.
          </Caption1>
          <Button appearance="subtle" size="small" onClick={() => setShowExamples(false)}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Recommendation cards */}
      <div className={styles.list}>
        {displayRecs.map((rec) => {
          const cfg = SEVERITY_CONFIG[rec.severity];
          const iconEl = cfg.icon(mergeClasses(styles.severityIcon, styles[cfg.iconClass]));

          return (
            <Card
              key={rec.id}
              appearance="filled"
              className={mergeClasses(styles.recCard, styles[cfg.cardClass])}
              aria-label={`${cfg.label} severity: ${rec.title}`}
            >
              <div className={styles.cardInner}>

                {/* Severity icon */}
                <span aria-hidden="true">{iconEl}</span>

                {/* Body */}
                <div className={styles.cardBody}>
                  <div className={styles.cardHeader}>

                    {/* Category + title */}
                    <div className={styles.titleRow}>
                      <Badge
                        appearance="tint"
                        color={cfg.badgeColor}
                        shape="rounded"
                        size="small"
                        className={styles.category}
                      >
                        {truncateCategory(rec.category)}
                      </Badge>
                      <Body1Strong style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}>{rec.title}</Body1Strong>
                    </div>

                    {/* Go to turn button */}
                    {rec.turnId && (
                      <Tooltip
                        content={`Jump to turn ${rec.turnNumber} in Conversation Preview`}
                        relationship="description"
                      >
                        <Button
                          appearance="transparent"
                          size="small"
                          icon={<ArrowRight16Regular aria-hidden="true" />}
                          iconPosition="after"
                          onClick={() => handleGoToTurn(rec.turnId!)}
                          aria-label={`Go to turn ${rec.turnNumber}`}
                        >
                          Turn {rec.turnNumber}
                        </Button>
                      </Tooltip>
                    )}
                  </div>

                  {/* Description — truncated with wide tooltip if too long */}
                  {rec.description.length > TOOLTIP_THRESHOLD ? (
                    <Tooltip
                      content={{ children: rec.description, className: styles.tooltipContent }}
                      relationship="description"
                      positioning="below-start"
                      withArrow
                    >
                      <Caption1 tabIndex={0} style={{ cursor: "help" }}>
                        {rec.description.substring(0, TOOLTIP_THRESHOLD)}…
                      </Caption1>
                    </Tooltip>
                  ) : (
                    <Caption1>{rec.description}</Caption1>
                  )}

                  {/* Suggestion — always shown, truncated with wide tooltip if too long */}
                  {rec.suggestion.length > TOOLTIP_THRESHOLD ? (
                    <Tooltip
                      content={{ children: rec.suggestion, className: styles.tooltipContent }}
                      relationship="description"
                      positioning="below-start"
                      withArrow
                    >
                      <span className={styles.suggestion} tabIndex={0} style={{ cursor: "help" }}>
                        <span className={styles.suggestionLabel}>Suggestion: </span>
                        {rec.suggestion.substring(0, TOOLTIP_THRESHOLD)}…
                      </span>
                    </Tooltip>
                  ) : (
                    <span className={styles.suggestion}>
                      <span className={styles.suggestionLabel}>Suggestion: </span>
                      {rec.suggestion}
                    </span>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
