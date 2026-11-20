import {
  Card, CardHeader, Body1Strong, Button, Textarea, Spinner, Divider,
  makeStyles, tokens,
} from '@fluentui/react-components';
import { ArrowReset20Regular, ArrowSync20Regular, Eye20Regular } from '@fluentui/react-icons';
import { AppState } from '../contracts/types';

interface PromptInputCardProps {
  appState: AppState;
  promptText: string;
  isConfigLoading: boolean;
  setPromptText: (text: string) => void;
  analyze: () => void;
  reset: () => void;
  loadRandom: () => void;
}

const useStyles = makeStyles({
  card: {
    minHeight: '280px',
  },
  headerActions: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: '4px',
    paddingTop: 0,
    flex: 1,
  },
  textarea: {
    flex: 1,
    '& textarea': {
      minHeight: '120px',
    },
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: `0 ${tokens.spacingHorizontalL} ${tokens.spacingVerticalM}`,
  },
});

export function PromptInputCard({
  appState, promptText, isConfigLoading,
  setPromptText, analyze, reset, loadRandom,
}: PromptInputCardProps) {
  const styles = useStyles();
  const isLoading = appState === AppState.LOADING;
  const canAnalyze = promptText.trim().length > 0 && !isLoading && !isConfigLoading;

  return (
    <Card className={styles.card} size="large">
      <CardHeader
        header={<Body1Strong>Prompt</Body1Strong>}
        action={
          <div className={styles.headerActions}>
            <Button
              appearance="subtle"
              icon={<ArrowReset20Regular />}
              disabled={isLoading}
              onClick={reset}
            >
              Reset
            </Button>
            <Button
              appearance="subtle"
              icon={<ArrowSync20Regular />}
              disabled={isLoading}
              onClick={loadRandom}
            >
              Random
            </Button>
          </div>
        }
      />
      <Divider />
      <div className={styles.body}>
        <Textarea
          className={styles.textarea}
          appearance="filled-lighter"
          resize="vertical"
          placeholder="Enter your prompt here..."
          value={promptText}
          onChange={(_, data) => setPromptText(data.value)}
          disabled={isLoading}
        />
      </div>
      <div className={styles.footer}>
        <Button
          appearance="primary"
          icon={isLoading ? <Spinner size="tiny" /> : <Eye20Regular />}
          disabled={!canAnalyze}
          onClick={analyze}
        >
          {isLoading ? 'Analyzing...' : 'Analyze'}
        </Button>
      </div>
    </Card>
  );
}
