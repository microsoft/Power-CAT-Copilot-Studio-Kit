// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentDrawer, type AgentDrawerProps } from '../AgentDrawer';

const mocks = vi.hoisted(() => ({ compare: vi.fn(), invalidate: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({}),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));
vi.mock('../../services/agent-links', () => ({ getAssessmentAgentUrl: vi.fn() }));
vi.mock('../../services/agent-discovery-service', () => ({ getLiveAgentModel: vi.fn() }));
vi.mock('../../hooks/useModelUpdate', () => ({
  useModelUpdating: () => false,
  useModelPublishFailure: () => undefined,
}));
vi.mock('../../hooks/useKitTests', () => ({ useKitSettingsSaving: () => false }));
vi.mock('../KitTestsSection', () => ({ AssessmentEngineSection: () => null }));
vi.mock('../ModelPicker', () => ({ ModelPicker: () => null }));
vi.mock('../ModelSwitchGuide', () => ({ ModelSwitchGuide: () => null }));
vi.mock('../CheckModelPanel', () => ({
  CheckModelPanel: ({ children, renderLayout }: {
    children: (busy: boolean, progress: boolean, finished: boolean) => ReactNode;
    renderLayout: (content: ReactNode, actions: ReactNode) => ReactNode;
  }) => renderLayout(children(false, false, false), <><button>Run</button><button>Cancel</button></>),
}));
vi.mock('@fluentui/react-components', async (importOriginal) => ({
  ...await importOriginal<typeof import('@fluentui/react-components')>(),
  OverlayDrawer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const props: AgentDrawerProps = {
  open: true,
  onClose: () => {},
  onCompare: mocks.compare,
  canCompare: history => history.id === 'completed',
  agent: {
    id: 'agent', name: 'Support', schema: 'support', sourceStatus: 'Active',
    regression: 'Healthy', lastRunStatus: 'Completed', currentModel: 'GPT41',
    pass: 1, fail: 0, error: 0, excluded: 0,
  },
  detail: {
    runs: [{
      id: 'run', name: 'Run', status: 'Completed', analysisStatus: 'Completed',
      regression: 'Healthy', pass: 1, fail: 0, error: 0, excluded: 0,
    }],
    history: [
      { id: 'completed', changeType: 'Model Changed', previousModel: 'GPT41', currentModel: 'GPT5Chat', on: '2026-10-26T10:00:00Z' },
      { id: 'empty', changeType: 'Baseline', currentModel: 'GPT41', on: '2026-10-25T10:00:00Z' },
    ],
    resultsFor: () => [],
  },
};
let root: Root;
let container: HTMLDivElement;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(
    <FluentProvider theme={webLightTheme}><AgentDrawer {...props} /></FluentProvider>,
  ));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('Model history record actions', () => {
  it('keeps history in the scrollable body and actions in an independent footer', () => {
    const body = container.querySelector('.fui-DrawerBody')!;
    const footer = container.querySelector('.fui-DrawerFooter')!;
    expect(body.textContent).toContain('Model history');
    expect([...body.querySelectorAll('button')].map(button => button.textContent)).not.toContain('Run');
    expect(footer.textContent).toBe('RunCancel');
    expect(body.parentElement).toBe(footer.parentElement);
    expect(body.nextElementSibling).toBe(footer);
  });

  it('keeps the model records and dates without repeated visible Compare labels or chevrons', () => {
    expect(container.textContent).toContain('Model history');
    expect(container.textContent).toContain('GPT-4.1');
    expect(container.textContent).toContain('GPT-5 Chat');
    expect(container.textContent).not.toContain('Compare');
    expect(container.querySelectorAll('time')).toHaveLength(2);
    expect(container.querySelector('[data-icon-name*="ChevronRight"]')).toBeNull();
  });

  it('makes only eligible records focusable actions with an accessible comparison label', () => {
    const records = [...container.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="dialog"]')];
    expect(records).toHaveLength(1);
    expect(records[0].getAttribute('aria-label')).toMatch(/^Compare model run from /);
    expect(records[0].disabled).toBe(false);
    expect(records[0].tabIndex).toBe(0);
    expect(records[0].textContent).toContain('GPT-5 Chat');
    const transition = records[0].firstElementChild!;
    expect(transition.children).toHaveLength(1);
    expect(transition.firstElementChild!.textContent).toBe('GPT-4.1 → GPT-5 Chat');
    expect(records[0].querySelector('a, button')).toBeNull();
    expect(container.querySelector('time[datetime="2026-10-25T10:00:00Z"]')?.closest('button')).toBeNull();
  });

  it('opens comparison for the selected record and preserves its trigger for focus restoration', async () => {
    const record = container.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!;
    record.focus();
    expect(document.activeElement).toBe(record);
    await act(async () => record.click());
    expect(mocks.compare).toHaveBeenCalledExactlyOnceWith(props.detail.history[0], record);
  });
});

describe('Model history disclosure', () => {
  const history = Array.from({ length: 12 }, (_, index) => ({
    ...props.detail.history[0],
    id: `history-${index}`,
    on: `2026-10-${String(26 - index).padStart(2, '0')}T10:00:00Z`,
  }));
  const longHistoryProps: AgentDrawerProps = {
    ...props,
    detail: { ...props.detail, history },
    canCompare: entry => entry.id === 'history-11',
  };
  const renderDrawer = async (value: AgentDrawerProps) => {
    await act(async () => root.render(
      <FluentProvider theme={webLightTheme}><AgentDrawer {...value} /></FluentProvider>,
    ));
  };
  const toggle = () => container.querySelector<HTMLButtonElement>('button[aria-expanded]')!;
  const dates = () => [...container.querySelectorAll('time')].map(time => time.dateTime);

  it('shows ten recent records, expands all records with comparison intact, and collapses with focus retained', async () => {
    await renderDrawer(longHistoryProps);
    expect(dates()).toEqual(history.slice(0, 10).map(entry => entry.on));
    const button = toggle();
    expect(button.textContent).toBe('Show more');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    const controlledId = button.getAttribute('aria-controls')!;
    expect(document.getElementById(controlledId)?.querySelectorAll('time')).toHaveLength(10);
    button.focus();

    await act(async () => button.click());
    expect(dates()).toEqual(history.map(entry => entry.on));
    expect(toggle()).toBe(button);
    expect(button.textContent).toBe('Show less');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(button);
    const comparison = container.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!;
    await act(async () => comparison.click());
    expect(mocks.compare).toHaveBeenCalledExactlyOnceWith(history[11], comparison);

    await act(async () => button.click());
    expect(dates()).toEqual(history.slice(0, 10).map(entry => entry.on));
    expect(button.textContent).toBe('Show more');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
  });

  it.each([0, 1, 10])('does not offer disclosure for %i history records', async count => {
    await renderDrawer({ ...props, detail: { ...props.detail, history: history.slice(0, count) } });
    expect(container.querySelector('button[aria-expanded]')).toBeNull();
    expect(container.querySelectorAll('time')).toHaveLength(count);
  });

  it.each(['agent change', 'drawer reopen'])('resets expansion on %s', async reason => {
    await renderDrawer(longHistoryProps);
    await act(async () => toggle().click());
    expect(dates()).toHaveLength(12);
    if (reason === 'agent change') {
      await renderDrawer({ ...longHistoryProps, agent: { ...props.agent!, id: 'another-agent' } });
    } else {
      await renderDrawer({ ...longHistoryProps, open: false });
      await renderDrawer(longHistoryProps);
    }
    expect(dates()).toHaveLength(10);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('preserves expansion for same-agent history refreshes and handles a shortened history', async () => {
    await renderDrawer(longHistoryProps);
    await act(async () => toggle().click());
    const refreshedHistory = [{ ...history[0], id: 'newest', on: '2026-10-27T10:00:00Z' }, ...history];
    await renderDrawer({ ...longHistoryProps, detail: { ...props.detail, history: refreshedHistory } });
    expect(dates()).toEqual(refreshedHistory.map(entry => entry.on));
    expect(toggle().textContent).toBe('Show less');

    await renderDrawer({ ...longHistoryProps, detail: { ...props.detail, history: history.slice(0, 3) } });
    expect(dates()).toHaveLength(3);
    expect(container.querySelector('button[aria-expanded]')).toBeNull();
  });
});
