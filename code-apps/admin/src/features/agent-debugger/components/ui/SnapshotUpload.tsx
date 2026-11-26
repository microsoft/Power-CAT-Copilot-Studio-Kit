import { useRef, useState, useCallback, useEffect } from "react";
import { Button } from "@fluentui/react-components";
import {
  ArrowUpload24Regular,
  Dismiss16Regular,
  DocumentBulletList20Regular,
} from "@fluentui/react-icons";
import {
  parseSnapshotFile,
  parseTranscriptJson,
  isJsonFile,
  isZipFile,
} from "../../services/snapshot-service";
import type { SnapshotData } from "../../services/snapshot-service";
export interface SnapshotUploadProps {
  onSnapshotParsed: (data: SnapshotData | null) => void;
}

const PASTED_SOURCE_NAME = "Pasted transcript JSON";

export default function SnapshotUpload({ onSnapshotParsed }: SnapshotUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ data: SnapshotData; fileName: string } | null>(null);

  const load = useCallback(
    async (sourceName: string, parse: () => Promise<SnapshotData>) => {
      setLoading(true);
      setError(null);
      try {
        const data = await parse();
        setLoaded({ data, fileName: sourceName });
        onSnapshotParsed(data);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to parse snapshot file.";
        setError(msg);
        setLoaded(null);
        onSnapshotParsed(null);
      } finally {
        setLoading(false);
      }
    },
    [onSnapshotParsed]
  );

  const processFile = useCallback(
    (file: File) => {
      if (!isZipFile(file) && !isJsonFile(file)) {
        setError("Please upload a .zip snapshot or a transcript .json file.");
        return;
      }
      void load(file.name, () => parseSnapshotFile(file));
    },
    [load]
  );

  // Ctrl+V anywhere while the uploader is idle loads pasted transcript JSON or a copied file.
  useEffect(() => {
    if (loaded || loading) return;
    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      const file = e.clipboardData?.files[0];
      if (file) {
        e.preventDefault();
        processFile(file);
        return;
      }
      const text = e.clipboardData?.getData("text/plain")?.trim();
      if (!text) return;
      e.preventDefault();
      void load(PASTED_SOURCE_NAME, async () => parseTranscriptJson(text));
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [loaded, loading, load, processFile]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      e.target.value = "";
    },
    [processFile]
  );

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setLoaded(null);
      setError(null);
      onSnapshotParsed(null);
    },
    [onSnapshotParsed]
  );

  const openBrowser = useCallback(() => {
    if (!loaded) fileInputRef.current?.click();
  }, [loaded]);

  const dropZoneClass = [
    "w-drop",
    loaded ? "loaded" : "",
    dragging ? "dragging" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,.json"
        hidden
        onChange={handleFileChange}
        aria-label="Upload snapshot ZIP or transcript JSON file"
      />

      {loading ? (
        <div className="w-drop">
          <span className="w-spin">
            <i />
            Parsing snapshot…
          </span>
        </div>
      ) : loaded ? (
        <div
          className={dropZoneClass}
          role="region"
          aria-label={`Snapshot loaded: ${loaded.fileName}`}
        >
          <span className="ic">
            <DocumentBulletList20Regular className="w-ic" />
          </span>
          <span className="fn" title={loaded.fileName}>
            {loaded.fileName}
          </span>
          {loaded.data.botName && (
            <span className="tag" title={loaded.data.botName}>
              {loaded.data.botName}
            </span>
          )}
          {loaded.data.conversationId && (
            <span className="cid" title={loaded.data.conversationId}>
              {loaded.data.conversationId}
            </span>
          )}
          <Button
            type="button"
            appearance="transparent"
            className="w-iconbtn"
            style={{ marginLeft: "auto" }}
            onClick={handleClear}
            aria-label="Remove snapshot"
            icon={<Dismiss16Regular className="w-ic" />}
          />
        </div>
      ) : (
        <Button
          type="button"
          appearance="transparent"
          className={dropZoneClass}
          onClick={openBrowser}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          aria-label="Drop snapshot ZIP or transcript JSON here, press Enter to browse, or press Ctrl+V to paste transcript JSON"
        >
          <span className="ic big">
            <ArrowUpload24Regular className="w-ic" />
          </span>
          <span className="t">Upload a snapshot or conversation transcript to analyze a conversation</span>
          <span className="hint">
            Drop <b>.zip</b> or <b>.json</b> here or <u>browse</u>
          </span>
          <span className="desc">
            Upload a Copilot Studio snapshot ZIP file from the test pane or a
            conversation transcript JSON file. You can also paste the transcript
            JSON directly.
          </span>
        </Button>
      )}

      {error && (
        <span className="w-droperr" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
