/**
 * Waiting affordances for a review that can run for minutes.
 *
 * Extracted from `ReviewProgressDialog` rather than written inline, for two
 * reasons. The dialog renders through a Fluent portal, so nothing inside it can
 * be proved by a server-rendered test; and the stage list already made that
 * file long. Keeping this piece separate makes the part that matters during a
 * long wait independently verifiable.
 *
 * Everything rendered here is measured. The expected duration and the
 * slow-run threshold both come from observed run durations — never from a guess
 * about how long the backend "should" take.
 */
import {
  MessageBar,
  MessageBarBody,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';

import { useElapsed } from './reviewElapsed.js';

const useStyles = makeStyles({
  /*
    Sits below the stage list behind a rule: these lines describe the run as a
    whole, so placing them inside the list would attach them to whichever stage
    happened to be active.
  */
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    paddingTop: '12px',
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  row: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '12px',
  },
  scope: {
    color: tokens.colorNeutralForeground3,
  },
  /*
    The expectation, not a measurement. It states what a healthy run costs so a
    reader can decide whether to keep the dialog open, which is the only timing
    question they can act on.
  */
  expectation: {
    color: tokens.colorNeutralForeground3,
    fontWeight: 400,
  },
});

export interface ReviewWaitFooterProps {
  /**
   * Epoch ms when the run began.
   *
   * Not rendered. It exists only to decide when a run has passed
   * `slowAfterMs` and needs explaining. An elapsed clock was shown here once
   * and was removed: none of the reader's choices change on the number, and a
   * stopwatch on a wait nobody can influence only makes the wait feel longer.
   */
  startedAt?: number | null;
  /**
   * What is being reviewed, in the caller's own vocabulary — for example
   * `1 skill · 14 files`. Rendered verbatim, because "component" is right for
   * an agent review and wrong for an uploaded archive.
   */
  scopeSummary?: string;
  /** How long a run may take before the note is worth showing. */
  slowAfterMs?: number;
  /** Shown once `slowAfterMs` passes. Should state the typical duration. */
  slowNote?: string;
  /**
   * A measured expectation for the whole run — for example `usually ~3 min`.
   *
   * The progress bar cannot supply one: it reaches the AI stage's percentage
   * within about a second and then does not move again until the stage
   * returns, so a bar read alone implies a wait that is nearly over when most
   * of it remains. This line is what corrects that, which is exactly why it
   * must come from observed durations rather than from an aspiration about how
   * long the backend ought to take.
   */
  expectedLabel?: string;
  /** True suppresses everything: on failure, timing says nothing useful. */
  failed?: boolean;
}

/**
 * Scope, an expected duration, and a slow-run note.
 *
 * Renders nothing when it has none of the three, so a caller that passes no
 * waiting props is unaffected.
 */
export function ReviewWaitFooter({
  startedAt,
  scopeSummary,
  slowAfterMs,
  slowNote,
  expectedLabel,
  failed = false,
}: ReviewWaitFooterProps) {
  const styles = useStyles();
  const elapsedMs = useElapsed(startedAt, !failed);

  if (failed) return null;

  const isSlow =
    slowAfterMs !== undefined && elapsedMs !== null && elapsedMs >= slowAfterMs;
  // Withheld until a run exists, having nothing to qualify on its own, and
  // dropped once the slow note takes over — that note states the same duration,
  // and showing both would read as the dialog arguing with itself.
  const showExpectation = Boolean(expectedLabel) && elapsedMs !== null && !isSlow;
  const showNote = isSlow && Boolean(slowNote);

  if (!scopeSummary && !showExpectation && !showNote) return null;

  return (
    <div className={styles.root}>
      {(scopeSummary || showExpectation) && (
        <div className={styles.row}>
          <Text size={200} className={styles.scope}>
            {scopeSummary ?? 'Reviewing'}
          </Text>
          {showExpectation && (
            <Text size={200} className={styles.expectation}>
              {expectedLabel}
            </Text>
          )}
        </div>
      )}
      {showNote && (
        <MessageBar intent="info">
          <MessageBarBody>{slowNote}</MessageBarBody>
        </MessageBar>
      )}
    </div>
  );
}
