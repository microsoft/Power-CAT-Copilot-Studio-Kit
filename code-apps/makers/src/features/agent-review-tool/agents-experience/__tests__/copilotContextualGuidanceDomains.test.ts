import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getCopilotFindingGuidance } from '../services/copilotContextualGuidance';
import { contextualGuidanceFixture } from './contextualGuidanceFixtures';

const PRIVATE_SCOPES = [
  'Use when a member asks about their reward tier or points.',
  'Report the confirmed reward tier and points balance of an authorized member.',
  "Show a customer's account balance.",
  "Check an employee's leave balance.",
] as const;
const NON_PRIVATE_SCOPES = [
  'Summarize the key points of a policy document.',
  'Answer IT questions from team members.',
  'Prepare talking points for a sales meeting.',
] as const;
const CONTROL_SCOPE = 'Summarize a public policy document.';
const RULES = [
  'INS-01', 'INS-02', 'INS-03', 'INS-04', 'INS-05', 'INS-06',
  'SKL-01', 'SKL-02', 'SKL-03', 'SKL-12', 'SKL-13', 'SKL-14',
  'SKL-AI-CLARITY', 'SKL-AI-SCOPE',
] as const;

function scopedGuidance(scope: string) {
  const { input, skill, instruction, authoring } = contextualGuidanceFixture();
  input.payload.model.skills = [{
    ...skill, name: 'task-helper', frontmatterName: 'task-helper',
    frontmatterDescription: scope, body: 'Handle the captured task.',
    markdown: `---\nname: task-helper\ndescription: ${JSON.stringify(scope)}\n---\nHandle the captured task.`,
  }];
  const before = JSON.stringify(input);
  const guidance = Object.fromEntries(RULES.map(id => {
    const finding = id.startsWith('INS-')
      ? { ...instruction, id, ai: id !== 'INS-01' }
      : { ...authoring, id, ruleId: id };
    return [id, getCopilotFindingGuidance(finding, input.payload)!];
  }));
  expect(JSON.stringify(input)).toBe(before);
  return guidance;
}

describe('domain-neutral snapshot private-data guidance', () => {
  it.each(PRIVATE_SCOPES)('keeps private-data safeguards for the captured scope: %s', scope => {
    const guidance = scopedGuidance(scope);
    for (const id of ['INS-01', 'INS-04', 'SKL-03', 'SKL-13']) {
      expect(guidance[id].whyItMatters).toContain('trusted private-data retrieval capability');
      expect(guidance[id].suggestedText).toContain('trusted result retrieved for an authorized caller');
      expect(guidance[id].suggestedText).toContain('caller-supplied identifier');
      expect(guidance[id].suggestedText).toContain('not proof of authorization');
      expect(guidance[id].suggestedText).toContain('Web search cannot confirm private data');
      expect(guidance[id].suggestedText).toContain('Never invent private values');
      expect(guidance[id].suggestedText).toContain('claim or promise a change without a confirmed capability result');
    }
    expect(guidance['SKL-14'].suggestedText).toContain('Unauthorized private-data request: return no private values');
    expect(guidance['SKL-14'].acceptanceCheck).toContain('unauthorized request for private data');
    const generatedText = Object.values(guidance)
      .flatMap(item => [item.whyItMatters, item.suggestedText, item.acceptanceCheck])
      .map(text => text?.replaceAll(scope, '') ?? '').join('\n');
    expect(generatedText).not.toMatch(/\b(members?|membership|tiers?|points?|balances?|loyalty|rewards?|grants?|upgrades?)\b/i);
  });

  it.each(NON_PRIVATE_SCOPES)('keeps generic advice for the non-private scope: %s', scope => {
    const actual = JSON.stringify(scopedGuidance(scope)).replaceAll(scope, CONTROL_SCOPE);
    const expected = JSON.stringify(scopedGuidance(CONTROL_SCOPE));
    expect(actual).toBe(expected);
  });

  it('keeps all previously non-private guidance bytes unchanged', () => {
    const digest = createHash('sha256').update(JSON.stringify(scopedGuidance(CONTROL_SCOPE))).digest('hex');
    expect(digest).toMatchInlineSnapshot(`"6f9335f55607eaa110344d75af0703b9bb52d4a997d9ea40a1be902f34425936"`);
  });
});
