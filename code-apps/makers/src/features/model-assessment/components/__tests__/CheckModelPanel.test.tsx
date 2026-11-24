// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckModelPanel, type CheckModelPanelProps } from '../CheckModelPanel';
import type { TrackedAgentVM } from '../../contracts/model-assessment';

const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  start: vi.fn(),
  follow: vi.fn(),
  beforeStart: vi.fn(),
  cancel: vi.fn(),
  close: vi.fn(),
}));
vi.mock('../../hooks/useAssessmentCheck', () => ({ useAssessmentCheck: mocks.check }));
vi.mock('../../hooks/useKitTests', () => ({ useKitProgress: () => undefined }));

const warning = 'Model unchanged since the last run. Update the model, then select Run.';
const agent: TrackedAgentVM = {
  id: 'agent',
  name: 'Agent',
  schema: 'agent',
  sourceStatus: 'Active',
  currentModel: 'GPT41',
  liveModel: 'GPT41',
  regression: '',
  lastRunStatus: '',
  pass: 0,
  fail: 0,
  error: 0,
  excluded: 0,
};
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  mocks.check.mockReturnValue({
    phase: 'idle',
    start: mocks.start,
    follow: mocks.follow,
    cancel: mocks.cancel,
  });
  mocks.beforeStart.mockResolvedValue(warning);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const separatedLayout: CheckModelPanelProps['renderLayout'] = (content, actions) => (
  <><section data-testid="body">{content}</section><footer>{actions}</footer></>
);

async function render(current = agent, renderLayout?: CheckModelPanelProps['renderLayout']) {
  await act(async () => root.render(
    <FluentProvider theme={webLightTheme}>
      <CheckModelPanel
        agent={current}
        beforeStart={mocks.beforeStart}
        onCancel={mocks.close}
        renderLayout={renderLayout}
      >
        Model history content
      </CheckModelPanel>
    </FluentProvider>,
  ));
}

async function continueAssessment() {
  const button = [...container.querySelectorAll('button')].find((node) => node.textContent === 'Run');
  expect(button).toBeDefined();
  await act(async () => button!.click());
}

