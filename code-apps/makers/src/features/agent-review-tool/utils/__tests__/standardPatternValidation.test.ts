import { describe, expect, it } from 'vitest';
import type { LocalStageAOutput, Pattern, StageBTopicComponent } from '../../contracts/StageOutputs';
import { validateStandardPatternEvaluation } from '../standardPatternValidation';
import { summarizePatternAssessments } from '../reviewAssessment';

const topicA: StageBTopicComponent = {
  TopicName: 'A', TopicId: 'topic-a', SchemaName: 'synthetic.a', ParseStatus: 'complete',
  ModelName: 'Workshop selection', ModelDescription: 'Select workshops.',
  RoutingApplicability: { status: 'applicable', reason: 'Generative selection.' },
  NamingApplicability: { status: 'applicable', reason: 'An explicit name is available.' },
  InputVariables: [{ VariableName: 'seats', VariableDescription: 'Required workshop seats.' }],
};
const topicB: StageBTopicComponent = {
  ...topicA, TopicName: 'B', TopicId: 'topic-b', SchemaName: 'synthetic.b',
  ModelDescription: 'Select other workshops.',
};
const referenceA = { item: 'A', componentId: 'topic-a', current: topicA.ModelDescription };

function snapshot(overrides: Partial<LocalStageAOutput> = {}): LocalStageAOutput {
  return {
    botId: 'synthetic-agent', botName: 'Workshop Agent', topicCount: 1,
    toolCount: 0, knowledgeCount: 0, testCaseCount: 0, localPatterns: [],
    topics: ['A'], topicComponents: [topicA], tools: [], knowledgeSources: [],
    orchestrationMode: 'generative', configurationAvailable: true, source: 'live',
    ...overrides,
  };
}

function evaluate(references: unknown[], source = snapshot(), overrides: Partial<Pattern> = {}): Pattern {
  const name = overrides.PatternName ?? 'Unclear Model Description';
  const result = validateStandardPatternEvaluation({
    Patterns: [{
      PatternId: 'synthetic-rule', PatternName: name, Status: false,
      Recommendation: 'Clarify the description.', ...overrides, Topics: references,
    }],
  }, source).Patterns.find(pattern => pattern.PatternName === name);
  if (!result) throw new Error('The expected synthetic rule was not returned.');
  return result;
}

describe('supplied Stage B evidence', () => {
  it('preserves an invented nested quote without manufacturing replacement proof', () => {
    const result = evaluate([{
      item: 'A', setting: 'Model description',
      evidence: { source: 'configuration', status: 'verified', quote: 'Invented text' },
    }]);
    expect(result.AssessmentStatus).toBe('not-assessed');
    expect(result.Topics[0]).toMatchObject({
      setting: 'Model description', evidence: { status: 'unverified', quote: 'Invented text' },
    });
    expect(result.Topics[0].current).toBeUndefined();
  });

  it.each([
    { current: 'Select workshops.', evidence: { source: 'configuration', status: 'verified', quote: 'Invented text' } },
    { current: 'Invented text', evidence: { source: 'configuration', status: 'verified', quote: 'Select workshops.' } },
    { current: 'Select workshops.', setting: 'Model-facing name' },
    { current: 'Select workshops.', evidence: { source: 'configuration', status: 'verified', setting: 'Model-facing name' } },
    { current: 'Select workshops.', evidence: { source: 'instructions', status: 'verified', quote: 'Select workshops.' } },
  ])('rejects contradictory supplied evidence fields together: %j', fields => {
    const result = evaluate([{ item: 'A', ...fields }]);
    expect(result.AssessmentStatus).toBe('not-assessed');
    expect(result.Topics[0].evidence?.status).toBe('unverified');
  });

  it('checks the actual quote rather than trusting the supplied verification label', () => {
    const result = evaluate([{
      item: 'A', setting: 'Model description',
      evidence: { source: 'configuration', status: 'unverified', quote: 'workshops', setting: 'Model description' },
    }]);
    expect(result.AssessmentStatus).toBe('fail');
    expect(result.Topics[0].evidence).toMatchObject({
      status: 'verified', quote: 'workshops', setting: 'Model description',
    });
  });

  it('rejects malformed nested evidence instead of discarding it', () => {
    expect(() => evaluate([{ item: 'A', evidence: { source: 'configuration', status: 'verified', quote: 7 } }]))
      .toThrow(/evidence/i);
  });

  it.each(['unassessed', 'unsupported', 'unavailable'] as const)(
    'does not retain an AI verification claim on the %s short-circuit path', kind => {
      const result = evaluate([{
        item: 'A', evidence: { source: 'configuration', status: 'verified', quote: 'Invented text' },
        assessmentStatus: 'fail', assessmentReason: 'Original reference reason.',
      }], snapshot({ configurationAvailable: kind !== 'unavailable' }), {
        ...(kind === 'unassessed' && { AssessmentStatus: 'not-assessed' }),
        ...(kind === 'unsupported' && { PatternName: 'Unsupported check' }),
      });
      expect(result.AssessmentStatus).toBe('not-assessed');
      expect(result.Topics[0].evidence).toMatchObject({ status: 'unverified', quote: 'Invented text' });
      expect(result.Topics[0].assessmentStatus).toBe('not-assessed');
      expect(result.Topics[0].assessmentReason).toContain('Original reference reason.');
    },
  );
});

