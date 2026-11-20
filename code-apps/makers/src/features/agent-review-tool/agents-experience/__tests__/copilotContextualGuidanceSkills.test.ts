import { describe, expect, it } from 'vitest';
import type { AeSkill } from '../contracts/AgentsExperienceModel';
import { assessSkillAuthoring, verdictFor } from '../../review-core/rules/skill-authoring.rules';
import { getCopilotFindingGuidance } from '../services/copilotContextualGuidance';
import { contextualGuidanceFixture } from './contextualGuidanceFixtures';

const SCOPE = 'Report the confirmed reward tier and points balance of an authorized member.';
const BODY = 'Read the request and check member information. Confirm the requested record and caller authorization. '
  + 'Retrieve current values using a configured capability. Explain missing data clearly. '
  + 'Report only confirmed results and stop if authorization is unavailable.';

function skillAdvice(ruleId: string, overrides: Partial<AeSkill> = {}) {
  const { input, authoring, skill } = contextualGuidanceFixture();
  const captured = { ...skill, frontmatterDescription: SCOPE, body: BODY, ...overrides };
  captured.markdown = `---\nname: ${JSON.stringify(captured.frontmatterName)}\ndescription: ${JSON.stringify(captured.frontmatterDescription)}\n---\n${captured.body}`;
  input.payload.model.skills = [captured];
  const verdict = assessSkillAuthoring(captured).verdicts.find(item => item.ruleId === ruleId);
  const fact = verdict?.instances[0]?.detail ?? authoring.fact;
  const finding = { ...authoring, id: ruleId, ruleId, fact, evidence: fact };
  return { input, skill: captured, finding, advice: getCopilotFindingGuidance(finding, input.payload)! };
}

