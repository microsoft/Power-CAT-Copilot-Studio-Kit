/**
 * The Skills pillar, as reviewed inside a Copilot agent.
 *
 * These are the skill rules that run against a captured *agent* model: the skills
 * are components of the agent being reviewed, so they score into that agent's
 * Skills pillar under the `copilot` harness. They are not the standalone-upload
 * rules in `RULE_REGISTRY`, which judge one uploaded artifact on the skill
 * rubric, and they are not the cross-skill `XSK-*` rules.
 *
 * SKL-08 names two components in one finding — the coupled skill and the sibling
 * it mentions — and each published evidence row points at the component it
 * quotes, so its `subjectRef` is a list rather than a single reference.
 */
import type { AgentsExperienceModel } from '../../agents-experience/contracts/AgentsExperienceModel';
import { norm } from '../../agents-experience/services/rules/ruleTypes';
import { configuredCapabilityNames, missingCapabilityReferences } from './capability-references';
import { failWith, notApplicable, pass, rule, type Rule, type RuleInstance } from '../rule';

/**
 * A capability-alignment rule, resolved by the two skill nodes rather than by code.
 *
 * Deciding whether a quoted phrase in a skill body names a real capability is a
 * reading task — it needs the captured inventory and the surrounding sentence,
 * not a regex. The note at the end of the rule records why the old detector was
 * deleted rather than kept as a pre-filter.
 */
export const SKL_09: Rule<AgentsExperienceModel> = rule<AgentsExperienceModel>({
  id: 'SKL-09',
  title: 'Detected inline skill capability references are configured',
  harnesses: ['copilot'],
  pillar: 'skills',
  subjectScope: 'agent',
  execution: 'ai',
  severity: 'high',
  tags: ['capability-alignment', 'quality'],
  references: ['ms-tools-skills'],
  prose: {
    question: 'Does every capability an inline skill names in quotes exist on the agent?',
    summary: 'Inspect quoted references only when an inline skill matches at least one configured capability.',
    why: 'Skill instructions should refer to configured capabilities; a static reference mismatch is not an observed runtime failure.',
    fix: 'Add the referenced capability or remove the unsupported reference from the skill.',
    passWhen: [
      'At least one quoted reference resolves to a configured capability, and no anchored skill also names one that is missing.',
    ],
    failWhen: [
      'An inline skill names a configured capability and, in the same body, names one the agent does not have.',
    ],
    notApplicableWhen: [
      'The agent has no configured tools, connected agents or knowledge sources to anchor a quoted reference against.',
      'No quoted reference in any inline skill resolves to a configured capability, so the detector has nothing to anchor on.',
    ],
  },
  evidence: {
    fieldPaths: ['skills.body'],
    populations: ['skills', 'tools', 'connectedAgents', 'knowledge'],
    completeForFailure: ['tools', 'connectedAgents', 'knowledge'],
  },
  // `execution: 'ai'` with no `check`, which is the registry's invariant for that
  // case. The detector this rule used to carry could only anchor on a quoted
  // reference that already resolved, so a skill whose referenced capabilities were
  // *all* missing reported `not-applicable` rather than failing — the exact case
  // the rule exists to catch. Resolving a named reference against the captured
  // inventory is a reading task, and the two skill nodes already own it.
});

/**
 * A static coupling detector over inline skill bodies.
 *
 * One skill naming another by its frontmatter name is the only cross-skill
 * dependency visible without running the agent, and the pair is what makes the
 * finding legible — so each failure points at both components, the body that
 * mentions and the frontmatter that was mentioned.
 */
