import React, { useMemo } from 'react';
import { Card, Skeleton, SkeletonItem, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { semanticColors } from '../../../theme/powerShieldTheme.tokens';
import type { CreditRequestSummary } from '../../../models/creditRequest';
import type { AdminCreditStatBucket } from '../../../models/status';
import { creditStatBucketForStatus } from '../../../models/status';

// ─────────────────────────────────────────────────────────────────────────────
// Styles (mirrors the connector StatsCards so the two tabs feel identical)
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'row',
    gap: tokens.spacingHorizontalSNudge,
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
  accentError: { backgroundColor: semanticColors.error },
  accentNeutral: { backgroundColor: tokens.colorNeutralForeground3 },
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
  countError: { color: tokens.colorPaletteRedForeground1 },
  countNeutral: { color: tokens.colorNeutralForeground3 },
  subtitle: {
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
    display: 'block',
  },
  countSkeleton: {
    height: '26px',
    width: '40px',
    marginBottom: '4px',
  },
});

type CountVariant = 'brand' | 'warning' | 'success' | 'error' | 'neutral';

// The bucket a card filters to. `null` = the Total card (clears the filter).
interface CardDef {
  label: string;
  subtitle: string | null;
  accentVariant: CountVariant;
  countVariant: CountVariant;
  bucket: AdminCreditStatBucket | null;
}

// Order and vocabulary: Total plus the three header-status buckets (MVP).
const CARD_DEFS: CardDef[] = [
  { label: 'Total',                subtitle: 'All credit requests', accentVariant: 'brand',   countVariant: 'brand',   bucket: null },
  { label: 'Awaiting decision',    subtitle: 'Need a decision',     accentVariant: 'warning', countVariant: 'warning', bucket: 'Awaiting decision' },
  { label: 'Approved',             subtitle: 'Approved by an admin', accentVariant: 'success', countVariant: 'success', bucket: 'Allocation recorded' },
  { label: 'Rejected',             subtitle: 'Declined by an admin', accentVariant: 'error',  countVariant: 'error',   bucket: 'Rejected' },
];

interface CreditStatsCardsProps {
  /** Rows filtered by everything EXCEPT the bucket tile (so counts stay stable while toggling). */
  requests: CreditRequestSummary[];
  isLoading: boolean;
  activeBucket: AdminCreditStatBucket | null;
  onBucketClick: (bucket: AdminCreditStatBucket | null) => void;
}

function CreditStatsCardsInner({ requests, isLoading, activeBucket, onBucketClick }: CreditStatsCardsProps) {
  const styles = useStyles();

  const countVariantClass: Record<CountVariant, string> = {
    brand: styles.countBrand,
    warning: styles.countWarning,
    success: styles.countSuccess,
    error: styles.countError,
    neutral: styles.countNeutral,
  };
  const accentVariantClass: Record<CountVariant, string> = {
    brand: styles.accentBrand,
    warning: styles.accentWarning,
    success: styles.accentSuccess,
    error: styles.accentError,
    neutral: styles.accentNeutral,
  };

  const countsByBucket = useMemo(() => {
    const counts: Record<AdminCreditStatBucket, number> = {
      Total: requests.length,
      'Awaiting decision': 0,
      'Allocation recorded': 0,
      Rejected: 0,
    };
    for (const r of requests) {
      const bucket = creditStatBucketForStatus(r.status);
      if (bucket) counts[bucket] += 1;
    }
    return counts;
  }, [requests]);

  return (
    <div className={styles.container}>
      {CARD_DEFS.map((card) => {
        const isActive = card.bucket === null ? activeBucket === null : activeBucket === card.bucket;
        const count = card.bucket === null ? countsByBucket.Total : countsByBucket[card.bucket];

        const handleClick = () => {
          onBucketClick(isActive ? null : card.bucket);
        };

        return (
          <Card
            key={card.label}
            appearance="outline"
            className={mergeClasses(styles.card, isActive && styles.cardActive)}
            onClick={handleClick}
            aria-pressed={isActive}
            aria-label={`${card.label}: ${count}`}
          >
            <div
              className={mergeClasses(styles.accentBar, accentVariantClass[card.accentVariant])}
              aria-hidden="true"
            />
            <div className={styles.cardContent}>
              <span className={mergeClasses(styles.label, isActive && styles.labelActive)}>
                {card.label}
              </span>
              {isLoading ? (
                <Skeleton>
                  <SkeletonItem className={styles.countSkeleton} shape="rectangle" />
                </Skeleton>
              ) : (
                <span className={mergeClasses(styles.count, countVariantClass[card.countVariant])}>
                  {count}
                </span>
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
