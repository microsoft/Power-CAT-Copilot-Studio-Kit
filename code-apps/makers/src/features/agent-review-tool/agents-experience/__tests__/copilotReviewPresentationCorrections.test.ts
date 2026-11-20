import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import type { ReviewStageStatus } from '../../contracts/ReviewResult';
import { buildPersistedCopilotReview } from '../services/skill/persistedSkillReview';
import { getCopilotReviewCompletion } from '../services/copilotReviewCompletion';
import { parsePersistedCopilotPayload } from '../utils/persistedCopilotReviewGuard';
import { buildReviewViewModel } from '../components/viewModel';
import { SummaryRail } from '../components/SummaryRail';
import { generateCopilotReviewExcel, generateCopilotReviewPdf } from '../utils/copilotReviewExport';
import { copilotPayloadWithRawResourceContent } from './skillTestFixtures';
import { pdfPageText } from '../../utils/__tests__/csPdfFixtures';

function persisted(status?: ReviewStageStatus) {
  const input = copilotPayloadWithRawResourceContent();
  input.payload.analysisStatus = {
    instructionCoverage: { state: 'complete' },
    ...(status ? { crossSkillOrchestration: status } : {}),
  };
  if (status?.state === 'complete') {
    input.payload.crossSkillOrchestration = {
      status: 'complete', findings: [], summary: '', referenceIds: [],
    };
  }
  input.payload.model.agentSettings.enableWebSearch = undefined;
  const result = buildPersistedCopilotReview(input);
  const payload = parsePersistedCopilotPayload(JSON.parse(result.json))!;
  const vm = buildReviewViewModel(payload, 'Reviewer', 1000, 'Loyalty');
  return { payload, vm };
}

describe('saved assessment-state presentation', () => {
  it.each([
    [undefined, 'Unknown (legacy review)'],
    [{ state: 'not-applicable', reason: 'insufficient-skills' }, undefined],
    [{ state: 'not-applicable' }, undefined],
    [{ state: 'complete' }, 'Complete'],
    [{ state: 'partial', reason: 'incomplete-response' }, 'Partial'],
    [{ state: 'unavailable', reason: 'missing-output' }, 'Not evaluated (assessment unavailable)'],
    [{ state: 'failed', reason: 'invocation-failed' }, 'Failed'],
    [{ state: 'cancelled', reason: 'review-cancelled' }, 'Cancelled'],
  ] satisfies Array<[ReviewStageStatus | undefined, string | undefined]>)(
    'shows cross-skill state %j only when applicable in the UI, PDF, and workbook', async (status, label) => {
      const { payload, vm } = persisted(status);
      const original = JSON.stringify(payload);
      const html = renderToStaticMarkup(createElement(SummaryRail, { summary: vm.summary }));
      expect(html.includes('Cross-skill assessment')).toBe(label !== undefined);
      if (label !== undefined) expect(html).toContain(label);
      const pdf = generateCopilotReviewPdf(vm, payload);
      const text = pdfPageText(Buffer.from(await pdf.arrayBuffer()).toString('latin1')).join(' ');
      expect(text.includes('Cross-skill assessment:')).toBe(label !== undefined);
      if (label !== undefined) expect(text).toContain(label);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await (await generateCopilotReviewExcel(vm, payload)).arrayBuffer());
      const summary = workbook.getWorksheet('Summary')!;
      const values = new Map<unknown, unknown>();
      summary.eachRow(row => values.set(row.getCell(1).value, row.getCell(2).value));
      expect(values.has('Cross-skill assessment')).toBe(label !== undefined);
      expect(values.get('Cross-skill assessment')).toBe(label);
      expect(values.get('Web search')).toBe('Not captured');
      expect(JSON.stringify(payload)).toBe(original);
    },
  );

  it('shows an unknown web-search setting without calling it disabled', async () => {
    const { payload, vm } = persisted({ state: 'not-applicable', reason: 'insufficient-skills' });
    expect(vm.summary.webSearchEnabled).toBeUndefined();
    const html = renderToStaticMarkup(createElement(SummaryRail, { summary: vm.summary }));
    expect(html).toContain('Not captured');
    const pdf = generateCopilotReviewPdf(vm, payload);
    const text = pdfPageText(Buffer.from(await pdf.arrayBuffer()).toString('latin1')).join(' ');
    expect(text).toContain('Web search: Not captured');
    expect(text).not.toContain('Web search: Disabled');
  });

  it.each(['missing', 'partial'] as const)(
    'does not show complete stage metadata as complete when its assessment is %s', state => {
      const { payload } = persisted({ state: 'complete' });
      if (state === 'missing') delete payload.crossSkillOrchestration;
      else payload.crossSkillOrchestration!.status = 'partial';
      const saved = JSON.stringify(payload);
      const vm = buildReviewViewModel(payload, 'Reviewer', 0, 'Loyalty');
      expect(vm.summary.crossSkillOrchestrationStatus?.state)
        .toBe(state === 'missing' ? 'unavailable' : 'partial');
      expect(getCopilotReviewCompletion(payload).status).toBe('failed');
      expect(JSON.stringify(payload)).toBe(saved);
    },
  );

  it('keeps failed checks separate from N/A through persistence and the checks view', () => {
    const input = copilotPayloadWithRawResourceContent();
    input.payload.ruleResults = [
      { key: 'TOL-02', ruleId: 'TOL-02', family: 'Tools', status: 'not-applicable' },
      {
        key: 'TOL-04', ruleId: 'TOL-04', family: 'Tools', status: 'failed',
        incomplete: true, reason: 'Tool inventory was not captured.',
      },
    ];
    const result = buildPersistedCopilotReview(input);
    const payload = parsePersistedCopilotPayload(JSON.parse(result.json))!;
    const vm = buildReviewViewModel(payload, 'Reviewer', 0, 'Agent');
    expect(payload.ruleResults).toEqual(input.payload.ruleResults);
    expect(vm.checks.totals).toMatchObject({ notApplicable: 1, failed: 1, passed: 0 });
    expect(vm.summary.notApplicable).toBe(1);
  });

  it('does not rewrite historical unknown stage evidence or recalculate its saved score', () => {
    const { payload } = persisted();
    payload.score.grounded = 56;
    payload.score.passed = 18;
    payload.score.evaluated = 24;
    const original = JSON.stringify(payload);
    const reopened = parsePersistedCopilotPayload(JSON.parse(original))!;
    buildReviewViewModel(reopened, 'Reviewer', 0, 'Agent');
    getCopilotReviewCompletion(reopened);
    expect(JSON.stringify(reopened)).toBe(original);
    expect(reopened.analysisStatus?.crossSkillOrchestration).toBeUndefined();
    expect(reopened.score).toMatchObject({ grounded: 56, passed: 18, evaluated: 24 });
  });

  it('rejects an invalid stored cross-skill state rather than displaying it as completed', () => {
    const { payload } = persisted();
    expect(parsePersistedCopilotPayload({
      ...payload,
      analysisStatus: { instructionCoverage: { state: 'complete' }, crossSkillOrchestration: { state: 'nonsense' } },
    })).toBeUndefined();
  });
});
