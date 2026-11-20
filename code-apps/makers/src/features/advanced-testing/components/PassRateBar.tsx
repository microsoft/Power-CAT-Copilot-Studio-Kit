/**
 * Horizontal stacked pass/fail bar — mirrors the Figma visualization with a
 * green success segment, a red failed segment, and the percent on the right.
 */

import { Text, makeStyles, tokens } from "@fluentui/react-components";

export type PassRateBarProps = {
  successRate: number;
};

const useStyles = makeStyles({
  row: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    width: "100%",
    minWidth: 0,
  },
  bar: {
    display: "flex",
    flex: 1,
    minWidth: "80px",
    height: "12px",
    borderRadius: tokens.borderRadiusSmall,
    overflow: "hidden",
    backgroundColor: tokens.colorNeutralBackground3,
  },
  success: {
    backgroundColor: "#54B054",
    borderRadius: tokens.borderRadiusSmall,
  },
  failed: {
    backgroundColor: "#DC626D",
    borderRadius: tokens.borderRadiusSmall,
  },
  label: {
    fontVariantNumeric: "tabular-nums",
    color: tokens.colorNeutralForeground1,
  },
});

export function PassRateBar({ successRate }: PassRateBarProps) {
  const styles = useStyles();
  // cat_successrate is stored as a 0–1 fraction in Dataverse.
  const successPct = Math.max(0, Math.min(100, successRate * 100));
  const failedPct = Math.max(0, 100 - successPct);

  return (
    <div className={styles.row}>
      <div className={styles.bar} aria-hidden>
        {successPct > 0 ? <div className={styles.success} style={{ width: `${successPct}%` }} /> : null}
        {failedPct > 0 ? <div className={styles.failed} style={{ width: `${failedPct}%` }} /> : null}
      </div>
      <Text size={200} weight="semibold" className={styles.label}>
        {Math.round(successPct)}%
      </Text>
    </div>
  );
}
