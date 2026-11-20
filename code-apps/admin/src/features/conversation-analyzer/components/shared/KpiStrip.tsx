import type { ReactNode } from 'react';
import {
  Body1Strong,
  Caption1,
  Card,
  Skeleton,
  SkeletonItem,
  Title2,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';

export interface KpiStripTile {
  id: string;
  label: string;
  /** Colour-key square shown before the label. */
  color?: string;
  value: ReactNode;
  /** Muted text after the value, e.g. "/ 24". */
  valueSuffix?: ReactNode;
  /** One-line muted description. */
  description?: ReactNode;
  /** Optional small visual (sparkline, ring, bar) rendered after the value. */
  visual?: ReactNode;
}

interface KpiStripProps {
  tiles: KpiStripTile[];
  isLoading?: boolean;
  ariaLabel?: string;
  className?: string;
}

const useStyles = makeStyles({
  strip: {
    display: 'grid',
    gridAutoColumns: 'minmax(0, 1fr)',
    gridAutoFlow: 'column',
    paddingTop: tokens.spacingVerticalXS,
    paddingBottom: tokens.spacingVerticalXS,
    paddingLeft: 0,
    paddingRight: 0,
    gap: 0,
    '@media (max-width: 1024px)': {
      gridAutoFlow: 'row',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    },
  },
  tile: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    minWidth: 0,
    paddingTop: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalM,
    paddingLeft: tokens.spacingHorizontalL,
    paddingRight: tokens.spacingHorizontalL,
  },
  divider: {
    borderLeft: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    '@media (max-width: 1024px)': {
      ':nth-child(odd)': { borderLeft: 'none' },
    },
  },
  labelRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    minWidth: 0,
  },
  swatch: {
    width: '10px',
    height: '10px',
    flexShrink: 0,
    borderRadius: tokens.borderRadiusSmall,
  },
  label: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  valueRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: tokens.spacingHorizontalXS,
    minWidth: 0,
  },
  value: {
    lineHeight: tokens.lineHeightBase600,
  },
  suffix: {
    color: tokens.colorNeutralForeground3,
  },
  visual: {
    marginLeft: 'auto',
    alignSelf: 'center',
  },
  description: {
    color: tokens.colorNeutralForeground3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
});

/** Header-less KPI card split into tiles by thin dividers (OV-2, PI-3, AR-2). */
export function KpiStrip({ tiles, isLoading = false, ariaLabel = 'Key metrics', className }: KpiStripProps) {
  const styles = useStyles();
  return (
    <Card className={mergeClasses(styles.strip, className)} role="group" aria-label={ariaLabel}>
      {tiles.map((tile, index) => (
        <div key={tile.id} className={mergeClasses(styles.tile, index > 0 && styles.divider)}>
          <div className={styles.labelRow}>
            {tile.color && (
              <span className={styles.swatch} style={{ backgroundColor: tile.color }} aria-hidden />
            )}
            <Body1Strong className={styles.label}>{tile.label}</Body1Strong>
          </div>
          {isLoading ? (
            <Skeleton aria-label={`Loading ${tile.label}`}>
              <SkeletonItem size={28} style={{ width: '60%' }} />
            </Skeleton>
          ) : (
            <>
              <div className={styles.valueRow}>
                <Title2 className={styles.value}>{tile.value}</Title2>
                {tile.valueSuffix && <Caption1 className={styles.suffix}>{tile.valueSuffix}</Caption1>}
                {tile.visual && <div className={styles.visual}>{tile.visual}</div>}
              </div>
              {tile.description && <Caption1 className={styles.description}>{tile.description}</Caption1>}
            </>
          )}
        </div>
      ))}
    </Card>
  );
}
