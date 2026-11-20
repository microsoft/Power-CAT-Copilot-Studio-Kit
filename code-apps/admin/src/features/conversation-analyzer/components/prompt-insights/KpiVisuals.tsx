/** Small decorative visuals for the Prompt insights KPI tiles (PI-3). */

import { makeStyles, tokens } from '@fluentui/react-components';

const SPARK_WIDTH = 72;
const SPARK_HEIGHT = 24;

const useStyles = makeStyles({
  spark: { display: 'block', flexShrink: 0 },
  ring: {
    position: 'relative',
    width: '32px',
    height: '32px',
    flexShrink: 0,
    borderRadius: tokens.borderRadiusCircular,
  },
  ringHole: {
    position: 'absolute',
    top: '6px',
    left: '6px',
    right: '6px',
    bottom: '6px',
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorNeutralBackground1,
  },
});

export function Sparkline({ values }: { values: number[] }) {
  const styles = useStyles();
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const step = SPARK_WIDTH / (values.length - 1);
  const points = values
    .map((v, i) => `${(i * step).toFixed(1)},${(SPARK_HEIGHT - 2 - (v / max) * (SPARK_HEIGHT - 4)).toFixed(1)}`)
    .join(' ');
  return (
    <svg className={styles.spark} width={SPARK_WIDTH} height={SPARK_HEIGHT} viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`} aria-hidden="true">
      <polyline points={points} fill="none" stroke={tokens.colorBrandStroke1} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function ShareRing({ pct }: { pct: number }) {
  const styles = useStyles();
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <span
      className={styles.ring}
      aria-hidden="true"
      style={{
        background: `conic-gradient(${tokens.colorBrandBackground} ${clamped * 3.6}deg, ${tokens.colorNeutralBackground5} 0deg)`,
      }}
    >
      <span className={styles.ringHole} />
    </span>
  );
}
