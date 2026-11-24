import { useState } from 'react';
import { Body1, Body1Strong, Button, Caption1, Link, Tooltip, makeStyles, tokens } from '@fluentui/react-components';
import type { EvaluationResultVM } from '../contracts/model-assessment';
import { attentionQuestions } from '../contracts/attention-questions';
import { StatusBadge } from './StatusBadge';
import type { EvaluationLinks } from '../services/evaluation-links';

const useStyles = makeStyles({
  section: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS, minWidth: 0 },
  heading: { margin: 0 },
  list: {
    margin: 0, paddingLeft: tokens.spacingHorizontalL,
    display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM,
  },
  item: { overflowWrap: 'anywhere' },
  turns: {
    margin: 0, paddingLeft: tokens.spacingHorizontalL,
    display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS,
  },
  metric: {
    display: 'flex', flexWrap: 'wrap', alignItems: 'center',
    gap: tokens.spacingHorizontalS, marginTop: tokens.spacingVerticalXS,
  },
  note: { color: tokens.colorNeutralForeground3 },
  toggle: { alignSelf: 'flex-start' },
});

export function AttentionQuestions({ results, evaluationLinks }: {
  results: EvaluationResultVM[];
  evaluationLinks?: EvaluationLinks;
}) {
  const styles = useStyles();
  const [expanded, setExpanded] = useState(false);
  const questions = attentionQuestions(results);
  const visible = expanded ? questions : questions.slice(0, 3);
  const groups = new Map<string, { name: string; questions: typeof visible }>();
  for (const question of visible) {
    const name = question.testSet?.trim() || 'Other questions';
    const key = question.testSet?.trim().toLowerCase() || '';
    const group = groups.get(key) ?? { name, questions: [] };
    group.questions.push(question);
    groups.set(key, group);
  }
  return (
    <section className={styles.section} aria-label="Questions needing attention">
      <Body1Strong as="h4" className={styles.heading}>
        Questions needing attention ({questions.length})
      </Body1Strong>
      <Caption1 className={styles.note}>
        Compared with this run's saved baseline, not the selected comparison columns.
      </Caption1>
      {questions.length === 0 ? (
        <Body1>{results.length ? 'No failed or error results in this run.' : 'No results available for this run.'}</Body1>
      ) : (
        [...groups].map(([key, group]) => (
          <div key={key} className={styles.section}>
            <Body1Strong as="h5" className={styles.heading}>
              {key && evaluationLinks && Object.hasOwn(evaluationLinks, key) ? (
                <Tooltip content="Open evaluation in Copilot Studio" relationship="description" withArrow>
                  <Link
                    href={evaluationLinks[key]}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {group.name}
                  </Link>
                </Tooltip>
              ) : group.name}
            </Body1Strong>
            <ul className={styles.list}>
              {group.questions.map((question) => (
                <li key={question.key} className={styles.item}>
                  {question.questions.length > 1 ? (
                    <ol className={styles.turns} aria-label={`Multi-turn test case, ${question.questions.length} questions`}>
                      {question.questions.map((turn, index) => (
                        <li key={index}><Body1Strong>{turn}</Body1Strong></li>
                      ))}
                    </ol>
                  ) : (
                    <Body1Strong>{question.question}</Body1Strong>
                  )}
                  {question.metrics.map((metric) => (
                    <div key={metric.id} className={styles.metric}>
                      <StatusBadge tone={metric.finding === 'Regressed' ? 'danger' : 'warning'} label={metric.finding} />
                      <Body1>{metric.name}: {metric.transition}</Body1>
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
      {questions.length > 3 && (
        <Button
          appearance="subtle"
          className={styles.toggle}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Show fewer' : `Show all ${questions.length} questions`}
        </Button>
      )}
    </section>
  );
}
