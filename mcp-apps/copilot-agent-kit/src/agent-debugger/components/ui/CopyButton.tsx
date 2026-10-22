import { type FC, useState, useCallback, useRef } from "react";
import { Button, Tooltip, tokens } from "@fluentui/react-components";
import { Copy20Regular, Checkmark20Regular } from "@fluentui/react-icons";

interface CopyButtonProps {
  /** Text to copy to clipboard */
  value: string;
  /** Button size — defaults to "small" */
  size?: "small" | "medium" | "large";
  /** Additional style overrides */
  style?: React.CSSProperties;
}

/**
 * Icon-only copy button with "Copied!" confirmation.
 * Shows a checkmark icon + "Copied!" tooltip for 2 seconds after click.
 */
const CopyButton: FC<CopyButtonProps> = ({ value, size = "small", style }) => {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  }, [value]);

  return (
    <Tooltip
      content={copied ? "Copied!" : "Copy to clipboard"}
      relationship="label"
      visible={copied ? true : undefined}
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
        aria-label={copied ? "Copied" : "Copy to clipboard"}
        onClick={handleCopy}
        style={style}
      />
    </Tooltip>
  );
};

export default CopyButton;
