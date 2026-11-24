import { describe, expect, it } from 'vitest';
import type { LocalStageAOutput, Pattern, PatternTopic, StageBTopicComponent } from '../../contracts/StageOutputs';
import { STANDARD_REVIEW_POLICY_VERSION } from '../reviewAssessment';
import { validateStandardPatternEvaluation } from '../standardPatternValidation';

/**
 * Pattern-evaluation policy, exercised directly against the validator.
 *
 * These assertions used to reach the validator through the retired Stage B AI Builder
 * call. The validator is unchanged and still live: `standardReviewWorkflowProjection`
 * closes `projectPatterns` with the same `validateStandardPatternEvaluation`, so every
 * guard below governs the workflow-backed path exactly as it governed Stage B.
 */

const selectedTopic: StageBTopicComponent = {
  TopicName: 'Workshop Selection', TopicId: 'selection', TriggerKind: 'OnRecognizedIntent',
  ModelName: 'Workshop Selection', ModelDescription: 'Select a suitable workshop.',
  RoutingApplicability: { status: 'applicable', reason: 'Generative selection.' },
  NamingApplicability: { status: 'applicable', reason: 'Explicit name.' },
  ParseStatus: 'complete',
};
const eventTopic: StageBTopicComponent = {
  ...selectedTopic, TopicName: 'Workshop Update', TopicId: 'update', TriggerKind: 'OnEventActivity',
  RoutingApplicability: { status: 'not-applicable', reason: 'An explicit event starts this topic.' },
  NamingApplicability: { status: 'not-applicable', reason: 'An explicit event starts this topic.' },
};

function stageA(topics = [selectedTopic, eventTopic]): LocalStageAOutput {
  return {
    botId: 'synthetic-agent', botName: 'Review Demo', topicCount: topics.length,
    toolCount: 0, knowledgeCount: 0, testCaseCount: 0, localPatterns: [],
    topics: topics.map(t => t.TopicName), topicComponents: topics, tools: [], knowledgeSources: [],
    orchestrationMode: 'generative', policyVersion: 'standard-review-2', source: 'zip',
  };
}

const evaluate = (patterns: Pattern[], input = stageA()) =>
  validateStandardPatternEvaluation({ Patterns: patterns }, input);

describe('standard pattern exact topic identity', () => {
  function evaluateReference(reference: PatternTopic, topics: StageBTopicComponent[]) {
    const result = evaluate([{
      PatternId: 'description', PatternName: 'Unclear Model Description', Status: false,
      Recommendation: 'Clarify the description.', Topics: [reference],
    }], stageA(topics));
    return result.Patterns.find(pattern => pattern.PatternName === 'Unclear Model Description');
  }

  it('uses an exact schema to distinguish same-name topics', () => {
    const second = { ...selectedTopic, TopicId: 'second', SchemaName: 'synthetic.second' };
    const result = evaluateReference({
      item: selectedTopic.TopicName, schemaName: second.SchemaName, current: second.ModelDescription,
    }, [{ ...selectedTopic, SchemaName: 'synthetic.first' }, second]);

    expect(result).toMatchObject({
      AssessmentStatus: 'fail',
      Topics: [{ componentId: 'second', schemaName: 'synthetic.second', evidence: { status: 'verified' } }],
    });
  });

  it.each([
    { componentId: 'selection', schemaName: 'synthetic.unrelated' },
    { componentId: 'unmatched', schemaName: 'synthetic.selection' },
    { componentId: 'selection', schemaName: 'synthetic.selection', item: 'Another topic' },
  ])('rejects conflicting supplied identity fields: %j', identity => {
    const result = evaluateReference({
      item: selectedTopic.TopicName, ...identity, current: selectedTopic.ModelDescription,
    }, [{ ...selectedTopic, SchemaName: 'synthetic.selection' }]);

    expect(result).toMatchObject({
      AssessmentStatus: 'not-assessed', Topics: [{ evidence: { status: 'unverified' } }],
    });
  });

  it('does not verify a supplied schema absent from the snapshot', () => {
    const result = evaluateReference({
      item: selectedTopic.TopicName, componentId: selectedTopic.TopicId, schemaName: 'synthetic.selection',
    }, [selectedTopic]);
    expect(result?.AssessmentStatus).toBe('not-assessed');
  });

  it('retains canonical schema identity for an unambiguous name-only reference', () => {
    const result = evaluateReference({ item: selectedTopic.TopicName }, [
      { ...selectedTopic, SchemaName: 'synthetic.selection' },
    ]);
    expect(result?.Topics[0]).toMatchObject({ componentId: 'selection', schemaName: 'synthetic.selection' });
  });

  it('does not disambiguate same-name topics without stable identity', () => {
    const result = evaluateReference({ item: selectedTopic.TopicName }, [
      { ...selectedTopic, SchemaName: 'synthetic.first' },
      { ...selectedTopic, TopicId: 'second', SchemaName: 'synthetic.second' },
    ]);
    expect(result?.AssessmentStatus).toBe('not-assessed');
  });
});

