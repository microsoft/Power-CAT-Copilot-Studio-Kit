import {
  FluentProvider,
} from '@fluentui/react-components';
import { useState } from 'react';
import type { SkillReviewProgress } from '../../core/index.js';
import type { ProgressStage, WorkflowProgressActions } from '../contracts.js';
import { ReviewProgressDialog } from './dialogs/ReviewProgressDialog.js';
import { copilotStudioReviewLightTheme } from './copilotStudioReviewTheme.js';
import {
  buildCopilotReviewProgressStages,
  reachedIndex,
  shouldShowCopilotReviewCancel,
} from './copilotReviewProgressAdapter.js';

export interface CopilotReviewProgressDialogProps {
  open: boolean;
  agentName: string;
  progress: SkillReviewProgress | null;
  isCancelling: boolean;
  error: string | null;
  errorTitle?: string;
  canRetry?: boolean;
  learnMoreUrl?: string;
  technicalDetail?: string;
  startedAt?: number | null;
  actions: WorkflowProgressActions;
  onRetry: () => void;
  onClose: () => void;
}

/** Displays GitHub Copilot review progress without navigating away from the dashboard. */
export function CopilotReviewProgressDialog({
  open,
  agentName,
  progress,
  isCancelling,
  error,
  errorTitle = 'Review failed',
  canRetry = true,
  learnMoreUrl,
  technicalDetail,
  startedAt,
  actions,
  onRetry,
  onClose,
}: CopilotReviewProgressDialogProps) {
  // The pipeline re-emits early stages for each skill bundle, so the stepper
  // would otherwise jump back to "Parsing Configuration" mid-run. The furthest
  // point reached is carried forward to keep the indicator monotonic.
  //
  // Held in state, not a ref: a ref must not be read during render, and this
  // value is needed to render. Adjusting state during render is the documented
  // pattern for state derived from props, and it terminates here because the
  // reached index only increases and is bounded by the stage count.
  const [carried, setCarried] = useState<ProgressStage[] | undefined>(undefined);
  const [wasOpen, setWasOpen] = useState(open);

  // A fresh run must start from the beginning rather than inherit the previous
  // run's high-water mark.
  let previous = carried;
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      previous = undefined;
      setCarried(undefined);
    }
  }

  const stages = buildCopilotReviewProgressStages(
    progress,
    error !== null,
    previous,
    actions,
  );
  const canCancelExecution = shouldShowCopilotReviewCancel(actions);
  if (stages.length > 0 && reachedIndex(stages) > reachedIndex(previous)) {
    setCarried(stages);
  }

  return (
    <FluentProvider theme={copilotStudioReviewLightTheme} style={{ display: 'contents' }}>
      <ReviewProgressDialog
        open={open}
        botName={agentName}
        stages={stages}
        error={error}
        errorTitle={errorTitle}
        canRetry={canRetry}
        learnMoreUrl={learnMoreUrl}
        technicalDetail={technicalDetail}
        startedAt={startedAt}
        onRetry={onRetry}
        onCancel={onClose}
        onContinueInBackground={actions.onContinueInBackground}
        allowCancelDuringExecution={canCancelExecution}
        isCancelling={isCancelling}
        onCancelExecution={
          canCancelExecution ? actions.onCancelExecution : undefined
        }
        titleIconColor={copilotStudioReviewLightTheme.colorBrandForeground1}
      />
    </FluentProvider>
  );
}
