/**
 * DAReviewProgressDialog Component
 *
 * Progress dialog for the Declarative Agent review.
 *
 * A thin wrapper around the shared `ReviewProgressDialog`, so this review has
 * the same layout, progress announcements, AI review mark, and indigo review
 * theme as the Standard and Copilot reviews. The runner is mounted above the
 * routes, outside the Agent Review feature theme, so this component supplies
 * the theme itself.
 */

import { useState } from 'react';
import { FluentProvider } from '@fluentui/react-components';
import {
  BrainCircuitRegular,
  CheckmarkCircleRegular,
  CloudSyncRegular,
  DataUsageRegular,
} from '@fluentui/react-icons';
import type { DAReviewProgress } from '../hooks/useDAReviewMutation';
import { classifyAIError } from '../../utils/aiErrorClassifier';
import { ReviewProgressDialog } from '../../components/dialogs/ReviewProgressDialog';
import { copilotStudioReviewLightTheme } from '../../agents-experience/components/copilotStudioReviewTheme';
import { buildDAProgressStages } from './daProgressStages';

/** Title icon for the running stage, in the review brand color. */
function getTitleIcon(stage: DAReviewProgress['stage'] | undefined) {
  const style = {
    fontSize: '24px',
    color: copilotStudioReviewLightTheme.colorBrandForeground1,
  };
  switch (stage) {
    case 'skill-evaluation':
    case 'ai-evaluation':
      return <BrainCircuitRegular style={style} />;
    case 'saving':
      return <CloudSyncRegular style={style} />;
    case 'complete':
      return <CheckmarkCircleRegular style={style} />;
    default:
      return <DataUsageRegular style={style} />;
  }
}

export interface DAReviewProgressDialogProps {
  open: boolean;
  agentName: string;
  progress: DAReviewProgress | null;
  error: Error | null;
  /** True when the review workflow runs the AI evaluation. */
  workflowBacked: boolean;
  /** True when the run evaluates, or already evaluated, custom skills. */
  hasCustomSkills: boolean;
  onCancel: () => void;
  onRetry: () => void;
}

/**
 * DAReviewProgressDialog component
 *
 * Shows the DA review stages while the review runs, and the classified error
 * with its recovery action when the review fails.
 */
export function DAReviewProgressDialog({
  open,
  agentName,
  progress,
  error,
  workflowBacked,
  hasCustomSkills,
  onCancel,
  onRetry,
}: DAReviewProgressDialogProps) {
  // The hook clears its progress 1.5 s after a run ends. After a failure the
  // dialog stays open, so the last progress is kept to show which stage
  // failed. Held in state and adjusted during render, which is the documented
  // pattern for state derived from props.
  const [carried, setCarried] = useState<DAReviewProgress | null>(null);
  const [wasOpen, setWasOpen] = useState(open);

  let previous = carried;
  if (open !== wasOpen) {
    setWasOpen(open);
    // A new run must not start from the last stage of the previous run.
    previous = null;
    setCarried(null);
  }
  if (open && progress && progress !== previous) {
    setCarried(progress);
  }
  const shown = open ? progress ?? previous : null;

  const classified = error ? classifyAIError(error) : null;
  const stages = buildDAProgressStages(shown, {
    workflowBacked,
    hasCustomSkills,
    failed: classified !== null,
  });
  // A saved review cannot be cancelled. The runner closes the dialog when the
  // save returns, so this removes Cancel only for that last moment.
  const canCancel = shown?.stage !== 'complete';

  return (
    <FluentProvider theme={copilotStudioReviewLightTheme} style={{ display: 'contents' }}>
      <ReviewProgressDialog
        open={open}
        botName={agentName || 'Declarative Agent'}
        stages={stages}
        error={classified ? classified.message : null}
        errorTitle={classified?.title}
        canRetry={classified?.canRetry ?? true}
        learnMoreUrl={classified?.learnMoreUrl}
        technicalDetail={classified?.technicalDetail}
        onRetry={onRetry}
        onCancel={onCancel}
        allowCancelDuringExecution={canCancel}
        onCancelExecution={canCancel ? onCancel : undefined}
        titleIcon={getTitleIcon(shown?.stage)}
      />
    </FluentProvider>
  );
}
