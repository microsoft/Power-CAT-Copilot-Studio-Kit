import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalStageAOutput, PatternEvaluation, InstructionEvaluation, UpgradeReadinessEvidence } from '../../contracts/StageOutputs';
import { COMPLIANCE_CRITERIA } from '../../contracts/Constants';
import { parseStandardComponents } from '../../utils/stageAParser';
import { buildLocalPatterns } from '../../utils/localPatternBuilder';
import { generateSARIF } from '../../utils/exportUtils';
import { hasInstructionText } from '../../utils/instructionEvidence';
import { makeResource, makeTopic } from './stageAFixtures';
import { validateStandardPatternEvaluation } from '../../utils/standardPatternValidation';
import { buildStandardReviewAssessmentIdentity } from '../../utils/standardReviewConsistency';
import { STANDARD_REVIEW_POLICY_VERSION } from '../../utils/reviewAssessment';
vi.mock('../ReviewWorkflowAvailabilityService', () => ({
  assertReviewWorkflowAvailable: vi.fn(async () => undefined),
}));
import { assertReviewWorkflowAvailable } from '../ReviewWorkflowAvailabilityService';

const {
  extract,
  extractFromData,
  parseZip,
  evaluateWorkflow,
  evaluatePatterns,
  evaluateInstructions,
  loadBaseline,
  save,
} = vi.hoisted(() => ({
  extract: vi.fn(), extractFromData: vi.fn(), parseZip: vi.fn(),
  evaluateWorkflow: vi.fn(), evaluatePatterns: vi.fn(), evaluateInstructions: vi.fn(),
  loadBaseline: vi.fn(), save: vi.fn(),
}));
vi.mock('../StageAService', () => ({ stageAService: { executeStageA: extract, executeStageAFromData: extractFromData } }));
vi.mock('../../declarative-agent/utils/csZipParser', () => ({ parseCSZip: parseZip }));
vi.mock('../StandardReviewWorkflowService', () => ({
  evaluateStandardReviewWithWorkflow: evaluateWorkflow,
}));
vi.mock('../ReviewService', () => ({
  reviewService: {
    getLatestComparableStandardReview: loadBaseline,
    saveReviewResult: save,
  },
}));
import { executeReviewPipeline } from '../../hooks/useReviewMutation';
import { UNSUPPORTED_HARNESS_MESSAGE } from '../../agents-experience/services/detection';

const input = { botId: 'synthetic-agent', botName: 'Review Demo', componentIdUnique: 'synthetic-component' };
const stageA: LocalStageAOutput = {
  ...input, topicCount: 1, toolCount: 0, knowledgeCount: 0, testCaseCount: 0,
  topics: ['Workshop Lookup'], topicComponents: [], tools: [], knowledgeSources: [],
  orchestrationMode: 'generative', policyVersion: 'standard-review-2', source: 'live',
  agentInstructions: 'Help users find a workshop. Ask for missing seat requirements.',
  localPatterns: [{
    patternId: 'local-description', patternName: 'Missing Input Variable Description',
    status: false, assessmentStatus: 'fail', description: 'One description is absent.',
    recommendation: 'Describe the input.', severity: 'Medium', category: 'Input Variables',
    topics: ['Workshop Lookup'], affectedItems: [{ item: 'Workshop Lookup', variable: 'workshopCode' }],
  }],
};
const stageB: PatternEvaluation = {
  Patterns: [{
    PatternId: 'clarity', PatternName: 'Unclear Model Description',
    Status: true, AssessmentStatus: 'pass', Topics: [], Recommendation: '',
  }],
  PatternCompliancePercentage: 100,
};
const stageC: InstructionEvaluation = {
  compliancePercentage: 100, issues: [],
  criterionAssessments: COMPLIANCE_CRITERIA.map(c => ({ criteriaId: c.id, status: 'pass' })),
};

