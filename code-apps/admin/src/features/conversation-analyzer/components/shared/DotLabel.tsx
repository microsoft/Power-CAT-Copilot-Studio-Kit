import type { ReactNode } from 'react';
import { Body1, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';

export type DotTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral' | 'subtle';

const TONE_COLOR: Record<DotTone, string> = {
  brand: tokens.colorBrandBackground,
  success: tokens.colorPaletteGreenBackground3,
  warning: tokens.colorPaletteMarigoldBackground3,
  danger: tokens.colorPaletteRedBackground3,
  neutral: tokens.colorNeutralForeground3,
  subtle: tokens.colorNeutralStroke1,
};

const useStyles = makeStyles({
  root: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalSNudge,
    minWidth: 0,
  },
  dot: {
    width: '8px',
    height: '8px',
    flexShrink: 0,
    borderRadius: tokens.borderRadiusCircular,
  },
  text: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
});

interface DotLabelProps {
  tone?: DotTone;
  /** Explicit dot colour; overrides `tone`. */
  color?: string;
  children: ReactNode;
  muted?: boolean;
  className?: string;
}

/** Dot + text for categorical values that are not a status (G-6). */
export function DotLabel({ tone = 'neutral', color, children, muted = false, className }: DotLabelProps) {
  const styles = useStyles();
  return (
    <span className={mergeClasses(styles.root, className)}>
      <span className={styles.dot} style={{ backgroundColor: color ?? TONE_COLOR[tone] }} aria-hidden />
      <Body1 className={mergeClasses(styles.text, muted && styles.muted)}>{children}</Body1>
    </span>
  );
}
