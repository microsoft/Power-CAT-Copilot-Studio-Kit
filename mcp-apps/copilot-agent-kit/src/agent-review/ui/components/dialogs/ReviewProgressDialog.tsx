/**
 * ReviewProgressDialog Component
 *
 * Modal dialog that opens when the "Review" button is clicked.
 * Displays real-time progress through the 4-stage AI pipeline.
 *
 * Based on ui-specification.md Section 3.9
 */

import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  ProgressBar,
  Spinner,
  Text,
  makeStyles,
  mergeClasses,
  tokens,
  useRestoreFocusSource,
} from '@fluentui/react-components';
import {
  CheckmarkCircle20Filled,
  DismissCircle20Filled,
  Circle20Regular,
  DataUsageRegular,
  BrainCircuitRegular,
  DocumentCheckmarkRegular,
  CloudSyncRegular,
  CheckmarkCircleRegular,
  DismissRegular,
  SparkleRegular,
} from '@fluentui/react-icons';
import type { ProgressStage } from '../../contracts.js';
import { WorkflowMark, WorkflowMarkColor } from '../WorkflowMark.js';
import { ReviewErrorContent } from './ReviewErrorContent.js';
import { ReviewWaitFooter } from './ReviewWaitFooter.js';

const useStyles = makeStyles({
  surface: {
    width: '480px',
  },
  // Fluent gives Button `min-width: 96px`, which cancels the automatic minimum
  // size a flex item would otherwise take from its own content. DialogActions
  // then sits in a `1fr` grid column, roughly half this 480px surface, so a
  // long label such as "Continue in background" is squeezed to about 111px and
  // wraps onto a second line, making the button 52px tall instead of 32px.
  // `nowrap` restores the content minimum, so the column grows to fit instead.
  actionButton: { whiteSpace: 'nowrap' },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    paddingTop: '4px',
  },
  stageList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  stageRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  progressRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  progressBar: {
    flex: 1,
  },
  overallPercent: {
    flexShrink: 0,
    color: tokens.colorNeutralForeground2,
    fontWeight: 600,
    fontSize: '13px',
    minWidth: '36px',
    textAlign: 'right',
  },
  pendingText: {
    /*
      Not `colorNeutralForegroundDisabled`. That token is 1.88:1 against the
      dialog surface, which is allowed only because WCAG exempts genuinely
      disabled controls. These are not disabled — they name the stages this
      review is still going to run, which is information the reader wants. So
      they take the lowest token that is still real text (WCAG 1.4.3).
    */
    color: tokens.colorNeutralForeground3,
  },
  /*
    Stage status is carried by an icon, and every Fluent icon is aria-hidden.
    Without this, a screen reader announces six stage names and no indication
    of which have finished (WCAG 1.3.1).
  */
  visuallyHidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
  },
  stageDetail: {
    display: 'block',
    color: tokens.colorNeutralForeground3,
    marginLeft: '28px',
    marginTop: '-4px',
  },
  /*
    Attribution sits at the far end of the row, away from the status glyph at
    the start. Two marks side by side would read as one compound status.
  */
  attribution: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
  },
  attributionLabel: {
    color: tokens.colorNeutralForeground3,
    fontSize: '11px',
    whiteSpace: 'nowrap',
  },
  attributionPending: {
    opacity: 0.45,
  },
  /*
    A slow fade, not a spin. The spinner beside it owns "something is happening";
    this only needs to read as alive during a stage that can run for minutes.
  */
  attributionLive: {
    color: tokens.colorBrandForeground1,
    animationName: {
      '0%, 100%': { opacity: 0.45 },
      '50%': { opacity: 1 },
    },
    animationDuration: '1.6s',
    animationTimingFunction: 'ease-in-out',
    animationIterationCount: 'infinite',
    '@media (prefers-reduced-motion: reduce)': {
      animationName: 'none',
      opacity: 1,
    },
  },
  attributionIdle: {
    color: tokens.colorNeutralForeground3,
  },
});

