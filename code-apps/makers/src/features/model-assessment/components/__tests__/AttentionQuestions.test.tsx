import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AttentionQuestions } from '../AttentionQuestions';

describe('AttentionQuestions', () => {
  it('links only resolved test-set headings and opens configurations safely in a new tab', () => {
    const html = renderToStaticMarkup(<AttentionQuestions
      evaluationLinks={{ modelcheck: 'https://copilotstudio.microsoft.com/evaluation' }}
      results={[
        { id: '1', name: '', testCaseId: '1', testSet: ' MODELCHECK ', status: 'Fail', question: 'Linked?' },
        { id: '2', name: '', testCaseId: '2', testSet: 'Unknown set', status: 'Fail', question: 'Unmatched?' },
        { id: '3', name: '', testCaseId: '3', status: 'Fail', question: 'No set?' },
      ]}
    />);
    expect(html.match(/<a\b/g)).toHaveLength(1);
    expect(html).toMatch(/<h5\b[^>]*><a\b/);
    expect(html).toContain('href="https://copilotstudio.microsoft.com/evaluation"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('Unknown set');
    expect(html).toContain('Other questions');
    expect(html).toContain('target="_blank"');
  });

  it('does not treat inherited object properties as evaluation links', () => {
    const html = renderToStaticMarkup(<AttentionQuestions evaluationLinks={{}} results={[
      { id: '1', name: '', testSet: 'constructor', status: 'Fail' },
    ]} />);
    expect(html).not.toContain('<a ');
  });

  it('groups questions under a single test-set heading instead of repeating the name', () => {
    const html = renderToStaticMarkup(<AttentionQuestions results={[
      { id: '1', name: '', testCaseId: '1', testSet: 'MODELCHECK Onboarding', status: 'Fail', question: 'Calendar access?' },
      { id: '2', name: '', testCaseId: '2', testSet: 'MODELCHECK Onboarding', status: 'Fail', question: 'Building access?' },
      { id: '3', name: '', testCaseId: '3', testSet: 'MODELCHECK Support', status: 'Error', question: 'Support contact?' },
    ]} />);
    expect(html.split('MODELCHECK Onboarding')).toHaveLength(2);
    expect(html.split('MODELCHECK Support')).toHaveLength(2);
    expect(html).toContain('Calendar access?');
    expect(html).toContain('Building access?');
    expect(html).toContain('Support contact?');
    expect(html.match(/<ul\b/g)).toHaveLength(2);
  });

  it('shows three questions initially and offers all remaining questions', () => {
    const html = renderToStaticMarkup(<AttentionQuestions results={
      Array.from({ length: 5 }, (_, index) => ({
        id: `${index}`, name: '', testCaseId: `${index}`, status: 'Fail', question: `Question ${index}`,
      }))
    } />);
    expect(html).toContain('Questions needing attention (5)');
    expect(html).toContain('Show all 5 questions');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('Question 2');
    expect(html).not.toContain('Question 3');
  });

  it('distinguishes absent results from a healthy run', () => {
    expect(renderToStaticMarkup(<AttentionQuestions results={[]} />)).toContain('No results available');
    expect(renderToStaticMarkup(<AttentionQuestions results={[{ id: '1', name: '', status: 'Pass' }]} />))
      .toContain('No failed or error results');
  });
});
