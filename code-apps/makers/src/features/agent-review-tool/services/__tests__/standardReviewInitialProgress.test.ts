import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { SSRProvider } from '@fluentui/react-components';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReviewProgressDialogProps } from '../../components/dialogs/ReviewProgressDialog';
import { StandardReviewRunnerProvider } from '../../context/StandardReviewRunner';

const { mutation, dialog } = vi.hoisted(() => ({
  mutation: {
    isPending: false, error: null as Error | null,
    reset: vi.fn(), mutate: vi.fn(),
  },
  dialog: vi.fn<(props: ReviewProgressDialogProps) => null>(() => null),
}));

vi.mock('../../hooks/useReviewMutation', () => ({
  useReviewMutation: () => mutation,
}));
vi.mock('../../components/dialogs/ReviewProgressDialog', () => ({
  ReviewProgressDialog: dialog,
}));
vi.mock('../../agents-experience/services/jobs/ReviewJobService', () => ({
  findLatestJobForBot: vi.fn(),
}));
vi.mock('../../utils/reviewTelemetry', () => ({
  logReviewStarted: vi.fn(),
}));

function initialDialog() {
  renderToStaticMarkup(createElement(
    SSRProvider,
    null,
    createElement(MemoryRouter, null, createElement(StandardReviewRunnerProvider, null)),
  ));
  return dialog.mock.calls.at(-1)![0];
}

describe('Standard review initial progress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutation.error = null;
  });

  it('supplies the six initial steps before its first progress callback', () => {
    const { stages } = initialDialog();

    expect(stages.map(stage => stage.stageName)).toEqual([
      'Initializing', 'Parsing Configuration', 'Evaluating Patterns',
      'Checking Compliance', 'Saving Results', 'Complete',
    ]);
    expect(stages.map(stage => stage.status)).toEqual([
      'active', 'pending', 'pending', 'pending', 'pending', 'pending',
    ]);
    expect(stages[0].progress).toBe(0);
    expect(stages.filter(stage => stage.attribution).map(stage => stage.stageName))
      .toEqual(['Evaluating Patterns', 'Checking Compliance']);
    expect(mutation.mutate).not.toHaveBeenCalled();
  });

  it('supplies a failed first step at zero for a failure before progress', () => {
    mutation.error = new Error('Synthetic initialization failure');
    const { stages, error } = initialDialog();

    expect(error).not.toBeNull();
    expect(stages).toHaveLength(6);
    expect(stages[0].status).toBe('error');
    expect(stages[0].progress).toBe(0);
    expect(stages.slice(1).every(stage => stage.status === 'pending')).toBe(true);
    expect(stages.some(stage => stage.status === 'active' || stage.status === 'completed')).toBe(false);
    expect(mutation.mutate).not.toHaveBeenCalled();
  });
});
