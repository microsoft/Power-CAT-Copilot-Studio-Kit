// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AdvancedTestingRouter from '../../AdvancedTestingRouter';
import { QuickActions } from '../QuickActions';

vi.mock('../../AdvancedTesting', () => ({ default: () => <QuickActions /> }));
vi.mock('../../setup/SetupScreen', () => ({ default: () => <h1>Testing setup</h1> }));
vi.mock('../../../model-assessment/ModelAssessmentPage', () => ({
  default: () => <h1>Model Assessment destination</h1>,
}));
vi.mock('../../../../shared/hooks/useFeatureTelemetry', () => ({ useFeatureTelemetry: vi.fn() }));
vi.mock('../../../../shared/utils/mda-navigation', () => ({ navigateToMda: vi.fn() }));

afterEach(() => vi.unstubAllGlobals());

describe('Advanced Testing Model Assessment navigation', () => {
  it.each([
    ['/advanced-testing', true, 'Model Assessment destination'],
    ['/advanced-testing/model-assessment', false, 'Model Assessment destination'],
    ['/advanced-testing/setup', false, 'Testing setup'],
  ])('preserves the destination from %s', async (path, clickAction, heading) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/advanced-testing/*" element={<AdvancedTestingRouter />} />
          </Routes>
        </MemoryRouter>,
      ));
      if (clickAction) {
        const action = [...container.querySelectorAll('button')]
          .find(button => button.textContent === 'Model assessment');
        expect(action).toBeDefined();
        expect(container.textContent).not.toContain('Share evaluations');
        await act(async () => action!.click());
      }
      expect(container.querySelector('h1')?.textContent).toBe(heading);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
