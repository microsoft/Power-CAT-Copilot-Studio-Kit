/**
 * Shared summary rail (spec 017, FR-2).
 *
 * Renders the score, its optional weighted breakdown, badges, key/value facts
 * and an optional AI summary. Everything is data — the rail knows the
 * arrangement, never which review type it is describing.
 *
 * Geometry follows `SummaryRail` (the reference page) so the three review
 * types read as one card: same 18px gutter, same key/value rhythm, same
 * tabular-nums alignment on every figure.
 */

import {
  Badge, Button, Popover, PopoverSurface, PopoverTrigger,
  Text, makeStyles, mergeClasses, tokens,
} from '@fluentui/react-components';
import { InfoRegular } from '@fluentui/react-icons';
import { ReviewScoreBar } from './ReviewScoreBar';
import {
  REVIEW_SUMMARY_GLOW_CLASS,
  ReviewSummaryGlowStyles,
} from './ReviewSummaryGlow';
import type { ReviewRailModel } from './reviewShellTypes';

const useStyles = makeStyles({
  rail: {
    position: 'sticky',
    top: '16px',
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusXLarge,
    boxShadow: tokens.shadow2,
    paddingBottom: '16px',
  },
  header: {
    padding: '16px 18px 0',
    fontSize: '15px',
    fontWeight: 600,
    display: 'block',
  },
  score: { padding: '12px 18px 0' },
  scoreLabelRow: { display: 'flex', alignItems: 'center', gap: '2px' },
  scoreLabel: {
    fontSize: '12px',
    color: tokens.colorNeutralForeground2,
    display: 'block',
  },
  infoButton: {
    minWidth: 'auto',
    height: '20px',
    padding: 0,
    color: tokens.colorNeutralForeground3,
  },
  popoverSurface: {
    boxSizing: 'border-box',
    width: `min(320px, calc(100vw - ${tokens.spacingHorizontalL} - ${tokens.spacingHorizontalL}))`,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    overflowY: 'auto',
  },
  scoreValue: {
    fontSize: '30px',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    fontVariantNumeric: 'tabular-nums',
    display: 'block',
    // The 30px glyphs sit tight against their box, so the caption above and the
    // bar below both need explicit breathing room rather than line-height.
    marginTop: '4px',
    lineHeight: 1.15,
  },
  overallBar: { margin: '12px 0 8px' },
  // An unscored review shows the same `--` the review grids use, in the muted
  // colour that says "no value" rather than a score colour that says "bad".
  scoreEmpty: { color: tokens.colorNeutralForeground4 },
  scoreEmptyNote: {
    display: 'block',
    margin: '6px 0 8px',
    fontSize: '12px',
    lineHeight: 1.35,
    color: tokens.colorNeutralForeground3,
  },

  subScores: { margin: '14px 0 0', display: 'flex', flexDirection: 'column', gap: '10px' },
  subScoreRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: '10px',
    fontSize: '12px',
  },
  subScoreLabel: { color: tokens.colorNeutralForeground2 },
  // Fixed numeric column so the percentages line up as a scannable column.
  subScoreValue: {
    color: tokens.colorNeutralForeground1,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  subScoreBar: { marginTop: '5px' },

  badges: { display: 'flex', gap: '6px', margin: '12px 18px 0', flexWrap: 'wrap' },

  kv: { padding: '8px 18px 0' },
  kvDivider: { borderTop: `1px solid ${tokens.colorNeutralStroke3}`, margin: '14px 0 6px' },
  kvRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '10px',
    padding: '5px 0',
    fontSize: '12px',
  },
  kvRowFirstLine: { alignItems: 'baseline' },
  kvKey: { color: tokens.colorNeutralForeground2, whiteSpace: 'nowrap' },
  kvValue: {
    color: tokens.colorNeutralForeground1,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  },
  kvQuiet: { color: tokens.colorNeutralForeground3 },

  summary: { padding: '0 18px', margin: '14px 0 0' },
  summaryTitle: { fontSize: '12px', fontWeight: 600, display: 'block' },
  summaryBody: {
    fontSize: '12px',
    color: tokens.colorNeutralForeground2,
    display: 'block',
    marginTop: '4px',
    lineHeight: 1.5,
  },
});

