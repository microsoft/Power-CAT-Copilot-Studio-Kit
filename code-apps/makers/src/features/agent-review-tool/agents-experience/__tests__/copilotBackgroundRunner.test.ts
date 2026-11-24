import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(
  resolve(__dirname, '../../../../App.tsx'),
  'utf-8',
);
const pageSource = readFileSync(
  resolve(__dirname, '../components/CopilotReviewPage.tsx'),
  'utf-8',
);
const providerSource = readFileSync(
  resolve(__dirname, '../context/CopilotReviewRunner.tsx'),
  'utf-8',
);
const dialogSource = readFileSync(
  resolve(__dirname, '../components/CopilotReviewProgressDialog.tsx'),
  'utf-8',
);
const mutationSource = readFileSync(
  resolve(__dirname, '../hooks/useCopilotReviewMutation.ts'),
  'utf-8',
);
const sharedDialogSource = readFileSync(
  resolve(__dirname, '../../components/dialogs/ReviewProgressDialog.tsx'),
  'utf-8',
);
const contentSource = readFileSync(
  resolve(__dirname, '../../../../shared/components/Layout/Content.tsx'),
  'utf-8',
);
const dashboardSource = readFileSync(
  resolve(__dirname, '../../components/Dashboard.tsx'),
  'utf-8',
);

describe('Copilot background review runner', () => {
  it('owns the mutation above route content so navigation cannot unmount it', () => {
    expect(providerSource).toContain('useCopilotReviewMutation');
    expect(pageSource).not.toContain('useCopilotReviewMutation');

    const providerIndex = appSource.indexOf('<CopilotReviewRunnerProvider>');
    const layoutIndex = appSource.indexOf('<Layout>');
    expect(providerIndex).toBeGreaterThan(-1);
    expect(providerIndex).toBeLessThan(layoutIndex);
  });

  it('starts dashboard reviews through the application-level runner', () => {
    expect(dashboardSource).toContain('useCopilotReviewRunner');
    expect(dashboardSource).toContain(
      'const copilotRunner = useCopilotReviewRunner();',
    );
    expect(dashboardSource).toContain('copilotRunner.start(');
    expect(dashboardSource).not.toContain('useCopilotReviewMutation(');
    expect(dashboardSource).not.toContain('<CopilotReviewProgressDialog');
  });

  it('forwards Continue in background to the shared progress dialog', () => {
    expect(dialogSource).toContain(
      'onContinueInBackground={onContinueInBackground}',
    );
    expect(providerSource).toContain(
      'onContinueInBackground={isRunning ? sendToBackground : undefined}',
    );
  });

  it('keeps visible progress, completion, and failure affordances', () => {
    expect(providerSource).toContain('View progress');
    expect(providerSource).toContain('Review ready');
    expect(providerSource).toContain('Review failed');
    expect(providerSource).toContain('View error');
  });

  it('does not attach a different agent to the active review', () => {
    expect(providerSource).toContain('isSameReview(current, input)');
    expect(providerSource).toContain('navigate(activeReviewPath(current)');
  });

  it('starts a new mutation directly when the toolbar re-runs a review', () => {
    expect(pageSource.match(/runner\.start\(/g)).toHaveLength(2);
  });

  it('omits Cancel when the workflow owns the server-side run', () => {
    expect(dialogSource).toContain(
      'onCancelExecution={canCancelExecution ? onCancel : undefined}',
    );
  });

  it('shows a specific Agent Node timeout title and keeps Retry wired', () => {
    expect(providerSource).toContain("title: 'Agent Node timed out'");
    expect(providerSource).toContain('onRetry={retry}');
  });

  it('stores the active review and restores it when the app reopens', () => {
    expect(providerSource).toContain('readCopilotReviewRecovery');
    expect(providerSource).toContain('writeCopilotReviewRecovery');
    expect(providerSource).toContain('await Promise.resolve()');
    expect(providerSource).not.toContain('restoredReviewRef');
  });

  it('captures the workflow job id and attaches to it after reopening', () => {
    expect(providerSource).toContain('onJobSubmitted');
    expect(providerSource).toContain('existingJobId: recovery.jobId');
    expect(mutationSource).toContain('existingJobId?: string');
    expect(mutationSource).toContain('existingJobId: input.existingJobId');
  });

  it('does not let startup recovery replace a review started by the user', () => {
    expect(providerSource).toContain('restoreGenerationRef.current += 1');
    expect(providerSource).toContain(
      'restoreGeneration !== restoreGenerationRef.current',
    );
    expect(providerSource).toContain('activeReviewRef.current');
  });

  it('blocks a duplicate start before React Query updates isPending', () => {
    expect(providerSource).toContain('executionInFlightRef.current');
    expect(providerSource).not.toContain('mutation.isPending && current');
  });

  it('keeps Continue in background secondary', () => {
    const continueAction = sharedDialogSource.slice(
      sharedDialogSource.indexOf('{onContinueInBackground && ('),
      sharedDialogSource.indexOf('</DialogActions>', sharedDialogSource.indexOf('{onContinueInBackground && (')),
    );
    expect(continueAction).toContain('appearance="secondary"');
    expect(continueAction).not.toContain('appearance="primary"');
  });

  it('keeps Retry as the only error footer action', () => {
    expect(sharedDialogSource).toContain('aria-label="Close error dialog"');
    expect(sharedDialogSource).toContain('{error && canRetry && (');
    expect(sharedDialogSource).not.toContain(
      "appearance={canRetry ? 'secondary' : 'primary'}",
    );
  });

  it('does not offer Retry for errors classified as non-retryable', () => {
    expect(providerSource).toContain('classifyAIError');
    expect(providerSource).toContain('canRetry={classifiedError?.canRetry');
  });

  it('announces an error once', () => {
    expect(sharedDialogSource).toMatch(
      /const liveAnnouncement = error\s*\?\s*''/,
    );
  });

  it('returns focus to a visible status action or the main content', () => {
    expect(providerSource).toContain('useRestoreFocusTarget');
    expect(providerSource).toContain(
      'const backgroundFocusTarget = useRestoreFocusTarget();',
    );
    expect(providerSource.match(/\{\.\.\.backgroundFocusTarget\}/g)).toHaveLength(2);
    expect(providerSource).not.toContain('progressButtonRef');
    expect(providerSource).not.toContain('errorButtonRef');
    expect(contentSource).toContain('tabIndex={-1}');
    expect(providerSource).toMatch(
      /navigate\(path\);\s*focusMainAfterRender\(\);/,
    );
    expect(providerSource).toMatch(
      /navigate\(reviewPath\(run, reviewId\), \{ replace: true \}\);\s*focusMainAfterRender\(\);/,
    );
  });

  it('names the completed review action with its agent', () => {
    expect(providerSource).toContain(
      'aria-label={`Open review for ${completed.botName}`}',
    );
  });
});
