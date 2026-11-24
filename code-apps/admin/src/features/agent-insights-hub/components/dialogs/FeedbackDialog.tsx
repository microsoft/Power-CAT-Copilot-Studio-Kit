/**
 * FeedbackDialog - Displays user feedback/reactions from transcript metrics.
 *
 * Loads feedback from cat_feedbackdetailsfile (file attachment) with base64
 * fallback. Normalizes variable field names, shows ToggleButton filters,
 * rich cards, and Excel export.
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  makeStyles, tokens, Dialog, DialogSurface, DialogBody, DialogTitle,
  DialogContent, DialogActions, Button, ToggleButton, Body1,
  Caption1, Caption1Strong, Spinner,
} from "@fluentui/react-components";
import { ThumbLike20Regular, ThumbDislike20Regular, ArrowDownload20Regular } from "@fluentui/react-icons";
import type ExcelJSType from "exceljs";
import type { TranscriptMetrics } from "../../contracts/types";
import { downloadFileContent } from "../../services/DataverseFileService";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FeedbackDialogProps {
  data: TranscriptMetrics[];
  onClose: () => void;
}

type FeedbackDetail = Record<string, string | undefined> & {
  agentName?: string;
  conversationId?: string;
  userMessage?: string;
  agentMessage?: string;
  feedbackText?: string;
  feedbackReaction?: string;
};

interface NormalizedFeedback {
  agentName: string;
  conversationId: string;
  conversationDate: string;
  userMessage: string;
  agentMessage: string;
  feedbackText: string;
  feedbackReaction: string;
}

type FeedbackFilter = "all" | "like" | "dislike";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickValue(...values: Array<string | undefined>): string {
  return values.find((v) => v !== undefined && v !== "") || "";
}

function normalizeFeedbackDetail(fb: FeedbackDetail, conversationDate: string): NormalizedFeedback {
  const reactionRaw = pickValue(
    fb.feedbackReaction, fb["Feedback Reaction"],
    fb["feedback reaction"], fb.Reaction,
  );
  const reaction = reactionRaw.toLowerCase();
  const normalizedReaction =
    reaction.includes("dislike") || reaction.includes("down")
      ? "dislike"
      : reaction.includes("like") || reaction.includes("up")
        ? "like"
        : "";

  return {
    agentName: pickValue(fb.agentName, fb["Agent Name"], fb["agent name"]),
    conversationId: pickValue(
      fb.conversationId, fb["Conversation Id"],
      fb["Conversation ID"], fb["conversation id"],
    ),
    conversationDate,
    userMessage: pickValue(
      fb.userMessage, fb["User Message"],
      fb["user message"], fb["UserMessage"],
    ),
    agentMessage: pickValue(
      fb.agentMessage, fb["Agent Message"],
      fb["Agent Response"], fb["agent message"],
    ),
    feedbackText: pickValue(
      fb.feedbackText, fb["Feedback Text"],
      fb["User Feedback"], fb["feedback text"],
    ),
    feedbackReaction: normalizedReaction,
  };
}

function decodeBase64Utf8(value: string): string | null {
  try {
    const sanitized =
      value.startsWith("data:") && value.includes(",")
        ? value.slice(value.indexOf(",") + 1)
        : value;
    const normalized = sanitized.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return null;
  }
}

function parseFeedbackPayload(payload: string | undefined | null): FeedbackDetail[] {
  if (!payload) return [];
  const trimmed = payload.trim();

  const tryParse = (value: string): FeedbackDetail[] => {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const parsed = tryParse(trimmed);
  if (parsed.length > 0 || trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return parsed;
  }

  const decoded = decodeBase64Utf8(trimmed);
  if (!decoded) return parsed;

  const decodedParsed = tryParse(decoded);
  return decodedParsed;
}

function normalizeRecordId(id: string): string {
  return id.replace(/[{}]/g, "").toLowerCase();
}

function toNumber(val: number | undefined | null): number {
  return val ?? 0;
}

async function loadMetricFeedbackDetails(metric: TranscriptMetrics): Promise<FeedbackDetail[]> {
  const recordId = normalizeRecordId(metric.cat_transcriptmetricsid);
  if (!recordId) return [];

  const result = await downloadFileContent(
    "cat_transcriptmetricses",
    recordId,
    "cat_feedbackdetailsfile",
  );

  if (!result.success || result.error) {
    return [];
  }

  const parsed = parseFeedbackPayload(result.data);
  if (parsed.length > 0) {
    return parsed;
  }
  return [];
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = makeStyles({
  filterTabs: {
    display: "flex",
    gap: tokens.spacingHorizontalS,
    marginBottom: tokens.spacingVerticalM,
  },
  reactionsCount: {
    display: "block",
    marginBottom: tokens.spacingVerticalM,
    color: tokens.colorNeutralForeground3,
  },
  loadingContainer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: tokens.spacingVerticalXL,
    paddingBottom: tokens.spacingVerticalXL,
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
  },
  feedbackCard: {
    paddingTop: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalM,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  reactionIndicator: {
    marginBottom: tokens.spacingVerticalS,
  },
  likeIcon: { color: tokens.colorPaletteGreenForeground1 },
  dislikeIcon: { color: tokens.colorPaletteRedForeground1 },
  fieldRow: { marginBottom: tokens.spacingVerticalS },
  idDateRow: {
    display: "flex",
    gap: tokens.spacingHorizontalL,
    marginBottom: tokens.spacingVerticalS,
  },
  idDateField: {
    flex: "1 1 0",
    minWidth: 0,
  },
  fieldLabel: {
    fontWeight: tokens.fontWeightSemibold,
    marginBottom: tokens.spacingVerticalXS,
    display: "block",
  },
  conversationId: {
    fontFamily: tokens.fontFamilyMonospace,
    wordBreak: "break-all",
  },
  userMessage: {
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusSmall,
    marginTop: tokens.spacingVerticalS,
    borderLeft: `3px solid ${tokens.colorPaletteBlueBorderActive}`,
  },
  agentMessage: {
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusSmall,
    marginTop: tokens.spacingVerticalS,
    borderLeft: `3px solid ${tokens.colorBrandBackground}`,
  },
  feedbackComment: {
    fontStyle: "italic",
    color: tokens.colorNeutralForeground2,
    paddingTop: tokens.spacingVerticalXS,
    paddingBottom: tokens.spacingVerticalXS,
    paddingLeft: tokens.spacingHorizontalS,
    paddingRight: tokens.spacingHorizontalS,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusSmall,
    marginTop: tokens.spacingVerticalS,
  },
  empty: {
    textAlign: "center",
    paddingTop: tokens.spacingVerticalXL,
    paddingBottom: tokens.spacingVerticalXL,
    color: tokens.colorNeutralForeground3,
  },
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const FeedbackDialog: React.FC<FeedbackDialogProps> = ({ data, onClose }) => {
  const styles = useStyles();
  const [filter, setFilter] = useState<FeedbackFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<NormalizedFeedback[]>([]);
  const cacheRef = useRef<Record<string, FeedbackDetail[]>>({});

  // Load feedback from file attachments or inline JSON on mount
  useEffect(() => {
    let cancelled = false;

    async function loadFeedback() {
      setIsLoading(true);

      const metricsWithFeedback = data.filter(
        (m) => toNumber(m.cat_feedbacklikecount) + toNumber(m.cat_feedbackdislikecount) > 0,
      );

      const results = await Promise.all(
        metricsWithFeedback.map(async (metric) => {
          const recordId = normalizeRecordId(metric.cat_transcriptmetricsid);
          const date = metric.cat_conversationdate ?? "";
          if (!recordId) return { details: [] as FeedbackDetail[], date };

          // Check cache
          if (cacheRef.current[recordId]) {
            return { details: cacheRef.current[recordId], date };
          }

          try {
            const details = await loadMetricFeedbackDetails(metric);
            cacheRef.current[recordId] = details;
            return { details, date };
          } catch {
            return { details: [] as FeedbackDetail[], date };
          }
        }),
      );

      if (cancelled) return;

      const normalized: NormalizedFeedback[] = [];
      for (const r of results) {
        for (const d of r.details) {
          normalized.push(normalizeFeedbackDetail(d, r.date));
        }
      }

      // Sort by conversation date descending (newest first)
      normalized.sort((a, b) => b.conversationDate.localeCompare(a.conversationDate));
      setFeedback(normalized);
      setIsLoading(false);
    }

    loadFeedback();
    return () => { cancelled = true; };
  }, [data]);

  const filtered = useMemo(() => {
    if (filter === "all") return feedback;
    return feedback.filter((f) => f.feedbackReaction === filter);
  }, [feedback, filter]);

  const handleExport = useCallback(async () => {
    if (filtered.length === 0) return;

    const exportData = filtered.map((fb) => ({
      Reaction: fb.feedbackReaction === "like" ? "Thumbs up" : "Thumbs down",
      "Agent Name": fb.agentName,
      "Conversation ID": fb.conversationId,
      "Conversation Date": fb.conversationDate ? new Date(fb.conversationDate).toLocaleDateString() : "",
      "User Message": fb.userMessage,
      "Agent Response": fb.agentMessage,
      "User Feedback": fb.feedbackText,
    }));

    const ExcelJS = await import("exceljs") as typeof ExcelJSType;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Feedback");

    worksheet.columns = [
      { header: "Reaction", key: "Reaction", width: 12 },
      { header: "Agent Name", key: "Agent Name", width: 30 },
      { header: "Conversation ID", key: "Conversation ID", width: 40 },
      { header: "Conversation Date", key: "Conversation Date", width: 16 },
      { header: "User Message", key: "User Message", width: 80 },
      { header: "Agent Response", key: "Agent Response", width: 80 },
      { header: "User Feedback", key: "User Feedback", width: 50 },
    ];

    for (const row of exportData) {
      worksheet.addRow(row);
    }

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.commit();

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    const dateStr = new Date().toISOString().split("T")[0];
    anchor.download = `Feedback_${dateStr}.xlsx`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [filtered]);

  return (
    <Dialog open onOpenChange={(_, d) => { if (!d.open) onClose(); }}>
      <DialogSurface style={{ maxWidth: "800px", maxHeight: "85vh" }}>
        <DialogBody>
          <DialogTitle>Reactions</DialogTitle>
          <DialogContent style={{ overflowY: "auto", maxHeight: "calc(85vh - 140px)" }}>
            {isLoading ? (
              <div className={styles.loadingContainer}>
                <Spinner label="Loading feedback..." />
              </div>
            ) : (
              <>
                <div className={styles.filterTabs}>
                  <ToggleButton
                    checked={filter === "all"}
                    onClick={() => setFilter("all")}
                    size="small"
                  >
                    All
                  </ToggleButton>
                  <ToggleButton
                    checked={filter === "like"}
                    onClick={() => setFilter("like")}
                    size="small"
                    icon={<ThumbLike20Regular className={styles.likeIcon} />}
                  >
                    Thumbs up
                  </ToggleButton>
                  <ToggleButton
                    checked={filter === "dislike"}
                    onClick={() => setFilter("dislike")}
                    size="small"
                    icon={<ThumbDislike20Regular className={styles.dislikeIcon} />}
                  >
                    Thumbs down
                  </ToggleButton>
                </div>

                <Caption1 className={styles.reactionsCount}>
                  {filtered.length} reactions
                </Caption1>

                {filtered.length === 0 ? (
                  <Body1 className={styles.empty}>No feedback available.</Body1>
                ) : (
                  <div className={styles.list}>
                    {filtered.map((fb, idx) => {
                      const isLike = fb.feedbackReaction === "like";
                      return (
                        <div key={`${fb.conversationId}-${fb.feedbackReaction}-${idx}`} className={styles.feedbackCard}>
                          <div className={styles.reactionIndicator}>
                            {isLike ? (
                              <ThumbLike20Regular className={styles.likeIcon} />
                            ) : (
                              <ThumbDislike20Regular className={styles.dislikeIcon} />
                            )}
                          </div>

                          {fb.agentName && (
                            <div className={styles.fieldRow}>
                              <Caption1Strong className={styles.fieldLabel}>Agent</Caption1Strong>
                              <Caption1>{fb.agentName}</Caption1>
                            </div>
                          )}

                          <div className={styles.idDateRow}>
                            <div className={styles.idDateField}>
                              <Caption1Strong className={styles.fieldLabel}>Conversation ID</Caption1Strong>
                              <Caption1 className={styles.conversationId}>
                                {fb.conversationId || "N/A"}
                              </Caption1>
                            </div>
                            {fb.conversationDate && (
                              <div className={styles.idDateField}>
                                <Caption1Strong className={styles.fieldLabel}>Conversation Date</Caption1Strong>
                                <Caption1>{new Date(fb.conversationDate).toLocaleDateString()}</Caption1>
                              </div>
                            )}
                          </div>

                          {fb.userMessage && (
                            <div className={styles.userMessage}>
                              <Caption1Strong className={styles.fieldLabel}>User Message</Caption1Strong>
                              <Caption1>
                                {fb.userMessage.length > 500
                                  ? fb.userMessage.substring(0, 500) + "..."
                                  : fb.userMessage}
                              </Caption1>
                            </div>
                          )}

                          {fb.agentMessage && (
                            <div className={styles.agentMessage}>
                              <Caption1Strong className={styles.fieldLabel}>Agent Response</Caption1Strong>
                              <Caption1>
                                {fb.agentMessage.length > 500
                                  ? fb.agentMessage.substring(0, 500) + "..."
                                  : fb.agentMessage}
                              </Caption1>
                            </div>
                          )}

                          {fb.feedbackText && (
                            <div className={styles.feedbackComment}>
                              <Caption1Strong className={styles.fieldLabel}>User Feedback</Caption1Strong>
                              <Caption1>{fb.feedbackText}</Caption1>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </DialogContent>
          <DialogActions>
            <Button
              appearance="secondary"
              icon={<ArrowDownload20Regular />}
              onClick={handleExport}
              disabled={filtered.length === 0 || isLoading}
            >
              Download Feedbacks
            </Button>
            <Button appearance="primary" onClick={onClose}>
              Close
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};

export default React.memo(FeedbackDialog);
