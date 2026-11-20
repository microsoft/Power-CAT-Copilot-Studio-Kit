import { readFileSync } from 'node:fs';
import { SSRProvider } from '@fluentui/react-components';
import ExcelJS from 'exceljs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { buildReviewViewModel } from '../components/viewModel';
import { SkillsGrouped } from '../components/skills/SkillsGrouped';
import {
  arc2ToOrchestrationEvaluation, parseArc2NodeOutput,
} from '../services/jobs/aiWorkflowNodeOutput';
import { validateOrchestrationEvaluation } from '../services/skill/SkillEvaluationValidator';
import {
  buildPersistedCopilotReview, buildPersistedCrossSkillOrchestration,
} from '../services/skill/persistedSkillReview';
import { createOrchestrationFinding } from '../services/skill/orchestrationRuleRegistry';
import { parsePersistedCopilotPayload } from '../utils/persistedCopilotReviewGuard';
import { buildFindingExportRows, generateCopilotReviewExcel, generateCopilotReviewPdf } from '../utils/copilotReviewExport';
import { copilotPdfText } from '../utils/copilotPdfContent';
import { pdfPageText } from '../../utils/__tests__/csPdfFixtures';
import { contextualGuidanceFixture } from './contextualGuidanceFixtures';
import type { CopilotAiNarrative } from '../contracts/Findings';
import { getCopilotOrchestrationGuidance } from '../services/copilotContextualGuidance';
import { getCopilotReviewCompletion } from '../services/copilotReviewCompletion';

function replay() {
  const rows: Record<string, string> = JSON.parse(readFileSync(new URL(
    '../services/jobs/__tests__/fixtures/RESULT-XSKILL-AIWORKFLOW-postfix.json', import.meta.url,
  ), 'utf8'));
  const output = parseArc2NodeOutput(JSON.parse(rows['9000']))!;
  const exception = output.result.exceptions.find(item => item.ruleId === 'XSK-03')!;
  const names = ['draft-response', 'revise-response'];
  const ids = new Map((exception.evidence ?? []).map((item, index) => [item.componentId!, names[index]]));
  const corpus = (exception.evidence ?? []).map(item => item.quote).join('\n');
  return { output, exception, names, ids, corpus };
}

function savedReplay(narrative: CopilotAiNarrative = {}) {
  const { output, names, ids, corpus, exception } = replay();
  Object.assign(exception, narrative);
  const { evaluation, issues } = validateOrchestrationEvaluation(
    arc2ToOrchestrationEvaluation(output, ids, names, corpus), names, corpus,
  );
  expect(issues).toEqual([]);
  const { input, skill } = contextualGuidanceFixture();
  input.payload.model.skills = names.map((name, index) => ({
    ...skill, name, frontmatterName: name,
    componentId: `skill-${index}`, componentIdUnique: `skill-unique-${index}`,
    schemaname: `example.skill.${index}`,
  }));
  input.payload.findings = [];
  input.payload.skillBundleReviews = [];
  input.bundles = [];
  input.payload.crossSkillOrchestration = evaluation;
  const saved = buildPersistedCopilotReview(input);
  const payload = parsePersistedCopilotPayload(JSON.parse(saved.json))!;
  return { payload, exception, vm: buildReviewViewModel(payload, 'Reviewer', 0, 'Example agent') };
}

