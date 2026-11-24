import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../generated/services/MicrosoftDataverseService', () => ({
  MicrosoftDataverseService: {
    PerformBoundActionWithOrganization: vi.fn(),
  },
}));

import { extractEvaluationResult } from '../services/DAEvaluationService';

describe('DA evaluation response normalization', () => {
  it('uses Not assessed rather than Fail when a criterion is missing', () => {
    const result = extractEvaluationResult({
      responsev2: {
        predictionOutput: {
          structuredOutput: {
            instructionsCriterion: {
              status: 'Pass',
              issues: [],
              passingChecks: [{ description: 'Clear purpose.' }],
            },
            summary: 'Partial synthetic response.',
          },
        },
      },
    });

    expect(result.instructionsCriterion.status).toBe('Pass');
    expect(result.actionsCriterion).toMatchObject({
      status: 'Not assessed',
      assessmentNotes: [{
        status: 'Not assessed',
      }],
    });
  });

  it('rejects unsupported status text as Not assessed', () => {
    const result = extractEvaluationResult({
      responsev2: {
        predictionOutput: JSON.stringify({
          instructionsCriterion: {
            status: 'Probably',
            issues: [],
            passingChecks: [],
          },
        }),
      },
    });

    expect(result.instructionsCriterion.status).toBe('Not assessed');
  });
});
