import { describe, expect, it } from 'vitest';
import { getCopilotFindingGuidance } from '../services/copilotContextualGuidance';
import { contextualGuidanceFixture } from './contextualGuidanceFixtures';

const ELEMENTS = [
  ['INS-02', 'Role and purpose:', 'what can you help with'],
  ['INS-03', 'Tone and style:', 'register'],
  ['INS-04', 'Boundaries:', 'out-of-scope'],
  ['INS-05', 'Ambiguous input:', 'ambiguous'],
  ['INS-06', 'Escalation:', 'person'],
] as const;

function instructionAdvice(id: string) {
  const { input, instruction } = contextualGuidanceFixture();
  const finding = { ...instruction, id, ai: id !== 'INS-01' && id !== 'INS-09' };
  return {
    input, finding,
    advice: getCopilotFindingGuidance(finding, input.payload)!,
  };
}

describe('rule-specific snapshot instruction guidance', () => {
  it.each(ELEMENTS)('limits %s to its own instruction element', (id, heading, testCase) => {
    const { advice } = instructionAdvice(id);
    expect(advice.source).toBe('snapshot');
    expect(advice.suggestedText).toContain(heading);
    for (const [, otherHeading] of ELEMENTS) {
      if (otherHeading !== heading) expect(advice.suggestedText).not.toContain(otherHeading);
    }
    expect(advice.acceptanceCheck.toLowerCase()).toContain(testCase);
    expect(advice.acceptanceCheck).toMatch(/^No test cases were captured\. Add/);
    const otherChecks = ELEMENTS.filter(([otherId]) => otherId !== id)
      .map(([otherId]) => instructionAdvice(otherId).advice.acceptanceCheck);
    expect(otherChecks).not.toContain(advice.acceptanceCheck);
  });

  it('produces five different element drafts and examples', () => {
    const advice = ELEMENTS.map(([id]) => instructionAdvice(id).advice);
    expect(new Set(advice.map(item => item.suggestedText)).size).toBe(5);
    expect(new Set(advice.map(item => item.whyItMatters)).size).toBe(5);
  });

  it('combines the same five element drafts in order without duplicate lines for INS-01', () => {
    const advice = instructionAdvice('INS-01').advice;
    const combined = advice.suggestedText!;
    expect(advice.whyItMatters).toContain('No handoff route was captured in the saved snapshot.');
    let previous = -1;
    for (const [id, heading] of ELEMENTS) {
      expect(combined.split(heading)).toHaveLength(2);
      const element = instructionAdvice(id).advice.suggestedText!;
      expect(combined).toContain(element);
      expect(combined.indexOf(element)).toBeGreaterThan(previous);
      previous = combined.indexOf(element);
    }
    const lines = combined.split('\n').filter(line => line.trim());
    expect(new Set(lines).size).toBe(lines.length);
  });

  it('states a role from captured skill scope without guessing an audience or agent purpose', () => {
    const { input, finding, advice } = instructionAdvice('INS-02');
    expect(advice.suggestedText).toMatch(/you are an assistant/i);
    expect(advice.suggestedText).toContain('member-status');
    expect(advice.suggestedText).toContain('reward tier or points');
    input.payload.model.agentSettings.instructions = 'You are the finance help desk.';
    expect(getCopilotFindingGuidance(finding, input.payload)!.suggestedText).toBe(advice.suggestedText);
    expect(advice.suggestedText).not.toMatch(/finance|help desk|support team/i);
  });

  it('marks the tone as a neutral default and specifies register, length and formality', () => {
    const { advice } = instructionAdvice('INS-03');
    expect(advice.whyItMatters).toMatch(/neutral default/i);
    expect(advice.whyItMatters).toMatch(/confirm or replace.*approved voice/i);
    expect(advice.suggestedText).toMatch(/neutral.*register/i);
    expect(advice.suggestedText).toMatch(/sentences/i);
    expect(advice.suggestedText).toMatch(/formal/i);
    expect(advice.acceptanceCheck).toMatch(/register.*length.*formality/i);
  });

  it('declines out-of-scope and unauthorized private-data requests without inventing a redirect', () => {
    const { advice } = instructionAdvice('INS-04');
    expect(advice.whyItMatters).toMatch(/no redirect destination was captured/i);
    expect(advice.suggestedText).toContain('member-status');
    expect(advice.suggestedText).toMatch(/decline.*outside.*scope/i);
    expect(advice.suggestedText).toContain('do not attempt');
    expect(advice.suggestedText).toContain('not proof of authorization');
    expect(advice.suggestedText).toContain('Web search cannot confirm private data');
    expect(advice.acceptanceCheck).toMatch(/out-of-scope/);
    expect(advice.acceptanceCheck).toMatch(/unauthorized/);
    expect(advice.suggestedText).not.toMatch(/SQL|Cosmos|support team|endpoint/i);
  });

  it('asks a short question for unclear requests or missing inputs without guessing', () => {
    const { advice } = instructionAdvice('INS-05');
    expect(advice.suggestedText).toMatch(/short clarifying question/i);
    expect(advice.suggestedText).toMatch(/missing.*required input|required input.*missing/i);
    expect(advice.suggestedText).toMatch(/do not guess/i);
    expect(advice.acceptanceCheck).toMatch(/ambiguous request/i);
    expect(advice.acceptanceCheck).toMatch(/missing.*required input/i);
  });

  it('states escalation triggers and a safe no-transfer response without treating names as a route', () => {
    const { input, finding } = instructionAdvice('INS-06');
    input.payload.model.tools = [{
      name: 'case-transfer', displayName: 'Case Transfer', kind: 'ConnectorTool',
      schemaname: 'example.tool.case-transfer',
    }];
    input.payload.model.connectedAgents = [{ name: 'human-help', schemaname: 'example.agent.human-help' }];
    input.payload.model.topics = [{ name: 'contact-operator', schemaname: 'example.topic.contact-operator' }];
    const advice = getCopilotFindingGuidance(finding, input.payload)!;
    expect(advice.whyItMatters).toMatch(/no handoff route was captured/i);
    expect(advice.whyItMatters).toMatch(/approved route before go-live/i);
    expect(advice.suggestedText).toMatch(/asks for a person/i);
    expect(advice.suggestedText).toMatch(/no configured capability supports/i);
    expect(advice.suggestedText).toMatch(/cannot transfer/i);
    expect(advice.suggestedText).toMatch(/never claim.*transfer or escalation/i);
    expect(advice.suggestedText).not.toMatch(/case-transfer|Case Transfer|human-help|contact-operator/);
    expect(advice.acceptanceCheck).toMatch(/person/);
    expect(advice.acceptanceCheck).toMatch(/unsupported action/);
  });

  it.each(['INS-07', 'INS-09'])('gives %s capability-alignment advice, not general instructions', id => {
    const { input, finding } = instructionAdvice(id);
    finding.fact = id === 'INS-09'
      ? 'named but not configured: case-lookup'
      : 'Use the "case-lookup" tool.';
    input.payload.model.agentSettings.instructions = 'Use the "unrelated-helper" tool.';
    const advice = getCopilotFindingGuidance(finding, input.payload)!;
    expect(advice.whyItMatters).toContain('case-lookup');
    expect(advice.whyItMatters).toMatch(/configure.*remove/i);
    expect(advice.suggestedText).toContain('case-lookup');
    expect(advice.acceptanceCheck).toContain('case-lookup');
    for (const [, heading] of ELEMENTS) expect(advice.suggestedText).not.toContain(heading);
    expect(advice.suggestedText).not.toContain('unrelated-helper');
    expect(advice.suggestedText).not.toContain('reward tier');
  });

  it.each(['INS-07', 'INS-09'])('states the context limit for %s when no capability can be identified', id => {
    const { input, finding } = instructionAdvice(id);
    finding.fact = 'A capability reference could not be resolved.';
    input.payload.model.agentSettings.instructions = 'Use the "unrelated-helper" tool.';
    const advice = getCopilotFindingGuidance(finding, input.payload)!;
    expect(advice.suggestedText).toBeUndefined();
    expect(advice.whyItMatters).toMatch(/identify|capture|confirm/i);
    expect(advice.whyItMatters).not.toContain('unrelated-helper');
  });

  it('does not call a capability missing when its name or display name is in the captured inventory', () => {
    const { input, finding } = instructionAdvice('INS-09');
    input.payload.model.tools = [{
      name: 'case_lookup', displayName: 'Case Lookup', kind: 'ConnectorTool', schemaname: 'example.tool.case-lookup',
    }];
    for (const name of ['member-status', 'case_lookup', 'Case Lookup']) {
      const advice = getCopilotFindingGuidance({
        ...finding, fact: `named but not configured: ${name}`,
      }, input.payload)!;
      expect(advice.suggestedText).toBeUndefined();
    }
  });

  it('keeps saved advice first, including an explicit empty draft', () => {
    const { input, finding } = instructionAdvice('INS-03');
    const remediation = {
      source: 'saved' as const, findingTitle: 'An approved tone was recorded',
      whyItMatters: 'Use the approved voice.', makerAction: 'Keep the recorded tone.',
      suggestedText: '', acceptanceCheck: 'Check the approved voice.',
    };
    expect(getCopilotFindingGuidance({ ...finding, remediation }, input.payload)).toEqual(remediation);
  });

  it('keeps the captured-tests prefix and leaves findings, scores and outcomes unchanged', () => {
    const { input, instruction } = contextualGuidanceFixture();
    input.payload.model.testCases = [{ name: 'example-case', schemaname: 'example.test.case' }];
    const original = JSON.stringify(input);
    for (const [id] of ELEMENTS) {
      const advice = getCopilotFindingGuidance({ ...instruction, id, ai: true }, input.payload)!;
      expect(advice.acceptanceCheck).toMatch(/^Use or add/);
      expect(advice.acceptanceCheck).not.toContain('No test cases were captured');
    }
    expect(JSON.stringify(input)).toBe(original);
  });

  it('retains the full procedure with domain-neutral private-data safeguards', () => {
    const { input, authoring } = contextualGuidanceFixture();
    const advice = getCopilotFindingGuidance(authoring, input.payload)!;
    expect(advice.whyItMatters).toBe('For "member-status", the captured purpose is: Use when a member asks about their reward tier or points.\n'
      + 'The saved snapshot contains no configured tool. Prerequisite: verify a trusted private-data retrieval capability and caller authorization before reporting private results. Web search is not a private-data source.');
    expect(advice.acceptanceCheck).toBe('No test cases were captured. Add cases for "member-status": '
      + 'a normal in-scope request, an ambiguous request, an out-of-scope request, and an unavailable source. '
      + 'Include an unauthorized caller and a caller-supplied account number or email address without authorization. Until trusted access is configured, expect no private result or claimed or promised change without a confirmed capability result.');
    expect(advice.suggestedText).toBe([
      '## Procedure for member-status',
      'Scope: Use when a member asks about their reward tier or points.',
      '1. Confirm that the request is within this scope and ask for missing inputs.',
      '2. Check the required capability, trusted data, and authorization before attempting the task.',
      '3. If a prerequisite is missing, stop the lookup or action and explain the limitation.',
      '4. If the prerequisites are met, use the approved capability and report only its confirmed result.',
      '## Boundaries',
      'Ask for clarification if the request or required inputs are ambiguous.',
      'Use only verified, configured capabilities within their approved scope. Do not invent tools, data sources, or a handoff route.',
      'Before reporting private data, require a trusted result retrieved for an authorized caller. A caller-supplied identifier, such as an account number or email address, is not proof of authorization.',
      'Web search cannot confirm private data. If authorized retrieval is unavailable, explain that the result cannot be confirmed.',
      'Never invent private values or claim or promise a change without a confirmed capability result.',
      'Do not claim that a change, transfer, or escalation occurred without a confirmed capability result.',
    ].join('\n'));
  });
});
