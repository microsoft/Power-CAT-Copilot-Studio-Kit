import * as React from "react";
import { useEffect, useRef, useState } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-python";
import "prismjs/components/prism-json";
import "prismjs/themes/prism.css";
import {
  Badge,
  Body1Strong,
  Button,
  Link,
  Text,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import type { Activity, ProcessedTurn } from "../../contracts/transcript";
import type { FlowStep } from "../../contracts/flow-step";
import type { ComponentInfo } from "../../services/botcomponents-service";
import { useDebugStyles } from "../../styles/useDebugStyles";
import type {
  ResponseGeneratorSupport,
  UniversalSearchTrace,
} from "../../utils/activity-trace-selectors";
import {
  asRecord,
  extractCapiResourceUsage,
  formatActivityTimestamp,
  formatScorePercentage,
  formatTaskName,
  lookupComponentDisplayName,
  readBoolean,
  readNumber,
  readString,
} from "../../utils/build-flow-steps";
import CopyButton from "../ui/CopyButton";
import { JsonCode } from "../ui/JsonViewer";
import { MarkdownContent } from "../ui/MarkdownContent";

function getReasoningTraceContent(
  activities: Activity[],
  taskDialogId: string,
): string | undefined {
  for (let i = activities.length - 1; i >= 0; i -= 1) {
    const a = activities[i];
    if (a?.name !== "ReasoningTraceData" && a?.valueType !== "ReasoningTraceData") continue;
    const v = asRecord(a.value);
    const toolId = readString(v, "toolId") ?? "";
    if (toolId === taskDialogId || !toolId) {
      return readString(v, "responseContent");
    }
  }
  return undefined;
}

function parseReasoningOutput(raw: unknown): { answer: string; reason: string } {
  const text = typeof raw === "string" ? raw : (() => {
    const rec = asRecord(raw);
    return readString(rec, "result") ?? readString(rec, "response") ?? "";
  })();
  const parts = text.split(/\n\s*Reason:\s*/);
  return {
    answer: (parts[0] ?? "").trim(),
    reason: (parts[1] ?? "").trim(),
  };
}

function stripIdLikeFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripIdLikeFields);
  if (!value || typeof value !== "object") return value;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const keyLower = k.toLowerCase();
    // Per requirement: do not show any id fields.
    // Treat both exact "id" and anything ending with "id" as an id field (conversationId, activityId, etc.).
    if (keyLower === "id" || keyLower.endsWith("id")) continue;
    out[k] = stripIdLikeFields(v);
  }
  return out;
}

function isJsonLikeValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "object") return true;
  // Check if it's a JSON string that can be parsed
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        JSON.parse(trimmed);
        return true;
      } catch {
        return false;
      }
    }
  }
  return false;
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value.trim());
    } catch {
      return value;
    }
  }
  return value;
}

function SyntaxHighlightedCode({
  code,
  maxHeight = "240px",
  language = "python",
}: {
  code: string;
  maxHeight?: string;
  language?: "python" | "json";
}) {
  const styles = useDebugStyles();
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (codeRef.current) {
      Prism.highlightElement(codeRef.current);
    }
  }, [code, language]);

  return (
    <pre className={styles.codeBlock} style={{ maxHeight }}>
      <code ref={codeRef} className={`language-${language}`}>
        {code}
      </code>
    </pre>
  );
}

function SmartValueDisplay({
  value,
  maxHeight = "240px",
  emptyText = "(empty)",
  displayMode = "auto",
}: {
  value: unknown;
  maxHeight?: string;
  emptyText?: string;
  /**
   * - "auto" — syntax-highlighted JSON code block for objects/arrays, plain pre for primitives.
   * - "code" — Python-style syntax-highlighted code block; expects a string.
   * - "json-code" — JSON-style syntax-highlighted code block with optional
   *   line-prefix gutter; non-string values are stringified before render.
   */
  displayMode?: "auto" | "code" | "json-code";
}) {
  if (displayMode === "code" && typeof value === "string") {
    return <SyntaxHighlightedCode code={value} maxHeight={maxHeight} />;
  }
  if (displayMode === "json-code") {
    if (value === null || value === undefined || value === "") {
      return <span style={{ color: tokens.colorNeutralForeground3 }}>{emptyText}</span>;
    }
    return <JsonCode data={parseJsonValue(value)} maxHeight={maxHeight} />;
  }
  if (value === null || value === undefined || value === "") {
    return <span style={{ color: tokens.colorNeutralForeground3 }}>{emptyText}</span>;
  }

  if (isJsonLikeValue(value)) {
    const parsed = parseJsonValue(value);
    return <JsonCode data={parsed} maxHeight={maxHeight} />;
  }

  if (typeof value === "string") {
    return <MarkdownContent text={value} />;
  }

  // For simple non-string values (number, boolean)
  return (
    <pre style={{
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      overflowWrap: "break-word",
      fontSize: tokens.fontSizeBase200,
      margin: 0,
      fontFamily: "inherit",
    }}>
      {String(value)}
    </pre>
  );
}

