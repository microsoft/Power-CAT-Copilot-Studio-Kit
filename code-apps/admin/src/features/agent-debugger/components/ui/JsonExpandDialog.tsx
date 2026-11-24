import { type FC, useMemo, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  Tooltip,
  tokens,
} from "@fluentui/react-components";
import {
  ArrowMaximize20Regular,
  Checkmark20Regular,
  Copy20Regular,
  Dismiss24Regular,
} from "@fluentui/react-icons";
import CopyButton from "./CopyButton";
import JsonViewer, { LARGE_DOCUMENT_THRESHOLD } from "./JsonViewer";

const CONTENT_MAX_HEIGHT = "min(64vh, 720px)";

interface JsonExpandDialogProps {
  /** Value to show in full; JSON strings are parsed so they render structured. */
  value: unknown;
  /** Dialog heading, e.g. "Inputs" or "Outputs". */
  title: string;
}

function toViewerData(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value.trim());
  } catch {
    return value;
  }
}

/** Icon button that opens a full-size, searchable, untruncated JSON dialog. */
export const JsonExpandButton: FC<JsonExpandDialogProps> = ({ value, title }) => {
  const [open, setOpen] = useState(false);
  const data = useMemo(() => (open ? toViewerData(value) : undefined), [open, value]);
  const jsonText = useMemo(
    () => (open ? (typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? String(value)) : ""),
    [open, value],
  );
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(jsonText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Dialog open={open} onOpenChange={(_, d) => setOpen(d.open)}>
      <DialogTrigger disableButtonEnhancement>
        <Tooltip content="Expand" relationship="description">
          <Button
            appearance="subtle"
            size="small"
            icon={<ArrowMaximize20Regular />}
            aria-label={`Expand ${title}`}
          />
        </Tooltip>
      </DialogTrigger>
      <DialogSurface style={{ width: "100%", maxWidth: "min(1040px, calc(100vw - 48px))" }}>
        <DialogBody>
          <DialogTitle
            action={
              <DialogTrigger action="close">
                <Button appearance="subtle" aria-label="Close" icon={<Dismiss24Regular />} />
              </DialogTrigger>
            }
          >
            {title}
          </DialogTitle>
          <DialogContent
            style={{
              maxHeight: CONTENT_MAX_HEIGHT,
              // The virtualized large-document view needs a definite height to scroll.
              height: jsonText.length >= LARGE_DOCUMENT_THRESHOLD ? CONTENT_MAX_HEIGHT : undefined,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <JsonViewer data={data} jsonText={jsonText} enableSearch showFullStrings searchPlaceholder="Search" />
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" icon={copied ? <Checkmark20Regular /> : <Copy20Regular />} onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </Button>
            <DialogTrigger action="close" disableButtonEnhancement>
              <Button appearance="primary">Close</Button>
            </DialogTrigger>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};

/** Expand + copy actions pinned to the top-right of a `position: relative` JSON block. */
export const JsonBlockActions: FC<JsonExpandDialogProps & { copyText: string }> = ({ value, title, copyText }) => (
  <div
    style={{
      position: "absolute",
      top: tokens.spacingVerticalXS,
      right: tokens.spacingHorizontalL,
      display: "flex",
      gap: tokens.spacingHorizontalXXS,
      backgroundColor: tokens.colorNeutralBackground1,
      borderRadius: tokens.borderRadiusMedium,
    }}
  >
    <JsonExpandButton value={value} title={title} />
    <CopyButton value={copyText} />
  </div>
);