describe('referenced Pass outcomes', () => {
  it.each([
    { item: 'A', componentId: 'wrong-id', current: 'Invented text' },
    { ...referenceA, current: 'Invented text' },
    { ...referenceA, evidence: { source: 'configuration', status: 'verified', quote: 'Invented text' } },
  ])('does not accept a Pass with inconsistent references: %j', reference => {
    expect(evaluate([reference], snapshot(), { Status: true }).AssessmentStatus).toBe('not-assessed');
  });

  it('retains a category-level Pass without invented references for a complete population', () => {
    expect(evaluate([], snapshot(), { Status: true })).toMatchObject({ AssessmentStatus: 'pass', Topics: [] });
    expect(evaluate([referenceA], snapshot(), { Status: true }).AssessmentStatus).toBe('pass');
  });

  it('does not award a referenced Pass for an incomplete population', () => {
    expect(evaluate([referenceA], snapshot({
      topicComponents: [topicA, { ...topicB, ParseStatus: 'unavailable' }],
    }), { Status: true }).AssessmentStatus).toBe('not-assessed');
  });

  it('still awards a Pass when the only unknown is one topic\'s routing role', () => {
    expect(evaluate([referenceA], snapshot({
      topicComponents: [topicA, {
        ...topicB,
        RoutingApplicability: {
          status: 'not-assessed',
          reason: 'A supported topic trigger is unavailable.',
          unclassifiedTrigger: true,
        },
      }],
    }), { Status: true }).AssessmentStatus).toBe('pass');
  });

  it('accepts the legacy topic-name rule without synthesizing a canonical duplicate', () => {    const patterns = validateStandardPatternEvaluation({
      Patterns: [{
        PatternId: 'legacy-topic-name',
        PatternName: 'Unclear Topic Name',
        Status: false,
        Recommendation: 'Clarify the topic name.',
        Topics: [{ item: 'A', componentId: 'topic-a', current: 'A' }],
      }],
    }, snapshot()).Patterns;
    expect(patterns.find(pattern => pattern.PatternName === 'Unclear Topic Name'))
      .toMatchObject({ AssessmentStatus: 'fail' });
    expect(patterns.some(pattern => pattern.PatternName === 'Unclear Model Name')).toBe(false);
  });

  it('treats alias and canonical names as one conservative duplicate check', () => {
    const patterns = validateStandardPatternEvaluation({
      Patterns: [
        {
          PatternId: 'legacy-topic-name',
          PatternName: 'Unclear Topic Name',
          Status: false,
          Recommendation: 'Clarify the legacy topic name.',
          Topics: [{ item: 'A', componentId: 'topic-a', current: 'A' }],
        },
        {
          PatternId: 'canonical-model-name',
          PatternName: 'Unclear Model Name',
          Status: false,
          Recommendation: 'Clarify the canonical model name.',
          Topics: [{ item: 'A', componentId: 'topic-a', current: topicA.ModelName }],
        },
      ],
    }, snapshot()).Patterns;
    expect(patterns.filter(pattern =>
      ['Unclear Topic Name', 'Unclear Model Name'].includes(pattern.PatternName))).toHaveLength(1);
    expect(patterns.find(pattern =>
      ['Unclear Topic Name', 'Unclear Model Name'].includes(pattern.PatternName)))
      .toMatchObject({ AssessmentStatus: 'not-assessed' });
  });
});

