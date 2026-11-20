import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotComponent } from '../../contracts/ServiceContracts';
import { buildStandardReviewWorkflowCorpus } from '../../utils/standardReviewCorpus';
import { inputDescription, makeResource, makeTopic, syntheticBot } from './stageAFixtures';

const { getBotMetadata, getBotComponents, predict } = vi.hoisted(() => ({
  getBotMetadata: vi.fn(),
  getBotComponents: vi.fn(),
  predict: vi.fn(),
}));

vi.mock('../BotService', () => ({
  botService: { getBotMetadata, getBotComponents },
}));

vi.mock('../../../../generated/services/MicrosoftDataverseService', () => ({
  MicrosoftDataverseService: { PerformBoundActionWithOrganization: predict },
}));

import { StageAService } from '../StageAService';
import { UNSUPPORTED_HARNESS_MESSAGE } from '../../agents-experience/services/detection';

describe('Stage A standard input description extraction', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each(['content', 'data'] as const)(
    'reads a bound description from %s while retaining a truly missing description',
    async (field) => {
      const topic = makeTopic();
      const component = { ...topic, content: '', [field]: topic.content };
      const result = await new StageAService().executeStageAFromData(syntheticBot, [component]);

      expect(result.topicComponents[0].InputVariables).toEqual([
        { VariableName: 'minimumSeats', VariableDescription: inputDescription },
        { VariableName: 'workshopCode', VariableDescription: undefined },
      ]);
      expect(result.localPatterns.find(p => p.patternName === 'Missing Input Variable Description'))
        .toMatchObject({
          status: false,
          description: '1 input variable(s) are missing a description across 1 topic(s)',
          topics: ['Workshop Lookup'],
        });
      expect(result.localPatterns.find(p => p.patternName === 'Missing Input Variable Name')?.status)
        .toBe(true);
    },
  );

  it('uses the same extraction in the live entry path with mocked data access', async () => {
    const components = [makeTopic()];
    getBotMetadata.mockResolvedValue(syntheticBot);
    getBotComponents.mockResolvedValue(components);
    const service = new StageAService();

    const live = await service.executeStageA(syntheticBot.botId, null);
    const fromData = await service.executeStageAFromData(syntheticBot, components);

    expect(getBotMetadata).toHaveBeenCalledWith(syntheticBot.botId, null);
    expect(getBotComponents).toHaveBeenCalledWith(syntheticBot.botId, null, { throwOnError: true });
    expect(live.topicComponents).toEqual(fromData.topicComponents);
    // Both paths share extraction. A ZIP does not establish live evaluation coverage.
    expect(live.localPatterns.filter(p => p.patternName !== 'Inadequate Test Cases'))
      .toEqual(fromData.localPatterns.filter(p => p.patternName !== 'Inadequate Test Cases'));
    expect(live.localPatterns.find(p => p.patternName === 'Inadequate Test Cases')?.assessmentStatus).toBe('fail');
    expect(fromData.localPatterns.find(p => p.patternName === 'Inadequate Test Cases')?.assessmentStatus).toBe('not-applicable');
    expect(live.topicComponents[0].InputVariables?.[0].VariableDescription).toBe(inputDescription);
  });

  it('passes the category when every declared input has a description', async () => {
    const result = await new StageAService().executeStageAFromData(syntheticBot, [makeTopic({
      inputType: {
        properties: {
          minimumSeats: { displayName: 'Minimum seats', type: 'Number' },
        },
      },
    })]);

    expect(result.localPatterns.find(p => p.patternName === 'Missing Input Variable Description'))
      .toMatchObject({
        status: true,
        description: 'All input variables have descriptions defined.',
        topics: [],
      });
  });

  it('forwards the exact input-variable description into the review snapshot', async () => {
    const stageA = await new StageAService().executeStageAFromData(syntheticBot, [makeTopic()]);

    expect(stageA).toMatchObject({
      orchestrationMode: 'generative',
      topicComponents: [{
        TopicName: 'Workshop Lookup',
        InputVariables: [
          { VariableName: 'minimumSeats', VariableDescription: inputDescription },
          { VariableName: 'workshopCode' },
        ],
      }],
    });
  });

  it('sends the bound description to the Standard Review workflow corpus', async () => {
    const stageA = await new StageAService().executeStageAFromData(syntheticBot, [makeTopic()]);
    const corpus = buildStandardReviewWorkflowCorpus(stageA, {
      correlationId: 'synthetic-correlation',
      sourceEnvironment: 'synthetic-environment',
    });
    const topics = corpus.standardReview.reviewUnits
      .flatMap(unit => unit.corpus.agent.components)
      .filter(component => component.componentType === 'topic' && component.name === 'Workshop Lookup');

    expect(topics.length).toBeGreaterThan(0);
    for (const topic of topics) {
      expect(topic.fields.inputVariables).toEqual([
        { name: 'minimumSeats', description: inputDescription },
        { name: 'workshopCode', description: '' },
      ]);
      expect(topic.fields.inputVariableDescriptions).toEqual([
        { name: 'minimumSeats', description: inputDescription },
      ]);
    }
  });

  it('does not use input bindings to fill output descriptions', async () => {
    const result = await new StageAService().executeStageAFromData(syntheticBot, [makeTopic({
      outputType: {
        properties: {
          minimumSeats: { displayName: 'Minimum seats', type: 'Number' },
          workshopCode: { displayName: 'Workshop code', description: 'The selected workshop code.' },
        },
      },
    })]);

    expect(result.topicComponents[0].OutputVariables).toEqual([
      { VariableName: 'minimumSeats', VariableDescription: undefined },
      { VariableName: 'workshopCode', VariableDescription: 'The selected workshop code.' },
    ]);
    expect(result.localPatterns.find(p => p.patternName === 'Missing Output Variable Description'))
      .toMatchObject({
        status: false,
        description: '1 output variable(s) are missing a description across 1 topic(s)',
      });
  });

  it.each([
    { named: { displayName: 'Named input', description: 'An existing legacy description.' } },
    [{ name: 'named', displayName: 'Named input', description: 'An existing legacy description.' }],
    [{ VariableName: 'named', displayName: 'Named input', VariableDescription: 'An existing legacy description.' }],
  ].map(variables => [variables]))('preserves the legacy inputVariables and outputVariables formats: %j', async (variables) => {
    const result = await new StageAService().executeStageAFromData(syntheticBot, [makeTopic({
      inputType: undefined,
      outputType: undefined,
      inputVariables: variables,
      outputVariables: variables,
    })]);
    const expected = [{ VariableName: 'named', VariableDescription: 'An existing legacy description.' }];

    expect(result.topicComponents[0].InputVariables).toEqual(expected);
    expect(result.topicComponents[0].OutputVariables).toEqual(expected);
    expect(result.localPatterns.filter(p => p.category.endsWith('Variables')).every(p => p.status))
      .toBe(true);
  });

  it('reports malformed descriptions as missing without dropping the topic variables', async () => {
    const result = await new StageAService().executeStageAFromData(syntheticBot, [makeTopic({
      inputs: [
        null,
        { kind: 'AutomaticTaskInput', propertyName: 'minimumSeats', description: false },
      ],
      inputType: {
        properties: {
          minimumSeats: { displayName: 'Minimum seats', description: { text: 'Invalid' } },
          workshopCode: { displayName: 'Workshop code' },
        },
      },
    })]);

    expect(result.topicComponents[0].InputVariables).toEqual([
      { VariableName: 'minimumSeats', VariableDescription: undefined },
      { VariableName: 'workshopCode', VariableDescription: undefined },
    ]);
    expect(result.localPatterns.find(p => p.patternName === 'Missing Input Variable Description'))
      .toMatchObject({
        status: false,
        description: '2 input variable(s) are missing a description across 1 topic(s)',
      });
  });

  it('reduces five missing descriptions to three without changing the category', async () => {
    const describedProperties = {
      minimumSeats: { displayName: 'Minimum seats', type: 'Number' },
    };
    const missingProperties = {
      workshopCode: { displayName: 'Workshop code', type: 'String' },
      startDate: { displayName: 'Start date', type: 'String' },
      location: { displayName: 'Location', type: 'String' },
    };
    const components = (withBindings: boolean): BotComponent[] => [
      ...['Workshop Lookup', 'Workshop Schedule'].map(name => makeTopic({
        inputType: { properties: describedProperties },
        ...(withBindings ? {} : { inputs: undefined }),
      }, name)),
      makeTopic({ inputs: [], inputType: { properties: missingProperties } }, 'Workshop Booking'),
    ];
    const service = new StageAService();
    const before = await service.executeStageAFromData(syntheticBot, components(false));
    const after = await service.executeStageAFromData(syntheticBot, components(true));
    const missingBefore = before.localPatterns.find(p => p.patternName === 'Missing Input Variable Description')!;
    const missingAfter = after.localPatterns.find(p => p.patternName === 'Missing Input Variable Description')!;

    expect(missingBefore).toMatchObject({
      status: false,
      description: '5 input variable(s) are missing a description across 3 topic(s)',
    });
    expect(missingAfter).toMatchObject({
      status: false,
      description: '3 input variable(s) are missing a description across 1 topic(s)',
      topics: ['Workshop Booking'],
    });
  });
});

