import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FluentProvider } from '@fluentui/react-components';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from './fixtures/persisted-review.json';
import type { CopilotReviewDisplayPayload } from '../core/index.js';
import {
  CopilotReviewProgress,
  CopilotReviewProgressDialog,
  CopilotReviewResults,
  CopilotReviewSkeleton,
  CoverageTab,
  SummaryRail,
  buildReviewViewModel,
  copilotStudioAssetUrl,
  copilotStudioReviewLightTheme,
  type ReviewTabId,
} from './index.js';

afterEach(cleanup);

function fixtureModel() {
  return buildReviewViewModel(
    fixture.agentsExperience as CopilotReviewDisplayPayload,
    'You',
    42_000,
    'Travel Assistant',
  );
}

function ResultsHarness() {
  const [activeTab, setActiveTab] = useState<ReviewTabId>('findings');
  return createElement(CopilotReviewResults, {
    model: fixtureModel(),
    activeTab,
    onTabChange: setActiveTab,
  });
}

function renderWithTheme(node: React.ReactNode) {
  return render(
    <FluentProvider theme={copilotStudioReviewLightTheme}>{node}</FluentProvider>,
  );
}

describe('shared modern review UI', () => {
  it('preserves the fixture semantic output and exact review tabs', () => {
    const model = fixtureModel();
    expect(model).toEqual(fixture.expectedViewModel);

    renderWithTheme(<ResultsHarness />);

    expect(screen.getByRole('tablist', { name: 'Review views' })).toBeInTheDocument();
    const tabs = within(screen.getByRole('tablist', { name: 'Review views' })).getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toHaveTextContent('Findings2');
    expect(tabs[1]).toHaveTextContent('Agent map');
    expect(screen.getByRole('tab', { name: /Agent map/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Findings/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Skill evaluator|Evaluation coverage|All checks/ })).toBeNull();
    expect(screen.getByLabelText('2 findings need attention')).toHaveTextContent('2');
    expect(screen.getByLabelText('Review findings summary')).toHaveTextContent('2 issues found.');
    expect(screen.getByLabelText('Review summary')).toHaveTextContent('51 of 54 passed');
    expect(screen.getByLabelText('Review summary')).toHaveTextContent(
      'Grounded configuration score67',
    );
  });

  it('keeps saved check results and finding families in the consolidated list', async () => {
    const user = userEvent.setup();
    renderWithTheme(<ResultsHarness />);

    await user.click(screen.getByText(/Show \d+ other check results/));
    expect(screen.getAllByRole('button', { name: /\bTools\b/ })).not.toHaveLength(0);
    expect(within(screen.getByRole('list', { name: 'Other check results' })).getAllByRole('button', { name: /Passed/ })).toHaveLength(51);
    expect(fixtureModel().skillsGrouped.groups).toEqual(fixture.expectedViewModel.skillsGrouped.groups);
    expect(fixtureModel().coverage).toEqual(fixture.expectedViewModel.coverage);
    expect(screen.getByLabelText('Review summary')).toHaveTextContent('51 of 54 passed');
  });

  it('renders an unscored empty review as not applicable', () => {
    const summary = {
      ...fixtureModel().summary,
      score: null,
    };

    renderWithTheme(<SummaryRail summary={summary} />);

    expect(screen.getByLabelText(
      'Grounded configuration score is not applicable because no scored configuration is present',
    )).toBeInTheDocument();
    expect(screen.getByLabelText('Review summary')).toHaveTextContent(
      'Grounded configuration scoreN/A',
    );
  });

  it('supports keyboard tab navigation without changing tab semantics', async () => {
    const user = userEvent.setup();
    renderWithTheme(<ResultsHarness />);

    const findings = screen.getByRole('tab', { name: /Findings/ });
    findings.focus();
    expect(findings).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(findings).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('region', { name: 'Review findings' })).toBeInTheDocument();
  });

  it('preserves the saved-review skeleton label', () => {
    renderWithTheme(<CopilotReviewSkeleton agentName="Travel Assistant" />);

    expect(
      screen.getByRole('status', { name: 'Loading saved review for Travel Assistant' }),
    ).toHaveAttribute('aria-busy', 'true');
  });

  it('preserves determinate progressbar semantics', () => {
    renderWithTheme(
      <CopilotReviewProgress
        progress={{
          stage: 'standard-ai',
          percent: 60,
          message: 'Reviewing skill bundles',
          completedUnits: 3,
          totalUnits: 4,
          partialFailures: 0,
        }}
        agentName="Travel Assistant"
        onCancel={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('progressbar', { name: 'Running AI evaluation: 60%' }),
    ).toHaveAttribute('aria-valuenow', '0.6');
    expect(screen.getByRole('status')).toHaveTextContent('Running AI evaluation — 60%');
  });

  it('uses Fluent high-contrast-capable semantic tokens', async () => {
    const uiRoot = join(process.cwd(), 'src', 'agent-review', 'ui');
    const [summary, findings, checks, theme] = await Promise.all([
      readFile(join(uiRoot, 'components', 'SummaryRail.tsx'), 'utf8'),
      readFile(join(uiRoot, 'components', 'findings', 'FindingsList.tsx'), 'utf8'),
      readFile(join(uiRoot, 'components', 'ChecksPanel.tsx'), 'utf8'),
      readFile(join(uiRoot, 'components', 'copilotStudioReviewTheme.ts'), 'utf8'),
    ]);

    expect(summary).toContain('tokens.colorNeutralForeground1');
    expect(findings).toContain('tokens.colorNeutralForeground3');
    expect(checks).toContain('tokens.colorPaletteRedForeground1');
    expect(theme).toContain('createLightTheme');
  });

  it('does not claim a workflow can be cancelled', () => {
    const onContinueInBackground = vi.fn();
    render(
      <CopilotReviewProgressDialog
        open
        agentName="Travel Assistant"
        progress={{
          stage: 'standard-ai',
          percent: 60,
          message: 'Reviewing skill bundles',
          completedUnits: 3,
          totalUnits: 4,
          partialFailures: 0,
        }}
        isCancelling={false}
        error={null}
        onRetry={vi.fn()}
        onClose={vi.fn()}
        actions={{ canCancelExecution: false, onContinueInBackground }}
      />,
    );

    expect(screen.queryByRole('button', { name: /cancel review/i })).toBeNull();
    expect(
      screen.getByRole('button', { name: /continue in background/i }),
    ).toBeEnabled();
  });

  it('renders the Copilot Studio URL from the emitted asset helper', () => {
    const model = fixtureModel();
    const { container } = renderWithTheme(
      <CoverageTab
        coverage={model.coverage}
        summary={model.summary}
        coverageBasis={model.coverageBasis}
        coverageSets={model.coverageSets}
        evaluateUrl="https://copilotstudio.microsoft.com/evaluate"
      />,
    );

    const asset = container.querySelector('img');
    expect(asset).not.toBeNull();
    expect(asset).toHaveAttribute('src', copilotStudioAssetUrl);
    expect(asset.getAttribute('src')).toMatch(/CopilotStudio_scalable\.svg$/);
  });
});
