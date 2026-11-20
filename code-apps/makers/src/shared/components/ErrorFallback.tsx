import { Button, Text, tokens, makeStyles } from '@fluentui/react-components';
import { ArrowClockwise20Regular, ErrorCircle20Regular } from '@fluentui/react-icons';

const useErrorBoundaryStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '300px',
    padding: tokens.spacingVerticalXXXL,
    textAlign: 'center',
    gap: tokens.spacingVerticalL,
  },
  iconContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '48px',
    height: '48px',
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorPaletteRedBackground1,
    color: tokens.colorPaletteRedForeground1,
  },
  title: {
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
    marginBottom: tokens.spacingVerticalS,
  },
  message: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground2,
    maxWidth: '500px',
  },
});

export interface ErrorFallbackProps {
  onRetry: () => void;
  error?: Error;
}

/**
 * Default error fallback UI component
 */
export function ErrorFallback({ onRetry, error }: ErrorFallbackProps) {
  const styles = useErrorBoundaryStyles();

  return (
    <div className={styles.container} role="alert">
      <div className={styles.iconContainer}>
        <ErrorCircle20Regular />
      </div>
      <div>
        <Text className={styles.title}>Failed to Load Page</Text>
        <Text className={styles.message}>
          {error?.message ||
            'An error occurred while loading this page. This might be due to a network issue or a temporary problem.'}
        </Text>
      </div>
      <Button
        appearance="primary"
        icon={<ArrowClockwise20Regular />}
        onClick={onRetry}
      >
        Retry
      </Button>
    </div>
  );
}
