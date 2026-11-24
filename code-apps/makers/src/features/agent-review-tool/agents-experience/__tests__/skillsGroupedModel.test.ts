import { describe, expect, it } from 'vitest';
import type {
  CopilotReviewDisplayPayload,
  PersistedSkillBundleReview,
} from '../../contracts/ReviewResult';
import type { GroundedSkillFinding, SkillRubricDimension } from '../contracts/Findings';
import type { SkillBundleScores } from '../contracts/SkillBundle';
import type { CrossSkillOrchestrationEvaluation } from '../contracts/SkillEvaluation';
import type { SkillView } from '../components/viewTypes';
import { buildSkillsGroupedView } from '../components/skillsGroupedModel';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function scores(overrides: Partial<Record<SkillRubricDimension, number | null>> = {}): SkillBundleScores {
  const q = (value: number | null) => ({ value, status: 'complete' as const, coveragePercent: 100 });
  const pick = (dim: SkillRubricDimension) => (dim in overrides ? overrides[dim]! : 80);
  return {
    quality: q(pick('quality')),
    integrity: q(pick('integrity')),
    safety: q(pick('safety')),
    readiness: q(pick('readiness')),
    safetyGate: 'none',
  };
}

function skillFinding(overrides: Partial<GroundedSkillFinding> = {}): GroundedSkillFinding {
  return {
    id: 'SKL-01',
    family: 'Skills',
    severity: 'medium',
    title: 'Test finding',
    fact: 'first line evidence\nsecond line',
    why: 'why it matters',
    fix: 'how to fix',
    referenceId: 'ms-skills-overview',
    ai: true,
    ruleId: 'SKL-01',
    evidence: 'first line evidence',
    recommendation: 'how to fix',
    fixSteps: [{ order: 1, action: 'do the thing' }],
    referenceIds: ['ms-skills-overview'],
    confidence: 'high',
    ...overrides,
  };
}

function bundleReview(
  skillName: string,
  findings: GroundedSkillFinding[],
  scoreOverrides?: Partial<Record<SkillRubricDimension, number | null>>,
  skillId = skillName,
): PersistedSkillBundleReview {
  return {
    skillComponentUniqueId: skillId,
    skillName,
    findings,
    scores: scores(scoreOverrides),
    manifest: [],
  } as unknown as PersistedSkillBundleReview;
}

function payload(
  reviews: PersistedSkillBundleReview[],
  orchestration?: CrossSkillOrchestrationEvaluation,
): CopilotReviewDisplayPayload {
  return {
    model: {} as CopilotReviewDisplayPayload['model'],
    findings: [],
    skillEvaluations: [],
    coverage: [],
    score: { grounded: 100, passed: 0, warnings: 0, errors: 0, evaluated: 0 },
    skillBundleReviews: reviews,
    crossSkillOrchestration: orchestration,
  } as unknown as CopilotReviewDisplayPayload;
}