export const SKL_08: Rule<AgentsExperienceModel> = rule<AgentsExperienceModel>({
  id: 'SKL-08',
  title: 'Inline skills are self-contained',
  harnesses: ['copilot'],
  pillar: 'skills',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'medium',
  tags: ['quality'],
  references: ['ms-skills-overview'],
  prose: {
    question: 'Does any inline skill body name another skill in the same agent?',
    summary: 'Compare inline skill bodies with captured sibling frontmatter names.',
    why: 'Self-contained skills reduce static cross-skill coupling and selection complexity.',
    fix: 'Make each skill self-contained or combine coupled responsibilities.',
    passWhen: ['No inline skill body mentions the frontmatter name of another captured skill.'],
    failWhen: ['An inline skill body mentions the frontmatter name of another captured skill.'],
    notApplicableWhen: ['No inline skills are captured in the agent configuration.'],
  },
  evidence: { fieldPaths: ['skills.body'], populations: ['skills'] },
  check(model) {
    const instances: RuleInstance[] = [];
    for (const skill of model.skills) {
      const body = norm(skill.body);
      const siblings = model.skills
        .filter(s => s !== skill && s.frontmatterName)
        .filter(s => body.includes(norm(s.frontmatterName!)));
      for (const sib of siblings) {
        instances.push({
          subjectId: skill.componentIdUnique,
          subject: skill.name,
          title: `Skill "${skill.frontmatterName ?? skill.name}" references sibling skill "${sib.frontmatterName}"`,
          detail: `body of "${skill.frontmatterName ?? skill.name}" mentions "${sib.frontmatterName}"`,
          why: 'Skills are meant to be self-contained; cross-skill coupling makes the orchestrator\'s selection and composition harder to reason about.',
          makerAction: 'Make each skill self-contained, or fold the coupled behavior into a single skill.',
          subjectRef: [
            {
              id: skill.componentIdUnique?.trim() || skill.componentId,
              schemaName: skill.schemaname,
              quote: sib.frontmatterName,
            },
            {
              id: sib.componentIdUnique?.trim() || sib.componentId,
              schemaName: sib.schemaname,
              quote: sib.frontmatterName,
              fieldPath: 'skills.frontmatterName',
            },
          ],
        });
      }
    }
    return instances.length > 0 ? failWith(instances) : pass();
  },
});

/**
 * The mechanical half of SKL-09, under its own id and without its anchor.
 *
 * SKL-09 is an AI rule because reading a skill body for *implied* capabilities
 * needs judgement. Resolving a name the author already wrote in an invocation
 * frame does not, so that half is declared here: it is free, and it is the only
 * capability check on skills that still answers when the AI workflow is down.
 *
 * The detector it shares with INS-09 lives in `capability-references.ts`. What
 * is deliberately *not* carried over is SKL-09's precondition that some other
 * reference in the same body resolved first — that anchor is why the retired
 * detector stayed silent on a skill whose references were all missing.
 *
 * `medium`, not `high`: SKL-09 judges the same bodies from the other side, and a
 * stop-list miss must not cost the Skills pillar twice.
 */
const SKL_15_FAIL_TITLE = 'Skill body references a capability the agent does not have';

const SKL_15_WHY =
  'A skill cannot act on an instruction to use a tool, connected agent or knowledge source the agent is not configured with.';

const SKL_15_FIX =
  'Add the referenced capability to the agent, or remove the reference from the skill body.';

export const SKL_15: Rule<AgentsExperienceModel> = rule<AgentsExperienceModel>({
  id: 'SKL-15',
  title: 'Inline skills name only capabilities the agent has',
  harnesses: ['copilot'],
  pillar: 'skills',
  subjectScope: 'agent',
  execution: 'deterministic',
  severity: 'medium',
  tags: ['capability-alignment', 'quality'],
  references: ['ms-tools-skills'],
  prose: {
    question: 'Does every capability an inline skill names in an invocation frame exist on the agent?',
    summary: 'Match quoted, backticked and Title-Case capability names in each skill body against the captured inventory.',
    why: SKL_15_WHY,
    fix: SKL_15_FIX,
    failTitle: SKL_15_FAIL_TITLE,
    passWhen: ['Every name an inline skill invokes resolves to a configured capability.'],
    failWhen: [
      'An inline skill invokes a name matching no configured tool, skill, connected agent or knowledge source.',
    ],
    notApplicableWhen: ['No inline skill carries a body to read.'],
  },
  evidence: {
    fieldPaths: ['skills.body'],
    populations: ['skills', 'tools', 'connectedAgents', 'knowledge'],
    completeForFailure: ['tools', 'connectedAgents', 'knowledge'],
  },
  check(model) {
    const authored = model.skills.filter(skill => norm(skill.body));
    if (authored.length === 0) return notApplicable('no inline skill carries a body to read');
    const configured = configuredCapabilityNames(model);
    const instances: RuleInstance[] = [];
    for (const skill of authored) {
      const missing = missingCapabilityReferences(skill.body, configured);
      if (missing.length === 0) continue;
      const label = skill.frontmatterName ?? skill.name;
      instances.push({
        subjectId: skill.componentIdUnique,
        subject: skill.name,
        title: `Skill "${label}" references a capability the agent does not have`,
        detail: `"${label}" names but the agent does not have: ${missing.join(', ')}`,
        why: SKL_15_WHY,
        makerAction: SKL_15_FIX,
        subjectRef: [{
          id: skill.componentIdUnique?.trim() || skill.componentId,
          schemaName: skill.schemaname,
          fieldPath: 'skills.body',
        }],
      });
    }
    return instances.length > 0 ? failWith(instances) : pass();
  },
});

export const skillRules: readonly Rule<AgentsExperienceModel>[] = Object.freeze([SKL_08, SKL_09, SKL_15]);