describe('Stage A unsupported harness guard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('stops before it reads components when the agent harness is unsupported', async () => {
    getBotMetadata.mockResolvedValue({
      ...syntheticBot,
      statusCode: 1,
      componentIdUnique: '',
      harness: 'unsupported',
    });

    await expect(new StageAService().executeStageA(syntheticBot.botId, null))
      .rejects.toThrow(UNSUPPORTED_HARNESS_MESSAGE);
    expect(getBotComponents).not.toHaveBeenCalled();
    expect(predict).not.toHaveBeenCalled();
  });
});

describe('Stage A upgrade readiness evidence', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('saves the knowledge kinds and the custom Power Fx usage in the live and data paths', async () => {
    const components: BotComponent[] = [
      makeTopic({
        beginDialog: {
          kind: 'OnRecognizedIntent',
          id: 'main',
          intent: {},
          actions: [
            { kind: 'SetVariable', id: 'setSeats', variable: 'Topic.Seats', value: '=Topic.minimumSeats + 1' },
            { kind: 'SendActivity', id: 'confirm', activity: 'You booked {Topic.Seats} seats.' },
          ],
        },
      }, 'Workshop Booking'),
      makeTopic({
        beginDialog: {
          kind: 'OnError',
          id: 'main',
          actions: [{ kind: 'SendActivity', id: 'error', activity: 'Error: {System.Error.Message}' }],
        },
      }, 'On Error'),
      makeTopic({
        beginDialog: {
          kind: 'OnRecognizedIntent',
          id: 'main',
          intent: { triggerQueries: ['Hello', 'Hi', 'Hey'] },
          actions: [{ kind: 'SendActivity', id: 'greet', activity: 'Hello {System.User.DisplayName}.' }],
        },
      }, 'Greeting'),
      makeResource('Book workshop', {
        kind: 'TaskDialog',
        modelDisplayName: 'Book workshop',
        action: { kind: 'InvokeConnectorTaskAction', operationId: 'BookWorkshop' },
        inputs: [{ kind: 'ManualTaskInput', propertyName: 'seats', value: '=Topic.Seats' }],
      }),
      makeResource('Policy index', {
        kind: 'KnowledgeSourceConfiguration',
        source: { kind: 'AzureAISearchSource' },
      }),
      makeResource('Policy site', {
        kind: 'KnowledgeSourceConfiguration',
        source: { kind: 'SharePointSearchSource' },
      }),
      makeResource('Policy handbook', { kind: 'FileAttachmentComponentMetadata' }),
    ];
    getBotMetadata.mockResolvedValue(syntheticBot);
    getBotComponents.mockResolvedValue(components);
    const service = new StageAService();

    const live = await service.executeStageA(syntheticBot.botId, null);
    const fromData = await service.executeStageAFromData(syntheticBot, components);

    expect(live.upgradeReadinessEvidence).toEqual({
      knowledgeSources: [
        { name: 'Policy index', kind: 'AzureAISearchSource' },
        { name: 'Policy site', kind: 'SharePointSearchSource' },
        { name: 'Policy handbook', kind: 'FileAttachmentComponentMetadata' },
      ],
      powerFx: [
        { name: 'Workshop Booking', kind: 'topic', expressionCount: 2 },
        { name: 'Book workshop', kind: 'tool', expressionCount: 1 },
      ],
      powerFxComponentCount: 2,
    });
    expect(fromData.upgradeReadinessEvidence).toEqual(live.upgradeReadinessEvidence);
  });

  it('lists the first 50 components with Power Fx and keeps the full count', async () => {
    const components = Array.from({ length: 52 }, (_, index) => makeTopic({
      beginDialog: {
        kind: 'OnRecognizedIntent',
        id: 'main',
        intent: {},
        actions: [{ kind: 'SendActivity', id: 'answer', activity: '{Topic.Answer}' }],
      },
    }, `Topic ${index + 1}`));

    const result = await new StageAService().executeStageAFromData(syntheticBot, components);

    expect(result.upgradeReadinessEvidence?.powerFx).toHaveLength(50);
    expect(result.upgradeReadinessEvidence?.powerFx[49]).toEqual({ name: 'Topic 50', kind: 'topic', expressionCount: 1 });
    expect(result.upgradeReadinessEvidence?.powerFxComponentCount).toBe(52);
  });
});
