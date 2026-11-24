import { type FC, useState, useCallback, useEffect, useRef } from "react";
import { Button, makeStyles, Tooltip, tokens } from "@fluentui/react-components";
import { Copy20Regular, Checkmark20Regular } from "@fluentui/react-icons";

const useStyles = makeStyles({
  visuallyHidden: {
    position: "absolute",
    width: "1px",
    height: "1px",
    padding: 0,
    margin: "-1px",
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    border: 0,
  },
});

interface CopyButtonProps {
  /** Text to copy to clipboard */
  value: string;
  /** Accessible action label and default tooltip text. */
  label?: string;
  /** Assistive-technology feedback after a successful copy. */
  successMessage?: string;
  /** Assistive-technology feedback when clipboard access fails. */
  errorMessage?: string;
  /** Button size — defaults to "small" */
  size?: "small" | "medium" | "large";
  /** Additional style overrides */
  style?: React.CSSProperties;
}

/**
 * Icon-only copy button with "Copied!" confirmation.
 * Shows a checkmark icon + "Copied!" tooltip for 2 seconds after click.
 */
const CopyButton: FC<CopyButtonProps> = ({
  value,
  label = "Copy to clipboard",
  successMessage = "Copied to clipboard",
  errorMessage = "Couldn't copy to clipboard",
  size = "small",
  style,
}) => {
  const styles = useStyles();
  const [copyResult, setCopyResult] = useState<{
    status: "copied" | "error";
    value: string;
  } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const clearStatusTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = undefined;
  }, []);

  useEffect(() => {
    clearStatusTimer();
    return clearStatusTimer;
  }, [value, clearStatusTimer]);

  const handleCopy = useCallback(async () => {
    clearStatusTimer();
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API is unavailable");
      await navigator.clipboard.writeText(value);
      setCopyResult({ status: "copied", value });
    } catch {
      setCopyResult({ status: "error", value });
    }
    timerRef.current = setTimeout(() => setCopyResult(null), 2000);
  }, [clearStatusTimer, value]);

  const status = copyResult?.value === value ? copyResult.status : "idle";
  const copied = status === "copied";
  const feedback = copied ? successMessage : status === "error" ? errorMessage : "";

  return (
    <>
      <Tooltip
        content={copied ? successMessage : status === "error" ? errorMessage : label}
        relationship="label"
      >
        <Button
          appearance="subtle"
          size={size}
          icon={
            copied ? (
              <Checkmark20Regular
                style={{ color: tokens.colorPaletteGreenForeground1 }}
              />
            ) : (
              <Copy20Regular />
            )
          }
          aria-label={label}
          onClick={() => void handleCopy()}
          style={style}
        />
      </Tooltip>
      <span className={styles.visuallyHidden} role="status" aria-live="polite">
        {feedback}
      </span>
    </>
  );
};

export default CopyButton;
