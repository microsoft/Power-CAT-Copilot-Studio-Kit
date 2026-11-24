// @vitest-environment jsdom
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  StandardWorkspaceNavigation,
  type StandardWorkspaceNavigationProps,
} from '../StandardWorkspaceNavigation';

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function renderNavigation(
  overrides: Partial<StandardWorkspaceNavigationProps> = {},
): Promise<StandardWorkspaceNavigationProps> {
  const props: StandardWorkspaceNavigationProps = {
    selectedWorkspace: 'findings',
    findingCount: 3,
    findingSummary: '2 failed pattern checks and 1 instruction findings',
    onWorkspaceChange: vi.fn(),
    ...overrides,
  };
  await act(async () => root.render(
    createElement(
      FluentProvider,
      { theme: webLightTheme },
      createElement(StandardWorkspaceNavigation, props),
    ),
  ));
  return props;
}

function workspaceTabs(): HTMLButtonElement[] {
  return [...container.querySelectorAll<HTMLButtonElement>('button[role="tab"]')];
}

function workspaceTab(value: string): HTMLButtonElement {
  const tab = workspaceTabs().find(node => node.value === value);
  expect(tab, `Workspace tab ${value}`).toBeDefined();
  return tab!;
}

function labelOf(tab: HTMLElement): string {
  return tab.querySelector('.fui-Tab__content')?.textContent?.trim() ?? '';
}

describe('StandardWorkspaceNavigation', () => {
  it('shows Review findings, Architecture, and Harness in this order', async () => {
    await renderNavigation();

    expect(workspaceTabs().map(tab => tab.value)).toEqual(['findings', 'agent-map', 'harness']);
    expect(labelOf(workspaceTab('findings'))).toContain('Review findings');
    expect(labelOf(workspaceTab('agent-map'))).toBe('Architecture');
    expect(labelOf(workspaceTab('harness'))).toBe('Harness');
  });

  it('shows the count badge on Review findings only', async () => {
    await renderNavigation();

    expect(
      workspaceTab('findings').querySelector('.fui-Tab__content .fui-Badge')?.textContent,
    ).toBe('3');
    expect(workspaceTab('agent-map').querySelector('.fui-Badge')).toBeNull();
    expect(workspaceTab('harness').querySelector('.fui-Badge')).toBeNull();
  });

  it('selects the Harness workspace when the maker clicks Harness', async () => {
    const props = await renderNavigation();

    await act(async () => workspaceTab('harness').click());

    expect(props.onWorkspaceChange).toHaveBeenCalledTimes(1);
    expect(props.onWorkspaceChange).toHaveBeenCalledWith('harness');
  });

  it('marks the Harness tab as selected for the Harness workspace', async () => {
    await renderNavigation({ selectedWorkspace: 'harness' });

    expect(workspaceTab('harness').getAttribute('aria-selected')).toBe('true');
    expect(workspaceTab('findings').getAttribute('aria-selected')).toBe('false');
  });
});
