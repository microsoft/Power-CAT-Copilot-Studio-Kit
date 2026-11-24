import { describe, expect, it } from 'vitest';

import { getRule, RULE_REGISTRY } from '../services/skill/skillRuleRegistry';
import { skillAiRules } from '../../review-core/rules/skill-ai.rules';
import { toStandardEvaluation } from '../services/ai-providers/WorkflowReviewAiProviderCore';
import { calculateSkillBundleScores } from '../services/skill/skillBundleScoring';
import type { SkillBundleScoringInput } from '../services/skill/skillBundleScoring';
import type { AgentComponentResult } from '../contracts/ReviewJob';

/**
 * The `SKL-AI-*` rules were registered in `review-core` but not in the legacy
 * registry the AI stage validates against, so every per-skill AI finding was
 * dropped on the way to the UI with no log and no error. These tests pin the
 * projection that closed that gap, and the narrative overlay that keeps the
 * model's grounded wording instead of flattening it to the static rule title.
 */
describe('SKL-AI rule projection into the legacy registry', () => {
  const aiIds = skillAiRules
    .map((r) => r.id)
    .filter((id) => id.startsWith('SKL-AI-'));

  it('registers every SKL-AI rule so getRule can resolve it', () => {
    expect(aiIds.length).toBeGreaterThan(0);
    for (const id of aiIds) {
      expect(getRule(id), `${id} must be registered`).toBeDefined();
    }
  });

  it('derives maker-facing text from the rule rather than restating it', () => {
    for (const id of aiIds) {
      const source = skillAiRules.find((r) => r.id === id)!;
      const projected = getRule(id)!;
      expect(projected.why).toBe(source.prose.why);
      expect(projected.recommendation).toBe(source.prose.fix);
      expect(projected.title).toBe(source.prose.failTitle ?? source.title);
    }
  });

  it('cites at least one resolvable reference for every registered rule', () => {
    for (const [id, rule] of Object.entries(RULE_REGISTRY)) {
      expect(rule.referenceIds.length, `${id} must cite a source`).toBeGreaterThan(0);
    }
  });

  it('does not overwrite the hand-authored SKL-10 definition', () => {
    expect(getRule('SKL-10')!.fixSteps).toHaveLength(3);
    expect(getRule('SKL-10')!.dimension).toBe('quality');
  });
});

describe('v4 narrative survives the evaluation mapping', () => {
  const result = {
    skillName: 'pdf',
    status: 'complete',
    dimensions: [],
    findings: [
      {
        ruleId: 'SKL-AI-SCOPE',
        severity: 'medium',
        evidence: '"Also converts images, writes email drafts and books travel."',
        resourcePath: 'SKILL.md',
        findingTitle: 'pdf bundles three unrelated jobs under one skill',
        whyItMatters:
          'A skill that spans unrelated jobs is selected for requests it cannot complete.',
        makerAction: 'Split the image and travel steps into their own skills.',
        acceptanceCheck: 'Ask for a travel booking and confirm pdf is not selected.',
      },
    ],
  } as unknown as AgentComponentResult;

  it('keeps a finding whose rule only the new registry knew about', () => {
    const evaluation = toStandardEvaluation(result);
    expect(evaluation.findings.map((f) => f.ruleId)).toContain('SKL-AI-SCOPE');
  });

  it('lets the AI title win over the static rule title', () => {
    const finding = toStandardEvaluation(result).findings.find(
      (f) => f.ruleId === 'SKL-AI-SCOPE',
    )!;
    expect(finding.title).toBe('pdf bundles three unrelated jobs under one skill');
    expect(finding.findingTitle).toBe(
      'pdf bundles three unrelated jobs under one skill',
    );
  });

  it('carries why, action and acceptance check through to the UI shape', () => {
    const finding = toStandardEvaluation(result).findings.find(
      (f) => f.ruleId === 'SKL-AI-SCOPE',
    )!;
    expect(finding.why).toContain('selected for requests it cannot complete');
    expect(finding.recommendation).toBe(
      'Split the image and travel steps into their own skills.',
    );
    expect(finding.acceptanceCheck).toContain('confirm pdf is not selected');
    expect(finding.fact).toBeTruthy();
  });

  it('leaves a deterministic finding on the registry wording', () => {
    const deterministic = {
      skillName: 'pdf',
      status: 'complete',
      dimensions: [],
      findings: [
        {
          ruleId: 'SKL-10',
          severity: 'medium',
          evidence: '"Always close with the exact phrase."',
          resourcePath: 'SKILL.md',
        },
      ],
    } as unknown as AgentComponentResult;
    const finding = toStandardEvaluation(deterministic).findings.find(
      (f) => f.ruleId === 'SKL-10',
    )!;
    expect(finding.title).toBe(getRule('SKL-10')!.title);
    expect(finding.findingTitle).toBeUndefined();
  });
});

/**
 * Restoring the dropped findings moves a live score, and that is the intended
 * correction rather than a side-effect: the findings were always real, they
 * were just discarded before anything could count them.
 *
 * It is pinned here because the move is invisible at the seam that caused it.
 * `projectSkillBundleReview` feeds `standardEvaluation.findings` into
 * `calculateSafety` with no filter on dimension, and a finding that carries no
 * `safetyDisposition` is treated as blocking — so a *scope* finding deducts
 * from the *safety* score. Anyone surprised by a skill dropping from 100 should
 * land on this test rather than on a bug report.
 */
describe('restored AI findings deduct from the skill safety score', () => {
  const baseInput = (
    findings: SkillBundleScoringInput['findings'],
  ): SkillBundleScoringInput => ({
    dimensions: [],
    integrity: {
      pathTraversalCount: 0,
      duplicatePathCount: 0,
      missingReferencedCount: 0,
      unreadableReferencedCount: 0,
      unreferencedTextCount: 0,
      lacksProgressiveDisclosure: false,
      emptyResourceCount: 0,
    },
    resourcesTotal: 1,
    resourcesReviewed: 1,
    findings,
    readinessIssues: [],
  });

  it('scored 100 while the findings were being dropped', () => {
    const scores = calculateSkillBundleScores(baseInput([]));
    expect(scores.safety.value).toBe(100);
    expect(scores.safetyGate).toBe('none');
  });

  it('deducts 10 for a medium finding such as SKL-AI-SCOPE', () => {
    const scores = calculateSkillBundleScores(
      baseInput([{ severity: 'medium', evidence: 'unrelated jobs', resourcePath: 'SKILL.md' }]),
    );
    expect(scores.safety.value).toBe(90);
    expect(scores.safetyGate).toBe('none');
  });

  it('deducts 25 and raises the safety gate for a high finding such as SKL-AI-ACTIONABILITY', () => {
    // The gate flip is the part with user-visible consequence beyond the
    // number: a skill that showed no safety banner now shows a warning.
    const scores = calculateSkillBundleScores(
      baseInput([{ severity: 'high', evidence: 'no executable steps', resourcePath: 'SKILL.md' }]),
    );
    expect(scores.safety.value).toBe(75);
    expect(scores.safetyGate).toBe('warning');
  });
});
