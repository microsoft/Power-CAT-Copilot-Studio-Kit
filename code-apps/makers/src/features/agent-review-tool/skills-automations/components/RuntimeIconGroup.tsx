import {
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import {
  CheckmarkCircleFilled,
  DismissCircleFilled,
  QuestionCircleRegular,
  SubtractCircleFilled,
  WarningFilled,
} from '@fluentui/react-icons';
import {
  RUNTIME_LABELS,
  RUNTIME_VERDICT_LABELS,
  type RuntimeVerdictValue,
  type TargetRuntime,
} from '../contracts/ArtifactReview';
import { RuntimeIcon } from './RuntimeIcon';

export interface RuntimeIconItem {
  runtime: TargetRuntime;
  verdict?: RuntimeVerdictValue;
}

export interface RuntimeIconGroupProps {
  items: readonly RuntimeIconItem[];
  label: string;
  size?: number;
  className?: string;
}

export interface RuntimeVerdictIconProps {
  verdict: RuntimeVerdictValue;
  size?: number;
  className?: string;
}

const useStyles = makeStyles({
  group: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    width: 'fit-content',
    borderRadius: tokens.borderRadiusSmall,
    ':focus-visible': {
      outline: `2px solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: '2px',
    },
  },
  runtime: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
  },
  status: {
    display: 'inline-flex',
    flexShrink: 0,
  },
  success: { color: tokens.colorPaletteGreenForeground1 },
  warning: { color: tokens.colorPaletteDarkOrangeForeground1 },
  danger: { color: tokens.colorPaletteRedForeground1 },
  neutral: { color: tokens.colorNeutralForeground3 },
});

/** The shape used for a runtime verdict wherever the verdict text is also available. */
export function RuntimeVerdictIcon({
  verdict,
  size = 16,
  className,
}: RuntimeVerdictIconProps) {
  const iconProps = { 'aria-hidden': true as const, className, fontSize: size };

  switch (verdict) {
    case 'runs':
      return <CheckmarkCircleFilled {...iconProps} />;
    case 'runs-with-issues':
      return <WarningFilled {...iconProps} />;
    case 'will-not-run':
      return <DismissCircleFilled {...iconProps} />;
    case 'not-applicable':
      return <SubtractCircleFilled {...iconProps} />;
    default:
      return <QuestionCircleRegular {...iconProps} />;
  }
}

/**
 * Shows selected runtimes as product marks and, when supplied, their verdicts
 * as small shape-coded status marks. One tooltip and focus stop describe the
 * full group.
 */
export function RuntimeIconGroup({
  items,
  label,
  size = 18,
  className,
}: RuntimeIconGroupProps) {
  const styles = useStyles();
  const summary = items
    .map((item) =>
      item.verdict
        ? `${RUNTIME_LABELS[item.runtime]}: ${RUNTIME_VERDICT_LABELS[item.verdict]}`
        : RUNTIME_LABELS[item.runtime],
    )
    .join('; ');
  const accessibleLabel = `${label}: ${summary}`;
  const statusClasses: Record<RuntimeVerdictValue, string> = {
    runs: styles.success,
    'runs-with-issues': styles.warning,
    'will-not-run': styles.danger,
    'not-applicable': styles.neutral,
    'not-evaluated': styles.neutral,
  };

  return (
    <Tooltip relationship="inaccessible" content={accessibleLabel} withArrow>
      <span
        className={mergeClasses(styles.group, className)}
        role="img"
        aria-label={accessibleLabel}
        tabIndex={0}
      >
        {items.map((item) => (
          <span key={item.runtime} className={styles.runtime}>
            <RuntimeIcon runtime={item.runtime} size={size} />
            {item.verdict && (
              <span
                className={mergeClasses(styles.status, statusClasses[item.verdict])}
                data-verdict={item.verdict}
                aria-hidden="true"
              >
                <RuntimeVerdictIcon verdict={item.verdict} size={12} />
              </span>
            )}
          </span>
        ))}
      </span>
    </Tooltip>
  );
}