const overlap = (names: string[]): Pattern => ({
  PatternId: 'overlap', PatternName: 'Overlapping Topic Descriptions', Status: false,
  Recommendation: 'Clarify the supported requests.',
  Topics: names.map(item => ({ item })),
});

describe('standard pattern applicability and evidence validation', () => {
  // The validator stamps the policy it actually applied; it does not echo the evaluator's label.
  // Both fixtures deliberately supply the retired 'standard-review-2' so the override is observable.
  it('stamps the current policy version over the one supplied by the evaluator', () => {
    const result = validateStandardPatternEvaluation({
      policyVersion: 'standard-review-2',
      Patterns: [{
        PatternId: 'clarity',
        PatternName: 'Unclear Model Description',
        Category: 'Model Description',
        Status: false,
        AssessmentStatus: 'fail',
        Recommendation: 'Clarify the topic purpose.',
        Topics: [{
          item: selectedTopic.TopicName,
          current: selectedTopic.ModelDescription,
          assessmentStatus: 'fail',
          assessmentReason: 'The model description stays too broad.',
        }],
      }],
      PatternCompliancePercentage: 0,
    }, stageA());

    expect(result.policyVersion).toBe(STANDARD_REVIEW_POLICY_VERSION);
    expect(result.policyVersion).not.toBe('standard-review-2');
    expect(result.Patterns.find(pattern => pattern.PatternName === 'Unclear Model Description'))
      .toMatchObject({
        AssessmentStatus: 'fail',
        Topics: [expect.objectContaining({
          assessmentStatus: 'fail',
          assessmentReason: expect.stringContaining('The model description stays too broad.'),
        })],
      });
  });

  it('excludes an event/selection comparison without turning it into Pass', () => {
    const result = evaluate([overlap([selectedTopic.TopicName, eventTopic.TopicName])]);
    expect(result.Patterns.find(p => p.PatternName === 'Overlapping Topic Descriptions'))
      .toMatchObject({ Status: false, AssessmentStatus: 'not-applicable' });
  });

  it('preserves a comparison of two eligible topics and both reviewed descriptions', () => {
    const second = { ...selectedTopic, TopicName: 'Workshop Choice', TopicId: 'choice' };
    const result = evaluate([overlap([selectedTopic.TopicName, second.TopicName])], stageA([selectedTopic, second]));
    const finding = result.Patterns.find(p => p.PatternName === 'Overlapping Topic Descriptions');
    expect(finding?.AssessmentStatus).toBe('fail');
    expect(finding?.Topics).toEqual([
      expect.objectContaining({ componentId: 'selection', evidence: expect.objectContaining({ quote: selectedTopic.ModelDescription }) }),
      expect.objectContaining({ componentId: 'choice', evidence: expect.objectContaining({ quote: second.ModelDescription }) }),
    ]);
  });

  it('does not invent a valid comparison when one topic cannot be matched', () => {
    const result = evaluate([overlap([selectedTopic.TopicName, 'Unmatched topic'])]);
    expect(result.Patterns.find(p => p.PatternName === 'Overlapping Topic Descriptions')?.AssessmentStatus)
      .toBe('not-assessed');
  });

  it('marks nonmatching quoted text unverified and excludes the unsupported failure', () => {
    const result = evaluate([{
      PatternId: 'unclear', PatternName: 'Unclear Model Description', Status: false,
      Recommendation: 'Clarify the scope.', Topics: [{ item: selectedTopic.TopicName, current: 'Not present in the snapshot.' }],
    }]);
    const finding = result.Patterns.find(p => p.PatternName === 'Unclear Model Description');
    expect(finding?.AssessmentStatus).toBe('not-assessed');
    expect(finding?.Topics[0].evidence?.status).toBe('unverified');
  });

  it('does not treat an omitted check as a pass', () => {
    const result = evaluate([]);
    expect(result.Patterns.find(p => p.PatternName === 'Unclear Model Description')?.AssessmentStatus)
      .toBe('not-assessed');
  });

  it('rejects an unreadable assessment envelope instead of returning an empty successful result', () => {
    expect(() => validateStandardPatternEvaluation({}, stageA())).toThrow(/pattern/i);
  });

  it('does not let a contradictory status bypass evidence validation', () => {
    const result = evaluate([{
      PatternId: 'contradictory', PatternName: 'Unclear Model Description', Status: true,
      AssessmentStatus: 'fail', Recommendation: 'Clarify the description.', Topics: [],
    }]);
    expect(result.Patterns.find(p => p.PatternName === 'Unclear Model Description')?.AssessmentStatus)
      .toBe('not-assessed');
  });

  it('does not assert a clarity pass for an absent description', () => {
    const result = evaluate([{
      PatternId: 'clarity', PatternName: 'Unclear Model Description', Status: true,
      Recommendation: '', Topics: [],
    }], stageA([{ ...selectedTopic, ModelDescription: undefined }]));
    expect(result.Patterns.find(p => p.PatternName === 'Unclear Model Description')?.AssessmentStatus)
      .toBe('not-applicable');
  });

  it('retains verified tool-description advice without calling it a runtime result', () => {
    const input = { ...stageA(), toolCount: 1, tools: ['Find workshop'],
      toolDetails: [{ name: 'Find workshop', componentId: 'workshop-tool', description: 'Find workshops.', toolType: 'connector' as const }] };
    const result = evaluate([{
      PatternId: 'routing', PatternName: 'Tool Routing Gap', Status: false,
      Recommendation: 'Clarify the supported lookup conditions.',
      Topics: [{ item: 'Find workshop', componentId: 'workshop-tool', current: 'Find workshops.' }],
    }], input);
    expect(result.Patterns.find(p => p.PatternName === 'Tool Routing Gap')).toMatchObject({
      AssessmentStatus: 'fail', EvidenceKind: 'potential-risk',
      Topics: [expect.objectContaining({ evidence: expect.objectContaining({ status: 'verified', quote: 'Find workshops.' }) })],
    });
  });

  it('keeps duplicate returned categories as one unassessed check and retains both proposals', () => {
    const result = evaluate(['First proposal.', 'Second proposal.'].map(Recommendation => ({
      PatternId: 'duplicate', PatternName: 'Unclear Model Description', Status: false,
      Recommendation, Topics: [{ item: selectedTopic.TopicName }],
    })));
    const duplicates = result.Patterns.filter(p => p.PatternName === 'Unclear Model Description');
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].AssessmentStatus).toBe('not-assessed');
    expect(duplicates[0].Recommendation).toContain('First proposal.');
    expect(duplicates[0].Recommendation).toContain('Second proposal.');
    expect(new Set(result.Patterns.map(p => p.PatternId)).size).toBe(result.Patterns.length);
  });
});
