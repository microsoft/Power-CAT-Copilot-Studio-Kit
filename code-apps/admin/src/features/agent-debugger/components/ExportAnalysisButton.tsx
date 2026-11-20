import { useEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import {
  Button, Caption1,
  MessageBar, MessageBarBody, Spinner, Tooltip, makeStyles, tokens,
} from "@fluentui/react-components";
import { ArrowDownload20Regular } from "@fluentui/react-icons";
import type { AnalysisReportInput } from "../contracts/analysis-report";
import { buildAnalysisReport } from "../utils/analysis-report";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: tokens.spacingVerticalM },
});

type ExportState = Pick<AnalysisReportInput, "transcript" | "source" | "conversationId"> & {
  busy: boolean;
  status: string;
  error: string;
};

/** Captures full analysis as an offline HTML report, with retryable failures. */
export function ExportAnalysisButton({ input, actionTarget }: { input: AnalysisReportInput; actionTarget?: HTMLElement | null }) {
  const styles = useStyles();
  const [result, setResult] = useState<ExportState>();
  const state = result?.transcript === input.transcript && result.source === input.source &&
    result.conversationId === input.conversationId ? result : undefined;
  const busy = state?.busy ?? false;
  const pending = useRef<number | undefined>(undefined);
  const generation = useRef(0);
  useEffect(() => () => { generation.current += 1; }, [input.transcript, input.source, input.conversationId]);

  const exportAnalysis = async () => {
    if (pending.current === generation.current) return;
    const current = generation.current;
    pending.current = current;
    const capture = { transcript: input.transcript, source: input.source, conversationId: input.conversationId };
    flushSync(() => {
      setResult({ ...capture, busy: true, error: "", status: "Preparing HTML conversation flow report." });
    });
    let url: string | undefined;
    let anchor: HTMLAnchorElement | undefined;
    try {
      const report = buildAnalysisReport(input);
      const { renderAnalysisHtml } = await import("../services/analysis-html");
      if (current !== generation.current) return;
      const blob = new Blob([renderAnalysisHtml(report)], { type: "text/html;charset=utf-8" });
      url = URL.createObjectURL(blob);
      anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = report.filename;
      document.body.appendChild(anchor);
      anchor.click();
      setResult({ ...capture, busy: false, error: "", status: "" });
    } catch (cause) {
      if (current !== generation.current) return;
      console.error("Agent Debugger HTML export failed.", cause);
      const message = `Could not export analysis. ${cause instanceof Error ? cause.message : "Please try again."}`;
      setResult({ ...capture, busy: false, error: message, status: `${message} Select Export to retry.` });
    } finally {
      anchor?.remove();
      if (url) {
        const completedUrl = url;
        window.setTimeout(() => URL.revokeObjectURL(completedUrl), 1000);
      }
      if (pending.current === current) pending.current = undefined;
    }
  };
  const action = (
    <Tooltip content="Export all sessions as HTML" relationship="description">
      <Button
        type="button"
        appearance="secondary"
        className="w-btn outline"
        icon={busy ? <Spinner size="tiny" /> : <ArrowDownload20Regular />}
        disabled={busy}
        aria-busy={busy}
        onClick={() => void exportAnalysis()}
      >
        Export
      </Button>
    </Tooltip>
  );
  return (
    <div className={styles.root}>
      {actionTarget ? createPortal(action, actionTarget) : action}
      <Caption1 role="status" aria-live="polite">{state?.status ?? ""}</Caption1>
      {state?.error && <MessageBar intent="error"><MessageBarBody>{state.error} Select Export to retry.</MessageBarBody></MessageBar>}
    </div>
  );
}