/**
 * Attribution for one stage, when something other than the browser ran it.
 *
 * Renders beside the status glyph, never instead of it. The gradient mark on a
 * completed stage is the payoff of the monochrome one that pulsed while it ran:
 * the agent node has finished its part. Because the tick already said "done",
 * nothing is lost if the colour change is missed.
 *
 * The label names the *step*, not the container. A workflow holds the agent
 * node; the node is what scores the stage, so it is the honest answer to "who
 * judged this — a rule or a model?". "Workflow agent" was neither object and
 * named nothing that exists in the product. The icon still reads "Power
 * Platform ran this", which stays true on the Cowork and Scout tabs where the
 * word "workflow" would point at the wrong product.
 */
function StageAttribution({ stage }: { stage: ProgressStage }) {
  const styles = useStyles();

  if (stage.attribution !== 'workflow-agent') return null;

  const done = stage.status === 'completed';
  const active = stage.status === 'active';

  return (
    <span
      className={mergeClasses(
        styles.attribution,
        !done && !active && styles.attributionPending,
      )}
    >
      {done ? (
        <WorkflowMarkColor size={16} />
      ) : (
        <WorkflowMark
          size={16}
          className={active ? styles.attributionLive : styles.attributionIdle}
        />
      )}
      <span className={styles.attributionLabel}>Agent node</span>
    </span>
  );
}

export interface ReviewProgressDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Bot name displayed in the title */
  botName: string;
  /** Progress stages from useReviewMutation onProgress callback */
  stages: ProgressStage[];
  /** Error message if pipeline failed, null otherwise */
  error: string | null;
  /** Optional error title shown in the MessageBar (defaults to "Review failed"). */
  errorTitle?: string;
  /** Whether to offer a Retry action. False for non-retryable errors (e.g. missing AI capacity). */
  canRetry?: boolean;
  /** Optional docs URL surfaced as a "Learn more" action on error. */
  learnMoreUrl?: string;
  /** Optional raw/technical detail shown in a collapsible "Show details" area. */
  technicalDetail?: string;
  /** Retry button handler */
  onRetry: () => void;
  /** Cancel/close handler — only shown on error */
  onCancel: () => void;
  /** Whether to expose cancellation while a review is running. */
  allowCancelDuringExecution?: boolean;
  /** Whether a running cancellation request is being processed. */
  isCancelling?: boolean;
  /**
   * Cancels an in-flight review when execution cancellation is enabled.
   *
   * Only offer this where cancelling genuinely stops work. The agent tabs
   * orchestrate their pipeline client-side and check `signal.aborted` between
   * resources, so aborting there really does end the remaining AI calls. The
   * Skills & Automations tab does not: its analysis is one server-side workflow
   * run, so aborting would stop the poller while the run — and its cost —
   * carried on. That tab passes no handler for exactly this reason.
   */
  onCancelExecution?: () => void;
  /** Optional brand color for the active-stage title icon. */
  titleIconColor?: string;
  /**
   * Epoch ms when the run began. Enables the slow-run note.
   *
   * Owned by the caller because the dialog remounts across stages; a timer
   * started here would reset and under-report the wait.
   */
  startedAt?: number | null;
  /**
   * What is being reviewed, in the caller's own vocabulary — for example
   * `1 skill · 14 files`. Rendered verbatim, so the caller stays responsible
   * for using a word that suits its domain.
   */
  scopeSummary?: string;
  /**
   * How long a run may take before it is worth reassuring the user. Omit to
   * never show the note.
   */
  slowAfterMs?: number;
  /**
   * Shown once `slowAfterMs` passes. Should state the typical duration, so
   * "longer than usual" is a measurable claim rather than a vague apology.
   */
  slowNote?: string;
  /**
   * A measured expectation for the whole run — for example `usually ~3 min`.
   * Shown beside the clock so the elapsed figure has something to be read
   * against, and withdrawn once the slow note takes over.
   */
  expectedLabel?: string;
  /**
   * Leaves the review running and gives the screen back.
   *
   * Opt-in, because it is only truthful where the caller keeps the run alive
   * after the dialog closes. Supplied, it becomes the primary action and the
   * cancel button is relabelled to say what it really does — discard the run —
   * so the reader is no longer offered "Cancel" as the sole way out of a wait
   * they did not want to sit through.
   */
  onContinueInBackground?: () => void;
}

/**
 * ReviewProgressDialog Component
 *
 * Opens when Review is clicked and tracks pipeline stages in real time.
 * Non-dismissible during execution (modalType="alert").
 * Shows Retry/Cancel actions only on error.
 *
 * @example
 * ```tsx
 * <ReviewProgressDialog
 *   open={currentReviewingBotId !== null}
 *   botName={currentReviewingBotName}
 *   stages={progressStages}
 *   error={reviewError}
 *   onRetry={handleRetryReview}
 *   onCancel={handleCancelReview}
 * />
 * ```
 */
