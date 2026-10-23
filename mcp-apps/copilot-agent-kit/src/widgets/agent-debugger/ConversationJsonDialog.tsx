import { useEffect, useMemo, useState } from "react";
import {
  Button, Dialog, DialogBody, DialogContent, DialogSurface, DialogTitle,
  MessageBar, MessageBarBody, Spinner, Text, Tooltip, makeStyles, tokens,
} from "@fluentui/react-components";
import { ArrowDownload20Regular, Copy20Regular, Dismiss20Regular } from "@fluentui/react-icons";
import type { ConversationTranscriptJson } from "../../agent-debugger/contracts/diagnostics";
import { JsonViewer } from "../../agent-debugger/components/ui";
import { useMcpApp } from "../shared/McpAppProvider";
import { downloadJson } from "../shared/download";

const useStyles = makeStyles({
  surface: { width: "960px", maxWidth: "calc(100vw - 24px)", height: "min(84vh, 800px)", display: "flex", flexDirection: "column", overflow: "hidden" },
  body: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS, minHeight: 0, flex: 1, overflow: "hidden" },
  heading: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: tokens.spacingHorizontalS, flexShrink: 0 },
  title: { flex: 1, minWidth: 0, overflowWrap: "anywhere" },
  close: { flexShrink: 0 },
  content: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS, flex: 1, minHeight: 0, overflow: "hidden" },
  tools: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: tokens.spacingHorizontalS, flexWrap: "wrap" },
  actions: { display: "flex", gap: tokens.spacingHorizontalXS },
  note: { color: tokens.colorNeutralForeground3, overflowWrap: "anywhere" },
  loading: { display: "grid", placeItems: "center", minHeight: "200px", flex: 1 },
  viewer: { flex: 1, minHeight: 0, overflow: "hidden" },
});

export function ConversationJsonDialog({ conversationId, onLoad, onClose }: {
  conversationId: string;
  onLoad: () => Promise<ConversationTranscriptJson>;
  onClose: () => void;
}) {
  const styles = useStyles();
  const { app, theme } = useMcpApp();
  const [value, setValue] = useState<ConversationTranscriptJson>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const text = useMemo(() => value ? JSON.stringify(value, null, 2) : "", [value]);
  const canDownload = Boolean(app?.getHostCapabilities()?.downloadFile);

  useEffect(() => {
    let disposed = false;
    setLoading(true);
    setError("");
    void onLoad().then((next) => { if (!disposed) setValue(next); }).catch((caught: unknown) => {
      if (!disposed) setError(caught instanceof Error ? caught.message : "The full conversation JSON could not be loaded.");
    }).finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [onLoad, retry]);

  const exportJson = async () => {
    if (!app || !value) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await downloadJson(app, `conversation-${conversationId}.json`, text);
      setStatus("The host accepted the download request.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The JSON download failed.");
    } finally { setBusy(false); }
  };
  const copy = async () => {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await navigator.clipboard.writeText(text);
      setStatus("JSON copied.");
    } catch {
      setError("The host blocked clipboard access. Text selection is still available in the viewer.");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(_, data) => { if (!data.open) onClose(); }}>
      <DialogSurface className={styles.surface} style={{ colorScheme: theme }} aria-label="Conversation JSON">
        <DialogBody className={styles.body}>
          <div className={styles.heading}>
            <DialogTitle className={styles.title}>Conversation JSON</DialogTitle>
            <Button className={styles.close} appearance="subtle" icon={<Dismiss20Regular />} aria-label="Close conversation JSON" onClick={onClose} />
          </div>
          <DialogContent className={styles.content}>
            <Text size={200} className={styles.note}>
              {conversationId}. All saved parent-agent sessions are included. Connected-agent transcripts are separate.
              This data loads on request; it is not part of the initial widget result.
            </Text>
            {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
            {status && <Text size={200} role="status">{status}</Text>}
            {loading ? <div className={styles.loading}><Spinner label="Loading full conversation JSON..." /></div> : value ? (
              <>
                <div className={styles.tools}>
                  <Text size={200}>{value.recordCount} saved {value.recordCount === 1 ? "record" : "records"} | {value.activityCount} {value.activityCount === 1 ? "activity" : "activities"}</Text>
                  <div className={styles.actions}>
                    <Button size="small" icon={<Copy20Regular />} disabled={busy} onClick={() => void copy()}>Copy JSON</Button>
                    <Tooltip relationship="description" content={canDownload ? "Request a download through the MCP host." : "This host does not support file downloads. Copy or select the JSON instead."}>
                      <Button size="small" icon={<ArrowDownload20Regular />} aria-label="Download conversation JSON" disabled={!canDownload || busy} onClick={() => void exportJson()}>Download</Button>
                    </Tooltip>
                  </div>
                </div>
                <div className={styles.viewer}><JsonViewer data={value} jsonText={text} enableSearch /></div>
              </>
            ) : <Button onClick={() => setRetry((attempt) => attempt + 1)}>Retry JSON load</Button>}
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
