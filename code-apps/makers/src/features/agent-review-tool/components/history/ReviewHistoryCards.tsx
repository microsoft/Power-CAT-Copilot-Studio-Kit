import {
  Body1Strong,
  Caption1,
  Card,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { BotSparkle24Regular } from '@fluentui/react-icons';
import type { ReviewHistoryEntry } from '../../contracts/ReviewResult';
import { formatDateTime } from '../../utils/dateUtils';
import { getScoreColor } from '../../utils/scoreCalculator';
import { ReviewFreshnessBadge } from './ReviewFreshnessBadge';
import {
  reviewScoreLabel,
  reviewTypeLabel,
  reviewVersionLabel,
} from './reviewHistoryPresentation';

const useStyles = makeStyles({
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  card: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusMedium,
    ':focus-visible': {
      outlineColor: tokens.colorStrokeFocus2,
      outlineStyle: 'solid',
      outlineWidth: '2px',
    },
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    minHeight: '48px',
  },
  botIcon: {
    width: '32px',
    height: '32px',
    borderRadius: tokens.borderRadiusMedium,
    objectFit: 'cover',
    flexShrink: 0,
  },
  fallbackIcon: {
    width: '32px',
    height: '32px',
    flexShrink: 0,
    color: tokens.colorNeutralForeground3,
  },
  meta: {
    flex: '1 1 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: 0,
  },
  primaryLine: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  secondaryLine: {
    color: tokens.colorNeutralForeground2,
  },
  score: {
    fontWeight: 700,
    fontSize: tokens.fontSizeBase400,
    flexShrink: 0,
    minWidth: '48px',
    textAlign: 'right',
  },
  trailing: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '2px',
    flexShrink: 0,
  },
  empty: {
    padding: tokens.spacingVerticalL,
    color: tokens.colorNeutralForeground2,
  },
  live: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
  },
});

export interface ReviewHistoryCardsProps {
  entries: ReviewHistoryEntry[];
  selectedReviewId: string | null;
  onOpenReview: (entry: ReviewHistoryEntry) => void;
}

/**
 * Compact horizontal card representation for review history.
 */
export function ReviewHistoryCards({
  entries,
  selectedReviewId,
  onOpenReview,
}: ReviewHistoryCardsProps) {
  const styles = useStyles();

  return (
    <>
      <div
        className={styles.live}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {entries.length === 0 ? 'No reviews match your search.' : ''}
      </div>
      {entries.length === 0 ? (
        <div className={styles.empty}>No reviews match your search.</div>
      ) : (
        <div className={styles.list}>
          {entries.map((entry) => {
            const scoreText = reviewScoreLabel(entry);
            const scoreColor = entry.scoreState !== 'not-applicable'
              && entry.scoreState !== 'not-assessed' && entry.overallScore != null
              ? getScoreColor(entry.overallScore)
              : tokens.colorNeutralForeground2;

            return (
              <Card
                key={entry.reviewId}
                appearance={entry.reviewId === selectedReviewId
                  ? 'filled-alternative'
                  : 'filled'}
                className={styles.card}
                role="button"
                tabIndex={0}
                aria-pressed={entry.reviewId === selectedReviewId}
                aria-label={[
                  `View ${reviewVersionLabel(entry)} review from ${formatDateTime(entry.reviewedOn)}`,
                  `score ${scoreText}`,
                  `${entry.totalIssueCount} stored issues`,
                  `${entry.highSeverityCount} stored high severity`,
                ].join(', ')}
                onClick={() => onOpenReview(entry)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onOpenReview(entry);
                  }
                }}
              >
                <div className={styles.row}>
                  <BotSparkle24Regular className={styles.fallbackIcon} aria-hidden="true" />

                  <div className={styles.meta}>
                    <div className={styles.primaryLine}>
                      <Body1Strong>{reviewVersionLabel(entry)}</Body1Strong>
                      <Caption1>{reviewTypeLabel(entry)}</Caption1>
                      <Caption1>·</Caption1>
                      <Caption1>{formatDateTime(entry.reviewedOn)}</Caption1>
                    </div>
                    <Caption1 className={styles.secondaryLine}>
                      {entry.totalIssueCount} stored issues · {entry.highSeverityCount} stored high severity
                    </Caption1>
                  </div>

                  <div className={styles.trailing}>
                    <span className={styles.score} style={{ color: scoreColor }}>
                      {scoreText}
                    </span>
                    <ReviewFreshnessBadge freshness={entry.freshness} />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