describe('captured cross-skill advice', () => {
  it('retains the captured XSK-03 advice through translation, validation, save and view mapping', () => {
    const { vm, exception } = savedReplay();
    expect(vm.skillsGrouped.orchestration[0]).toMatchObject({
      title: exception.findingTitle, fact: exception.fact,
      meaning: exception.whyItMatters, fix: exception.makerAction,
      remediation: {
        source: 'saved', makerAction: exception.makerAction,
        acceptanceCheck: exception.acceptanceCheck, suggestedText: exception.suggestedText,
      },
    });
  });

  it('keeps registry identity when a factory receives optional AI text', () => {
    const { exception, names } = replay();
    const baseline = createOrchestrationFinding('XSK-03', { skills: names, evidence: 'Captured text.' });
    const finding = createOrchestrationFinding('XSK-03', {
      skills: names, evidence: baseline.evidence, narrative: exception,
    });
    expect(finding.id).toBe(baseline.id);
    expect(finding.title).toBe(baseline.title);
    expect(finding.severity).toBe(baseline.severity);
    expect(finding.findingTitle).toBe(exception.findingTitle);
    expect(finding.suggestedText).toBe(exception.suggestedText);
  });

  it('uses the registry fallback when narrative is absent without inventing a draft', () => {
    const { payload } = savedReplay();
    const finding = payload.crossSkillOrchestration!.findings[0];
    payload.crossSkillOrchestration!.findings = [createOrchestrationFinding(finding.ruleId, {
      skills: finding.skills, evidence: finding.evidence, severity: finding.severity,
    })];
    const fallback = payload.crossSkillOrchestration!.findings[0];
    const view = buildReviewViewModel(payload, 'Reviewer', 0, 'Example agent').skillsGrouped.orchestration[0];
    expect(view).toMatchObject({
      title: fallback.title, meaning: fallback.rationale, fix: fallback.recommendation,
    });
    expect(view.remediation).toBeUndefined();
    expect(getCopilotOrchestrationGuidance(fallback)).toBeUndefined();
  });

  it('omits AI context from the PDF for a registry-only cross-skill finding', async () => {
    const { payload } = savedReplay();
    const finding = payload.crossSkillOrchestration!.findings[0];
    const fallback = createOrchestrationFinding(finding.ruleId, {
      skills: finding.skills, evidence: finding.evidence, severity: finding.severity,
    });
    payload.crossSkillOrchestration!.findings = [fallback];
    const vm = buildReviewViewModel(payload, 'Reviewer', 0, 'Example agent');
    expect(vm.skillsGrouped.orchestration[0].fact).toBeUndefined();
    const pdf = generateCopilotReviewPdf(vm, payload);
    const text = pdfPageText(Buffer.from(await pdf.arrayBuffer()).toString('latin1')).join(' ').replace(/\s+/g, ' ');
    expect(text).toContain('Cross-skill orchestration');
    expect(text).not.toContain('Finding context (AI)');
  });

  it('omits an absent component ID from the PDF for set-level AI guidance', async () => {
    const { payload, vm, exception } = savedReplay();
    expect(vm.skillsGrouped.orchestration[0].remediation?.componentIdUnique).toBeUndefined();
    const pdf = generateCopilotReviewPdf(vm, payload);
    const text = pdfPageText(Buffer.from(await pdf.arrayBuffer()).toString('latin1')).join(' ').replace(/\s+/g, ' ');
    expect(text).toContain('Finding context (AI)');
    expect(text).toContain(copilotPdfText(exception.fact).replace(/\s+/g, ' '));
    expect(text).toContain('Guidance source');
    expect(text).toContain('How to verify');
    expect(text).not.toContain('Guidance component ID');
  });

  it('leaves canonical findings, counts, severities, completion, score and pair keys unchanged', () => {
    const { payload, vm } = savedReplay();
    const original = JSON.stringify(payload);
    const baseline = structuredClone(payload);
    baseline.crossSkillOrchestration!.findings = baseline.crossSkillOrchestration!.findings.map(finding =>
      createOrchestrationFinding(finding.ruleId, {
        skills: finding.skills, evidence: finding.evidence, severity: finding.severity,
      }));
    const oldView = buildReviewViewModel(baseline, 'Reviewer', 0, 'Example agent');
    expect(vm.summary).toEqual(oldView.summary);
    expect(vm.checks).toEqual(oldView.checks);
    expect(getCopilotReviewCompletion(payload)).toEqual(getCopilotReviewCompletion(baseline));
    expect(payload.score).toEqual(baseline.score);
    expect(payload.ruleResults).toEqual(baseline.ruleResults);
    expect(payload.findings).toEqual(baseline.findings);
    expect(payload.crossSkillOrchestration!.status).toBe(baseline.crossSkillOrchestration!.status);
    expect(payload.crossSkillOrchestration!.findings).toHaveLength(baseline.crossSkillOrchestration!.findings.length);
    for (const [index, finding] of payload.crossSkillOrchestration!.findings.entries()) {
      const fixed = baseline.crossSkillOrchestration!.findings[index];
      for (const key of ['id', 'ruleId', 'type', 'severity', 'title', 'skills', 'evidence',
        'rationale', 'recommendation', 'fixSteps', 'referenceIds', 'confidence'] as const) {
        expect(finding[key]).toEqual(fixed[key]);
      }
      expect(vm.skillsGrouped.orchestration[index].pairs).toEqual(oldView.skillsGrouped.orchestration[index].pairs);
    }
    expect(JSON.stringify(payload)).toBe(original);
  });

  it.each(['findingTitle', 'fact', 'whyItMatters', 'makerAction', 'acceptanceCheck', 'suggestedText'])(
    'drops only the narrative when %s contains a URL',
    field => {
      const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { output, exception, ids, names, corpus } = replay();
      const baseline = createOrchestrationFinding('XSK-03', {
        skills: names, evidence: arc2ToOrchestrationEvaluation(output, ids, names, corpus).findings[0].evidence,
      });
      output.result.exceptions = [{ ...exception, [field]: 'See https://example.invalid/advice.' }];
      const result = validateOrchestrationEvaluation(
        arc2ToOrchestrationEvaluation(output, ids, names, corpus), names, corpus,
      );
      expect(result.issues).toEqual([]);
      expect(result.evaluation.status).toBe('complete');
      expect(result.evaluation.findings).toEqual([baseline]);
      expect(warning).toHaveBeenCalledOnce();
      warning.mockRestore();
    },
  );

  it.each(['findingTitle', 'fact', 'whyItMatters', 'makerAction', 'acceptanceCheck', 'suggestedText'] as const)(
    'redacts %s without discarding its remaining conditions', field => {
      const { names, exception } = replay();
      const finding = createOrchestrationFinding('XSK-03', {
        skills: names, evidence: 'Captured text.',
        narrative: { ...exception, [field]: 'api_key = "sk-synthetic-secret-value"\nKeep the confirmed scope.' },
      });
      const saved = buildPersistedCrossSkillOrchestration({
        status: 'complete', findings: [finding], summary: '', referenceIds: finding.referenceIds,
      });
      expect(saved.findings[0][field]).toContain('Keep the confirmed scope.');
      expect(JSON.stringify(saved)).not.toContain('sk-synthetic-secret-value');
    },
  );

  it('shows the saved action, draft and check in the cross-skill detail', () => {
    const { payload, vm } = savedReplay();
    const before = JSON.stringify(payload);
    const html = renderToStaticMarkup(
      createElement(SSRProvider, null, createElement(SkillsGrouped, { grouped: vm.skillsGrouped })),
    );
    expect(html).not.toContain('Example for this agent');
    expect(html).toContain('Draft change');
    expect(html).toContain('Not applied');
    expect(html).toContain('How to verify');
    expect(html).toContain('Guidance saved with this review.');
    expect(JSON.stringify(payload)).toBe(before);
  });

  it('treats optional null fields as absent without losing the remaining AI advice', () => {
    const { output, exception, ids, names, corpus } = replay();
    const parsed = parseArc2NodeOutput({
      ...output, result: { ...output.result, exceptions: [{
        ...exception, acceptanceCheck: null, suggestedText: null,
      }] },
    })!;
    const result = validateOrchestrationEvaluation(
      arc2ToOrchestrationEvaluation(parsed, ids, names, corpus), names, corpus,
    );
    expect(result.issues).toEqual([]);
    expect(result.evaluation.status).toBe('complete');
    expect(result.evaluation.findings[0]).toMatchObject({
      findingTitle: exception.findingTitle, makerAction: exception.makerAction,
    });
    expect(result.evaluation.findings[0].acceptanceCheck).toBeUndefined();
    expect(result.evaluation.findings[0].suggestedText).toBeUndefined();
  });

  it('exports the captured advice to the separate orchestration sheet and PDF', async () => {
    const { payload, vm, exception } = savedReplay();
    const before = JSON.stringify(payload);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await (await generateCopilotReviewExcel(vm, payload)).arrayBuffer());
    const sheet = workbook.getWorksheet('Orchestration')!;
    const columns = new Map<string, number>();
    sheet.getRow(1).eachCell((cell, column) => columns.set(String(cell.value), column));
    expect(columns.has('Draft change (Not applied)')).toBe(true);
    for (const [label, expected] of [
      ['Title', exception.findingTitle],
      ['Finding context (AI)', exception.fact],
      ['Why it matters', exception.whyItMatters],
      ['Recommendation', exception.makerAction],
      ['How to verify', exception.acceptanceCheck],
      ['Draft change (Not applied)', exception.suggestedText],
      ['Evidence', payload.crossSkillOrchestration!.findings[0].evidence],
    ]) expect(sheet.getRow(2).getCell(columns.get(label!)!).value).toBe(expected);
    expect(buildFindingExportRows(payload)).toHaveLength(0);
    const pdf = generateCopilotReviewPdf(vm, payload);
    const text = pdfPageText(Buffer.from(await pdf.arrayBuffer()).toString('latin1')).join(' ').replace(/\s+/g, ' ');
    expect(text).toContain('Draft change (Not applied)');
    expect(text).toContain(copilotPdfText(exception.acceptanceCheck).replace(/\s+/g, ' '));
    expect(text).toContain(copilotPdfText(exception.fact).replace(/\s+/g, ' '));
    expect(text).not.toContain('Example for this agent');
    expect(sheet.getRow(2).getCell(columns.get('Example for this agent')!).value).toBeNull();
    expect(sheet.getRow(2).getCell(columns.get('Recommended action')!).value).toBeNull();
    expect(JSON.stringify(payload)).toBe(before);
  });

  it('preserves an explicitly empty draft in UI, PDF and Excel', async () => {
    const { payload, vm } = savedReplay({ suggestedText: '' });
    const html = renderToStaticMarkup(
      createElement(SSRProvider, null, createElement(SkillsGrouped, { grouped: vm.skillsGrouped })),
    );
    expect(html).toContain('(empty)');
    const pdf = generateCopilotReviewPdf(vm, payload);
    const text = pdfPageText(Buffer.from(await pdf.arrayBuffer()).toString('latin1')).join(' ');
    expect(text).toContain('(empty)');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await (await generateCopilotReviewExcel(vm, payload)).arrayBuffer());
    const sheet = workbook.getWorksheet('Orchestration')!;
    let column = 0;
    sheet.getRow(1).eachCell((cell, index) => {
      if (cell.value === 'Draft change (Not applied)') column = index;
    });
    expect(column).toBeGreaterThan(0);
    expect(sheet.getRow(2).getCell(column).value).toBe('(empty)');
  });
});
