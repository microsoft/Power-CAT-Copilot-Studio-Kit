import type { CopilotReviewDisplayPayload, PersistedSkillBundleReview } from '../../contracts/ReviewResult';
import type { AeSkill } from '../contracts/AgentsExperienceModel';
import type {
  CopilotAiNarrative, CopilotContextualGuidance, GroundedFinding, GroundedSkillFinding,
} from '../contracts/Findings';
import type { CrossSkillOrchestrationFinding } from '../contracts/SkillEvaluation';
import {
  guidanceContextLimit, instructionGuidance, skillAuthoringGuidance,
} from './copilotGuidanceDrafts';
import { redactSecrets } from './skill/resourceScanners';
import { SKILL_AUTHORING_RULE_IDS } from '../../review-core/rules/skill-authoring.rules';
import { skillAiRules } from '../../review-core/rules/skill-ai.rules';
import { INSTRUCTION_RULE_IDS } from './skill/InstructionCoverageValidator';
import { readCopilotAiNarrative, readInstructionFindingNarrative } from './copilotAiNarrative';

type Finding = GroundedFinding | GroundedSkillFinding;
export type CopilotGuidanceContext = Pick<CopilotReviewDisplayPayload, 'model' | 'skillBundleReviews'>;
type BundleReview = NonNullable<CopilotGuidanceContext['skillBundleReviews']>[number];

const AUTHORING_RULES = new Set<string>([
  ...SKILL_AUTHORING_RULE_IDS.filter(id => id !== 'SKL-05'),
  ...skillAiRules.filter(rule => rule.id.startsWith('SKL-AI-') && rule.id !== 'SKL-AI-RESOURCE-ALIGNMENT')
    .map(rule => rule.id),
  'SKL-09', 'SKL-15',
]);
const INSTRUCTION_RULES = new Set<string>(['INS-01', 'INS-07', 'INS-09', ...Object.values(INSTRUCTION_RULE_IDS)]);
const narrativeFields = ['findingTitle', 'whyItMatters', 'makerAction', 'suggestedText', 'acceptanceCheck'] as const;

function ruleId(finding: Finding): string {
  return ('ruleId' in finding ? finding.ruleId : finding.id).split(':')[0];
}

function identity(value: string | undefined): string {
  return typeof value === 'string' ? value.trim().replace(/^\{|\}$/g, '').toLowerCase() : '';
}

function matchesFinding(candidate: Finding, finding: Finding): boolean {
  return ruleId(candidate) === ruleId(finding)
    && candidate.title === finding.title && !!candidate.fact && candidate.fact === finding.fact;
}

function reviewFindings(review: BundleReview): Finding[] {
  return 'findings' in review ? review.findings : [
    ...review.deterministicFindings, ...(review.standardEvaluation?.findings ?? []),
    ...(review.deepEvaluation?.findings ?? []),
  ];
}

function reviewIdentity(review: BundleReview, context: CopilotGuidanceContext): string {
  if ('skillComponentUniqueId' in review) return identity(review.skillComponentUniqueId);
  const skills = context.model.skills.filter(skill => skill.schemaname === review.skillSchemaName);
  return skills.length === 1 ? identity(skills[0].componentIdUnique) : '';
}

function skillIdentity(
  finding: Finding,
  context: CopilotGuidanceContext,
  containingSkillId?: string,
): string | undefined {
  if (finding.componentIdUnique && containingSkillId
    && identity(finding.componentIdUnique) !== identity(containingSkillId)) return undefined;
  if (finding.componentIdUnique || containingSkillId) return finding.componentIdUnique || containingSkillId;
  const candidates = new Set<string>();
  for (const review of context.skillBundleReviews ?? []) {
    const matches = reviewFindings(review).filter(candidate => matchesFinding(candidate, finding));
    if (!matches.length) continue;
    const subject = reviewIdentity(review, context);
    if (!subject || matches.some(candidate => candidate.componentIdUnique
      && identity(candidate.componentIdUnique) !== subject)) continue;
    candidates.add(subject);
  }
  return candidates.size === 1 ? [...candidates][0] : undefined;
}