const skillView = (name: string, id = name): SkillView => ({
  id,
  schemaName: `agent.skill.${id}`,
  name,
  description: '',
  source: 'inline',
  safetyFlagged: false,
  sizeLabel: '1 KB',
  dimensions: [],
  evaluationState: 'evaluated',
  markdown: '',
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildSkillsGroupedView', () => {
  it('always emits exactly the four rubric dimension groups', () => {
    const view = buildSkillsGroupedView(payload([]), []);
    expect(view.groups).toHaveLength(4);
    expect(view.groups.map((g) => g.dimension).sort()).toEqual(
      ['integrity', 'quality', 'readiness', 'safety'],
    );
  });

  it('leaves a dimension all-clear (no patterns) when it has no findings', () => {
    const view = buildSkillsGroupedView(payload([bundleReview('A', [])]), [skillView('A')]);
    for (const g of view.groups) {
      expect(g.patterns).toHaveLength(0);
    }
  });

  it('groups per-skill findings by rule id into patterns with one instance per skill', () => {
    const view = buildSkillsGroupedView(
      payload([
        bundleReview('A', [skillFinding({ id: 'SKL-01', ruleId: 'SKL-01' })]),
        bundleReview('B', [skillFinding({ id: 'SKL-01', ruleId: 'SKL-01' })]),
      ]),
      [skillView('A'), skillView('B')],
    );
    const quality = view.groups.find((g) => g.dimension === 'quality')!;
    expect(quality.patterns).toHaveLength(1);
    expect(quality.patterns[0].ruleId).toBe('SKL-01');
    expect(quality.patterns[0].instances.map((i) => i.skillName).sort()).toEqual(['A', 'B']);
    // evidence is the first line of the fact
    expect(quality.patterns[0].instances[0].evidence).toBe('first line evidence');
  });

  it('honours an explicit dimension on the finding over the registry fallback', () => {
    const view = buildSkillsGroupedView(
      payload([bundleReview('A', [skillFinding({ id: 'SKL-01', ruleId: 'SKL-01', dimension: 'readiness' })])]),
      [skillView('A')],
    );
    expect(view.groups.find((g) => g.dimension === 'readiness')!.patterns).toHaveLength(1);
    expect(view.groups.find((g) => g.dimension === 'quality')!.patterns).toHaveLength(0);
  });

  it('aggregates a dimension score as the worst (lowest) non-null value across skills', () => {
    const view = buildSkillsGroupedView(
      payload([
        bundleReview('A', [], { quality: 90 }),
        bundleReview('B', [], { quality: 55 }),
      ]),
      [skillView('A'), skillView('B')],
    );
    expect(view.groups.find((g) => g.dimension === 'quality')!.score).toBe(55);
  });

  it('reports a null score when a dimension was never scored', () => {
    const view = buildSkillsGroupedView(
      payload([bundleReview('A', [], { safety: null })]),
      [skillView('A')],
    );
    expect(view.groups.find((g) => g.dimension === 'safety')!.score).toBeNull();
  });

  it('orders groups worst-first: dimensions with the most severe findings float up', () => {
    const view = buildSkillsGroupedView(
      payload([
        bundleReview('A', [
          skillFinding({ id: 'SKL-01', ruleId: 'SKL-01', severity: 'low', dimension: 'quality' }),
          skillFinding({ id: 'SKL-99', ruleId: 'SKL-99', severity: 'critical', dimension: 'safety' }),
        ]),
      ]),
      [skillView('A')],
    );
    // safety (critical -> error) must come before quality (low -> info)
    const safetyIdx = view.groups.findIndex((g) => g.dimension === 'safety');
    const qualityIdx = view.groups.findIndex((g) => g.dimension === 'quality');
    expect(safetyIdx).toBeLessThan(qualityIdx);
  });

  it('keeps the worst severity for a rule seen at multiple severities', () => {
    const view = buildSkillsGroupedView(
      payload([
        bundleReview('A', [skillFinding({ id: 'SKL-01', ruleId: 'SKL-01', severity: 'low', dimension: 'quality' })]),
        bundleReview('B', [skillFinding({ id: 'SKL-01', ruleId: 'SKL-01', severity: 'critical', dimension: 'quality' })]),
      ]),
      [skillView('A'), skillView('B')],
    );
    const pattern = view.groups.find((g) => g.dimension === 'quality')!.patterns[0];
    expect(pattern.sev).toBe('error');
  });

  it('derives mixed provenance from all instances instead of the first instance', () => {
    const view = buildSkillsGroupedView(
      payload([
        bundleReview('A', [skillFinding({ ai: false })]),
        bundleReview('B', [skillFinding({ ai: true })]),
      ]),
      [skillView('A'), skillView('B')],
    );

    const pattern = view.groups.flatMap(group => group.patterns)[0];
    expect(pattern.provenance).toBe('mixed');
    expect(pattern.instances.map(instance => instance.finding.provenance)).toEqual([
      'deterministic',
      'ai-generated',
    ]);
  });

  it('keeps uniform and missing legacy provenance distinct', () => {
    const deterministic = buildSkillsGroupedView(
      payload([bundleReview('A', [skillFinding({ ai: false })])]),
      [skillView('A')],
    );
    const legacy = buildSkillsGroupedView(
      payload([bundleReview('A', [skillFinding({ ai: undefined })])]),
      [skillView('A')],
    );

    expect(deterministic.groups.flatMap(group => group.patterns)[0].provenance)
      .toBe('deterministic');
    expect(legacy.groups.flatMap(group => group.patterns)[0].provenance)
      .toBe('unknown');
  });

  it('generates pairwise combinations for a pairwise orchestration finding', () => {
    const orch: CrossSkillOrchestrationEvaluation = {
      status: 'complete',
      summary: 'overlaps found',
      referenceIds: [],
      findings: [
        {
          id: 'XSK-01:a+b+c',
          ruleId: 'XSK-01',
          type: 'overlap',
          severity: 'medium',
          title: 'Overlapping triggers',
          skills: ['A', 'B', 'C'],
          evidence: 'all three share a trigger',
          rationale: 'routing ambiguity',
          recommendation: 'disambiguate',
          fixSteps: [],
          referenceIds: [],
          confidence: 'high',
        },
      ],
    };
    const view = buildSkillsGroupedView(
      payload([], orch),
      [skillView('A', 'skill-a'), skillView('B', 'skill-b'), skillView('C', 'skill-c')],
    );
    expect(view.orchestration).toHaveLength(1);
    // 3 skills -> 3 unique pairs
    expect(view.orchestration[0].pairs).toHaveLength(3);
    expect(view.orchestration[0].pairs).toEqual([
      {
        id: 'XSK-01:a+b+c:0:1',
        a: 'A',
        b: 'B',
        aSkillId: 'skill-a',
        bSkillId: 'skill-b',
        evidence: 'all three share a trigger',
      },
      {
        id: 'XSK-01:a+b+c:0:2',
        a: 'A',
        b: 'C',
        aSkillId: 'skill-a',
        bSkillId: 'skill-c',
        evidence: 'all three share a trigger',
      },
      {
        id: 'XSK-01:a+b+c:1:2',
        a: 'B',
        b: 'C',
        aSkillId: 'skill-b',
        bSkillId: 'skill-c',
        evidence: 'all three share a trigger',
      },
    ]);
  });

  it('does not generate pairs for a set-level (non-pairwise) orchestration finding', () => {
    const orch: CrossSkillOrchestrationEvaluation = {
      status: 'complete',
      summary: 'gap',
      referenceIds: [],
      findings: [
        {
          id: 'XSK-05:set',
          ruleId: 'XSK-05',
          type: 'coverage-gap',
          severity: 'low',
          title: 'Coverage gap',
          skills: ['A', 'B', 'C'],
          evidence: 'no skill handles refunds',
          rationale: 'missing capability',
          recommendation: 'add a skill',
          fixSteps: [],
          referenceIds: [],
          confidence: 'medium',
        },
      ],
    };
    const view = buildSkillsGroupedView(payload([], orch), []);
    expect(view.orchestration[0].pairs).toHaveLength(0);
    expect(view.orchestration[0].skills).toEqual(['A', 'B', 'C']);
  });

  it('returns an empty orchestration list when the payload has none', () => {
    const view = buildSkillsGroupedView(payload([bundleReview('A', [])]), [skillView('A')]);
    expect(view.orchestration).toEqual([]);
  });

  it('uses stable-id lookups for all skill drill-downs', () => {
    const view = buildSkillsGroupedView(
      payload([bundleReview('A', [])]),
      [skillView('A'), skillView('B')],
    );
    expect(Object.keys(view.skillsById).sort()).toEqual(['A', 'B']);
  });

  it('keeps duplicate display names distinct in finding drill-down', () => {
    const view = buildSkillsGroupedView(
      payload([
        bundleReview('Duplicate', [skillFinding()], undefined, 'skill-a'),
        bundleReview('Duplicate', [skillFinding()], undefined, 'skill-b'),
      ]),
      [
        skillView('Duplicate', 'skill-a'),
        skillView('Duplicate', 'skill-b'),
      ],
    );
    const pattern = view.groups.flatMap(group => group.patterns)[0];

    expect(Object.keys(view.skillsById).sort()).toEqual(['skill-a', 'skill-b']);
    expect(pattern.instances.map(instance => instance.skillId).sort()).toEqual([
      'skill-a',
      'skill-b',
    ]);
  });

  it('does not guess orchestration drill-down identity for duplicate display names', () => {
    const orch: CrossSkillOrchestrationEvaluation = {
      status: 'complete',
      summary: 'overlap found',
      referenceIds: [],
      findings: [{
        id: 'XSK-01:duplicate',
        ruleId: 'XSK-01',
        type: 'overlap',
        severity: 'medium',
        title: 'Overlapping triggers',
        skills: ['Duplicate', 'Other'],
        evidence: 'The routes overlap.',
        rationale: 'Routing ambiguity.',
        recommendation: 'Disambiguate.',
        fixSteps: [],
        referenceIds: [],
        confidence: 'high',
      }],
    };
    const view = buildSkillsGroupedView(
      payload([], orch),
      [
        skillView('Duplicate', 'skill-a'),
        skillView('Duplicate', 'skill-b'),
        skillView('Other', 'skill-c'),
      ],
    );

    expect(view.orchestration[0].pairs[0]).toMatchObject({
      a: 'Duplicate',
      b: 'Other',
      aSkillId: undefined,
      bSkillId: 'skill-c',
    });
  });
});
