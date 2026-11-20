/**
 * What the standard harness' composite must keep true.
 *
 * The point of these tests is not the arithmetic — `scoring.test.ts` owns that — but the three
 * claims that make the move from `calculateAssessedScores` to the shared scorer honest:
 *
 *  1. every pillar the registry weighs is present, with the registry's weight;
 *  2. a standard agent with no evaluations is *measured* as having none, not excused;
 *  3. a capture that could not see evaluations is scored but disclosed as partial, so the two
 *     cases above are never collapsed into the same number without a flag.
 */

import { describe, expect, it } from 'vitest';
import type { InstructionEvaluation, PatternEvaluation } from '../../contracts/StageOutputs';
import type { NormalizedEvaluationEvidence } from '../contracts/EvaluationEvidence';
import { AGENT_PILLAR_WEIGHTS } from '../../review-core';
import { COMPLIANCE_CRITERIA } from '../../contracts/Constants';
import { standardCompositeScore } from './standardCompositeScore';
import type { StandardAgentSource } from './standardModelProjection';

function agent(overrides: Partial<StandardAgentSource> = {}): StandardAgentSource {
  return {
    agentInstructions: 'You help with expenses. Ask a clarifying question when the claim is vague.',
    agentSettings: {},
    toolDetails: [{ name: 'SubmitClaim', schemaName: 'submit_claim', toolType: 'connector' }],
    connectedAgents: [],
    childAgents: [],
    knowledgeDetails: [],
    topicComponents: [],
    topics: [],
    ...overrides,
  } as StandardAgentSource;
}

function evidence(overrides: Partial<NormalizedEvaluationEvidence> = {}): NormalizedEvaluationEvidence {
  return {
    evaluationSets: [], testCases: [], multiTurnCases: [],
    availability: 'complete', source: 'live',
    capturedComponentCount: 0, evaluationComponentCount: 0,
    diagnostics: [], unlinkedCaseIds: [],
    ...overrides,
  } as NormalizedEvaluationEvidence;
}

const NO_PATTERNS = { Patterns: [] } as unknown as PatternEvaluation;

/**
 * An instruction assessment that genuinely examined every criterion and found nothing wrong.
 *
 * `{ issues: [] }` alone does *not* mean this. `getInstructionAssessments` reads a result with no
 * `criterionAssessments` as "not assessed" for all fifteen criteria, which the scorer then treats
 * as fifteen checks that produced no verdict — so a fixture that omits them is asserting an
 * unexamined agent, not a clean one. The explicit pass list is what makes these tests about
 * evaluation evidence rather than about a workflow that returned nothing.
 */
const CLEAN_INSTRUCTIONS = {
  compliancePercentage: 100,
  issues: [],
  criterionAssessments: COMPLIANCE_CRITERIA.map(c => ({ criteriaId: c.id, status: 'pass' })),
} as unknown as InstructionEvaluation;

/** A workflow reply that carried no criterion verdicts at all. */
const BARE_INSTRUCTIONS = { compliancePercentage: 100, issues: [] } as unknown as InstructionEvaluation;

describe('standard composite score — pillar surface', () => {
  it('weighs every pillar exactly as the registry does', () => {
    const result = standardCompositeScore(agent(), evidence(), NO_PATTERNS, CLEAN_INSTRUCTIONS);

    const byPillar = Object.fromEntries(result.pillars.map(p => [p.pillar, p.weight]));
    expect(byPillar).toEqual({
      Instructions: AGENT_PILLAR_WEIGHTS.instructions,
      Skills: AGENT_PILLAR_WEIGHTS.skills,
      Tools: AGENT_PILLAR_WEIGHTS.tools,
      Knowledge: AGENT_PILLAR_WEIGHTS.knowledge,
      Orchestration: AGENT_PILLAR_WEIGHTS.orchestration,
      Evaluation: AGENT_PILLAR_WEIGHTS.evaluation,
    });
  });

  it('restates no weight of its own — the six sum to 100', () => {
    const result = standardCompositeScore(agent(), evidence(), NO_PATTERNS, CLEAN_INSTRUCTIONS);

    expect(result.pillars.reduce((sum, p) => sum + p.weight, 0)).toBe(100);
  });
});

