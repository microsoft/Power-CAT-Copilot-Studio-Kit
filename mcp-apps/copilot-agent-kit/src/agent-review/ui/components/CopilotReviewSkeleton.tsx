import {
  Skeleton,
  SkeletonItem,
  makeStyles,
  shorthands,
  tokens,
} from '@fluentui/react-components';

const useStyles = makeStyles({
  root: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 19.75rem',
    ...shorthands.gap(tokens.spacingHorizontalL),
    alignItems: 'start',
    '@media (max-width: 52.5rem)': {
      gridTemplateColumns: '1fr',
    },
  },
  content: {
    overflow: 'hidden',
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
    boxShadow: tokens.shadow2,
  },
  tabs: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    ...shorthands.gap(tokens.spacingHorizontalL),
    ...shorthands.padding(
      tokens.spacingVerticalM,
      tokens.spacingHorizontalM,
      tokens.spacingVerticalS,
    ),
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
  },
  tabShort: { width: '5rem' },
  tabMedium: { width: '7rem' },
  tabLong: { width: '9rem' },
  body: {
    display: 'grid',
    gridTemplateColumns: 'minmax(17rem, 18rem) minmax(0, 1fr)',
    ...shorthands.gap(tokens.spacingHorizontalL),
    ...shorthands.padding(tokens.spacingVerticalL, tokens.spacingHorizontalL),
    '@media (max-width: 48rem)': {
      gridTemplateColumns: '1fr',
    },
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    ...shorthands.gap(tokens.spacingVerticalM),
  },
  group: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalS),
    ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalM),
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
  },
  detail: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    minHeight: '26.25rem',
    ...shorthands.gap(tokens.spacingVerticalL),
    ...shorthands.padding(tokens.spacingVerticalL, tokens.spacingHorizontalL),
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
  },
  rail: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '32rem',
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.gap(tokens.spacingVerticalL),
    ...shorthands.padding(tokens.spacingVerticalL, tokens.spacingHorizontalL),
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
    boxShadow: tokens.shadow2,
  },
  heading: { width: '42%', height: tokens.spacingVerticalL },
  lineShort: { width: '36%' },
  lineMedium: { width: '64%' },
  lineLong: { width: '100%' },
  score: { width: '4rem', height: '4rem' },
});

const GROUP_KEYS = ['group-one', 'group-two', 'group-three'] as const;
const TAB_WIDTHS = ['medium', 'medium', 'long', 'short', 'medium', 'short'] as const;

export interface CopilotReviewSkeletonProps {
  agentName: string;
}

/** Shows the saved-review page shape while its persisted result is loading. */
export function CopilotReviewSkeleton({ agentName }: CopilotReviewSkeletonProps) {
  const styles = useStyles();

  return (
    <Skeleton
      className={styles.root}
      role="status"
      aria-live="polite"
      aria-label={`Loading saved review for ${agentName}`}
      aria-busy="true"
    >
      <div className={styles.content}>
        <div className={styles.tabs}>
          {TAB_WIDTHS.map((width, index) => (
            <SkeletonItem
              key={`${width}-${index}`}
              className={
                width === 'short'
                  ? styles.tabShort
                  : width === 'long'
                    ? styles.tabLong
                    : styles.tabMedium
              }
            />
          ))}
        </div>
        <div className={styles.body}>
          <div className={styles.list}>
            <SkeletonItem className={styles.lineMedium} />
            {GROUP_KEYS.map((key) => (
              <div key={key} className={styles.group}>
                <SkeletonItem className={styles.heading} />
                <SkeletonItem className={styles.lineLong} />
                <SkeletonItem className={styles.lineMedium} />
              </div>
            ))}
          </div>
          <div className={styles.detail}>
            <SkeletonItem className={styles.heading} />
            <SkeletonItem className={styles.lineLong} />
            <SkeletonItem className={styles.lineLong} />
            <SkeletonItem className={styles.lineMedium} />
            <SkeletonItem className={styles.lineLong} />
            <SkeletonItem className={styles.lineShort} />
          </div>
        </div>
      </div>
      <div className={styles.rail}>
        <SkeletonItem className={styles.heading} />
        <SkeletonItem shape="circle" className={styles.score} />
        <SkeletonItem className={styles.lineLong} />
        <SkeletonItem className={styles.lineMedium} />
        <SkeletonItem className={styles.lineLong} />
        <SkeletonItem className={styles.lineLong} />
        <SkeletonItem className={styles.lineShort} />
      </div>
    </Skeleton>
  );
}
