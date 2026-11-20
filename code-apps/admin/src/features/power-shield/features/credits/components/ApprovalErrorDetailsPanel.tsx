import { useId, useState } from 'react';
import { Button, Text, makeStyles, tokens } from '@fluentui/react-components';
import { ChevronDownRegular, ChevronUpRegular, CopyRegular } from '@fluentui/react-icons';
import type { ApprovalErrorDetails } from '../services/approvalErrorDetails';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: tokens.spacingVerticalXS },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    padding: tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    wordBreak: 'break-word',
  },
});

/** "Show details" toggle for a failed approval: the step, a reference code and a short system message. */
export function ApprovalErrorDetailsPanel({ details }: { details: ApprovalErrorDetails }) {
  const styles = useStyles();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<boolean | undefined>();

  const text = [
    `Step: ${details.step}`,
    `Reference: ${details.reference}`,
    details.systemMessage ? `System message: ${details.systemMessage}` : undefined,
  ]
    .filter(Boolean)
    .join('\n');

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={styles.root}>
      <Button
        appearance="transparent"
        size="small"
        icon={open ? <ChevronUpRegular /> : <ChevronDownRegular />}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? 'Hide details' : 'Show details'}
      </Button>
      {open && (
        <div id={panelId} className={styles.panel}>
          <Text size={200}>Step that failed: {details.step}</Text>
          <Text size={200}>Reference: {details.reference}</Text>
          {details.systemMessage && <Text size={200}>System message: {details.systemMessage}</Text>}
          <Button size="small" icon={<CopyRegular />} onClick={() => void copy()}>
            Copy details
          </Button>
          <span role="status" aria-live="polite">
            {copied === true && <Text size={200}>Copied.</Text>}
            {copied === false && <Text size={200}>Couldn't copy. Select the text and copy it yourself.</Text>}
          </span>
        </div>
      )}
    </div>
  );
}
