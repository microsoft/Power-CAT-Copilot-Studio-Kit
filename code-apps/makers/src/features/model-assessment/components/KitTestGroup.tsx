import { useId, useMemo, useState, type ReactNode } from 'react';
import {
  Body1,
  Body1Strong,
  Button,
  Spinner,
  TableBody,
  TableCell,
  TableHeaderCell,
  TableRow,
  makeStyles,
  mergeClasses,
  tokens,
  Tooltip,
} from '@fluentui/react-components';
import { ChevronDown20Regular, ChevronRight20Regular } from '@fluentui/react-icons';
import { type EvaluationRunVM } from '../contracts/model-assessment';
import {
  groupKitRowsBySet,
  kitResultLabel,
  kitResultTone,
  type KitTestRow,
  type KitTestTurnVM,
} from '../contracts/kit-results';
import type { KitTestRowsState } from '../hooks/useKitTestRows';
import { StatusBadge } from './StatusBadge';
import { ConversationLabel } from './ConversationLabel';

const useStyles = makeStyles({
  stack: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS, alignItems: 'flex-start' },
  text: { display: 'block', width: '100%', overflowWrap: 'anywhere', whiteSpace: 'pre-line' },
  top: { verticalAlign: 'top' },
  conversation: { backgroundColor: tokens.colorNeutralBackground2 },
  turnCell: { paddingLeft: tokens.spacingHorizontalXXL },
  turnButton: { minHeight: 'auto' },
  title: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, minWidth: 0 },
  name: { minWidth: 0, overflowWrap: 'anywhere' },
});

/** Class names shared with the evaluation rows so both groups line up in one table. */
export interface KitTestGroupClasses {
  cell: string;
  caseCell: string;
  metricCell: string;
  runCell: string;
  setHeading: string;
  setControls: string;
  setToggle: string;
  muted: string;
  questionGroup: string;
  hidden: string;
}

interface KitTestGroupProps {
  runs: EvaluationRunVM[];
  kit: KitTestRowsState;
  /** Kit tests that match the active filter. */
  rows: KitTestRow[];
  /** True when a filter other than All is active; then no empty state is shown here. */
  filtered: boolean;
  classes: KitTestGroupClasses;
}

/**
 * Copilot Agent Kit test results of the selected runs as a collapsible group of
 * the Test Runs table. Sets start expanded; conversations start collapsed.
 */
export function KitTestGroup({ runs, kit, rows, filtered, classes }: KitTestGroupProps) {
  const { query } = kit;
  const groups = useMemo(() => groupKitRowsBySet(rows), [rows]);
  if (!kit.hasKit) return null;
  const span = runs.length + 2;

  const status = (content: ReactNode) => (
    <KitSetSection name="Kit tests" span={span} classes={classes}>
      <TableRow>
        <TableCell colSpan={span} className={mergeClasses(classes.cell, classes.muted)}>{content}</TableCell>
      </TableRow>
    </KitSetSection>
  );

  if (query.isError) {
    return status(
      <>
        Kit test results could not be loaded. {query.error.message}{' '}
        <Button appearance="subtle" size="small" onClick={() => void query.refetch()}>Retry</Button>
      </>,
    );
  }
  if (query.isLoading) return status(<Spinner size="tiny" label="Loading Kit test results…" labelPosition="after" />);
  if (groups.length === 0) return filtered ? null : status('No Kit test results for the selected runs.');

  return (
    <>
      {groups.map((group) => (
        <KitSetSection key={group.name} name={group.name} count={group.rows.length} span={span} classes={classes}>
          {group.rows.map((row) => <KitTestRowView key={row.key} row={row} runs={runs} classes={classes} />)}
        </KitSetSection>
      ))}
    </>
  );
}

interface KitSetSectionProps {
  name: string;
  count?: number;
  span: number;
  classes: KitTestGroupClasses;
  children: ReactNode;
}