describe('routing inventory identity', () => {
  const tool = { name: 'Shared lookup', componentId: 'tool', description: 'Select workshops.', toolType: 'connector' as const };

  it.each(['childAgents', 'unknownComponents', 'entities', 'knowledgeDetails'] as const)(
    'does not resolve a name-only tool reference across a %s collision', field => {
      const source = snapshot({
        toolCount: 1, tools: [tool.name], toolDetails: [tool],
        [field]: [{ name: tool.name, componentId: 'other', description: tool.description, sourceType: 'Unknown' }],
      });
      expect(evaluate([{ item: tool.name }], source, { PatternName: 'Tool Routing Gap' }).AssessmentStatus)
        .toBe('not-assessed');
      expect(evaluate([{ item: tool.name, componentId: 'tool' }], source, { PatternName: 'Tool Routing Gap' }).AssessmentStatus)
        .toBe('fail');
    },
  );
});

describe('incoming per-reference outcomes', () => {
  const rules = ['Unclear Model Description', 'Tool Routing Gap', 'Overlapping Topic Descriptions'] as const;
  const source = snapshot({
    topicComponents: [topicA, topicB], toolCount: 1, tools: ['Tool A'],
    toolDetails: [{ name: 'Tool A', componentId: 'tool-a', toolType: 'connector', description: 'Do stuff.' }],
  });
  const references = (name: string, metadata: Record<string, unknown>) => name === 'Tool Routing Gap'
    ? [{ item: 'Tool A', componentId: 'tool-a', current: 'Do stuff.', ...metadata }]
    : [{ ...referenceA, ...metadata }, ...(name === 'Overlapping Topic Descriptions'
      ? [{ item: 'B', componentId: 'topic-b', current: topicB.ModelDescription }] : [])];
  const incompleteCases = rules.flatMap(name => [true, false].flatMap(Status =>
    ['not-assessed', 'not-applicable', 'future-outcome', null, false].map(assessmentStatus =>
      ({ name, Status, assessmentStatus }))));

  it.each(incompleteCases)('never completes explicitly unassessed or invalid reference metadata: %j', example => {
    const reason = '  This reference was not evaluated.\n';
    const result = evaluate(references(example.name, {
      assessmentStatus: example.assessmentStatus, assessmentReason: reason,
    }), source, { PatternName: example.name, Status: example.Status });
    expect(result.AssessmentStatus).toBe('not-assessed');
    expect(result.Topics[0].assessmentStatus).toBe('not-assessed');
    expect(result.Topics[0].assessmentReason).toContain(reason);
    if (example.name === 'Overlapping Topic Descriptions') {
      expect(result.Topics.every(topic => topic.assessmentStatus === 'not-assessed')).toBe(true);
    }
    expect(summarizePatternAssessments([result]).completed).toBe(0);
  });

  it.each(rules)('checks identity and evidence for completed references in %s', name => {
    const result = evaluate(references(name, {
      assessmentStatus: 'fail', assessmentReason: 'Clarify this description.',
      componentId: 'wrong-id', current: 'Invented text',
    }), source, { PatternName: name });
    expect(result.AssessmentStatus).toBe('not-assessed');
    expect(result.Topics[0].assessmentStatus).toBe('not-assessed');
    expect(result.Topics[0].assessmentReason).toContain('Clarify this description.');
  });

  it.each(rules)('preserves legacy outcomes without reference assessment fields in %s', name => {
    expect(evaluate(references(name, {}), source, { PatternName: name }).AssessmentStatus).toBe('fail');
    expect(evaluate(references(name, {}), source, { PatternName: name, Status: true }).AssessmentStatus).toBe('pass');
  });

  it.each([{ assessmentReason: 'Only a reason was returned.' }, { assessmentStatus: 'pass', assessmentReason: 42 }])(
    'does not complete partial or unreadable reference metadata: %j', metadata => {
      const result = evaluate([{ ...referenceA, ...metadata }], snapshot(), { Status: true });
      expect(result.AssessmentStatus).toBe('not-assessed');
      if (typeof metadata.assessmentReason === 'string') {
        expect(result.Topics[0].assessmentReason).toContain(metadata.assessmentReason);
      }
    },
  );

  it('does not convert a parent Fail to Pass when its only completed reference says Pass', () => {
    const result = evaluate([{ ...referenceA, assessmentStatus: 'pass', assessmentReason: 'This item passed.' }]);
    expect(result.AssessmentStatus).toBe('not-assessed');
    expect(result.Topics[0].assessmentReason).toContain('This item passed.');
  });

  it('keeps a completed passing reference beside a separate confirmed failure', () => {
    const result = evaluate([
      referenceA,
      { item: 'B', current: topicB.ModelDescription, assessmentStatus: 'pass', assessmentReason: 'This item passed.' },
    ], source);
    expect(result.AssessmentStatus).toBe('fail');
    expect(result.Topics.map(topic => topic.assessmentStatus)).toEqual(['fail', 'pass']);
    expect(result.Topics[1].assessmentReason).toContain('This item passed.');
  });

  it('does not award a Pass when a completed reference contradicts the category Pass', () => {
    const result = evaluate([{ ...referenceA, assessmentStatus: 'fail', assessmentReason: 'Clarify this item.' }], source, { Status: true });
    expect(result.AssessmentStatus).toBe('not-assessed');
    expect(result.Topics[0].assessmentStatus).toBe('not-assessed');
    expect(result.Topics[0].assessmentReason).toContain('Clarify this item.');
  });

  it('retains valid independent routing advice beside an ambiguous name-only reference', () => {
    const routingSource = snapshot({
      tools: ['Tool A', 'Shared'], toolCount: 2,
      toolDetails: [
        { name: 'Tool A', componentId: 'tool-a', toolType: 'connector', description: 'Do stuff.' },
        { name: 'Shared', componentId: 'tool-b', toolType: 'connector', description: 'Shared purpose.' },
      ],
      childAgents: [{ name: 'Shared', componentId: 'child-b', description: 'Shared purpose.' }],
    });
    const first = { item: 'Tool A', componentId: 'tool-a', current: 'Do stuff.' };
    expect(evaluate([first], routingSource, { PatternName: 'Tool Routing Gap' }).AssessmentStatus).toBe('fail');
    const result = evaluate([first, { item: 'Shared' }], routingSource, { PatternName: 'Tool Routing Gap' });
    expect(result.AssessmentStatus).toBe('fail');
    expect(result.Topics.map(topic => topic.assessmentStatus)).toEqual(['fail', 'not-assessed']);
    expect(result.Topics[1].evidence?.status).toBe('unverified');
  });

  it.each([
    {
      Status: false,
      Topics: [{ item: 'Unknown classic topic' }],
    },
    {
      Status: false,
      Topics: [{ item: 'A', assessmentStatus: 'not-assessed', assessmentReason: 'Legacy runner did not complete this row.' }],
    },
    {
      Status: true,
      Topics: [],
    },
  ])('retains legacy trigger-phrase rows without asserting a completed outcome: %j', example => {
    const result = evaluate(example.Topics, snapshot({
      orchestrationMode: 'classic',
      topicComponents: [{ ...topicA, TriggerKind: 'OnRecognizedIntent' }],
    }), { PatternName: 'Missing Trigger Phrases', Status: example.Status });
    expect(result.AssessmentStatus).toBe('not-assessed');
    expect(result.Status).toBe(false);
    expect(result.Topics.every(topic => topic.assessmentStatus === 'not-assessed')).toBe(true);
  });
});

