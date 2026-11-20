import { describe, expect, it } from 'vitest';
import type { LocalStageAOutput } from '../../contracts/StageOutputs';
import { STANDARD_REVIEW_UNIT_INDEX } from '../../contracts/StandardReviewWorkflow';
import { COMPLIANCE_CRITERIA } from '../../contracts/Constants';
import { buildStandardReviewWorkflowCorpus } from '../standardReviewCorpus';

const STAGE_B_PATTERN_NAMES = [
  'Unclear Model Name',
  'Unclear Model Description',
  'Unclear Input Variable Name',
  'Unclear Input Variable Description',
  'Unclear Output Variable Name',
  'Unclear Output Variable Description',
  'Overlapping Topic Descriptions',
  'Tool Routing Gap',
  'Missing Trigger Phrases',
];

function stageA(overrides: Partial<LocalStageAOutput> = {}): LocalStageAOutput {
  return {
    botId: 'synthetic-workshop-agent',
    botName: 'Workshop Support Agent',
    topicCount: 2,
    toolCount: 0,
    knowledgeCount: 0,
    testCaseCount: 0,
    topics: ['Find workshop', 'Book workshop'],
    tools: [],
    knowledgeSources: [],
    orchestrationMode: 'generative',
    source: 'live',
    configurationAvailable: true,
    agentInstructions: [
      'Help users find and book workshops.',
      'Ask a clarifying question when the workshop location is missing.',
      'Never guess.',
    ].join(' '),
    localPatterns: [],
    topicComponents: [
      {
        TopicName: 'Find workshop',
        TopicId: 'topic-find',
        SchemaName: 'synthetic.findWorkshop',
        TriggerKind: 'OnRecognizedIntent',
        RoutingApplicability: 'applicable',
        NamingApplicability: 'applicable',
        ParseStatus: 'complete',
        ModelDescriptionStatus: 'complete',
        InputVariablesStatus: 'complete',
        OutputVariablesStatus: 'complete',
        ModelName: 'Find workshop',
        ModelDescription: 'Find workshops that match the requested location and date.',
        InputVariables: [{
          VariableName: 'workshopLocation',
          VariableDescription: 'Location where the user wants to attend a workshop.',
        }],
        OutputVariables: [{
          VariableName: 'matchingWorkshops',
          VariableDescription: 'Workshops that match the requested location and date.',
        }],
        triggerQueries: ['find a workshop', 'show workshops near me', 'search for a class'],
      },
      {
        TopicName: 'Book workshop',
        TopicId: 'topic-book',
        SchemaName: 'synthetic.bookWorkshop',
        TriggerKind: 'OnRecognizedIntent',
        RoutingApplicability: 'applicable',
        NamingApplicability: 'applicable',
        ParseStatus: 'complete',
        ModelDescriptionStatus: 'complete',
        InputVariablesStatus: 'complete',
        OutputVariablesStatus: 'complete',
        ModelName: 'Book workshop',
        ModelDescription: 'Book a selected workshop after the user confirms its schedule.',
        InputVariables: [{
          VariableName: 'workshopId',
          VariableDescription: 'Identifier of the workshop selected by the user.',
        }],
        OutputVariables: [{
          VariableName: 'bookingConfirmation',
          VariableDescription: 'Confirmation details for the completed workshop booking.',
        }],
        triggerQueries: ['book a workshop', 'reserve a class', 'enrol in a workshop'],
      },
    ],
    ...overrides,
  };
}

function corpus(source = stageA()) {
  return buildStandardReviewWorkflowCorpus(source, {
    correlationId: 'synthetic-correlation',
    sourceEnvironment: 'synthetic-environment',
  });
}

function unit(source: LocalStageAOutput, componentIndex: number) {
  const reviewUnit = corpus(source).standardReview.reviewUnits.find(
    candidate => candidate.componentIndex === componentIndex,
  );
  expect(reviewUnit).toBeDefined();
  return reviewUnit!;
}

