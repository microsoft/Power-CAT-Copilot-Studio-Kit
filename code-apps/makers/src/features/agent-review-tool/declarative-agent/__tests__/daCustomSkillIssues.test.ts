import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SSRProvider } from '@fluentui/react-components';
import { describe, expect, it } from 'vitest';
import { buildDACustomSkillsViewModel } from '../adapters/daCustomSkillsViewModel';
import { buildDAReviewShellModel } from '../adapters/daReviewShellModel';
import { DACustomSkillIssues } from '../components/DACustomSkillIssues';
import { DAIssueRow } from '../components/DAEvaluationRows';
import type { EvaluationIssue } from '../contracts/DAEvaluationResult';
import type { DAPackageFinding } from '../contracts/DAPackageReview';
import type { DAReviewRecord } from '../contracts/DAReviewRecord';

const guidanceUrl = 'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/agent-skills';
const findings: DAPackageFinding[] = [
  {
    ruleId: 'DA-SKILL-TEST-LOW',
    status: 'Warning', severity: 'Low', method: 'deterministic',
    sourceFile: 'skills/low/SKILL.md', jsonPath: '$.name', evidence: '{"name":"low"}',
    explanation: 'Low problem', recommendation: 'Low recorded action.', guidanceUrl,
  },
  {
    ruleId: 'DA-SKILL-TEST-HIGH',
    status: 'Fail', severity: 'High', method: 'deterministic',
    sourceFile: 'skills/high/SKILL.md', jsonPath: '$.name', evidence: '{"name":"high"}',
    explanation: 'High problem',
    recommendation: 'High recorded action. Example: Recorded example. How to verify: Recorded verification.',
    guidanceUrl,
  },
  {
    ruleId: 'DA-SKILL-TEST-MEDIUM',
    status: 'Warning', severity: 'Medium', method: 'deterministic',
    sourceFile: 'skills/medium/SKILL.md', jsonPath: '$.name', evidence: '{"name":"medium"}',
    explanation: 'Medium problem', recommendation: 'Medium recorded action.', guidanceUrl,
  },
];

function review(overrides: Partial<DAReviewRecord> = {}): DAReviewRecord {
  return {
    componentIdUnique: 'synthetic-agent',
    agentName: 'Synthetic agent',
    agentVersion: '1.0.0', publisherName: 'Contoso', sourceType: 'zip',
    overallScore: 27, iconBase64: null,
    packageValidation: { status: 'invalid', schemaVersion: 'v1.9', findings },
    ...overrides,
  };
}

const render = (issues: readonly EvaluationIssue[]) => renderToStaticMarkup(createElement(
  SSRProvider, null, createElement(DACustomSkillIssues, { issues }),
));

describe('compact custom skill issues', () => {
  it('retains every full package finding, not a combined alert message', () => {
    const model = buildDACustomSkillsViewModel(review());
    expect(model?.checkIssues).toEqual(findings.map((finding) => ({
      severity: finding.severity, description: finding.explanation,
      recommendation: finding.recommendation, ruleId: finding.ruleId,
      method: finding.method, sourceFile: finding.sourceFile,
      jsonPath: finding.jsonPath, evidence: finding.evidence, guidanceUrl: finding.guidanceUrl,
    })));
    expect(model?.issues).toHaveLength(3);
  });

  it('does not change category counts or count the package findings twice', () => {
    const model = buildDAReviewShellModel(review());
    expect(model.issueCounts.customSkills).toBe(3);
    expect(model.issueCounts.package).toBe(3);
    expect(model.severity).toEqual({ high: 1, medium: 1, low: 1, total: 3 });
    expect(model.customSkills?.severity).toEqual({ high: 1, medium: 1, low: 1, total: 3 });
    expect(model.customSkills?.additionalSeverity.total).toBe(0);
    expect(model.score).toBe(27);
  });

  it('shows the highest severity first without changing the input order', () => {
    const issues = buildDACustomSkillsViewModel(review())?.checkIssues ?? [];
    const html = render(issues);
    expect(html.indexOf('High problem')).toBeLessThan(html.indexOf('Medium problem'));
    expect(html.indexOf('Medium problem')).toBeLessThan(html.indexOf('Low problem'));
    expect(issues.map((issue) => issue.severity)).toEqual(['Low', 'High', 'Medium']);
    expect(html).toContain('High severity');
    expect(html).toContain('Low severity');
    expect(html).toContain('skills/high/SKILL.md');
  });

  it('keeps each issue collapsed and has no stack of assertive alert regions', () => {
    const html = render(buildDACustomSkillsViewModel(review())?.checkIssues ?? []);
    expect(html).toContain('Package and review issues (3)');
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(3);
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('MessageBar');
    expect(html).not.toContain('High recorded action');
  });

  it('does not replace a pipeline failure with invented action or evidence', () => {
    const model = buildDACustomSkillsViewModel(review({
      packageValidation: undefined,
      customSkillIssues: [
        { code: 'custom-skill-review-failed', severity: 'error', message: 'The weather skill assessment failed.', resourcePath: 'skills/weather/SKILL.md' },
        { code: 'custom-skill-orchestration-failed', severity: 'warning', message: 'The routing assessment failed.' },
      ],
    }));
    expect(model?.checkIssues).toEqual([
      {
        severity: 'High', description: 'The weather skill assessment failed.', recommendation: '',
        ruleId: 'custom-skill-review-failed', sourceFile: 'skills/weather/SKILL.md',
      },
      {
        severity: 'Medium', description: 'The routing assessment failed.', recommendation: '',
        ruleId: 'custom-skill-orchestration-failed', sourceFile: undefined,
      },
    ]);
    expect(model?.additionalSeverity).toEqual({ high: 1, medium: 1, low: 0, total: 2 });
    const row = renderToStaticMarkup(createElement(DAIssueRow, {
      issue: model?.checkIssues[0] ?? { severity: 'High', description: '', recommendation: '' },
    }));
    expect(row).toContain('No action was recorded.');
    expect(row).not.toContain('This assessment could not finish');
  });

  it('does not show passing, unassessed, or unrelated package checks as skill issues', () => {
    const model = buildDACustomSkillsViewModel(review({
      packageValidation: {
        status: 'invalid', schemaVersion: 'v1.9',
        findings: [
          ...findings,
          { ...findings[0], ruleId: 'DA-SKILL-PASSED', status: 'Pass' },
          { ...findings[0], ruleId: 'DA-SKILL-UNASSESSED', status: 'Not assessed' },
          { ...findings[0], ruleId: 'DA-UNRELATED' },
        ],
      },
    }));
    expect(model?.checkIssues).toHaveLength(3);
  });

  it('keeps repeated rule findings for different skills separately reachable', () => {
    const model = buildDACustomSkillsViewModel(review({
      packageValidation: {
        status: 'invalid', schemaVersion: 'v1.9',
        findings: [
          { ...findings[1], sourceFile: 'skills/one/SKILL.md', explanation: 'First skill problem' },
          { ...findings[1], sourceFile: 'skills/two/SKILL.md', explanation: 'Second skill problem' },
        ],
      },
    }));
    const html = render(model?.checkIssues ?? []);
    expect(html).toContain('First skill problem');
    expect(html).toContain('Second skill problem');
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(2);
  });

  it('omits an empty issue list', () => {
    expect(render([])).toBe('');
    expect(buildDACustomSkillsViewModel(review({ packageValidation: undefined }))).toBeUndefined();
  });
});
