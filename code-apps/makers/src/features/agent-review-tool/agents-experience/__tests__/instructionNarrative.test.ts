import { SSRProvider } from '@fluentui/react-components';
import ExcelJS from 'exceljs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { findingToView } from '../components/viewMappers';
import { buildReviewViewModel } from '../components/viewModel';
import { FindingsGrouped } from '../components/findings/FindingsGrouped';
import { buildFindingsGroupedView } from '../components/findings/findingsGroupedModel';
import {
  arc2ToInstructionCoverage, parseArc2NodeOutput,
} from '../services/jobs/aiWorkflowNodeOutput';
import { classifyInstructionCoverage } from '../services/skill/InstructionCoverageValidator';
import { instructionCoverageFindings, instructionCoverageRuleResults } from '../services/rules/skillCoverageAdapters';
import { buildPersistedCopilotReview } from '../services/skill/persistedSkillReview';
import { parsePersistedCopilotPayload } from '../utils/persistedCopilotReviewGuard';
import { buildFindingExportRows, generateCopilotReviewExcel, generateCopilotReviewPdf } from '../utils/copilotReviewExport';
import { pdfPageText } from '../../utils/__tests__/csPdfFixtures';
import { contextualGuidanceFixture } from './contextualGuidanceFixtures';
import { computeGroundedScore, computePillarBreakdown } from '../services/scoring';
import { getCopilotFindingGuidance } from '../services/copilotContextualGuidance';
import { allRows, buildConsolidatedView } from '../../shared-ui/consolidatedFindings';

const advice = {
  ruleId: 'INS-04',
  findingTitle: 'The task scope has no boundary rules',
  fact: 'The captured instructions do not explain what to do outside the permitted task.',
  whyItMatters: 'A request outside the task can produce an unsupported answer.',
  makerAction: 'State the permitted task and the response when required data is unavailable.',
};

function coverage(exception: object) {
  return classifyInstructionCoverage(arc2ToInstructionCoverage(parseArc2NodeOutput({
    contract: 'arc2-node-output-v4', schemaVersion: 4, node: 'copilot-instructions',
    result: { exceptions: [exception], notAssessed: [] },
  })!), '');
}

