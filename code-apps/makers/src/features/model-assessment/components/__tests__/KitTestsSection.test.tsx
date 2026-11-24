// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssessmentEngineSection } from '../KitTestsSection';
import type { TrackedAgentVM } from '../../contracts/model-assessment';

const mocks = vi.hoisted(() => ({ options: vi.fn(), save: vi.fn(), mutate: vi.fn() }));
vi.mock('../../hooks/useKitTests', () => ({
  useKitOptions: mocks.options,
  useSaveKitSettings: mocks.save,
}));

const agent: TrackedAgentVM = {
  id: 'agent', name: 'Support', schema: 'support', sourceStatus: 'Active',
  regression: 'Not Assessed', lastRunStatus: 'None', pass: 0, fail: 0, error: 0, excluded: 0,
  kit: { enabled: true, configurationId: 'configuration-1', testSetId: 'set-1' },
  engines: { copilot: true, kit: true, harness: false },
};
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.options.mockReturnValue({
    data: {
      configurations: [{ id: 'configuration-1', name: 'First configuration' }, { id: 'configuration-2', name: 'Second configuration' }],
      testSets: [{ id: 'set-1', name: 'First test set' }, { id: 'set-2', name: 'Second test set' }],
      harness: false, published: true,
    },
  });
  mocks.save.mockReturnValue({ isPending: false, isError: false, mutate: mocks.mutate });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render(locked = false) {
  await act(async () => root.render(
    <FluentProvider theme={webLightTheme}>
      <AssessmentEngineSection agent={agent} locked={locked} />
    </FluentProvider>,
  ));
}

describe('Kit single-choice fields', () => {
  it('uses labelled required native selects and preserves the engine switch', async () => {
    await render();
    const selects = [...container.querySelectorAll('select')];
    expect(selects).toHaveLength(2);
    expect(selects.map(select => select.value)).toEqual(['configuration-1', 'set-1']);
    expect(selects.every(select => select.required && !select.multiple)).toBe(true);
    expect(selects[0].labels?.[0].textContent).toContain('Agent configuration');
    expect(selects[1].labels?.[0].textContent).toContain('Test set');
    expect(container.querySelector('[role="switch"]')).not.toBeNull();
  });

  it('saves record IDs immediately while preserving the other selected field', async () => {
    await render();
    const [configuration, testSet] = container.querySelectorAll('select');
    await act(async () => {
      configuration.value = 'configuration-2';
      configuration.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(mocks.mutate).toHaveBeenLastCalledWith({
      enabled: true, configurationId: 'configuration-2', testSetId: 'set-1',
    }, expect.objectContaining({ onError: expect.any(Function) }));
    await act(async () => {
      testSet.value = 'set-2';
      testSet.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(mocks.mutate).toHaveBeenLastCalledWith({
      enabled: true, configurationId: 'configuration-2', testSetId: 'set-2',
    }, expect.objectContaining({ onError: expect.any(Function) }));
  });

  it.each([true, false])('locks both fields while an assessment or save is active (assessment: %s)', async locked => {
    mocks.save.mockReturnValue({ isPending: !locked, isError: false, mutate: mocks.mutate });
    await render(locked);
    expect([...container.querySelectorAll('select')].every(select => select.disabled)).toBe(true);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it('keeps empty selections explicit instead of silently selecting the first records', async () => {
    await act(async () => root.render(
      <FluentProvider theme={webLightTheme}>
        <AssessmentEngineSection agent={{ ...agent, kit: { enabled: true } }} />
      </FluentProvider>,
    ));
    expect([...container.querySelectorAll('select')].map(select => select.value)).toEqual(['', '']);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
});
