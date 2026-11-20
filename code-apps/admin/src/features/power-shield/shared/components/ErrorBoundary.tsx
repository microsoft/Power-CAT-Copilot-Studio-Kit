import React from 'react';
import type { ReactNode } from 'react';
import { Button, Text, makeStyles, tokens } from '@fluentui/react-components';

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacingHorizontalXXL,
    gap: tokens.spacingVerticalL,
    height: '100%',
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Fallback UI (functional component so it can use hooks/makeStyles)
// ─────────────────────────────────────────────────────────────────────────────

interface FallbackProps {
  onRetry: () => void;
}

function ErrorFallback({ onRetry }: FallbackProps) {
  const styles = useStyles();
  return (
    <div className={styles.container} role="alert">
      <Text size={500} weight="semibold">
        Something went wrong
      </Text>
      <Button appearance="primary" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ErrorBoundary
// ─────────────────────────────────────────────────────────────────────────────

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return <ErrorFallback onRetry={this.handleRetry} />;
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
