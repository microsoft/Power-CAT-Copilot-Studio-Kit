import { describe, expect, it } from 'vitest';
import type { AgentsExperienceModel } from '../../contracts/AgentsExperienceModel.js';
import type { GroundedFinding } from '../../contracts/Findings.js';
import { skillRules } from './skillRules.js';

function skl09Findings(body: string): GroundedFinding[] {
  const rule = skillRules.find(candidate => candidate.id === 'SKL-09');
  if (!rule) throw new Error('SKL-09 is not registered.');
  const model = {
    tools: [{ name: 'Get Orders' }],
    connectedAgents: [],
    knowledge: [],
    skills: [{ name: 'Order lookup', body }],
  } as unknown as AgentsExperienceModel;
  const result = rule.check(model);
  if (result === null) return [];
  return (Array.isArray(result) ? result : [result]).filter(finding => finding.id === 'SKL-09');
}

describe('SKL-09 skill capability references', () => {
  it('reports a multi-word reference that no configured capability matches', () => {
    const findings = skl09Findings('Use "Get Orders", then "Missing Tool".');
    expect(findings).toHaveLength(1);
    expect(findings[0].fact).toContain('missing tool');
  });

  it('does not report single-word field or parameter names', () => {
    expect(skl09Findings('Use "Get Orders" with `customerId` and `orderId`.')).toEqual([]);
  });
});
