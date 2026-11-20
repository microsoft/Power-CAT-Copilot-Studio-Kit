import { Tooltip, makeStyles, mergeClasses } from '@fluentui/react-components';

const useStyles = makeStyles({
  root: {
    display: 'inline-block',
    minWidth: 0,
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    verticalAlign: 'bottom',
  },
});

interface TruncatedIdProps {
  value: string;
  className?: string;
}

/** Single-line ID that ends in an ellipsis when it doesn't fit; the full value shows on hover/focus. */
export function TruncatedId({ value, className }: TruncatedIdProps) {
  const styles = useStyles();
  return (
    <Tooltip content={value} relationship="description" withArrow>
      <span tabIndex={0} className={mergeClasses(styles.root, className)}>{value}</span>
    </Tooltip>
  );
}
