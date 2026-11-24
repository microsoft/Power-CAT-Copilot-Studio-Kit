import React from 'react';
import { makeStyles, mergeClasses, tokens, Card, Body1Strong, Caption1, Spinner } from '@fluentui/react-components';

export type InsightTone = 'warning' | 'success' | 'danger' | 'info';

interface InsightAlertCardProps {
  tone: InsightTone;
  icon: React.ReactNode;
  title: string;
  description: string;
  /** When true, replaces icon + text with an inline loading state. */
  loading?: boolean;
}

const useStyles = makeStyles({
  base: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    paddingTop: tokens.spacingVerticalM,
    paddingRight: tokens.spacingHorizontalL,
    paddingBottom: tokens.spacingVerticalM,
    paddingLeft: tokens.spacingHorizontalL,
    flex: '1 1 0',
    minWidth: '220px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderTopWidth: '1px',
    borderRightWidth: '1px',
    borderBottomWidth: '1px',
    borderTopStyle: 'solid',
    borderRightStyle: 'solid',
    borderBottomStyle: 'solid',
    borderTopColor: tokens.colorNeutralStroke2,
    borderRightColor: tokens.colorNeutralStroke2,
    borderBottomColor: tokens.colorNeutralStroke2,
    borderLeftWidth: '4px',
    borderLeftStyle: 'solid',
    borderRadius: tokens.borderRadiusMedium,
  },
  warning: {
    borderLeftColor: tokens.colorPaletteDarkOrangeBorderActive,
  },
  success: {
    borderLeftColor: tokens.colorPaletteGreenBorderActive,
  },
  danger: {
    borderLeftColor: tokens.colorPaletteRedBorderActive,
  },
  info: {
    borderLeftColor: tokens.colorBrandStroke1,
  },
  iconBox: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: '32px',
    height: '32px',
    borderRadius: tokens.borderRadiusMedium,
  },
  iconBoxWarning: {
    backgroundColor: tokens.colorPaletteYellowBackground1,
    color: tokens.colorPaletteDarkOrangeForeground1,
  },
  iconBoxSuccess: {
    backgroundColor: tokens.colorPaletteGreenBackground1,
    color: tokens.colorPaletteGreenForeground1,
  },
  iconBoxDanger: {
    backgroundColor: tokens.colorPaletteRedBackground1,
    color: tokens.colorPaletteRedForeground1,
  },
  iconBoxInfo: {
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground1,
  },
  text: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    minWidth: 0,
  },
  description: {
    color: tokens.colorNeutralForeground2,
  },
});

export function InsightAlertCard({ tone, icon, title, description, loading }: InsightAlertCardProps) {
  const styles = useStyles();
  const toneClass =
    tone === 'warning' ? styles.warning
      : tone === 'success' ? styles.success
      : tone === 'danger' ? styles.danger
      : styles.info;
  const iconBoxToneClass =
    tone === 'warning' ? styles.iconBoxWarning
      : tone === 'success' ? styles.iconBoxSuccess
      : tone === 'danger' ? styles.iconBoxDanger
      : styles.iconBoxInfo;

  return (
    <Card
      className={mergeClasses(styles.base, toneClass)}
      appearance="filled"
      role={loading ? 'status' : tone === 'warning' || tone === 'danger' ? 'alert' : 'status'}
      aria-busy={loading || undefined}
    >
      <span className={mergeClasses(styles.iconBox, iconBoxToneClass)} aria-hidden>
        {loading ? <Spinner size="tiny" /> : icon}
      </span>
      <div className={styles.text}>
        <Body1Strong>{loading ? 'Loading…' : title}</Body1Strong>
        {!loading && <Caption1 className={styles.description}>{description}</Caption1>}
      </div>
    </Card>
  );
}