function savedSkillNarrative(
  finding: Finding,
  context: CopilotGuidanceContext,
  containingSkillId?: string,
): Finding | undefined {
  const target = identity(skillIdentity(finding, context, containingSkillId));
  if (!target) return undefined;
  const candidates = new Map<string, Finding>();
  for (const review of context.skillBundleReviews ?? []) {
    if (reviewIdentity(review, context) !== target) continue;
    for (const candidate of reviewFindings(review)) {
      if (!matchesFinding(candidate, finding)) continue;
      const ids = [candidate.componentIdUnique, candidate.remediation?.componentIdUnique].map(identity).filter(Boolean);
      if (ids.some(id => id !== target)) continue;
      if (candidate.remediation || narrativeFields.some(field => typeof candidate[field] === 'string')) {
        candidates.set(JSON.stringify([candidate.remediation, ...narrativeFields.map(field => candidate[field])]), candidate);
      }
    }
  }
  return candidates.size === 1 ? [...candidates.values()][0] : undefined;
}

function capturedSkill(skill: AeSkill, context: CopilotGuidanceContext): AeSkill {
  if (skill.source !== 'zip-bundle') return skill;
  const reviews = (context.skillBundleReviews ?? []).filter(
    (review): review is PersistedSkillBundleReview => 'skillComponentUniqueId' in review
      && identity(review.skillComponentUniqueId) === identity(skill.componentIdUnique),
  );
  const source = reviews.length === 1 ? reviews[0].skillDefinitionSource : undefined;
  return source ? { ...skill, markdown: source, body: '' } : skill;
}

/** Redact advice at every display/save/export boundary without truncating its safety conditions. */
export function redactCopilotGuidance(guidance: CopilotContextualGuidance): CopilotContextualGuidance {
  return {
    ...guidance,
    findingTitle: redactSecrets(guidance.findingTitle),
    whyItMatters: redactSecrets(guidance.whyItMatters),
    makerAction: redactSecrets(guidance.makerAction),
    acceptanceCheck: redactSecrets(guidance.acceptanceCheck),
    ...(guidance.suggestedText === undefined ? {} : { suggestedText: redactSecrets(guidance.suggestedText) }),
  };
}

/** Describe guidance provenance independently of the original finding's detection source. */
export function copilotGuidanceSourceLabel(source: CopilotContextualGuidance['source']): string {
  if (source === 'snapshot') return 'Guidance built from the agent data and findings in this review.';
  if (source === 'saved-and-snapshot') return 'Guidance saved with this review, with additions built from the agent data and findings.';
  return 'Guidance saved with this review.';
}

function aiGuidance(
  narrative: CopilotAiNarrative,
  fallback: Pick<GroundedFinding, 'title' | 'why' | 'fix'>,
): CopilotContextualGuidance {
  return redactCopilotGuidance({
    source: 'saved',
    findingTitle: narrative.findingTitle ?? fallback.title,
    whyItMatters: narrative.whyItMatters ?? fallback.why,
    makerAction: narrative.makerAction ?? fallback.fix,
    acceptanceCheck: narrative.acceptanceCheck ?? '',
    ...(narrative.suggestedText === undefined ? {} : { suggestedText: narrative.suggestedText }),
  });
}

/** Show the original set-level AI advice without adding a snapshot-generated draft. */
export function getCopilotOrchestrationGuidance(
  finding: CrossSkillOrchestrationFinding,
): CopilotContextualGuidance | undefined {
  const narrative = readCopilotAiNarrative(finding);
  return narrative ? aiGuidance(narrative, {
    title: finding.title, why: finding.rationale, fix: finding.recommendation,
  }) : undefined;
}

/**
 * Resolve optional advice from the selected capture only. This pure projection does
 * not grade findings, call an evaluator, consult live components, or write a review.
 */
