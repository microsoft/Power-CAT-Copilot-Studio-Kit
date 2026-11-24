import { useEffect, useState, type MouseEvent, type KeyboardEvent } from 'react';
import { Button, Tooltip } from '@fluentui/react-components';
import { Checkmark16Regular, Copy16Regular } from '@fluentui/react-icons';

interface CopyIdButtonProps {
  value: string;
  /** Accessible name, e.g. "Copy conversation ID". */
  label?: string;
  className?: string;
}

/** Copies an ID without selecting the grid row or navigating (GR-2). */
export function CopyIdButton({ value, label = 'Copy ID', className }: CopyIdButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(id);
  }, [copied]);

  const handleClick = (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    void navigator.clipboard
      ?.writeText(value)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };

  return (
    <Tooltip content={copied ? 'Copied' : label} relationship="label">
      <Button
        className={className}
        appearance="subtle"
        size="small"
        icon={copied ? <Checkmark16Regular /> : <Copy16Regular />}
        onClick={handleClick}
        onKeyDown={(event: KeyboardEvent) => event.stopPropagation()}
      />
    </Tooltip>
  );
}
