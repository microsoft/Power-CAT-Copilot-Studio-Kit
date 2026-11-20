import { describe, expect, it } from 'vitest';
import type {
  InstructionEvaluation,
  LocalStageAOutput,
  PatternEvaluation,
  UpgradeReadinessEvidence,
} from '../../contracts/StageOutputs';
import {
  buildStandardReviewAssessmentIdentity,
  reconcileStandardReviewConsistency,
} from '../standardReviewConsistency';
import { STANDARD_REVIEW_POLICY_VERSION } from '../reviewAssessment';

function stageA(): LocalStageAOutput {
  return {
    botId: 'synthetic-agent',
    botName: 'Synthetic Agent',
    topicCount: 2,
    toolCount: 0,
    knowledgeCount: 0,
    testCaseCount: 0,
    agentInstructions: 'Help users find workshops. Never guess.',
    localPatterns: [
      {
        patternId: 'local-pattern-6',
        patternName: 'Missing Output Variable Description',
        description: '1 output variable is missing a description.',
        recommendation: 'Describe the output.',
        status: false,
        assessmentStatus: 'fail',
        topics: ['Find workshop'],
        affectedItems: [{
          item: 'Find workshop',
          variable: 'workshopCode',
          componentId: 'topic-find',
          current: '',
        }],
        category: 'Output Variables',
        severity: 'Medium',
      },
    ],
    topics: ['Find workshop', 'Book workshop'],
    tools: [],
    knowledgeSources: [],
    orchestrationMode: 'generative',
    policyVersion: 'standard-review-3',
    source: 'zip',
    configurationAvailable: true,
    topicComponents: [
      {
        TopicName: 'Find workshop',
        TopicId: 'topic-find',
        SchemaName: 'synthetic.findWorkshop',
        TriggerKind: 'OnRecognizedIntent',
        RoutingApplicability: {
          status: 'applicable',
          reason: 'Generative selection.',
        },
        NamingApplicability: {
          status: 'not-assessed',
          reason: 'No effective model name is available.',
        },
        ParseStatus: 'complete',
        ModelDescriptionStatus: 'complete',
        InputVariablesStatus: 'complete',
        OutputVariablesStatus: 'complete',
        ModelDescription: 'Find workshops that match the requested location.',
        InputVariables: [{
          VariableName: 'workshopLocation',
          VariableDescription: 'Location requested by the user.',
        }],
        OutputVariables: [{
          VariableName: 'workshopCode',
        }],
      },
      {
        TopicName: 'Book workshop',
        TopicId: 'topic-book',
        SchemaName: 'synthetic.bookWorkshop',
        TriggerKind: 'OnRecognizedIntent',
        RoutingApplicability: {
          status: 'applicable',
          reason: 'Generative selection.',
        },
        NamingApplicability: {
          status: 'not-assessed',
          reason: 'No effective model name is available.',
        },
        ParseStatus: 'complete',
        ModelDescriptionStatus: 'complete',
        InputVariablesStatus: 'complete',
        OutputVariablesStatus: 'complete',
        ModelDescription: 'Book a selected workshop after confirmation.',
        InputVariables: [],
        OutputVariables: [],
      },
    ],
  };
}

function patterns(
  modelDescription: 'pass' | 'fail',
  inputName: 'pass' | 'fail' = 'pass',
): PatternEvaluation {
  return {
    Patterns: [
      {
        PatternId: 'workflow-model-description',
        PatternName: 'Unclear Model Description',
        Status: modelDescription === 'pass',
        AssessmentStatus: modelDescription,
        Recommendation: 'Clarify the model description.',
        Topics: [],
      },
      {
        PatternId: 'workflow-input-name',
        PatternName: 'Unclear Input Variable Name',
        Status: inputName === 'pass',
        AssessmentStatus: inputName,
        Recommendation: 'Clarify the input name.',
        Topics: [],
      },
    ],
  };
}

function instructions(
  scope: 'pass' | 'fail' | 'not-assessed' = 'pass',
): InstructionEvaluation {
  return {
    compliancePercentage: 0,
    issues: [],
    criterionAssessments: [{
      criteriaId: 'scope-definition',
      status: scope,
    }],
  };
}

