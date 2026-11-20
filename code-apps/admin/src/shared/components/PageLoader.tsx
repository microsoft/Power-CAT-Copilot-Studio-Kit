import { Spinner, makeStyles, tokens } from '@fluentui/react-components';

const useStyles = makeStyles({
  root: {
    width: '100%',
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colorNeutralBackground1,
  },
});

interface PageLoaderProps {
  ariaLabel?: string;
}

/** Full-page loading state shared by feature entry points. */
export function PageLoader({ ariaLabel = 'Loading page' }: PageLoaderProps) {
  const styles = useStyles();

  return (
    <div className={styles.root}>
      <Spinner
        role="status"
        aria-live="polite"
        aria-label={ariaLabel}
        size="large"
        label="Loading..."
        labelPosition="below"
      />
    </div>
  );
}

export default PageLoader;
