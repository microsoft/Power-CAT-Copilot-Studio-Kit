// @vitest-environment jsdom
import { FluentProvider, MessageBar, MessageBarBody, webLightTheme } from '@fluentui/react-components';
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalStageAOutput } from '../../../contracts/StageOutputs';
import { HARNESS_FIT_CLEAR_BENEFIT_QUOTE, HARNESS_FIT_NO_MOVE_QUOTE } from '../../../utils/harnessFit';
import { HarnessFitPanel, type HarnessFitPanelProps } from '../HarnessFitPanel';

const CHOOSE_HARNESS = 'https://learn.microsoft.com/microsoft-copilot-studio/guidance/choose-harness';
const UNAVAILABLE = 'Harness fit is unavailable because this review does not contain a readable source snapshot.';
const CAN_FIT_TITLE = 'The Microsoft Copilot harness can be a good fit for this agent.';
const NO_ADVICE_TEXT = 'The review found no sign that this agent needs a different harness.';

let container: HTMLDivElement;
let root: Root;

function stageA(overrides: Record<string, unknown> = {}): LocalStageAOutput {
  return {
    botId: 'workshop-agent',
    botName: 'Workshop Agent',
    topicCount: 0,
    toolCount: 0,
    knowledgeCount: 0,
    testCaseCount: 0,
    localPatterns: [],
    topics: [],
    tools: [],
    knowledgeSources: [],
    orchestrationMode: 'generative',
    topicComponents: [],
    ...overrides,
  } as unknown as LocalStageAOutput;
}

async function show(element: ReactElement): Promise<void> {
  await act(async () => root.render(createElement(FluentProvider, { theme: webLightTheme }, element)));
}

async function showPanel(props: Partial<HarnessFitPanelProps>): Promise<void> {
  await show(createElement(HarnessFitPanel, {
    stageA: null,
    isLoading: false,
    onOpenUpgradeReadiness: vi.fn(),
    ...props,
  }));
}

function buttonNamed(name: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll<HTMLButtonElement>('button')]
    .find(node => node.textContent?.trim() === name);
}

function expectLearnLink(quote: Element | null): void {
  const link = quote?.parentElement?.querySelector('a');
  expect(link?.getAttribute('href')).toBe(CHOOSE_HARNESS);
  expect(link?.getAttribute('target')).toBe('_blank');
  expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
  expect(link?.getAttribute('aria-label')).toBe('Microsoft Learn, opens in a new tab');
  expect(link?.textContent).toBe('Microsoft Learn');
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('HarnessFitPanel', () => {
  it('shows a spinner while the saved review loads', async () => {
    await showPanel({ isLoading: true, stageA: stageA({ toolCount: 12 }) });

    expect(container.textContent).toContain('Loading saved harness fit...');
    expect(container.querySelector('.fui-MessageBar')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
  });

  it('shows that harness fit is unavailable when the review has no readable snapshot', async () => {
    await showPanel({ stageA: null });
    expect(container.textContent).toContain(UNAVAILABLE);
    expect(container.querySelector('button')).toBeNull();

    await showPanel({ stageA: stageA({ toolCount: 12, configurationAvailable: false }) });
    expect(container.textContent).toContain(UNAVAILABLE);
    expect(container.textContent).not.toContain(CAN_FIT_TITLE);
    expect(container.querySelector('button')).toBeNull();
  });

  it('shows the reasons and the Learn quote when the Copilot harness can be a good fit', async () => {
    await showPanel({ stageA: stageA({ toolCount: 12 }) });

    expect(container.textContent).toContain(CAN_FIT_TITLE);
    expect(container.textContent).toContain('The review found these signs:');
    expect([...container.querySelectorAll('li')].map(node => node.textContent)).toEqual([
      'The agent has 12 tools (10 or more).',
    ]);
    const quote = container.querySelector('q');
    expect(quote?.textContent).toBe(HARNESS_FIT_CLEAR_BENEFIT_QUOTE.text);
    expect(quote?.parentElement?.textContent).toBe(
      `${HARNESS_FIT_CLEAR_BENEFIT_QUOTE.lead} ${HARNESS_FIT_CLEAR_BENEFIT_QUOTE.text} Microsoft Learn`,
    );
    expectLearnLink(quote);
    expect(buttonNamed('Open upgrade readiness')).toBeDefined();
    const heading = container.querySelector('h3');
    expect(heading?.textContent).toBe(CAN_FIT_TITLE);
    expect(heading?.id).toBeTruthy();
    expect(heading?.closest('section')?.getAttribute('aria-labelledby')).toBe(heading?.id);
    expect(container.querySelector('.fui-MessageBar')).toBeNull();
  });

  it('calls onOpenUpgradeReadiness 1 time when the user clicks Open upgrade readiness', async () => {
    const onOpenUpgradeReadiness = vi.fn();
    await showPanel({ stageA: stageA({ toolCount: 12 }), onOpenUpgradeReadiness });

    const button = buttonNamed('Open upgrade readiness');
    expect(button, 'Open upgrade readiness button').toBeDefined();
    await act(async () => button!.click());
    expect(onOpenUpgradeReadiness).toHaveBeenCalledTimes(1);
  });

  it('shows the no-advice text and the Learn quote without a button', async () => {
    await showPanel({ stageA: stageA() });

    expect(container.textContent).toContain(NO_ADVICE_TEXT);
    expect(container.textContent).not.toContain(CAN_FIT_TITLE);
    const quote = container.querySelector('q');
    expect(quote?.textContent).toBe(HARNESS_FIT_NO_MOVE_QUOTE.text);
    expect(quote?.parentElement?.textContent).toBe(`${HARNESS_FIT_NO_MOVE_QUOTE.text} Microsoft Learn`);
    expectLearnLink(quote);
    expect(container.querySelectorAll('li')).toHaveLength(0);
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('h3')).toBeNull();
    expect(container.querySelector('.fui-MessageBar')).toBeNull();
  });

  it('shows only the unavailable state as an information message bar', async () => {
    await show(createElement(MessageBar, { intent: 'info' }, createElement(MessageBarBody, null, 'Reference')));
    const infoIcon = container.querySelector('.fui-MessageBar__icon')?.innerHTML;
    expect(infoIcon).toContain('<svg');

    await showPanel({ stageA: null });
    const bars = container.querySelectorAll('.fui-MessageBar');
    expect(bars).toHaveLength(1);
    expect(bars[0].querySelector('.fui-MessageBar__icon')?.innerHTML).toBe(infoIcon);

    for (const snapshot of [stageA({ toolCount: 12 }), stageA()]) {
      await showPanel({ stageA: snapshot });
      expect(container.querySelectorAll('.fui-MessageBar')).toHaveLength(0);
    }
  });
});