describe('rule-specific snapshot skill guidance', () => {
  it('gives the four authoring changes different examples and verification cases', () => {
    const guidance = ['SKL-01', 'SKL-12', 'SKL-13', 'SKL-14']
      .map(id => skillAdvice(id).advice);
    expect(new Set(guidance.map(item => item.whyItMatters)).size).toBe(4);
    expect(new Set(guidance.map(item => item.acceptanceCheck)).size).toBe(4);
  });

  it('explains the captured name and slug without a private-data prerequisite for a rename', () => {
    const { advice } = skillAdvice('SKL-01', { frontmatterName: 'Member Status' });
    expect(advice.whyItMatters).toContain('"Member Status"');
    expect(advice.whyItMatters).toContain('"member-status"');
    expect(advice.suggestedText).toContain('name: "member-status"');
    expect(advice.acceptanceCheck).toMatch(/references.*resolve/i);
    expect(advice.acceptanceCheck).toMatch(/in-scope.*select|select.*in-scope/i);
    expect(advice.whyItMatters).not.toContain('Prerequisite:');
    expect(advice.acceptanceCheck).not.toMatch(/unauthorized|membership number|unavailable source/i);
  });

  it.each(['SKL-02', 'SKL-12', 'SKL-AI-CLARITY'])(
    'gives %s a captured-purpose-first routing draft and routing checks', ruleId => {
      const { advice } = skillAdvice(ruleId);
      expect(advice.whyItMatters).toContain('member-status');
      expect(advice.whyItMatters).toContain('no "Use when" trigger');
      expect(advice.whyItMatters).toContain(SCOPE);
      const description = JSON.parse(advice.suggestedText!.slice('description: '.length));
      expect(description).toBe(`${SCOPE} Use when a request matches this purpose. Do not use outside this scope or to report unverified results.`);
      expect(advice.acceptanceCheck).toMatch(/in-scope.*select|select.*in-scope/i);
      expect(advice.acceptanceCheck).toMatch(/out-of-scope.*not select|not select.*out-of-scope/i);
      expect(advice.whyItMatters).not.toContain('Prerequisite:');
      expect(advice.acceptanceCheck).not.toMatch(/unauthorized|unavailable source/i);
    },
  );

  it('passes the existing description-length and routing-signal detectors after drafting', () => {
    const { advice, skill } = skillAdvice('SKL-12');
    expect(verdictFor(assessSkillAuthoring(skill), 'SKL-12').status).toBe('warning');
    const frontmatterDescription = JSON.parse(advice.suggestedText!.slice('description: '.length));
    const assessment = assessSkillAuthoring({ ...skill, frontmatterDescription });
    expect(verdictFor(assessment, 'SKL-02').status).toBe('passed');
    expect(verdictFor(assessment, 'SKL-12').status).toBe('passed');
  });

  it('does not claim an existing captured trigger is absent', () => {
    const { advice } = skillAdvice('SKL-AI-CLARITY', {
      frontmatterDescription: 'Use when a member asks about their reward tier or points.',
    });
    expect(advice.whyItMatters).not.toContain('no "Use when" trigger');
    expect(advice.whyItMatters).toMatch(/captured.*trigger|trigger.*captured/i);
  });

  it.each(['SKL-13', 'SKL-AI-SCOPE'])(
    'gives %s negative-scope advice and a near-scope refusal check', ruleId => {
      const { advice } = skillAdvice(ruleId);
      expect(advice.whyItMatters).toMatch(/no "when not to use" limit/i);
      expect(advice.whyItMatters).toContain(SCOPE);
      expect(advice.whyItMatters).toContain('Prerequisite:');
      expect(advice.suggestedText).toContain('## When not to use');
      expect(advice.suggestedText).toContain('not proof of authorization');
      expect(advice.acceptanceCheck).toMatch(/near-scope.*out-of-scope/i);
      expect(advice.acceptanceCheck).toMatch(/not handled.*clear limitation|clear limitation.*not handled/i);
      expect(advice.acceptanceCheck).not.toContain('a normal in-scope request, an ambiguous request');
    },
  );

  it('turns the drafted examples into tests with expected outcomes, including unauthorized private-data requests', () => {
    const { advice } = skillAdvice('SKL-14');
    expect(advice.whyItMatters).toMatch(/no examples/i);
    expect(advice.whyItMatters).toContain('No test cases were captured');
    expect(advice.whyItMatters).toContain(SCOPE);
    expect(advice.whyItMatters).toContain('Prerequisite:');
    expect(advice.suggestedText).toContain('## Examples to test');
    expect(advice.suggestedText).toContain('Unauthorized private-data request: return no private values and do not claim or promise an unconfirmed change.');
    expect(advice.acceptanceCheck).toMatch(/each drafted example.*test case.*expected outcome/i);
    expect(advice.acceptanceCheck).toMatch(/unauthorized request for private data.*no private values/i);
    expect(advice.acceptanceCheck).not.toContain('a normal in-scope request, an ambiguous request');
  });

  it('does not claim no test cases were captured when the snapshot contains cases', () => {
    const { input, finding } = skillAdvice('SKL-14');
    input.payload.model.testCases = [{ name: 'example-case', schemaname: 'example.test.case' }];
    const advice = getCopilotFindingGuidance(finding, input.payload)!;
    expect(advice.whyItMatters).not.toContain('No test cases were captured');
    expect(advice.acceptanceCheck).toMatch(/^Use or add/);
  });

  it('does not add a private-data prerequisite or test to a non-private task', () => {
    const { advice } = skillAdvice('SKL-14', {
      frontmatterDescription: 'Format a public article into a concise plain-language summary.',
    });
    expect(advice.suggestedText).not.toContain('Unauthorized private-data request');
    expect(advice.whyItMatters).not.toContain('private-data retrieval');
    expect(advice.acceptanceCheck).not.toMatch(/unauthorized request for private data|private values|caller-supplied/i);
    expect(advice.acceptanceCheck).toMatch(/each drafted example/);
  });

  it.each(['SKL-01', 'SKL-02', 'SKL-12', 'SKL-AI-CLARITY', 'SKL-13', 'SKL-AI-SCOPE', 'SKL-14', 'SKL-03'])(
    'keeps %s test-prefix semantics, canonical findings, score and outcomes unchanged', ruleId => {
      const { input, finding, advice } = skillAdvice(ruleId);
      expect(advice.acceptanceCheck).toMatch(/^No test cases were captured\. Add/);
      input.payload.model.testCases = [{ name: 'example-case', schemaname: 'example.test.case' }];
      const before = JSON.stringify({ input, finding });
      const updated = getCopilotFindingGuidance(finding, input.payload)!;
      expect(updated.acceptanceCheck).toMatch(/^Use or add/);
      expect(updated.componentIdUnique).toBe('member-unique');
      expect(updated.source).toBe('snapshot');
      expect(JSON.stringify({ input, finding })).toBe(before);
    },
  );
});
