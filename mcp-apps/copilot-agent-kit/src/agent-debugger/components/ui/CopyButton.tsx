import { type FC, useState, useCallback, useRef } from "react";
import { Button, Tooltip, tokens } from "@fluentui/react-components";
import { Copy20Regular, Checkmark20Regular, ErrorCircle20Regular } from "@fluentui/react-icons";

interface CopyButtonProps {
  /** Text to copy to clipboard */
  value: string;
  /** Button size — defaults to "small" */
  size?: "small" | "medium" | "large";
  /** Additional style overrides */
  style?: React.CSSProperties;
}

type CopyStatus = "idle" | "copied" | "failed";

const TOOLTIP: Record<CopyStatus, string> = {
  idle: "Copy to clipboard",
  copied: "Copied!",
  failed: "Copy failed. The host blocked clipboard access.",
};

const ARIA_LABEL: Record<CopyStatus, string> = {
  idle: "Copy to clipboard",
  copied: "Copied",
  failed: "Copy failed",
};

/**
 * Icon-only copy button that reports the clipboard result.
 * Shows a checkmark icon + "Copied!" tooltip for 2 seconds only after the
 * clipboard write succeeds. If the write fails (for example, because the host
 * blocks clipboard access), shows an error icon + "Copy failed" tooltip for
 * 2 seconds instead.
 */
const CopyButton: FC<CopyButtonProps> = ({ value, size = "small", style }) => {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setStatus("idle"), 2000);
  }, [value]);

  return (
    <Tooltip
      content={TOOLTIP[status]}
      relationship="label"
      visible={status !== "idle" ? true : undefined}
    >
      <Button
        appearance="subtle"
        size={size}
        icon={
          status === "copied" ? (
            <Checkmark20Regular
              style={{ color: tokens.colorPaletteGreenForeground1 }}
            />
          ) : status === "failed" ? (
            <ErrorCircle20Regular
              style={{ color: tokens.colorPaletteRedForeground1 }}
            />
          ) : (
            <Copy20Regular />
          )
        }
        aria-label={ARIA_LABEL[status]}
        onClick={() => void handleCopy()}
        style={style}
      />
    </Tooltip>
  );
};

export default CopyButton;