describe('captured instruction coverage advice', () => {
  it('retains the AI narrative without changing the absent-element verdict', () => {
    const classification = coverage(advice);
    expect(classification.status.state).toBe('complete');
    expect(classification.elements.find(element => element.key === 'boundaries')).toMatchObject({
      present: false, evidence: '',
      findingTitle: advice.findingTitle, fact: advice.fact,
      whyItMatters: advice.whyItMatters, makerAction: advice.makerAction,
    });
  });

  it.each([
    ['INS-02', 'role'], ['INS-03', 'tone'], ['INS-04', 'boundaries'],
    ['INS-05', 'ambiguity'], ['INS-06', 'escalation'],
  ])('binds %s advice to the matching %s element', (ruleId, key) => {
    const classification = coverage({ ...advice, ruleId });
    const finding = instructionCoverageFindings(classification)[0];
    expect(classification.elements.find(element => element.key === key)).toMatchObject({
      present: false, makerAction: advice.makerAction,
    });
    expect(finding.id).toBe(ruleId);
    expect(finding.fact).toContain(`"${key}"`);
    expect(finding.findingTitle).toBe(advice.findingTitle);
  });

  it('prefers original AI text over an existing snapshot template without making up optional advice', () => {
    const { input } = contextualGuidanceFixture();
    const baseline = instructionCoverageFindings(coverage({ ruleId: advice.ruleId }))[0];
    const finding = instructionCoverageFindings(coverage(advice))[0];
    finding.remediation = getCopilotFindingGuidance(baseline, input.payload);
    expect(finding.remediation?.source).toBe('snapshot');
    const view = findingToView(finding, input.payload);
    expect(view.remediation?.source).toBe('saved');
    expect(view.remediation?.makerAction).toBe(advice.makerAction);
    expect(view.remediation?.suggestedText).toBeUndefined();
    expect(view.remediation?.acceptanceCheck).toBe('');
  });

  it('keeps canonical identity, rule outcomes, score, severity counts and override keys unchanged', () => {
    const { input } = contextualGuidanceFixture();
    const actual = coverage(advice);
    const baseline = coverage({ ruleId: advice.ruleId });
    const findings = instructionCoverageFindings(actual);
    const fixed = instructionCoverageFindings(baseline);
    const results = instructionCoverageRuleResults(actual, false);
    expect(actual.status).toEqual(baseline.status);
    expect(results).toEqual(instructionCoverageRuleResults(baseline, false));
    expect(findings).toHaveLength(fixed.length);
    for (const [index, finding] of findings.entries()) {
      for (const key of ['id', 'family', 'severity', 'title', 'fact', 'why', 'fix', 'referenceId', 'ai'] as const) {
        expect(finding[key]).toEqual(fixed[index][key]);
      }
    }
    const scoreInput = {
      model: input.payload.model, ruleResults: results, coverage: { covered: 0, total: 1 },
    };
    const score = computeGroundedScore({ ...scoreInput, findings });
    expect(Number.isFinite(score)).toBe(true);
    expect(score).toBe(computeGroundedScore({ ...scoreInput, findings: fixed }));
    expect(computePillarBreakdown({ ...scoreInput, findings })).toEqual(computePillarBreakdown({ ...scoreInput, findings: fixed }));
    const displayFindings = findings.map(finding => {
      const view = findingToView(finding, input.payload);
      return { ...finding, title: view.title, why: view.why, fix: view.fix };
    });
    const updated = buildConsolidatedView(results, displayFindings);
    const previous = buildConsolidatedView(results, fixed);
    const keys = (view: typeof updated) => allRows(view).map(row => [row.key, row.instanceKeys]);
    expect(keys(updated)).toEqual(keys(previous));
    expect(updated.totals).toEqual(previous.totals);
    const dismissed = [results.find(result => result.status === 'warning')!.key];
    expect(buildConsolidatedView(results, displayFindings, undefined, undefined, dismissed).totals)
      .toEqual(buildConsolidatedView(results, fixed, undefined, undefined, dismissed).totals);
  });

  it('shows the original AI advice instead of a snapshot template', () => {
    const { input } = contextualGuidanceFixture();
    const finding = instructionCoverageFindings(coverage(advice))[0];
    const view = findingToView(finding, input.payload);
    expect(view).toMatchObject({
      title: advice.findingTitle, displayFact: advice.fact,
      why: advice.whyItMatters, fix: advice.makerAction,
      remediation: {
        source: 'saved', findingTitle: advice.findingTitle,
        whyItMatters: advice.whyItMatters, makerAction: advice.makerAction,
      },
    });
    expect(view.remediation?.suggestedText).toBeUndefined();
    expect(view.remediation?.acceptanceCheck).toBe('');
  });

  it('retains optional verification and draft text in saved views, UI, Excel and PDF', async () => {
    const exception = {
      ...advice,
      acceptanceCheck: 'Test a request that has no matching capability and confirm a clear refusal.',
      suggestedText: 'Keep the permitted task. Do not invent missing data.',
    };
    const { input } = contextualGuidanceFixture();
    input.payload.findings = instructionCoverageFindings(coverage(exception));
    const result = buildPersistedCopilotReview(input);
    const payload = parsePersistedCopilotPayload(JSON.parse(result.json))!;
    const before = JSON.stringify(payload);
    const vm = buildReviewViewModel(payload, 'Reviewer', 0, 'Example agent');
    const html = renderToStaticMarkup(createElement(SSRProvider, null, createElement(FindingsGrouped, {
      grouped: buildFindingsGroupedView(vm.findings), focusFindingId: advice.ruleId,
    })));
    expect(html).toContain(exception.fact);
    expect(html).toContain(exception.suggestedText);
    expect(html).toContain(exception.acceptanceCheck);
    expect(html).toContain('Parsed fact');
    expect(html).not.toContain('Example for this agent');
    const row = buildFindingExportRows(payload)[0];
    expect(row).toMatchObject({
      title: exception.findingTitle, displayFact: exception.fact,
      why: exception.whyItMatters, fix: exception.makerAction,
      draftChange: exception.suggestedText, acceptanceCheck: exception.acceptanceCheck,
      fact: payload.findings[0].fact,
    });
    expect(row.example).toBeUndefined();
    expect(row.makerAction).toBeUndefined();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await (await generateCopilotReviewExcel(vm, payload)).arrayBuffer());
    const sheet = workbook.getWorksheet('Findings')!;
    const columns = new Map<string, number>();
    sheet.getRow(1).eachCell((cell, column) => columns.set(String(cell.value), column));
    expect(columns.has('Finding context (AI)')).toBe(true);
    expect(sheet.getRow(2).getCell(columns.get('Finding context (AI)')!).value).toBe(exception.fact);
    const pdf = generateCopilotReviewPdf(vm, payload);
    const text = pdfPageText(Buffer.from(await pdf.arrayBuffer()).toString('latin1')).join(' ').replace(/\s+/g, ' ');
    expect(text).toContain(exception.fact);
    expect(text).toContain(exception.acceptanceCheck);
    expect(text).toContain(exception.suggestedText);
    expect(text).toContain('Finding context (AI)');
    expect(text).not.toContain('Example for this agent');
    expect(JSON.stringify(payload)).toBe(before);
  });

  it('keeps useful AI text when optional fields are null and omits the empty verification row', async () => {
    const { input } = contextualGuidanceFixture();
    input.payload.findings = instructionCoverageFindings(coverage({
      ...advice, acceptanceCheck: null, suggestedText: null,
    }));
    const result = buildPersistedCopilotReview(input);
    const payload = parsePersistedCopilotPayload(JSON.parse(result.json))!;
    const vm = buildReviewViewModel(payload, 'Reviewer', 0, 'Example agent');
    expect(vm.findings[0].title).toBe(advice.findingTitle);
    expect(vm.findings[0].remediation?.source).toBe('saved');
    const pdf = generateCopilotReviewPdf(vm, payload);
    const text = pdfPageText(Buffer.from(await pdf.arrayBuffer()).toString('latin1')).join(' ');
    expect(text).not.toContain('How to verify');
    expect(text).not.toContain('Draft change');
  });

  it('keeps fixed wording and snapshot advice when the node has no narrative', () => {
    const { input } = contextualGuidanceFixture();
    const finding = instructionCoverageFindings(coverage({ ruleId: advice.ruleId }))[0];
    const view = findingToView(finding, input.payload);
    expect(finding.findingTitle).toBeUndefined();
    expect(view.title).toBe(finding.title);
    expect(view.why).toBe(finding.why);
    expect(view.fix).toBe(finding.fix);
    expect(view.remediation?.source).toBe('snapshot');
  });

  it.each([12, true, {}])('discards malformed text without discarding the finding (%j)', value => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const baseline = coverage({ ruleId: advice.ruleId });
    const actual = coverage({ ...advice, suggestedText: value });
    expect(instructionCoverageFindings(actual)).toEqual(instructionCoverageFindings(baseline));
    expect(actual.status).toEqual(baseline.status);
    expect(warning).toHaveBeenCalledOnce();
    warning.mockRestore();
  });

  it.each(['findingTitle', 'fact', 'whyItMatters', 'makerAction', 'acceptanceCheck', 'suggestedText'])(
    'keeps the absent-element finding when %s contains a URL',
    field => {
      const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const baseline = coverage({ ruleId: advice.ruleId });
      const result = coverage({ ...advice, [field]: 'See https://example.invalid/advice.' });
      expect(result).toEqual(baseline);
      expect(instructionCoverageFindings(result)).toEqual(instructionCoverageFindings(baseline));
      expect(warning).toHaveBeenCalledOnce();
      warning.mockRestore();
    },
  );
});
