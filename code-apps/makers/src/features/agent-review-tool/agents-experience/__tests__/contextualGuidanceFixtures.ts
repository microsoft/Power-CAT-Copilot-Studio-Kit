import type { AeSkill } from '../contracts/AgentsExperienceModel';
import type { GroundedFinding, GroundedSkillFinding } from '../contracts/Findings';
import { bundle, copilotPayloadWithRawResourceContent } from './skillTestFixtures';

/** Synthetic capture with no tools, private data source, or configured tests. */
export function contextualGuidanceFixture() {
  const input = copilotPayloadWithRawResourceContent();
  const skill: AeSkill = {
    name: 'member-status',
    frontmatterName: 'member-status',
    frontmatterDescription: 'Use when a member asks about their reward tier or points.',
    componentId: 'member-component',
    componentIdUnique: 'member-unique',
    schemaname: 'example.skill.member-status',
    source: 'inline-markdown',
    resourceCount: 0,
    markdown: '---\nname: member-status\ndescription: Use when a member asks about their reward tier or points.\n---\nCheck member status.',
    body: 'Check member status.',
  };
  const instruction: GroundedFinding = {
    id: 'INS-01', family: 'Instructions', severity: 'warning', ai: false,
    title: 'Instructions are missing or trivial',
    fact: 'Instructions contain 21 characters.',
    why: 'The agent has no clear operating boundaries.',
    fix: 'Define the role, scope, and safe fallback behavior.',
    referenceId: 'ms-authoring-instructions',
  };
  const authoring: GroundedSkillFinding = {
    id: 'SKL-03', ruleId: 'SKL-03', family: 'Skills', severity: 'medium', ai: false,
    componentIdUnique: skill.componentIdUnique,
    title: 'Skill needs an executable procedure',
    fact: 'The body has no concrete procedure.', evidence: 'The body has no concrete procedure.',
    why: 'A short task label does not define a safe procedure.',
    fix: 'Add inputs, steps, output, and failure handling.',
    recommendation: 'Add inputs, steps, output, and failure handling.',
    referenceId: 'ms-skills-create', referenceIds: ['ms-skills-create'],
    fixSteps: [], confidence: 'high',
  };
  input.payload.model.agentSettings = {
    instructions: 'Help with membership.', enableWebSearch: true, raw: {},
  };
  input.payload.model.skills = [skill];
  input.payload.findings = [instruction, authoring];
  input.payload.score = { grounded: 56, passed: 18, evaluated: 24, warnings: 2, errors: 0 };
  input.payload.ruleResults = [
    { key: 'INS-01', ruleId: 'INS-01', family: 'Instructions', status: 'warning' },
    {
      key: 'SKL-03:example.skill.member-status', ruleId: 'SKL-03', family: 'Skills',
      status: 'warning', subjectId: skill.componentIdUnique, subject: skill.name,
    },
  ];
  input.bundles = [bundle({
    source: skill.source,
    skillComponentId: skill.componentId,
    skillComponentUniqueId: skill.componentIdUnique,
    skillSchemaName: skill.schemaname,
    skillName: skill.name,
    skillMarkdown: skill.markdown,
    resources: [],
  })];
  input.payload.skillBundleReviews = [{
    status: 'complete', mode: 'standard', blocked: false,
    skillName: skill.name, skillSchemaName: skill.schemaname,
    deterministicFindings: [authoring],
  }];
  return { input, skill, instruction, authoring };
}
