import { useMemo, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  ToggleButton,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import {
  resultTone,
  buildCaseLabels,
  parseResultReason,
  type EvaluationResultVM,
} from '../contracts/model-assessment';
import { StatusBadge } from './StatusBadge';
import { metricDisplayName } from '../contracts/metric-display';
import { displayQuestions } from '../contracts/test-case-questions';

const useStyles = makeStyles({
  filters: {
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
    flexWrap: 'wrap',
    marginBottom: tokens.spacingVerticalS,
  },
  scroll: {
    maxHeight: '340px',
    overflow: 'auto',
  },
  group: { marginBottom: tokens.spacingVerticalM },
  groupHead: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    marginBottom: tokens.spacingVerticalXS,
  },
  groupName: {
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  groupCount: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusCircular,
    padding: `0 ${tokens.spacingHorizontalS}`,
  },
  colCase: { width: '32%' },
  colMetric: { width: '20%' },
  // Turns of one conversation read as a single block: no rule between them, tight spacing.
  turnText: { display: 'flex', gap: tokens.spacingHorizontalXS },
  innerTurnRow: { borderBottomColor: 'transparent' },
  turnCell: { height: 'auto', paddingTop: tokens.spacingVerticalXXS, paddingBottom: tokens.spacingVerticalXXS },
  colStatus: { width: '18%' },
  reason: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
});

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

export interface ResultsTableProps {
  results: EvaluationResultVM[];
}

/** Per-case results (cat_evaluationresult) with quick status filtering. */
export function ResultsTable({ results }: ResultsTableProps) {
  const styles = useStyles();
  const [filter, setFilter] = useState<string>('all');

  const counts = useMemo(() => {
    const c: Record<string, number> = { fail: 0, error: 0, excluded: 0, pass: 0 };
    for (const r of results) {
      const key = norm(r.status);
      if (key in c) c[key] += 1;
    }
    return c;
  }, [results]);

  const caseLabels = useMemo(() => buildCaseLabels(results), [results]);

  const visible = useMemo(
    () => (filter === 'all' ? results : results.filter((r) => norm(r.status) === filter)),
    [results, filter],
  );

  const groups = useMemo(() => {
    const map = new Map<string, EvaluationResultVM[]>();
    for (const r of visible) {
      const key = r.testSet?.trim() || 'Ungrouped';
      const list = map.get(key);
      if (list) list.push(r);
      else map.set(key, [r]);
    }
    return Array.from(map.entries());
  }, [visible]);

  if (results.length === 0) return null;

  const chip = (key: string, label: string, count: number) =>
    count > 0 ? (
      <ToggleButton
        key={key}
        size="small"
        shape="circular"
        checked={filter === key}
        onClick={() => setFilter(key)}
      >
        {label} {count}
      </ToggleButton>
    ) : null;

  return (
    <div>
      <div className={styles.filters}>
        <ToggleButton
          size="small"
          shape="circular"
          checked={filter === 'all'}
          onClick={() => setFilter('all')}
        >
          All {results.length}
        </ToggleButton>
        {chip('fail', 'Fail', counts.fail)}
        {chip('error', 'Error', counts.error)}
        {chip('excluded', 'Excluded', counts.excluded)}
        {chip('pass', 'Pass', counts.pass)}
      </div>
      <div className={styles.scroll}>
        {groups.map(([setName, rows]) => (
          <div key={setName} className={styles.group}>
            <div className={styles.groupHead}>
              <span className={styles.groupName}>{setName}</span>
              <span className={styles.groupCount}>{rows.length}</span>
            </div>
            <Table size="small" aria-label={`Results for ${setName}`}>
              <TableHeader>
                <TableRow>
                  <TableHeaderCell className={styles.colCase}>Test case</TableHeaderCell>
                  <TableHeaderCell className={styles.colMetric}>Metric</TableHeaderCell>
                  <TableHeaderCell className={styles.colStatus}>Status</TableHeaderCell>
                  <TableHeaderCell>Reason</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.flatMap((r) => {
                  const turns = r.question?.trim() ? displayQuestions(r) : [];
                  const multiTurn = turns.length > 1;
                  const span = Math.max(turns.length, 1);
                  const first = turns[0] ?? (r.testCase ? caseLabels.get(r.testCase) ?? 'Case' : '—');
                  const turnLabel = (text: string, index: number) => (
                    multiTurn
                      ? <span className={styles.turnText}><span className={styles.muted}>{index + 1}.</span><span>{text}</span></span>
                      : text
                  );
                  return [
                    <TableRow key={r.id} className={multiTurn ? styles.innerTurnRow : undefined}>
                      <TableCell className={mergeClasses(styles.colCase, multiTurn && styles.turnCell)}>{turnLabel(first, 0)}</TableCell>
                      <TableCell className={`${styles.colMetric} ${styles.muted}`} rowSpan={span}>
                        {metricDisplayName(r.metric, r.grader) || '—'}
                      </TableCell>
                      <TableCell className={styles.colStatus} rowSpan={span}>
                        <StatusBadge tone={resultTone(r.status)} label={r.status} />
                      </TableCell>
                      <TableCell className={styles.reason} rowSpan={span}>
                        {parseResultReason(r.reason, r.metric)}
                      </TableCell>
                    </TableRow>,
                    ...turns.slice(1).map((turn, index) => (
                      <TableRow
                        key={`${r.id}-turn-${index + 1}`}
                        className={index < turns.length - 2 ? styles.innerTurnRow : undefined}
                      >
                        <TableCell className={mergeClasses(styles.colCase, styles.turnCell)}>{turnLabel(turn, index + 1)}</TableCell>
                      </TableRow>
                    )),
                  ];
                })}
              </TableBody>
            </Table>
          </div>
        ))}
      </div>
    </div>
  );
}
