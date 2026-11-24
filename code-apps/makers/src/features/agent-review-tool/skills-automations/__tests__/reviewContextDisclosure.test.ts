import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SSRProvider } from '@fluentui/react-components';
import { describe, expect, it } from 'vitest';

import { ReviewContextDisclosure } from '../../components/review-page/ReviewContextDisclosure';
import { getReviewContextItems } from '../../utils/reviewContext';

function render(limit: string, notes: string[]): string {
  return renderToStaticMarkup(
    createElement(
      SSRProvider,
      null,
      createElement(ReviewContextDisclosure, { limit, notes }),
    ),
  );
}

describe('review context disclosure', () => {
  it('combines review limits and notes in one collapsed neutral control', () => {
    const markup = render('The review uses saved configuration.', [
      'Pattern assessment data is partial.',
      'Instruction assessment data is unavailable.',
    ]);

    expect(markup).toContain('Review context');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain('fui-MessageBar');
  });

  it('does not render duplicate notes', () => {
    expect(getReviewContextItems('Limit text.', ['Repeated note.', 'Repeated note.']))
      .toEqual(['Limit text.', 'Repeated note.']);
  });
});