/**
 * Spoken equivalent of the status glyph, for the one consumer that cannot see
 * it. Kept beside the stage name so the two are announced together.
 */
const STATUS_LABEL: Record<ProgressStage['status'], string> = {
  completed: 'completed',
  active: 'in progress',
  error: 'failed',
  pending: 'not started',
};

function getTitleIcon(stageName: string, color: string) {  const style = { fontSize: '24px', color };
  if (stageName === 'Parsing Configuration') return <DataUsageRegular style={style} />;
  if (stageName === 'Evaluating Patterns' || stageName === 'Checking Compliance') return <BrainCircuitRegular style={style} />;
  if (stageName === 'Generating Report') return <DocumentCheckmarkRegular style={style} />;
  if (stageName === 'Saving Results') return <CloudSyncRegular style={style} />;
  if (stageName === 'Complete') return <CheckmarkCircleRegular style={style} />;
  return <SparkleRegular style={style} />;
}

export function ReviewProgressDialog({
  open,
  botName,
  stages,
  error,
  errorTitle = 'Review failed',
  canRetry = true,
  learnMoreUrl,
  technicalDetail,
  onRetry,
  onCancel,
  allowCancelDuringExecution = false,
  isCancelling = false,
  onCancelExecution,
  titleIconColor = '#0078d4',
  startedAt,
  scopeSummary,
  slowAfterMs,
  slowNote,
  expectedLabel,
  onContinueInBackground,
}: ReviewProgressDialogProps) {
  const styles = useStyles();
  // Returns focus to whatever opened the dialog once it closes, instead of
  // dropping the user back at the top of the document.
  const restoreFocusSource = useRestoreFocusSource();

  const activeStage = stages.find(s => s.status === 'active');
  const errorStage = stages.find(s => s.status === 'error');
  const currentProgress = activeStage?.progress ?? errorStage?.progress ?? (stages.length > 0 ? 100 : 0);

  // What a screen reader is told as the review runs.
  //
  // Three separate faults made this dialog silent, and all three had to be
  // fixed together:
  //
  //  - The bar itself had no accessible name, so it announced as an unnamed
  //    progress bar. `aria-valuetext` is set as well, because a bare "30%"
  //    without the stage it belongs to is not progress a reader can act on.
  //  - The only `aria-live` sat on the per-stage detail line, which is rendered
  //    solely for the active stage. A live region that is *mounted* already
  //    holding its text does not announce; only later mutations do. So it fired
  //    for nobody.
  //  - Nothing announced completion at all.
  //
  // The region below is therefore mounted for the whole life of the dialog and
  // only its text changes, which is the shape assistive technology actually
  // watches. It deliberately excludes errors because ReviewErrorContent owns
  // their assertive announcement, and excludes the percentage because that
  // ticks continuously during the AI stage. The stage name and its detail line
  // are the meaningful progress changes.
  const liveAnnouncement = error
    ? ''
    : activeStage
      ? [activeStage.stageName, activeStage.detail].filter(Boolean).join(', ')
      : stages.length > 0
        ? 'Review complete.'
        : '';

  const progressLabel = error
    ? `Review of ${botName} failed`
    : activeStage
      ? `Reviewing ${botName}: ${activeStage.stageName}`
      : `Reviewing ${botName}`;

  return (
    <Dialog
      open={open}
      modalType={error ? 'modal' : 'alert'}
      onOpenChange={(_, data) => {
        if (error && !data.open) onCancel();
      }}
    >
      <DialogSurface className={styles.surface} {...restoreFocusSource}>
        <DialogTitle
          action={error ? (
            <Button
              appearance="subtle"
              aria-label="Close error dialog"
              icon={<DismissRegular />}
              onClick={onCancel}
            />
          ) : null}
        >
          <div className={styles.titleRow}>
            {error
              ? <DismissCircle20Filled style={{ color: tokens.colorPaletteRedForeground1, fontSize: '24px' }} />
              : getTitleIcon(activeStage?.stageName ?? 'Initializing', titleIconColor)
            }
            <span>
              {error ? `${errorTitle} for ${botName}` : `Reviewing ${botName}...`}
            </span>
          </div>
        </DialogTitle>

        <DialogContent>
          <div className={styles.content}>
            {/*
              Always mounted, so a later text change is a mutation the screen
              reader reports rather than initial content it ignores.
            */}
            <div className={styles.visuallyHidden} aria-live="polite" aria-atomic="true">
              {liveAnnouncement}
            </div>

            {/* Progress Bar with combined percentage */}
            <div className={styles.progressRow}>
              <ProgressBar
                className={styles.progressBar}
                value={currentProgress / 100}
                color={error ? 'error' : undefined}
                aria-label={progressLabel}
                aria-valuetext={`${Math.round(currentProgress)}%`}
              />
              <span className={styles.overallPercent}>{Math.round(currentProgress)}%</span>
            </div>

            {/* Stage List */}
            {stages.length > 0 && (
              <div className={styles.stageList}>
                {stages.map((stage, index) => (
                  <div key={index}>
                    <div className={styles.stageRow}>
                      {stage.status === 'completed' && (
                        <CheckmarkCircle20Filled style={{ color: tokens.colorPaletteGreenForeground1, flexShrink: 0 }} />
                      )}
                      {stage.status === 'active' && (
                        <Spinner
                          size="tiny"
                          aria-label={`${stage.stageName} in progress`}
                          style={{ flexShrink: 0 }}
                        />
                      )}
                      {stage.status === 'error' && (
                        <DismissCircle20Filled style={{ color: tokens.colorPaletteRedForeground1, flexShrink: 0 }} />
                      )}
                      {stage.status === 'pending' && (
                        <Circle20Regular style={{ color: tokens.colorNeutralForegroundDisabled, flexShrink: 0 }} />
                      )}
                      <Text
                        size={200}
                        className={stage.status === 'pending' ? styles.pendingText : undefined}
                      >
                        {stage.stageName}
                      </Text>
                      <span className={styles.visuallyHidden}>{STATUS_LABEL[stage.status]}</span>
                      <StageAttribution stage={stage} />
                    </div>
                    {stage.detail && (
                      // Not a live region: the persistent one above carries this
                      // text. Marking it live as well would double-announce.
                      <Text size={100} className={styles.stageDetail}>
                        {stage.detail}
                      </Text>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Waiting affordances — scope, elapsed time, and a slow-run note */}
            <ReviewWaitFooter
              startedAt={startedAt}
              scopeSummary={scopeSummary}
              slowAfterMs={slowAfterMs}
              slowNote={slowNote}
              expectedLabel={expectedLabel}
              failed={Boolean(error)}
            />

            {/* Error content — plain dialog content, not a nested MessageBar */}
            {error && (
              <ReviewErrorContent
                title={errorTitle}
                message={error}
                learnMoreUrl={learnMoreUrl}
                technicalDetail={technicalDetail}
              />
            )}
          </div>
        </DialogContent>

        {error && canRetry && (
          <DialogActions>
            <Button className={styles.actionButton} appearance="primary" onClick={onRetry}>
              Retry
            </Button>
          </DialogActions>
        )}
        {error && !canRetry && (
          <DialogActions>
            <Button className={styles.actionButton} appearance="primary" onClick={onCancel}>
              Close
            </Button>
          </DialogActions>
        )}
        {!error && (allowCancelDuringExecution || onContinueInBackground) && (
          <DialogActions>
            {onCancelExecution && (
              <Button
                className={styles.actionButton}
                appearance="secondary"
                disabled={isCancelling}
                onClick={onCancelExecution}
              >
                {isCancelling ? 'Cancelling…' : 'Cancel'}
              </Button>
            )}
            {onContinueInBackground && (
              <Button
                className={styles.actionButton}
                // Deliberately not primary. A filled button marks the
                // recommended action, and leaving is not recommended — it is an
                // escape hatch for a reader who does not want to sit through a
                // wait. Emphasising it competes with the progress list, which is
                // the reason the dialog is open at all, and reads as an
                // instruction to go away. It is also the only control in this
                // footer, so it does not need weight to be found.
                appearance="secondary"
                onClick={onContinueInBackground}
              >
                Continue in background
              </Button>
            )}
          </DialogActions>
        )}
      </DialogSurface>
    </Dialog>
  );
}