export function getCopilotFindingGuidance(
  finding: Finding,
  context?: CopilotGuidanceContext,
  containingSkillId?: string,
): CopilotContextualGuidance | undefined {
  const targets = [finding.componentIdUnique, finding.remediation?.componentIdUnique, containingSkillId]
    .map(identity).filter(Boolean);
  if (new Set(targets).size > 1) {
    return redactCopilotGuidance(guidanceContextLimit(finding,
      'The saved guidance and finding have conflicting component identity. Confirm the target before using any component-specific draft.'));
  }
  const coverageAdvice = readInstructionFindingNarrative(finding);
  if (coverageAdvice.narrative) return aiGuidance(coverageAdvice.narrative, finding);
  if (finding.remediation && !coverageAdvice.provided) return redactCopilotGuidance(finding.remediation);
  const inherited = context && finding.family === 'Skills'
    ? savedSkillNarrative(finding, context, containingSkillId) : undefined;
  const savedGuidance = inherited?.remediation;
  if (savedGuidance) return redactCopilotGuidance(savedGuidance);
  const narrative = {
    findingTitle: finding.findingTitle ?? inherited?.findingTitle,
    whyItMatters: finding.whyItMatters ?? inherited?.whyItMatters,
    makerAction: finding.makerAction ?? inherited?.makerAction,
    suggestedText: finding.suggestedText ?? inherited?.suggestedText,
    acceptanceCheck: finding.acceptanceCheck ?? inherited?.acceptanceCheck,
  };
  const hasSaved = !coverageAdvice.provided && narrativeFields.some(field => typeof narrative[field] === 'string');
  let generated: CopilotContextualGuidance | undefined;
  const id = ruleId(finding);
  if (context && finding.family === 'Instructions' && INSTRUCTION_RULES.has(id)
    && (id !== 'INS-02' || finding.ai === true)) {
    generated = instructionGuidance(finding, id, {
      ...context.model, skills: context.model.skills.map(skill => capturedSkill(skill, context)),
    });
  } else if (context && finding.family === 'Skills' && AUTHORING_RULES.has(id)) {
    const target = skillIdentity(finding, context, containingSkillId);
    const skills = target
      ? context.model.skills.filter(skill => identity(skill.componentIdUnique) === identity(target))
      : [];
    generated = skills.length === 1
      ? skillAuthoringGuidance(finding, id, capturedSkill(skills[0], context), context.model)
      : guidanceContextLimit(finding,
        'The saved finding does not identify one captured skill with a consistent component identity. No component-specific draft can be prepared safely.');
  }
  if (!hasSaved) return generated ? redactCopilotGuidance(generated) : undefined;
  const fromSaved = narrativeFields.every(field => typeof narrative[field] === 'string');
  return redactCopilotGuidance({
    findingTitle: narrative.findingTitle ?? generated?.findingTitle ?? finding.title,
    whyItMatters: narrative.whyItMatters ?? generated?.whyItMatters ?? '',
    makerAction: narrative.makerAction ?? generated?.makerAction ?? '',
    acceptanceCheck: narrative.acceptanceCheck ?? generated?.acceptanceCheck ?? '',
    ...(generated?.suggestedText === undefined ? {} : { suggestedText: generated.suggestedText }),
    ...(narrative.suggestedText === undefined ? {} : { suggestedText: narrative.suggestedText }),
    ...(generated?.componentIdUnique ? { componentIdUnique: generated.componentIdUnique } : {}),
    source: generated && !fromSaved ? 'saved-and-snapshot' : 'saved',
  });
}

/** Add optional advice for a future saved review without changing the source finding. */
export function withCopilotFindingGuidance<T extends Finding>(
  finding: T,
  context: CopilotGuidanceContext,
  containingSkillId?: string,
): T {
  const remediation = getCopilotFindingGuidance(finding, context, containingSkillId);
  return remediation ? { ...finding, remediation } : finding;
}
