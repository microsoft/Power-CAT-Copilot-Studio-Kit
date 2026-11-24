import { describe, expect, it } from 'vitest';
import type { BotComponent } from '../../contracts/ServiceContracts';
import { makeResource, makeTopic, syntheticBot } from '../../services/__tests__/stageAFixtures';
import { compareCapturedDeterministicReview } from '../services/UnifiedReviewComparison';
import { parseNormalizedEvaluationEvidence } from '../services/evaluation/normalizedEvaluationEvidence';
import { buildLocalPatterns } from '../../utils/localPatternBuilder';
import { parseStandardComponents } from '../../utils/stageAParser';
import { evaluateUnifiedRules, runUnifiedRegistry, UNIFIED_DETERMINISTIC_POLICY_VERSION } from '../services/UnifiedRuleEngine';
import { standardNativeEvaluationRules, unifiedEvaluationRules } from '../services/rules/evaluationRules';

const set = (id: string, graders = ['GeneralQualityGrader']): BotComponent => ({
  ...makeResource(id, { kind: 'EvaluationSet', graders: graders.map(kind => ({ kind })) }),
  botcomponentid: id,
});
const cases = (id: string, setId: string, rows: Record<string, unknown>[]): BotComponent => ({
  ...makeResource(id, { kind: 'EvaluationData', rows }), parentbotcomponentid: setId,
});
const metadata = { botId: syntheticBot.botId, name: syntheticBot.name, configuration: syntheticBot.configuration };

