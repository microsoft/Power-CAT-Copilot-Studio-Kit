import { createElement, Fragment, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  createDOMRenderer,
  RendererProvider,
  renderToStyleElements,
  SSRProvider,
} from '@fluentui/react-components';
import { describe, expect, it } from 'vitest';
import type { ProgressStage } from '../../hooks/useReviewMutation';
import { ReviewProgressStages } from '../dialogs/ReviewProgressStages';
import { ReviewStageAttribution } from '../dialogs/ReviewStageAttribution';

function render(stages: readonly ProgressStage[]) {
  return renderToStaticMarkup(createElement(
    SSRProvider,
    null,
    createElement(ReviewProgressStages, { stages }),
  ));
}

function renderCss(element: ReactElement) {
  const renderer = createDOMRenderer();
  renderToStaticMarkup(createElement(
    RendererProvider,
    { renderer },
    createElement(SSRProvider, null, element),
  ));
  return renderToStaticMarkup(createElement(
    Fragment,
    null,
    ...renderToStyleElements(renderer),
  ));
}

describe('ReviewProgressStages', () => {
  it('does not invent rows before progress is reported', () => {
    expect(render([])).toBe('');
  });

  it.each([undefined, 'Checking the supplied policy.'])(
    'sizes each compact row to its own content with detail %s while retaining touch rows',
    (detail) => {
      const css = renderCss(createElement(ReviewProgressStages, {
        stages: [
          { stageName: 'Preparing review', status: 'completed', progress: 5 },
          {
            stageName: 'Checking Compliance',
            status: 'active',
            progress: 63,
            detail,
            attribution: 'workflow-agent',
          },
          { stageName: 'Saving results', status: 'pending', progress: 90 },
        ],
      }));

      expect(css).toContain('grid-auto-rows:auto');
      expect(css).not.toContain('grid-auto-rows:1fr');
      expect(css).toContain('row-gap:var(--spacingVerticalNone)');
      expect(css).toContain('min-height:calc(var(--spacingVerticalXL) + var(--spacingVerticalXS))');
      expect(css).toContain('padding-top:calc((var(--spacingVerticalXL) + var(--spacingVerticalXS) - var(--lineHeightBase200)) / 2)');
      expect(css).toMatch(/@media\s*\(pointer:\s*coarse\)/);
      expect(css).toContain('min-height:calc(var(--spacingVerticalXXXL) + var(--spacingVerticalM))');
      expect(css).toContain('padding-top:calc((var(--spacingVerticalXXXL) + var(--spacingVerticalM) - var(--lineHeightBase200)) / 2)');
      expect(css).toContain('overflow-wrap:anywhere');
    },
  );

  it('does not let an AI explanation enlarge desktop rows', () => {
    const css = renderCss(createElement(ReviewStageAttribution, {
      stage: {
        stageName: 'Evaluating Patterns',
        status: 'active',
        progress: 30,
        attribution: 'workflow-agent',
      },
    }));

    expect(css).toContain('min-height:calc(var(--spacingVerticalXL) + var(--spacingVerticalXS))');
    expect(css).toMatch(/@media\s*\(pointer:\s*coarse\)/);
    expect(css).toContain('min-height:calc(var(--spacingVerticalXXXL) + var(--spacingVerticalM))');
  });

  it('retains the original visible breathing fade for an active workflow icon', () => {
    const css = renderCss(createElement(ReviewStageAttribution, {
      stage: {
        stageName: 'Evaluating Patterns',
        status: 'active',
        progress: 30,
        attribution: 'workflow-agent',
      },
    }));

    expect(css).toMatch(/0%,\s*100%\s*\{\s*opacity:\s*0\.45;?\s*\}/);
    expect(css).toMatch(/50%\s*\{\s*opacity:\s*1;?\s*\}/);
    expect(css).toContain('animation-duration:1.6s');
    expect(css).toContain('animation-timing-function:ease-in-out');
    expect(css).toContain('animation-iteration-count:infinite');
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    expect(css).toContain('animation-name:none');
  });

  it('keeps every stage in order with its accessible state and live detail', () => {
    const stages: ProgressStage[] = [
      { stageName: 'Preparing manifest', status: 'completed', progress: 5 },
      { stageName: 'Checking health', status: 'completed', progress: 15 },
      {
        stageName: 'Evaluating custom skills',
        status: 'active',
        progress: 25,
        detail: 'Evaluating custom skills...',
      },
      {
        stageName: 'Running AI evaluation',
        status: 'pending',
        progress: 40,
        attribution: 'workflow-agent',
      },
      { stageName: 'Saving results', status: 'pending', progress: 90 },
      { stageName: 'Complete', status: 'pending', progress: 100 },
    ];
    const html = render(stages);

    expect(html).toContain('role="list"');
    expect(html).toContain('aria-label="Review steps"');
    expect(html).toContain('<ol');
    expect(html.match(/<li /g)).toHaveLength(stages.length);
    expect(html).toContain('Evaluating custom skills...');
    expect(html).toContain('Evaluating custom skills in progress');
    expect(html).toContain('completed');
    expect(html).toContain('not started');
    expect(html.match(/aria-label="AI review"/g)).toHaveLength(1);
    expect(html).not.toContain('aria-live');
    for (let index = 1; index < stages.length; index += 1) {
      expect(html.indexOf(stages[index].stageName))
        .toBeGreaterThan(html.indexOf(stages[index - 1].stageName));
    }
  });

  it.each(['completed', 'active', 'error', 'pending'] as const)(
    'preserves a %s stage and its supplied detail',
    (status) => {
      const stage = Object.freeze({
        stageName: 'Checking Compliance',
        status,
        progress: 63,
        detail: 'Checking the supplied policy.',
        attribution: 'workflow-agent' as const,
      });
      const html = render(Object.freeze([stage]));

      expect(html).toContain('Checking the supplied policy.');
      expect(html).toContain('aria-label="AI review"');
      expect(html).toContain('tabindex="0"');
      expect(stage.status).toBe(status);
      expect(stage.progress).toBe(63);
    },
  );
});
