import { Fragment, useId, useMemo, useState } from 'react';
import {
  Button,
  Body1,
  Body1Strong,
  Caption1,
  Caption1Strong,
  Card,
  CardHeader,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Dropdown,
  Field,
  MessageBar,
  MessageBarBody,
  Option,
  Tab,
  TabList,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  ToggleButton,
  Tooltip,
  Spinner,
  Subtitle2,
  makeStyles,
  createFocusOutlineStyle,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import {
  ChevronDown20Regular,
  ChevronRight20Regular,
  CoinStackRegular,
  Dismiss20Regular,
} from '@fluentui/react-icons';
import {
  formatWhen,
  friendlySetError,
  regressionTone,
  resultTone,
  runDisplayStatus,
  runTone,
  type CreditsVM,
  type EvaluationResultVM,
  type EvaluationRunVM,
  type ModelHistoryVM,
} from '../contracts/model-assessment';
import {
  classifyRunStatuses,
  compareRunsChronologically,
  comparisonBaseline,
  comparisonBaselineNote,
  isScoredRun,
} from '../contracts/comparison-utils';
import { StatusBadge } from './StatusBadge';
import { modelDisplayName } from '../contracts/model-display';
import { AssessmentAnalysis } from './AssessmentAnalysis';
import { attentionQuestions, resultsWithBaseline } from '../contracts/attention-questions';
import { metricDisplayName } from '../contracts/metric-display';
import { displayQuestions } from '../contracts/test-case-questions';
import { KitTestGroup } from './KitTestGroup';
import { AssessmentInfo } from './AssessmentInfo';
import { ConversationLabel } from './ConversationLabel';
import { useKitTestRows } from '../hooks/useKitTestRows';
import { groupKitRowsBySet, kitResultStatus, kitRowNeedsAttention, kitRowStatuses, type KitTestRow } from '../contracts/kit-results';
import {
  CREDITS_NOT_REPORTED,
  creditsBreakdown,
  creditsLabel,
  creditsTotal,
  formatCredits,
  sumCredits,
} from '../contracts/credits';
import type { ComparisonExportRow } from '../services/comparison-export';
import { buildRecommendationRequest, evaluationChecks, kitChecks } from '../contracts/model-recommendation';
import { recommendationReport } from '../contracts/recommendation-display';
import { useModelRecommendation } from '../hooks/useModelRecommendation';
import { ModelRecommendation } from './ModelRecommendation';

const useStyles = makeStyles({
  surface: {
    width: '94vw',
    maxWidth: '1120px',
    height: 'min(85dvh, 820px)',
  },
  body: { height: '100%', minHeight: 0, minWidth: 0 },
  actions: { columnGap: tokens.spacingHorizontalM, flexWrap: 'wrap' },
  actionButton: { minHeight: '44px' },
  title: { minWidth: 0 },
  titleText: {
    ...createFocusOutlineStyle(),
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
    overflow: 'hidden',
    overflowWrap: 'anywhere',
    '@media (max-height: 480px)': { WebkitLineClamp: 1 },
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    minHeight: 0,
    minWidth: 0,
    overflowY: 'hidden',
  },
  selector: { maxWidth: '480px', flexShrink: 0 },
  baselineNote: { flexShrink: 0 },
  runOption: {
    display: 'flex',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    columnGap: tokens.spacingHorizontalS,
    rowGap: tokens.spacingVerticalXXS,
  },
  setControls: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, minWidth: 0 },
  setToggle: { flexShrink: 0 },
  testSetName: { overflowWrap: 'anywhere', fontWeight: tokens.fontWeightSemibold },
  result: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: tokens.spacingVerticalXS,
  },
  finding: { color: tokens.colorNeutralForeground3, overflowWrap: 'anywhere' },
  tabs: { flexShrink: 0, flexWrap: 'wrap' },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    minHeight: 0,
    minWidth: 0,
    flex: 1,
    overflowY: 'auto',
    padding: tokens.spacingHorizontalXXS,
  },
  hiddenPanel: { display: 'none' },
  casesPanel: { overflowY: 'hidden', gap: tokens.spacingVerticalM },
  runCards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
    gap: tokens.spacingHorizontalM,
  },
  runCard: {
    minWidth: 0,
    flexShrink: 0,
    textAlign: 'left',
  },
  cardBody: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    textAlign: 'left',
    gap: tokens.spacingVerticalXS,
    padding: 0,
  },
  statuses: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: tokens.spacingHorizontalXS,
  },
  model: { overflow: 'hidden', textOverflow: 'ellipsis' },
  meta: { color: tokens.colorNeutralForeground3 },
  credits: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalXS,
    marginTop: tokens.spacingVerticalXXS,
  },
  creditsIcon: { flexShrink: 0, fontSize: '16px', color: tokens.colorNeutralForeground2 },
  creditsText: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  creditsAmount: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXXS,
    whiteSpace: 'nowrap',
  },
  creditsSubtotal: { color: tokens.colorNeutralForeground3 },
  modelHeading: {
    display: 'flex',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    columnGap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalXXS,
  },
  runTime: {
    color: tokens.colorNeutralForeground3,
    whiteSpace: 'nowrap',
  },
  filters: {
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
    flexWrap: 'wrap',
    flexShrink: 0,
    alignItems: 'center',
  },
  scroll: { minHeight: 0, flex: 1, overflow: 'auto', isolation: 'isolate' },
  emptyState: { display: 'block', padding: tokens.spacingHorizontalL },
  tableCard: { padding: 0, gap: 0, overflow: 'hidden', minHeight: 0, flex: '0 1 auto', boxShadow: 'none' },
  columnHeaders: {
    position: 'sticky',
    top: 0,
    zIndex: 1,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  cell: {
    boxSizing: 'border-box',
    padding: `${tokens.spacingVerticalMNudge} ${tokens.spacingHorizontalM}`,
  },
  setHeading: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    backgroundColor: tokens.colorNeutralBackground3,
    overflowWrap: 'anywhere',
  },
  caseCell: { width: '40%', minWidth: '240px', verticalAlign: 'middle' },
  question: { display: 'block', width: '100%', lineHeight: tokens.lineHeightBase300, overflowWrap: 'anywhere' },
  // Turns of one conversation read as a single block: no rule between them, tight spacing.
  innerTurnRow: { borderBottomColor: 'transparent' },
  turnCell: { height: 'auto', paddingTop: tokens.spacingVerticalXS, paddingBottom: tokens.spacingVerticalXS },
  turnButton: { minHeight: 'auto' },
  firstTurn: { paddingTop: tokens.spacingVerticalMNudge },
  lastTurn: { paddingBottom: tokens.spacingVerticalMNudge },
  exportError: { color: tokens.colorPaletteRedForeground1, alignSelf: 'center' },
  questionGroup: {
    ':hover > tr': { backgroundColor: tokens.colorSubtleBackgroundHover },
  },
  // Wide enough for "Required Information Coverage" on one line.
  metricCell: { width: '220px', minWidth: '220px' },
  runCell: { width: '140px', minWidth: '140px' },
  muted: { color: tokens.colorNeutralForeground3 },
  aiCards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
    gap: tokens.spacingHorizontalM,
  },
  aiCard: {
    display: 'grid',
    gridTemplateRows: 'subgrid',
    gridRow: 'span 2',
    rowGap: tokens.spacingVerticalXS,
  },
  aiBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    padding: `0 ${tokens.spacingHorizontalM} ${tokens.spacingVerticalM}`,
  },
  kitSummary: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    marginTop: tokens.spacingVerticalM,
    paddingTop: tokens.spacingVerticalM,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
});

