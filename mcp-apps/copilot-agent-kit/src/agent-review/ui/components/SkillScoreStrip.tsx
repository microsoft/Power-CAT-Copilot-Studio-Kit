import {
  Badge,
  Card,
  ProgressBar,
  Text,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import {
  ShieldCheckmarkRegular,
  ShieldErrorRegular,
  WarningShieldRegular,
} from '@fluentui/react-icons';
import type { QualifiedScoreView, SkillBundleScoresView } from './viewTypes.js';

/**
 * Four-score strip for a skill bundle review:
 * Instruction quality | Bundle integrity | Resource safety | Operational readiness.
 */

const useStyles = makeStyles({
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalS} 0 ${tokens.spacingVerticalM}`,
  },
  card: {
    minWidth: 0,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  label: {
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: tokens.colorNeutralForeground3,
  },
  value: {
    fontSize: '22px',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1,
  },
  unavailable: {
    color: tokens.colorNeutralForeground4,
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    flexWrap: 'wrap',
    marginTop: tokens.spacingVerticalXS,
  },
  badge: {
    maxWidth: '100%',
    whiteSpace: 'nowrap',
  },
  note: {
    fontSize: '10.5px',
    color: tokens.colorNeutralForeground3,
    marginTop: '2px',
  },
});

const GATE_COLOR: Record<SkillBundleScoresView['safetyGate'], 'success' | 'warning' | 'danger'> = {
  none: 'success',
  warning: 'warning',
  error: 'danger',
};

const STATUS_COLOR: Record<QualifiedScoreView['status'], 'success' | 'warning' | 'subtle'> = {
  complete: 'success',
  partial: 'warning',
  unavailable: 'subtle',
};

interface ScoreCardProps {
  label: string;
  score: QualifiedScoreView;
  safetyGate?: SkillBundleScoresView['safetyGate'];
}

function ScoreCard({ label, score, safetyGate }: ScoreCardProps) {
  const styles = useStyles();
  const unavail = score.status === 'unavailable';

  return (
    <Card className={styles.card} size="small" aria-label={`${label}: ${unavail ? 'unavailable' : `${score.value}%`}, ${score.coveragePercent}% coverage`}>
      <Text className={styles.label}>{label}</Text>
      <Text className={mergeClasses(styles.value, unavail && styles.unavailable)}>
        {unavail ? '—' : score.value}
      </Text>
      {/* ProgressBar is decorative; score is announced via the Card's aria-label */}
      <ProgressBar
        value={unavail ? 0 : (score.value ?? 0) / 100}
        color={unavail ? undefined : score.value !== null && score.value < 60 ? 'error' : score.value !== null && score.value < 80 ? 'warning' : 'brand'}
        aria-hidden
      />
      <div className={styles.meta}>
        <Badge className={styles.badge} appearance="tint" color={STATUS_COLOR[score.status]} size="small" shape="circular">
          {score.status}
        </Badge>
        <Text className={styles.note}>{score.coveragePercent}% coverage</Text>
        {safetyGate !== undefined && safetyGate !== 'none' && (
          <Badge
            className={styles.badge}
            appearance="tint"
            color={GATE_COLOR[safetyGate]}
            size="small"
            shape="circular"
            icon={safetyGate === 'error' ? <ShieldErrorRegular /> : <WarningShieldRegular />}
          >
            Gate: {safetyGate}
          </Badge>
        )}
        {safetyGate === 'none' && (
          <Badge className={styles.badge} appearance="tint" color="success" size="small" shape="circular" icon={<ShieldCheckmarkRegular />}>
            Gate: pass
          </Badge>
        )}
      </div>
      {score.note && <Text className={styles.note}>{score.note}</Text>}
    </Card>
  );
}

export interface SkillScoreStripProps {
  scores: SkillBundleScoresView;
}

/**
 * Renders four qualified score cards for a skill bundle review.
 */
export function SkillScoreStrip({ scores }: SkillScoreStripProps) {
  const styles = useStyles();
  return (
    <div className={styles.grid} role="region" aria-label="Skill bundle scores">
      <ScoreCard label="Instruction quality" score={scores.quality} />
      <ScoreCard label="Bundle integrity" score={scores.integrity} />
      <ScoreCard label="Resource safety" score={scores.safety} safetyGate={scores.safetyGate} />
      <ScoreCard label="Operational readiness" score={scores.readiness} />
    </div>
  );
}
