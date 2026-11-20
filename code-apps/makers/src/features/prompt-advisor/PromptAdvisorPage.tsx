import { useState, useEffect, useCallback } from 'react';
import {
  Title2, Body1, Spinner, Body1Strong,
  Card, CardHeader,
  MessageBar, MessageBarBody, MessageBarActions,
  Button,
  makeStyles, tokens,
} from '@fluentui/react-components';
import { Dismiss20Regular } from '@fluentui/react-icons';
import { usePromptAdvisor } from './hooks/usePromptAdvisor';
import { PromptInputCard } from './components/PromptInputCard';
import { ResponseCard } from './components/ResponseCard';
import { EvaluationPane } from './components/EvaluationPane';
import { TipsPane } from './components/TipsPane';
import { NoCreditScreen } from './components/NoCreditScreen';
import { useFeatureTelemetry } from '../../shared/hooks/useFeatureTelemetry';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    maxWidth: '1280px',
    width: '100%',
    marginLeft: 'auto',
    marginRight: 'auto',
    paddingTop: tokens.spacingVerticalXXXL,
    paddingRight: tokens.spacingHorizontalXL,
    paddingBottom: tokens.spacingVerticalL,
    paddingLeft: tokens.spacingHorizontalXL,
    gap: tokens.spacingVerticalL,
    boxSizing: 'border-box',
  },
  pageHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    flexShrink: 0,
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  description: {
    color: tokens.colorNeutralForeground2,
    marginBottom: tokens.spacingVerticalL,
  },
  content: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    flex: 1,
    minHeight: 0,
  },
  leftStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    flex: '4 1 500px',
    minWidth: '400px',
    minHeight: 0,
  },
  rightPane: {
    display: 'flex',
    flexDirection: 'column',
    flex: '1.5 1 280px',
    minWidth: '280px',
  },
  controlPaneContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingVerticalS,
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
  },
});

export default function PromptAdvisorPage() {
  useFeatureTelemetry('prompt-advisor', 'Prompt Advisor');
  const styles = useStyles();
  const advisor = usePromptAdvisor();
  const [expandedPane, setExpandedPane] = useState<'evaluation' | 'tips' | null>(null);

  const toggleEvaluation = () => setExpandedPane((prev) => prev === 'evaluation' ? null : 'evaluation');
  const toggleTips = () => setExpandedPane((prev) => prev === 'tips' ? null : 'tips');

  const handlePaneToggle = useCallback((pane: 'evaluation' | 'tips') => {
    setExpandedPane(pane);
  }, []);

  useEffect(() => {
    advisor.setPaneToggle(handlePaneToggle);
  }, [advisor.setPaneToggle, handlePaneToggle]);

  if (advisor.isQuotaExceeded) {
    return <NoCreditScreen />;
  }

  if (advisor.isConfigLoading) {
    return (
      <div className={styles.loading}>
        <Spinner size="large" label="Loading Prompt Advisor..." labelPosition="below" />
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.pageHeader}>
        <div className={styles.titleRow}>
          <Title2>Prompt Advisor</Title2>
        </div>
        <Body1 className={styles.description}>
          Prompt Advisor allows makers to develop effective prompts while learning useful prompt engineering skills. Prompts entered in the advisor tool will be analyzed and receive a confidence evaluation with detailed reasoning for the score.
        </Body1>
      </div>

      {(advisor.configError || advisor.analysisError) && (
        <MessageBar intent="error">
          <MessageBarBody>{advisor.configError ?? advisor.analysisError}</MessageBarBody>
          <MessageBarActions
            containerAction={
              <Button
                appearance="transparent"
                icon={<Dismiss20Regular />}
                onClick={advisor.clearError}
                aria-label="Dismiss error"
              />
            }
          />
        </MessageBar>
      )}

      {advisor.lastCopySuccess && (
        <MessageBar intent="success">
          <MessageBarBody>Copied prompt to clipboard.</MessageBarBody>
          <MessageBarActions
            containerAction={
              <Button
                appearance="transparent"
                icon={<Dismiss20Regular />}
                onClick={advisor.clearCopySuccess}
                aria-label="Dismiss notification"
              />
            }
          />
        </MessageBar>
      )}

      <div className={styles.content}>
        <div className={styles.leftStack}>
          {!advisor.isFullScreen && (
            <PromptInputCard
              appState={advisor.appState}
              promptText={advisor.promptText}
              isConfigLoading={advisor.isConfigLoading}
              setPromptText={advisor.setPromptText}
              analyze={advisor.analyze}
              reset={advisor.reset}
              loadRandom={advisor.loadRandom}
            />
          )}
          <ResponseCard
            appState={advisor.appState}
            promptGroups={advisor.analysisResult?.promptGroups ?? []}
            selectedPrompt={advisor.selectedPrompt}
            isFullScreen={advisor.isFullScreen}
            selectPrompt={advisor.selectPrompt}
            applyAndRefine={advisor.applyAndRefine}
            copyPrompt={advisor.copyPrompt}
            toggleFullScreen={advisor.toggleFullScreen}
          />
        </div>

        <div className={styles.rightPane}>
          <Card size="large">
            <CardHeader header={<Body1Strong>Control pane</Body1Strong>} />
            <div className={styles.controlPaneContent}>
              <EvaluationPane
                appState={advisor.appState}
                displayedScore={advisor.displayedScore}
                displayedReasoning={advisor.displayedReasoning}
                criteriaItems={advisor.criteriaItems}
                selectedPromptText={advisor.selectedPromptText}
                onRefresh={advisor.analyze}
                lastAnalyzedAt={advisor.lastAnalyzedAt}
                isExpanded={expandedPane === 'evaluation'}
                onToggle={toggleEvaluation}
              />
              <TipsPane
                isExpanded={expandedPane === 'tips'}
                onToggle={toggleTips}
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
