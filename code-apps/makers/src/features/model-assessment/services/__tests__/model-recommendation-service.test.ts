import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RecommendationUnavailableError,
  requestModelRecommendation,
  resetRecommendationServiceCache,
} from '../model-recommendation-service';
import type { RecommendationPayload } from '../../contracts/model-recommendation';

const mocks = vi.hoisted(() => ({ list: vi.fn(), predict: vi.fn() }));
vi.mock('../../../../generated/services/MicrosoftDataverseService', () => ({
  MicrosoftDataverseService: { PerformBoundActionWithOrganization: mocks.predict },
}));
vi.mock('../../../../shared/services/dataversePaging', () => ({ listDataverseRows: mocks.list }));

const payload = {
  sameModel: false,
  decision: { verdict: 'A', confidence: 'high', basis: 'better-quality', recommendedModel: 'GPT-5 Chat', confidenceFactors: [] },
} as unknown as RecommendationPayload;
const output = { verdict: 'A', confidence: 'high', headline: 'Use A', reasons: [], tradeoffs: [], caveats: [] };
const ok = (predictionOutput: unknown) => ({ success: true, data: { responsev2: { predictionOutput } } });
const fail = (message: string, status?: number) => ({ success: false, error: { message, status } });
const sourceOf = (call: unknown[]) => JSON.parse((call[4] as { source: string }).source).partnerSource;

beforeEach(() => {
  vi.clearAllMocks();
  resetRecommendationServiceCache();
  mocks.list.mockResolvedValue([{ msdyn_aimodelid: 'model-id' }]);
});

afterEach(() => vi.useRealTimers());

describe('requestModelRecommendation', () => {
  it('sends the comparison as JSON text to the published prompt and parses structured output', async () => {
    mocks.predict.mockResolvedValue(ok({ structuredOutput: output }));
    await expect(requestModelRecommendation(payload)).resolves.toMatchObject({ verdict: 'A', headline: 'Use A' });
    const [org, entitySet, action, id, body] = mocks.predict.mock.calls[0];
    expect([org, entitySet, action, id]).toEqual(['current', 'msdyn_aimodels', 'Microsoft.Dynamics.CRM.Predict', 'model-id']);
    expect(body.requestv2.ComparisonData).toBe(JSON.stringify(payload));
    expect(mocks.list.mock.calls[0][2].filter).toContain("'Recommend Model from Assessment Comparison' and statecode eq 1");
  });

  it('falls back from Copilot Credits to AI Builder capacity and keeps the source that worked', async () => {
    mocks.predict
      .mockResolvedValueOnce(fail('EntitlementNotAvailable for PVA', 403))
      .mockResolvedValue(ok({ text: JSON.stringify(output) }));
    await requestModelRecommendation(payload);
    await requestModelRecommendation(payload);
    expect(mocks.predict.mock.calls.map(sourceOf)).toEqual(['PVA', 'AIBuilder', 'AIBuilder']);
    expect(mocks.list).toHaveBeenCalledTimes(1);
  });

  it('reports missing capacity when every source is exhausted', async () => {
    mocks.predict.mockResolvedValue(fail('NoCapacity', 403));
    await expect(requestModelRecommendation(payload)).rejects.toThrow(RecommendationUnavailableError);
    expect(mocks.predict).toHaveBeenCalledTimes(2);
  });

  it('explains when the prompt is not installed and looks again next time', async () => {
    mocks.list.mockResolvedValueOnce([]);
    await expect(requestModelRecommendation(payload)).rejects.toThrow(/isn't published in this environment/);
    mocks.predict.mockResolvedValue(ok({ structuredOutput: output }));
    await expect(requestModelRecommendation(payload)).resolves.toMatchObject({ verdict: 'A' });
  });

  it('retries transient failures but not other errors', async () => {
    vi.useFakeTimers();
    mocks.predict.mockResolvedValueOnce(fail('Service unavailable', 503)).mockResolvedValue(ok({ structuredOutput: output }));
    const pending = requestModelRecommendation(payload);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(pending).resolves.toMatchObject({ verdict: 'A' });
    expect(mocks.predict).toHaveBeenCalledTimes(2);

    mocks.predict.mockReset().mockResolvedValue(fail('Bad request', 400));
    await expect(requestModelRecommendation(payload)).rejects.toThrow('Bad request');
    expect(mocks.predict).toHaveBeenCalledTimes(1);
  });
});
