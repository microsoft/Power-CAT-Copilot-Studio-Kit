import {
  Caption1,
  Caption1Strong,
  Divider,
  Subtitle2,
  Text,
  Title2,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import type { RubricDimensionScore } from '../contracts/ArtifactReview';
import {
  RUBRIC_DIMENSION_DESCRIPTIONS,
  RUBRIC_DIMENSION_IMPROVEMENTS,
  RUBRIC_DIMENSION_LABELS,
} from '../contracts/ArtifactReview';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  heading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
  },
  score: {
    color: tokens.colorBrandForeground1,
    flexShrink: 0,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  muted: { color: tokens.colorNeutralForeground3 },
  improvement: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    padding: tokens.spacingVerticalM,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
});

export interface ArtifactDimensionDetailProps {
  dimension: RubricDimensionScore;
  headingLevel?: 'h2' | 'h3';
}

/** Shows the full basis and next action for one rubric dimension. */
export function ArtifactDimensionDetail({
  dimension,
  headingLevel = 'h2',
}: ArtifactDimensionDetailProps) {
  const styles = useStyles();
  const scorePercent =
    dimension.score === null
      ? null
      : Math.round((Math.max(0, Math.min(5, dimension.score)) / 5) * 100);

  return (
    <div className={styles.root}>
      <div className={styles.heading}>
        <Subtitle2 as={headingLevel}>{RUBRIC_DIMENSION_LABELS[dimension.id]}</Subtitle2>
        <Title2 className={styles.score}>{scorePercent === null ? '--' : `${scorePercent}%`}</Title2>
      </div>

      <Caption1 className={styles.muted}>{RUBRIC_DIMENSION_DESCRIPTIONS[dimension.id]}</Caption1>

      {scorePercent !== null && scorePercent < 100 && (
        <div className={styles.improvement}>
          <Caption1Strong>How to improve</Caption1Strong>
          <Text>{dimension.improvement ?? RUBRIC_DIMENSION_IMPROVEMENTS[dimension.id]}</Text>
        </div>
      )}

      <Divider />

      <div className={styles.section}>
        <Caption1Strong>Evaluator assessment</Caption1Strong>
        <Text>{dimension.assessment}</Text>
      </div>

      {dimension.evidence && (
        <div className={styles.section}>
          <Caption1Strong>Supporting evidence</Caption1Strong>
          <Text>{dimension.evidence}</Text>
        </div>
      )}
    </div>
  );
}