function uniqStrings(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    const s = String(v ?? "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

const BUILTIN_KNOWLEDGE_SOURCES: Record<string, string> = {
  BingUnscopedSearchKnowledge: "Bing Web Search",
  BingScopedSearchKnowledge: "Bing Scoped Search",
  DataverseSearchKnowledge: "Dataverse Search",
  SharePointSearchKnowledge: "SharePoint Search",
};

const SEARCH_RESULT_TYPE_LABELS: Record<string, string> = {
  AzoresBingUnscopedSearch: "Bing Web Search",
  AzoresBingScopedSearch: "Bing Scoped Search",
  DataverseSearch: "Dataverse",
  SharePointSearch: "SharePoint",
};

function formatSearchResultType(type: string): string {
  return SEARCH_RESULT_TYPE_LABELS[type] || type;
}

function formatKnowledgeSourceLabel(
  schemaName: string,
  map?: Record<string, ComponentInfo>
): string {
  const trimmed = String(schemaName ?? "").trim();
  if (!trimmed) return "";

  // Check built-in knowledge source types first
  const builtIn = BUILTIN_KNOWLEDGE_SOURCES[trimmed];
  if (builtIn) return builtIn;

  if (!map) return "";
  const friendly = map[trimmed];
  if (!friendly) return "";
  return friendly.modelDisplayName?.trim() || friendly.name.trim();
}

export function ErrorDetails({
  turn,
  activityIndex,
  fallbackStep,
  componentNameBySchemaName,
}: {
  turn: ProcessedTurn | null;
  activityIndex?: number;
  fallbackStep?: FlowStep;
  componentNameBySchemaName?: Record<string, ComponentInfo>;
}) {
  const styles = useDebugStyles();
  const activities: Activity[] = Array.isArray(turn?.activities)
    ? (turn!.activities as Activity[])
    : [];

  const toErrorItem = (a: Activity) => {
    const v = asRecord(a.value);
    const relatedBlocked = (() => {
      const idx = activities.indexOf(a);
      if (idx < 0) return undefined;
      for (let j = idx - 1; j >= 0; j -= 1) {
        const prev = activities[j];
        if (prev?.name !== "DynamicPlanStepBlocked") continue;
        if (
          a?.replyToId &&
          prev?.replyToId &&
          String(prev.replyToId) !== String(a.replyToId)
        )
          continue;
        return prev;
      }
      return undefined;
    })();

    const blockedValue = asRecord(relatedBlocked?.value);

    const nodeSchemaName = readString(blockedValue, "taskDialogId") ?? "";
    const nodeName = lookupComponentDisplayName(nodeSchemaName, componentNameBySchemaName) || formatTaskName(nodeSchemaName);

    return {
      eventType: "ErrorTraceData",
      timestamp: formatActivityTimestamp(a.timestamp),
      stepId: readString(blockedValue, "stepId") ?? "",
      node: nodeName,
      errorCode: readString(v, "errorCode") ?? "",
      errorSubCode: (() => { const sc = readString(v, "errorSubCode") ?? ""; return sc.toLowerCase() === "undefined" ? "" : sc; })(),
      errorMessage: readString(v, "errorMessage") ?? "",
      isUserError: v?.["isUserError"],
    };
  };

  const errors = (() => {
    if (typeof activityIndex === "number" && Number.isInteger(activityIndex)) {
      const a = activities[activityIndex];
      const isErr =
        a?.type === "trace" &&
        (a?.valueType === "ErrorTraceData" || a?.name === "ErrorTraceData");
      if (isErr) return [toErrorItem(a as Activity)];
    }

    const mapped = activities
      .filter(
        (a) =>
          a?.type === "trace" &&
          (a?.valueType === "ErrorTraceData" || a?.name === "ErrorTraceData")
      )
      .map((a) => toErrorItem(a as Activity));

    if (mapped.length > 0) return mapped;

    if (fallbackStep) {
      const nodeSchemaName = fallbackStep.taskDialogId || "";
      const nodeName = lookupComponentDisplayName(nodeSchemaName, componentNameBySchemaName) || formatTaskName(nodeSchemaName);
      return [
        {
          eventType: "Error",
          timestamp: "",
          stepId: fallbackStep.stepId || "",
          node: nodeName,
          errorCode: fallbackStep.errorCode || "",
          errorSubCode: fallbackStep.errorSubCode || "",
          errorMessage: fallbackStep.errorMessage || "",
          isUserError: undefined as unknown,
        },
      ];
    }

    return [];
  })();

  if (!errors.length) {
    return (
      <Text
        style={{
          fontSize: tokens.fontSizeBase300,
          color: tokens.colorNeutralForeground3,
        }}
      >
        No error details captured for this turn.
      </Text>
    );
  }

  return (
    <div className={styles.spaceY4}>
      {errors.map((item, idx) => (
        <div key={`${item.eventType}:${idx}`} className={styles.spaceY4}>
          {/* Description — same pattern as StepDetails */}
          <DetailTextSection
            title="Description"
            content={item.errorMessage}
          />

          {/* Error Details — metadata fields */}
          {(() => {
            const entries: Array<[string, unknown]> = [];
            if (item.errorCode) entries.push(["Error Code", item.errorCode]);
            if (item.errorSubCode) entries.push(["Error Sub Code", item.errorSubCode]);
            if (item.node) entries.push(["Error Source", item.node]);
            if (item.isUserError !== undefined && item.isUserError !== null) entries.push(["User Error", String(item.isUserError)]);
            if (item.timestamp) entries.push(["Timestamp", item.timestamp]);
            if (!entries.length) return null;
            return (
              <div style={{ marginBottom: tokens.spacingVerticalXS }}>
                <DetailSectionTitle>Error Details</DetailSectionTitle>
                <div className={styles.spaceY3} style={{ marginTop: tokens.spacingVerticalS }}>
                  {entries.map(([k, v]) => (
                    <DetailValueField key={k} label={k} value={v} showType={false} />
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      ))}
    </div>
  );
}

export function VariableAssignmentDetails({
  turn,
  activityIndex,
}: {
  turn: ProcessedTurn | null;
  activityIndex?: number;
}) {
  const activities: Activity[] = Array.isArray(turn?.activities)
    ? (turn!.activities as Activity[])
    : [];
  const toAssignment = (a: Activity) => {
    const v = asRecord(a.value);
    return {
      timestamp: formatActivityTimestamp(a.timestamp),
      name: readString(v, "name") ?? "",
      varType: readString(v, "type") ?? "",
      newValue: v?.["newValue"],
    };
  };

  const assignments = (() => {
    if (typeof activityIndex === "number" && Number.isInteger(activityIndex)) {
      const a = activities[activityIndex];
      if (a?.valueType === "VariableAssignment")
        return [toAssignment(a as Activity)];
    }

    return activities
      .filter((a) => a?.valueType === "VariableAssignment")
      .map((a) => toAssignment(a as Activity));
  })();

  const styles = useDebugStyles();

  if (!assignments.length) {
    return (
      <Text
        style={{
          fontSize: tokens.fontSizeBase300,
          color: tokens.colorNeutralForeground3,
        }}
      >
        No variable assignment details captured for this message.
      </Text>
    );
  }

  return (
    <div className={styles.spaceY4}>
      {assignments.map((a, idx) => (
        <div key={`${a.name || "var"}:${idx}`} className={styles.spaceY4}>
          {/* New Value */}
          <div style={{ marginBottom: tokens.spacingVerticalXS }}>
            <DetailSectionTitle>New Value</DetailSectionTitle>
            <div className={styles.spaceY3} style={{ marginTop: tokens.spacingVerticalS }}>
              <DetailOutputField
                label="Value"
                value={a.newValue}
                maxHeight="240px"
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function IntentRecognitionDetails({
  turn,
  activityIndex,
}: {
  turn: ProcessedTurn | null;
  activityIndex?: number;
}) {
  const styles = useDebugStyles();
  const activities: Activity[] = Array.isArray(turn?.activities)
    ? (turn!.activities as Activity[])
    : [];

  const toIntent = (a: Activity) => {
    const v = asRecord(a.value);
    const scoreRec = asRecord(v?.intentScore);
    return {
      timestamp: formatActivityTimestamp(a.timestamp),
      intentTitle: readString(v, "intentTitle") ?? "",
      intentType: readNumber(v, "intentType"),
      triggerUtterance: readString(v, "triggerUtterance") ?? "",
      normalizedTriggerUtterance:
        readString(v, "normalizedTriggerUtterance") ?? "",
      intentId: readString(v, "intentId") ?? "",
      score: readNumber(scoreRec, "score"),
      scoreProperties: scoreRec ? scoreRec["properties"] : undefined,
      raw: v,
    };
  };

  const intents = (() => {
    if (typeof activityIndex === "number" && Number.isInteger(activityIndex)) {
      const a = activities[activityIndex];
      const isIntentRecognition =
        a?.valueType === "IntentRecognition" || a?.name === "IntentRecognition";
      if (isIntentRecognition) return [toIntent(a as Activity)];
    }

    return activities
      .filter(
        (a) =>
          a?.valueType === "IntentRecognition" || a?.name === "IntentRecognition"
      )
      .map((a) => toIntent(a as Activity));
  })();

  if (!intents.length) {
    return (
      <Text
        style={{
          fontSize: tokens.fontSizeBase300,
          color: tokens.colorNeutralForeground3,
        }}
      >
        No intent recognition details captured for this message.
      </Text>
    );
  }

  return (
    <div className={styles.spaceY4}>
      {intents.map((intent, idx) => (
        <div key={`${intent.intentId || intent.intentTitle || "intent"}:${idx}`} className={styles.spaceY4}>
          {/* Intent Details */}
          {(() => {
            const entries: Array<[string, unknown]> = [];
            if (intent.intentType !== undefined) entries.push(["Intent Type", intent.intentType]);
            if (intent.score !== undefined) entries.push(["Score", formatScorePercentage(intent.score) || String(intent.score)]);
            if (intent.normalizedTriggerUtterance) {
              entries.push(["Normalized Utterance", intent.normalizedTriggerUtterance]);
            }
            if (intent.timestamp) entries.push(["Timestamp", intent.timestamp]);
            if (!entries.length) return null;
            return (
              <div style={{ marginBottom: tokens.spacingVerticalXS }}>
                <DetailSectionTitle>Intent Details</DetailSectionTitle>
                <div className={styles.spaceY3} style={{ marginTop: tokens.spacingVerticalS }}>
                  {entries.map(([k, v]) => (
                    <DetailValueField key={k} label={k} value={v} showType={false} />
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      ))}
    </div>
  );
}

export function DetailSectionTitle({ children }: { children: React.ReactNode }) {
  const styles = useDebugStyles();
  return <Text className={mergeClasses(styles.sectionTitle, "w-dsec-title")}>{children}</Text>;
}

export function DetailEmptyText({ children }: { children: React.ReactNode }) {
  return (
    <Text
      className="w-dsec-empty"
      style={{
        fontSize: tokens.fontSizeBase300,
        color: tokens.colorNeutralForeground3,
        marginTop: tokens.spacingVerticalS,
        display: "block",
      }}
    >
      {children}
    </Text>
  );
}

export function DetailTextSection({
  title,
  content,
}: {
  title: string;
  content: string;
}) {
  const styles = useDebugStyles();
  if (!content) return null;
  return (
    <div className="w-dsec" style={{ marginBottom: tokens.spacingVerticalXS }}>
      <DetailSectionTitle>{title}</DetailSectionTitle>
      <MarkdownContent
        text={content}
        className={mergeClasses(styles.descriptionText, "w-dsec-quote")}
        style={{ marginTop: tokens.spacingVerticalS, display: "block" }}
      />
    </div>
  );
}

type RichSource = { title: string; url?: string; snippet?: string };

function SourceLinkList({
  sources,
  componentNameBySchemaName,
  keyPrefix,
}: {
  /** Either schema-name strings (knowledge-source IDs) or rich citation objects with title + snippet. */
  sources: string[] | RichSource[];
  componentNameBySchemaName?: Record<string, ComponentInfo>;
  keyPrefix: string;
}) {
  // Normalise to RichSource[] so the rendering loop is consistent.
  const items: RichSource[] = Array.isArray(sources)
    ? sources.map((s) =>
        typeof s === "string"
          ? {
              title: componentNameBySchemaName
                ? formatKnowledgeSourceLabel(s, componentNameBySchemaName) || s
                : s,
            }
          : s
      )
    : [];

  return (
    <div
      style={{
        marginTop: tokens.spacingVerticalS,
        display: "flex",
        flexDirection: "column",
        gap: tokens.spacingVerticalXS,
      }}
    >
      {items.map((item, idx) => {
        const labelOrTitle = item.title;
        const isUrl =
          !item.snippet &&
          (labelOrTitle.startsWith("http://") || labelOrTitle.startsWith("https://"));
        return (
          <div
            key={`${keyPrefix}:${idx}:${labelOrTitle.slice(0, 40)}`}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: tokens.spacingHorizontalS,
              padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS}`,
              borderRadius: tokens.borderRadiusMedium,
              backgroundColor: tokens.colorNeutralBackground3,
              border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke3}`,
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "20px",
                height: "20px",
                borderRadius: tokens.borderRadiusCircular,
                backgroundColor: tokens.colorNeutralForeground3,
                color: tokens.colorNeutralForegroundInverted,
                fontSize: tokens.fontSizeBase100,
                fontWeight: tokens.fontWeightSemibold as unknown as number,
                flexShrink: 0,
                marginTop: "2px",
              }}
            >
              {idx + 1}
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXS, minWidth: 0, flex: 1 }}>
              {isUrl ? (
                <Link
                  href={labelOrTitle}
                  target="_blank"
                  style={{ fontSize: tokens.fontSizeBase200, wordBreak: "break-all" }}
                >
                  {labelOrTitle}
                </Link>
              ) : item.url ? (
                <Link
                  href={item.url}
                  target="_blank"
                  style={{ fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold as unknown as number, wordBreak: "break-word" }}
                >
                  {labelOrTitle}
                </Link>
              ) : (
                <Text
                  style={{ fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold as unknown as number, wordBreak: "break-word" }}
                >
                  {labelOrTitle}
                </Text>
              )}
              {item.snippet && (
                <Text
                  style={{
                    fontSize: tokens.fontSizeBase200,
                    color: tokens.colorNeutralForeground3,
                    wordBreak: "break-word",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {item.snippet.length > 280 ? `${item.snippet.slice(0, 280)}…` : item.snippet}
                </Text>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DetailValueField({
  label,
  value,
  maxHeight = "180px",
  truncateAt = 200,
  showType = true,
}: {
  label: string;
  value: unknown;
  maxHeight?: string;
  truncateAt?: number;
  showType?: boolean;
}) {
  const styles = useDebugStyles();
  const [expanded, setExpanded] = useState(false);
  const displayValue =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const typeLabel =
    typeof value === "object"
      ? "Object"
      : typeof value === "string"
      ? "String"
      : typeof value;

  const isTruncatable =
    typeof value === "string" && value.length > truncateAt;
  const shownValue =
    isTruncatable && !expanded ? value.slice(0, truncateAt) + "..." : value;

  return (
    <div>
      <Text className={mergeClasses(styles.labelText, "w-dsec-label")}>
        {showType ? `${label} (${typeLabel})` : label}
      </Text>
      <div
        className={mergeClasses(styles.dataBox, "w-dsec-box")}
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: tokens.spacingHorizontalS,
          marginTop: tokens.spacingVerticalXXS,
        }}
      >
        <div style={{ flex: 1, minWidth: 0, wordBreak: "break-word", overflowWrap: "break-word" }}>
          <SmartValueDisplay
            value={shownValue}
            maxHeight={expanded ? maxHeight : undefined}
            emptyText="—"
          />
          {isTruncatable && (
            <Button
              appearance="transparent"
              size="small"
              onClick={() => setExpanded(!expanded)}
              style={{ padding: 0, minWidth: 0, marginTop: tokens.spacingVerticalXXS }}
            >
              {expanded ? "Show less" : "Show more"}
            </Button>
          )}
        </div>
        <CopyButton value={displayValue} style={{ flexShrink: 0 }} />
      </div>
    </div>
  );
}

export function DetailInputsSection({
  inputs,
}: {
  inputs: Array<[string, unknown]>;
  emptyMessage?: string;
}) {
  if (inputs.length === 0) return null;
  return (
    <div className="w-dsec" style={{ marginBottom: tokens.spacingVerticalXS }}>
      <DetailSectionTitle>Inputs</DetailSectionTitle>
      <div style={{ marginTop: tokens.spacingVerticalS }}>
        <DetailOutputField
          label="Inputs"
          value={Object.fromEntries(inputs)}
          maxHeight="360px"
          showLabel={false}
          showCopyButton={false}
          displayMode="json-code"
        />
      </div>
    </div>
  );
}

export function DetailOutputField({
  label,
  value,
  maxHeight = "240px",
  showLabel = true,
  showCopyButton = true,
  displayMode = "auto",
}: {
  label: string;
  value: unknown;
  maxHeight?: string;
  showLabel?: boolean;
  showCopyButton?: boolean;
  displayMode?: "auto" | "code" | "json-code";
}) {
  const styles = useDebugStyles();
  const displayValue =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const typeLabel =
    typeof value === "object"
      ? value === null
        ? "Null"
        : Array.isArray(value)
        ? "Table"
        : "Object"
      : typeof value === "string"
      ? "String"
      : typeof value === "boolean"
      ? "Boolean"
      : typeof value;

  // JSON values (objects, arrays, JSON-like strings) always render as a
  // syntax-highlighted code block with a header — the connected-agent
  // "Output (Object)" style — so every JSON output looks the same.
  const useCodeLayout =
    displayMode === "code" ||
    displayMode === "json-code" ||
    (displayMode === "auto" && isJsonLikeValue(value));
  const codeBodyMode = displayMode === "code" ? "code" : "json-code";

  if (useCodeLayout) {
    return (
      <div
        className={mergeClasses(styles.dataBox, "w-dsec-box")}
        style={{
          marginTop: tokens.spacingVerticalXXS,
          padding: 0,
          overflow: "hidden",
          whiteSpace: "normal",
        }}
      >
        {showLabel ? (
          <div className={mergeClasses(styles.codeHeader, "w-dsec-codehead")}>
            <Body1Strong>
              {label} ({typeLabel})
            </Body1Strong>
            {showCopyButton && (
              <CopyButton value={displayValue} />
            )}
          </div>
        ) : null}
        <SmartValueDisplay
          value={value}
          maxHeight={maxHeight}
          emptyText="—"
          displayMode={codeBodyMode}
        />
      </div>
    );
  }

  return (
    <div>
      {showLabel ? (
        <Text className={mergeClasses(styles.labelText, "w-dsec-label")}>
          {label} ({typeLabel})
        </Text>
      ) : null}
      <div
        className={mergeClasses(styles.dataBox, "w-dsec-box")}
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: tokens.spacingHorizontalS,
          marginTop: tokens.spacingVerticalXXS,
        }}
      >
        <div style={{ flex: 1, minWidth: 0, wordBreak: "break-word", overflowWrap: "break-word" }}>
          <SmartValueDisplay
            value={value}
            maxHeight={maxHeight}
            emptyText="—"
            displayMode={displayMode}
          />
        </div>
        {showLabel && showCopyButton && (
          <CopyButton value={displayValue} style={{ flexShrink: 0 }} />
        )}
      </div>
    </div>
  );
}

export function StepDetails({
  argsEntries,
  observation,
  showSearchSources,
  generativeKnowledge,
  responseSupport,
  universalSearchTrace,
  citedKnowledgeSources,
  componentNameBySchemaName,
  mcpTool,
  mcpToolIdentifier,
  thought,
  description,
  triggerQueries,
  hideInputs,
  outputLabel,
  outputMaxHeight,
  outputDisplayMode,
}: {
  argsEntries: Array<[string, unknown]>;
  observation: unknown;
  showSearchSources?: boolean;
  /**
   * Generative orchestration (new designer) knowledge step. When present the
   * classic knowledge rendering is skipped in favour of a dedicated block that
   * shows Query, Search terms, Sources, and Results from the generative payload.
   */
  generativeKnowledge?: { sources: string[] };
  responseSupport?: ResponseGeneratorSupport;
  universalSearchTrace?: UniversalSearchTrace;
  citedKnowledgeSources?: string[];
  componentNameBySchemaName?: Record<string, ComponentInfo>;
  mcpTool?: unknown;
  mcpToolIdentifier?: string;
  thought?: string;
  description?: string;
  triggerQueries?: string[];
  hideInputs?: boolean;
  outputLabel?: string;
  outputMaxHeight?: string;
  outputDisplayMode?: "auto" | "code";
}) {
  const styles = useDebugStyles();
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const toggle = (k: string) =>
    setExpandedKeys((prev) => ({ ...prev, [k]: !prev[k] }));

  // Get description from MCP tool if available
  const effectiveDescription = (() => {
    if (mcpToolIdentifier) {
      const mcpToolRec = asRecord(mcpTool);
      return readString(mcpToolRec, "description") ?? description ?? "";
    }
    return description ?? "";
  })();

  // Parse MCP tool observation for structured output
  const mcpOutput = (() => {
    if (!mcpToolIdentifier) return null;
    const obsRec = asRecord(observation);
    const contentVal = obsRec?.["content"];
    const content = Array.isArray(contentVal) ? contentVal : undefined;
    // Render the full content array with inner JSON parsed for pretty-printing
    let contentParsed: unknown = content;
    if (Array.isArray(content) && content.length > 0) {
      contentParsed = content.map((item: unknown) => {
        const rec = asRecord(item);
        const text = typeof rec?.text === "string" ? String(rec.text) : "";
        const type = typeof rec?.type === "string" ? String(rec.type) : "";
        let parsedText: unknown = text;
        if (text) {
          try { parsedText = JSON.parse(text); } catch { /* keep raw */ }
        }
        return { text: parsedText, type };
      });
    }
    const contentText = contentParsed ? JSON.stringify(contentParsed, null, 2) : "";
    const isErrorVal = obsRec?.["isError"];
    const isError = isErrorVal !== undefined ? Boolean(isErrorVal) : false;
    return { isError, contentText, contentParsed };
  })();

  // Knowledge source specific data
  const searchData = (() => {
    if (!showSearchSources) return null;
    // Generative knowledge steps use their own dedicated block below; skip the
    // classic universal-search rendering entirely for them.
    if (generativeKnowledge) return null;
    const argsObj = Object.fromEntries(argsEntries);
    const queryFromArgs =
      typeof argsObj["search_query"] === "string"
        ? String(argsObj["search_query"])
        : "";
    const queryFromSupport =
      typeof responseSupport?.query === "string" ? responseSupport.query : "";
    const query = queryFromArgs || queryFromSupport;
    const keywords =
      typeof argsObj["search_keywords"] === "string"
        ? String(argsObj["search_keywords"])
        : "";

    const citations = Array.isArray(responseSupport?.citations)
      ? responseSupport.citations
      : [];
    // Rich citation entries — title + optional url + optional snippet — so
    // "Referenced sources" matches the Studio test-pane look (title with the
    // citation abstract underneath rather than a bare schema-name pill).
    const referencedFromCitations: Array<{ title: string; url?: string; snippet?: string }> = (() => {
      const seen = new Set<string>();
      const out: Array<{ title: string; url?: string; snippet?: string }> = [];
      for (const c of citations) {
        const title = typeof c?.Title === "string" ? c.Title.trim() : "";
        if (!title) continue;
        if (seen.has(title)) continue;
        seen.add(title);
        out.push({
          title,
          url: typeof c?.Url === "string" ? c.Url : undefined,
          snippet: typeof c?.Text === "string" ? c.Text : undefined,
        });
      }
      return out;
    })();

    const searched = uniqStrings(
      (universalSearchTrace?.knowledgeSources ?? []).map((x) => String(x))
    );
    const cited = uniqStrings(
      (citedKnowledgeSources ?? []).map((x) => String(x))
    );
    const referenced = uniqStrings([
      ...(universalSearchTrace?.outputKnowledgeSources ?? []).map((x) =>
        String(x)
      ),
      ...cited,
    ]);
    const otherSearched = searched;

    const obsRec = asRecord(observation);
    const searchResultRec = asRecord(obsRec?.["search_result"]);
    const searchErrorsRaw = searchResultRec?.["search_errors"];
    const searchResultsRaw = searchResultRec?.["search_results"];
    const searchErrors = Array.isArray(searchErrorsRaw) ? searchErrorsRaw : [];
    const searchResults = Array.isArray(searchResultsRaw)
      ? searchResultsRaw
      : [];

    return {
      query,
      keywords,
      referencedFromCitations,
      referenced,
      otherSearched,
      searchErrors,
      searchResults,
    };
  })();

  // Generative (new designer) knowledge view — derived from the step's own
  // filledParameters + result rather than the classic universal-search trace.
  const generativeSearchView = (() => {
    if (!generativeKnowledge) return null;
    const argsObj = Object.fromEntries(argsEntries);
    const searchQuery =
      typeof argsObj["search_query"] === "string" ? String(argsObj["search_query"]) : "";
    const query = typeof argsObj["query"] === "string" ? String(argsObj["query"]) : "";
    const sources = generativeKnowledge.sources.filter((s) => !!s);
    const resultText = (() => {
      const rec = asRecord(observation);
      if (rec && typeof rec["text"] === "string") return String(rec["text"]);
      if (rec && typeof rec["error"] === "string") return String(rec["error"]);
      if (observation == null) return "";
      if (typeof observation === "string") return observation;
      try {
        return JSON.stringify(observation, null, 2);
      } catch {
        return String(observation);
      }
    })();
    return { searchQuery, query, sources, resultText };
  })();

  return (
    <div className={styles.spaceY4}>
      {/* Description Section - shared across all step types */}
      <DetailTextSection title="Description" content={effectiveDescription} />

      {triggerQueries && triggerQueries.length > 0 && (
        <div style={{ marginBottom: tokens.spacingVerticalXS }}>
          <DetailSectionTitle>Phrases</DetailSectionTitle>
          <div className={styles.spaceY2} style={{ marginTop: tokens.spacingVerticalS }}>
            {triggerQueries.map((phrase) => (
              <Text key={phrase} className={styles.descriptionText} style={{ display: "block" }}>
                {phrase}
              </Text>
            ))}
          </div>
        </div>
      )}

      {/* Thought Section - shared across all step types */}
      <DetailTextSection title="Thought" content={thought ?? ""} />

      {/* Knowledge Source specific: Query and Keywords */}
      {searchData && (
        <>
          <div style={{ marginBottom: tokens.spacingVerticalXS }}>
            <DetailSectionTitle>Query</DetailSectionTitle>
            <Text
              className={styles.descriptionText}
              style={{ marginTop: tokens.spacingVerticalS, display: "block" }}
            >
              {searchData.query || "—"}
            </Text>
          </div>

          {searchData.keywords && (
            <div style={{ marginBottom: tokens.spacingVerticalXS }}>
              <DetailSectionTitle>Keywords</DetailSectionTitle>
              <div className={styles.keywordsContainer}>
                {searchData.keywords.split(",").map((kw, idx) => (
                  <span key={idx} className={styles.keywordTag}>
                    {kw.trim()}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Generative (new designer) knowledge: Query, Search terms, Sources,
          Results — sourced from the step's own payload. */}
      {generativeSearchView && (
        <>
          {generativeSearchView.searchQuery && (
            <div style={{ marginBottom: tokens.spacingVerticalXS }}>
              <DetailSectionTitle>Query</DetailSectionTitle>
              <Text
                className={styles.descriptionText}
                style={{ marginTop: tokens.spacingVerticalS, display: "block" }}
              >
                {generativeSearchView.searchQuery}
              </Text>
            </div>
          )}

          {generativeSearchView.query &&
            generativeSearchView.query !== generativeSearchView.searchQuery && (
              <div style={{ marginBottom: tokens.spacingVerticalXS }}>
                <DetailSectionTitle>Search terms</DetailSectionTitle>
                <Text
                  className={styles.descriptionText}
                  style={{ marginTop: tokens.spacingVerticalS, display: "block" }}
                >
                  {generativeSearchView.query}
                </Text>
              </div>
            )}

          {generativeSearchView.sources.length > 0 && (
            <div style={{ marginBottom: tokens.spacingVerticalXS }}>
              <DetailSectionTitle>Sources</DetailSectionTitle>
              <SourceLinkList
                sources={generativeSearchView.sources}
                keyPrefix="gen-knowledge-source"
              />
            </div>
          )}

          {generativeSearchView.resultText && (
            <div style={{ marginBottom: tokens.spacingVerticalXS }}>
              <DetailOutputField
                label="Results"
                value={generativeSearchView.resultText}
                maxHeight="320px"
              />
            </div>
          )}
        </>
      )}

      {/* Inputs Section - shared across all step types */}
      {!hideInputs && !showSearchSources && <DetailInputsSection inputs={argsEntries} />}

      {/* Outputs Section — hidden for Knowledge steps. For MCP tools the section
          is always shown when a tool identifier is present so the user gets a
          consistent place to look for content; non-MCP steps fall through to
          the original "render only when there is data" heuristic. */}
      {(() => {
        if (showSearchSources) return null;
        const isEmptyObservation =
          observation == null ||
          (typeof observation === "object" &&
            observation !== null &&
            !Array.isArray(observation) &&
            Object.keys(observation as Record<string, unknown>).length === 0);
        const hasMcpRender = Boolean(mcpToolIdentifier);
        const hasRegularRender = !mcpToolIdentifier && !isEmptyObservation;
        if (!hasMcpRender && !hasRegularRender) return null;
        return (
      <div style={{ marginBottom: tokens.spacingVerticalXS }}>
        <DetailSectionTitle>Outputs</DetailSectionTitle>
        <div className={styles.spaceY3} style={{ marginTop: tokens.spacingVerticalS }}>
          {/* MCP Tool structured output */}
          {mcpToolIdentifier ? (
            <>
              {mcpOutput?.isError && (
                <DetailValueField
                  label="Error"
                  value="true"
                  showType={false}
                  maxHeight="60px"
                />
              )}
              {(() => {
                // Prefer the parsed `content` array (text/type pairs). Fall
                // back to the raw observation so content still renders even
                // when the orchestrator didn't wrap the result in a content
                // array. As a last resort show a clear empty state so the
                // user can tell whether data is missing vs. a render bug.
                const mcpValue = mcpOutput?.contentParsed ?? observation;
                if (mcpValue === undefined || mcpValue === null) {
                  return (
                    <div className={mergeClasses(styles.dataBox, "w-dsec-box")}>
                      <Text className={styles.descriptionText} style={{ display: "block" }}>
                        No content captured for this tool call.
                      </Text>
                    </div>
                  );
                }
                return (
                  <DetailOutputField
                    label="content"
                    value={mcpValue}
                    maxHeight="360px"
                    showLabel={false}
                    showCopyButton={false}
                    displayMode="json-code"
                  />
                );
              })()}
            </>
          ) : null}

          {/* Regular tool/connector output */}
          {!mcpToolIdentifier && !isEmptyObservation ? (
            <DetailOutputField
              label={outputLabel ?? "result"}
              value={observation}
              maxHeight={outputMaxHeight ?? "240px"}
              showLabel={false}
              showCopyButton={false}
              displayMode={outputDisplayMode}
            />
          ) : null}

        </div>
      </div>
        );
      })()}

      {/* Knowledge Source specific: Search Results and Sources */}
      {searchData && (
        <>
          {searchData.searchErrors.length > 0 && (
            <div style={{ marginBottom: tokens.spacingVerticalXS }}>
              <DetailSectionTitle>Search errors</DetailSectionTitle>
              <div className={mergeClasses(styles.dataBox, "w-dsec-box")} style={{ marginTop: tokens.spacingVerticalS }}>
                <SmartValueDisplay
                  value={searchData.searchErrors}
                  maxHeight="240px"
                />
              </div>
            </div>
          )}

          {searchData.searchResults.length > 0 && (
            <div style={{ marginBottom: tokens.spacingVerticalXS }}>
              <DetailSectionTitle>Search results</DetailSectionTitle>
              <div className={styles.spaceY2} style={{ marginTop: tokens.spacingVerticalS }}>
                {searchData.searchResults.map((r, idx) => {
                  const rec = asRecord(r);
                  const name = readString(rec, "Name") ?? "";
                  const text = readString(rec, "Text") ?? "";
                  const type = readString(rec, "Type") ?? "";
                  const url = readString(rec, "Url") ?? "";
                  const sourceId = readString(rec, "SourceId") ?? "";
                  const title = (
                    formatKnowledgeSourceLabel(sourceId, componentNameBySchemaName) ||
                    formatKnowledgeSourceLabel(name, componentNameBySchemaName) ||
                    name ||
                    `Result ${idx + 1}`
                  ).trim();
                  const bodyText = text === "null" ? "" : text;
                  const textKey = `sr:${idx}:text`;
                  const raw = String(bodyText ?? "");
                  const isLong = raw.length > 180;
                  const expanded = Boolean(expandedKeys[textKey]);
                  const display =
                    isLong && !expanded ? `${raw.slice(0, 180)}…` : raw;

                  return (
                    <div key={`sr:${idx}`} className={mergeClasses(styles.dataBox, "w-dsec-box")}>
                      <Text
                        style={{
                          fontWeight: 500,
                          fontSize: tokens.fontSizeBase300,
                          wordBreak: "break-word",
                        }}
                      >
                        {title}
                      </Text>
                      {raw && (
                        <div style={{ marginTop: tokens.spacingVerticalS }}>
                          <Text
                            style={{
                              fontSize: tokens.fontSizeBase200,
                              color: tokens.colorNeutralForeground3,
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                            }}
                          >
                            {display}
                          </Text>
                          {isLong && (
                            <Button
                              appearance="transparent"
                              size="small"
                              onClick={() => toggle(textKey)}
                              style={{ marginTop: tokens.spacingVerticalXXS, padding: 0 }}
                            >
                              {expanded ? "Show less" : "Show more"}
                            </Button>
                          )}
                        </div>
                      )}
                      {(type || url) && (
                        <div
                          style={{
                            marginTop: tokens.spacingVerticalS,
                            paddingTop: "8px",
                            borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "flex-start",
                            gap: tokens.spacingVerticalXXS,
                          }}
                        >
                          {type && (
                            <Badge
                              appearance="tint"
                              color="informative"
                              size="small"
                              shape="rounded"
                              style={{ maxWidth: "fit-content" }}
                            >
                              {formatSearchResultType(type)}
                            </Badge>
                          )}
                          {url && (
                            <Link
                              href={url}
                              target="_blank"
                              style={{
                                fontSize: "12px",
                                wordBreak: "break-all",
                              }}
                            >
                              {url}
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ marginBottom: tokens.spacingVerticalXS }}>
            <DetailSectionTitle>Referenced sources</DetailSectionTitle>
            {searchData.referencedFromCitations.length === 0 &&
            searchData.referenced.length === 0 ? (
              <DetailEmptyText>No referenced sources captured.</DetailEmptyText>
            ) : (
              <>
                {searchData.referencedFromCitations.length > 0 && (
                  <SourceLinkList
                    sources={searchData.referencedFromCitations}
                    keyPrefix="ref:cite"
                  />
                )}
                {searchData.referenced.length > 0 && (
                  <SourceLinkList
                    sources={searchData.referenced}
                    componentNameBySchemaName={componentNameBySchemaName}
                    keyPrefix="ref:ks"
                  />
                )}
              </>
            )}
          </div>

          <div style={{ marginBottom: tokens.spacingVerticalXS }}>
            <DetailSectionTitle>Other sources searched over</DetailSectionTitle>
            {searchData.otherSearched.length === 0 ? (
              <DetailEmptyText>No other sources captured.</DetailEmptyText>
            ) : (
              <SourceLinkList
                sources={searchData.otherSearched}
                componentNameBySchemaName={componentNameBySchemaName}
                keyPrefix="other"
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function ReasoningDetails({ turn, step }: { turn: ProcessedTurn | null; step: FlowStep }) {
  const styles = useDebugStyles();
  const activities: Activity[] = Array.isArray(turn?.activities) ? turn!.activities : [];
  const executions = turn?.debugInfo?.stepExecutions ?? [];
  const matchedExecution = executions.find(
    (e) => e.stepId === step.stepId && e.taskDialogId === step.taskDialogId
  ) ?? executions.find((e) => e.taskDialogId === step.taskDialogId);

  const traceText = getReasoningTraceContent(activities, String(step.taskDialogId ?? ""));
  const parsed = parseReasoningOutput(traceText ?? matchedExecution?.observation);

  if (!parsed.answer && !parsed.reason) {
    return (
      <Text style={{ color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase300 }}>
        No reasoning output captured for this step.
      </Text>
    );
  }

  const fullReasoning = [parsed.answer, parsed.reason].filter(Boolean).join("\n\nReason: ");

  return (
    <div className={styles.spaceY4}>
      {/* Thought first — same pattern as other nodes */}
      {step.thought && (
        <DetailTextSection title="Thought" content={step.thought} />
      )}

      {/* Reasoning in a dataBox — grey fill matching other node data */}
      {fullReasoning && (
        <div style={{ marginBottom: tokens.spacingVerticalXS }}>
          <DetailSectionTitle>Reasoning</DetailSectionTitle>
          <div className={mergeClasses(styles.dataBox, "w-dsec-box")} style={{ marginTop: tokens.spacingVerticalS, maxHeight: "400px", overflowY: "auto" }}>
            <Text className={styles.descriptionText}>{fullReasoning}</Text>
          </div>
        </div>
      )}
    </div>
  );
}

export function GenAiSupportDetails({
  debugInfo,
  hideQuery,
  hideSources,
}: {
  debugInfo: ProcessedTurn["debugInfo"];
  /** Hide the Query/Message section (redundant when a parent StepDetails already shows the search_query). */
  hideQuery?: boolean;
  /** Hide the Sources section (redundant when a parent StepDetails already shows Referenced sources from the same citations). */
  hideSources?: boolean;
}) {
  const styles = useDebugStyles();
  const support = debugInfo?.genAiSupportData;
  const usage = extractCapiResourceUsage(support);
  const tokenInfo = debugInfo?.tokenInfo;

  const modelName = readString(usage, "ModelName") ?? tokenInfo?.model;
  const promptTokens =
    readNumber(usage, "PromptTokens") ?? tokenInfo?.promptTokens;
  const completionTokens =
    readNumber(usage, "CompletionTokens") ?? tokenInfo?.completionTokens;
  const totalTokens =
    readNumber(usage, "TotalTokens") ?? tokenInfo?.totalTokens;

  const cleaned = asRecord(stripIdLikeFields(support));
  const endpointsRaw = cleaned?.endpoints;
  const endpoints = Array.isArray(endpointsRaw)
    ? endpointsRaw.map((x) => String(x))
    : [];
  const completionState = readString(cleaned, "completionState") ?? "";
  const gptAnswerState = readString(cleaned, "gptAnswerState") ?? "";
  const triggeredGptFallback = readBoolean(cleaned, "triggeredGptFallback");
  const performedContentModerationCheck = readBoolean(
    cleaned,
    "performedContentModerationCheck"
  );
  const performedContentProvenanceCheck = readBoolean(
    cleaned,
    "performedContentProvenanceCheck"
  );

  const message = readString(cleaned, "message") ?? "";
  const rewrittenMessage = readString(cleaned, "rewrittenMessage") ?? "";

  const searchResultsCount = Array.isArray(cleaned?.searchResults)
    ? cleaned.searchResults.length
    : undefined;
  const verifiedSearchResultsCount = Array.isArray(
    cleaned?.verifiedSearchResults
  )
    ? cleaned.verifiedSearchResults.length
    : undefined;
  const searchErrorsCount = Array.isArray(cleaned?.searchErrors)
    ? cleaned.searchErrors.length
    : undefined;

  const reasoningTokens = readNumber(usage, "ReasoningTokens");

  return (
    <div className={styles.spaceY4}>
      {/* Query section — suppressed when this panel is a child of a StepDetails
          that already shows the search_query / rewritten query. */}
      {!hideQuery && (message || rewrittenMessage) && (
        <div style={{ marginBottom: tokens.spacingVerticalXS }}>
          <DetailSectionTitle>Query</DetailSectionTitle>
          <div className={styles.spaceY3} style={{ marginTop: tokens.spacingVerticalS }}>
            {message && (
              <DetailValueField label="Message" value={message} showType={false} />
            )}
            {rewrittenMessage && rewrittenMessage !== message && (
              <DetailValueField label="Rewritten Message" value={rewrittenMessage} showType={false} />
            )}
          </div>
        </div>
      )}

      {/* Endpoints */}
      {endpoints.length > 0 && (
        <div style={{ marginBottom: tokens.spacingVerticalXS }}>
          <DetailSectionTitle>Endpoints</DetailSectionTitle>
          <div className={styles.spaceY3} style={{ marginTop: tokens.spacingVerticalS }}>
            {endpoints.map((e: string) => (
              <DetailValueField key={e} label="Endpoint" value={e} showType={false} />
            ))}
          </div>
        </div>
      )}

      {/* Token Usage — compact list */}
      {(promptTokens || completionTokens || totalTokens) ? (
        <div style={{ marginBottom: tokens.spacingVerticalXS }}>
          <DetailSectionTitle>Token Usage</DetailSectionTitle>
          <div className={styles.spaceY2} style={{ marginTop: tokens.spacingVerticalS }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <Text className={mergeClasses(styles.labelText, "w-dsec-label")}>Prompt Tokens</Text>
              <Text style={{ fontSize: tokens.fontSizeBase200 }}>{promptTokens ?? 0}</Text>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <Text className={mergeClasses(styles.labelText, "w-dsec-label")}>Completion Tokens</Text>
              <Text style={{ fontSize: tokens.fontSizeBase200 }}>{completionTokens ?? 0}</Text>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <Text className={mergeClasses(styles.labelText, "w-dsec-label")}>Total Tokens</Text>
              <Text style={{ fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold }}>{totalTokens ?? 0}</Text>
            </div>
            {reasoningTokens !== undefined && reasoningTokens > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <Text className={mergeClasses(styles.labelText, "w-dsec-label")}>Reasoning Tokens</Text>
                <Text style={{ fontSize: tokens.fontSizeBase200 }}>{reasoningTokens}</Text>
              </div>
            )}
            {modelName && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <Text className={mergeClasses(styles.labelText, "w-dsec-label")}>Model</Text>
                <Text style={{ fontSize: tokens.fontSizeBase200 }}>{modelName}</Text>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Key Details — compact list */}
      {(() => {
        const rows: Array<[string, string]> = [];
        if (completionState) rows.push(["Completion State", completionState]);
        if (gptAnswerState) rows.push(["Answer State", gptAnswerState]);
        if (triggeredGptFallback !== undefined) rows.push(["Triggered Fallback", String(triggeredGptFallback)]);
        if (performedContentModerationCheck !== undefined) rows.push(["Content Moderation", String(performedContentModerationCheck)]);
        if (performedContentProvenanceCheck !== undefined) rows.push(["Content Provenance", String(performedContentProvenanceCheck)]);
        if (searchResultsCount !== undefined) rows.push(["Search Results", String(searchResultsCount)]);
        if (verifiedSearchResultsCount !== undefined) rows.push(["Verified Results", String(verifiedSearchResultsCount)]);
        if (searchErrorsCount !== undefined) rows.push(["Search Errors", String(searchErrorsCount)]);
        if (!rows.length) return null;
        return (
          <div style={{ marginBottom: tokens.spacingVerticalXS }}>
            <DetailSectionTitle>Key Details</DetailSectionTitle>
            <div className={styles.spaceY2} style={{ marginTop: tokens.spacingVerticalS }}>
              {rows.map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                  <Text className={mergeClasses(styles.labelText, "w-dsec-label")}>{k}</Text>
                  <Text style={{ fontSize: tokens.fontSizeBase200 }}>{v}</Text>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Sources — suppressed when a parent StepDetails already renders these
          citations under "Referenced sources" with title + snippet. */}
      {!hideSources && (() => {
        // Try citations from summarization response first
        const sumResp = asRecord(cleaned?.summarizationOpenAIResponse);
        const result = asRecord(sumResp?.Result) || asRecord(sumResp?.result);
        const textCitations = Array.isArray(result?.TextCitations) ? result.TextCitations
          : Array.isArray(result?.textCitations) ? result.textCitations : [];
        const citationSources = textCitations
          .map((c: unknown) => {
            const rec = asRecord(c);
            const title = readString(rec, "Title") || readString(rec, "title") || "";
            const url = readString(rec, "Url") || readString(rec, "url") || "";
            return url || title;
          })
          .filter(Boolean) as string[];

        // Fallback to search results if no citations
        const searchResults = Array.isArray(cleaned?.searchResults) ? cleaned.searchResults : [];
        const searchSources = citationSources.length === 0
          ? searchResults
              .map((r: unknown) => {
                const rec = asRecord(r);
                return readString(rec, "Url") || readString(rec, "Name") || "";
              })
              .filter(Boolean) as string[]
          : [];

        const allSources = [...new Set([...citationSources, ...searchSources])];
        if (!allSources.length) return null;
        return (
          <div style={{ marginBottom: tokens.spacingVerticalXS }}>
            <DetailSectionTitle>Sources</DetailSectionTitle>
            <SourceLinkList
              sources={allSources}
              keyPrefix="genai:src"
            />
          </div>
        );
      })()}
    </div>
  );
}
