import { Component, type ReactNode } from 'react';
import { makeStyles, tokens, Card, Body1, Button, Subtitle2 } from '@fluentui/react-components';
import { ArrowCounterclockwise20Regular } from '@fluentui/react-icons';

/** Error boundary that catches render errors within the Conversation Analyzer feature tree. */
interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

const useStyles = makeStyles({
  card: {
    maxWidth: '600px',
    margin: `${tokens.spacingVerticalXXL} auto`,
    padding: tokens.spacingVerticalL,
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalM,
    textAlign: 'center',
  },
});

function ErrorFallbackUI({ error, onReset }: { error?: Error; onReset: () => void }) {
  const styles = useStyles();
  return (
    <Card className={styles.card} appearance="filled">
      <div className={styles.content}>
        <Subtitle2>Something went wrong</Subtitle2>
        <Body1>
          {error?.message ?? 'An unexpected error occurred in the Conversation Analyzer.'}
        </Body1>
        <Button
          appearance="primary"
          icon={<ArrowCounterclockwise20Regular />}
          onClick={onReset}
        >
          Reload
        </Button>
      </div>
    </Card>
  );
}

export class FeatureErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ConversationAnalyzer] Unhandled error:', error, info.componentStack);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return <ErrorFallbackUI error={this.state.error} onReset={this.handleReset} />;
    }
    return this.props.children;
  }
}