describe('independent partial topic findings', () => {
  it('does not reject a readable model name because separate description metadata is unreadable', () => {
    const result = evaluate([{ item: 'A', current: topicA.ModelName }], snapshot({
      topicComponents: [{ ...topicA, ModelDescriptionStatus: 'unavailable' }],
    }), { PatternName: 'Unclear Model Name' });
    expect(result.AssessmentStatus).toBe('fail');
    expect(result.Topics[0].evidence?.status).toBe('verified');
  });

  it.each(['unavailable', 'excluded', 'unmatched', 'unverified'] as const)(
    'keeps an established failure beside a separate %s reference', kind => {
      const source = snapshot({ topicComponents: [
        topicA, {
          ...topicB, ...(kind === 'unavailable' && { ParseStatus: 'unavailable' }),
          ...(kind === 'excluded' && { RoutingApplicability: { status: 'not-applicable', reason: 'Explicit event.' } }),
        },
      ] });
      const second = { item: kind === 'unmatched' ? 'Unknown' : 'B', current: kind === 'unverified' ? 'Invented text' : topicB.ModelDescription };
      expect(evaluate([referenceA], source).AssessmentStatus).toBe('fail');
      const result = evaluate([referenceA, second], source);
      expect(result.AssessmentStatus).toBe('fail');
      expect(result.Topics).toHaveLength(2);
      expect(result.Topics[0]).toMatchObject({ assessmentStatus: 'fail', evidence: { status: 'verified' } });
      expect(result.Topics[1]).toMatchObject({ assessmentStatus: kind === 'excluded' ? 'not-applicable' : 'not-assessed' });
      if (kind !== 'excluded') expect(result.Topics[1].evidence?.status).not.toBe('verified');
    },
  );

  it('preserves an independently confirmed variable failure', () => {
    const result = evaluate([
      { item: 'A', variable: 'seats', current: 'Required workshop seats.' },
      { item: 'B', variable: 'seats', current: 'Invented text' },
    ], snapshot({ topicComponents: [topicA, topicB] }), { PatternName: 'Unclear Input Variable Description' });
    expect(result.AssessmentStatus).toBe('fail');
    expect(result.Topics[0]).toMatchObject({ assessmentStatus: 'fail' });
    expect(result.Topics[1]).toMatchObject({ assessmentStatus: 'not-assessed' });
  });

  it('does not split an overlap pair with an unreadable member into a confirmed failure', () => {
    const source = snapshot({ topicComponents: [topicA, { ...topicB, ParseStatus: 'unavailable' }] });
    expect(evaluate([referenceA, { item: 'B' }], source, { PatternName: 'Overlapping Topic Descriptions' }).AssessmentStatus)
      .toBe('not-assessed');
  });
});

describe('model-facing name evidence', () => {
  const nameReference = {
    item: 'A', componentId: 'topic-a', setting: 'Model-facing name', current: topicA.ModelName,
  };

  it('verifies a model-name finding bound to the model-facing name setting', () => {
    const result = evaluate([nameReference], snapshot(), { PatternName: 'Unclear Model Name' });
    expect(result.AssessmentStatus).toBe('fail');
    expect(result.Topics[0]).toMatchObject({
      setting: 'Model-facing name', assessmentStatus: 'fail',
    });
  });

  it('refuses a model-name finding mislabelled as the model description', () => {
    const result = evaluate(
      [{ ...nameReference, setting: 'Model description' }],
      snapshot(), { PatternName: 'Unclear Model Name' },
    );
    expect(result.AssessmentStatus).toBe('not-assessed');
  });
});
