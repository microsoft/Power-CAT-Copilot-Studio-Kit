import { describe, expect, it } from 'vitest';
import type { LocalStageAOutput } from '../../contracts/StageOutputs';
import { STANDARD_REVIEW_UNIT_INDEX } from '../../contracts/StandardReviewWorkflow';
import { buildStandardReviewWorkflowCorpus } from '../standardReviewCorpus';
import { projectStandardReviewWorkflow } from '../standardReviewWorkflowProjection';
import { generateCsPdfReport } from '../csPdfUtils';
import { createReportReview, EXPORTED_ON, pdfPageText } from './csPdfFixtures';

const PATTERN_REMEDIATION = {
  findingTitle: 'Workshop route has no selection boundary',
  whyItMatters: 'The agent can select this route for an unsupported workshop request.',
  makerAction: 'State the exact workshop requests that this topic handles and excludes.',
  suggestedText: 'Use this topic only to find workshop schedules. Do not use it to register.',
  acceptanceCheck: 'A schedule request selects this topic and a registration request does not.',
};

const INSTRUCTION_REMEDIATION = {
  findingTitle: 'Unsupported requests have no terminal response',
  whyItMatters: 'The agent can continue without a supported route or a clear user response.',
  makerAction: 'Add a final response for requests outside the supported workshop scope.',
  suggestedText: 'If no workshop route applies, explain the supported scope and stop.',
  acceptanceCheck: 'An unrelated request receives the scope response and does not call a tool.',
};

function stageA(): LocalStageAOutput {
  return {
    botId: 'synthetic-workshop-agent',
    botName: 'Synthetic Workshop Agent',
    topicCount: 1,
    toolCount: 0,
    knowledgeCount: 0,
    testCaseCount: 0,
    topics: ['Find workshop'],
    tools: [],
    knowledgeSources: [],
    orchestrationMode: 'generative',
    source: 'live',
    configurationAvailable: true,
    agentInstructions: 'Help users find workshop schedules. Never guess.',
    localPatterns: [],
    topicComponents: [{
      TopicName: 'Find workshop',
      TopicId: 'topic-find',
      SchemaName: 'synthetic.findWorkshop',
      TriggerKind: 'OnRecognizedIntent',
      RoutingApplicability: {
        status: 'applicable',
        reason: 'The topic is selected by the model.',
      },
      NamingApplicability: {
        status: 'applicable',
        reason: 'A model-facing name is available.',
      },
      ParseStatus: 'complete',
      ModelDescriptionStatus: 'complete',
      InputVariablesStatus: 'complete',
      OutputVariablesStatus: 'complete',
      ModelName: 'Find workshop',
      ModelDescription: 'Handles workshop requests.',
      InputVariables: [],
      OutputVariables: [],
    }],
  };
}

describe('Standard Review workflow PDF integration', () => {
  it('renders agent-specific workflow findings in the accepted useful report structure', async () => {
    const source = stageA();
    const corpus = buildStandardReviewWorkflowCorpus(source, {
      correlationId: 'synthetic-workflow-correlation',
      sourceEnvironment: 'synthetic-environment',
    });
    const instructionsId = corpus.standardReview.reviewUnits.find(
      unit => unit.componentIndex === STANDARD_REVIEW_UNIT_INDEX.INSTRUCTIONS_SCOPE_UX,
    )!.corpus.agent.instructionsComponentId;
    const results = new Map<number, unknown>(
      corpus.standardReview.reviewUnits.map(unit => [
        unit.componentIndex,
        { status: 'complete', findings: [], notAssessed: [] },
      ]),
    );
    results.set(STANDARD_REVIEW_UNIT_INDEX.CONFIGURATION, {
      status: 'complete',
      findings: [{
        ruleId: 'STD-PATTERN-MODEL-DESCRIPTION',
        ...PATTERN_REMEDIATION,
        affectedComponentIds: ['topic-find'],
        evidence: [{
          componentId: 'topic-find',
          fieldPath: 'fields.modelDescription',
          quote: 'Handles workshop requests.',
        }],
      }],
      notAssessed: [],
    });
    results.set(STANDARD_REVIEW_UNIT_INDEX.INSTRUCTIONS_SCOPE_UX, {
      status: 'complete',
      findings: [{
        ruleId: 'out-of-scope-handling',
        ...INSTRUCTION_REMEDIATION,
        affectedComponentIds: [instructionsId],
        evidence: [{
          componentId: instructionsId,
          fieldPath: 'fields.instructions',
          quote: '',
        }],
      }],
      notAssessed: [],
    });

    const projected = projectStandardReviewWorkflow(source, corpus, results);
    const review = createReportReview({
      botId: source.botId,
      botName: source.botName,
      stageAOutput: JSON.stringify(source),
      stageBOutput: JSON.stringify(projected.patternEvaluation),
      stageCOutput: JSON.stringify(projected.instructionEvaluation),
      workflowProvenance: {
        jobId: 'synthetic-workflow-job',
        correlationId: corpus.correlationId,
        reviewPolicyVersion: corpus.reviewPolicyVersion,
        retrievedAt: '2026-09-12T05:36:51.000Z',
        rejectedCandidateCount: projected.rejectedCandidateCount,
        units: corpus.standardReview.reviewUnits.map(unit => ({
          componentIndex: unit.componentIndex,
          unitId: unit.unitId,
          status: 'succeeded',
          findingCount: unit.componentIndex === STANDARD_REVIEW_UNIT_INDEX.CONFIGURATION
            || unit.componentIndex === STANDARD_REVIEW_UNIT_INDEX.INSTRUCTIONS_SCOPE_UX ? 1 : 0,
          notAssessedCount: 0,
        })),
      },
    });
    const blob = await generateCsPdfReport(review, { exportedOn: EXPORTED_ON });
    const pages = pdfPageText(
      Buffer.from(await blob.arrayBuffer()).toString('latin1'),
    );
    const text = pages.join(' ');
    const headings = [
      'Executive summary',
      'Review scope',
      'Pattern assessment',
      'Instruction assessment',
      'Recommended implementation order',
      'Assessment scope and limits',
      'Official references',
    ];

    expect(pages[0]).toContain(source.botName);
    expect(text).not.toContain('False-positive controls');
    expect(headings.map(heading => text.indexOf(heading)))
      .toEqual([...headings.map(heading => text.indexOf(heading))].sort((a, b) => a - b));
    for (const expected of [
      PATTERN_REMEDIATION.findingTitle,
      PATTERN_REMEDIATION.makerAction,
      PATTERN_REMEDIATION.suggestedText,
      PATTERN_REMEDIATION.acceptanceCheck,
      INSTRUCTION_REMEDIATION.findingTitle,
      INSTRUCTION_REMEDIATION.makerAction,
      INSTRUCTION_REMEDIATION.suggestedText,
      INSTRUCTION_REMEDIATION.acceptanceCheck,
      'complete instruction field was reviewed',
    ]) {
      expect(text).toContain(expected);
    }
  });
});
