import { describe, expect, it } from 'vitest';
import type {
  CrossSkillOrchestrationFinding,
  OrchestrationIssueType,
} from '../contracts/SkillEvaluation';
import { buildAiEfficiencyOpportunities } from '../services/cost-efficiency/buildAiEfficiencyOpportunities';

function finding(
  type: OrchestrationIssueType,
  severity: CrossSkillOrchestrationFinding['severity'] = 'medium',
  id = type,
): CrossSkillOrchestrationFinding {
  return {
    id,
    ruleId: 'XSK-01',
    type,
    severity,
    title: `${type} across skills`,
    skills: ['Customer search', 'Account search'],
    evidence: 'Both skills accept the same customer lookup request.',
    rationale: 'The orchestrator can select either skill for the same task.',
    recommendation: 'Give each skill a distinct purpose and routing description.',
    fixSteps: [],
    referenceIds: ['ms-skills-overview'],
    confidence: 'medium',
  };
}

describe('buildAiEfficiencyOpportunities', () => {
  it('maps only overlap and redundancy findings', () => {
    const opportunities = buildAiEfficiencyOpportunities([
      finding('overlap'),
      finding('redundancy'),
      finding('contradiction'),
      finding('coverage-gap'),
      finding('coupling'),
      finding('consistency'),
    ]);

    expect(opportunities).toHaveLength(2);
    expect(opportunities.map(item => item.evidenceLabel)).toEqual([
      'ai-reviewed',
      'ai-reviewed',
    ]);
    expect(opportunities.map(item => item.title)).toEqual([
      'overlap across skills',
      'redundancy across skills',
    ]);
  });

  it.each([
    ['critical', 'high'],
    ['high', 'high'],
    ['medium', 'medium'],
    ['low', 'low'],
    ['info', 'low'],
  ] as const)('maps %s severity to %s potential impact', (severity, impact) => {
    const [opportunity] = buildAiEfficiencyOpportunities([
      finding('overlap', severity),
    ]);

    expect(opportunity.potentialImpact).toBe(impact);
  });

  it('keeps affected skills separate from grounded evidence', () => {
    const [opportunity] = buildAiEfficiencyOpportunities([
      finding('redundancy'),
    ]);

    expect(opportunity.affectedSkills).toEqual([
      'Customer search',
      'Account search',
    ]);
    expect(opportunity.evidence).toContain(
      'Both skills accept the same customer lookup request.',
    );
    expect(opportunity.evidence).toContain(
      'The orchestrator can select either skill for the same task.',
    );
    expect(opportunity.recommendation).toBe(
      'Give each skill a distinct purpose and routing description.',
    );
  });

  it('creates unique stable values when the evaluator repeats an id', () => {
    const opportunities = buildAiEfficiencyOpportunities([
      finding('overlap', 'medium', 'duplicate'),
      finding('redundancy', 'medium', 'duplicate'),
    ]);

    expect(new Set(opportunities.map(item => item.id)).size).toBe(2);
  });

  it.each([
    ['This change will save 20% of credits.', 'recommendation'],
    ['Cost savings of 20% are expected.', 'title'],
    ['The overlap uses 400 credits.', 'evidence'],
    ['The duplicate route costs $0.10 per task.', 'rationale'],
  ] as const)(
    'withholds an AI finding with unsupported cost text in %s',
    (unsafeText, field) => {
      const unsafe = {
        ...finding('overlap'),
        [field]: unsafeText,
      };

      expect(buildAiEfficiencyOpportunities([unsafe])).toEqual([]);
    },
  );

  it('withholds an ungrounded or non-cross-skill finding', () => {
    const oneSkill = {
      ...finding('overlap'),
      skills: ['Customer search'],
    };
    const noEvidence = {
      ...finding('redundancy'),
      evidence: '   ',
    };

    expect(buildAiEfficiencyOpportunities([oneSkill, noEvidence])).toEqual([]);
  });

  it('does not mistake a safe routing recommendation for a cost claim', () => {
    const safe = {
      ...finding('overlap'),
      recommendation: 'Reduce duplicate routing by giving each skill a distinct scope.',
    };

    expect(buildAiEfficiencyOpportunities([safe])).toHaveLength(1);
  });

  it('does not mistake a business amount in grounded evidence for agent cost', () => {
    const safe = {
      ...finding('overlap'),
      evidence: 'Both skills approve invoices over $500.',
    };

    expect(buildAiEfficiencyOpportunities([safe])).toHaveLength(1);
  });
});