describe('actual standard review pipeline score and persistence input', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    extract.mockResolvedValue(structuredClone(stageA));
    extractFromData.mockResolvedValue({ ...structuredClone(stageA), source: 'zip' });
    evaluatePatterns.mockResolvedValue(structuredClone(stageB));
    evaluateInstructions.mockResolvedValue(structuredClone(stageC));
    evaluateWorkflow.mockImplementation(async (source: LocalStageAOutput) => ({
      patternEvaluation: await evaluatePatterns(source),
      instructionEvaluation: hasInstructionText(source.agentInstructions)
        ? await evaluateInstructions(source.agentInstructions)
        : {
          compliancePercentage: 0,
          issues: [],
          assessmentStatus: 'not-assessed',
          assessmentReason: 'No readable agent instructions were supplied. No instruction assessment was run.',
        },
      rejectedCandidateCount: 0,
      workflowProvenance: {
        jobId: 'synthetic-job',
        correlationId: 'synthetic-correlation',
        reviewPolicyVersion: 'standard-review-2',
        retrievedAt: '2026-09-12T05:36:51.000Z',
        rejectedCandidateCount: 0,
        units: [],
      },
    }));
    loadBaseline.mockResolvedValue(undefined);
    save.mockImplementation(async review => ({ ...review, reviewId: 'synthetic-review' }));
  });

  it('blocks a new review before extraction, AI evaluation, or saving when the workflow is unavailable', async () => {
    vi.mocked(assertReviewWorkflowAvailable).mockRejectedValueOnce(
      new Error('Agent Review Workflow add-on is not installed.'),
    );
    await expect(executeReviewPipeline(input)).rejects.toThrow('add-on is not installed');
    expect(extract).not.toHaveBeenCalled();
    expect(evaluateWorkflow).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('can collect an already submitted review without an availability check', async () => {
    await executeReviewPipeline({ ...input, existingJobId: 'existing-job' });
    expect(assertReviewWorkflowAvailable).not.toHaveBeenCalled();
    expect(evaluateWorkflow).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ existingJobId: 'existing-job' }),
    );
  });

  it('calculates after the local/AI merge rather than trusting the model-only percentage', async () => {
    const { reviewResult } = await executeReviewPipeline(input);
    // `overallScore` is no longer the mean of the two sub-scores. It is the six-pillar composite
    // the copilot harness already used, so the same agent compares across both tools: Instructions
    // 25 and Knowledge 8 and Orchestration 10 all measured clean, against an Evaluation pillar that
    // is measured — not excused — at 0 because this agent carries no test cases. The sub-scores
    // below are unchanged and still persisted; only the headline moved.
    expect(reviewResult).toMatchObject({
      patternScore: 50, instructionScore: 100, overallScore: 70,
      patternScoreApplicable: true, instructionScoreApplicable: true, overallScoreApplicable: true,
      mediumSeverityCount: 1, totalIssueCount: 1,
    });
    const stored = JSON.parse(reviewResult.stageBOutput!);
    expect(stored.PatternCompliancePercentage).toBe(50);
    expect(stored.Patterns.find((p: { PatternId: string }) => p.PatternId === 'local-description').Topics)
      .toEqual([{ item: 'Workshop Lookup', variable: 'workshopCode' }]);
    expect(save).toHaveBeenCalledOnce();
  });

  it('keeps an extracted custom topic failed when a standard system topic has the same name', async () => {
    const standard = {
      ...makeTopic({ modelDescription: ' ', triggerQueries: ['Bye', 'Good bye', 'See you later'] }, 'Goodbye'),
      botid: input.botId,
    };
    const custom = {
      ...makeTopic({ modelDescription: ' ', triggerQueries: ['Bye', 'Close my workshop registration'] }, 'Goodbye'),
      botid: input.botId,
      botcomponentid: 'component-custom-goodbye',
      componentidunique: 'unique-custom-goodbye',
      schemaname: 'synthetic_workshopagent.topic.CustomGoodbye',
    };
    const parsed = parseStandardComponents([standard, custom], input.botId, input.botName, 'generative', 'live');
    extract.mockResolvedValue({ ...stageA, ...parsed, localPatterns: buildLocalPatterns(parsed) });
    evaluatePatterns.mockResolvedValue({ Patterns: [] });

    const { reviewResult } = await executeReviewPipeline(input);
    const stored: PatternEvaluation = JSON.parse(reviewResult.stageBOutput!);
    const pattern = stored.Patterns.find(item => item.PatternName === 'Missing Model Description');

    expect(pattern).toMatchObject({ Status: false, AssessmentStatus: 'fail' });
    expect(pattern?.Topics.map(topic => topic.componentId)).toEqual(['component-custom-goodbye']);
  });

  it.each([
    {
      label: 'an unidentified item whose name a custom topic shares',
      assessmentStatus: 'fail' as const,
      affectedItems: [{ item: 'Goodbye' }],
      expected: 'fail',
      kept: [undefined],
    },
    {
      label: 'a Not assessed result that lists a standard topic',
      assessmentStatus: 'not-assessed' as const,
      affectedItems: [{ item: 'Goodbye', componentId: 'topic-goodbye' }],
      expected: 'not-assessed',
      kept: ['topic-goodbye'],
    },
  ])('does not turn $label into a pass', async example => {
    extract.mockResolvedValue({
      ...stageA,
      topics: ['Goodbye', 'Goodbye'],
      topicComponents: [
        {
          TopicName: 'Goodbye', TopicId: 'topic-goodbye', TriggerKind: 'OnRecognizedIntent',
          triggerQueries: ['Bye', 'Good bye', 'See you later'],
        },
        {
          TopicName: 'Goodbye', TopicId: 'topic-custom-goodbye', TriggerKind: 'OnRecognizedIntent',
          triggerQueries: ['Bye', 'Close my workshop registration'],
        },
      ],
      localPatterns: [{
        patternId: 'local-pattern-2',
        patternName: 'Missing Model Description',
        status: false,
        assessmentStatus: example.assessmentStatus,
        description: 'Synthetic model-description result.',
        recommendation: 'Add a model description.',
        severity: 'Medium',
        category: 'Description Clarity',
        topics: ['Goodbye'],
        affectedItems: example.affectedItems,
      }],
    });
    evaluatePatterns.mockResolvedValue({ Patterns: [] });

    const { reviewResult } = await executeReviewPipeline(input);
    const stored: PatternEvaluation = JSON.parse(reviewResult.stageBOutput!);
    const pattern = stored.Patterns.find(item => item.PatternName === 'Missing Model Description');

    expect(pattern).toMatchObject({ Status: false, AssessmentStatus: example.expected, Topics: [expect.anything()] });
    expect(pattern?.Topics.map(topic => topic.componentId)).toEqual(example.kept);
  });

  it('reports Stage A scope and persists direct workflow provenance', async () => {
    const onScopeReady = vi.fn();

    const { reviewResult } = await executeReviewPipeline(
      input,
      undefined,
      undefined,
      onScopeReady,
    );

    expect(onScopeReady).toHaveBeenCalledWith({
      topicCount: 1,
      toolAndAgentCount: 0,
      knowledgeSourceCount: 0,
    });
    expect(reviewResult.workflowProvenance).toMatchObject({
      jobId: 'synthetic-job',
      correlationId: 'synthetic-correlation',
    });
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      workflowProvenance: reviewResult.workflowProvenance,
    }));
  });

  it('saves the upgrade readiness evidence in the Stage A snapshot', async () => {
    const evidence: UpgradeReadinessEvidence = {
      knowledgeSources: [{ name: 'Policy index', kind: 'AzureAISearchSource' }],
      powerFx: [{ name: 'Workshop Lookup', kind: 'topic', expressionCount: 2 }],
      powerFxComponentCount: 1,
    };
    extract.mockResolvedValue({ ...structuredClone(stageA), upgradeReadinessEvidence: evidence });

    const { reviewResult } = await executeReviewPipeline(input);

    expect(JSON.parse(reviewResult.stageAOutput!).upgradeReadinessEvidence).toEqual(evidence);
  });

  it('saves the accepted baseline score when an unchanged instruction outcome changes', async () => {
    const identity = await buildStandardReviewAssessmentIdentity(stageA);
    evaluateInstructions.mockResolvedValue({
      ...stageC,
      issues: [{
        id: 'deterministic-language-1',
        criteriaId: 'deterministic-language',
        title: 'Use deterministic language',
        description: 'The workflow proposed a different result.',
        recommendation: 'Use absolute directives.',
        severity: 'Medium',
        assessmentStatus: 'fail',
      }],
      criterionAssessments: stageC.criterionAssessments?.map(assessment =>
        assessment.criteriaId === 'deterministic-language'
          ? { ...assessment, status: 'fail' as const }
          : assessment),
    });
    const localPattern = stageA.localPatterns[0];
    loadBaseline.mockResolvedValue({
      reviewId: 'baseline-review',
      identity,
      patterns: {
        Patterns: [
          structuredClone(stageB.Patterns[0]),
          {
            PatternId: localPattern.patternId,
            PatternName: localPattern.patternName,
            Status: localPattern.status,
            AssessmentStatus: localPattern.assessmentStatus,
            Recommendation: localPattern.recommendation,
            Topics: localPattern.affectedItems ?? [],
          },
        ],
      },
      instructions: structuredClone(stageC),
      // A baseline saved by this version carries the six-pillar composite, so an unchanged agent
      // produces a zero delta. A pre-composite row would hold the legacy 50/50 blend of 75.
      scores: {
        overallScore: 70,
        patternScore: 50,
        instructionScore: 100,
      },
    });

    const { reviewResult } = await executeReviewPipeline(input);
    const storedInstructions: InstructionEvaluation = JSON.parse(reviewResult.stageCOutput!);

    expect(evaluateWorkflow).toHaveBeenCalledOnce();
    expect(reviewResult).toMatchObject({
      overallScore: 70,
      patternScore: 50,
      instructionScore: 100,
      consistency: {
        evaluatorDisagreements: [{
          ruleId: 'deterministic-language',
          ruleName: 'Deterministic Language',
          previousStatus: 'pass',
          evaluatorStatus: 'fail',
          acceptedStatus: 'pass',
          pillar: 'instruction',
        }],
        scoreDelta: {
          overall: 0,
          pattern: 0,
          instruction: 0,
        },
      },
    });
    expect(storedInstructions.criterionAssessments?.find(assessment =>
      assessment.criteriaId === 'deterministic-language')).toMatchObject({
        status: 'pass',
      });
    expect(storedInstructions.issues).toEqual([]);
    expect(save).toHaveBeenCalledOnce();
  });

  it('persists an evidence-backed transition and exact score delta', async () => {
    const before: LocalStageAOutput = {
      ...structuredClone(stageA),
      topicComponents: [{
        TopicName: 'Workshop Lookup',
        TopicId: 'topic-workshop',
        ModelDescription: 'Find workshops for the user.',
        RoutingApplicability: {
          status: 'applicable',
          reason: 'Generative selection.',
        },
        ParseStatus: 'complete',
      }],
    };
    const after: LocalStageAOutput = {
      ...structuredClone(before),
      topicComponents: [{
        ...before.topicComponents[0],
        ModelDescription: 'Find workshops that match the location and date supplied by the user.',
      }],
    };
    extract.mockResolvedValue(after);
    const identity = await buildStandardReviewAssessmentIdentity(before);
    const localPattern = before.localPatterns[0];
    loadBaseline.mockResolvedValue({
      reviewId: 'baseline-review',
      identity,
      patterns: {
        Patterns: [
          {
            ...stageB.Patterns[0],
            Status: false,
            AssessmentStatus: 'fail',
          },
          {
            PatternId: localPattern.patternId,
            PatternName: localPattern.patternName,
            Status: localPattern.status,
            AssessmentStatus: localPattern.assessmentStatus,
            Recommendation: localPattern.recommendation,
            Topics: localPattern.affectedItems ?? [],
          },
        ],
      },
      instructions: structuredClone(stageC),
      scores: {
        overallScore: 50,
        patternScore: 0,
        instructionScore: 100,
      },
    });

    const { reviewResult } = await executeReviewPipeline(input);

    expect(loadBaseline).toHaveBeenCalledWith({
      botId: input.botId,
      componentIdUnique: input.componentIdUnique,
      sourceEnvironment: '',
    }, STANDARD_REVIEW_POLICY_VERSION, identity.policyHash);
    expect(reviewResult.assessmentIdentity).toMatchObject({
      policyVersion: STANDARD_REVIEW_POLICY_VERSION,
    });
    expect(reviewResult.consistency).toMatchObject({
      baselineReviewId: 'baseline-review',
      transitions: [{
        ruleId: 'STD-PATTERN-MODEL-DESCRIPTION',
        previousStatus: 'fail',
        currentStatus: 'pass',
      }],
      scoreDelta: {
        previous: {
          overallScore: 50,
          patternScore: 0,
          instructionScore: 100,
        },
        current: {
          overallScore: 70,
          patternScore: 50,
          instructionScore: 100,
        },
        overall: 20,
        pattern: 50,
        instruction: 0,
      },
    });
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      assessmentIdentity: reviewResult.assessmentIdentity,
      consistency: reviewResult.consistency,
    }));
  });

  it('does not persist an asserted score or failure count for excluded assessments', async () => {
    extract.mockResolvedValue({ ...stageA, localPatterns: [] });
    evaluatePatterns.mockResolvedValue({
      Patterns: [
        { ...stageB.Patterns[0], Status: true, AssessmentStatus: 'not-applicable' },
        { ...stageB.Patterns[0], Status: false, AssessmentStatus: 'not-assessed' },
      ],
    });
    evaluateInstructions.mockResolvedValue({ ...stageC, criterionAssessments: [] });
    const { reviewResult } = await executeReviewPipeline(input);
    expect(reviewResult).toMatchObject({
      patternScoreApplicable: false, instructionScoreApplicable: false, overallScoreApplicable: false,
      highSeverityCount: 0, mediumSeverityCount: 0, lowSeverityCount: 0, totalIssueCount: 0,
    });
    expect(JSON.parse(reviewResult.stageBOutput!).scoreAvailable).toBe(false);
    expect(JSON.parse(reviewResult.stageCOutput!).scoreAvailable).toBe(false);
  });

  it.each([undefined, '', ' \n ', '\u200B', '\u200C\u200D\uFEFF', ' \t\u200B\n'])(
    'does not invoke Stage C for absent or visually blank instruction content %j', async agentInstructions => {
    extract.mockResolvedValue({ ...stageA, agentInstructions });
    const { reviewResult } = await executeReviewPipeline(input);
    expect(evaluateInstructions).not.toHaveBeenCalled();
    expect(reviewResult.instructionScoreApplicable).toBe(false);
    expect(JSON.parse(reviewResult.stageCOutput!).assessmentStatus).toBe('not-assessed');
  });

  it('retains nonblank instruction text with zero-width characters at the invocation boundary', async () => {
    const instructions = ' \u200BHelp users find workshops.\u200D\n';
    extract.mockResolvedValue({ ...stageA, agentInstructions: instructions });
    await executeReviewPipeline(input);
    expect(evaluateInstructions).toHaveBeenCalledWith(instructions);
  });

  it('does not turn an incomplete fresh instruction result into a perfect score', async () => {
    evaluateInstructions.mockResolvedValue({ compliancePercentage: 100, issues: [] });
    const { reviewResult } = await executeReviewPipeline(input);
    expect(reviewResult.instructionScoreApplicable).toBe(false);
    // A reply carrying no criterion verdicts leaves every pillar but Evaluation without a score,
    // and Evaluation alone is a statement about test coverage rather than a grade for the agent.
    // The old blend published the pattern half as a 50; the composite is withheld instead, so the
    // run reads as "not measured" rather than as an agent that was examined and scored badly.
    expect(reviewResult.overallScoreApplicable).toBe(false);
    expect(JSON.parse(reviewResult.stageCOutput!).summary).toContain('No score is available');
  });

  it('stores normalized outcome summaries and preserves the source narrative separately', async () => {
    evaluatePatterns.mockResolvedValue({ ...stageB, Summary: 'All reported checks pass.' });
    const { reviewResult } = await executeReviewPipeline(input);
    const stored = JSON.parse(reviewResult.stageBOutput!);
    expect(stored.originalSummary).toBe('All reported checks pass.');
    expect(stored.Summary).toContain('1 Pass; 1 Fail');
  });

  it.each(['unavailable-source', 'explicit-noncompletion'])('retains %s reference states in persistence and SARIF', async kind => {
    const source: LocalStageAOutput = {
      ...stageA, localPatterns: [], topics: ['A', 'B'],
      topicComponents: [
        {
          TopicName: 'A', TopicId: 'topic-a', ModelDescription: 'Select workshops.', ParseStatus: 'complete',
          RoutingApplicability: { status: 'applicable', reason: 'Generative selection.' },
        },
        {
          TopicName: 'B', TopicId: 'topic-b', ModelDescription: 'Review workshops.',
          ParseStatus: kind === 'unavailable-source' ? 'unavailable' : 'complete',
          RoutingApplicability: { status: 'applicable', reason: 'Generative selection.' },
        },
      ],
    };
    extract.mockResolvedValue(source);
    evaluatePatterns.mockResolvedValue(validateStandardPatternEvaluation({
      Patterns: [{
        PatternId: 'partial-clarity', PatternName: 'Unclear Model Description', Status: false,
        Recommendation: 'Clarify the selection description.',
        Topics: [
          { item: 'A', current: 'Select workshops.' },
          {
            item: 'B', current: 'Review workshops.', suggested: 'Retained suggestion.',
            ...(kind === 'explicit-noncompletion' && {
              assessmentStatus: 'not-assessed', assessmentReason: 'This reference was not evaluated.',
            }),
          },
        ],
      }],
    }, source));
    const { reviewResult } = await executeReviewPipeline(input);
    expect(reviewResult.totalIssueCount).toBe(1);
    expect(reviewResult.patternScore).toBe(0);
    expect(reviewResult.instructionScore).toBe(100);
    const stored: PatternEvaluation = JSON.parse(reviewResult.stageBOutput!);
    const pattern = stored.Patterns.find(row => row.PatternId === 'partial-clarity')!;
    expect(pattern.Topics.map(topic => topic.assessmentStatus)).toEqual(['fail', 'not-assessed']);
    if (kind === 'explicit-noncompletion') {
      expect(pattern.Topics[1].assessmentReason).toContain('This reference was not evaluated.');
    }
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ stageBOutput: reviewResult.stageBOutput }));
    const exported = generateSARIF(reviewResult).runs[0];
    const finding = exported.results.find(row => row.ruleId === 'partial-clarity')!;
    expect(finding.locations).toHaveLength(1);
    expect(finding.locations?.[0].physicalLocation.artifactLocation.uri).toContain('topic-a');
    expect(finding.properties?.affectedSettings).toEqual([pattern.Topics[0]]);
    expect(finding.properties?.recordedReferences).toEqual(pattern.Topics);
    expect(exported.invocations[0].executionSuccessful).toBe(false);
  });

  it('keeps malformed local input references unassessed through merge, save and SARIF', async () => {
    const component = {
      ...makeTopic({
        inputType: undefined, inputs: undefined,
        inputVariables: [{ name: 'good', displayName: 'Good' }, null],
      }),
      botid: input.botId,
    };
    const parsed = parseStandardComponents([component], input.botId, input.botName, 'generative', 'zip');
    extract.mockResolvedValue({ ...stageA, ...parsed, localPatterns: buildLocalPatterns(parsed) });
    evaluatePatterns.mockResolvedValue({ Patterns: [] });
    const { reviewResult } = await executeReviewPipeline(input);
    const stored: PatternEvaluation = JSON.parse(reviewResult.stageBOutput!);
    const pattern = stored.Patterns.find(item => item.PatternName === 'Missing Input Variable Description')!;
    expect(pattern.Topics.map(topic => topic.assessmentStatus)).toEqual(['fail', 'not-assessed']);
    expect(reviewResult.totalIssueCount).toBe(1);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ stageBOutput: reviewResult.stageBOutput }));
    const finding = generateSARIF(reviewResult).runs[0].results.find(item => item.ruleId === pattern.PatternId)!;
    expect(finding.locations).toHaveLength(1);
    expect(finding.properties?.affectedSettings).toEqual([pattern.Topics[0]]);
    expect(finding.properties?.recordedReferences).toEqual(pattern.Topics);
  });

  it('preserves independent routing advice beside an ambiguous reference through save and SARIF', async () => {
    const source: LocalStageAOutput = {
      ...stageA, localPatterns: [], tools: ['Tool A', 'Shared'], toolCount: 2,
      toolDetails: [
        { name: 'Tool A', componentId: 'tool-a', toolType: 'connector', description: 'Do stuff.' },
        { name: 'Shared', componentId: 'tool-b', toolType: 'connector', description: 'Shared purpose.' },
      ],
      childAgents: [{ name: 'Shared', componentId: 'child-b', description: 'Shared purpose.' }],
    };
    extract.mockResolvedValue(source);
    evaluatePatterns.mockResolvedValue(validateStandardPatternEvaluation({
      Patterns: [{
        PatternId: 'routing-advice', PatternName: 'Tool Routing Gap', Status: false,
        Recommendation: 'Clarify each tool purpose.',
        Topics: [{ item: 'Tool A', componentId: 'tool-a', current: 'Do stuff.' }, { item: 'Shared' }],
      }],
    }, source));
    const { reviewResult } = await executeReviewPipeline(input);
    const stored: PatternEvaluation = JSON.parse(reviewResult.stageBOutput!);
    const pattern = stored.Patterns.find(item => item.PatternId === 'routing-advice')!;
    expect(pattern.AssessmentStatus).toBe('fail');
    expect(pattern.Topics.map(topic => topic.assessmentStatus)).toEqual(['fail', 'not-assessed']);
    expect(reviewResult.totalIssueCount).toBe(1);
    const finding = generateSARIF(reviewResult).runs[0].results.find(item => item.ruleId === pattern.PatternId)!;
    expect(finding.locations?.map(location => location.physicalLocation.artifactLocation.uri)).toEqual(['copilot://topics/tool-a']);
    expect(finding.properties?.recordedReferences).toEqual(pattern.Topics);
  });

  it.each([
    { count: 16, child: false, patternName: 'Excessive Tools Usage' },
    { count: 6, child: true, patternName: 'Child Agent Architecture Sprawl' },
  ])('preserves exact resource identities through $patternName, save input, and SARIF', async example => {
    const components = Array.from({ length: example.count }, (_, index) => ({
      ...makeResource(`Unique resource ${index}`, example.child
        ? { kind: 'AgentDialog', beginDialog: { description: 'Handle workshop requests.' } }
        : {
          kind: 'TaskDialog', action: index % 2
            ? { kind: 'InvokeConnectedAgentTaskAction', botSchemaName: `synthetic.target${index}` }
            : { kind: 'InvokeConnectorTaskAction' },
        }),
      botid: input.botId, name: 'Shared resource',
    }));
    const parsed = parseStandardComponents(components, input.botId, input.botName, 'generative', 'live');
    const localPatterns = buildLocalPatterns(parsed);
    extract.mockResolvedValue({ ...stageA, ...parsed, localPatterns });

    const { reviewResult } = await executeReviewPipeline(input);
    const stored: PatternEvaluation = JSON.parse(reviewResult.stageBOutput!);
    const finding = stored.Patterns.find(pattern => pattern.PatternName === example.patternName);
    expect(finding?.AssessmentStatus).toBe('fail');
    expect(finding?.Topics).toHaveLength(example.count);
    expect(finding?.Topics.every(topic => topic.assessmentStatus === 'fail' && topic.assessmentReason?.trim())).toBe(true);
    expect(finding?.Topics).toEqual(expect.arrayContaining(components.map(component =>
      expect.objectContaining({
        item: 'Shared resource', componentId: component.botcomponentid, schemaName: component.schemaname,
      }))));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ stageBOutput: reviewResult.stageBOutput }));

    const exported = generateSARIF(reviewResult).runs[0].results.find(result => result.ruleId === finding?.PatternId);
    expect(new Set(exported?.locations?.map(location => location.physicalLocation.artifactLocation.uri)).size)
      .toBe(example.count);
    expect(exported?.properties?.affectedSettings).toEqual(finding?.Topics);
  });

  it.each([0, 1])('retains legacy name-only entries without borrowing %i known tool identities', count => {
    const components = Array.from({ length: 16 }, (_, index) => ({
      ...makeResource(`Unique tool ${index}`, { kind: 'TaskDialog', action: { kind: 'InvokeConnectorTaskAction' } }),
      name: 'Shared tool',
    }));
    const parsed = parseStandardComponents(components, input.botId, input.botName, 'generative', 'live');
    const finding = buildLocalPatterns({
      ...parsed, toolDetails: count ? parsed.toolDetails?.slice(0, count) : undefined,
    }).find(pattern => pattern.patternName === 'Excessive Tools Usage');

    expect(finding?.affectedItems).toHaveLength(16);
    expect(finding?.affectedItems?.filter(item => item.componentId)).toHaveLength(count);
    expect(finding?.affectedItems?.filter(item => item.assessmentStatus === 'fail')).toHaveLength(count);
    expect(finding?.affectedItems?.filter(item => item.assessmentStatus === 'not-assessed')).toHaveLength(16 - count);
    expect(finding?.affectedItems?.filter(item => !item.componentId).every(item =>
      item.item === 'Shared tool' && item.schemaName === undefined && item.evidence?.status === 'unavailable'))
      .toBe(true);
  });

  it('uses only the selected ZIP agent and its configuration without live data access', async () => {
    const selectedComponents = [{ botcomponentid: 'selected-component' }];
    const configuration = '{"settings":{"GenerativeActionsEnabled":false}}';
    extractFromData.mockResolvedValueOnce({
      ...structuredClone(stageA),
      source: 'zip',
      connectedAgents: [{
        name: 'HR connection',
        componentId: 'connection-1',
        targetSchemaName: 'synthetic.agent.hr',
      }],
    });
    parseZip.mockResolvedValue({
      bots: [
        { schemaName: 'selected', name: 'Selected agent', configuration, iconBase64: 'ROOT' },
        {
          schemaName: 'synthetic.agent.hr',
          name: 'HR Assistant',
          configuration: '{}',
          iconBase64: 'TARGET',
        },
        { schemaName: 'other', name: 'Other agent', configuration: '{}', iconBase64: 'OTHER' },
      ],
      componentsBySchemaName: { selected: selectedComponents, other: [{ botcomponentid: 'other-component' }] },
    });
    await executeReviewPipeline({ ...input, zipFile: new File([], 'synthetic.zip'), zipBotSchemaName: 'selected' });
    expect(extract).not.toHaveBeenCalled();
    expect(extractFromData).toHaveBeenCalledWith(expect.objectContaining({ configuration }), selectedComponents);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      sourceEnvironment: 'zip',
      connectedAgentTargets: [{
        schemaName: 'synthetic.agent.hr',
        name: 'HR Assistant',
        iconBase64: 'data:image/png;base64,TARGET',
      }],
    }));
  });

  it('stops a ZIP review before extraction when the selected agent has an unsupported harness', async () => {
    parseZip.mockResolvedValue({
      bots: [{
        schemaName: 'selected',
        name: 'Selected agent',
        configuration: '{"agentSettings":{"$kind":"FutureAgentSettings"}}',
        iconBase64: 'ROOT',
        harness: 'unsupported',
      }],
      componentsBySchemaName: { selected: [{ botcomponentid: 'selected-component' }] },
    });

    await expect(executeReviewPipeline({ ...input, zipFile: new File([], 'synthetic.zip'), zipBotSchemaName: 'selected' }))
      .rejects.toThrow(UNSUPPORTED_HARNESS_MESSAGE);
    expect(extract).not.toHaveBeenCalled();
    expect(extractFromData).not.toHaveBeenCalled();
    expect(evaluateWorkflow).not.toHaveBeenCalled();
    expect(evaluatePatterns).not.toHaveBeenCalled();
    expect(evaluateInstructions).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('does not fall back to a live review when ZIP selection information is absent', async () => {
    await expect(executeReviewPipeline({ ...input, zipFile: new File([], 'synthetic.zip') }))
      .rejects.toThrow('Select an agent');
    expect(extract).not.toHaveBeenCalled();
    expect(evaluatePatterns).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('reattaches to the saved workflow job and attributes only workflow-served stages', async () => {
    const progress: Array<Parameters<NonNullable<Parameters<typeof executeReviewPipeline>[1]>>[0]> = [];
    const onJobSubmitted = vi.fn();

    await executeReviewPipeline(
      {
        ...input,
        existingJobId: 'existing-job',
        startedAt: '2026-09-12T01:00:00.000Z',
      },
      (stages) => progress.push(stages),
      onJobSubmitted,
    );

    expect(evaluateWorkflow).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      {
        existingJobId: 'existing-job',
        onJobSubmitted,
        onJobPoll: expect.any(Function),
      },
    );

    const first = progress[0];
    expect(first.find(stage => stage.stageName === 'Evaluating Patterns')?.attribution)
      .toBe('workflow-agent');
    expect(first.find(stage => stage.stageName === 'Checking Compliance')?.attribution)
      .toBe('workflow-agent');
    expect(first.filter(stage => stage.attribution).map(stage => stage.stageName))
      .toEqual(['Evaluating Patterns', 'Checking Compliance']);
  });

  it('reports a queued workflow delay without failing the review', async () => {
    const progress: Array<Parameters<NonNullable<Parameters<typeof executeReviewPipeline>[1]>>[0]> = [];
    evaluateWorkflow.mockImplementationOnce(async (
      source: LocalStageAOutput,
      _context: unknown,
      options: { onJobPoll?: (row: unknown, elapsedMs: number) => void },
    ) => {
      // The thresholds straddle UNCLAIMED_JOB_TIMEOUT_MS, which is five minutes.
      options.onJobPoll?.({ cat_jobstatus: 1 }, 299_999);
      options.onJobPoll?.({ cat_jobstatus: 1 }, 300_000);
      options.onJobPoll?.({ cat_jobstatus: 2 }, 300_001);
      return {
        patternEvaluation: await evaluatePatterns(source),
        instructionEvaluation: await evaluateInstructions(source.agentInstructions),
        rejectedCandidateCount: 0,
        workflowProvenance: {
          jobId: 'synthetic-job',
          correlationId: 'synthetic-correlation',
          reviewPolicyVersion: 'standard-review-2',
          retrievedAt: '2026-09-12T05:36:51.000Z',
          rejectedCandidateCount: 0,
          units: [],
        },
      };
    });

    await executeReviewPipeline(
      input,
      (stages) => progress.push(structuredClone(stages)),
    );

    const delayedIndex = progress.findIndex((stages) =>
      stages.find((stage) => stage.stageName === 'Evaluating Patterns')
        ?.detail?.includes('Queued in Dataverse'));
    expect(delayedIndex).toBeGreaterThan(-1);
    expect(progress.slice(0, delayedIndex).every((stages) =>
      stages.find((stage) => stage.stageName === 'Evaluating Patterns')
        ?.detail === undefined)).toBe(true);
    expect(progress.slice(delayedIndex + 1).some((stages) => {
      const stage = stages.find((item) => item.stageName === 'Evaluating Patterns');
      return stage?.status === 'active' && stage.detail === undefined;
    })).toBe(true);
  });
});
