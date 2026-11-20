import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { describe, expect, it } from 'vitest';
import { CoverageTab } from '../components/CoverageTab';
import type { ReviewSummaryView } from '../components/viewTypes';

const summary: ReviewSummaryView = {
  agentName: 'General Quality agent',
  score: 88,
  passed: 0,
  warnings: 0,
  errors: 0,
  infos: 0,
  notApplicable: 0,
  countsAreChecks: true,
  rulesEvaluated: 0,
  model: 'Default',
  memoryEnabled: false,
  webSearchEnabled: false,
  duration: '00:01',
  reviewedBy: 'Maker',
  refCounts: { learn: 0, owasp: 0, anthropic: 0, mitreCwe: 0 },
  capabilitiesCovered: 0,
  capabilitiesTotal: 2,
  testCases: 1,
  multiTurnCases: 1,
  graders: 'General quality',
  evaluationSets: 1,
};

describe('CoverageTab', () => {
  it('shows an evidence-unavailable state without false capability gaps', () => {
    const html = renderToStaticMarkup(
      createElement(
        FluentProvider,
        { theme: webLightTheme },
        createElement(CoverageTab, {
          coverage: [
            { name: 'Create a chat', kind: 'Connector tool', cases: 0 },
            { name: 'Calendar', kind: 'MCP tool', cases: 0 },
          ],
          summary,
          coverageBasis: 'unverified',
        }),
      ),
    );

    expect(html).toContain('Capability coverage unavailable');
    expect(html).toContain('Evaluation pillar is capped');
    expect(html).not.toContain('0 of 2');
    expect(html).not.toContain('No matching test');
    expect(html).not.toContain('Capabilities without test coverage');
  });
});
