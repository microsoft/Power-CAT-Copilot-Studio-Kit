import type { Rule } from './ruleTypes.js';
import { norm } from './ruleTypes.js';
import type { GroundedFinding } from '../../contracts/Findings.js';

const FAMILY = 'Skills';

/** Candidate capability references in a skill body: "quoted" or `backtick` names. */
function referencedNames(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(/"([^"]{3,40})"|`([^`]{3,40})`/g)) out.push(m[1] ?? m[2]);
  return out;
}

export const skillRules: Rule[] = [
  {
    id: 'SKL-08', family: FAMILY, severity: 'warning', referenceId: 'ms-skills-overview',
    check(model) {
      const out: GroundedFinding[] = [];
      for (const skill of model.skills) {
        const body = norm(skill.body);
        const siblings = model.skills
          .filter(s => s !== skill && s.frontmatterName)
          .filter(s => body.includes(norm(s.frontmatterName!)));
        for (const sib of siblings) {
          out.push({
            id: 'SKL-08', family: FAMILY, severity: 'warning', referenceId: 'ms-skills-overview', ai: false,
            title: `Skill "${skill.frontmatterName ?? skill.name}" references sibling skill "${sib.frontmatterName}"`,
            fact: `body of "${skill.frontmatterName ?? skill.name}" mentions "${sib.frontmatterName}"`,
            why: 'Skills are meant to be self-contained; cross-skill coupling makes the orchestrator\'s selection and composition harder to reason about.',
            fix: 'Make each skill self-contained, or fold the coupled behavior into a single skill.',
          });
        }
      }
      return out;
    },
  },
  {
    id: 'SKL-09', family: FAMILY, severity: 'error', referenceId: 'ms-tools-skills',
    check(model) {
      const capabilities = [
        ...model.tools.map(t => t.name), ...model.connectedAgents.map(a => a.name),
        ...model.knowledge.map(k => k.name),
      ].map(norm);
      if (capabilities.length === 0) return null;
      const out: GroundedFinding[] = [];
      for (const skill of model.skills) {
        const refs = referencedNames(skill.body).map(norm).filter(r => /\s/.test(r) || /[a-z][A-Z]/.test(r));
        if (refs.length === 0) continue;
        const matched = refs.filter(r => capabilities.some(c => c === r || c.includes(r) || r.includes(c)));
        const unmatched = refs.filter(r => !capabilities.some(c => c === r || c.includes(r) || r.includes(c)));
        // Only flag when the skill clearly references real capabilities AND at least one that does not exist.
        if (matched.length > 0 && unmatched.length > 0) {
          out.push({
            id: 'SKL-09', family: FAMILY, severity: 'error', referenceId: 'ms-tools-skills', ai: false,
            title: `Skill "${skill.frontmatterName ?? skill.name}" references an unavailable tool`,
            fact: `referenced but not configured: ${unmatched.join(', ')}`,
            why: 'A skill that instructs the agent to use a tool the agent does not have will fail at runtime.',
            fix: 'Add the referenced tool to the agent, or remove the reference from the skill.',
          });
        }
      }
      return out;
    },
  },
];
