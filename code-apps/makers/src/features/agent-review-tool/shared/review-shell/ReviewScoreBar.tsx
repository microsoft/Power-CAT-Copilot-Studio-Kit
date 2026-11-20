/**
 * Score bar shared by every review page (spec 017, FR-3).
 *
 * Extracted verbatim from `SummaryRail` so the three review types render the
 * same geometry and the same tone ramp. Two properties are load-bearing and
 * must not be simplified away:
 *
 * - `role="img"` with a measurement label. A progressbar role would announce
 *   this as an operation in progress, which it is not — the review has already
 *   finished and this is its result.
 * - Tone comes from `scoreBand`, never a literal hex, so the thresholds stay
 *   asserted next to the scoring weights that depend on them.
 */

import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { scoreBand, type ScoreBand } from '../../agents-experience/services/scoreBands';
import { clampScore } from './scoreDisplay';

const useStyles = makeStyles({
  bar: {
    display: 'flex',
    height: '9px',
    borderRadius: '999px',
    overflow: 'hidden',
    backgroundColor: tokens.colorNeutralStroke3,
  },
  /** Thinner rule for the sub-score rows, which sit closer together. */
  barSlim: {
    height: '6px',
  },
  barFill: {
    flexShrink: 0,
    transition: 'width 200ms ease-out',
  },
  barOk: { backgroundColor: tokens.colorPaletteGreenBackground3 },
  /**
   * `colorPaletteMarigoldBackground3` measures only 1.89:1 against the track,
   * below the 3:1 that WCAG 1.4.11 requires of a meaningful graphic. The darker
   * Dark Orange ramp carries the same "caution" reading and clears the bar.
   */
  barWarn: { backgroundColor: tokens.colorPaletteDarkOrangeBackground3 },
  barErr: { backgroundColor: tokens.colorPaletteRedBackground3 },
});

const BAND_TONE: Record<ScoreBand, 'barOk' | 'barWarn' | 'barErr'> = {
  green: 'barOk',
  amber: 'barWarn',
  red: 'barErr',
};

/**
 * Plain-language band, appended to the accessible label.
 *
 * Colour is the only visual carrier of the band, so without this a screen
 * reader — or anyone who cannot separate the hues — gets the number but not
 * the judgement the colour is making about it.
 */
const BAND_WORD: Record<ScoreBand, string> = {
  green: 'healthy',
  amber: 'needs attention',
  red: 'failing',
};

export interface ReviewScoreBarProps {
  /** 0–100. Clamped, so a malformed payload cannot overflow the track. */
  score: number;
  /** Full sentence, e.g. "Overall score 72 out of 100". */
  ariaLabel: string;
  /** Slim variant for sub-score rows. */
  slim?: boolean;
  className?: string;
}

export function ReviewScoreBar({ score, ariaLabel, slim, className }: ReviewScoreBarProps) {
  const styles = useStyles();
  const clamped = clampScore(score);
  const band = scoreBand(clamped);

  return (
    <div
      className={mergeClasses(styles.bar, slim && styles.barSlim, className)}
      role="img"
      aria-label={`${ariaLabel}, ${BAND_WORD[band]}`}
    >
      <span
        className={mergeClasses(styles.barFill, styles[BAND_TONE[band]])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
