import { useMemo } from 'react';
import {
  Card, CardHeader, Body1Strong, Body1, Caption1, Button, Spinner, Divider,
  makeStyles, tokens,
} from '@fluentui/react-components';
import { ChevronUp20Regular, ChevronDown20Regular, ArrowSync20Regular, Chat20Regular } from '@fluentui/react-icons';
import { GaugeChart } from './ui';
import { CriteriaBarChart } from './ui';
import type { CriteriaItem } from '../contracts/types';
import { AppState } from '../contracts/types';

interface EvaluationPaneProps {
  appState: AppState;
  displayedScore: number;
  displayedReasoning: string;
  criteriaItems: CriteriaItem[];
  selectedPromptText: string | null;
  onRefresh: () => void;
  lastAnalyzedAt: Date | null;
  isExpanded: boolean;
  onToggle: () => void;
}

const useStyles = makeStyles({
  card: {
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  headerAction: {
    display: 'flex',
    alignItems: 'center',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: '4px',
    paddingTop: 0,
  },
  subHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
  },
  subHeaderLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  gaugeWrapper: {
    display: 'flex',
    justifyContent: 'center',
  },
  reasonSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  reasoning: {
    color: tokens.colorNeutralForeground2,
  },
  criteriaSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  timestampText: {
    color: tokens.colorNeutralForeground3,
  },
  loadingWrapper: {
    display: 'flex',
    justifyContent: 'center',
    padding: tokens.spacingVerticalXXL,
  },
});

export function EvaluationPane({
  appState, displayedScore, displayedReasoning, criteriaItems,
  selectedPromptText, onRefresh, lastAnalyzedAt, isExpanded, onToggle,
}: EvaluationPaneProps) {
  const styles = useStyles();

  const headerLabel = selectedPromptText ? 'Selected prompt' : 'Input prompt';

  const timestamp = useMemo(() => {
    if (!lastAnalyzedAt) return '';
    return `As of ${lastAnalyzedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}, ${lastAnalyzedAt.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }, [lastAnalyzedAt]);

  return (
    <Card className={styles.card} size="large">
      <CardHeader
        header={
          <div className={styles.headerTitle}>
            <Chat20Regular />
            <Body1Strong>Evaluation</Body1Strong>
          </div>
        }
        action={
          <div className={styles.headerAction}>
            <Button
              appearance="transparent"
              icon={isExpanded ? <ChevronUp20Regular /> : <ChevronDown20Regular />}
              onClick={onToggle}
              aria-label={isExpanded ? 'Collapse evaluation' : 'Expand evaluation'}
              size="small"
            />
          </div>
        }
      />

      {isExpanded && (
        <div className={styles.content}>
          {appState === AppState.LOADING ? (
            <div className={styles.loadingWrapper}>
              <Spinner size="medium" label="Evaluating..." labelPosition="below" />
            </div>
          ) : (
            <>
              {/* Sub-header: "Input prompt" with timestamp + Refresh */}
              {appState === AppState.LOADED && (
                <div className={styles.subHeader}>
                  <div className={styles.subHeaderLeft}>
                    <Body1Strong>{headerLabel}</Body1Strong>
                    {timestamp && <Caption1 className={styles.timestampText}>{timestamp}</Caption1>}
                  </div>
                  <Button
                    appearance="subtle"
                    icon={<ArrowSync20Regular />}
                    size="small"
                    onClick={onRefresh}
                  >
                    Refresh
                  </Button>
                </div>
              )}

              {/* Gauge Chart */}
              <div className={styles.gaugeWrapper}>
                <GaugeChart score={displayedScore} />
              </div>

              {/* Reason for score */}
              <div className={styles.reasonSection}>
                {appState === AppState.LOADED && (
                  <Body1Strong>Reason for score</Body1Strong>
                )}
                <Body1 className={styles.reasoning}>{displayedReasoning}</Body1>
              </div>

              {/* Criteria Bar Chart */}
              {criteriaItems.length > 0 && (
                <div className={styles.criteriaSection}>
                  <Divider />
                  <CriteriaBarChart items={criteriaItems} />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}
