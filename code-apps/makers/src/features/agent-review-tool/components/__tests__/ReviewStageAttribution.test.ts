import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SSRProvider } from '@fluentui/react-components';
import { describe, expect, it } from 'vitest';
import { ReviewStageAttribution } from '../dialogs/ReviewStageAttribution';
import type { ProgressStage } from '../../hooks/useReviewMutation';

function render(stage: ProgressStage) {
  return renderToStaticMarkup(createElement(
    SSRProvider,
    null,
    createElement(ReviewStageAttribution, { stage }),
  ));
}

describe('AI review attribution', () => {
  it('does not claim a local review stage', () => {
    expect(render({ stageName: 'Saving Results', status: 'active', progress: 85 })).toBe('');
  });

  it.each(['pending', 'active', 'completed', 'error'] as const)(
    'keeps the icon accessible without visible implementation text when %s',
    (status) => {
      const html = render({
        stageName: 'Checking Compliance',
        status,
        progress: 60,
        attribution: 'workflow-agent',
      });

      expect(html).toContain('role="img"');
      expect(html).toContain('aria-label="AI review"');
      expect(html).toContain('tabindex="0"');
      expect(html).toContain('<svg');
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain('focusable="false"');
      expect(html).not.toContain('Agent node');
      expect(html).not.toMatch(/>AI review</);
      expect(html.includes('<linearGradient')).toBe(status === 'completed');
    },
  );

  it('does not modify stage status or progress', () => {
    const stage: ProgressStage = Object.freeze({
      stageName: 'Checking Compliance',
      status: 'active',
      progress: 63,
      attribution: 'workflow-agent',
    });
    render(stage);
    expect(stage.status).toBe('active');
    expect(stage.progress).toBe(63);
  });
});
