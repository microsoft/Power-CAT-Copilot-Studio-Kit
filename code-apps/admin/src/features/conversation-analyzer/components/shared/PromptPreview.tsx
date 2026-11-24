import { usePromptText } from '../../hooks/usePromptText';
import { Badge, Body1, Body1Strong, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import type { PromptRow, PromptScope } from '../../contracts/types';
import { getPromptLabel } from '../../utils/format';

/** System = neutral badge, Custom = brand badge (PI-7). */
export function PromptTypeBadge({ scope }: { scope: PromptScope }) {
  return scope === 'system' ? (
    <Badge appearance="tint" color="informative" shape="rounded">System</Badge>
  ) : (
    <Badge appearance="tint" color="brand" shape="rounded">Custom</Badge>
  );
}

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    minWidth: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  text: {
    color: tokens.colorNeutralForeground2,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
  clamp: {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  empty: {
    color: tokens.colorNeutralForeground3,
    fontStyle: 'italic',
  },
});

interface PromptPreviewProps {
  prompt: PromptRow;
  /** Clamp the prompt text to this many lines; omit for full text. */
  maxLines?: number;
  className?: string;
}

/** Prompt name, type badge and prompt text (CV-17, NA-1). */
export function PromptPreview({ prompt, maxLines, className }: PromptPreviewProps) {
  const styles = useStyles();
  const { text, isLoading } = usePromptText(prompt);
  return (
    <div className={mergeClasses(styles.root, className)} aria-label="Prompt preview" role="region">
      <div className={styles.header}>
        <Body1Strong>{getPromptLabel(prompt)}</Body1Strong>
        <PromptTypeBadge scope={prompt.scope} />
      </div>
      {text ? (
        <Body1
          className={mergeClasses(styles.text, maxLines != null && styles.clamp)}
          style={maxLines != null ? { WebkitLineClamp: maxLines } : undefined}
          title={maxLines != null ? text : undefined}
        >
          {text}
        </Body1>
      ) : (
        <Body1 className={styles.empty}>
          {isLoading ? 'Loading prompt…' : 'This prompt has no text.'}
        </Body1>
      )}
    </div>
  );
}
