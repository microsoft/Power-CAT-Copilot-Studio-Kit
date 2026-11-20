/**
 * The guard that makes a silent pillar drop impossible.
 *
 * A Standard pattern's `Category` is `configuration` / `routing` / `instructions`, and none of
 * those is a key in `FAMILY_TO_PILLAR`. The legacy family fallback therefore cannot place a single
 * Standard pattern row, so the registry is the only thing that can — and an id the registry does
 * not hold is dropped from its denominator without an error anywhere. These tests assert that every
 * id the adapter can emit is registered, so a corpus change that adds an unregistered rule fails
 * here instead of quietly lowering a pillar's denominator in production.
 */

import { describe, expect, it } from 'vitest';
import { COMPLIANCE_CRITERIA } from '../../contracts/Constants';
import type { InstructionEvaluation, Pattern, PatternEvaluation } from '../../contracts/StageOutputs';
import { ruleById, rulesFor } from '../../review-core';
import {
  STANDARD_LEGACY_RULE_IDS,
  resolveStandardRuleId,
  standardInstructionRuleResults,
  standardPatternRuleResults,
  standardRuleResults,
} from './standardRuleResults';
import {
  STANDARD_PATTERN_WORKFLOW_RULES,
  workflowPatternId,
} from '../../utils/standardReviewWorkflowRules';

function pattern(overrides: Partial<Pattern> & Pick<Pattern, 'PatternId'>): Pattern {
  return {
    PatternName: 'A pattern',
    Recommendation: 'Do the thing',
    Status: true,
    Topics: [],
    ...overrides,
  };
}

function patterns(...rows: Pattern[]): PatternEvaluation {
  return { Patterns: rows } as PatternEvaluation;
}

const HIGH = COMPLIANCE_CRITERIA.find(c => c.inherentSeverity === 'High')!;
const NOT_HIGH = COMPLIANCE_CRITERIA.find(c => c.inherentSeverity !== 'High')!;

describe('standard rule results — registry coverage', () => {
  it('registers every pattern id the ART corpus can emit', () => {
    const unregistered = STANDARD_PATTERN_WORKFLOW_RULES
      .map(template => resolveStandardRuleId(template.ruleId))
      .filter(id => ruleById(id) === undefined);

    expect(unregistered).toEqual([]);
  });

  /**
   * The adapter is fed `pattern.PatternId`, never `template.ruleId`. `projectPatterns` names a
   * Pattern after its group (`workflowPatternId`) and discards the rule id the AI returned, so the
   * corpus-vintage assertion above cannot see the ids live reviews actually carry. An unresolved id
   * does not throw — it scores in no pillar at all — so this is the only guard that can catch it.
   */
  it('registers every pattern id the workflow projection can emit', () => {
    const unregistered = STANDARD_PATTERN_WORKFLOW_RULES
      .map(template => resolveStandardRuleId(workflowPatternId(template.patternName)))
      .filter(id => ruleById(id) === undefined);

    expect(unregistered).toEqual([]);
  });

  it('resolves a projected pattern id onto the same rule as its corpus id', () => {
    for (const template of STANDARD_PATTERN_WORKFLOW_RULES) {
      expect(resolveStandardRuleId(workflowPatternId(template.patternName)))
        .toBe(resolveStandardRuleId(template.ruleId));
    }
  });

  it('registers every instruction criterion', () => {
    const unregistered = COMPLIANCE_CRITERIA
      .map(criterion => criterion.id)
      .filter(id => ruleById(id) === undefined);

    expect(unregistered).toEqual([]);
  });

  it('declares every emitted id on the standard harness', () => {
    const standardIds = new Set(rulesFor('standard').map(rule => rule.id));
    const emitted = [
      ...STANDARD_PATTERN_WORKFLOW_RULES.map(t => resolveStandardRuleId(t.ruleId)),
      ...STANDARD_PATTERN_WORKFLOW_RULES.map(t =>
        resolveStandardRuleId(workflowPatternId(t.patternName))),
      ...COMPLIANCE_CRITERIA.map(c => c.id),
    ];

    expect(emitted.filter(id => !standardIds.has(id))).toEqual([]);
  });
});

describe('standard rule results — legacy pattern ids', () => {
  it('resolves the pre-split tool-routing id onto the tools half', () => {
    expect(resolveStandardRuleId('STD-PATTERN-TOOL-ROUTING-GAP')).toBe('STD-TOL-ROUTING-DESCRIPTION');
  });

  it('leaves a current-vintage id alone', () => {
    expect(resolveStandardRuleId('STD-ROUTE-TOPIC-OVERLAP')).toBe('STD-ROUTE-TOPIC-OVERLAP');
  });

  it('emits one row per verdict, never one per split half', () => {
    const rows = standardPatternRuleResults(
      patterns(pattern({ PatternId: 'STD-PATTERN-TOOL-ROUTING-GAP', Status: false, Severity: 'High' }))
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].ruleId).toBe('STD-TOL-ROUTING-DESCRIPTION');
  });

  it('maps every legacy id onto a registered rule', () => {
    for (const target of Object.values(STANDARD_LEGACY_RULE_IDS)) {
      expect(ruleById(target)).toBeDefined();
    }
  });
});

