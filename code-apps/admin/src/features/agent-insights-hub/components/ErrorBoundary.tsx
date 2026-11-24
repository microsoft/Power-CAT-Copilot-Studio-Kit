/**
 * ErrorBoundary - Catches render errors and shows a recovery UI.
 *
 * Class component per React error boundary requirements.
 */

import React from "react";
import {
  makeStyles,
  tokens,
  Subtitle2,
  Body1,
  Button,
} from "@fluentui/react-components";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/** React error boundary with recovery UI. */
class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} onRetry={this.handleRetry} />;
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Fallback UI (functional component for makeStyles)
// ---------------------------------------------------------------------------

interface ErrorFallbackProps {
  error: Error | null;
  onRetry: () => void;
}

const useFallbackStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.spacingVerticalM,
    paddingTop: tokens.spacingVerticalXXL,
    paddingBottom: tokens.spacingVerticalXXL,
    paddingLeft: tokens.spacingHorizontalL,
    paddingRight: tokens.spacingHorizontalL,
    textAlign: "center",
  },
  message: {
    color: tokens.colorNeutralForeground3,
    maxWidth: "480px",
  },
});

const ErrorFallback: React.FC<ErrorFallbackProps> = ({ error, onRetry }) => {
  const styles = useFallbackStyles();

  return (
    <div className={styles.root}>
      <Subtitle2>Something went wrong</Subtitle2>
      <Body1 className={styles.message}>
        {error?.message || "An unexpected error occurred."}
      </Body1>
      <Button appearance="primary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
};

export default ErrorBoundary;
