import React from 'react';
import { makeStyles, mergeClasses, tokens, Card, Caption2, Title1, Caption1, Spinner } from '@fluentui/react-components';

export type KpiTrend = 'up' | 'down' | 'flat';
export type KpiTone = 'default' | 'success' | 'warning';

interface KpiCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  description?: string;
  trendText?: string;
  trend?: KpiTrend;
  loading?: boolean;
  /** Icon container background/foreground tone. Defaults to the brand pink accent. */
  iconTone?: KpiTone;
  /** Tone for the description caption. 'success' colors it green for positive states. */
  descriptionTone?: KpiTone;
}

const useStyles = makeStyles({
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    flex: '1 1 0',
    minWidth: '180px',
    paddingTop: tokens.spacingVerticalL,
    paddingRight: tokens.spacingHorizontalL,
    paddingBottom: tokens.spacingVerticalL,
    paddingLeft: tokens.spacingHorizontalL,
  },
  labelRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalS,
  },
  label: {
    color: tokens.colorNeutralForeground2,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontWeight: tokens.fontWeightSemibold,
  },
  iconBox: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    borderRadius: tokens.borderRadiusMedium,
    flexShrink: 0,
  },
  iconBoxDefault: {
    backgroundColor: tokens.colorPaletteRedBackground1,
    color: tokens.colorPaletteRedForeground1,
  },
  iconBoxSuccess: {
    backgroundColor: tokens.colorPaletteGreenBackground1,
    color: tokens.colorPaletteGreenForeground1,
  },
  iconBoxWarning: {
    backgroundColor: tokens.colorPaletteYellowBackground1,
    color: tokens.colorPaletteDarkOrangeForeground1,
  },
  valueRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: tokens.spacingHorizontalS,
  },
  trendUp: {
    color: tokens.colorPaletteGreenForeground1,
    backgroundColor: tokens.colorPaletteGreenBackground1,
    borderRadius: tokens.borderRadiusSmall,
    paddingLeft: tokens.spacingHorizontalXS,
    paddingRight: tokens.spacingHorizontalXS,
    paddingTop: tokens.spacingVerticalXXS,
    paddingBottom: tokens.spacingVerticalXXS,
  },
  trendDown: {
    color: tokens.colorPaletteRedForeground1,
    backgroundColor: tokens.colorPaletteRedBackground1,
    borderRadius: tokens.borderRadiusSmall,
    paddingLeft: tokens.spacingHorizontalXS,
    paddingRight: tokens.spacingHorizontalXS,
    paddingTop: tokens.spacingVerticalXXS,
    paddingBottom: tokens.spacingVerticalXXS,
  },
  description: {
    color: tokens.colorNeutralForeground3,
  },
  descriptionSuccess: {
    color: tokens.colorPaletteGreenForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  descriptionWarning: {
    color: tokens.colorPaletteDarkOrangeForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
});

export function KpiCard({
  label,
  value,
  icon,
  description,
  trendText,
  trend,
  loading,
  iconTone = 'default',
  descriptionTone = 'default',
}: KpiCardProps) {
  const styles = useStyles();
  const trendClass = trend === 'up' ? styles.trendUp : trend === 'down' ? styles.trendDown : undefined;
  const iconBoxToneClass =
    iconTone === 'success' ? styles.iconBoxSuccess
      : iconTone === 'warning' ? styles.iconBoxWarning
      : styles.iconBoxDefault;
  const descriptionClass =
    descriptionTone === 'success' ? styles.descriptionSuccess
      : descriptionTone === 'warning' ? styles.descriptionWarning
      : styles.description;

  return (
    <Card className={styles.card} appearance="filled">
      <div className={styles.labelRow}>
        <Caption2 className={styles.label}>{label}</Caption2>
        <span className={mergeClasses(styles.iconBox, iconBoxToneClass)} aria-hidden>
          {icon}
        </span>
      </div>
      <div className={styles.valueRow} aria-live="polite" aria-atomic="true">
        <Title1>
          <span aria-label={loading ? `${label}: loading` : `${label}: ${value}`}>
            {loading ? <Spinner size="tiny" /> : value}
          </span>
        </Title1>
        {trendText && (
          <Caption1 className={trendClass}>{trendText}</Caption1>
        )}
      </div>
      {description && <Caption1 className={descriptionClass}>{description}</Caption1>}
    </Card>
  );
}
