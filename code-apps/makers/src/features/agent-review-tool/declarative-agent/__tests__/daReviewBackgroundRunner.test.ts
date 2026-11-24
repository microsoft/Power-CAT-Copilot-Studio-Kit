import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(
  resolve(__dirname, '../../../../App.tsx'),
  'utf-8',
);
const tabSource = readFileSync(
  resolve(__dirname, '../DeclarativeAgentTab.tsx'),
  'utf-8',
);
const runnerSource = readFileSync(
  resolve(__dirname, '../context/DAReviewRunner.tsx'),
  'utf-8',
);
const hookSource = readFileSync(
  resolve(__dirname, '../hooks/useDAReviewMutation.ts'),
  'utf-8',
);
const progressDialogSource = readFileSync(
  resolve(__dirname, '../components/DAReviewProgressDialog.tsx'),
  'utf-8',
);
const sharedDialogSource = readFileSync(
  resolve(__dirname, '../../components/dialogs/ReviewProgressDialog.tsx'),
  'utf-8',
);

describe('Declarative Agent background review runner', () => {
  it('owns the review mutation above route content', () => {
    expect(runnerSource).toContain('useDAReviewMutation');
    expect(tabSource).not.toContain('useDAReviewMutation');
    expect(tabSource).toContain('useDAReviewRunner');

    const providerIndex = appSource.indexOf('<DAReviewRunnerProvider>');
    const layoutIndex = appSource.indexOf('<Layout>');
    expect(providerIndex).toBeGreaterThan(-1);
    expect(providerIndex).toBeLessThan(layoutIndex);
  });

  it('persists the prepared request and durable job identity for restart recovery', () => {
    expect(runnerSource).toContain('createDAReviewRecovery');
    expect(runnerSource).toContain('writeDAReviewRecovery');
    expect(runnerSource).toContain('readDAReviewRecovery');
    expect(runnerSource).toContain('onPrepared: handlePrepared');
    expect(runnerSource).toContain('onJobSubmitted: handleJobSubmitted');
    expect(runnerSource).toContain('existingJobId: recovery.jobId');
    expect(hookSource).toContain('executeDAReviewJob');
  });

  it('blocks duplicate starts before React Query updates pending state', () => {
    expect(runnerSource).toContain('executionInFlightRef.current');
  });

  it('keeps the accessible progress dialog mounted with the application owner', () => {
    expect(runnerSource).toContain('<DAReviewProgressDialog');
    expect(runnerSource).toContain('agentName={activeReview?.input.manifest.name');
    // The shared dialog owns the persistent live region and the named bar.
    expect(progressDialogSource).toContain('<ReviewProgressDialog');
    expect(progressDialogSource).not.toContain('<DialogSurface');
    expect(sharedDialogSource).toContain('aria-live="polite"');
    expect(sharedDialogSource).toContain('aria-valuetext=');
  });

  // The runner is mounted above the routes, outside the Agent Review feature
  // theme. Without its own provider, the portalled dialog used the teal app
  // theme while the Standard and Copilot dialogs used indigo.
  it('uses the scoped indigo review theme for the portalled dialog', () => {
    expect(progressDialogSource).toContain(
      '<FluentProvider theme={copilotStudioReviewLightTheme}',
    );
    // The shared icon lookup knows only the Standard stage names, so the DA
    // dialog supplies its own title icon in the review brand color.
    expect(progressDialogSource).toContain('titleIcon={getTitleIcon(');
    expect(progressDialogSource).toContain(
      'color: copilotStudioReviewLightTheme.colorBrandForeground1',
    );
    expect(progressDialogSource).not.toContain("'#0078d4'");
  });

  it('builds the stage rows, and the Agent node mark, from the review input', () => {
    expect(progressDialogSource).toContain('buildDAProgressStages(');
    expect(runnerSource).toContain('isDAReviewWorkflowBacked(');
    expect(runnerSource).toContain('hasDACustomSkillStage(');
  });

  // The DA runner has no "Continue in background", so Cancel is the only way
  // out of the running dialog. It must stay available.
  it('keeps Cancel available while the review runs', () => {
    expect(progressDialogSource).toContain('allowCancelDuringExecution');
    expect(progressDialogSource).toContain('onCancelExecution=');
  });
});