describe('Standard Review workflow corpus contract', () => {
  it('registers the nine canonical Stage B patterns in source order', () => {
    const value = corpus();
    const stageBRules = value.standardReview.reviewUnits
      .filter(reviewUnit => [
        STANDARD_REVIEW_UNIT_INDEX.CONFIGURATION,
        STANDARD_REVIEW_UNIT_INDEX.ROUTING,
      ].includes(reviewUnit.componentIndex))
      .flatMap(reviewUnit => reviewUnit.corpus.standardReview.rules);

    expect(stageBRules.map(rule => rule.name)).toEqual(STAGE_B_PATTERN_NAMES);
    expect(new Set(stageBRules.map(rule => rule.ruleId)).size).toBe(STAGE_B_PATTERN_NAMES.length);
  });

  it('models Tool Routing Gap as an individual callable scope-boundary check', () => {
    const routingUnit = unit(stageA(), STANDARD_REVIEW_UNIT_INDEX.ROUTING);
    const rule = routingUnit.corpus.standardReview.rules.find(
      candidate => candidate.name === 'Tool Routing Gap',
    );

    expect(rule).toBeDefined();
    expect(rule!.failWhen.join(' ')).toMatch(/scope|boundary|when to use|when not to use/i);
    expect(rule!.failWhen.join(' ')).not.toMatch(/same intent|shared intent|overlap pair/i);
  });

  it('uses the correct output-variable evidence fields', () => {
    const configurationUnit = unit(
      stageA(),
      STANDARD_REVIEW_UNIT_INDEX.CONFIGURATION,
    );
    const outputNameRule = configurationUnit.corpus.standardReview.rules.find(
      rule => rule.ruleId === 'STD-PATTERN-OUTPUT-NAME',
    );
    const outputDescriptionRule = configurationUnit.corpus.standardReview.rules.find(
      rule => rule.ruleId === 'STD-PATTERN-OUTPUT-DESCRIPTION',
    );

    expect(outputNameRule).toBeDefined();
    expect(outputDescriptionRule).toBeDefined();
    expect(outputNameRule!.requiredEvidence.allowedFieldPaths).toEqual(['fields.outputVariables']);
    expect(outputDescriptionRule!.requiredEvidence.allowedFieldPaths)
      .toEqual(['fields.outputVariableDescriptions']);
  });

  it('limits Stage C evidence to the complete agent-instructions component', () => {
    const instructionUnits = corpus().standardReview.reviewUnits.filter(
      reviewUnit => reviewUnit.componentIndex >= STANDARD_REVIEW_UNIT_INDEX.INSTRUCTIONS_SCOPE_UX,
    );

    const instructionRules = instructionUnits.flatMap(
      reviewUnit => reviewUnit.corpus.standardReview.rules,
    );
    expect(instructionRules).toHaveLength(COMPLIANCE_CRITERIA.length);
    expect([...new Set(instructionRules.map(rule => rule.ruleId))].sort())
      .toEqual(COMPLIANCE_CRITERIA.map(criterion => criterion.id).sort());
    expect(instructionRules.map(rule => rule.source.order).sort((left, right) => left - right))
      .toEqual(COMPLIANCE_CRITERIA.map((_, index) => index + 1));
    expect(instructionUnits.every(reviewUnit =>
      reviewUnit.corpus.agent.components.every(
        component => component.componentType === 'agent-instructions',
      ))).toBe(true);
    expect(instructionUnits.every(reviewUnit =>
      reviewUnit.corpus.standardReview.rules.every(rule =>
        rule.requiredEvidence.allowedFieldPaths.join(',') === 'fields.instructions',
      ))).toBe(true);
  });

  it('limits Stage B configuration evidence to topic components', () => {
    const source = stageA({
      toolCount: 1,
      toolDetails: [{
        name: 'Reserve workshop',
        componentId: 'tool-reserve',
        toolType: 'flow',
        description: 'Reserve the selected workshop after the user confirms the schedule.',
      }],
    });
    const configurationUnit = unit(source, STANDARD_REVIEW_UNIT_INDEX.CONFIGURATION);

    expect(configurationUnit.corpus.agent.components.every(
      component => component.componentType === 'topic',
    )).toBe(true);
  });

  it('records the original source prompt and expected rules on every unit', () => {
    const units = corpus().standardReview.reviewUnits;

    for (const reviewUnit of units) {
      const isStageB = reviewUnit.componentIndex < STANDARD_REVIEW_UNIT_INDEX.INSTRUCTIONS_SCOPE_UX;
      expect(reviewUnit.corpus.standardReview).toMatchObject({
        contract: {
          evaluator: isStageB ? 'stage-b-patterns' : 'stage-c-instructions',
          sourcePrompt: isStageB
            ? 'ai-Prompt-stageB-improved.md'
            : 'ai-Prompt-evaluate-AgentInstruction.md',
          expectedRuleIds: reviewUnit.corpus.standardReview.rules.map(rule => rule.ruleId),
        },
      });
    }
  });

  it('requires every unit to report complete coverage or explicit gaps', () => {
    for (const reviewUnit of corpus().standardReview.reviewUnits) {
      expect(reviewUnit.corpus.standardReview).toMatchObject({
        contract: {
          completion: {
            completeStatus: 'complete',
            partialStatus: 'partial',
            requireEveryApplicableRule: true,
            requireNotAssessedForUnavailableRules: true,
          },
        },
      });
    }
  });

  it('requires agent-specific actions and observable acceptance checks', () => {
    for (const reviewUnit of corpus().standardReview.reviewUnits) {
      expect(reviewUnit.corpus.standardReview).toMatchObject({
        contract: {
          remediation: {
            requireExactTarget: true,
            requireAgentContext: true,
            requireMakerAction: true,
            requireAcceptanceCheck: true,
          },
        },
      });
    }
  });

  it('allows Stage C to report missing guidance after reviewing the complete instruction field', () => {
    const instructionRules = corpus().standardReview.reviewUnits
      .filter(reviewUnit =>
        reviewUnit.componentIndex >= STANDARD_REVIEW_UNIT_INDEX.INSTRUCTIONS_SCOPE_UX)
      .flatMap(reviewUnit => reviewUnit.corpus.standardReview.rules);
    const patternRules = corpus().standardReview.reviewUnits
      .filter(reviewUnit =>
        reviewUnit.componentIndex < STANDARD_REVIEW_UNIT_INDEX.INSTRUCTIONS_SCOPE_UX)
      .flatMap(reviewUnit => reviewUnit.corpus.standardReview.rules);

    expect(instructionRules.every(
      rule => Reflect.get(rule.requiredEvidence, 'allowEmptyQuoteForAbsence') === true,
    )).toBe(true);
    expect(patternRules.every(
      rule => Reflect.get(rule.requiredEvidence, 'allowEmptyQuoteForAbsence') === false,
    )).toBe(true);
  });

  it('makes Missing Trigger Phrases applicable to classic recognized-intent topics', () => {
    const source = stageA({
      orchestrationMode: 'classic',
      topicComponents: stageA().topicComponents.map(topic => ({
        ...topic,
        RoutingApplicability: 'not-applicable',
        triggerQueries: topic.TopicId === 'topic-find'
          ? ['find a workshop', 'search for a workshop']
          : topic.triggerQueries,
      })),
    });
    const routingUnit = unit(source, STANDARD_REVIEW_UNIT_INDEX.ROUTING);
    const rule = routingUnit.corpus.standardReview.rules.find(
      candidate => candidate.name === 'Missing Trigger Phrases',
    );

    expect(rule).toMatchObject({
      applicability: {
        status: 'applicable',
        eligibleComponentIds: ['topic-find', 'topic-book'],
      },
      requiredEvidence: {
        allowedFieldPaths: ['fields.triggerQueries', 'fields.triggerPhraseSummary'],
      },
    });
  });

  it('does not assess Missing Trigger Phrases when one eligible classic topic lacks trigger metadata', () => {
    const source = stageA({
      orchestrationMode: 'classic',
      topicComponents: stageA().topicComponents.map(topic => ({
        ...topic,
        RoutingApplicability: 'not-applicable',
        triggerQueries: topic.TopicId === 'topic-book' ? undefined : topic.triggerQueries,
      })),
    });
    const rule = unit(source, STANDARD_REVIEW_UNIT_INDEX.ROUTING)
      .corpus.standardReview.rules.find(
        candidate => candidate.name === 'Missing Trigger Phrases',
      );

    expect(rule).toMatchObject({
      applicability: {
        status: 'not-assessed',
        eligibleComponentIds: [],
        reason: expect.stringContaining('metadata'),
      },
    });
  });

  it('marks Missing Trigger Phrases not applicable to generative orchestration', () => {
    const routingUnit = unit(stageA(), STANDARD_REVIEW_UNIT_INDEX.ROUTING);
    const rule = routingUnit.corpus.standardReview.rules.find(
      candidate => candidate.name === 'Missing Trigger Phrases',
    );

    expect(rule).toMatchObject({
      applicability: {
        status: 'not-applicable',
        eligibleComponentIds: [],
      },
    });
  });
});
