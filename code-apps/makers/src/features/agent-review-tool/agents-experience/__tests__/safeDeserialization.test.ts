/**
 * Safe deserialization & view mode tests (Task 11 — Gaps 2, 4).
 *
 * Tests isPersistedCopilotPayload type guard for correct discrimination
 * of persisted Microsoft Copilot harness payloads from malformed/null/unrelated data.
 */
import { describe, it, expect } from 'vitest';
import {
  isPersistedCopilotPayload,
  parsePersistedCopilotPayload,
} from '../utils/persistedCopilotReviewGuard';

// ---------------------------------------------------------------------------
// Type guard tests
// ---------------------------------------------------------------------------

describe('isPersistedCopilotPayload — type guard', () => {
  const validPayload = {
    model: { agentSettings: { instructions: 'test', raw: {} }, tools: [], skills: [], connectedAgents: [], knowledge: [], evaluationSets: [], testCases: [], multiTurnCases: [], triggers: [], unknownKinds: [] },
    findings: [],
    skillEvaluations: [],
    coverage: [],
    score: { grounded: 80, passed: 20, warnings: 2, errors: 1, evaluated: 23 },
    skillBundleReviews: [],
    skillReviewMode: 'standard',
    persistenceIssues: [],
    bundleRetrievalIssues: [],
  };

  it('returns true for a valid persisted payload', () => {
    expect(isPersistedCopilotPayload(validPayload)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isPersistedCopilotPayload(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isPersistedCopilotPayload(undefined)).toBe(false);
  });

  it('returns false for a string', () => {
    expect(isPersistedCopilotPayload('not a payload')).toBe(false);
  });

  it('returns false for a number', () => {
    expect(isPersistedCopilotPayload(42)).toBe(false);
  });

  it('returns false for an empty object', () => {
    expect(isPersistedCopilotPayload({})).toBe(false);
  });

  it('returns false when model is missing', () => {
    expect(isPersistedCopilotPayload({ ...validPayload, model: undefined })).toBe(false);
  });

  it('returns false when findings is not an array', () => {
    expect(isPersistedCopilotPayload({ ...validPayload, findings: 'string' })).toBe(false);
  });

  it('returns false when coverage is not an array', () => {
    expect(isPersistedCopilotPayload({ ...validPayload, coverage: null })).toBe(false);
  });

  it('returns false when score is null', () => {
    expect(isPersistedCopilotPayload({ ...validPayload, score: null })).toBe(false);
  });

  it('returns false when score.grounded is not a number', () => {
    expect(isPersistedCopilotPayload({
      ...validPayload,
      score: { ...validPayload.score, grounded: 'high' },
    })).toBe(false);
  });

  it('accepts a null grounded score for a review with no measurable pillars', () => {
    expect(isPersistedCopilotPayload({
      ...validPayload,
      score: { ...validPayload.score, grounded: null },
    })).toBe(true);
  });

  it('returns false when score is missing grounded', () => {
    const score = { passed: 20, warnings: 2, errors: 1, evaluated: 23 };
    expect(isPersistedCopilotPayload({ ...validPayload, score })).toBe(false);
  });

  it('returns false for an incomplete payload that would crash the view model', () => {
    const incomplete = {
      model: { agentSettings: {} },
      findings: [],
      coverage: [],
      score: { grounded: 0 },
    };
    expect(isPersistedCopilotPayload(incomplete)).toBe(false);
  });

  it('returns false when persisted bundle reviews are missing', () => {
    expect(isPersistedCopilotPayload({
      ...validPayload,
      skillBundleReviews: undefined,
    })).toBe(false);
  });

  it('requires triggers after legacy payload normalization', () => {
    const legacyModel = Object.fromEntries(
      Object.entries(validPayload.model).filter(([key]) => key !== 'triggers'),
    );
    const legacyPayload = { ...validPayload, model: legacyModel };

    expect(isPersistedCopilotPayload(legacyPayload)).toBe(false);
    expect(parsePersistedCopilotPayload(legacyPayload)?.model.triggers).toEqual([]);
  });

  it('returns false for an unsupported review mode', () => {
    expect(isPersistedCopilotPayload({
      ...validPayload,
      skillReviewMode: 'turbo',
    })).toBe(false);
  });
});