interface ComparisonRow {
  key: string;
  caseKey: string;
  question: string;
  /** Every question of the test case (several, in order, for multi-turn cases). */
  questions: string[];
  multiTurn: boolean;
  testSet?: string;
  testSetId?: string;
  metric: string;
  grader?: string;
  byRun: Map<string, EvaluationResultVM>;
}

function groupComparisonRows(rows: ComparisonRow[]) {
  const cases = new Map<string, ComparisonRow[]>();
  for (const row of rows) {
    const group = cases.get(row.caseKey) ?? [];
    group.push(row);
    cases.set(row.caseKey, group);
  }
  const sets = new Map<string, { key: string; name: string; testSetId?: string; questions: ComparisonRow[][] }>();
  for (const group of cases.values()) {
    const key = group[0].testSet?.toLowerCase() ?? '';
    const set = sets.get(key) ?? {
      key, name: group[0].testSet || 'Test set unavailable', testSetId: group[0].testSetId, questions: [],
    };
    set.questions.push(group);
    sets.set(key, set);
  }
  for (const set of sets.values()) {
    set.questions.sort((a, b) => Number(b[0].multiTurn) - Number(a[0].multiTurn));
  }
  return [...sets.values()].sort((a, b) =>
    Number(b.questions.some((group) => group[0].multiTurn))
      - Number(a.questions.some((group) => group[0].multiTurn))
    || a.name.localeCompare(b.name));
}

export interface CompareDialogProps {
  open: boolean;
  onClose: () => void;
  runs: EvaluationRunVM[];
  history: ModelHistoryVM[];
  results: EvaluationResultVM[];
  initialRunId?: string;
  botId?: string;
  /** Identifies the agent in the dialog title and exported comparison. */
  agentName?: string;
  /** Microsoft Copilot harness agent: its runs report Copilot Credits. */
  harness?: boolean;
}

function classifyRow(row: ComparisonRow, selectedRuns: EvaluationRunVM[]): string {
  return classifyRunStatuses(
    selectedRuns.map((run) => row.byRun.get(run.id)?.status),
  );
}

type CompareDialogContentProps = Omit<CompareDialogProps, 'open'>;