describe('same-capture deterministic comparison', () => {
  it('preserves the distinct Standard count threshold alongside newly applied evaluation checks', () => {
    const components = [makeTopic({ modelDescription: '' }), set('s'), cases('c', 's', [{ input: 'Find a workshop' }])];
    const comparison = compareCapturedDeterministicReview({ harness: 'standard', metadata, components });
    expect(comparison.changes.find(c => c.ruleId === 'local-pattern-2')).toMatchObject({
      classification: 'existing', previousOutcome: 'fail', currentOutcome: 'fail', predicateChanged: false,
    });
    expect(comparison.changes.find(c => c.ruleId === 'EVL-01')).toMatchObject({
      classification: 'new', previousOutcome: null, currentOutcome: 'pass',
    });
    expect(comparison.current.assessments.find(a => a.ruleId === 'local-pattern-8')).toMatchObject({
      kind: 'check', severity: 'medium', outcome: 'fail',
    });
    expect(comparison.current.assessments.filter(a => a.ruleId === 'local-pattern-8')).toHaveLength(1);
    expect(comparison.current.assessments.find(a => a.ruleId === 'local-pattern-8')?.fact).toContain('configured-test-component');
    expect(comparison.current.score.contributions.find(c => c.key === 'standard:local-pattern-8:agent')).toMatchObject({
      earnedWeight: 0, possibleWeight: 0.5,
    });
    expect(comparison.previous.score.origin).toBe('same-capture-recomputation');
    const parsed = parseStandardComponents(components, metadata.botId, metadata.name, 'generative', 'live');
    expect(buildLocalPatterns(parsed).find(p => p.patternId === 'local-pattern-8')?.assessmentStatus).toBe('fail');
  });
  it('uses unchanged Copilot predicates while allowing legacy and new weighting to differ', () => {
    const components = [makeResource('Find workshops', {
      kind: 'ConnectorTool', description: '', connectorId: 'workshops', operationId: 'find',
      connectionReference: 'connection', authMode: 'Invoker',
    })];
    const comparison = compareCapturedDeterministicReview({
      harness: 'copilot', components,
      metadata: { ...metadata, configuration: JSON.stringify({ agentSettings: { instructions: 'Help users find workshops and clarify missing information before acting.' } }) },
    });
    expect(comparison.changes.find(c => c.ruleId === 'TOL-02')).toMatchObject({
      classification: 'existing', previousOutcome: 'fail', currentOutcome: 'fail',
    });
    expect(comparison.sameRule.previous.value).not.toBe(comparison.sameRule.current.value);
    expect(comparison.previous.score.label).not.toMatch(/saved|historic/i);
    // 29 after INS-07/SKL-09 left for the AI catalog and INS-09/SKL-15/WIQ-01–04/TOL-06 joined it.
    expect(comparison.current.assessments).toHaveLength(29);
  });
  it('reads the captured agent authentication mode for TOL-06', () => {
    const components = [makeResource('Find workshops', {
      kind: 'ConnectorTool', description: '', connectorId: 'workshops', operationId: 'find',
      connectionReference: 'connection', authMode: 'Invoker',
    })];
    const configuration = JSON.stringify({ agentSettings: { instructions: 'Help users find workshops and clarify missing information before acting.' } });
    for (const [authenticationMode, outcome] of [[1, 'fail'], [2, 'pass'], [undefined, 'could-not-run']] as const) {
      const comparison = compareCapturedDeterministicReview({
        harness: 'copilot', components, metadata: { ...metadata, configuration, authenticationMode },
      });
      expect(comparison.changes.find(c => c.ruleId === 'TOL-06')?.currentOutcome).toBe(outcome);
    }
  });
  it('retains null scores for an unavailable capture rather than trusting parser defaults', () => {
    for (const harness of ['standard', 'copilot'] as const) {
      const comparison = compareCapturedDeterministicReview({
        harness, metadata, components: [], availability: { components: 'unavailable', configuration: 'unavailable' },
      });
      expect(comparison.current.score).toMatchObject({ value: null, incomplete: true });
      expect(comparison.previous.score).toMatchObject({ value: null, incomplete: true });
    }
  });
  it('preserves CP1 opt-in boundaries and namespaces shared EVL IDs by harness', () => {
    const model = parseStandardComponents([makeTopic()], metadata.botId, metadata.name, 'generative', 'live');
    const context = { harness: 'standard', model } as const;
    expect(evaluateUnifiedRules(context).assessments).toHaveLength(13);
    expect(evaluateUnifiedRules(context).policyVersion).toBe(UNIFIED_DETERMINISTIC_POLICY_VERSION);
    expect(() => runUnifiedRegistry(context, [standardNativeEvaluationRules[0], unifiedEvaluationRules[0]])).not.toThrow();
    expect(() => runUnifiedRegistry(context, [standardNativeEvaluationRules[0], standardNativeEvaluationRules[0]])).toThrow(/Duplicate/);
  });
  it('does not convert malformed captured instructions into a real missing-instructions failure', () => {
    const comparison = compareCapturedDeterministicReview({
      harness: 'copilot', components: [],
      metadata: { ...metadata, configuration: JSON.stringify({ agentSettings: { instructions: { unsupported: true } } }) },
    });
    expect(comparison.changes.find(c => c.ruleId === 'INS-01')).toMatchObject({
      previousOutcome: 'fail', currentOutcome: 'could-not-run', classification: 'evidence-semantics',
      predicateChanged: false,
    });
    expect(comparison.previous.score.incomplete).toBe(true);
  });
  it('uses the same host-normalized Standard view on both sides while retaining raw evaluation evidence and counts', () => {
    const topic = makeTopic({ modelDescription: '' });
    const evaluation = { ...set('s'), componenttype: '19', data: 'kind: TestSetDefinition\ngraders: []\n' };
    const voice = makeResource('voice', { kind: 'AdaptiveDialog', beginDialog: { kind: 'OnSilence' } });
    const result = compareCapturedDeterministicReview({
      harness: 'standard', metadata, components: [topic, evaluation, voice], expectedComponentCount: 3,
      standardComponents: [topic, { ...evaluation, data: 'graders: []\n' }],
    });
    expect(result.changes.find(c => c.ruleId === 'local-pattern-2')).toMatchObject({
      previousOutcome: 'fail', currentOutcome: 'fail', predicateChanged: false,
    });
    expect(result.changes.find(c => c.ruleId === 'local-pattern-7')).toMatchObject({
      previousOutcome: 'pass', currentOutcome: 'pass',
    });
    expect(result.evaluation).toMatchObject({ availability: 'complete', capturedComponentCount: 3 });
    expect(result.evaluation?.evaluationSets).toHaveLength(1);
  });
  it('compares the same completed checks even when completeness flags differ but outcomes do not', () => {
    const result = compareCapturedDeterministicReview({
      harness: 'copilot', components: [makeResource('flow', { kind: 'HoloDeckTool' })],
      metadata: { ...metadata, configuration: JSON.stringify({ agentSettings: { instructions: 'Help users find workshops and clarify missing information before acting.' } }) },
    });
    expect(result.changes.find(c => c.ruleId === 'INS-01')).toMatchObject({
      previousOutcome: 'pass', currentOutcome: 'pass', classification: 'existing',
    });
    expect(result.sameRule.current.contributions).toContainEqual({
      key: 'copilot:INS-01:agent', earnedWeight: 1, possibleWeight: 1,
    });
    expect(result.sameRule.previous.value).not.toBeNull();
  });
  it('retains existing local decisions with visible incomplete evidence instead of applying a blanket downgrade', () => {
    const components = [
      makeTopic(), ...Array.from({ length: 10 }, (_, index) => set(`set-${index}`)),
    ];
    const comparison = compareCapturedDeterministicReview({
      harness: 'standard', metadata, components, expectedComponentCount: components.length + 1,
    });
    for (const change of comparison.changes.filter(c => c.ruleId.startsWith('local-pattern-')
      && (c.previousOutcome === 'pass' || c.previousOutcome === 'fail'))) {
      expect(change.currentOutcome).toBe(change.previousOutcome);
      expect(change.classification).toBe('existing');
    }
    expect(comparison.current.assessments.find(a => a.ruleId === 'local-pattern-8')).toMatchObject({
      kind: 'check', severity: 'medium', outcome: 'pass', incomplete: true,
    });
    expect(comparison.current.score.contributions.find(c => c.key === 'standard:local-pattern-8:agent')).toMatchObject({
      earnedWeight: 0.5, possibleWeight: 0.5,
    });
    expect(comparison.current.assessments.find(a => a.ruleId === 'local-pattern-7')).toMatchObject({
      outcome: 'pass', incomplete: true,
    });
    const model = parseStandardComponents(components, metadata.botId, metadata.name, 'generative', 'live');
    model.parsingErrors = ['An additional component was not captured.'];
    expect(evaluateUnifiedRules({ harness: 'standard', model }).assessments.find(a => a.ruleId === 'local-pattern-7')?.outcome)
      .toBe('could-not-run');
    expect(comparison.current.score.incomplete).toBe(true);
    const unresolved = compareCapturedDeterministicReview({
      harness: 'standard', metadata,
      components: [...components, makeResource('unresolved', { kind: 'UnrecognizedComponent' })],
    });
    expect(unresolved.changes.find(c => c.ruleId === 'local-pattern-7')).toMatchObject({
      previousOutcome: 'could-not-run', currentOutcome: 'could-not-run',
    });
  });
  it('does not turn execution errors into preserved local passes', async () => {
    const { preserveStandardComparisonOutcome } = await import('../services/rules/standardComparisonRule');
    const { standardEvaluationRules } = await import('../services/rules/evaluationRules');
    const model = parseStandardComponents([makeTopic()], metadata.botId, metadata.name, 'generative', 'live');
    const report = runUnifiedRegistry({ harness: 'standard', model }, [preserveStandardComparisonOutcome({
      ...standardEvaluationRules[0], evaluate: () => { throw new Error('Unreadable evaluation input'); },
    })]);
    expect(report.assessments[0]).toMatchObject({ outcome: 'could-not-run', incomplete: true });
    expect(report.score.value).toBeNull();
  });
});

