import { useEffect, useState, type ReactNode } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  MessageBarActions,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  ProgressBar,
  Spinner,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import {
  BeakerRegular,
  CheckmarkCircleRegular,
  DataUsageRegular,
  Dismiss20Regular,
  DismissCircleFilled,
  DocumentCheckmarkRegular,
  SparkleRegular,
  WarningRegular,
} from '@fluentui/react-icons';
import { StatusBadge } from './StatusBadge';
import { StepList, type StepItem } from './StepList';
import { stepProgress, type StepState } from '../contracts/step-progress';
import { evaluationProgress } from '../contracts/evaluation-progress';
import {
  friendlyRunMessage,
  isRunInProgress,
  isSkippedConcurrentRun,
  NO_MODEL_CHANGED_LABEL,
  runDisplayStatus,
  runNotice,
  SKIPPED_RUN_EXPLANATION,
  STOPPED_AFTER_DETECT,
  type EvaluationRunVM,
  type RunNotice,
  type TrackedAgentVM,
} from '../contracts/model-assessment';
import { useAssessmentCheck } from '../hooks/useAssessmentCheck';
import { useKitProgress } from '../hooks/useKitTests';
import { kitAssessmentSteps } from '../contracts/kit-results';
import { creditsBreakdown, creditsLabel } from '../contracts/credits';

const useStyles = makeStyles({
  card: {
    marginTop: tokens.spacingVerticalM,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    padding: `${tokens.spacingVerticalXL} ${tokens.spacingHorizontalXL}`,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusXLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow4,
  },
  titleRow: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS },
  titleIcon: { flexShrink: 0, fontSize: '24px', color: tokens.colorBrandForeground1 },
  titleIconError: { color: tokens.colorPaletteRedForeground1 },
  titleIconWarning: { color: tokens.colorStatusWarningForeground1 },
  title: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: tokens.fontSizeBase500,
    lineHeight: tokens.lineHeightBase500,
    fontWeight: tokens.fontWeightSemibold,
  },
  progressRow: { display: 'flex', alignItems: 'center', gap: '10px' },
  progressBar: { flex: 1 },
  percent: {
    flexShrink: 0,
    minWidth: '36px',
    textAlign: 'right',
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground2,
  },
  footer: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  footerText: { fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground2 },
  root: { display: 'flex', flexDirection: 'column', minHeight: '100%' },
  action: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  standaloneAction: {
    position: 'sticky',
    bottom: 0,
    marginTop: 'auto',
    padding: `${tokens.spacingVerticalM} 0 ${tokens.spacingVerticalL}`,
    backgroundColor: tokens.colorNeutralBackground1,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  spaced: { marginTop: tokens.spacingVerticalS },
  notice: { marginTop: tokens.spacingVerticalL, marginBottom: tokens.spacingVerticalL },
  buttons: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
  actionButton: { minHeight: '44px' },
  confirmationButton: { whiteSpace: 'nowrap', flexShrink: 0 },
  iconButton: { minHeight: '44px', minWidth: '44px' },
  detail: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  announcement: {
    position: 'absolute', width: '1px', height: '1px', padding: 0,
    margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap', border: 0,
  },
});

const norm = (s: string | undefined) => (s ?? '').toLowerCase().replace(/[^a-z]/g, '');

const STEP_DEFS = [
  { title: 'Initializing', desc: "Starting the assessment and reading the agent's current model" },
  {
    title: 'Running evaluations',
    desc: 'Discovering MODELCHECK test sets and executing test cases',
  },
  { title: 'Scoring results', desc: 'Computing pass / fail / error and the regression verdict' },
  {
    title: 'Generating AI analysis',
    desc: 'Generating a plain-language summary of the result',
  },
];

const KIT_STEP_DEFS = [
  STEP_DEFS[0],
  { title: 'Running Kit tests', desc: 'Sending each Kit test utterance to the published agent' },
  { title: 'Scoring results', desc: 'Comparing with the previous Kit run for regressions' },
  { title: 'Generating AI analysis', desc: 'Generating a plain-language summary of the Kit results' },
];

