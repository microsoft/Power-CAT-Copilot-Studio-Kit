import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(
  resolve(__dirname, '../../../../App.tsx'),
  'utf-8',
);
const dashboardSource = readFileSync(
  resolve(__dirname, '../../components/Dashboard.tsx'),
  'utf-8',
);
const pageSource = readFileSync(
  resolve(__dirname, '../../components/review-page/StandardReviewPage.tsx'),
  'utf-8',
);
const providerSource = readFileSync(
  resolve(__dirname, '../../context/StandardReviewRunner.tsx'),
  'utf-8',
);
const workflowOutcomeSource = readFileSync(
  resolve(__dirname, '../../utils/workflowOutcome.ts'),
  'utf-8',
);
const mutationSource = readFileSync(
  resolve(__dirname, '../../hooks/useReviewMutation.ts'),
  'utf-8',
);
const workflowSource = readFileSync(
  resolve(__dirname, '../StandardReviewWorkflowService.ts'),
  'utf-8',
);
const patternDialogSource = readFileSync(
  resolve(__dirname, '../../components/dialogs/PatternDetailsDialog.tsx'),
  'utf-8',
);
const complianceDialogSource = readFileSync(
  resolve(__dirname, '../../components/dialogs/ComplianceDetailsDialog.tsx'),
  'utf-8',
);

describe('Standard background review runner', () => {
  it('owns the mutation above route content', () => {
    expect(providerSource).toContain('useReviewMutation');
    expect(pageSource).not.toContain('useReviewMutation');
    expect(dashboardSource).not.toContain('useReviewMutation');

    const providerIndex = appSource.indexOf('<StandardReviewRunnerProvider>');
    const layoutIndex = appSource.indexOf('<Layout>');
    expect(providerIndex).toBeGreaterThan(-1);
    expect(providerIndex).toBeLessThan(layoutIndex);
  });

  it('starts Dashboard and result-page reviews through the global runner', () => {
    expect(dashboardSource).toContain('useStandardReviewRunner');
    expect(dashboardSource).toContain('standardRunner.start(');
    expect(pageSource).toContain('useStandardReviewRunner');
    expect(pageSource).toContain('standardRunner.start(');
  });

  it('offers the background action and persistent terminal states', () => {
    expect(providerSource).toContain(
      'onContinueInBackground={isRunning ? sendToBackground : undefined}',
    );
    expect(providerSource).toContain('View progress');
    expect(providerSource).toContain('Review failed');
    expect(providerSource).toContain('View error');
    expect(providerSource).toContain('Review ready');
  });

  it('uses the scoped indigo review theme for the portalled dialog', () => {
    expect(providerSource).toContain('copilotStudioReviewLightTheme');
    expect(providerSource).toContain(
      '<FluentProvider theme={copilotStudioReviewLightTheme}',
    );
    expect(providerSource).toContain(
      'titleIconColor={copilotStudioReviewLightTheme.colorBrandForeground1}',
    );
  });

  it('shows the measured duration range and the Stage A review scope', () => {
    expect(providerSource).toContain('scopeSummary={scopeSummary}');
    expect(providerSource).toContain('expectedLabel={STANDARD_REVIEW_EXPECTED_LABEL}');
    expect(providerSource).toContain('slowAfterMs={STANDARD_REVIEW_SLOW_AFTER_MS}');
    expect(providerSource).toContain('slowNote={STANDARD_REVIEW_SLOW_NOTE}');
    expect(providerSource).toContain('onScopeReady');
  });

  it('keeps the normal review summary focused on scores and review context', () => {
    const facts = pageSource.match(
      /facts:\s*\[([\s\S]*?)\r?\n\s{4}\],\r?\n\s{2}\};/,
    )?.[1];

    expect(facts).toBeDefined();
    expect(facts).toContain("key: 'agent'");
    expect(facts).toContain("key: 'reviewed'");
    expect(facts).toContain("key: 'reviewed-by'");
    expect(facts).toContain("label: 'Reviewed by'");
    expect(facts).toContain('<Avatar');
    // The workflow fact is deliberately kept: it is the only surface that reports the
    // degraded unit count at a glance, which the "Could not run" reporting depends on.
    // The banner only speaks when the workflow fails; this badge speaks on every review.
    expect(facts).toContain("key: 'workflow'");
    for (const key of ['patterns', 'instructions', 'version', 'source', 'powered-by']) {
      expect(facts).not.toContain(`key: '${key}'`);
    }
  });

  it('shows workflow proof and evidence-bound maker guidance', () => {
    // The badge label moved out of the page into `describeWorkflowOutcome`, which picks one of
    // four labels from the unit counts. Assert it where it now lives, and that the page renders it.
    expect(workflowOutcomeSource).toContain('Workflow verified');
    expect(pageSource).toContain('workflowOutcome.badgeLabel');
    expect(pageSource).toContain('review.workflowProvenance.jobId');
    for (const label of [
      'Why it matters',
      'Maker action',
      'Draft for maker review',
      'Suggested text',
      'Acceptance check',
    ]) {
      expect(patternDialogSource).toContain(label);
    }
    expect(patternDialogSource).toContain("headingLevel = 'h4'");
    expect(patternDialogSource).toContain('headingLevel="h5"');
    expect(complianceDialogSource).toContain('ContextualRemediationDetails');
  });

  it('stores recovery before the run and restores the existing workflow job', () => {
    expect(providerSource).toContain('writeStandardReviewRecovery');
    expect(providerSource).toContain('readStandardReviewRecovery');
    expect(providerSource).toContain('findLatestJobForBot');
    expect(providerSource).toContain('existingJobId: recovery.jobId');
    expect(mutationSource).toContain('onJobSubmitted');
    expect(mutationSource).toContain('existingJobId: input.existingJobId');
  });

  it('does not submit a new workflow job while recovering an existing one', () => {
    expect(workflowSource).toContain(
      'options.existingJobId ?? await createReviewJob(corpus)',
    );
    expect(workflowSource).toContain('options.onJobSubmitted?.(jobId)');
  });

  it('blocks a duplicate start before React Query updates pending state', () => {
    expect(providerSource).toContain('executionInFlightRef.current');
    expect(providerSource).not.toContain('mutation.isPending && current');
  });

  it('keeps status announcements and agent-specific action labels', () => {
    expect(providerSource).toContain('aria-live="polite"');
    expect(providerSource).toContain('aria-atomic="true"');
    expect(providerSource).toContain(
      'aria-label={`View progress for ${activeReview.input.botName}`}',
    );
    expect(providerSource).toContain(
      'aria-label={`View error for ${activeReview.input.botName}`}',
    );
    expect(providerSource).toContain(
      'aria-label={`Open review for ${completed.botName}`}',
    );
  });

  it('returns focus to a visible status action or the main content', () => {
    expect(providerSource).toContain('useRestoreFocusTarget');
    expect(providerSource).toContain(
      'const backgroundFocusTarget = useRestoreFocusTarget();',
    );
    expect(providerSource.match(/\{\.\.\.backgroundFocusTarget\}/g)).toHaveLength(2);
    expect(providerSource).toContain('focusMainAfterRender');
  });
});