describe('normalized Standard evaluation evidence', () => {
  it('retains all sets and every EvaluationData row using the existing parser mappings', () => {
    const evidence = parseNormalizedEvaluationEvidence([
      set('first'), set('second', ['CompareMeaningGrader']),
      cases('batch', 'first', [{ input: 'One' }, { input: 'Two', expectedOutput: 'Two answer' }]),
      cases('other', 'second', [{ input: 'Three' }]),
    ], { source: 'live' });
    expect(evidence.availability).toBe('complete');
    expect(evidence.evaluationSets).toHaveLength(2);
    expect(evidence.testCases.map(c => c.input)).toEqual(['One', 'Two', 'Three']);
    expect(new Set(evidence.testCases.map(c => c.schemaname)).size).toBe(3);
  });
  it('limits expected-response requirements to cases linked to the relevant set', () => {
    const comparison = compareCapturedDeterministicReview({
      harness: 'standard', metadata,
      components: [makeTopic(), set('general'), set('similarity', ['CompareMeaningGrader']),
        cases('g', 'general', [{ input: 'No expected answer needed' }]),
        cases('s', 'similarity', [{ input: 'Expected', expectedOutput: 'Answer' }])],
    });
    expect(comparison.current.assessments.find(a => a.ruleId === 'EVL-04')?.outcome).toBe('pass');
  });
  it('distinguishes known-empty live capture, incomplete known counts and ZIP absence', () => {
    expect(parseNormalizedEvaluationEvidence([], { source: 'live' }).availability).toBe('complete');
    expect(parseNormalizedEvaluationEvidence([], { source: 'zip' }).availability).toBe('unavailable');
    expect(parseNormalizedEvaluationEvidence([set('s')], { source: 'live', expectedComponentCount: 2 }).availability).toBe('partial');
    const empty = compareCapturedDeterministicReview({ harness: 'standard', metadata, components: [makeTopic()] });
    expect(empty.current.assessments.find(a => a.ruleId === 'EVL-01')?.outcome).toBe('fail');
  });
  it('retains confirmed expected-response failures beside malformed rows instead of treating all evidence as complete', () => {
    const comparison = compareCapturedDeterministicReview({
      harness: 'standard', metadata,
      components: [makeTopic(), set('s', ['CompareMeaningGrader']),
        cases('batch', 's', [{ input: 'Valid case with missing answer' }, { input: 17 }])],
    });
    expect(comparison.evaluation).toMatchObject({ availability: 'partial' });
    expect(comparison.evaluation?.testCases).toHaveLength(1);
    expect(comparison.current.assessments.find(a => a.ruleId === 'EVL-04')).toMatchObject({ outcome: 'fail', incomplete: true });
    expect(comparison.current.assessments.find(a => a.ruleId === 'EVL-05')?.outcome).toBe('could-not-run');
  });
  it('recognizes Standard TestSetDefinition without counting the set itself as a case', () => {
    const evidence = parseNormalizedEvaluationEvidence([
      { ...set('standard-set'), data: 'kind: TestSetDefinition\ngraders:\n  - GeneralQualityGrader\n' },
      cases('batch', 'standard-set', [{ input: 'One' }, { input: 'Two' }]),
    ], { source: 'live' });
    expect(evidence).toMatchObject({ availability: 'complete', evaluationComponentCount: 2 });
    expect(evidence.evaluationSets).toHaveLength(1);
    expect(evidence.testCases).toHaveLength(2);
  });
  it('does not invent a set link for an ambiguous case or silently pass unsupported evaluation kinds', () => {
    const unlinked = { ...cases('unlinked', 's', [{ input: 'No parent link' }]), parentbotcomponentid: undefined };
    for (const graders of [['CompareMeaningGrader'], ['GeneralQualityGrader']]) {
      const comparison = compareCapturedDeterministicReview({
        harness: 'standard', metadata,
        components: [makeTopic(), set('s', graders), unlinked],
      });
      expect(comparison.current.assessments.find(a => a.ruleId === 'EVL-04')?.outcome).toBe('could-not-run');
    }
    const unsupported = parseNormalizedEvaluationEvidence([
      makeResource('unsupported', { kind: 'SingleTurnEvaluationCase', input: 'Unknown shape' }),
    ], { source: 'live' });
    expect(unsupported.availability).toBe('partial');
    expect(unsupported.diagnostics.join(' ')).toContain('not supported');
  });
  it('preserves legacy one-row mapping while the new evaluation reader retains all rows', async () => {
    const { parseAgentsExperience } = await import('../services/AgentsExperienceParser');
    const components = [set('s'), cases('batch', 's', [{ input: 'First' }, { input: 'Second' }])];
    expect(parseAgentsExperience('{}', components).testCases.map(c => c.input)).toEqual(['First']);
    expect(parseNormalizedEvaluationEvidence(components, { source: 'live' }).testCases.map(c => c.input))
      .toEqual(['First', 'Second']);
  });
  it('does not treat malformed expected conversation text as a confirmed missing response', () => {
    const conversation = {
      ...makeResource('conversation', {
        kind: 'MultiTurnEvaluationCase',
        activities: [
          { activity: { value: { from: { role: 'user' } }, text: ['Find workshops'] } },
          { activity: { value: { from: { role: 'agent' } }, text: { invalid: true } } },
        ],
      }),
      parentbotcomponentid: 's',
    };
    const result = compareCapturedDeterministicReview({
      harness: 'standard', metadata, components: [makeTopic(), set('s', ['CompareMeaningGrader']), conversation],
    });
    expect(result.evaluation?.availability).toBe('partial');
    expect(result.current.assessments.find(a => a.ruleId === 'EVL-04')?.outcome).toBe('could-not-run');
  });
  it('resolves raw OData parent lookup fields without changing legacy parser outcomes', async () => {
    const row = {
      ...cases('c', 's', [{ input: 'Expected response missing' }]),
      parentbotcomponentid: undefined, _parentbotcomponentid_value: 's',
    };
    const components = [set('s', ['CompareMeaningGrader']), row];
    const result = compareCapturedDeterministicReview({ harness: 'standard', metadata, components });
    expect(result.evaluation?.testCases[0].setId).toBe('s');
    expect(result.evaluation?.unlinkedCaseIds).toEqual([]);
    expect(result.current.assessments.find(a => a.ruleId === 'EVL-04')?.outcome).toBe('fail');
    const { parseAgentsExperience } = await import('../services/AgentsExperienceParser');
    expect(parseAgentsExperience('{}', components).testCases[0].setId).toBeUndefined();
  });
  it('does not borrow graders when typed and OData parent links contradict one another', () => {
    const row = {
      ...cases('c', 'similarity', [{ input: 'Ambiguous parent' }]),
      _parentbotcomponentid_value: 'general',
    };
    const result = compareCapturedDeterministicReview({
      harness: 'standard', metadata,
      components: [set('similarity', ['CompareMeaningGrader']), set('general'), row],
    });
    expect(result.evaluation?.availability).toBe('partial');
    expect(result.evaluation?.unlinkedCaseIds).toHaveLength(1);
    expect(result.current.assessments.find(a => a.ruleId === 'EVL-04')?.outcome).toBe('could-not-run');
  });
  it('retains verified existential passes without claiming unsupported cases are fully covered', () => {
    const conversation = {
      ...makeResource('conversation', {
        kind: 'MultiTurnEvaluationCase',
        activities: [{ activity: { value: { from: { role: 'user' } }, text: ['Find workshops'] } }],
      }),
      parentbotcomponentid: 's',
    };
    const result = compareCapturedDeterministicReview({
      harness: 'standard', metadata,
      components: [set('s', ['CompareMeaningGrader']), conversation,
        { ...makeResource('legacy', { kind: 'TestCaseDefinition', transcriptDefinition: {} }), componenttype: '19' }],
    });
    expect(result.evaluation?.availability).toBe('partial');
    for (const ruleId of ['EVL-01', 'EVL-03', 'EVL-05', 'EVL-06']) {
      expect(result.current.assessments.find(a => a.ruleId === ruleId)).toMatchObject({
        outcome: 'pass', incomplete: true,
      });
    }
    expect(result.current.assessments.find(a => a.ruleId === 'EVL-04')).toMatchObject({
      outcome: 'fail', incomplete: true,
    });
  });
  it('normalizes captured legacy single-activity transcript shapes without confusing intent assertions with response text', () => {
    const assertions = [
      [{ kind: 'CosineEmbeddingSimilarityAssertion', expectedResponse: 'A reference answer.', scoreThreshold: 0.8 }],
      [{ kind: 'ContainsAllAssertion', expectedResponses: ['first', 'second'] }],
      [{ kind: 'IntentMatchAssertion', expectedResponse: 'topic.route', scoreThreshold: 0.8 }],
      [{ kind: 'IntentMatchAssertion', expectedResponse: 'another.route', scoreThreshold: 0.8 }],
      [{ kind: 'ContainsAnyAssertion', expectedResponses: ['first', 'second'] }],
      ['AbstentionAssertion', 'RelevanceAssertion', 'CompletenessAssertion', 'GroundednessAssertion'].map(kind => ({ kind })),
    ];
    const components = [
      { ...set('legacy-set'), componenttype: '19', data: 'kind: TestSetDefinition\n' },
      ...assertions.map((activityAssertions, index) => ({
        ...makeResource(`legacy-case-${index}`, {
          kind: 'TestCaseDefinition', transcriptDefinition: {
            testActivities: [{ kind: 'SendUserActivity', originType: 'Manual', activity: 'Find workshops', activityAssertions }],
          },
        }),
        componenttype: '19', _parentbotcomponentid_value: 'legacy-set',
      })),
    ];
    const evidence = parseNormalizedEvaluationEvidence(components, { source: 'live', expectedComponentCount: 7 });
    expect(evidence).toMatchObject({ availability: 'complete', evaluationComponentCount: 7, unlinkedCaseIds: [] });
    expect(evidence.testCases).toHaveLength(6);
    expect(evidence.multiTurnCases).toHaveLength(0);
    expect(evidence.testCases.map(c => c.expected)).toEqual(['A reference answer.', undefined, undefined, undefined, undefined, undefined]);
    expect(evidence.caseAssertions).toHaveLength(9);
    expect(evidence.caseAssertions).toContainEqual(expect.objectContaining({
      kind: 'IntentMatchAssertion', expectedResponse: 'topic.route',
      fieldPath: 'transcriptDefinition.testActivities[0].activityAssertions[0]',
    }));
  });
  it('keeps unsupported or malformed legacy transcript assertions incomplete instead of fabricating cases', () => {
    for (const activity of [
      { kind: 'SendEventActivity', activity: 'An event' },
      { kind: 'SendUserActivity', activity: 'A request', activityAssertions: [{ kind: 'FutureAssertion' }] },
      { kind: 'SendUserActivity', activity: 'A request', activityAssertions: [{ kind: 'CosineEmbeddingSimilarityAssertion', expectedResponse: 17 }] },
    ]) {
      const evidence = parseNormalizedEvaluationEvidence([{
        ...makeResource('legacy-case', {
          kind: 'TestCaseDefinition', transcriptDefinition: { testActivities: [activity] },
        }),
        componenttype: '19',
      }], { source: 'live' });
      expect(evidence.availability).toBe('partial');
      expect(evidence.testCases).toHaveLength(0);
    }
  });
});
