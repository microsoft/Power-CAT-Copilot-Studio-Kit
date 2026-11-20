import { describe, expect, it, vi } from 'vitest';
import { StageAService } from '../StageAService';
import { makeResource, makeTopic, syntheticBot } from './stageAFixtures';
import { parseStandardComponents } from '../../utils/stageAParser';
import { getTopicRuleScope } from '../../utils/topicApplicability';

vi.mock('../BotService', () => ({ botService: {} }));

const generativeBot = {
  ...syntheticBot, configuration: JSON.stringify({ settings: { GenerativeActionsEnabled: true } }),
};

describe('evaluation population completeness', () => {
  it.each([
    { count: 9, incomplete: true, source: 'live', expected: 'not-assessed' },
    { count: 9, incomplete: false, source: 'live', expected: 'fail' },
    { count: 10, incomplete: true, source: 'live', expected: 'pass' },
    { count: 9, incomplete: true, source: 'zip', expected: 'not-applicable' },
  ] as const)('uses a lower bound only when it establishes the required minimum: %j', example => {
    const components = Array.from({ length: example.count }, (_, index) => makeResource(`Evaluation ${index}`, {
      kind: 'EvaluationData', rows: [{ input: `Find workshop ${index}.` }],
    }));
    if (example.incomplete) {
      const first = makeResource('Conflicting evaluation', { kind: 'EvaluationData', rows: [{ input: 'First request.' }] });
      components.push(first, {
        ...first, data: makeResource('Conflicting evaluation', { kind: 'EvaluationData', rows: [{ input: 'Different request.' }] }).data,
      });
    }
    const parsed = parseStandardComponents(components, syntheticBot.botId, syntheticBot.name, 'generative', example.source);
    expect(parsed.testCaseCount).toBe(example.count);
    expect(parsed.unknownComponents).toHaveLength(example.incomplete ? 1 : 0);
    expect(new StageAService().generateLocalPatterns(parsed).find(pattern => pattern.patternName === 'Inadequate Test Cases'))
      .toMatchObject({ assessmentStatus: example.expected, status: example.expected === 'pass' });
  });
});

it('preserves a populated legacy declared description in both input and output extraction', async () => {
  const declared = '  Declared seat guidance.\n';
  const variable = { name: 'seats', description: ' ', VariableDescription: declared };
  const result = await new StageAService().executeStageAFromData(generativeBot, [makeTopic({
    inputType: undefined, inputVariables: [variable],
    outputType: undefined, outputVariables: [variable],
    inputs: [{ kind: 'AutomaticTaskInput', propertyName: 'seats', description: 'Binding guidance.' }],
  })]);
  expect(result.topicComponents[0].InputVariables?.[0].VariableDescription).toBe(declared);
  expect(result.topicComponents[0].OutputVariables?.[0].VariableDescription).toBe(declared);
});

describe('child-agent population completeness', () => {
  it('does not assume generative orchestration for a legacy helper input with no mode', () => {
    const parsed = parseStandardComponents([
      makeResource('Workshop child', { kind: 'AgentDialog', beginDialog: { description: 'Handle workshops.' } }),
    ], syntheticBot.botId, syntheticBot.name, 'generative', 'zip');
    const patterns = new StageAService().generateLocalPatterns({ ...parsed, orchestrationMode: undefined });
    expect(patterns.find(pattern => pattern.patternName === 'Missing Child Agent Description')?.assessmentStatus)
      .toBe('not-assessed');
  });

  it.each([
    { count: 1, description: 'Handle workshop requests.', unknown: 6, classic: false, expected: ['not-assessed', 'not-assessed'] },
    { count: 1, description: '', unknown: 6, classic: false, expected: ['fail', 'not-assessed'] },
    { count: 6, description: 'Handle workshop requests.', unknown: 1, classic: false, expected: ['not-assessed', 'fail'] },
    { count: 6, description: '', unknown: 1, classic: false, expected: ['fail', 'fail'] },
    { count: 0, description: '', unknown: 1, classic: false, expected: ['not-assessed', 'not-assessed'] },
    { count: 1, description: '', unknown: 1, classic: true, expected: ['not-applicable', 'not-assessed'] },
    { count: 1, description: 'Handle workshop requests.', unknown: 0, classic: false, expected: ['pass', 'pass'] },
  ])('retains proved outcomes without treating unknown records as passed: %j', async example => {
    const components = [
      ...Array.from({ length: example.count }, (_, index) => makeResource(`Workshop child ${index}`, {
        kind: 'AgentDialog', beginDialog: { description: example.description },
      })),
      ...Array.from({ length: example.unknown }, (_, index) =>
        makeResource(`Unknown workshop resource ${index}`, 'kind: [invalid')),
    ];
    const metadata = example.classic
      ? { ...generativeBot, configuration: '{"settings":{"GenerativeActionsEnabled":false}}' } : generativeBot;
    const result = await new StageAService().executeStageAFromData(metadata, components);

    expect(result.unknownComponents).toHaveLength(example.unknown);
    expect(result.localPatterns.filter(pattern => [
      'Missing Child Agent Description', 'Child Agent Architecture Sprawl',
    ].includes(pattern.patternName)).map(pattern => pattern.assessmentStatus)).toEqual(example.expected);
  });
});

