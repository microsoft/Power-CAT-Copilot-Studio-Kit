/**
 * Contract tests for restoring the active tab from the `?tab=` query string.
 *
 * A review now opens on its own screen, so the breadcrumb out of it has to put
 * the reader back on the tab they started from. Nothing persists the active
 * tab, so without this the breadcrumb silently drops everyone on the first tab
 * and the review they just ran looks lost. The query string carries it because
 * that also survives a reload and can be shared, unlike router state.
 *
 * Rendered through `react-dom/server` with `createElement`, so the file stays
 * `.ts` and needs no jsdom, matching the other tests in this feature.
 */
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The provider seeds the environment ID from the Power Apps SDK, which cannot
// resolve outside a PAC host. A never-settling promise is honest here: that is
// what the real call does locally, and the tab must not wait on it.
vi.mock('@microsoft/power-apps/app', () => ({
  getContext: () => new Promise(() => {}),
}));

import { FilterProvider, useFilterContext } from '../FilterContext';

/** Prints the active tab so the assertion can read it out of the markup. */
function Probe(): ReactElement {
  const {
    activeAgentType,
    searchQuery,
    selectedOrgUrl,
    selectedOrgLabel,
    selectedEnvironmentId,
  } = useFilterContext();
  return createElement('span', null, JSON.stringify({
    activeAgentType,
    searchQuery,
    selectedOrgUrl,
    selectedOrgLabel,
    selectedEnvironmentId,
  }));
}

function renderAt(url: string): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [url] },
      createElement(FilterProvider, null, createElement(Probe)),
    ),
  );
}

describe('FilterProvider tab restore', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
    } satisfies Storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('restores the skills tab from the query string', () => {
    expect(renderAt('/agent-review-tool?tab=skills-automations')).toContain('skills-automations');
  });

  it('restores the declarative tab from the query string', () => {
    expect(renderAt('/agent-review-tool?tab=declarative-agent')).toContain('declarative-agent');
  });

  it('defaults to the first tab when no tab is requested', () => {
    expect(renderAt('/agent-review-tool')).toContain('copilot-studio');
  });

  it('ignores an unknown tab rather than rendering an empty strip', () => {
    expect(renderAt('/agent-review-tool?tab=nonsense')).toContain('copilot-studio');
  });

  it('restores the selected environment and search after a routed review unmounts the provider', () => {
    sessionStorage.setItem('agent-review-tool.filter-state.v1', JSON.stringify({
      searchQuery: 'ZAVA',
      selectedOrgUrl: 'https://contoso.crm.dynamics.com',
      selectedOrgLabel: 'ZAVA development',
      selectedEnvironmentId: '00000000-0000-0000-0000-000000000000',
    }));

    const html = renderAt('/agent-review-tool');

    expect(html).toContain('ZAVA');
    expect(html).toContain('https://contoso.crm.dynamics.com');
    expect(html).toContain('ZAVA development');
    expect(html).toContain('00000000-0000-0000-0000-000000000000');
  });
});