/** A collapsible Kit test set group, expanded by default like the evaluation test sets. */
function KitSetSection({ name, count, span, classes, children }: KitSetSectionProps) {
  const groupId = useId();
  const [expanded, setExpanded] = useState(true);
  const headingId = `${groupId}-heading`;
  return (
    <>
      <TableBody data-kit-heading>
        <TableRow>
          <TableCell colSpan={span} className={classes.setHeading}>
            <div className={classes.setControls}>
              <Button
                appearance="subtle"
                size="small"
                className={classes.setToggle}
                icon={expanded ? <ChevronDown20Regular /> : <ChevronRight20Regular />}
                aria-label={`${expanded ? 'Collapse' : 'Expand'} ${name}`}
                aria-expanded={expanded}
                aria-controls={`${groupId}-rows`}
                onClick={() => setExpanded((value) => !value)}
              />
              <Body1Strong id={headingId}>{count === undefined ? name : `${name} (${count})`}</Body1Strong>
            </div>
          </TableCell>
        </TableRow>
      </TableBody>
      <TableBody
        id={`${groupId}-rows`}
        hidden={!expanded}
        data-kit-rows
        aria-labelledby={headingId}
        className={!expanded ? classes.hidden : undefined}
      >
        {children}
      </TableBody>
    </>
  );
}

function KitTestRowView({ row, runs, classes }: { row: KitTestRow; runs: EvaluationRunVM[]; classes: KitTestGroupClasses }) {
  const styles = useStyles();
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const turns = row.turns ?? [];
  const turnIds = turns.map((_, index) => `${id}-turn-${index}`);
  const title = row.testName || (row.multiTurn ? turns[0]?.utterance || 'Conversation' : row.utterance);
  return (
    <>
      <TableRow data-kit-test={row.key} className={row.multiTurn ? styles.conversation : undefined}>
        <TableHeaderCell scope="row" className={mergeClasses(classes.caseCell, classes.cell, styles.top)}>
          {row.multiTurn ? (
            <div className={classes.setControls}>
              <Button appearance="subtle" size="small" className={classes.setToggle}
                icon={expanded ? <ChevronDown20Regular /> : <ChevronRight20Regular />}
                aria-label={`${expanded ? 'Collapse' : 'Expand'} conversation: ${title}`}
                aria-expanded={expanded}
                aria-controls={turnIds.length ? turnIds.join(' ') : `${id}-empty`}
                onClick={() => setExpanded((value) => !value)}
              />
              <div className={styles.title}>
                <Body1Strong className={styles.name} truncate wrap={false} title={title}>{title}</Body1Strong>
                <ConversationLabel />
              </div>
            </div>
          ) : <Body1 className={styles.text}>{row.utterance}</Body1>}
        </TableHeaderCell>
        <TableCell className={mergeClasses(classes.metricCell, classes.cell, classes.muted, styles.top)}>
          {row.metric}
        </TableCell>
        {runs.map((run) => (
          <KitResultCell key={run.id} result={row.byRun.get(run.kit?.testRunId?.toLowerCase() ?? '')} classes={classes} />
        ))}
      </TableRow>
      {row.multiTurn && turns.map((turn, index) => (
        <TableRow key={turn.key} id={turnIds[index]} hidden={!expanded}
          className={!expanded ? classes.hidden : undefined} data-kit-turn={row.key}>
          <TableHeaderCell scope="row" button={{ className: styles.turnButton }}
            className={mergeClasses(classes.caseCell, classes.cell, styles.top, styles.turnCell)}>
            <Body1 className={styles.text}>{turn.utterance}</Body1>
          </TableHeaderCell>
          <TableCell className={mergeClasses(classes.metricCell, classes.cell, classes.muted, styles.top)}>{turn.metric}</TableCell>
          {runs.map((run) => (
            <KitResultCell key={run.id} result={turn.byRun.get(run.kit?.testRunId?.toLowerCase() ?? '')} classes={classes} />
          ))}
        </TableRow>
      ))}
      {row.multiTurn && turns.length === 0 && (
        <TableRow id={`${id}-empty`} hidden={!expanded} className={!expanded ? classes.hidden : undefined}>
          <TableCell colSpan={runs.length + 2} className={mergeClasses(classes.cell, classes.muted)}>
            No turn results or test definition are available.
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function KitResultCell({ result, classes }: {
  result?: Pick<KitTestTurnVM, 'code' | 'response'>;
  classes: KitTestGroupClasses;
}) {
  const styles = useStyles();
  return (
    <TableCell className={mergeClasses(classes.runCell, classes.cell, styles.top)}>
      {result?.code !== undefined ? (
        <Tooltip content={result.response || kitResultLabel(result.code)} relationship="description" withArrow>
          <div className={styles.stack}>
            <StatusBadge tone={kitResultTone(result.code)} label={kitResultLabel(result.code)} />
          </div>
        </Tooltip>
      ) : <span className={classes.muted}>{result ? 'Not recorded' : 'Not run'}</span>}
    </TableCell>
  );
}