describe('standard rule results — pattern status', () => {
  it('prefers AssessmentStatus over the Status boolean', () => {
    const rows = standardPatternRuleResults(
      patterns(
        pattern({ PatternId: 'a', AssessmentStatus: 'pass', Status: false }),
        pattern({ PatternId: 'b', AssessmentStatus: 'not-applicable', Status: false }),
        pattern({ PatternId: 'c', AssessmentStatus: 'not-assessed', Status: false }),
      )
    );

    expect(rows.map(r => r.status)).toEqual(['passed', 'not-applicable', 'failed']);
  });

  it('grades a failure by the severity the corpus assigned', () => {
    const rows = standardPatternRuleResults(
      patterns(
        pattern({ PatternId: 'a', AssessmentStatus: 'fail', Severity: 'High' }),
        pattern({ PatternId: 'b', AssessmentStatus: 'fail', Severity: 'Medium' }),
        pattern({ PatternId: 'c', AssessmentStatus: 'fail', Severity: 'Low' }),
      )
    );

    expect(rows.map(r => r.status)).toEqual(['error', 'warning', 'warning']);
  });

  it('falls back to the boolean only when no assessment was recorded', () => {
    const rows = standardPatternRuleResults(
      patterns(
        pattern({ PatternId: 'a', Status: true }),
        pattern({ PatternId: 'b', Status: false, Severity: 'High' }),
      )
    );

    expect(rows.map(r => r.status)).toEqual(['passed', 'error']);
  });

  it('reads an unjudged pattern as unrun rather than failing', () => {
    const [row] = standardPatternRuleResults(
      patterns(pattern({ PatternId: 'a', AssessmentStatus: 'not-assessed', Status: false, Severity: 'High' }))
    );

    expect(row.status).toBe('failed');
  });

  it('returns nothing for a missing or malformed evaluation', () => {
    expect(standardPatternRuleResults(undefined)).toEqual([]);
    expect(standardPatternRuleResults({} as PatternEvaluation)).toEqual([]);
  });
});

describe('standard rule results — instruction criteria', () => {
  it('grades all fifteen criteria even when stage C returned nothing', () => {
    const rows = standardInstructionRuleResults(undefined);

    expect(rows).toHaveLength(COMPLIANCE_CRITERIA.length);
    expect(rows.every(r => r.status === 'failed')).toBe(true);
  });

  it('does not read an empty issues array as fifteen passes', () => {
    const rows = standardInstructionRuleResults({ compliancePercentage: 0, issues: [] });

    expect(rows.every(r => r.status === 'failed')).toBe(true);
  });

  it('grades an explicit assessment by the criterion inherent severity', () => {
    const evaluation: InstructionEvaluation = {
      compliancePercentage: 0,
      issues: [],
      criterionAssessments: [
        { criteriaId: HIGH.id, status: 'fail' },
        { criteriaId: NOT_HIGH.id, status: 'fail' },
      ],
    };
    const byId = new Map(standardInstructionRuleResults(evaluation).map(r => [r.ruleId, r.status]));

    expect(byId.get(HIGH.id)).toBe('error');
    expect(byId.get(NOT_HIGH.id)).toBe('warning');
  });

  it('carries pass and not-applicable through unchanged', () => {
    const evaluation: InstructionEvaluation = {
      compliancePercentage: 0,
      issues: [],
      criterionAssessments: [
        { criteriaId: HIGH.id, status: 'pass' },
        { criteriaId: NOT_HIGH.id, status: 'not-applicable' },
      ],
    };
    const byId = new Map(standardInstructionRuleResults(evaluation).map(r => [r.ruleId, r.status]));

    expect(byId.get(HIGH.id)).toBe('passed');
    expect(byId.get(NOT_HIGH.id)).toBe('not-applicable');
  });

  it('stamps the criterion id, so the registry resolves the pillar', () => {
    const ids = standardInstructionRuleResults(undefined).map(r => r.ruleId);

    expect(ids).toEqual(COMPLIANCE_CRITERIA.map(c => c.id));
  });
});

describe('standard rule results — the whole review', () => {
  it('concatenates both stages into one denominator', () => {
    const rows = standardRuleResults(
      patterns(pattern({ PatternId: 'STD-ROUTE-TOPIC-OVERLAP', AssessmentStatus: 'pass' })),
      undefined
    );

    expect(rows).toHaveLength(1 + COMPLIANCE_CRITERIA.length);
  });

  it('keys every row by its rule id, matching the dismissal convention', () => {
    const rows = standardRuleResults(
      patterns(pattern({ PatternId: 'STD-ROUTE-TOPIC-OVERLAP', AssessmentStatus: 'pass' })),
      undefined
    );

    expect(rows.every(r => r.key === r.ruleId)).toBe(true);
  });
});
