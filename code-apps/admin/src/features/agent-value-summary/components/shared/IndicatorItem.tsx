/**
 * IndicatorItem — compact metric indicator with a colored left border,
 * a name label, and a count value. Tooltip shows "TypeName: Count agents".
 * When `onClick` is provided it renders as a subtle Fluent Link, because it
 * navigates to the matching agents (Fluent: buttons don't navigate).
 */
import { makeStyles, mergeClasses, tokens, Body1, Link, Tooltip } from '@fluentui/react-components';

interface IndicatorItemProps {
  name: string;
  count: number;
  borderColor: string;
  onClick?: () => void;
}

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    paddingLeft: tokens.spacingHorizontalS,
    paddingTop: tokens.spacingVerticalXS,
    paddingBottom: tokens.spacingVerticalXS,
    gap: tokens.spacingVerticalXXS,
    minWidth: '100px',
  },
  link: {
    width: '100%',
    boxSizing: 'border-box',
    alignItems: 'flex-start',
    textAlign: 'left',
    paddingRight: tokens.spacingHorizontalS,
    borderTopRightRadius: tokens.borderRadiusMedium,
    borderBottomRightRadius: tokens.borderRadiusMedium,
    ':hover': {
      backgroundColor: tokens.colorSubtleBackgroundHover,
    },
    ':active': {
      backgroundColor: tokens.colorSubtleBackgroundPressed,
    },
  },
  name: {
    color: tokens.colorNeutralForeground2,
  },
  count: {
    fontFamily: tokens.fontFamilyNumeric,
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: tokens.lineHeightBase500,
    color: tokens.colorNeutralForeground1,
  },
});

/** Single indicator with a colored left border, item name, and count. */
export function IndicatorItem({ name, count, borderColor, onClick }: IndicatorItemProps) {
  const styles = useStyles();
  const content = (
    <>
      <Body1 className={styles.name}>{name}</Body1>
      <span className={styles.count}>{count}</span>
    </>
  );

  if (onClick) {
    return (
      <Link
        as="button"
        appearance="subtle"
        className={mergeClasses(styles.root, styles.link)}
        style={{ borderLeft: `3px solid ${borderColor}` }}
        aria-label={`${name}: ${count} ${count === 1 ? 'agent' : 'agents'}. View agents`}
        onClick={onClick}
      >
        {content}
      </Link>
    );
  }

  return (
    <Tooltip content={`${name}: ${count} agents`} relationship="description">
      <div
        className={styles.root}
        style={{ borderLeft: `3px solid ${borderColor}` }}
        aria-label={`${name}: ${count}`}
      >
        {content}
      </div>
    </Tooltip>
  );
}

export default IndicatorItem;
