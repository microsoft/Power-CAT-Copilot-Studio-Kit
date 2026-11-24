import { Text, makeStyles, tokens } from '@fluentui/react-components';
import {
  formatRunName,
  runDisplayStatus,
  runTone,
  type EvaluationResultVM,
  type EvaluationRunVM,
} from '../contracts/model-assessment';
import { ResultsBar, StatusBadge } from './StatusBadge';
import { ResultsTable } from './ResultsTable';
import { AssessmentAnalysis } from './AssessmentAnalysis';
import { AttentionQuestions } from './AttentionQuestions';
import { resultsWithBaseline } from '../contracts/attention-questions';
import type { EvaluationLinks } from '../services/evaluation-links';

const useStyles = makeStyles({
  box: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusXLarge,
    padding: tokens.spacingVerticalM,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  head: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  mono: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  sectionH: {
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
    marginTop: tokens.spacingVerticalS,
  },
  ai: {
    backgroundColor: tokens.colorBrandBackground2,
    border: `1px solid ${tokens.colorBrandStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalM,
    fontSize: tokens.fontSizeBase300,
  },
  errorText: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase300,
  },
  muted: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
});

export interface RunDetailsProps {
  run: EvaluationRunVM;
  results: EvaluationResultVM[];
  baselineResults?: EvaluationResultVM[];
  evaluationLinks?: EvaluationLinks;
}

export function RunDetails({ run, results, baselineResults = [], evaluationLinks }: RunDetailsProps) {
  const styles = useStyles();
  const total = run.pass + run.fail + run.error + run.excluded;
  const statusToken = run.status.toLowerCase().replace(/[^a-z]/g, '');
  const noEvaluations =
    total === 0 &&
    (statusToken.includes('noevaluation') ||
      statusToken === 'metadataunavailable');

  if (noEvaluations) {
    return (
      <div className={styles.box}>
        <div className={styles.head}>
          <span className={styles.mono}>No evaluation run</span>
          <StatusBadge tone={runTone(runDisplayStatus(run))} label={runDisplayStatus(run)} />
        </div>
        <Text className={styles.muted}>
          No evaluations are configured for this agent, so there are no results
          to analyse. Configure an evaluation in Copilot Studio to see results
          here.
        </Text>
      </div>
    );
  }

  return (
    <div className={styles.box}>
      <div className={styles.head}>
        <span className={styles.mono}>{formatRunName(run.name) || run.id}</span>
        <StatusBadge tone={runTone(runDisplayStatus(run))} label={runDisplayStatus(run)} />
      </div>

      {total > 0 && (
        <ResultsBar
          pass={run.pass}
          fail={run.fail}
          error={run.error}
          excluded={run.excluded}
          showCount={false}
        />
      )}

      <ResultsTable results={results} />
      <AttentionQuestions
        key={run.id}
        results={resultsWithBaseline([...results, ...baselineResults], run.id, run.comparedToRunId)}
        evaluationLinks={evaluationLinks}
      />

      {run.errorMessage && (
        <>
          <div className={styles.sectionH}>Error detail</div>
          <div>
            {run.errorCategory && (
              <StatusBadge tone="danger" label={run.errorCategory} />
            )}
            <Text as="p" className={styles.errorText}>
              {run.errorMessage}
            </Text>
          </div>
        </>
      )}

      {run.ai ? (
        <>
          <div className={styles.sectionH}>AI analysis</div>
          <div className={styles.ai}>
            <AssessmentAnalysis
              text={run.ai}
              results={results.filter((result) => result.runId?.toLowerCase() === run.id.toLowerCase())}
            />
          </div>
        </>
      ) : (
        total > 0 && (
          <span className={styles.muted}>
            AI analysis {run.analysisStatus.toLowerCase()}.
          </span>
        )
      )}
    </div>
  );
}
