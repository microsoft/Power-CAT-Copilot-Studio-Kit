import type {
  CostOpportunity,
  PotentialImpact,
} from '../../contracts/CostEfficiency';
import type {
  CrossSkillOrchestrationFinding,
} from '../../contracts/SkillEvaluation';
import type { SkillFindingSeverity } from '../../contracts/Findings';

const EFFICIENCY_ISSUE_TYPES = new Set(['overlap', 'redundancy']);

const UNSUPPORTED_COST_LANGUAGE =
  /\b(?:costs?|spend(?:ing)?|savings?|billing|billed|payg|pay-as-you-go)\b|\b(?:save|reduce|lower|cut)\b.{0,40}\b(?:money|credits?|[$€£])\b|\b(?:copilot|agent|runtime)\s+credits?\b/i;

const CREDIT_AMOUNT =
  /\b\d[\d,.]*\s*(?:copilot\s+)?credits?\b/i;

const CURRENCY_RATE =
  /[$€£]\s*\d[\d,.]*(?:\.\d+)?\s*(?:per\s+(?:task|run|month)|monthly)\b/i;

function potentialImpact(severity: SkillFindingSeverity): PotentialImpact {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    case 'low':
    case 'info':
      return 'low';
  }
}

function containsUnsupportedCostClaim(
  finding: CrossSkillOrchestrationFinding,
): boolean {
  const reviewText = [
    finding.title,
    finding.evidence,
    finding.rationale,
    finding.recommendation,
  ].join(' ');

  return UNSUPPORTED_COST_LANGUAGE.test(reviewText)
    || CREDIT_AMOUNT.test(reviewText)
    || CURRENCY_RATE.test(reviewText);
}

function hasGroundedReviewContent(
  finding: CrossSkillOrchestrationFinding,
): boolean {
  return [
    finding.title,
    finding.evidence,
    finding.rationale,
    finding.recommendation,
  ].every(value => value.trim().length > 0);
}

/**
 * Maps grounded cross-skill AI findings into evidence-safe efficiency review leads.
 *
 * Only overlap and redundancy can support a possible efficiency lever. Findings
 * that make an unsupported cost or savings claim are withheld rather than shown
 * with a misleading disclaimer.
 */
export function buildAiEfficiencyOpportunities(
  findings: readonly CrossSkillOrchestrationFinding[],
): CostOpportunity[] {
  return findings.flatMap((finding, index) => {
    const affectedSkills = [
      ...new Set(finding.skills.map(skillName => skillName.trim()).filter(Boolean)),
    ];
    if (
      !EFFICIENCY_ISSUE_TYPES.has(finding.type)
      || affectedSkills.length < 2
      || !hasGroundedReviewContent(finding)
      || containsUnsupportedCostClaim(finding)
    ) {
      return [];
    }

    return [{
      id: `ai:${finding.id}:${index}`,
      title: finding.title,
      potentialImpact: potentialImpact(finding.severity),
      confidence: finding.confidence,
      evidenceLabel: 'ai-reviewed',
      affectedSkills,
      evidence: [finding.evidence, finding.rationale],
      recommendation: finding.recommendation,
      qualityRisk:
        'AI review can mistake deliberate specialization for duplication. Confirm whether each skill has a distinct routing or behavior requirement before you merge, remove, or narrow it.',
      validationPlan:
        'Change one skill boundary at a time. Run the same saved evaluation cases before and after, then compare result quality and observed skill calls. Restore the original design if quality drops.',
      relatedRuleIds: [finding.ruleId],
    }];
  });
}
