import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { describe, expect, it } from 'vitest';
import { AssessmentStatusBadge } from '../AssessmentStatusBadge';
import { getAssessmentStatusDescription } from '../assessmentStatus';

function renderStatus(statusLabel: string): string {
  return renderToStaticMarkup(
    createElement(
      FluentProvider,
      { theme: webLightTheme },
      createElement(AssessmentStatusBadge, {
        status: null,
        statusColor: 'informative',
        statusLabel,
      }),
    ),
  );
}

describe('assessment status explanations', () => {
  it.each([
    [
      'N/A',
      'Not applicable. No eligible item exists for this rule. This result does not affect the score.',
    ],
    [
      'Not assessed',
      'The rule may apply, but the available information was not sufficient for a reliable Pass or Fail result. This result does not affect the score.',
    ],
  ])('explains %s without changing its result', (statusLabel, description) => {
    expect(getAssessmentStatusDescription(statusLabel)).toBe(description);

    const markup = renderStatus(statusLabel);
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain(`>${statusLabel}<`);
  });

  it.each(['Pass', 'Fail'])('keeps %s as a non-interactive status', (statusLabel) => {
    expect(getAssessmentStatusDescription(statusLabel)).toBeUndefined();

    const markup = renderStatus(statusLabel);
    expect(markup).not.toContain('tabindex="0"');
    expect(markup).toContain(`>${statusLabel}<`);
  });

  it('uses the explained badge in both result grids and the finding details', () => {
    const sources = [
      '../../grids/PatternsDataGrid.tsx',
      '../../grids/ComplianceDataGrid.tsx',
      '../../review-page/StandardFindingContentShared.tsx',
    ].map(path => readFileSync(new URL(path, import.meta.url), 'utf8'));

    sources.forEach(source => {
      expect(source).toContain('<AssessmentStatusBadge');
    });
    sources.slice(0, 2).forEach(source => {
      expect(source).toContain(
        "columnId === 'status' && getAssessmentStatusDescription(item.statusLabel)",
      );
    });
  });
});