describe('Standard review score consistency', () => {
  it('uses a new policy version for evidence-bound scoring', () => {
    expect(STANDARD_REVIEW_POLICY_VERSION).toBe('standard-review-4');
  });

  it('creates the same identity for the same assessment input regardless of array order', async () => {
    const original = stageA();
    const reordered = {
      ...structuredClone(original),
      topicComponents: [...original.topicComponents].reverse(),
      topics: [...original.topics].reverse(),
    };

    await expect(buildStandardReviewAssessmentIdentity(reordered))
      .resolves.toEqual(await buildStandardReviewAssessmentIdentity(original));
  });

  it('changes only the rule inputs affected by a source edit', async () => {
    const before = stageA();
    const after = structuredClone(before);
    after.topicComponents[0].OutputVariables![0].VariableDescription =
      'Workshop code returned to the calling topic.';
    after.localPatterns[0] = {
      ...after.localPatterns[0],
      description: 'All output variables have descriptions defined.',
      status: true,
      assessmentStatus: 'pass',
      topics: [],
      affectedItems: [],
    };

    const previous = await buildStandardReviewAssessmentIdentity(before);
    const current = await buildStandardReviewAssessmentIdentity(after);

    expect(current.sourceHash).not.toBe(previous.sourceHash);
    expect(current.ruleInputHashes['STD-PATTERN-OUTPUT-DESCRIPTION'])
      .not.toBe(previous.ruleInputHashes['STD-PATTERN-OUTPUT-DESCRIPTION']);
    expect(current.ruleInputHashes['local:local-pattern-6'])
      .not.toBe(previous.ruleInputHashes['local:local-pattern-6']);
    expect(current.ruleInputHashes['STD-PATTERN-INPUT-NAME'])
      .toBe(previous.ruleInputHashes['STD-PATTERN-INPUT-NAME']);
  });

  it('keeps unrelated formatting edits out of Privacy and fallback identities', async () => {
    const before = stageA();
    before.agentInstructions = [
      'Scope: Help employees find approved workshop information.',
      'Privacy: Use employee country data only for the requested route.',
      'Fallback: If a knowledge source fails, contact support and stop.',
      'Formatting: Use bullet points for multi-step answers.',
    ].join('\n');
    const after = structuredClone(before);
    after.agentInstructions = after.agentInstructions?.replace(
      'Use bullet points for multi-step answers.',
      'Use numbered steps for multi-step answers.',
    );

    const previous = await buildStandardReviewAssessmentIdentity(before);
    const current = await buildStandardReviewAssessmentIdentity(after);

    expect(current.ruleInputHashes['formatting-guidelines'])
      .not.toBe(previous.ruleInputHashes['formatting-guidelines']);
    expect(current.ruleInputHashes['privacy-and-sensitive-data'])
      .toBe(previous.ruleInputHashes['privacy-and-sensitive-data']);
    expect(current.ruleInputHashes['fallback-when-uncertain'])
      .toBe(previous.ruleInputHashes['fallback-when-uncertain']);
  });

  it.each([
    [
      'adds',
      'Scope: Help employees find approved workshop information.',
      'Scope: Help employees find approved workshop information.\nPrivacy: Treat employee country data as sensitive and do not repeat it.',
    ],
    [
      'removes',
      'Scope: Help employees find approved workshop information.\nPrivacy: Treat employee country data as sensitive and do not repeat it.',
      'Scope: Help employees find approved workshop information.',
    ],
  ])('%s relevant Privacy guidance from the Privacy identity', async (_action, beforeText, afterText) => {
    const before = stageA();
    before.agentInstructions = beforeText;
    const after = structuredClone(before);
    after.agentInstructions = afterText;

    const previous = await buildStandardReviewAssessmentIdentity(before);
    const current = await buildStandardReviewAssessmentIdentity(after);

    expect(current.ruleInputHashes['privacy-and-sensitive-data'])
      .not.toBe(previous.ruleInputHashes['privacy-and-sensitive-data']);
  });

  it('reconciles a changed pattern outcome when the complete source is unchanged', async () => {
    const identity = await buildStandardReviewAssessmentIdentity(stageA());
    const currentPatterns = patterns('fail');

    const result = reconcileStandardReviewConsistency({
      currentIdentity: identity,
      currentPatterns,
      currentInstructions: instructions(),
      baseline: {
        reviewId: 'baseline-review',
        identity,
        patterns: patterns('pass'),
        instructions: instructions(),
      },
    });

    expect(currentPatterns.Patterns[0]).toMatchObject({
      Status: true,
      AssessmentStatus: 'pass',
    });
    expect(result).toMatchObject({
      evaluatorDisagreements: [{
        ruleId: 'STD-PATTERN-MODEL-DESCRIPTION',
        ruleName: 'Unclear Model Description',
        previousStatus: 'pass',
        evaluatorStatus: 'fail',
        acceptedStatus: 'pass',
        pillar: 'pattern',
      }],
      transitions: [],
    });
  });

  it('reconciles a changed outcome when that rule input is unchanged', async () => {
    const before = stageA();
    const after = structuredClone(before);
    after.topicComponents[0].OutputVariables![0].VariableDescription =
      'Workshop code returned to the calling topic.';
    after.localPatterns[0] = {
      ...after.localPatterns[0],
      description: 'All output variables have descriptions defined.',
      status: true,
      assessmentStatus: 'pass',
      topics: [],
      affectedItems: [],
    };
    const previousIdentity = await buildStandardReviewAssessmentIdentity(before);
    const currentIdentity = await buildStandardReviewAssessmentIdentity(after);
    const currentPatterns = patterns('pass', 'fail');

    const result = reconcileStandardReviewConsistency({
      currentIdentity,
      currentPatterns,
      currentInstructions: instructions(),
      baseline: {
        reviewId: 'baseline-review',
        identity: previousIdentity,
        patterns: patterns('pass', 'pass'),
        instructions: instructions(),
      },
    });

    expect(currentPatterns.Patterns[1]).toMatchObject({
      Status: true,
      AssessmentStatus: 'pass',
    });
    expect(result).toMatchObject({
      evaluatorDisagreements: [{
        ruleId: 'STD-PATTERN-INPUT-NAME',
        evaluatorStatus: 'fail',
        acceptedStatus: 'pass',
      }],
    });
  });

  it('reconciles an unchanged instruction criterion to the accepted baseline outcome', async () => {
    const identity = await buildStandardReviewAssessmentIdentity(stageA());
    const currentInstructions = instructions('fail');

    const result = reconcileStandardReviewConsistency({
      currentIdentity: identity,
      currentPatterns: patterns('pass'),
      currentInstructions,
      baseline: {
        reviewId: 'baseline-review',
        identity,
        patterns: patterns('pass'),
        instructions: instructions('pass'),
      },
    });

    expect(currentInstructions.criterionAssessments).toEqual([{
      criteriaId: 'scope-definition',
      status: 'pass',
    }]);
    expect(result).toMatchObject({
      evaluatorDisagreements: [{
        ruleId: 'scope-definition',
        evaluatorStatus: 'fail',
        acceptedStatus: 'pass',
        pillar: 'instruction',
      }],
      transitions: [],
    });
  });

  it('does not replace a fresh completed outcome with an incomplete baseline outcome', async () => {
    const identity = await buildStandardReviewAssessmentIdentity(stageA());
    const currentInstructions = instructions('fail');

    const result = reconcileStandardReviewConsistency({
      currentIdentity: identity,
      currentPatterns: patterns('pass'),
      currentInstructions,
      baseline: {
        reviewId: 'baseline-review',
        identity,
        patterns: patterns('pass'),
        instructions: instructions('not-assessed'),
      },
    });

    expect(currentInstructions.criterionAssessments).toEqual([{
      criteriaId: 'scope-definition',
      status: 'fail',
    }]);
    expect(result.evaluatorDisagreements).toEqual([]);
  });

  it('records a score transition when the related rule input changed', async () => {
    const before = stageA();
    const after = structuredClone(before);
    after.topicComponents[0].ModelDescription =
      'Find or browse workshops for the location supplied by the user.';
    const previousIdentity = await buildStandardReviewAssessmentIdentity(before);
    const currentIdentity = await buildStandardReviewAssessmentIdentity(after);

    const result = reconcileStandardReviewConsistency({
      currentIdentity,
      currentPatterns: patterns('pass'),
      currentInstructions: instructions(),
      baseline: {
        reviewId: 'baseline-review',
        identity: previousIdentity,
        patterns: patterns('fail'),
        instructions: instructions(),
      },
    });

    expect(result).toMatchObject({
      baselineReviewId: 'baseline-review',
      unchangedRuleIds: expect.arrayContaining(['STD-PATTERN-INPUT-NAME']),
      transitions: [{
        ruleId: 'STD-PATTERN-MODEL-DESCRIPTION',
        previousStatus: 'fail',
        currentStatus: 'pass',
        pillar: 'pattern',
        weight: 1,
        previousEarnedPoints: 0,
        currentEarnedPoints: 1,
        previousAvailablePoints: 1,
        currentAvailablePoints: 1,
      }],
    });
  });

  it('rejects an unversioned scoring-policy change', async () => {
    const identity = await buildStandardReviewAssessmentIdentity(stageA());

    expect(() => reconcileStandardReviewConsistency({
      currentIdentity: { ...identity, policyHash: 'changed-policy' },
      currentPatterns: patterns('pass'),
      currentInstructions: instructions(),
      baseline: {
        reviewId: 'baseline-review',
        identity,
        patterns: patterns('pass'),
        instructions: instructions(),
      },
    })).toThrow(/policy.*changed.*version/i);
  });
});

describe('Standard review identity and upgrade readiness evidence', () => {
  it('does not change the assessment identity when the snapshot has upgrade readiness evidence', async () => {
    const evidence: UpgradeReadinessEvidence = {
      knowledgeSources: [{ name: 'Policy index', kind: 'AzureAISearchSource' }],
      powerFx: [{ name: 'Workshop Lookup', kind: 'topic', expressionCount: 2 }],
      powerFxComponentCount: 1,
    };
    const base = stageA();
    const identity = await buildStandardReviewAssessmentIdentity(base);

    await expect(buildStandardReviewAssessmentIdentity({ ...base, upgradeReadinessEvidence: evidence }))
      .resolves.toEqual(identity);
  });
});