export function ReviewSummaryRail({ model, className }: { model: ReviewRailModel; className?: string }) {
  const styles = useStyles();
  const { subScores = [], facts, badges, summary, scoreHint } = model;

  return (
    <>
      <ReviewSummaryGlowStyles />
      <aside
        className={mergeClasses(styles.rail, REVIEW_SUMMARY_GLOW_CLASS, className)}
        aria-label={model.title ?? 'Review summary'}
      >
        <Text className={styles.header}>{model.title ?? 'Review summary'}</Text>

      <div className={styles.score}>
        <div className={styles.scoreLabelRow}>
          <Text className={styles.scoreLabel}>{model.scoreLabel}</Text>
          {scoreHint && (
            <Popover withArrow positioning={{ position: 'after', fallbackPositions: ['above', 'below'], autoSize: true }}>
              <PopoverTrigger disableButtonEnhancement>
                <Button
                  appearance="transparent"
                  size="small"
                  className={styles.infoButton}
                  icon={<InfoRegular />}
                  aria-label={`How ${model.scoreLabel.toLowerCase()} is calculated`}
                />
              </PopoverTrigger>
              <PopoverSurface className={styles.popoverSurface}>{scoreHint}</PopoverSurface>
            </Popover>
          )}
        </div>

        {model.score === null ? (
          <>
            <Text className={mergeClasses(styles.scoreValue, styles.scoreEmpty)}>--</Text>
            <Text className={styles.scoreEmptyNote}>
              {model.scoreUnavailableReason ?? 'No dimension could be assessed, so this review carries no score.'}
            </Text>
          </>
        ) : (
          <>
            <Text className={styles.scoreValue}>{Math.round(model.score)}%</Text>
            <ReviewScoreBar
              score={model.score}
              className={styles.overallBar}
              ariaLabel={`${model.scoreLabel} ${Math.round(model.score)} out of 100`}
            />
          </>
        )}

        {subScores.length > 0 && (
          <div className={styles.subScores}>
            {subScores.map((sub) => (
              <div key={sub.label}>
                <div className={styles.subScoreRow}>
                  <span className={styles.subScoreLabel}>
                    {sub.label}
                    {sub.weight ? ` · ${sub.weight}` : ''}
                  </span>
                  <span
                    className={
                      sub.percent === null
                        ? mergeClasses(styles.subScoreValue, styles.scoreEmpty)
                        : styles.subScoreValue
                    }
                  >
                    {sub.percent === null ? '--' : `${Math.round(sub.percent)}%`}
                  </span>
                </div>
                {/* An unassessed dimension draws no bar: a zero-length bar is
                    read as the worst possible result rather than as silence. */}
                {sub.percent !== null && (
                  <ReviewScoreBar
                    slim
                    score={sub.percent}
                    className={styles.subScoreBar}
                    ariaLabel={`${sub.label} ${Math.round(sub.percent)} out of 100${
                      sub.weight ? `, weighted ${sub.weight} of the overall score` : ''
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {badges && <div className={styles.badges}>{badges}</div>}

      <div className={styles.kv}>
        <div className={styles.kvDivider} />
        {facts.map((fact) => (
          <div
            key={fact.key}
            className={mergeClasses(styles.kvRow, fact.alignToFirstLine && styles.kvRowFirstLine)}
          >
            <span className={styles.kvKey}>{fact.label}</span>
            <span className={mergeClasses(styles.kvValue, fact.quiet && styles.kvQuiet)}>
              {fact.value}
            </span>
          </div>
        ))}
      </div>

      {summary && (
        <div className={styles.summary}>
          <Text className={styles.summaryTitle}>{summary.title}</Text>
          <Text className={styles.summaryBody}>{summary.body}</Text>
        </div>
      )}
      </aside>
    </>
  );
}

/** Convenience badge used by every review type. */
export function AiDisclaimerBadge() {
  return (
    <Badge appearance="tint" color="informative" shape="circular">
      AI-generated content may be incorrect
    </Badge>
  );
}