function CompareDialogContent({
  onClose,
  runs,
  history,
  results,
  initialRunId,
  agentName,
  harness = false,
}: CompareDialogContentProps) {
  const styles = useStyles();
  const resultRunIds = useMemo(
    () => new Set(results.flatMap((result) => result.runId ? [result.runId.toLowerCase()] : [])),
    [results],
  );
  const comparableRuns = useMemo(
    () => runs
      .filter((run) => isScoredRun(run, resultRunIds))
      .sort((a, b) => compareRunsChronologically(b, a)),
    [runs, resultRunIds],
  );
  const [initialSelection] = useState(() => {
    const initial = comparableRuns.find((run) => run.id === initialRunId) ?? comparableRuns[0];
    if (!initial) return { ids: [] as string[], note: undefined };
    const previous = comparisonBaseline(initial, comparableRuns, resultRunIds);
    return {
      ids: previous ? [previous.id, initial.id] : [initial.id],
      note: comparisonBaselineNote(initial, previous, comparableRuns, history, resultRunIds),
    };
  });
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelection.ids);
  const [baselineNote, setBaselineNote] = useState(initialSelection.note);
  const [filter, setFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('summary');
  // Test sets start expanded; users collapse the ones they want to hide.
  const [collapsedSets, setCollapsedSets] = useState<Set<string>>(() => new Set());
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string>();
  const tabId = useId();

  const historyById = useMemo(
    () => new Map(history.map((item) => [item.id, item])),
    [history],
  );
  const modelFor = (run: EvaluationRunVM) =>
    modelDisplayName(run.historyId ? historyById.get(run.historyId)?.currentModel : undefined) ||
    'Unknown model';
  const runLabel = (run: EvaluationRunVM) =>
    `${modelFor(run)} ${formatWhen(run.completedOn ?? run.startedOn)}`;

  const selectedRuns = useMemo(
    () =>
      selectedIds
        .map((id) => comparableRuns.find((run) => run.id === id))
        .filter((run): run is EvaluationRunVM => Boolean(run))
        .sort(compareRunsChronologically),
    [selectedIds, comparableRuns],
  );

  const attentionByResult = useMemo(() => new Map(
    selectedRuns.flatMap((run) =>
      attentionQuestions(resultsWithBaseline(results, run.id, run.comparedToRunId))
        .flatMap((question) => question.metrics.map((metric) => [metric.id, metric] as const)),
    ),
  ), [results, selectedRuns]);

  const rows = useMemo<ComparisonRow[]>(() => {
    const selected = new Set(selectedIds);
    const map = new Map<string, ComparisonRow>();
    for (const result of results) {
      if (!result.runId || !selected.has(result.runId)) continue;
      const caseId = result.testCaseId ?? result.testCase ?? result.id;
      const metric = result.metric ?? 'Metric';
      const testSet = result.testSet?.trim();
      // A set that could not run has no question; its reason explains the error row.
      const question = result.question?.trim()
        || (metric.toLowerCase() === 'external' ? friendlySetError(result.reason) ?? '' : '');
      const questions = displayQuestions(result);
      const caseKey = JSON.stringify([testSet?.toLowerCase() ?? '', caseId.toLowerCase()]);
      const key = `${caseKey}::${metric.toLowerCase()}`;
      const row = map.get(key) ?? {
        key,
        caseKey,
        question,
        questions,
        multiTurn: Boolean(result.multiTurn) || questions.length > 1,
        testSet,
        testSetId: result.testSetId,
        metric,
        byRun: new Map<string, EvaluationResultVM>(),
      };
      if (!row.question) row.question = question;
      row.grader ??= result.grader;
      if (questions.length > row.questions.length) row.questions = questions;
      row.multiTurn ||= Boolean(result.multiTurn) || questions.length > 1;
      row.byRun.set(result.runId, result);
      map.set(key, row);
    }
    const questionByCase = new Map<string, string>();
    const questionsByCase = new Map<string, string[]>();
    const multiTurnCases = new Set<string>();
    for (const row of map.values()) {
      if (row.multiTurn) multiTurnCases.add(row.caseKey);
      if (row.question && !questionByCase.has(row.caseKey)) questionByCase.set(row.caseKey, row.question);
      if (row.questions.length > (questionsByCase.get(row.caseKey)?.length ?? 0)) {
        questionsByCase.set(row.caseKey, row.questions);
      }
    }
    return [...map.values()].map((row) => ({
      ...row,
      question: row.question || questionByCase.get(row.caseKey) || '',
      questions: questionsByCase.get(row.caseKey) ?? row.questions,
      multiTurn: multiTurnCases.has(row.caseKey),
    })).sort(
      (a, b) => a.question.localeCompare(b.question) || a.metric.localeCompare(b.metric),
    );
  }, [results, selectedIds]);

  const kit = useKitTestRows(selectedRuns);
  const kitRows = kit.rows;

  // Runs are oldest first, so the recommendation reads "earlier run" vs "later run".
  const recommendationRequest = useMemo(() => {
    const [runA, runB] = selectedRuns;
    const checks = selectedRuns.length !== 2
      ? []
      : resultRunIds.has(runA.id.toLowerCase()) && resultRunIds.has(runB.id.toLowerCase())
        ? evaluationChecks(
          rows.map((row) => ({
            testSet: row.testSet,
            question: row.questions.length > 1 ? row.questions.join(' → ') : row.question,
            metric: row.metric,
            byRun: row.byRun,
          })),
          runA.id,
          runB.id,
        )
        : kitChecks(kitRows, runA, runB);
    return buildRecommendationRequest({
      runs: selectedRuns.map((run) => {
        const modelCode = run.historyId ? historyById.get(run.historyId)?.currentModel : undefined;
        return { run, model: modelDisplayName(modelCode) || 'Unknown model', modelCode };
      }),
      resultRunIds,
      checks,
      agentName,
      kitLoading: kit.query.isLoading,
      kitError: kit.query.isError,
    });
  }, [selectedRuns, resultRunIds, rows, kitRows, historyById, agentName, kit.query.isLoading, kit.query.isError]);
  // Shares the card's cached query, so exporting never calls the prompt again.
  const recommendationQuery = useModelRecommendation(recommendationRequest);

  // Credits are reported per test case and repeat on each of its metric rows, so each
  // case counts once per run. Set subtotals cover every case, whatever the filter shows.
  const credits = useMemo(() => {
    const byCase = new Map<string, Map<string, CreditsVM>>();
    const bySet = new Map<string, { name?: string; byRun: Map<string, CreditsVM> }>();
    for (const row of rows) {
      for (const [runId, result] of row.byRun) {
        if (!result.credits) continue;
        const caseCredits = byCase.get(row.caseKey) ?? new Map<string, CreditsVM>();
        byCase.set(row.caseKey, caseCredits);
        if (caseCredits.has(runId)) continue;
        caseCredits.set(runId, result.credits);
        const setKey = row.testSet?.toLowerCase() ?? '';
        const set = bySet.get(setKey) ?? { name: row.testSet, byRun: new Map<string, CreditsVM>() };
        bySet.set(setKey, set);
        const subtotal = set.byRun.get(runId);
        set.byRun.set(runId, subtotal ? sumCredits([subtotal, result.credits])! : result.credits);
      }
    }
    return { byCase, bySet };
  }, [rows]);
  const showCredits = credits.byCase.size > 0;
  const creditsAmount = (value: CreditsVM, scope: string) => (
    <Tooltip content={`${scope}: ${creditsBreakdown(value)}`} relationship="description" withArrow>
      <span className={styles.creditsAmount}>
        <CoinStackRegular className={styles.creditsIcon} aria-hidden />
        {formatCredits(creditsTotal(value))}
      </span>
    </Tooltip>
  );

  const counts = useMemo(() => {
    const value = { attention: 0, changed: 0, regressed: 0, improved: 0 };
    const add = (classification: string) => {
      if (classification !== 'unchanged') value.changed += 1;
      if (classification === 'regressed') value.regressed += 1;
      if (classification === 'improved') value.improved += 1;
    };
    for (const row of rows) {
      if ([...row.byRun.values()].some((result) => attentionByResult.has(result.id))) value.attention += 1;
      add(classifyRow(row, selectedRuns));
    }
    for (const row of kitRows) {
      if (kitRowNeedsAttention(row, selectedRuns)) value.attention += 1;
      add(classifyRunStatuses(kitRowStatuses(row, selectedRuns)));
    }
    return value;
  }, [rows, kitRows, selectedRuns, attentionByResult]);

  const visibleKitRows = useMemo<KitTestRow[]>(() => {
    if (filter === 'all') return kitRows;
    if (filter === 'attention') return kitRows.filter((row) => kitRowNeedsAttention(row, selectedRuns));
    return kitRows.filter((row) => {
      const classification = classifyRunStatuses(kitRowStatuses(row, selectedRuns));
      return filter === 'changed' ? classification !== 'unchanged' : classification === filter;
    });
  }, [filter, kitRows, selectedRuns]);

  const visible = useMemo(() => {
    if (filter === 'all') return rows;
    if (filter === 'attention') {
      const regressed = (row: ComparisonRow) =>
        [...row.byRun.values()].some((result) => attentionByResult.get(result.id)?.finding === 'Regressed');
      return rows
        .filter((row) => [...row.byRun.values()].some((result) => attentionByResult.has(result.id)))
        .sort((a, b) => Number(regressed(b)) - Number(regressed(a)));
    }
    return rows.filter((row) => filter === 'changed'
      ? classifyRow(row, selectedRuns) !== 'unchanged'
      : classifyRow(row, selectedRuns) === filter);
  }, [filter, rows, selectedRuns, attentionByResult]);
  const testSetGroups = useMemo(() => groupComparisonRows(visible), [visible]);

  const handleExport = async () => {
    setExporting(true);
    setExportError(undefined);
    try {
      // Lazy-load so jsPDF is only downloaded when someone exports.
      const { exportComparison } = await import('../services/comparison-export');
      const creditCells = (byRun: Map<string, CreditsVM>) => selectedRuns.map((run) => {
        const value = byRun.get(run.id);
        return { text: value ? formatCredits(creditsTotal(value)) : '-' };
      });
      const resultRows = groupComparisonRows(rows).flatMap((set) => set.questions).flatMap((caseRows): ComparisonExportRow[] => {
        const mapped = caseRows.map((row): ComparisonExportRow => ({
          testSet: row.testSet,
          caseKey: row.caseKey,
          questions: row.questions.length > 0 ? row.questions : row.question ? [row.question] : [],
          metric: row.metric,
          grader: row.grader,
          cells: selectedRuns.map((run) => {
            const result = row.byRun.get(run.id);
            const attention = result && attentionByResult.get(result.id);
            return {
              status: result?.status,
              finding: attention
                ? attention.transition.startsWith('No prior result')
                  ? 'No prior result'
                  : `${attention.finding}: ${attention.transition}`
                : undefined,
            };
          }),
        }));
        const caseCredits = credits.byCase.get(caseRows[0].caseKey);
        return caseCredits
          ? [...mapped, { ...mapped[0], metric: 'Copilot Credits', grader: undefined, cells: creditCells(caseCredits) }]
          : mapped;
      });
      // Export groups rows by test set, so each subtotal lands after its set's test cases.
      const subtotalRows = [...credits.bySet].map(([key, set]): ComparisonExportRow => ({
        testSet: set.name,
        caseKey: `credits-subtotal:${key}`,
        questions: ['Test set subtotal'],
        metric: 'Copilot Credits',
        cells: creditCells(set.byRun),
      }));
      await exportComparison({
        agentName,
        runs: selectedRuns.map((run) => ({ run, model: modelFor(run) })),
        recommendation: recommendationRequest.state === 'ready' && recommendationQuery.data && !recommendationQuery.isError
          ? recommendationReport(recommendationRequest, recommendationQuery.data)
          : undefined,
        results: results.filter((result) => selectedRuns.some((run) => run.id.toLowerCase() === result.runId?.toLowerCase())),
        rows: [
          ...resultRows,
          ...subtotalRows,
          ...groupKitRowsBySet(kitRows).flatMap((group) => group.rows.flatMap((row): ComparisonExportRow[] => [
            {
              testSet: `${group.name} (Kit)`,
              caseKey: `kit:${row.key}`,
              questions: [row.multiTurn ? `Multi-turn: ${row.testName || row.utterance.split('\n')[0]}` : row.utterance],
              metric: row.metric,
              cells: kitRowStatuses(row, selectedRuns).map((status) => ({ status })),
            },
            ...(row.turns ?? []).map((turn): ComparisonExportRow => ({
              testSet: `${group.name} (Kit)`,
              caseKey: `kit:${row.key}:turn:${turn.key}`,
              questions: [turn.utterance],
              metric: turn.metric,
              cells: selectedRuns.map((run) => {
                const result = turn.byRun.get(run.kit?.testRunId?.toLowerCase() ?? '');
                return result?.code !== undefined
                  ? { status: kitResultStatus(result.code) }
                  : { text: result ? 'Not recorded (current test definition)' : 'Not run' };
              }),
            })),
          ])),
        ],
      });
    } catch (cause) {
      setExportError(cause instanceof Error ? `Export failed: ${cause.message}` : 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(_, data) => !data.open && onClose()}>
      <DialogSurface className={styles.surface}>
        <DialogBody className={styles.body}>
          <DialogTitle
            className={styles.title}
            action={
              <Button
                appearance="subtle"
                icon={<Dismiss20Regular />}
                aria-label="Close"
                onClick={onClose}
              />
            }
          >
            {agentName?.trim() ? (
              <Tooltip content={`Compare model runs: ${agentName.trim()}`} relationship="description" withArrow>
                <span className={styles.titleText} tabIndex={0}>Compare model runs: {agentName.trim()}</span>
              </Tooltip>
            ) : 'Compare model runs'}
          </DialogTitle>
          <DialogContent className={styles.content}>
            <Field
              className={styles.selector}
              hint="Select up to three completed runs. Results are shown oldest to newest."
            >
              <Dropdown
                aria-label="Runs to compare"
                multiselect
                inlinePopup
                placeholder="Select completed runs"
                disabled={comparableRuns.length === 0}
                selectedOptions={selectedIds}
                value={selectedRuns.map(modelFor).join(', ')}
                onOptionSelect={(_, data) => {
                  const next = data.selectedOptions;
                  if (next.length > 0 && next.length <= 3) {
                    setSelectedIds(next);
                    setBaselineNote(undefined);
                    setFilter('all');
                  }
                }}
              >
                {comparableRuns.map((run) => (
                  <Option
                    key={run.id}
                    value={run.id}
                    text={runLabel(run)}
                    disabled={selectedIds.length >= 3 && !selectedIds.includes(run.id)}
                  >
                    <span className={styles.runOption}>
                      <span>{modelFor(run)}</span>
                      <time dateTime={run.completedOn ?? run.startedOn} className={styles.runTime}>
                        <Caption1>{formatWhen(run.completedOn ?? run.startedOn)}</Caption1>
                      </time>
                    </span>
                  </Option>
                ))}
              </Dropdown>
            </Field>
            {baselineNote && (
              <MessageBar intent="warning" layout="multiline" className={styles.baselineNote}>
                <MessageBarBody>{baselineNote}</MessageBarBody>
              </MessageBar>
            )}

            {selectedRuns.length === 0 ? (
              <Body1 role="status" className={styles.emptyState}>
                No completed runs with saved results are available for comparison.
              </Body1>
            ) : (
              <>
                <TabList
                  className={styles.tabs}
                  aria-label="Model run comparison sections"
                  selectedValue={activeTab}
                  onTabSelect={(_, data) => {
                    if (typeof data.value === 'string') setActiveTab(data.value);
                  }}
                >
                  <Tab id={`${tabId}-summary-tab`} aria-controls={`${tabId}-summary-panel`} value="summary">
                    Summary
                  </Tab>
                  <Tab id={`${tabId}-cases-tab`} aria-controls={`${tabId}-cases-panel`} value="cases">
                    Test runs
                  </Tab>
                </TabList>

                <div
                  id={`${tabId}-summary-panel`}
                  role="tabpanel"
                  aria-labelledby={`${tabId}-summary-tab`}
                  hidden={activeTab !== 'summary'}
                  tabIndex={0}
                  className={mergeClasses(styles.panel, activeTab !== 'summary' && styles.hiddenPanel)}
                >
                  <div className={styles.runCards}>
                    {selectedRuns.map((run) => (
                      <Card key={run.id} className={styles.runCard} appearance="filled-alternative">
                        <CardHeader
                          header={
                            <div className={styles.modelHeading}>
                              <Subtitle2 className={styles.model}>{modelFor(run)}</Subtitle2>
                              <time
                                dateTime={run.completedOn ?? run.startedOn}
                                className={styles.runTime}
                              >
                                <Caption1>{formatWhen(run.completedOn ?? run.startedOn)}</Caption1>
                              </time>
                            </div>
                          }
                        />
                        <div className={styles.cardBody}>
                          <div className={styles.statuses}>
                            <StatusBadge tone={runTone(runDisplayStatus(run))} label={runDisplayStatus(run)} />
                            <StatusBadge
                              tone={regressionTone(run.regression)}
                              label={run.regression}
                            />
                          </div>
                          <Caption1 className={styles.meta}>
                            {run.pass} pass · {run.fail} fail · {run.error} error · {run.excluded} excluded
                          </Caption1>
                          {run.kit && run.kit.total > 0 && (
                            <Caption1 className={styles.meta}>
                              {run.kit.regressed} regressed · {run.kit.improved} improved
                            </Caption1>
                          )}
                          {run.credits ? (
                            <div className={styles.credits}>
                              <CoinStackRegular className={styles.creditsIcon} aria-hidden />
                              <div className={styles.creditsText}>
                                <Caption1Strong>{creditsLabel(run.credits)}</Caption1Strong>
                                <Caption1 className={styles.meta}>{creditsBreakdown(run.credits)}</Caption1>
                              </div>
                            </div>
                          ) : harness && (
                            <Caption1 className={styles.meta}>{CREDITS_NOT_REPORTED}</Caption1>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>

                  <Subtitle2>AI summary</Subtitle2>
                  <ModelRecommendation request={recommendationRequest} />
                  <div className={styles.aiCards}>
                    {selectedRuns.map((run) => (
                      <Card key={run.id} className={mergeClasses(styles.runCard, styles.aiCard)} appearance="filled-alternative">
                        <CardHeader
                          header={<Subtitle2 className={styles.model}>{modelFor(run)}</Subtitle2>}
                        />
                        <div className={styles.aiBody}>
                          {run.ai?.trim() ? (
                            <AssessmentAnalysis
                              text={run.ai}
                              results={results.filter((result) => result.runId?.toLowerCase() === run.id.toLowerCase())}
                            />
                          ) : (
                            <Body1 className={styles.muted}>
                              {`Analysis ${run.analysisStatus.toLowerCase()}.`}
                            </Body1>
                          )}
                          {/* Kit-only runs store the same text in both summaries; show it once. */}
                          {run.kit?.summary?.trim() && run.kit.summary.trim() !== run.ai?.trim() && (
                            <div className={styles.kitSummary}>
                              <Body1Strong>Copilot Agent Kit tests</Body1Strong>
                              <AssessmentAnalysis text={run.kit.summary} results={[]} />
                            </div>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>

                <div
                  id={`${tabId}-cases-panel`}
                  role="tabpanel"
                  aria-labelledby={`${tabId}-cases-tab`}
                  hidden={activeTab !== 'cases'}
                  tabIndex={0}
                  className={mergeClasses(styles.panel, styles.casesPanel, activeTab !== 'cases' && styles.hiddenPanel)}
                >
                  <div className={styles.filters} role="group" aria-label="Comparison result filter">
                    <ToggleButton
                      size="small"
                      shape="circular"
                      isAccessible
                      checked={filter === 'all'}
                      onClick={() => setFilter('all')}
                    >
                      All {rows.length + kitRows.length}
                    </ToggleButton>
                    <ToggleButton
                      size="small"
                      shape="circular"
                      isAccessible
                      checked={filter === 'attention'}
                      onClick={() => setFilter('attention')}
                    >
                      Needs attention {counts.attention}
                    </ToggleButton>
                    {counts.changed > 0 && (
                      <ToggleButton
                        size="small"
                        shape="circular"
                        isAccessible
                        checked={filter === 'changed'}
                        onClick={() => setFilter('changed')}
                      >
                        Changed {counts.changed}
                      </ToggleButton>
                    )}
                    {counts.regressed > 0 && (
                      <ToggleButton
                        size="small"
                        shape="circular"
                        isAccessible
                        checked={filter === 'regressed'}
                        onClick={() => setFilter('regressed')}
                      >
                        Regressed {counts.regressed}
                      </ToggleButton>
                    )}
                    {counts.improved > 0 && (
                      <ToggleButton
                        size="small"
                        shape="circular"
                        isAccessible
                        checked={filter === 'improved'}
                        onClick={() => setFilter('improved')}
                      >
                        Improved {counts.improved}
                      </ToggleButton>
                    )}
                    <AssessmentInfo
                      content="Needs attention includes failed or error results. Findings use each run's saved baseline; change filters compare the selected runs."
                    />
                  </div>

                  <Card className={styles.tableCard} appearance="outline">
                    <div
                      className={styles.scroll}
                      tabIndex={0}
                      role="region"
                      aria-label="Scrollable multi-run comparison table"
                    >
                      <Table size="small" aria-labelledby={`${tabId}-cases-tab`}
                        style={{ minWidth: 240 + 220 + selectedRuns.length * 140 }}>
                        <TableHeader className={styles.columnHeaders}>
                          <TableRow>
                            <TableHeaderCell className={mergeClasses(styles.caseCell, styles.cell)}>Test case</TableHeaderCell>
                            <TableHeaderCell className={mergeClasses(styles.metricCell, styles.cell)}>Metric</TableHeaderCell>
                            {selectedRuns.map((run) => {
                              return (
                                <TableHeaderCell key={run.id} className={mergeClasses(styles.runCell, styles.cell)}>
                                  {modelFor(run)}
                                </TableHeaderCell>
                              );
                            })}
                          </TableRow>
                        </TableHeader>
                        {testSetGroups.map((set) => {
                          const setId = `${tabId}-set-${encodeURIComponent(set.key)}`;
                          const collapsed = collapsedSets.has(set.key);
                          return (
                          <Fragment key={set.key}>
                            <TableBody data-test-set-heading>
                              <TableRow>
                                <TableCell colSpan={showCredits ? 2 : selectedRuns.length + 2} className={styles.setHeading}>
                                  <div className={styles.setControls}>
                                    <Button
                                      appearance="subtle"
                                      size="small"
                                      className={styles.setToggle}
                                      icon={collapsed ? <ChevronRight20Regular /> : <ChevronDown20Regular />}
                                      aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${set.name}`}
                                      aria-expanded={!collapsed}
                                      aria-controls={set.questions.map((_, index) => `${setId}-question-${index}`).join(' ')}
                                      onClick={() => setCollapsedSets((current) => {
                                        const next = new Set(current);
                                        if (next.has(set.key)) next.delete(set.key);
                                        else next.add(set.key);
                                        return next;
                                      })}
                                    />
                                    <Body1Strong id={setId} className={styles.testSetName}>{set.name}</Body1Strong>
                                  </div>
                                </TableCell>
                                {showCredits && selectedRuns.map((run) => {
                                  const subtotal = credits.bySet.get(set.key)?.byRun.get(run.id);
                                  return (
                                    <TableCell key={run.id} className={mergeClasses(styles.setHeading, styles.runCell)}>
                                      {subtotal && (
                                        <Caption1 className={styles.creditsAmount}>
                                          <span className={styles.creditsSubtotal}>Subtotal</span>
                                          {creditsAmount(subtotal, `${set.name} subtotal`)}
                                        </Caption1>
                                      )}
                                    </TableCell>
                                  );
                                })}
                              </TableRow>
                            </TableBody>
                            {set.questions.map((group, index) => {
                              const turns = group.find((item) => item.questions.length > 0)?.questions
                                ?? [group.find((item) => item.question)?.question || ''];
                              const multiTurn = group[0].multiTurn;
                              const caseCredits = credits.byCase.get(group[0].caseKey);
                              // A conversation is scored once, so each turn gets its own row and the
                              // metric/result cells span them; the last cell of the shorter column fills the rest.
                              // Harness cases end with one Copilot Credits row.
                              const creditLine = caseCredits ? 1 : 0;
                              const lines = Math.max(turns.length, group.length + creditLine);
                              const metricLines = lines - creditLine;
                              const span = (count: number, total: number, line: number) =>
                                (line === count - 1 ? total - count + 1 : 1);
                              return (
                              <TableBody
                                key={group[0].caseKey}
                                id={`${setId}-question-${index}`}
                                hidden={collapsed}
                                data-question-group
                                aria-labelledby={setId}
                                className={mergeClasses(styles.questionGroup, collapsed && styles.hiddenPanel)}
                              >
                                {Array.from({ length: lines }, (_, line) => {
                                  const row = group[line];
                                  return (
                                  <TableRow
                                    key={row?.key ?? `${group[0].caseKey}-turn-${line}`}
                                    className={multiTurn && line < lines - 1 ? styles.innerTurnRow : undefined}
                                  >
                                    {line < turns.length && (
                                      <TableHeaderCell
                                        className={mergeClasses(
                                          styles.caseCell,
                                          styles.cell,
                                          multiTurn && styles.turnCell,
                                          multiTurn && line === 0 && styles.firstTurn,
                                          multiTurn && line === turns.length - 1 && styles.lastTurn,
                                        )}
                                        button={multiTurn ? { className: styles.turnButton } : undefined}
                                        rowSpan={span(turns.length, lines, line)}
                                        scope={multiTurn ? 'row' : 'rowgroup'}
                                      >
                                        <div className={styles.question}>
                                          <Body1 className={styles.question}>
                                            {turns[line]}
                                            {multiTurn && line === 0 && <> <ConversationLabel /></>}
                                          </Body1>
                                        </div>
                                      </TableHeaderCell>
                                    )}
                                    {row && (
                                    <>
                                    <TableCell
                                      className={mergeClasses(styles.metricCell, styles.cell, styles.muted)}
                                      rowSpan={span(group.length, metricLines, line)}
                                    >
                                      {metricDisplayName(row.metric, row.grader)}
                                    </TableCell>
                                    {selectedRuns.map((run) => {
                                      const result = row.byRun.get(run.id);
                                      const attention = result && attentionByResult.get(result.id);
                                      return (
                                        <TableCell key={run.id} className={mergeClasses(styles.runCell, styles.cell)} rowSpan={span(group.length, metricLines, line)}>
                                          {result ? (
                                            <div className={styles.result}>
                                              <StatusBadge
                                                tone={resultTone(result.status)}
                                                label={result.status}
                                              />
                                              {attention && (
                                                <Tooltip content="Compared with this run's saved baseline" relationship="description" withArrow>
                                                  <Caption1 className={styles.finding}>
                                                    {attention.transition.startsWith('No prior result')
                                                      ? 'No prior result'
                                                      : `${attention.finding}: ${attention.transition}`}
                                                  </Caption1>
                                                </Tooltip>
                                              )}
                                            </div>
                                          ) : (
                                            <span className={styles.muted}>Not run</span>
                                          )}
                                        </TableCell>
                                      );
                                    })}
                                    </>
                                    )}
                                    {caseCredits && line === lines - 1 && (
                                    <>
                                    <TableCell className={mergeClasses(styles.metricCell, styles.cell, styles.muted)}>
                                      Copilot Credits
                                    </TableCell>
                                    {selectedRuns.map((run) => {
                                      const value = caseCredits.get(run.id);
                                      return (
                                        <TableCell key={run.id} className={mergeClasses(styles.runCell, styles.cell)}>
                                          {value
                                            ? creditsAmount(value, 'This test case')
                                            : <span className={styles.muted}>—</span>}
                                        </TableCell>
                                      );
                                    })}
                                    </>
                                    )}
                                  </TableRow>
                                  );
                                })}
                              </TableBody>
                              );
                            })}
                          </Fragment>
                          );
                        })}
                        <KitTestGroup
                          runs={selectedRuns}
                          kit={kit}
                          rows={visibleKitRows}
                          filtered={filter !== 'all'}
                          classes={{
                            cell: styles.cell,
                            caseCell: styles.caseCell,
                            metricCell: styles.metricCell,
                            runCell: styles.runCell,
                            setHeading: styles.setHeading,
                            setControls: styles.setControls,
                            setToggle: styles.setToggle,
                            muted: styles.muted,
                            questionGroup: styles.questionGroup,
                            hidden: styles.hiddenPanel,
                          }}
                        />
                      </Table>
                      {visible.length === 0 && visibleKitRows.length === 0
                        && !(kit.hasKit && (filter === 'all' || kit.query.isLoading || kit.query.isError)) && (
                        <Body1 role="status">
                          {filter === 'attention'
                            ? 'No failed or error results in the selected runs.'
                            : 'No test cases match this filter.'}
                        </Body1>
                      )}
                    </div>
                  </Card>
                </div>
              </>
            )}
          </DialogContent>
          <DialogActions className={styles.actions}>
            {exportError && (
              <Caption1 role="alert" className={styles.exportError}>{exportError}</Caption1>
            )}
            <Button
              appearance="primary"
              className={styles.actionButton}
              icon={exporting ? <Spinner size="tiny" /> : undefined}
              disabled={selectedRuns.length === 0 || exporting}
              onClick={() => void handleExport()}
            >
              {exporting ? 'Exporting' : 'Export to PDF'}
            </Button>
            <Button appearance="secondary" className={styles.actionButton} onClick={onClose}>
              Close
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

/** Compare one to three completed model-evaluation runs for a single agent. */
export function CompareDialog(props: CompareDialogProps) {
  if (!props.open) return null;
  return (
    <CompareDialogContent
      key={props.initialRunId ?? 'latest'}
      onClose={props.onClose}
      runs={props.runs}
      history={props.history}
      results={props.results}
      initialRunId={props.initialRunId}
      agentName={props.agentName}
      harness={props.harness}
    />
  );
}
