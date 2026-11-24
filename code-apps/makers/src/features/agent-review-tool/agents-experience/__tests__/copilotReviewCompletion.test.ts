import { describe, expect, it } from 'vitest';
import { getCopilotReviewCompletion } from '../services/copilotReviewCompletion';
import { copilotPayloadWithRawResourceContent } from './skillTestFixtures';

describe('Copilot review execution completion', () => {
  it('does not mark a complete legacy snapshot failed for an unrecorded stage', () => {
    const { payload } = copilotPayloadWithRawResourceContent();
    expect(payload.crossSkillOrchestration).toBeUndefined();
    expect(payload.analysisStatus).toBeUndefined();
    expect(getCopilotReviewCompletion(payload)).toEqual({ status: 'completed' });
  });

  it('reports missing cross-skill output when the current review records AI stages', () => {
    const { payload } = copilotPayloadWithRawResourceContent();
    payload.analysisStatus = { instructionCoverage: { state: 'complete' } };
    expect(getCopilotReviewCompletion(payload)).toMatchObject({
      status: 'failed',
      errorMessage: expect.stringContaining('cross-skill assessment is unavailable'),
    });
  });

  it('does not treat complete stage metadata as a substitute for an applicable assessment', () => {
    const { payload } = copilotPayloadWithRawResourceContent();
    payload.model.skills.push({
      ...payload.model.skills[0],
      name: 'second-skill', schemaname: 'agent.skill.second', componentId: 'second', componentIdUnique: 'second',
    });
    payload.analysisStatus = {
      instructionCoverage: { state: 'complete' },
      crossSkillOrchestration: { state: 'complete' },
    };
    expect(payload.crossSkillOrchestration).toBeUndefined();
    expect(getCopilotReviewCompletion(payload)).toMatchObject({
      status: 'failed',
      errorMessage: expect.stringContaining('cross-skill assessment is unavailable'),
    });
  });

  it('does not require an assessment payload for a recorded N/A stage', () => {
    const { payload } = copilotPayloadWithRawResourceContent();
    payload.analysisStatus = {
      instructionCoverage: { state: 'complete' },
      crossSkillOrchestration: { state: 'not-applicable', reason: 'insufficient-skills' },
    };
    expect(payload.crossSkillOrchestration).toBeUndefined();
    expect(getCopilotReviewCompletion(payload)).toEqual({ status: 'completed' });
  });

  it('separates agent findings from execution failure', () => {
    const { payload } = copilotPayloadWithRawResourceContent();
    payload.score.errors = 8;
    payload.score.warnings = 1;
    payload.score.grounded = 70;
    expect(getCopilotReviewCompletion(payload)).toEqual({ status: 'completed' });
  });

  it('retains a failure for a partial deterministic assessment', () => {
    const { payload } = copilotPayloadWithRawResourceContent();
    payload.score.status = 'partial';
    expect(getCopilotReviewCompletion(payload)).toMatchObject({
      status: 'failed',
      errorMessage: expect.stringContaining('deterministic checks did not complete'),
    });
  });
});