/**
 * Share of the progress bar each step moves. Timed evaluation runs spend nearly
 * all their time evaluating test sets and writing the results; scoring and the
 * AI analysis take seconds.
 */
const STEP_WEIGHTS = [5, 90, 2, 3];
const KIT_STEP_WEIGHTS = [10, 70, 5, 15];
const COMPLETE_STEP = 'Complete';
const STEP_ICONS = [DataUsageRegular, BeakerRegular, DocumentCheckmarkRegular, SparkleRegular];

/** How long "Scoring results" stays active after the evaluations finish. */
const SCORING_HOLD_MS = 1500;

/** Current time, refreshed every second while `active`. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

const TOOLTIP_TEXT = 'Runs MODELCHECK evaluations';
const KIT_TOOLTIP_TEXT = 'Runs the Kit test set';

/** Why a run failed, stopped or didn't start, in the format the assessment flows' messages use. */
function RunNoticeBar({ notice, className, action }: { notice: RunNotice; className?: string; action?: ReactNode }) {
  return (
    <MessageBar intent={notice.intent} layout="multiline" className={className}>
      <MessageBarBody>
        <MessageBarTitle>{notice.title}</MessageBarTitle>
        {notice.message}
      </MessageBarBody>
      {action && <MessageBarActions>{action}</MessageBarActions>}
    </MessageBar>
  );
}

function computeSteps(run: EvaluationRunVM | undefined, active: boolean): StepState[] {
  const s = norm(run?.status) || (active ? 'requested' : '');
  const a = norm(run?.analysisStatus);
  const detecting = ['', 'requested', 'detecting'].includes(s);
  const evaluating = ['evaluationrunning', 'running'].includes(s);
  const completed = ['completed', 'completedwitherrors'].includes(s);

  // Detection is the first thing to resolve. Any status past detecting means
  // step 1 is done.
  const step1: StepState = detecting ? 'active' : 'done';

  // No-change and every error terminal end the pipeline right after detection —
  // nothing downstream ran, so mark those steps skipped rather than leaving one
  // spinning forever.
  if (STOPPED_AFTER_DETECT.has(s)) {
    return ['done', 'skipped', 'skipped', 'skipped'];
  }

  const step2: StepState = completed ? 'done' : evaluating ? 'active' : 'pending';
  const step3: StepState = completed ? 'done' : 'pending';

  // Analysis runs after scoring. Once the run is terminal-success the analysis
  // phase is over regardless of its outcome (completed / failed / skipped /
  // not requested) — only keep spinning while it is genuinely still pending.
  let step4: StepState = 'pending';
  if (completed) {
    step4 = a === '' || a === 'pending' ? 'active' : 'done';
  }
  return [step1, step2, step3, step4];
}

/**
 * Content around the progress card; a function receives whether a check is
 * running, whether the progress card is shown and whether its run has finished.
 */
export type PanelSlot = ReactNode | ((busy: boolean, progressShown: boolean, finished: boolean) => ReactNode);

export interface CheckModelPanelProps {
  agent: TrackedAgentVM;
  /** The agent's latest run; a failure is shown until a new assessment starts. */
  lastRun?: EvaluationRunVM;
  onRunChanged?: () => void;
  /** The agent is assessed with Copilot Agent Kit tests instead of Copilot evaluations. */
  kitMode?: boolean;
  /** Why an assessment cannot start yet (for example, the Kit setup is incomplete). */
  blockedReason?: string;
  /** Rendered above the progress card (the engine selector). */
  settings?: PanelSlot;
  /** Rendered after the progress card (the model switch guide and history). */
  children?: PanelSlot;
  /** Rendered just above the button (the model picker); receives whether a check is running. */
  beforeAction?: ReactNode | ((busy: boolean) => ReactNode);
  actionLabel?: string;
  /** Longer description shown in a tooltip and used as the button's accessible name. */
  actionTooltip?: string;
  /**
   * Runs before an assessment starts. Returning a message shows it instead of
   * starting (for example, when the model has not changed yet).
   */
  beforeStart?: () => Promise<string | undefined>;
  /** Shows a Cancel button next to the action that closes the panel. */
  onCancel?: () => void;
  /** How long a test case takes for this agent, to estimate progress within a running test set. */
  msPerTestCase?: number;
  /** Places the assessment content and its stateful actions in separate layout regions. */
  renderLayout?: (content: ReactNode, actions: ReactNode) => ReactNode;
}

