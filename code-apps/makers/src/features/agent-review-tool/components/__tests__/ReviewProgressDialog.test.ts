import { createElement, Fragment, type PropsWithChildren } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  createDOMRenderer, RendererProvider, renderToStyleElements, SSRProvider,
} from '@fluentui/react-components';
import { describe, expect, it, vi } from 'vitest';
import { CopilotReviewProgressDialog } from '../../agents-experience/components/CopilotReviewProgressDialog';
import { DAReviewProgressDialog } from '../../declarative-agent/components/DAReviewProgressDialog';

vi.mock('@fluentui/react-components', async importOriginal => ({
  ...await importOriginal<typeof import('@fluentui/react-components')>(),
  // Portals have no server-rendered DOM; keep the actual dialog content visible to these checks.
  DialogSurface: ({ children }: PropsWithChildren) => createElement('section', null, children),
}));

const noop = () => undefined;

function renderCopilot(error: string | null = null, renderer = createDOMRenderer()) {
  return renderToStaticMarkup(createElement(
    RendererProvider,
    { renderer },
    createElement(
      SSRProvider,
      null,
      createElement(CopilotReviewProgressDialog, {
        open: true, agentName: 'Sample agent', progress: null, error,
        isCancelling: false, onCancel: noop, onRetry: noop, onClose: noop,
      }),
    ),
  ));
}

describe('initial review progress dialog content', () => {
  it('bounds scrolling with the native dialog body without adding a new grid gap', () => {
    const renderer = createDOMRenderer();
    expect(renderCopilot(null, renderer)).toContain('class="fui-DialogBody ');
    const css = renderToStaticMarkup(createElement(Fragment, null, ...renderToStyleElements(renderer)));
    expect(css).toMatch(/\{gap:var\(--spacingVerticalNone\);?\}/);
  });

  it('shows all six Copilot steps and announces initializing at zero, not completion', () => {
    const html = renderCopilot();

    expect(html.match(/<li /g)).toHaveLength(6);
    expect(html).toContain('Initializing in progress');
    expect(html).toContain('aria-valuetext="0%"');
    expect(html.match(/>not started</g)).toHaveLength(5);
    expect(html).toMatch(/aria-live="polite"[^>]*>Initializing</);
    expect(html).not.toContain('Review complete.');
    expect(html).not.toContain('aria-valuetext="100%"');
    expect(html).not.toContain('>completed<');
  });

  it('shows initializing as failed at zero if Copilot fails before any progress', () => {
    const html = renderCopilot('Synthetic initialization failure');

    expect(html.match(/<li /g)).toHaveLength(6);
    expect(html).toContain('Synthetic initialization failure');
    expect(html).toContain('aria-valuetext="0%"');
    expect(html).toContain('>failed<');
    expect(html.match(/>not started</g)).toHaveLength(5);
    expect(html).not.toContain(' in progress');
    expect(html).not.toContain('>completed<');
    expect(html).not.toContain('Review complete.');
    expect(html).toContain('>Retry</');
  });

  it.each([true, false])('shows DA steps before progress with custom skills: %s', (hasCustomSkills) => {
    const html = renderToStaticMarkup(createElement(
      SSRProvider,
      null,
      createElement(DAReviewProgressDialog, {
        open: true, agentName: 'Sample agent', progress: null, error: null,
        workflowBacked: true, hasCustomSkills, onCancel: noop, onRetry: noop,
      }),
    ));

    expect(html.match(/<li /g)).toHaveLength(hasCustomSkills ? 6 : 5);
    expect(html).toContain('Preparing manifest in progress');
    expect(html).toContain('aria-valuetext="0%"');
    expect(html).not.toContain('Review complete.');
    expect(html).not.toContain('>completed<');
  });
});
