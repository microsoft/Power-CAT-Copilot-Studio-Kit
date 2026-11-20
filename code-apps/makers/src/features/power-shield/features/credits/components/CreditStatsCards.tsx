import React from 'react';
import { Card, Skeleton, SkeletonItem, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { semanticColors } from '../../../theme/powerShieldTheme.tokens';
import type { CreditRequestSummary } from '../../../models/creditRequest';
import type { CreditStatCardBucket } from '../../../models/status';
import { CREDIT_LABEL_TO_STAT_BUCKET } from '../../../models/status';

// ─────────────────────────────────────────────────────────────────────────────
// Copilot Credits stat cards (T028, FR-005, FR-032). Buckets: Total, Awaiting
// decision, Being allocated, Allocated, and a conditional "Needs your attention"
// card that only appears when its count is greater than zero. No amounts.
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'row',
    gap: tokens.spacingHorizontalM,
  },
  card: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: tokens.spacingHorizontalM,
    flex: '1',
    minWidth: '0',
    cursor: 'pointer',
  },
  cardActive: {
    borderTopColor: tokens.colorBrandForeground1,
    borderRightColor: tokens.colorBrandForeground1,
    borderBottomColor: tokens.colorBrandForeground1,
    borderLeftColor: tokens.colorBrandForeground1,
    boxShadow: `0 0 0 3px ${tokens.colorBrandBackground2}`,
    ':hover': {
      borderTopColor: tokens.colorBrandForeground1,
      borderRightColor: tokens.colorBrandForeground1,
      borderBottomColor: tokens.colorBrandForeground1,
      borderLeftColor: tokens.colorBrandForeground1,
      boxShadow: `0 0 0 3px ${tokens.colorBrandBackground2}`,
    },
  },
  accentBar: {
    width: '3px',
    borderRadius: tokens.borderRadiusSmall,
    flexShrink: 0,
  },
  accentBrand: { backgroundColor: tokens.colorBrandForeground1 },
  accentWarning: { backgroundColor: semanticColors.warning },
  accentSuccess: { backgroundColor: semanticColors.success },
  accentInfo: { backgroundColor: tokens.colorBrandForeground2 },
  accentError: { backgroundColor: semanticColors.error },
  cardContent: {
    display: 'flex',
    flexDirection: 'column',
    flex: '1',
    minWidth: '0',
  },
  label: {
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightSemibold,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    color: tokens.colorNeutralForeground3,
    display: 'block',
    marginBottom: tokens.spacingVerticalXXS,
  },
  labelActive: {
    color: tokens.colorBrandForeground1,
  },
  count: {
    fontSize: tokens.fontSizeBase600,
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: '1',
    display: 'block',
    marginBottom: tokens.spacingVerticalXXS,
  },
  countBrand: { color: tokens.colorBrandForeground1 },
  countWarning: { color: tokens.colorPaletteYellowForeground1 },
  countSuccess: { color: tokens.colorPaletteGreenForeground1 },
  countInfo: { color: tokens.colorBrandForeground1 },
  countError: { color: tokens.colorPaletteRedForeground1 },
  subtitle: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    display: 'block',
  },
  countSkeleton: {
    height: '26px',
    width: '40px',
    marginBottom: tokens.spacingVerticalXXS,
  },
});

interface CreditStatsCardsProps {
  requests: CreditRequestSummary[];
  isLoading: boolean;
  activeBucket: CreditStatCardBucket | null;
  onBucketClick: (bucket: CreditStatCardBucket | null) => void;
}

type Variant = 'brand' | 'warning' | 'success' | 'info' | 'error';

interface CardDef {
  bucket: CreditStatCardBucket;
  label: string;
  subtitle: string | null;
  accentVariant: Variant;
  countVariant: Variant;
  count: number;
}

function countForBucket(requests: CreditRequestSummary[], bucket: CreditStatCardBucket): number {
  if (bucket === 'Total') return requests.length;
  return requests.filter((r) => CREDIT_LABEL_TO_STAT_BUCKET[r.creditLabel] === bucket).length;
}

function CreditStatsCardsInner({ requests, isLoading, activeBucket, onBucketClick }: CreditStatsCardsProps) {
  const styles = useStyles();

  const accentClass: Record<Variant, string> = {
    brand: styles.accentBrand,
    warning: styles.accentWarning,
    success: styles.accentSuccess,
    info: styles.accentInfo,
    error: styles.accentError,
  };
  const countClass: Record<Variant, string> = {
    brand: styles.countBrand,
    warning: styles.countWarning,
    success: styles.countSuccess,
    info: styles.countInfo,
    error: styles.countError,
  };

  const needsAttentionCount = countForBucket(requests, 'Needs your attention');

  const cards: CardDef[] = [
    { bucket: 'Total', label: 'Total', subtitle: 'All requests', accentVariant: 'brand', countVariant: 'brand', count: countForBucket(requests, 'Total') },
    { bucket: 'Awaiting decision', label: 'Awaiting decision', subtitle: 'With the admin', accentVariant: 'warning', countVariant: 'warning', count: countForBucket(requests, 'Awaiting decision') },
    { bucket: 'Being allocated', label: 'Being allocated', subtitle: 'Approved, in progress', accentVariant: 'info', countVariant: 'info', count: countForBucket(requests, 'Being allocated') },
    { bucket: 'Allocated', label: 'Allocated', subtitle: 'Credits granted', accentVariant: 'success', countVariant: 'success', count: countForBucket(requests, 'Allocated') },
  ];

  // "Needs your attention" only appears when it has something to show (FR-032).
  if (needsAttentionCount > 0) {
    cards.push({
      bucket: 'Needs your attention',
      label: 'Needs your attention',
      subtitle: 'Action may be needed',
      accentVariant: 'error',
      countVariant: 'error',
      count: needsAttentionCount,
    });
  }

  return (
    <div className={styles.container} role="group" aria-label="Filter requests by status">
      {cards.map((card) => {
        const isActive = activeBucket === card.bucket;
        const handleClick = () => onBucketClick(isActive ? null : card.bucket);
        return (
          <Card
            key={card.bucket}
            appearance="outline"
            className={mergeClasses(styles.card, isActive && styles.cardActive)}
            role="button"
            tabIndex={0}
            onClick={handleClick}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleClick();
              }
            }}
            aria-pressed={isActive}
            aria-label={`${card.label}: ${card.count}`}
          >
            <div className={mergeClasses(styles.accentBar, accentClass[card.accentVariant])} aria-hidden="true" />
            <div className={styles.cardContent}>
              <span className={mergeClasses(styles.label, isActive && styles.labelActive)}>{card.label}</span>
              {isLoading ? (
                <Skeleton>
                  <SkeletonItem className={styles.countSkeleton} shape="rectangle" />
                </Skeleton>
              ) : (
                <span className={mergeClasses(styles.count, countClass[card.countVariant])}>{card.count}</span>
              )}
              {card.subtitle && <span className={styles.subtitle}>{card.subtitle}</span>}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export const CreditStatsCards = React.memo(CreditStatsCardsInner);

export default CreditStatsCards;