/**
 * Drives a real cat_evaluationrun: creates the row in Requested state (which
 * fires the "Model Assessment | Run Copilot Studio Evaluations" flow) and polls
 * the run by its request key, surfacing the live status, verdict and counts as
 * they are written back — establish a baseline or assess a model change, then
 * score. When a flow fails it writes why onto the run, and that is shown here.
 */
export function CheckModelPanel({
  agent,
  lastRun,
  onRunChanged,
  kitMode = false,
  blockedReason,
  settings,
  children,
  beforeAction,
  actionLabel = 'Run',
  actionTooltip,
  beforeStart,
  onCancel,
  msPerTestCase,
  renderLayout,
}: CheckModelPanelProps) {
  const styles = useStyles();
  const {
    phase, run, error, notice: startNotice, joined, requestKey, start, follow, resume, cancel,
  } = useAssessmentCheck(agent, onRunChanged, kitMode);
  // Runs keep their own engine: a Kit track means Kit tests, evaluation counts
  // without one mean Copilot evaluations; otherwise follow the selected engine.
  const kitRun = Boolean(run?.kit)
    || (kitMode && (run?.pass ?? 0) + (run?.fail ?? 0) + (run?.error ?? 0) + (run?.excluded ?? 0) === 0);
  const kitProgress = useKitProgress(kitRun ? run?.kit : undefined);
  const disabled = ['deleted', 'accessdenied'].includes(norm(agent.sourceStatus));

  const busy = phase === 'requesting' || phase === 'tracking';
  const [verifying, setVerifying] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [modelNotice, setModelNotice] = useState<{
    message: string;
    liveModel?: string;
    currentModel?: string;
  }>();
  if (modelNotice && (modelNotice.liveModel !== agent.liveModel || modelNotice.currentModel !== agent.currentModel)) {
    setModelNotice(undefined);
  }
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const notStarted = phase === 'not-started';
  // The request was refused or a flow never picked it up: the card shows nothing ran.
  const didNotStart = notStarted || (phase === 'error' && Boolean(startNotice));
  const inProgress = Boolean(requestKey) && ['tracking', 'stalled', 'not-started', 'poll-error'].includes(phase);
  // An assessment started earlier (before a reload, or by another member) shows its progress.
  const lastRunActive = isRunInProgress(lastRun?.status);
  useEffect(() => {
    if (lastRunActive) void follow();
  }, [lastRunActive, follow]);

  const handleCancelRun = async () => {
    setCancelling(true);
    const message = await cancel();
    setCancelling(false);
    setConfirmCancel(false);
    setNotice(message);
  };

  const handleStart = async () => {
    setNotice(undefined);
    setModelNotice(undefined);
    if (beforeStart) {
      setVerifying(true);
      let message: string | undefined;
      try {
        message = await beforeStart();
      } finally {
        setVerifying(false);
      }
      if (message) {
        setModelNotice({ message, liveModel: agent.liveModel, currentModel: agent.currentModel });
        return;
      }
    }
    await start();
  };
  const isSkipped = isSkippedConcurrentRun(run);
  const isNoChange = run ? norm(run.status) === 'nochange' || isSkipped : false;
  const statusLabel = run ? runDisplayStatus(run) : undefined;
  const failure = runNotice(run);
  // Any other message the flow wrote (none is expected) is still shown.
  const otherMessage = !failure && !isSkipped ? friendlyRunMessage(run?.errorMessage) : undefined;
  // After a reload nothing is followed yet; show why the latest run failed.
  const lastFailure = phase === 'idle' ? runNotice(lastRun, true) : undefined;
  const detectingDone = run
    ? !['', 'requested', 'detecting'].includes(norm(run.status))
    : false;

  const steps = kitRun ? kitAssessmentSteps(run, busy) : computeSteps(run, busy);
  const stepDefs = kitRun ? KIT_STEP_DEFS : STEP_DEFS;
  // A request that didn't start has not run any step.
  const shownSteps: StepState[] = didNotStart ? steps.map(() => 'pending') : [...steps];

  // A finished, clean run stays until the panel closes; when the panel opens on
  // one that already finished, Model history covers it.
  const runKey = run?.id ?? run?.name;
  const autoHide = phase === 'terminal' && Boolean(runKey) && !failure && !otherMessage
    && norm(run?.status) !== 'noevaluationsconfigured';
  const [watched, setWatched] = useState(false);
  if ((busy || inProgress) && !watched) setWatched(true);
  // Scoring finishes in the same update as the evaluations, so while a run is
  // watched, hold it as active briefly to make the step visible.
  const scoringDone = steps[2] === 'done';
  const [prevScoringDone, setPrevScoringDone] = useState(scoringDone);
  const [scoringHeld, setScoringHeld] = useState(false);
  if (scoringDone !== prevScoringDone) {
    setPrevScoringDone(scoringDone);
    setScoringHeld(scoringDone && watched);
  }
  useEffect(() => {
    if (!scoringHeld) return;
    const timer = setTimeout(() => setScoringHeld(false), SCORING_HOLD_MS);
    return () => clearTimeout(timer);
  }, [scoringHeld]);
  if (scoringHeld) {
    shownSteps[2] = 'active';
    shownSteps[3] = 'pending';
  }
  const cancelled = norm(run?.status) === 'cancelled';
  const kitFraction = kitRun && kitProgress && kitProgress.total > 0 ? kitProgress.done / kitProgress.total : 0;
  // Copilot Studio evaluations report each test set as it starts.
  const evaluationsRunning = !kitRun && shownSteps[1] === 'active' && Boolean(run?.progress);
  const now = useNow(evaluationsRunning);
  const evaluation = evaluationsRunning && run?.progress ? evaluationProgress(run.progress, now, msPerTestCase) : undefined;
  // A stopped run keeps the bar where it stopped instead of filling it.
  const progressSteps = failure || cancelled
    ? shownSteps.map((state): StepState => (state === 'skipped' ? 'pending' : state))
    : shownSteps;
  const activeFraction = kitRun ? kitFraction : evaluation?.fraction ?? 0;
  const progress = stepProgress(
    progressSteps,
    progressSteps[1] === 'active' ? activeFraction : 0,
    kitRun ? KIT_STEP_WEIGHTS : STEP_WEIGHTS,
  );
  const percent = Math.round(progress * 100);

  const settled = phase === 'terminal' && shownSteps.every((state) => state === 'done' || state === 'skipped');
  const stepItems: StepItem[] = stepDefs.map((def, i) => ({
    ...def,
    state: shownSteps[i],
    // Kit runs report per-test progress and evaluations per test set; other steps show what they do.
    statusText: i !== 1
      ? undefined
      : kitRun && kitProgress && kitProgress.total > 0
        ? `${kitProgress.done} of ${kitProgress.total} tests`
        : evaluation?.label,
  }));
  // A failed run marks the step it stopped at; the steps after it were skipped.
  if (failure?.intent === 'error') {
    const stoppedAt = stepItems.findIndex((step) => step.state === 'active' || step.state === 'skipped');
    if (stoppedAt >= 0) stepItems[stoppedAt].state = 'error';
  }
  stepItems.push({
    title: COMPLETE_STEP,
    state: !settled ? 'pending' : failure || cancelled ? 'skipped' : 'done',
  });

  const activeIndex = shownSteps.indexOf('active');
  const TitleIcon = !settled && activeIndex >= 0 ? STEP_ICONS[activeIndex] : undefined;
  const stopIntent = failure?.intent ?? (didNotStart ? startNotice?.intent : undefined);
  const titleText = didNotStart
    ? "Assessment didn't start"
    : !settled
      ? `Assessing ${agent.name}…`
      : failure ? 'Assessment stopped' : cancelled ? 'Assessment cancelled' : 'Assessment finished';
  const titleIcon = stopIntent === 'error' ? (
    <DismissCircleFilled className={mergeClasses(styles.titleIcon, styles.titleIconError)} />
  ) : stopIntent || cancelled ? (
    <WarningRegular className={mergeClasses(styles.titleIcon, styles.titleIconWarning)} />
  ) : TitleIcon ? (
    <TitleIcon className={styles.titleIcon} />
  ) : settled ? (
    <CheckmarkCircleRegular className={styles.titleIcon} />
  ) : (
    <DataUsageRegular className={styles.titleIcon} />
  );

  const cardHidden = autoHide && !watched;
  const cardShown = !cardHidden
    && (didNotStart || ['requesting', 'tracking', 'terminal', 'stalled', 'poll-error'].includes(phase));
  const finished = phase === 'terminal';
  const slot = (content: PanelSlot) =>
    typeof content === 'function' ? content(busy, cardShown, finished) : content;

  const content = (
    <>
      <span className={styles.announcement} role="status" aria-live="polite" aria-atomic="true">
        {phase === 'terminal'
          ? `Finished. ${failure ? `${failure.title}. ${failure.message}` : statusLabel ?? ''}`
          : didNotStart ? `The assessment didn't start. ${startNotice?.title ?? ''}` : ''}
      </span>
      {lastFailure && <RunNoticeBar notice={lastFailure} className={styles.spaced} />}
      {slot(settings)}

      {norm(agent.sourceStatus) === 'accessdenied' && (
        <div className={styles.spaced}>
          <StatusBadge tone="warning" label="Connection lacks permission to this agent" />
        </div>
      )}

      {phase === 'poll-error' && (
        <MessageBar intent="error">
          <MessageBarBody>
            Could not update the assessment status. {error} The assessment may still be running.
          </MessageBarBody>
          <MessageBarActions>
            <Button onClick={resume}>Retry</Button>
          </MessageBarActions>
        </MessageBar>
      )}

      {joined && !cardHidden && (phase === 'tracking' || phase === 'terminal' || phase === 'stalled') && (
        <MessageBar intent="warning" className={styles.spaced}>
          <MessageBarBody>
            {joined.startedBy ? `${joined.startedBy} is` : 'Someone else is'} already assessing this
            agent, so a new assessment was not started. You are now seeing the progress of that
            assessment. Only one assessment can run per agent at a time.
          </MessageBarBody>
        </MessageBar>
      )}

      {cardShown && (
        <div className={styles.card}>
          <div className={styles.titleRow}>
            {titleIcon}
            <span className={styles.title} title={titleText}>{titleText}</span>
            {settled && run && statusLabel && <StatusBadge tone="neutral" label={statusLabel} />}
          </div>

          <div className={styles.progressRow}>
            <ProgressBar
              className={styles.progressBar}
              aria-label="Model assessment progress"
              aria-valuetext={`${percent}%`}
              value={progress}
              color={stopIntent === 'error' ? 'error' : stopIntent || cancelled ? 'warning' : undefined}
            />
            <span className={styles.percent}>{percent}%</span>
          </div>

          <StepList steps={stepItems} />

          {busy && (
            <span className={styles.detail}>
              You can close this panel and come back. The {kitRun ? 'tests keep' : 'assessment keeps'} running.
            </span>
          )}
          {phase === 'stalled' && (
            <span className={styles.detail}>
              The {kitRun ? 'Kit test run' : 'evaluation'} is taking longer than expected. It may still be running
              in the background.{' '}
              <Button appearance="subtle" onClick={resume}>Refresh status</Button>
            </span>
          )}

          {run && norm(run.status) === 'noevaluationsconfigured' && (
            <span className={styles.detail}>
              No active evaluation test set has MODELCHECK in its name. Add MODELCHECK to the
              test sets you want to assess in Copilot Studio, then run it again.
            </span>
          )}

          {run && !isNoChange && run.credits && (
            <span className={styles.detail}>
              {creditsLabel(run.credits)}: {creditsBreakdown(run.credits)}
            </span>
          )}

          {isNoChange && (isSkipped || detectingDone) && (
            <div className={styles.footer}>
              <StatusBadge tone="neutral" label={NO_MODEL_CHANGED_LABEL} />
              <span className={styles.footerText}>
                {isSkipped ? SKIPPED_RUN_EXPLANATION : 'The model is unchanged since the last assessment.'}
              </span>
            </div>
          )}

          {failure && <RunNoticeBar notice={failure} />}

          {otherMessage && (
            <span className={styles.detail}>
              {run?.errorCategory ? `${run.errorCategory}: ` : ''}
              {otherMessage}
            </span>
          )}
        </div>
      )}

      {didNotStart && startNotice && (
        <RunNoticeBar
          notice={startNotice}
          className={styles.notice}
          action={notStarted
            ? <Button disabled={verifying} onClick={() => void handleStart()}>Start again</Button>
            : undefined}
        />
      )}

      {slot(children)}
    </>
  );

  const actions = (
      <div className={mergeClasses(styles.action, !renderLayout && styles.standaloneAction)}>
        {typeof beforeAction === 'function' ? beforeAction(busy) : beforeAction}
        {blockedReason && <span className={styles.detail}>{blockedReason}</span>}
        {(notice || modelNotice) && (
          <MessageBar intent="warning">
            <MessageBarBody>{notice || modelNotice?.message}</MessageBarBody>
          </MessageBar>
        )}
        <div className={styles.buttons}>
          {(() => {
            const action = (
              <Button
                appearance="primary"
                className={styles.actionButton}
                disabled={disabled || busy || verifying || Boolean(blockedReason) || ['poll-error', 'stalled', 'not-started'].includes(phase)}
                onClick={() => void handleStart()}
              >
                {actionLabel}
              </Button>
            );
            // The switch-model guide already explains the action.
            const tip = busy || verifying ? undefined : actionTooltip;
            if (beforeStart && !blockedReason && !tip) return action;
            return (
              <Tooltip
                relationship={tip && !blockedReason ? 'label' : 'description'}
                content={blockedReason ?? tip ?? (kitMode ? KIT_TOOLTIP_TEXT : TOOLTIP_TEXT)}
              >
                {action}
              </Tooltip>
            );
          })()}
          {inProgress || phase === 'requesting' ? (
            <Button
              appearance="secondary"
              className={styles.actionButton}
              disabled={!inProgress}
              onClick={() => setConfirmCancel(true)}
            >
              Cancel
            </Button>
          ) : (
            onCancel && <Button appearance="secondary" className={styles.actionButton} onClick={onCancel}>Cancel</Button>
          )}
        </div>
      </div>
  );

  return (
    <>
      {renderLayout ? renderLayout(content, actions) : <div className={styles.root}>{content}{actions}</div>}
      <Dialog open={confirmCancel} onOpenChange={(_, data) => { if (!cancelling) setConfirmCancel(data.open); }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle
              action={
                <DialogTrigger action="close">
                  <Button appearance="subtle" className={styles.iconButton} aria-label="Close" icon={<Dismiss20Regular />} disabled={cancelling} />
                </DialogTrigger>
              }
            >
              Cancel this assessment?
            </DialogTitle>
            <DialogContent>
              {joined
                ? `${joined.startedBy ?? 'Someone else'} started this assessment. Cancelling stops it for everyone, and it won't be scored.`
                : "The assessment stops and won't be scored."}{' '}
              You can run it again at any time.
            </DialogContent>
            <DialogActions fluid>
              <Button
                appearance="primary"
                className={mergeClasses(styles.actionButton, styles.confirmationButton)}
                disabled={cancelling}
                icon={cancelling ? <Spinner size="tiny" /> : undefined}
                onClick={() => void handleCancelRun()}
              >
                Cancel assessment
              </Button>
              <Button
                appearance="secondary"
                className={mergeClasses(styles.actionButton, styles.confirmationButton)}
                disabled={cancelling}
                onClick={() => {
                  setConfirmCancel(false);
                  onCancel?.();
                }}
              >
                Run in background
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
