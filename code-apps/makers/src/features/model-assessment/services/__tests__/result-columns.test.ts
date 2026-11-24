import { expect, it, vi } from 'vitest';
import { getEvaluationResults, getEvaluationRuns } from '../model-assessment-service';

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../../../../generated/services/MicrosoftDataverseService', () => ({
  MicrosoftDataverseService: { ListRecordsWithOrganization: mocks.list },
}));

it('reads result snapshots without querying retired expected/actual response columns', async () => {
  mocks.list.mockResolvedValue({ success: true, data: { value: [{
    cat_evaluationresultid: 'result',
    cat_testcaseid: 'case',
    cat_testcaseutterance: 'How do I request access?',
    cat_metrictype: 'GeneralQuality',
    cat_resultreason: 'Permission denied',
    'cat_resultstatuscode@OData.Community.Display.V1.FormattedValue': 'Fail',
  }] } });
  const [result] = await getEvaluationResults();
  expect(mocks.list.mock.calls[0][1]).toBe('cat_evaluationresults');
  const columns = mocks.list.mock.calls[0][6].split(',');
  expect(columns).not.toContain('cat_expectedresponse');
  expect(columns).not.toContain('cat_actualresponse');
  expect(columns).toContain('cat_testcaseutterance');
  expect(result).toMatchObject({
    id: 'result', testCaseId: 'case', question: 'How do I request access?',
    metric: 'GeneralQuality', status: 'Fail', reason: 'Permission denied',
  });
  expect(result).not.toHaveProperty('expectedResponse');
  expect(result).not.toHaveProperty('actualResponse');
});

it('reads Copilot Credits only from runs that report them', async () => {
  mocks.list.mockResolvedValue({ success: true, data: { value: [
    { cat_evaluationrunid: 'harness', cat_conversationcredits: 0.1602, cat_evaluatorcredits: 1.2426, cat_creditspartial: true },
    { cat_evaluationrunid: 'standard', cat_conversationcredits: null, cat_evaluatorcredits: null, cat_creditspartial: false },
  ] } });
  const [harness, standard] = await getEvaluationRuns();
  expect(harness.credits).toEqual({ conversation: 0.1602, evaluators: 1.2426, partial: true });
  expect(standard).not.toHaveProperty('credits');
});

it('reads the evaluation progress the flow writes while test sets run', async () => {
  mocks.list.mockResolvedValue({ success: true, data: { value: [
    { cat_evaluationrunid: 'running', cat_evaluationprogress: '{"setCases":[10,5],"setsDone":1}' },
    { cat_evaluationrunid: 'older', cat_evaluationprogress: null },
  ] } });
  const [running, older] = await getEvaluationRuns();
  expect(mocks.list.mock.lastCall?.[6].split(',')).toContain('cat_evaluationprogress');
  expect(running.progress).toEqual({ setCases: [10, 5], setsDone: 1 });
  expect(older).not.toHaveProperty('progress');
});

it('reads older Content Safety results under their per-category identity', async () => {
  mocks.list.mockResolvedValue({ success: true, data: { value: [
    { cat_evaluationresultid: 'legacy', cat_metrictype: 'ContentSafety', cat_resultreason: '{"data":{"category":"violence"},"status":"Pass"}' },
    { cat_evaluationresultid: 'current', cat_metrictype: 'ContentSafety:selfharm', cat_resultreason: '{"data":{"category":"selfharm"},"status":"Pass"}' },
  ] } });
  const [legacy, current] = await getEvaluationResults();
  expect(legacy.metric).toBe('ContentSafety:violence');
  expect(current.metric).toBe('ContentSafety:selfharm');
});

it('reads per-test-case Copilot Credits from harness results only', async () => {
  mocks.list.mockResolvedValue({ success: true, data: { value: [
    { cat_evaluationresultid: 'harness', cat_conversationcredits: 0.1652, cat_evaluatorcredits: 1.1958 },
    { cat_evaluationresultid: 'standard', cat_conversationcredits: null, cat_evaluatorcredits: null },
  ] } });
  const [harness, standard] = await getEvaluationResults();
  expect(harness.credits).toEqual({ conversation: 0.1652, evaluators: 1.1958 });
  expect(standard).not.toHaveProperty('credits');
});
