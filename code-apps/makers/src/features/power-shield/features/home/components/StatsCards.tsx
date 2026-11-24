import React from 'react';
import { Card, Skeleton, SkeletonItem, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { semanticColors } from '../../../theme/powerShieldTheme.tokens';
import type { PolicyRequestSummary } from '../../../models/policyRequest';
import type { RequestStatus } from '../../../models/status';

// ─────────────────────────────────────────────────────────────────────────────
// Styles
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
  subtitleGood: {
    color: semanticColors.success,
    fontWeight: tokens.fontWeightSemibold,
  },
  countSkeleton: {
    height: '26px',
    width: '40px',
    marginBottom: tokens.spacingVerticalXXS,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface StatsCardsProps {
  requests: PolicyRequestSummary[];
  isLoading: boolean;
  activeTileStatuses: RequestStatus[] | null;
  onTileClick: (statuses: RequestStatus[] | null) => void;
}

type CountVariant = 'brand' | 'warning' | 'success' | 'error' | 'neutral';

interface CardDef {
  label: string;
  accentVariant: CountVariant;
  countVariant: CountVariant;
  count: number;
  subtitle: string | null;
  subtitleGood?: boolean;
  statuses: RequestStatus[] | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isCardActive(
  cardStatuses: RequestStatus[] | null,
  activeTileStatuses: RequestStatus[] | null,
): boolean {
  if (cardStatuses === null) return activeTileStatuses === null;
  if (activeTileStatuses === null) return false;
  return (
    cardStatuses.length === activeTileStatuses.length &&
    cardStatuses.every((s) => activeTileStatuses.includes(s))
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

function StatsCardsInner({ requests, isLoading, activeTileStatuses, onTileClick }: StatsCardsProps) {
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

  const total = requests.length;
  const completedCount = requests.filter((r) =>
    ['Approved', 'Implementing', 'Implemented'].includes(r.status),
  ).length;
  const policyFailedCount = requests.filter((r) => r.status === 'ImplementedWithErrors').length;
  const pendingCount = requests.filter((r) => r.status === 'UnderReview').length;

  const approvalRate = total > 0 ? Math.round((completedCount / total) * 100) : null;

  const COMPLETED_STATUSES: RequestStatus[] = ['Approved', 'Implementing', 'Implemented'];
  const POLICY_FAILED_STATUSES: RequestStatus[] = ['ImplementedWithErrors'];
  const PENDING_STATUSES: RequestStatus[] = ['UnderReview'];

  const cards: CardDef[] = [
    {
      label: 'Total',
      accentVariant: 'brand',
      countVariant: 'brand',
      count: total,
      subtitle: null,
      statuses: null,
    },
    {
      label: 'Pending',
      accentVariant: 'warning',
      countVariant: 'warning',
      count: pendingCount,
      subtitle: 'In progress',
      statuses: PENDING_STATUSES,
    },
    {
      label: 'Completed',
      accentVariant: 'success',
      countVariant: 'success',
      count: completedCount,
      subtitle: approvalRate !== null ? `${approvalRate}% approval rate` : 'No requests yet',
      statuses: COMPLETED_STATUSES,
    },
    {
      label: 'Policy Failed',
      accentVariant: 'error',
      countVariant: 'error',
      count: policyFailedCount,
      subtitle: null,
      statuses: POLICY_FAILED_STATUSES,
    },
  ];

  return (
    <div className={styles.container}>
      {cards.map((card) => {
        const isActive = isCardActive(card.statuses, activeTileStatuses);

        const handleClick = () => {
          onTileClick(isActive ? null : card.statuses);
        };

        return (
          <Card
            key={card.label}
            appearance="outline"
            className={mergeClasses(styles.card, isActive && styles.cardActive)}
            onClick={handleClick}
            aria-pressed={isActive}
            aria-label={`${card.label}: ${card.count}`}
          >
            {/* Left accent bar */}
            <div
              className={mergeClasses(styles.accentBar, accentVariantClass[card.accentVariant])}
              aria-hidden="true"
            />

            {/* Card content */}
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
                  {card.count}
                </span>
              )}

              {card.subtitle && (
                <span
                  className={mergeClasses(
                    styles.subtitle,
                    card.subtitleGood && styles.subtitleGood,
                  )}
                >
                  {card.subtitle}
                </span>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export const StatsCards = React.memo(StatsCardsInner);

export default StatsCards;