describe('standard composite score — evaluation is measured, never excused', () => {
  it('scores a live agent with no evaluation sets as a measured zero', () => {
    const result = standardCompositeScore(agent(), evidence(), NO_PATTERNS, CLEAN_INSTRUCTIONS);

    const evaluation = result.pillars.find(p => p.pillar === 'Evaluation')!;
    expect(evaluation.applicable).toBe(true);
    expect(evaluation.score).toBe(0);
  });

  it('reports a live capture with no evaluation rows as complete evidence', () => {
    const result = standardCompositeScore(agent(), evidence(), NO_PATTERNS, CLEAN_INSTRUCTIONS);

    expect(result.status).toBe('complete');
  });

  it('still produces a composite when nothing was evaluated', () => {
    const result = standardCompositeScore(agent(), evidence(), NO_PATTERNS, CLEAN_INSTRUCTIONS);

    expect(result.composite).not.toBeNull();
    expect(result.composite).toBeGreaterThanOrEqual(0);
    expect(result.composite).toBeLessThanOrEqual(100);
  });
});

describe('standard composite score — unreadable evidence is disclosed, not invented', () => {
  it('marks a review partial when the capture could not see evaluations', () => {
    const unreadable = evidence({ availability: 'unavailable', source: 'zip' });

    const result = standardCompositeScore(agent(), unreadable, NO_PATTERNS, CLEAN_INSTRUCTIONS);

    expect(result.status).toBe('partial');
  });

  it('marks a review partial when no evidence was carried at all', () => {
    const result = standardCompositeScore(agent(), undefined, NO_PATTERNS, CLEAN_INSTRUCTIONS);

    expect(result.status).toBe('partial');
  });

  it('scores unreadable evidence identically to a confirmed absence, so only the flag differs', () => {
    const confirmed = standardCompositeScore(agent(), evidence(), NO_PATTERNS, CLEAN_INSTRUCTIONS);
    const unreadable = standardCompositeScore(
      agent(), evidence({ availability: 'unavailable', source: 'zip' }), NO_PATTERNS, CLEAN_INSTRUCTIONS,
    );

    expect(unreadable.composite).toBe(confirmed.composite);
    expect(unreadable.status).not.toBe(confirmed.status);
  });
});

describe('standard composite score — a single pillar is not a grade', () => {
  it('withholds the composite when the workflow returned no criterion verdicts', () => {
    const result = standardCompositeScore(agent(), evidence(), NO_PATTERNS, BARE_INSTRUCTIONS);

    expect(result.composite).toBeNull();
  });

  it('does not publish an untested agent as a measured zero', () => {
    const evaluationOnly = standardCompositeScore(agent(), evidence(), NO_PATTERNS, BARE_INSTRUCTIONS);

    const evaluation = evaluationOnly.pillars.find(p => p.pillar === 'Evaluation')!;
    expect(evaluation.score).toBe(0);
    expect(evaluationOnly.composite).not.toBe(0);
  });

  it('publishes the composite as soon as one pillar beyond Evaluation was measured', () => {
    const result = standardCompositeScore(agent(), evidence(), NO_PATTERNS, CLEAN_INSTRUCTIONS);

    const instructions = result.pillars.find(p => p.pillar === 'Instructions')!;
    expect(instructions.score).not.toBeNull();
    expect(result.composite).not.toBeNull();
  });
});

describe('standard composite score — rule results are the evidence behind the number', () => {
  it('returns the rule instances it scored', () => {
    const result = standardCompositeScore(agent(), evidence(), NO_PATTERNS, CLEAN_INSTRUCTIONS);

    expect(result.ruleResults.length).toBeGreaterThan(0);
  });

  it('places every scored row in a pillar the registry weighs', () => {
    const result = standardCompositeScore(agent(), evidence(), NO_PATTERNS, CLEAN_INSTRUCTIONS);

    const weighed = new Set(result.pillars.map(p => p.pillar));
    expect(weighed.size).toBe(6);
    expect(result.ruleResults.every(r => typeof r.ruleId === 'string' && r.ruleId.length > 0)).toBe(true);
  });
});