describe('CheckModelPanel model validation notice', () => {
  it('keeps footer actions and validation state connected to independently rendered content', async () => {
    await render(agent, separatedLayout);
    const body = container.querySelector('[data-testid="body"]')!;
    const footer = container.querySelector('footer')!;
    expect(body.textContent).toContain('Model history content');
    expect(body.querySelector('button')).toBeNull();
    expect([...footer.querySelectorAll('button')].map(button => button.textContent)).toEqual(['Run', 'Cancel']);
    await continueAssessment();
    expect(footer.textContent).toContain(warning);
    expect(body.textContent).not.toContain(warning);
    await render({ ...agent, liveModel: 'GPT5Chat' }, separatedLayout);
    expect(footer.textContent).not.toContain(warning);
    mocks.beforeStart.mockResolvedValue(undefined);
    await continueAssessment();
    expect(mocks.start).toHaveBeenCalledOnce();
    const cancel = [...footer.querySelectorAll('button')].find(button => button.textContent === 'Cancel')!;
    await act(async () => cancel.click());
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('preserves the disabled running action and cancel confirmation with a separate footer', async () => {
    mocks.check.mockReturnValue({
      phase: 'tracking',
      requestKey: 'run',
      start: mocks.start,
      follow: mocks.follow,
      cancel: mocks.cancel,
    });
    await render(agent, separatedLayout);
    const [running, cancel] = container.querySelectorAll<HTMLButtonElement>('footer button');
    expect(running.textContent).toBe('Run');
    expect(running.disabled).toBe(true);
    expect(cancel.disabled).toBe(false);
    await act(async () => cancel.click());
    const confirm = [...document.querySelectorAll('button')].find(button => button.textContent === 'Cancel assessment')!;
    await act(async () => confirm.click());
    expect(mocks.cancel).toHaveBeenCalledOnce();
    expect(mocks.close).not.toHaveBeenCalled();
  });

  it.each(['idle', 'requesting', 'tracking', 'terminal'])('keeps Run icon-free and unchanged during %s', async phase => {
    mocks.check.mockReturnValue({
      phase,
      start: mocks.start,
      follow: mocks.follow,
      cancel: mocks.cancel,
    });
    await render(agent, separatedLayout);
    const button = container.querySelector<HTMLButtonElement>('footer button')!;
    expect(button.textContent).toBe('Run');
    expect(button.querySelector('.fui-Button__icon, svg, [role="progressbar"]')).toBeNull();
    expect(button.disabled).toBe(phase === 'requesting' || phase === 'tracking');
  });

  it('closes the confirmation and side pane without cancelling when Run in background is selected', async () => {
    mocks.check.mockReturnValue({
      phase: 'tracking',
      requestKey: 'run',
      start: mocks.start,
      follow: mocks.follow,
      cancel: mocks.cancel,
    });
    await render(agent, separatedLayout);
    const cancel = [...container.querySelectorAll<HTMLButtonElement>('footer button')].find(button => button.textContent === 'Cancel')!;
    await act(async () => cancel.click());
    const background = [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Run in background')!;
    const actions = background.closest('.fui-DialogActions')!;
    expect(getComputedStyle(actions).gridColumnStart).toBe('1');
    for (const button of actions.querySelectorAll('button')) {
      expect(getComputedStyle(button).whiteSpace).toBe('nowrap');
      expect(getComputedStyle(button).flexShrink).toBe('0');
    }
    await act(async () => background.click());
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector<HTMLButtonElement>('footer button')!.disabled).toBe(true);
  });

  it('keeps Run text and no icon while verifying the model before starting', async () => {
    let finish!: (message: string | undefined) => void;
    mocks.beforeStart.mockReturnValue(new Promise<string | undefined>(resolve => { finish = resolve; }));
    await render(agent, separatedLayout);
    const button = container.querySelector<HTMLButtonElement>('footer button')!;
    await act(async () => button.click());
    expect(button.textContent).toBe('Run');
    expect(button.querySelector('.fui-Button__icon, svg, [role="progressbar"]')).toBeNull();
    expect(button.disabled).toBe(true);
    await act(async () => finish(undefined));
    expect(mocks.start).toHaveBeenCalledOnce();
  });

  it('keeps the warning until the live model changes, then clears it without starting a run', async () => {
    await render();
    await continueAssessment();
    expect(container.textContent).toContain(warning);
    expect(mocks.start).not.toHaveBeenCalled();
    await render({ ...agent, name: 'Renamed agent' });
    expect(container.textContent).toContain(warning);
    await render({ ...agent, liveModel: 'GPT5Chat', modelChangePending: true });
    expect(container.textContent).not.toContain(warning);
    expect(mocks.start).not.toHaveBeenCalled();
    await render();
    expect(container.textContent).not.toContain(warning);
  });

  it('clears the warning when the tracked model updates', async () => {
    await render();
    await continueAssessment();
    await render({ ...agent, currentModel: 'GPT5Chat' });
    expect(container.textContent).not.toContain(warning);
  });

  it('still validates the model again before starting the assessment', async () => {
    await render();
    await continueAssessment();
    await render({ ...agent, liveModel: 'GPT5Chat' });
    mocks.beforeStart.mockResolvedValue(undefined);
    await continueAssessment();
    expect(mocks.beforeStart).toHaveBeenCalledTimes(2);
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain(warning);
  });

  it('preserves a cancellation warning when the model changes', async () => {
    mocks.check.mockReturnValue({
      phase: 'tracking',
      requestKey: 'run',
      start: mocks.start,
      follow: mocks.follow,
      cancel: mocks.cancel,
    });
    mocks.cancel.mockResolvedValue('Could not cancel the assessment.');
    await render();
    const cancel = [...container.querySelectorAll('button')].find((node) => node.textContent === 'Cancel');
    expect(cancel).toBeDefined();
    await act(async () => cancel!.click());
    const confirm = [...document.querySelectorAll('button')].find((node) => node.textContent === 'Cancel assessment');
    expect(confirm).toBeDefined();
    await act(async () => confirm!.click());
    await render({ ...agent, liveModel: 'GPT5Chat' });
    expect(container.textContent).toContain('Could not cancel the assessment.');
  });
});
