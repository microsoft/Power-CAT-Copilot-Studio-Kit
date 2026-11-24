/**
 * A weighted score card — the KPI row on a review result.
 *
 * Presentational only, like everything in this folder: it takes a decided `ScoreCardModel` and
 * renders it. Every judgement (band, wording, whether the card is dimmed) lives in `score.ts`,
 * where it can be unit tested without a DOM.
 */

import { Caption1, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import type { ReactNode } from 'react';
import type { ScoreCardModel } from './score';

const useStyles = makeStyles({
  group: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: tokens.spacingHorizontalM,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    padding: tokens.spacingVerticalM,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  muted: { opacity: 0.6 },
  value: { display: 'flex', alignItems: 'baseline', gap: tokens.spacingHorizontalXS },
  score: {
    fontSize: tokens.fontSizeHero700,
    lineHeight: tokens.lineHeightHero700,
    fontWeight: tokens.fontWeightSemibold,
  },
  // Fixed hexes rather than palette tokens: these are the Figma score bands, and they have to
  // match the same bands drawn elsewhere in the report and in the exported PDF.
  good: { color: '#3B873E' },
  fair: { color: '#B88217' },
  poor: { color: '#C4314B' },
  footer: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS },
});

export interface ScoreCardProps {
  model: ScoreCardModel;
}

export function ScoreCard({ model }: ScoreCardProps) {
  const styles = useStyles();
  const footnote = <Caption1>{model.footnote}</Caption1>;

  return (
    <div className={mergeClasses(styles.card, model.muted && styles.muted)}>
      <Caption1>{model.label}</Caption1>
      {model.value === undefined ? (
        footnote
      ) : (
        <>
          <div className={styles.value}>
            <span className={mergeClasses(styles.score, styles[model.tone])}>{model.value}</span>
          </div>
          <div className={styles.footer}>
            {model.hint ? (
              <Tooltip relationship="description" content={model.hint}>
                {footnote}
              </Tooltip>
            ) : (
              footnote
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Lays score cards out on the responsive grid the design uses. */
export function ScoreCardGroup({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <div className={styles.group}>{children}</div>;
}

/** Renders nothing when there is nothing to weigh, so a caller need not special-case an empty result. */
export function ScoreCardList({ models }: { models: readonly ScoreCardModel[] }) {
  if (models.length === 0) return null;
  return (
    <ScoreCardGroup>
      {models.map((model) => (
        <ScoreCard key={model.label} model={model} />
      ))}
    </ScoreCardGroup>
  );
}

export type { ScoreCardModel };

/** Re-exported so a caller styling its own surface can reuse the exact band colours. */
export const SCORE_BAND_COLORS = { good: '#3B873E', fair: '#B88217', poor: '#C4314B' } as const;
