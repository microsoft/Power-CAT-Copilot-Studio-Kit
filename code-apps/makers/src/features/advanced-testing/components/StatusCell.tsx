/**
 * Status cell for the Recent test runs table. Maps the run-status choice
 * code to an icon + label pair.
 */

import { Spinner, Text, makeStyles, tokens } from "@fluentui/react-components";
import {
  CheckmarkCircle16Filled,
  Circle16Regular,
  DismissCircle16Filled,
  ErrorCircle16Filled,
  Warning16Filled,
} from "@fluentui/react-icons";

export type StatusCellProps = {
  code?: string;
  name?: string;
};

const useStyles = makeStyles({
  wrapper: {
    display: "inline-flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
    minWidth: 0,
  },
  icon: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "16px",
    height: "16px",
    flexShrink: 0,
  },
  label: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  complete: { color: tokens.colorPaletteGreenForeground1 },
  error: { color: tokens.colorPaletteRedForeground1 },
  notRun: { color: tokens.colorNeutralForeground3 },
  pending: { color: tokens.colorBrandForeground1 },
  warning: { color: tokens.colorPaletteYellowForeground1 },
});

export function StatusCell({ code, name }: StatusCellProps) {
  const styles = useStyles();
  const numericCode = code != null ? Number(code) : null;

  const render = (className: string, icon: React.ReactNode, label: string) => (
    <span className={`${styles.wrapper} ${className}`}>
      <span className={styles.icon} aria-hidden>{icon}</span>
      <Text className={styles.label}>{label}</Text>
    </span>
  );

  switch (numericCode) {
    case 3:
      return render(styles.complete, <CheckmarkCircle16Filled />, name ?? "Complete");
    case 6:
      return render(styles.error, <DismissCircle16Filled />, name ?? "Error");
    case 2:
      return render(styles.pending, <Spinner size="extra-tiny" />, name ?? "Running");
    case 5:
      return render(styles.pending, <Spinner size="extra-tiny" />, name ?? "Pending");
    case 1:
      return render(styles.notRun, <Circle16Regular />, name ?? "Not run");
    case 4:
      return render(styles.warning, <Warning16Filled />, name ?? "Not available");
    default:
      return render(styles.notRun, <ErrorCircle16Filled />, name ?? "Unknown");
  }
}