describe('standard topic rule applicability', () => {
  it.each([
    'OnEventActivity', 'OnActivity', 'OnRedirect', 'OnGeneratedResponse',
    'OnOutgoingMessage', 'OnConversationStart', 'OnError',
    'OnEscalate', 'OnSignIn', 'OnSignOut',
  ])('does not apply AI selection rules to %s, regardless of the topic name', async kind => {
    for (const name of ['Workshop Lookup', 'Greeting']) {
      const result = await new StageAService().executeStageAFromData(generativeBot, [makeTopic({
        modelDisplayName: undefined, modelDescription: undefined,
        beginDialog: { kind, id: 'main', actions: [] },
      }, name)]);
      expect(result.topicComponents[0].TopicName).toBe(name);
      expect(result.topicComponents[0].RoutingApplicability?.status).toBe('not-applicable');
      expect(result.localPatterns.find(p => p.patternName === 'Missing Model Description'))
        .toMatchObject({ status: false, assessmentStatus: 'not-applicable', topics: [] });
    }
  });

  it('retains a real missing generative selection description, including on a renamed default topic', async () => {
    const result = await new StageAService().executeStageAFromData(generativeBot, [
      makeTopic({ modelDescription: '   ' }, 'Greeting'),
    ]);
    expect(result.localPatterns.find(p => p.patternName === 'Missing Model Description'))
      .toMatchObject({ status: false, assessmentStatus: 'fail', topics: ['Greeting'] });
  });

  it.each([
    ['Greeting', ['hello', 'hi', 'good morning']],
    ['Thank you', ['thank you', 'thanks', 'much appreciated']],
    ['Goodbye', ['goodbye', 'bye', 'have a great day']],
    ['Start Over', ['start over', 'restart', "let's begin again"]],
  ])('excludes the built-in %s topic from model-description findings', async (name, triggerQueries) => {
    const result = await new StageAService().executeStageAFromData(generativeBot, [
      makeTopic({ modelDescription: ' ', triggerQueries }, name),
    ]);
    expect(result.localPatterns.find(p => p.patternName === 'Missing Model Description'))
      .toMatchObject({ status: true, assessmentStatus: 'pass', topics: [] });
  });

  it('recognizes the built-in Goodbye topic when standard trigger phrases contain minor variants', async () => {
    const result = await new StageAService().executeStageAFromData(generativeBot, [
      makeTopic({
        modelDescription: ' ',
        triggerQueries: [
          'Bye',
          'Bye for now',
          'Bye now',
          'Good bye',
          'No thank you. Goodbye.',
          'See you later',
        ],
      }, 'Goodbye'),
    ]);

    expect(result.localPatterns.find(p => p.patternName === 'Missing Model Description'))
      .toMatchObject({ status: true, assessmentStatus: 'pass', topics: [] });
  });

  it('keeps standard system topics from poisoning deterministic model checks', async () => {
    const result = await new StageAService().executeStageAFromData(generativeBot, [
      makeTopic({
        modelDisplayName: undefined, modelDescription: undefined,
        beginDialog: { kind: 'OnEscalate', id: 'main', actions: [] },
      }, 'Escalate'),
      makeTopic({
        modelDisplayName: undefined, modelDescription: undefined,
        beginDialog: { kind: 'OnSignIn', id: 'main', actions: [] },
      }, 'Sign in '),
      makeTopic({
        modelDisplayName: undefined, modelDescription: undefined,
        triggerQueries: ['Good morning', 'Hello', 'Hi'],
      }, 'Greeting'),
    ]);

    expect(result.localPatterns.find(p => p.patternName === 'Missing Model Name'))
      .toMatchObject({ assessmentStatus: 'pass', status: true, topics: [] });
    expect(result.localPatterns.find(p => p.patternName === 'Missing Model Description'))
      .toMatchObject({ assessmentStatus: 'pass', status: true, topics: [] });
  });

  it('keeps a custom Goodbye topic reviewable when only its name and one trigger match', async () => {
    const result = await new StageAService().executeStageAFromData(generativeBot, [
      makeTopic({
        modelDescription: ' ',
        triggerQueries: ['Bye', 'Close my workshop registration'],
      }, 'Goodbye'),
    ]);

    expect(result.localPatterns.find(p => p.patternName === 'Missing Model Description'))
      .toMatchObject({ status: false, assessmentStatus: 'fail', topics: ['Goodbye'] });
  });

  it('matches system topics by component ID when a custom topic has the same name', async () => {
    const components = [
      makeTopic({ modelDescription: ' ', triggerQueries: ['goodbye', 'bye', 'have a great day'] }, 'Goodbye'),
      {
        ...makeTopic({ modelDescription: ' ', triggerQueries: ['Bye', 'Close my workshop registration'] }, 'Goodbye'),
        botcomponentid: 'component-custom-goodbye',
        componentidunique: 'unique-custom-goodbye',
        schemaname: 'synthetic_workshopagent.topic.CustomGoodbye',
      },
    ];
    const result = await new StageAService().executeStageAFromData(generativeBot, components);
    const pattern = result.localPatterns.find(p => p.patternName === 'Missing Model Description');

    expect(pattern).toMatchObject({ status: false, assessmentStatus: 'fail', topics: ['Goodbye'] });
    expect(pattern?.affectedItems?.map(item => item.componentId)).toEqual(['component-custom-goodbye']);
    expect(pattern?.assessmentReason ?? '').not.toContain('could not be confirmed');

    // Legacy name-only claims cannot tell the two topics apart, so they must not pass.
    const parsed = parseStandardComponents(components, syntheticBot.botId, syntheticBot.name, 'generative', 'zip');
    expect(new StageAService().generateLocalPatterns({ ...parsed, missingFieldEvidence: undefined })
      .find(p => p.patternName === 'Missing Model Description'))
      .toMatchObject({ status: false, assessmentStatus: 'not-assessed', topics: [] });
  });

  it('excludes a uniquely named standard topic from legacy name-only claims', () => {
    const parsed = parseStandardComponents([
      makeTopic({ modelDescription: ' ', triggerQueries: ['goodbye', 'bye', 'have a great day'] }, 'Goodbye'),
    ], syntheticBot.botId, syntheticBot.name, 'generative', 'zip');

    expect(new StageAService().generateLocalPatterns({ ...parsed, missingFieldEvidence: undefined })
      .find(p => p.patternName === 'Missing Model Description'))
      .toMatchObject({ status: true, assessmentStatus: 'pass', topics: [], affectedItems: [] });
  });

  it('does not infer generative applicability from an existing description', async () => {
    const classic = { ...generativeBot, configuration: '{"settings":{"GenerativeActionsEnabled":false}}' };
    const result = await new StageAService().executeStageAFromData(classic, [makeTopic()]);
    expect(result.orchestrationMode).toBe('classic');
    expect(result.topicComponents[0].RoutingApplicability?.status).toBe('not-applicable');
  });

  it.each(['', '{}', '{"settings":{"GenerativeActionsEnabled":"true"}}', 'not json'])(
    'keeps unknown orchestration unassessed for configuration %s', async configuration => {
      const result = await new StageAService().executeStageAFromData(
        { ...generativeBot, configuration }, [makeTopic()],
      );
      expect(result.orchestrationMode).toBe('unknown');
      expect(result.localPatterns.find(p => p.patternName === 'Missing Model Description')?.assessmentStatus)
        .toBe('not-assessed');
    },
  );

  it.each([undefined, { kind: 'FutureTrigger' }, { kind: 42 }, []])(
    'marks unreadable or unknown trigger metadata Not assessed', async beginDialog => {
      const result = await new StageAService().executeStageAFromData(generativeBot, [makeTopic({ beginDialog })]);
      expect(result.localPatterns.find(p => p.patternName === 'Missing Model Description')?.assessmentStatus)
        .toBe('not-assessed');
    },
  );

  it('uses the component authoring name when the optional model-name override is absent', async () => {
    const result = await new StageAService().executeStageAFromData(generativeBot, [
      makeTopic({ modelDisplayName: undefined }),
    ]);
    expect(result.topicComponents[0].TopicName).toBe('Workshop Lookup');
    expect(result.topicComponents[0].ModelName).toBe('Workshop Lookup');
    expect(result.localPatterns.find(p => p.patternName === 'Missing Model Name'))
      .toMatchObject({ assessmentStatus: 'pass', status: true, topics: [] });
  });

  it('fails a confirmed blank model-name override without hiding it behind the component name', async () => {
    const result = await new StageAService().executeStageAFromData(generativeBot, [
      makeTopic({ modelDisplayName: ' ' }),
    ]);
    expect(result.localPatterns.find(p => p.patternName === 'Missing Model Name'))
      .toMatchObject({ assessmentStatus: 'fail', status: false, topics: ['Workshop Lookup'] });
    expect(getTopicRuleScope(result.topicComponents[0], 'Unclear Model Name').status)
      .toBe('not-applicable');
  });

  it('uses the component description only when the optional model-description override is absent', async () => {
    const fallback = await new StageAService().executeStageAFromData(generativeBot, [{
      ...makeTopic({ modelDescription: undefined }),
      description: 'Find workshops using the requested location and capacity.',
    }]);
    expect(fallback.topicComponents[0].ModelDescription)
      .toBe('Find workshops using the requested location and capacity.');
    expect(fallback.localPatterns.find(p => p.patternName === 'Missing Model Description'))
      .toMatchObject({ assessmentStatus: 'pass', status: true });

    const explicitBlank = await new StageAService().executeStageAFromData(generativeBot, [{
      ...makeTopic({ modelDescription: ' ' }),
      description: 'A stale component-column description.',
    }]);
    expect(explicitBlank.localPatterns.find(p => p.patternName === 'Missing Model Description'))
      .toMatchObject({ assessmentStatus: 'fail', status: false, topics: ['Workshop Lookup'] });
  });

  it('keeps malformed model metadata and unreadable YAML visible without successful outcomes', async () => {
    const topic = makeTopic({ modelDisplayName: [], modelDescription: 42 });
    const result = await new StageAService().executeStageAFromData(generativeBot, [
      topic, { ...makeTopic({}, 'Unreadable Workshop'), content: 'kind: [invalid' },
    ]);
    expect(result.parsingErrors?.length).toBeGreaterThan(0);
    expect(result.localPatterns.find(p => p.patternName === 'Missing Model Description')?.assessmentStatus)
      .not.toBe('pass');
    expect(result.localPatterns.find(p => p.patternName === 'Missing Model Name')?.assessmentStatus)
      .toBe('not-assessed');
  });

  it('attaches missing-field evidence to the exact component when topic names repeat', async () => {
    const first = makeTopic({ inputType: { properties: { code: { displayName: 'Code', description: 'An existing code.' } } } });
    const second = {
      ...makeTopic({ inputType: { properties: { code: { displayName: 'Code' } } } }),
      botcomponentid: 'second-component', componentidunique: 'second-unique', schemaname: 'synthetic.second',
    };
    const result = await new StageAService().executeStageAFromData(generativeBot, [first, second]);
    expect(result.localPatterns.find(p => p.patternName === 'Missing Input Variable Description')?.affectedItems)
      .toEqual([expect.objectContaining({
        componentId: 'second-component', schemaName: 'synthetic.second', variable: 'code', current: '',
      })]);
  });

  it('does not select an arbitrary conflicting component layer or count identical duplicates twice', async () => {
    const component = makeTopic();
    const service = new StageAService();
    const identical = await service.executeStageAFromData(generativeBot, [component, { ...component }]);
    expect(identical.topicCount).toBe(1);
    const conflicting = await service.executeStageAFromData(generativeBot, [
      component, { ...component, content: makeTopic({ modelDescription: 'A different saved layer.' }).content },
    ]);
    expect(conflicting.topicCount).toBe(0);
    expect(conflicting.unknownComponents).toHaveLength(1);
    expect(conflicting.localPatterns.find(p => p.patternName === 'Missing Model Description')?.assessmentStatus)
      .toBe('not-assessed');
  });

  it('retains data-column precedence for tools and preserves descriptions stored on the component', async () => {
    const result = await new StageAService().executeStageAFromData(generativeBot, [{
      ...makeTopic(), componenttype: '9', description: 'Find available workshops.',
      data: 'kind: TaskDialog\nmodelDescription: " "\naction:\n  kind: InvokeExternalAgentTaskAction\n',
    }]);
    expect(result.topicCount).toBe(0);
    expect(result.toolCount).toBe(1);
    expect(result.toolDetails?.[0]).toMatchObject({ toolType: 'mcp', description: 'Find available workshops.' });
    expect(result.connectedAgents).toEqual([]);
  });

  it.each([null, { properties: null }, []])('does not call unreadable variable declarations N/A: %s', async inputType => {
    const result = await new StageAService().executeStageAFromData(generativeBot, [
      makeTopic({ inputType, inputVariables: undefined, inputs: undefined }),
    ]);
    expect(result.localPatterns.find(p => p.patternName === 'Missing Input Variable Description')?.assessmentStatus)
      .toBe('not-assessed');
  });

  it('treats explicit empty declarations as complete zero-variable metadata', async () => {
    const result = await new StageAService().executeStageAFromData(generativeBot, [
      makeTopic({
        inputType: {},
        outputType: {},
        inputVariables: undefined,
        outputVariables: undefined,
        inputs: undefined,
      }),
    ]);
    expect(result.topicComponents[0]).toMatchObject({
      InputVariables: [],
      OutputVariables: [],
      InputVariablesStatus: 'complete',
      OutputVariablesStatus: 'complete',
    });
    expect(result.localPatterns.find(p => p.patternName === 'Missing Input Variable Description')?.assessmentStatus)
      .toBe('not-applicable');
    expect(result.localPatterns.find(p => p.patternName === 'Missing Output Variable Description')?.assessmentStatus)
      .toBe('not-applicable');
  });

  it('retains a supported legacy declaration when the modern declaration is absent', async () => {
    const result = await new StageAService().executeStageAFromData(generativeBot, [makeTopic({
      inputType: {}, inputVariables: { legacyCode: { displayName: 'Legacy code', description: 'A supported legacy code.' } },
    })]);
    expect(result.topicComponents[0].InputVariables)
      .toEqual([{ VariableName: 'legacyCode', VariableDescription: 'A supported legacy code.' }]);
  });

  it('keeps a readable legacy declaration visible when a second declaration source is malformed', async () => {
    const result = await new StageAService().executeStageAFromData(generativeBot, [makeTopic({
      inputType: [],
      inputVariables: { legacyCode: { displayName: 'Legacy code', description: 'A supported legacy code.' } },
    })]);
    expect(result.topicComponents[0].InputVariables)
      .toEqual([{ VariableName: 'legacyCode', VariableDescription: 'A supported legacy code.' }]);
    expect(result.topicComponents[0].InputVariablesStatus).toBe('unavailable');
    expect(result.localPatterns.find(p => p.patternName === 'Missing Input Variable Description')?.assessmentStatus)
      .toBe('not-assessed');
  });

  it.each(['', '{}', 'kind: [unreadable'])('does not produce passing checks from wholly unreadable content: %s', async content => {
    const result = await new StageAService().executeStageAFromData(generativeBot, [{ ...makeTopic(), content }]);
    expect(result.configurationAvailable).toBe(false);
    expect(result.localPatterns.every(p => p.assessmentStatus !== 'pass')).toBe(true);
  });

  it('retains content-column precedence for topic snapshots when both columns are supplied', async () => {
    const contentTopic = makeTopic({ modelDescription: 'The existing topic description.' });
    const dataTopic = makeTopic({ modelDescription: 'A different data-column value.' });
    const result = await new StageAService().executeStageAFromData(generativeBot, [{
      ...contentTopic, data: dataTopic.content,
    }]);
    expect(result.topicComponents[0].ModelDescription).toBe('The existing topic description.');
  });

  it('keeps input-level evidence and excludes unavailable ZIP evaluation coverage', async () => {
    const result = await new StageAService().executeStageAFromData(generativeBot, [makeTopic()]);
    expect(result.localPatterns.find(p => p.patternName === 'Missing Input Variable Description')?.affectedItems)
      .toEqual([expect.objectContaining({
        item: 'Workshop Lookup', variable: 'workshopCode',
        evidence: expect.objectContaining({ source: 'configuration', status: 'verified' }),
      })]);
    expect(result.localPatterns.find(p => p.patternName === 'Inadequate Test Cases'))
      .toMatchObject({ status: false, assessmentStatus: 'not-applicable' });
  });

  it('extracts agent instructions only from agent instruction metadata', async () => {
    const result = await new StageAService().executeStageAFromData(generativeBot, [
      { ...makeTopic({}, 'Trigger metadata'), componenttype: '5', content: '',
        data: 'kind: ExternalTriggerConfiguration\ninstructions: Test-only trigger guidance.\n' },
      { ...makeTopic({}, 'Agent instruction metadata'), componenttype: '15', content: '',
        data: 'kind: GptComponentMetadata\ninstructions: Help users find workshops.\n' },
    ]);
    expect(result.agentInstructions).toBe('Help users find workshops.');
  });

  it('retains Variable identities in a separate configuration inventory without blocking completeness', async () => {
    const result = await new StageAService().executeStageAFromData(generativeBot, [
      makeResource('Session variable', {
        kind: 'Variable',
        name: 'sessionState',
        scope: 'User',
        initializationType: 'String',
        isInput: true,
        isOutput: false,
      }),
    ]);
    expect(result.configurationComponents).toEqual([
      expect.objectContaining({ name: 'Session variable', kind: 'Variable' }),
    ]);
    expect(result.unknownComponents).toEqual([]);
    expect(result.toolCount).toBe(0);
    expect(result.localPatterns.find(p => p.patternName === 'Excessive Tools Usage')?.assessmentStatus).toBe('pass');
  });

  it('keeps connected targets, child agents, tools, entities, and knowledge in separate inventories', async () => {
    const resource = (name: string, data: string, componenttype = '9') => ({
      ...makeTopic({}, name), content: '', data, componenttype,
    });
    const result = await new StageAService().executeStageAFromData(generativeBot, [
      makeTopic(),
      resource('Workshop tool', 'kind: TaskDialog\naction:\n  kind: InvokeConnectorTaskAction\n'),
      resource('Workshop connection', 'kind: TaskDialog\naction:\n  kind: InvokeConnectedAgentTaskAction\n  botSchemaName: synthetic.helper\n  botId: helper-target\n'),
      resource('Workshop child', 'kind: AgentDialog\nbeginDialog:\n  description: Handle workshop details.\n'),
      resource('Workshop entity', 'kind: RegexEntity\npattern: "[A-Z]+"\n', '3'),
      resource('Workshop knowledge', 'kind: KnowledgeSourceConfiguration\nsource:\n  kind: WebSource\n  url: https://workshops.example\n', '16'),
    ]);
    expect(result).toMatchObject({ topicCount: 1, toolCount: 1, knowledgeCount: 1 });
    expect(result.connectedAgents).toEqual([expect.objectContaining({ targetSchemaName: 'synthetic.helper', targetId: 'helper-target' })]);
    expect(result.childAgents).toHaveLength(1);
    expect(result.entities).toHaveLength(1);
    expect(result.knowledgeDetails?.[0].componentId).toBeTruthy();
    expect(result.unknownComponents).toEqual([]);
  });
});
