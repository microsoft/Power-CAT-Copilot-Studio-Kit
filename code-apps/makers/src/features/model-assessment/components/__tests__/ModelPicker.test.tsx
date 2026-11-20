// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelPicker } from '../ModelPicker';
import { AgentModelPublishError } from '../../services/model-update-service';

const mocks = vi.hoisted(() => ({ update: vi.fn(), mutate: vi.fn(), publishFailure: vi.fn() }));
vi.mock('../../../../generated/services/MicrosoftDataverseService', () => ({ MicrosoftDataverseService: {} }));
vi.mock('../../hooks/useModelUpdate', () => ({
  useUpdateAgentModel: mocks.update,
  useModelPublishFailure: mocks.publishFailure,
  usePreviewModelsEnabled: () => ({ data: true, isPending: false }),
}));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  mocks.update.mockReturnValue({ isPending: false, isError: false, mutate: mocks.mutate });
  mocks.publishFailure.mockReturnValue(undefined);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render(studioUrl?: string, kitMode = false, disabled = false) {
  await act(async () => root.render(
    <FluentProvider theme={webLightTheme}>
      <ModelPicker botId="bot" harness={false} kitMode={kitMode} disabled={disabled} liveModel="GPT41" studioUrl={studioUrl} />
    </FluentProvider>,
  ));
}

describe('ModelPicker', () => {
  it('links to the agent in Copilot Studio for models the list does not offer', async () => {
    await render('https://copilotstudio.example/agent');
    expect(container.textContent).toContain('Model not found? Open and update this agent.');
    expect(container.querySelector('a')?.textContent).toBe('Open and update this agent');
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://copilotstudio.example/agent');
    expect(mocks.update).toHaveBeenCalledWith('bot', false, false);
  });

  it('asks people to wait while the new model is saved', async () => {
    mocks.update.mockReturnValue({ isPending: true, isError: false, mutate: vi.fn(), variables: undefined });
    await render();
    expect(container.textContent).toContain('Please wait while the new model is saved to the agent…');
    expect(container.querySelector('a')).toBeNull();
  });

  it('enables automatic publishing only for Kit mode and removes the manual publishing notice', async () => {
    await render(undefined, true);
    expect(mocks.update).toHaveBeenCalledWith('bot', false, true);
    expect(container.textContent).not.toContain('The model is saved without publishing.');
  });

  it('keeps the picker disabled while saving and publishing a Kit model', async () => {
    mocks.update.mockReturnValue({ isPending: true, isError: false, mutate: mocks.mutate });
    await render(undefined, true);
    expect(container.textContent).toContain('Please wait while the new model is saved and the agent is published…');
    expect(container.querySelector('select')?.disabled).toBe(true);
  });

  it('prevents model changes while the evaluation mode is being saved', async () => {
    await render(undefined, false, true);
    expect(container.querySelector('select')?.disabled).toBe(true);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it('offers a retry for a failed publication after reopening the picker', async () => {
    const failure = new AgentModelPublishError({ code: 'GPT5Chat' }, new Error('Permission denied.'));
    mocks.publishFailure.mockReturnValue(failure);
    await render(undefined, true);
    expect(container.textContent).toContain(failure.message);
    const retry = [...container.querySelectorAll('button')].find((node) => node.textContent === 'Retry publishing');
    expect(retry).toBeDefined();
    await act(async () => retry!.click());
    expect(mocks.mutate).toHaveBeenCalledWith(failure.option);
  });

  it('does not offer a Kit publication retry in Copilot Studio evaluation mode', async () => {
    mocks.publishFailure.mockReturnValue(new AgentModelPublishError({ code: 'GPT5Chat' }, new Error('Permission denied.')));
    await render();
    expect(container.textContent).not.toContain('Retry publishing');
    expect(container.textContent).not.toContain('publishing could not be confirmed');
  });

  it('uses a labelled native single-choice select and saves the selected model code', async () => {
    await render(undefined, true);
    const select = container.querySelector('select')!;
    expect(select.multiple).toBe(false);
    expect(select.value).toBe('GPT41');
    expect(select.labels?.[0].textContent).toBe('Model');
    expect(select.selectedOptions[0].textContent).toBe('GPT-4.1');
    await act(async () => {
      select.value = 'GPT5Chat';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(mocks.mutate).toHaveBeenCalledWith({ code: 'GPT5Chat' });
    expect(mocks.update).toHaveBeenCalledWith('bot', false, true);
  });

  it('does not save when the selected model is unchanged', async () => {
    await render();
    const select = container.querySelector('select')!;
    await act(async () => select.dispatchEvent(new Event('change', { bubbles: true })));
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
});
