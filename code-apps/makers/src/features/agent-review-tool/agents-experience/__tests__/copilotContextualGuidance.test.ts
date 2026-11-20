import { describe, expect, it } from 'vitest';
import { getCopilotFindingGuidance } from '../services/copilotContextualGuidance';
import { contextualGuidanceFixture } from './contextualGuidanceFixtures';

describe('snapshot-based Copilot finding guidance', () => {
  it('uses the captured task and names, with explicit private-data prerequisites', () => {
    const { input, instruction } = contextualGuidanceFixture();
    const original = JSON.stringify(input.payload);
    const advice = getCopilotFindingGuidance(instruction, input.payload)!;
    expect(advice.source).toBe('snapshot');
    expect(advice.whyItMatters).toContain('member-status');
    expect(advice.whyItMatters).toContain('no configured tool');
    expect(advice.suggestedText).toContain('reward tier or points');
    expect(advice.suggestedText).toContain('authorized');
    expect(advice.suggestedText).toContain('email');
    expect(advice.suggestedText).toContain('not proof of authorization');
    expect(advice.suggestedText).toContain('invent');
    expect(advice.suggestedText).toContain('Never invent private values');
    expect(advice.suggestedText).toContain('claim or promise a change without a confirmed capability result');
    expect(advice.suggestedText).toContain('Web search');
    expect(advice.acceptanceCheck).toContain('ambiguous');
    expect(advice.acceptanceCheck).toContain('unavailable');
    expect(advice.suggestedText).not.toMatch(/SQL|Cosmos|support team|endpoint|transfer has/i);
    expect(JSON.stringify(input.payload)).toBe(original);
  });

  it('changes the actual task content, not only the component name', () => {
    const { input, instruction, skill } = contextualGuidanceFixture();
    const memberDraft = getCopilotFindingGuidance(instruction, input.payload)!.suggestedText;
    input.payload.model.agentSettings.instructions = 'Help with shipments.';
    input.payload.model.skills = [{
      ...skill, name: 'parcel-progress', frontmatterName: 'parcel-progress',
      frontmatterDescription: 'Use when a user asks for shipment progress.',
      body: 'Explain the confirmed shipment progress.',
    }];
    const parcelDraft = getCopilotFindingGuidance(instruction, input.payload)!.suggestedText;
    expect(parcelDraft).not.toBe(memberDraft);
    expect(parcelDraft).toContain('shipment progress');
    expect(parcelDraft).not.toContain('reward tier');
    expect(parcelDraft).not.toContain('grants');
  });

  it('binds skill advice to identity even when two skill names are identical', () => {
    const { input, authoring, skill } = contextualGuidanceFixture();
    input.payload.model.skills.push({
      ...skill, componentId: 'other-component', componentIdUnique: 'other-unique',
      schemaname: 'example.skill.other',
      frontmatterDescription: 'Use when a user asks for shipment progress.',
    });
    const advice = getCopilotFindingGuidance({
      ...authoring, componentIdUnique: 'other-unique',
    }, input.payload)!;
    expect(advice.componentIdUnique).toBe('other-unique');
    expect(advice.suggestedText).toContain('shipment progress');
    expect(advice.suggestedText).not.toContain('reward tier or points');
  });

  it('does not substitute another known component when a saved identity is missing', () => {
    const { input, authoring } = contextualGuidanceFixture();
    const advice = getCopilotFindingGuidance({
      ...authoring, componentIdUnique: 'uncaptured-unique',
    }, input.payload)!;
    expect(advice.suggestedText).toBeUndefined();
    expect(advice.whyItMatters).toMatch(/identity|identify/i);
  });

  it('does not use a containing bundle to override a conflicting finding identity', () => {
    const { input, authoring } = contextualGuidanceFixture();
    const advice = getCopilotFindingGuidance(authoring, input.payload, 'different-unique')!;
    expect(advice.suggestedText).toBeUndefined();
    expect(advice.whyItMatters).toMatch(/identity|identify/i);
  });

  it('can resolve an old finding from a unique exact saved bundle finding', () => {
    const { input, authoring, skill } = contextualGuidanceFixture();
    const { componentIdUnique: _identity, ...oldFinding } = authoring;
    void _identity;
    const advice = getCopilotFindingGuidance(oldFinding, input.payload)!;
    expect(advice.componentIdUnique).toBe(skill.componentIdUnique);
    expect(advice.suggestedText).toContain('reward tier or points');
  });

  it('does not guess between indistinguishable saved skill findings', () => {
    const { input, authoring, skill } = contextualGuidanceFixture();
    const other = {
      ...skill, componentId: 'other-component', componentIdUnique: 'other-unique',
      schemaname: 'example.skill.other',
    };
    input.payload.model.skills.push(other);
    input.payload.skillBundleReviews!.push({
      ...input.payload.skillBundleReviews![0], skillSchemaName: other.schemaname,
      deterministicFindings: [{ ...authoring, componentIdUnique: other.componentIdUnique }],
    });
    const { componentIdUnique: _identity, ...oldFinding } = authoring;
    void _identity;
    const advice = getCopilotFindingGuidance(oldFinding, input.payload)!;
    expect(advice.suggestedText).toBeUndefined();
  });

  it('keeps genuinely stored AI guidance instead of inventing a replacement', () => {
    const { input, authoring } = contextualGuidanceFixture();
    const finding = {
      ...authoring, ai: true,
      findingTitle: 'Clarify the captured lookup',
      whyItMatters: 'The captured lookup cannot confirm private results.',
      makerAction: 'Require an approved source before reporting a result.',
      suggestedText: 'If an approved result is unavailable, explain the limitation.',
      acceptanceCheck: 'Check that a missing result never produces an invented balance.',
    };
    const advice = getCopilotFindingGuidance(finding, input.payload)!;
    expect(advice.source).toBe('saved');
    expect(advice.makerAction).toBe(finding.makerAction);
    expect(advice.suggestedText).toBe(finding.suggestedText);
    expect(advice.acceptanceCheck).toBe(finding.acceptanceCheck);
    expect(finding.ai).toBe(true);
  });

  it('preserves an explicit empty saved draft and labels snapshot additions', () => {
    const { input, authoring } = contextualGuidanceFixture();
    const advice = getCopilotFindingGuidance({
      ...authoring, ai: true, suggestedText: '',
    }, input.payload)!;
    expect(advice.suggestedText).toBe('');
    expect(advice.source).toBe('saved-and-snapshot');
    expect(advice.acceptanceCheck).not.toBe('');
  });

  it('recovers genuine nested AI advice that an old top-level projection dropped', () => {
    const { input, authoring } = contextualGuidanceFixture();
    input.payload.skillBundleReviews![0].deterministicFindings = [{
      ...authoring, ai: true, findingTitle: 'Confirm authorized retrieval',
      whyItMatters: 'The captured member task needs an authorized result.',
      makerAction: 'Make the trusted retrieval prerequisite explicit.',
      suggestedText: 'When authorized retrieval is unavailable, return no private member data.',
      acceptanceCheck: 'An unavailable source does not produce a private member result.',
    }];
    const { componentIdUnique: _identity, ...oldFinding } = authoring;
    void _identity;
    const before = JSON.stringify(input.payload);
    const advice = getCopilotFindingGuidance({ ...oldFinding, ai: true }, input.payload)!;
    expect(advice.source).toBe('saved');
    expect(advice.componentIdUnique).toBe('member-unique');
    expect(advice.suggestedText).toBe('When authorized retrieval is unavailable, return no private member data.');
    expect(JSON.stringify(input.payload)).toBe(before);
  });

  it('does not reuse a saved draft with a conflicting target identity', () => {
    const { input, authoring } = contextualGuidanceFixture();
    const saved = getCopilotFindingGuidance(authoring, input.payload)!;
    const advice = getCopilotFindingGuidance({
      ...authoring, remediation: { ...saved, componentIdUnique: 'different-unique' },
    }, input.payload)!;
    expect(advice.suggestedText).toBeUndefined();
    expect(advice.whyItMatters).toContain('conflicting component identity');
  });

  it('retains saved prerequisite advice and adds only the missing conditional draft', () => {
    const { input, authoring, skill } = contextualGuidanceFixture();
    const saved = {
      ...authoring, id: 'SKL-AI-PREREQUISITES', ruleId: 'SKL-AI-PREREQUISITES', ai: true,
      findingTitle: 'The member task needs an authorized source',
      whyItMatters: 'The captured task requires private member results.',
      makerAction: 'Document the trusted source and how to authorize the caller.',
      acceptanceCheck: 'The skill returns no private result without authorized retrieval.',
    };
    input.payload.skillBundleReviews![0].standardEvaluation = {
      status: 'complete',
      dimensions: (['Clarity', 'Actionability', 'Scope discipline', 'Composability'] as const)
        .map(key => ({ key, score: 85, rationale: 'Captured task scope.' })),
      findings: [saved],
      resourcePurposeAlignment: [], operationalAssumptions: [], unreviewedResources: [],
      summary: '', referenceIds: [],
    };
    const { componentIdUnique: _identity, ...oldFinding } = authoring;
    void _identity;
    const before = JSON.stringify(input.payload);
    const advice = getCopilotFindingGuidance({
      ...oldFinding, id: saved.id, ruleId: saved.ruleId, ai: true,
    }, input.payload)!;
    expect(advice).toMatchObject({
      source: 'saved-and-snapshot', componentIdUnique: skill.componentIdUnique,
      findingTitle: saved.findingTitle, whyItMatters: saved.whyItMatters,
      makerAction: saved.makerAction, acceptanceCheck: saved.acceptanceCheck,
    });
    expect(advice.suggestedText).toContain('member-status');
    expect(advice.suggestedText).toContain('If a prerequisite is missing');
    expect(advice.suggestedText).toContain('not proof of authorization');
    expect(JSON.stringify(input.payload)).toBe(before);
  });

  it('omits irrelevant advice for an informational inventory finding', () => {
    const { input, instruction } = contextualGuidanceFixture();
    expect(getCopilotFindingGuidance({
      ...instruction, id: 'TOL-01', family: 'Tools', severity: 'info',
    }, input.payload)).toBeUndefined();
    expect(getCopilotFindingGuidance({
      ...instruction, id: 'INS-02', severity: 'info',
    }, input.payload)).toBeUndefined();
  });

  it('states the context limit instead of drafting an invented task', () => {
    const { input, instruction } = contextualGuidanceFixture();
    input.payload.model.skills = [];
    const advice = getCopilotFindingGuidance(instruction, input.payload)!;
    expect(advice.suggestedText).toBeUndefined();
    expect(advice.whyItMatters).toMatch(/scope|context/i);
    expect(advice.acceptanceCheck).not.toBe('');
  });

  it('does not treat a ZIP marker as captured authoring text', () => {
    const { input, skill, authoring } = contextualGuidanceFixture();
    input.payload.model.skills = [{
      ...skill, source: 'zip-bundle', frontmatterDescription: undefined,
      markdown: '<!-- bic:bundle=example.file.bundle -->', body: '',
    }];
    const advice = getCopilotFindingGuidance(authoring, input.payload)!;
    expect(advice.suggestedText).toBeUndefined();
    expect(advice.whyItMatters).toMatch(/captur|scope/i);
  });

  it('reads captured Markdown scope when a legacy description field is empty', () => {
    const { input, instruction } = contextualGuidanceFixture();
    input.payload.model.skills[0].frontmatterDescription = '';
    const advice = getCopilotFindingGuidance(instruction, input.payload)!;
    expect(advice.suggestedText).toContain('reward tier or points');
  });

  it('redacts secret-like values in saved guidance without changing the saved finding', () => {
    const { input, authoring } = contextualGuidanceFixture();
    const secret = 'api_key = "sk-synthetic-secret-value"';
    const finding = {
      ...authoring, ai: true, makerAction: secret, whyItMatters: secret,
      suggestedText: secret, acceptanceCheck: secret,
    };
    const before = JSON.stringify(finding);
    const advice = getCopilotFindingGuidance(finding, input.payload)!;
    expect(JSON.stringify(advice)).not.toContain('sk-synthetic-secret-value');
    expect(JSON.stringify(finding)).toBe(before);
  });

  it.each([
    ['SKL-07', '## Procedure'],
    ['SKL-11', '1. Confirm'],
    ['SKL-12', 'description:'],
    ['SKL-13', '## When not to use'],
    ['SKL-14', '## Examples to test'],
    ['SKL-AI-CLARITY', 'description:'],
    ['SKL-AI-ACTIONABILITY', '## Procedure'],
    ['SKL-AI-PREREQUISITES', '## Procedure'],
  ])('uses the catalogue authoring purpose for %s', (ruleId, section) => {
    const { input, authoring } = contextualGuidanceFixture();
    const advice = getCopilotFindingGuidance({ ...authoring, id: ruleId, ruleId }, input.payload)!;
    expect(advice.suggestedText).toContain(section);
    expect(advice.suggestedText).toContain('reward tier or points');
  });
});
