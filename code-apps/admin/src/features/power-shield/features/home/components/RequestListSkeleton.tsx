import { Skeleton, SkeletonItem, makeStyles, tokens } from '@fluentui/react-components';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    padding: tokens.spacingVerticalS,
    gap: tokens.spacingVerticalXS,
  },
  row: {
    height: '44px',
    borderRadius: '4px',
  },
});

export function RequestListSkeleton() {
  const styles = useStyles();

  return (
    <Skeleton>
      <div className={styles.container}>
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonItem key={i} className={styles.row} shape="rectangle" />
        ))}
      </div>
    </Skeleton>
  );
}

export default RequestListSkeleton;
