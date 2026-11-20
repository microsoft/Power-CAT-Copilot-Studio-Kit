import { SSRProvider } from '@fluentui/react-components';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildReviewViewModel } from '../components/viewModel';
import { FindingsGrouped } from '../components/findings/FindingsGrouped';
import { buildFindingsGroupedView } from '../components/findings/findingsGroupedModel';
import { SkillsGrouped } from '../components/skills/SkillsGrouped';
import { buildPersistedCopilotReview } from '../services/skill/persistedSkillReview';
import { copilotGuidanceSourceLabel, getCopilotFindingGuidance } from '../services/copilotContextualGuidance';
import { parsePersistedCopilotPayload } from '../utils/persistedCopilotReviewGuard';
import {
  buildFindingExportRows, generateCopilotReviewExcel, generateCopilotReviewPdf,
} from '../utils/copilotReviewExport';
import { pdfPageText } from '../../utils/__tests__/csPdfFixtures';
import { contextualGuidanceFixture } from './contextualGuidanceFixtures';

function persisted() {
  const { input } = contextualGuidanceFixture();
  const result = buildPersistedCopilotReview(input);
  return parsePersistedCopilotPayload(JSON.parse(result.json))!;
}

describe('contextual guidance across saved reviews and presentation', () => {
  it.each([
    ['saved', 'Guidance saved with this review.'],
    ['snapshot', 'Guidance built from the agent data and findings in this review.'],
    ['saved-and-snapshot', 'Guidance saved with this review, with additions built from the agent data and findings.'],
  ] as const)('labels %s guidance without implying an earlier assessment', (source, expected) => {
    const label = copilotGuidanceSourceLabel(source);
    expect(label).toBe(expected);
    expect(label).not.toContain('not a new assessment');
    expect(label).not.toContain('AI-generated');
  });

  it.each([48, 56])('adds legacy advice without rewriting the saved %i score or finding', score => {
    const payload = persisted();
    payload.score.grounded = score;
    for (const finding of payload.findings) delete finding.remediation;
    expect(getCopilotFindingGuidance(payload.findings[0], payload)!.suggestedText).toContain('reward tier or points');
    for (const review of payload.skillBundleReviews) {
      for (const finding of review.findings) delete finding.remediation;
    }
    const original = JSON.stringify(payload);
    const reopened = parsePersistedCopilotPayload(JSON.parse(original))!;
    const vm = buildReviewViewModel(reopened, 'Reviewer', 0, 'Example agent');
    expect(vm.summary.score).toBe(score);
    expect(vm.findings[0].remediation?.suggestedText).toContain('member-status');
    expect(vm.findings[0]).toMatchObject({
      id: payload.findings[0].id, title: payload.findings[0].title,
      fact: payload.findings[0].fact, why: payload.findings[0].why,
      fix: payload.findings[0].fix, provenance: 'deterministic',
    });
    expect(vm.findings).toHaveLength(payload.findings.length);
    expect(reopened.ruleResults).toEqual(payload.ruleResults);
    expect(JSON.stringify(reopened)).toBe(original);
    expect(JSON.stringify(payload)).toBe(original);
  });

  it('retains additive advice in future saved payloads without changing score or outcomes', () => {
    const { input } = contextualGuidanceFixture();
    const before = JSON.stringify(input);
    const result = buildPersistedCopilotReview(input);
    const payload = parsePersistedCopilotPayload(JSON.parse(result.json))!;
    expect(payload.findings[0].remediation?.source).toBe('snapshot');
    expect(payload.findings[1].remediation?.componentIdUnique).toBe('member-unique');
    expect(payload.skillBundleReviews[0].findings[0].remediation?.componentIdUnique).toBe('member-unique');
    expect(payload.skillBundleReviews[0].deterministic.findings[0].remediation)
      .toEqual(payload.skillBundleReviews[0].findings[0].remediation);
    expect(payload.score).toEqual(input.payload.score);
    expect(payload.ruleResults).toEqual(input.payload.ruleResults);
    expect(payload.findings).toHaveLength(input.payload.findings.length);
    expect(result.json.length).toBeLessThanOrEqual(900_000);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('uses captured ZIP text for advice without replacing the persisted ZIP source model', () => {
    const { input, skill } = contextualGuidanceFixture();
    input.payload.model.skills = [{
      ...skill, source: 'zip-bundle', frontmatterDescription: undefined,
      markdown: '<!-- bic:bundle=example.file.bundle -->', body: '',
    }];
    input.bundles[0].source = 'zip-bundle';
    const result = buildPersistedCopilotReview(input);
    const payload = parsePersistedCopilotPayload(JSON.parse(result.json))!;
    expect(payload.model.skills[0].source).toBe('zip-bundle');
    expect(payload.model.skills[0].markdown).toContain('bic:bundle');
    expect(payload.findings[0].remediation?.suggestedText).toContain('reward tier or points');
    for (const finding of payload.findings) delete finding.remediation;
    expect(getCopilotFindingGuidance(payload.findings[0], payload)!.suggestedText).toContain('reward tier or points');
    const advice = getCopilotFindingGuidance(payload.findings[1], payload)!;
    expect(advice.suggestedText).toContain('reward tier or points');
  });

  it('shows the Standard example, unapplied draft, and verification in both finding surfaces', () => {
    const payload = persisted();
    const vm = buildReviewViewModel(payload, 'Reviewer', 0, 'Example agent');
    const findings = renderToStaticMarkup(
      createElement(SSRProvider, null, createElement(FindingsGrouped, {
        grouped: buildFindingsGroupedView(vm.findings), focusFindingId: 'INS-01',
      })),
    );
    const skills = renderToStaticMarkup(
      createElement(SSRProvider, null, createElement(SkillsGrouped, { grouped: vm.skillsGrouped })),
    );
    for (const html of [findings, skills]) {
      expect(html).toContain('Example for this agent');
      expect(html).toContain('Draft change');
      expect(html).toContain('Not applied');
      expect(html).toContain('How to verify');
      expect(html).toContain('member-status');
      expect(html).toContain('Guidance built from the agent data and findings in this review.');
    }
    expect(findings).toContain(payload.findings[0].why);
    expect(findings).toContain(payload.findings[0].fix);
  });

  it('exports the same advice to Excel and PDF without changing the selected review', async () => {
    const payload = persisted();
    delete payload.findings[0].remediation;
    const original = JSON.stringify(payload);
    const vm = buildReviewViewModel(payload, 'Reviewer', 0, 'Example agent');
    const guidance = vm.findings[0].remediation!;
    const rows = buildFindingExportRows(payload);
    expect(rows[0].example).toBe(guidance.whyItMatters);
    expect(rows[0].draftChange).toBe(guidance.suggestedText);
    expect(rows[0].acceptanceCheck).toBe(guidance.acceptanceCheck);
    expect(rows[0].guidanceSource).toBe('Guidance built from the agent data and findings in this review.');
    expect(rows).toHaveLength(payload.findings.length);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await (await generateCopilotReviewExcel(vm, payload)).arrayBuffer());
    const sheet = workbook.getWorksheet('Findings')!;
    const columns = new Map<string, number>();
    sheet.getRow(1).eachCell((cell, column) => columns.set(String(cell.value), column));
    expect(sheet.getRow(2).getCell(columns.get('Example for this agent')!).value).toBe(guidance.whyItMatters);
    expect(sheet.getRow(2).getCell(columns.get('Draft change (Not applied)')!).value).toBe(guidance.suggestedText);
    expect(sheet.getRow(2).getCell(columns.get('How to verify')!).value).toBe(guidance.acceptanceCheck);
    expect(sheet.getRow(2).getCell(columns.get('Guidance source')!).value).toBe(rows[0].guidanceSource);
    const pdf = generateCopilotReviewPdf(vm, payload);
    const text = pdfPageText(Buffer.from(await pdf.arrayBuffer()).toString('latin1')).join(' ').replace(/\s+/g, ' ');
    expect(text).toContain('Draft change (Not applied)');
    expect(text).toContain('member-status');
    expect(text).toContain('not proof of authorization');
    expect(text).toContain('How to verify');
    expect(text).toContain('Guidance built from the agent data and findings in this review.');
    expect(JSON.stringify(payload)).toBe(original);
  });

  it('redacts all saved narrative fields and keeps complete draft safety conditions', () => {
    const { input, authoring } = contextualGuidanceFixture();
    const secret = 'api_key = "sk-synthetic-secret-value"';
    const draft = `${'Keep the captured scope. '.repeat(30)}${secret}. Keep authorization checks.`;
    const finding = {
      ...authoring, ai: true, findingTitle: secret, whyItMatters: secret,
      makerAction: secret, acceptanceCheck: secret, suggestedText: draft,
    };
    input.payload.findings[1] = finding;
    input.payload.skillBundleReviews![0].deterministicFindings = [finding];
    const result = buildPersistedCopilotReview(input);
    expect(result.json).not.toContain('sk-synthetic-secret-value');
    const payload = parsePersistedCopilotPayload(JSON.parse(result.json))!;
    for (const saved of [payload.findings[1], payload.skillBundleReviews[0].findings[0]]) {
      expect(saved.suggestedText).toContain('Keep authorization checks.');
      expect(saved.remediation?.suggestedText).toContain('Keep authorization checks.');
      expect(saved.remediation?.source).toBe('saved');
    }
  });

  it('uses stable guidance identity for export attribution instead of another skill with the same rule', () => {
    const payload = persisted();
    const other = {
      ...payload.model.skills[0], name: 'parcel-progress', frontmatterName: 'parcel-progress',
      componentId: 'parcel-component', componentIdUnique: 'parcel-unique',
      schemaname: 'example.skill.parcel-progress',
      frontmatterDescription: 'Use when a user asks for shipment progress.',
    };
    payload.model.skills.push(other);
    payload.findings[1] = {
      ...payload.findings[1], componentIdUnique: other.componentIdUnique, remediation: undefined,
    };
    const row = buildFindingExportRows(payload)[1];
    expect(row.skillName).toBe('parcel-progress');
    expect(row.guidanceComponentId).toBe(other.componentIdUnique);
    expect(row.draftChange).toContain('shipment progress');
    expect(row.draftChange).not.toContain('reward tier or points');
  });

  it('rejects invalid new guidance metadata instead of crashing or displaying it as valid advice', () => {
    const payload = persisted();
    expect(parsePersistedCopilotPayload({
      ...payload,
      findings: [{ ...payload.findings[0], remediation: { source: 'invented', suggestedText: 12 } }],
    })).toBeUndefined();
  });
});
