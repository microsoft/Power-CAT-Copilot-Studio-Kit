import type { ReviewStageStatus } from '../../contracts/ReviewResult';
import type { AeSkill, AgentsExperienceModel } from '../contracts/AgentsExperienceModel';
import type { RetrievalIssue, SkillBundle } from '../contracts/SkillBundle';
import type { CopilotRuleContext } from '../contracts/UnifiedReview';
import { crossSkillRules } from '../../review-core/rules/cross-skill.rules';
import { copilotPopulationAvailability } from './rules/copilotRuleDefinition';
import { splitSkillMarkdown } from './AgentsExperienceParser';
import { collectConfiguredCapabilities } from './jobs/reviewCorpusBuilder';
import { buildBundleSourceCorpus } from './skill/deepReviewHelpers';

type CrossSkillScope =
  | { state: 'applicable' }
  | { state: 'not-applicable' | 'unavailable'; reason: ReviewStageStatus['reason'] };

function matchesSkill(bundle: SkillBundle, skill: AeSkill): boolean {
  if (skill.componentIdUnique && bundle.skillComponentUniqueId) {
    return skill.componentIdUnique.toLowerCase() === bundle.skillComponentUniqueId.toLowerCase();
  }
  if (skill.componentId && bundle.skillComponentId) {
    return skill.componentId.toLowerCase() === bundle.skillComponentId.toLowerCase();
  }
  return Boolean(skill.schemaname && bundle.skillSchemaName === skill.schemaname);
}

/** Resolve archive content checks against captured SKILL.md text without changing the stored source model. */
export function modelWithCapturedSkillText(
  model: AgentsExperienceModel,
  bundles: readonly SkillBundle[],
): AgentsExperienceModel {
  let changed = false;
  const skills = model.skills.map(skill => {
    if (skill.source !== 'zip-bundle') return skill;
    const matches = bundles.filter(bundle => matchesSkill(bundle, skill));
    const bundle = matches.length === 1 ? matches[0] : undefined;
    if (!bundle?.skillMarkdown.trim()
      || bundle.retrievalIssues.some(issue => issue.severity !== 'info')) return skill;
    const frontmatter = splitSkillMarkdown(bundle.skillMarkdown);
    changed = true;
    return {
      ...skill,
      markdown: bundle.skillMarkdown,
      frontmatterName: frontmatter.name,
      frontmatterDescription: frontmatter.description,
      body: frontmatter.body,
      source: 'inline-markdown' as const,
    };
  });
  return changed ? { ...model, skills } : model;
}

/** Ground cross-skill findings in the captured text supplied with the agent's skill set. */
export function buildCrossSkillSourceCorpus(
  model: AgentsExperienceModel,
  bundles: readonly SkillBundle[],
): string {
  return [
    model.agentSettings.instructions,
    ...collectConfiguredCapabilities(model),
    ...bundles.flatMap(bundle => [
      buildBundleSourceCorpus(bundle),
      bundle.agentInstructions,
      bundle.parentDescription ?? '',
      ...bundle.siblingDescriptions.flatMap(sibling => [sibling.name, sibling.description ?? '']),
    ]),
  ].join('\n\n');
}

/** Establish set-level applicability from the captured subject and catalog, never model prose or portion counts. */
export function getCrossSkillScope(
  model: AgentsExperienceModel,
  bundles: readonly SkillBundle[] | undefined,
  retrievalIssues: readonly RetrievalIssue[],
  availability?: CopilotRuleContext['availability'],
): CrossSkillScope {
  const unavailable: CrossSkillScope = { state: 'unavailable', reason: 'incomplete-population' };
  if (copilotPopulationAvailability({ harness: 'copilot', model, availability }, 'skills') !== 'complete'
    || retrievalIssues.some(issue => issue.severity !== 'info')) return unavailable;

  const skillsById = new Map<string, AeSkill>();
  for (const skill of model.skills) {
    const id = skill.componentIdUnique?.trim() || skill.componentId?.trim() || skill.schemaname?.trim();
    if (!id) return unavailable;
    skillsById.set(id.toLowerCase(), skill);
  }
  const skills = [...skillsById.values()];
  if (bundles && (
    skills.some(skill => !bundles.some(bundle => matchesSkill(bundle, skill)))
    || bundles.some(bundle => !skills.some(skill => matchesSkill(bundle, skill)))
    || bundles.some(bundle => bundle.retrievalIssues.some(issue => issue.severity !== 'info')
      || (bundle.source === 'zip-bundle' && !bundle.skillMarkdown.trim()))
  )) return unavailable;

  const subject = { ...model, skills };
  if (crossSkillRules.every(rule => rule.appliesWhen && !rule.appliesWhen(subject).applies)) {
    return { state: 'not-applicable', reason: 'insufficient-skills' };
  }
  if (!bundles?.length || bundles.some(bundle => !bundle.skillMarkdown.trim()
    || bundle.resources.some(resource => resource.decodeStatus === 'failed'
      || ['failed', 'cancelled', 'oversized', 'partial'].includes(resource.analysisStatus)))) {
    return unavailable;
  }
  return { state: 'applicable' };
}
