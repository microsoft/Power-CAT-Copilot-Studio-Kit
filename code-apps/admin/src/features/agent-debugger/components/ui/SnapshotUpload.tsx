import { useRef, useState, useCallback } from "react";
import { Button } from "@fluentui/react-components";
import {
  ArrowUpload24Regular,
  Dismiss16Regular,
  DocumentBulletList20Regular,
} from "@fluentui/react-icons";
import { parseSnapshotZip, isZipFile } from "../../services/snapshot-service";
import type { SnapshotData } from "../../services/snapshot-service";
export interface SnapshotUploadProps {
  onSnapshotParsed: (data: SnapshotData | null) => void;
}

export default function SnapshotUpload({ onSnapshotParsed }: SnapshotUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ data: SnapshotData; fileName: string } | null>(null);

  const processFile = useCallback(
    async (file: File) => {
      if (!isZipFile(file)) {
        setError("Please upload a .zip snapshot file from Copilot Studio.");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const data = await parseSnapshotZip(file);
        setLoaded({ data, fileName: file.name });
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
        accept=".zip"
        hidden
        onChange={handleFileChange}
        aria-label="Upload snapshot ZIP file"
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
          aria-label="Drop snapshot ZIP here or press Enter to browse"
        >
          <span className="ic big">
            <ArrowUpload24Regular className="w-ic" />
          </span>
          <span className="t">Upload a snapshot to analyze a conversation</span>
          <span className="hint">
            Drop <b>.zip</b> here or <u>browse</u>
          </span>
          <span className="desc">
            Upload a Copilot Studio snapshot ZIP file from the test pane to
            automatically analyze the conversation.
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
