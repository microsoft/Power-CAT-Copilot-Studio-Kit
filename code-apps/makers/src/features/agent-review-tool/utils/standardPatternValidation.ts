import type {
  AssessmentStatus, LocalStageAOutput, Pattern, PatternEvaluation, PatternTopic, TopicRuleApplicability,
} from '../contracts/StageOutputs';
import { PATTERN_INHERENT_CATEGORY, getCanonicalPatternName, getPatternSeverity } from './patternUtils';
import { getPatternAssessment, STANDARD_REVIEW_POLICY_VERSION } from './reviewAssessment';
import { aggregateTopicScope, getTopicRuleScope, recordValue, textValue } from './topicApplicability';
import { bindPatternEvidence, bindRoutingEvidence, readPatternEvidence } from './patternEvidence';
import { assessPatternReference, readReferenceAssessment, setReferenceAssessment } from './patternReferenceAssessment';
import { parseContextualRemediation } from './standardReviewCandidateValidation';

const canonicalAiRules = [
  'Unclear Model Name', 'Unclear Model Description',
  'Unclear Input Variable Name', 'Unclear Input Variable Description',
  'Unclear Output Variable Name', 'Unclear Output Variable Description',
  'Overlapping Topic Descriptions', 'Tool Routing Gap', 'Missing Trigger Phrases',
];
const supportedAiRules = new Set([
  ...canonicalAiRules,
  'Unclear Topic Name',
  'Unclear Topic Description',
  'Missing Trigger Phrases',
]);

function parsePattern(value: unknown, index: number): Pattern {
  const row = recordValue(value);
  if (!row || typeof row.PatternName !== 'string' || typeof row.Status !== 'boolean'
    || !Array.isArray(row.Topics) || typeof row.Recommendation !== 'string') {
    throw new Error(`Stage B returned an unreadable pattern at position ${index + 1}.`);
  }
  const topics: PatternTopic[] = row.Topics.map((value: unknown) => {
    const reference = recordValue(value);
    if (!reference || typeof reference.item !== 'string') {
      throw new Error(`Stage B returned an unreadable topic reference in pattern ${index + 1}.`);
    }
    for (const key of ['variable', 'current', 'suggested', 'componentId', 'schemaName', 'setting']) {
      if (reference[key] != null && typeof reference[key] !== 'string') {
        throw new Error(`Stage B returned unreadable ${key} evidence in pattern ${index + 1}.`);
      }
    }
    const remediation = parseContextualRemediation(reference.remediation);
    if (remediation === null) {
      throw new Error(`Stage B returned unreadable remediation in pattern ${index + 1}.`);
    }
    return {
      item: reference.item, variable: textValue(reference.variable), current: textValue(reference.current),
      suggested: textValue(reference.suggested), componentId: textValue(reference.componentId),
      schemaName: textValue(reference.schemaName), setting: textValue(reference.setting),
      evidence: readPatternEvidence(reference.evidence, index),
      remediation,
      ...readReferenceAssessment(reference),
    };
  });
  const assessment = getPatternAssessment(row);
  const contradictory = row.AssessmentStatus !== undefined && (assessment === 'pass') !== row.Status;
  return {
    PatternId: textValue(row.PatternId) ?? `ai-pattern-${index + 1}`,
    PatternName: row.PatternName,
    Description: textValue(row.Description), PatternDescription: textValue(row.PatternDescription),
    Recommendation: row.Recommendation, Status: !contradictory && assessment === 'pass',
    AssessmentStatus: contradictory ? 'not-assessed' : assessment,
    AssessmentReason: contradictory ? 'The returned status fields contradict each other.' : undefined,
    Topics: topics,
  };
}

function scopeForRule(stageA: LocalStageAOutput, name: string): TopicRuleApplicability {
  if (stageA.configurationAvailable === false) {
    return { status: 'not-assessed', reason: 'No readable component configuration was supplied.' };
  }
  if (name === 'Missing Trigger Phrases') {
    if (stageA.orchestrationMode === 'generative') {
      return { status: 'not-applicable', reason: 'Classic trigger-phrase routing is not used in generative orchestration.' };
    }
    if (stageA.orchestrationMode === 'unknown' || stageA.unknownComponents?.length) {
      return { status: 'not-assessed', reason: 'The orchestration or trigger-phrase population is incomplete.' };
    }
    const classicTopics = stageA.topicComponents.filter(topic =>
      topic.TriggerKind === 'OnRecognizedIntent');
    if (classicTopics.length === 0) {
      return { status: 'not-applicable', reason: 'No classic recognized-intent topics were found in the reviewed configuration.' };
    }
    if (classicTopics.some(topic =>
      topic.ParseStatus === 'unavailable' || !Array.isArray(topic.triggerQueries))) {
      return { status: 'not-assessed', reason: 'Trigger-phrase metadata is unavailable for one or more classic topics.' };
    }
    return { status: 'applicable', reason: 'Classic trigger-phrase authoring can be reviewed for the saved topics.' };
  }
  if (name === 'Tool Routing Gap') {
    if (stageA.orchestrationMode === 'classic') {
      return { status: 'not-applicable', reason: 'Automatic model selection of tools is not used in classic orchestration.' };
    }
    if (stageA.orchestrationMode === 'unknown' || stageA.unknownComponents?.length) {
      return { status: 'not-assessed', reason: 'The orchestration or callable-resource population is incomplete.' };
    }
    const callableCount = stageA.toolCount + (stageA.connectedAgents?.length ?? 0);
    const resources = [...(stageA.toolDetails ?? []), ...(stageA.connectedAgents ?? [])];
    if (callableCount && (resources.length < callableCount || resources.some(resource => !resource.description?.trim()))) {
      return { status: 'not-assessed', reason: 'Some callable descriptions are unavailable for authoring review.' };
    }
    return callableCount > 0
      ? { status: 'applicable', reason: 'Callable resources exist. This is authoring advice, not a runtime routing result.' }
      : { status: 'not-applicable', reason: 'No callable resources were found in the reviewed configuration.' };
  }
  if (name === 'Overlapping Topic Descriptions') {
    if (stageA.orchestrationMode === 'classic') {
      return { status: 'not-applicable', reason: 'Generative model selection is not used in classic orchestration.' };
    }
    if (stageA.orchestrationMode === 'unknown' || stageA.unknownComponents?.length) {
      return { status: 'not-assessed', reason: 'The orchestration or selectable-resource population is incomplete.' };
    }
    const topicCount = stageA.topicComponents.filter(topic =>
      getTopicRuleScope(topic, name).status === 'applicable').length;
    const callableCount = [...(stageA.toolDetails ?? []), ...(stageA.connectedAgents ?? [])]
      .filter(resource => resource.description?.trim()).length;
    return topicCount + callableCount >= 2
      ? { status: 'applicable', reason: 'At least two reviewed descriptions can participate in generative selection.' }
      : { status: 'not-applicable', reason: 'Fewer than two reviewed descriptions can participate in generative selection.' };
  }
  if (name === 'Unclear Topic Name') {
    const scopes: TopicRuleApplicability[] = stageA.topicComponents.map(topic => topic.ParseStatus === 'unavailable'
      ? { status: 'not-assessed', reason: 'The topic configuration could not be read.' } as TopicRuleApplicability
      : topic.RoutingApplicability ?? { status: 'not-assessed', reason: 'Routing applicability is unavailable.' } as TopicRuleApplicability);
    if (stageA.unknownComponents?.length || scopes.some(scope => scope.status === 'not-assessed')) {
      return scopes.find(scope => scope.status === 'not-assessed')
        ?? { status: 'not-assessed', reason: 'Some topic metadata is unavailable for authored topic-name review.' };
    }
    return scopes.some(scope => scope.status === 'applicable')
      ? { status: 'applicable', reason: 'An authored topic name is available for each reviewed generative topic.' }
      : { status: 'not-applicable', reason: 'No reviewed topic uses generative model selection.' };
  }
  const canonicalName = getCanonicalPatternName(name);
  const scope = aggregateTopicScope(stageA.topicComponents, canonicalName, stageA.unknownComponents?.length);
  if (scope.status === 'applicable' && canonicalName === 'Overlapping Topic Descriptions') {
    const count = stageA.topicComponents.filter(t => getTopicRuleScope(t, name).status === 'applicable').length;
    if (count < 2) return { status: 'not-applicable', reason: 'Fewer than two topics compete for generative selection.' };
  }
  return scope;
}

function outcome(pattern: Pattern, status: AssessmentStatus, reason: string): Pattern {
  return {
    ...pattern, Status: status === 'pass', AssessmentStatus: status, AssessmentReason: reason,
    Topics: status === 'not-assessed' || status === 'not-applicable'
      ? pattern.Topics.map(reference => setReferenceAssessment(reference, status, reason)) : pattern.Topics,
  };
}

function validateTriggerPhraseRow(
  pattern: Pattern,
  stageA: LocalStageAOutput,
  scope: TopicRuleApplicability,
): Pattern {
  if (scope.status !== 'applicable') {
    return outcome(
      pattern,
      scope.status === 'not-applicable' ? 'not-applicable' : 'not-assessed',
      scope.reason,
    );
  }
  if (pattern.Status && pattern.Topics.length === 0) {
    return outcome(pattern, 'pass', scope.reason);
  }
  if (pattern.Topics.length === 0) {
    return outcome(
      pattern,
      'not-assessed',
      'The workflow did not identify an affected classic topic.',
    );
  }
  const references: PatternTopic[] = pattern.Topics.map((reference) => {
    const matches = stageA.topicComponents.filter(candidate => candidate.TopicName === reference.item
      && (!reference.componentId || candidate.TopicId === reference.componentId)
      && (!reference.schemaName || candidate.SchemaName === reference.schemaName));
    const topic = matches.length === 1 ? matches[0] : undefined;
    if (!topic) {
      return setReferenceAssessment(
        reference,
        'not-assessed',
        'A unique reviewed topic could not be matched.',
      );
    }
    if (topic.ParseStatus === 'unavailable' || !Array.isArray(topic.triggerQueries)) {
      return setReferenceAssessment(
        { ...reference, componentId: topic.TopicId, schemaName: topic.SchemaName },
        'not-assessed',
        'The trigger-phrase configuration could not be read.',
      );
    }
    const phraseCount = new Set(
      topic.triggerQueries.map(query => query.trim()).filter(Boolean),
    ).size;
    const summary = `${phraseCount} trigger phrases`;
    const verified = reference.setting === 'Trigger phrases'
      && (reference.current === summary || reference.evidence?.quote === summary);
    if (phraseCount >= 3) {
      return setReferenceAssessment(
        { ...reference, componentId: topic.TopicId, schemaName: topic.SchemaName },
        'not-assessed',
        'The referenced topic has at least three distinct trigger phrases.',
      );
    }
    const reason = verified
      ? 'The trigger-phrase count was verified against the reviewed snapshot.'
      : 'The trigger-phrase count could not be verified against the reviewed snapshot.';
    const assessed = assessPatternReference(
      reference,
      getPatternAssessment(pattern),
      { status: 'applicable', reason: 'The classic topic uses recognized-intent routing.' },
      verified,
      reason,
    );
    return {
      ...assessed,
      componentId: topic.TopicId ?? reference.componentId,
      schemaName: topic.SchemaName ?? reference.schemaName,
      evidence: {
        source: 'configuration',
        status: verified ? 'verified' : 'unverified',
        setting: 'Trigger phrases',
        quote: reference.evidence?.quote ?? summary,
        reason,
      },
    };
  });
  return independentOutcome({ ...pattern, Topics: references }, scope);
}

function independentOutcome(pattern: Pattern, scope: TopicRuleApplicability): Pattern {
  if (pattern.Topics.some(topic => topic.assessmentStatus === 'fail')) {
    return outcome(pattern, 'fail',
      'An independent setting has a confirmed authoring finding. Unassessed or inapplicable references are not counted as failures.');
  }
  if (pattern.Topics.every(topic => topic.assessmentStatus === 'not-applicable')) {
    return outcome(pattern, 'not-applicable', 'The referenced settings are outside the scope of this check.');
  }
  return pattern.Status && scope.status === 'applicable' && pattern.Topics.every(topic => topic.assessmentStatus === 'pass')
    ? outcome(pattern, 'pass', scope.reason)
    : outcome(pattern, 'not-assessed', 'A complete assessment could not be confirmed for this check. The reference reasons are retained.');
}

function validateRoutingOverlap(
  pattern: Pattern,
  stageA: LocalStageAOutput,
  scope: TopicRuleApplicability,
): Pattern {
  const bound = pattern.Topics.map(reference => bindRoutingEvidence(reference, stageA));
  const canonical = {
    ...pattern,
    Topics: bound.map(item => assessPatternReference(
      item.reference,
      getPatternAssessment(pattern),
      item.scope,
      item.verified,
      'The source text is confirmed. The overlap judgment is AI-assisted authoring advice.',
    )),
  };
  if (bound.some(item => item.scope.status === 'not-assessed')) {
    return outcome(canonical, 'not-assessed', 'One or more affected descriptions could not be uniquely matched to this snapshot.');
  }
  if (bound.some(item => item.scope.status === 'not-applicable')) {
    return outcome(canonical, 'not-applicable', 'One or more affected components cannot participate in generative selection.');
  }
  const identities = canonical.Topics.map(reference =>
    reference.componentId ?? reference.schemaName ?? reference.item);
  if (new Set(identities).size < 2) {
    return outcome(canonical, 'not-assessed', 'An overlap finding requires two distinct reviewed selection components.');
  }
  if (bound.some(item => !item.verified)) {
    return outcome(canonical, 'not-assessed', 'The affected descriptions could not be confirmed against the reviewed snapshot.');
  }
  if (canonical.Topics.some(reference =>
    reference.assessmentStatus !== getPatternAssessment(pattern))) {
    return outcome(canonical, 'not-assessed', 'The overlap assessment is coupled; every participant must have a consistent completed assessment.');
  }
  return scope.status === 'applicable'
    ? outcome(canonical, getPatternAssessment(pattern), 'The finding references eligible reviewed selection descriptions.')
    : outcome(canonical, scope.status, scope.reason);
}

function validatePattern(pattern: Pattern, stageA: LocalStageAOutput): Pattern {
  const name = pattern.PatternName;
  const canonicalName = getCanonicalPatternName(name);
  const canonical: Pattern = {
    ...pattern, Category: PATTERN_INHERENT_CATEGORY[name] ?? PATTERN_INHERENT_CATEGORY[canonicalName],
    Severity: getPatternSeverity(name),
    EvidenceKind: name === 'Tool Routing Gap' ? 'potential-risk' : 'authoring-guidance',
  };
  if (!supportedAiRules.has(name)) {
    return outcome(canonical, 'not-assessed', 'The AI returned a rule that is not supported by this review policy.');
  }
  const scope = scopeForRule(stageA, name);
  if (stageA.configurationAvailable === false) return outcome(canonical, 'not-assessed', scope.reason);
  if (getPatternAssessment(pattern) === 'not-assessed') {
    return outcome(canonical, 'not-assessed', pattern.AssessmentReason ?? 'No completed assessment was returned.');
  }
  if (name === 'Missing Trigger Phrases') {
    return validateTriggerPhraseRow(canonical, stageA, scope);
  }
  if (pattern.Status && !pattern.Topics.length) {
    return scope.status === 'applicable'
      ? outcome(canonical, getPatternAssessment(pattern), scope.reason)
      : outcome(canonical, scope.status, scope.reason);
  }
  if (!pattern.Topics.length) {
    return outcome(canonical, scope.status === 'not-applicable' ? 'not-applicable' : 'not-assessed',
      scope.status === 'not-applicable' ? scope.reason : 'The AI did not identify the affected reviewed components.');
  }
  if (name === 'Tool Routing Gap') {
    if (scope.status === 'not-applicable' || stageA.orchestrationMode !== 'generative') {
      return outcome(canonical, scope.status === 'not-applicable' ? 'not-applicable' : 'not-assessed', scope.reason);
    }
    const bound = pattern.Topics.map(reference => bindRoutingEvidence(reference, stageA));
    canonical.Topics = bound.map(item => assessPatternReference(
      item.reference, getPatternAssessment(pattern), item.scope, item.verified,
      'This is potential authoring risk based on reviewed descriptions, not an observed routing failure.',
    ));
    return independentOutcome(canonical, scope);
  }
  if (name === 'Overlapping Topic Descriptions') {
    return validateRoutingOverlap(canonical, stageA, scope);
  }
  const bound = pattern.Topics.map(reference => bindPatternEvidence(reference, stageA.topicComponents, name));
  canonical.Topics = bound.map(item => assessPatternReference(
    item.reference,
    getPatternAssessment(pattern),
    item.topic
      ? name === 'Unclear Topic Name'
        ? item.topic.ParseStatus === 'unavailable'
          ? { status: 'not-assessed', reason: 'The topic configuration could not be read.' }
          : item.topic.RoutingApplicability ?? { status: 'not-assessed', reason: 'Routing applicability is unavailable.' }
        : getTopicRuleScope(item.topic, canonicalName)
      : { status: 'not-assessed', reason: 'A unique reviewed topic could not be matched.' },
    item.verified, 'The source text is confirmed. The clarity judgment is AI-assisted authoring advice.',
  ));
  return independentOutcome(canonical, scope);
}

/** Validate the Stage B envelope and outcomes before any result is scored or saved. */
export function validateStandardPatternEvaluation(value: unknown, stageA: LocalStageAOutput): PatternEvaluation {
  const evaluation = recordValue(value);
  if (!evaluation || !Array.isArray(evaluation.Patterns)) {
    throw new Error('Stage B returned no readable pattern assessment array.');
  }
  const localNames = new Set(stageA.localPatterns.map(p => p.patternName));
  const parsed = evaluation.Patterns.map(parsePattern).filter(p => !localNames.has(p.PatternName));
  const grouped = new Map<string, Pattern[]>();
  for (const pattern of parsed.map(p => validatePattern(p, stageA))) {
    const key = getCanonicalPatternName(pattern.PatternName);
    const group = grouped.get(key) ?? [];
    group.push(pattern);
    grouped.set(key, group);
  }
  const patterns = [...grouped.values()].map(group => group.length === 1 ? group[0] : outcome({
    ...group[0],
    Description: [...new Set(group.map(p => p.Description ?? p.PatternDescription).filter(Boolean))].join('\n\n'),
    Recommendation: [...new Set(group.map(p => p.Recommendation))].join('\n\n'),
    Topics: group.flatMap(p => p.Topics),
  }, 'not-assessed', 'The response repeated this check; its proposals are retained without asserting a category outcome.'));
  const seenCanonical = new Set<string>();
  for (const pattern of patterns) {
    const canonicalName = getCanonicalPatternName(pattern.PatternName);
    if (canonicalAiRules.includes(canonicalName)) seenCanonical.add(canonicalName);
  }
  for (const name of canonicalAiRules) {
    if (seenCanonical.has(name)) continue;
    const scope = scopeForRule(stageA, name);
    patterns.push({
      PatternId: `unreturned-${canonicalAiRules.indexOf(name) + 1}`, PatternName: name,
      Description: 'No complete AI assessment was returned for this check.',
      Recommendation: 'Review the available evidence or run a new assessment when the review service is available.',
      Status: false, AssessmentStatus: scope.status === 'not-applicable' ? 'not-applicable' : 'not-assessed',
      AssessmentReason: scope.status === 'not-applicable' ? scope.reason : 'The model omitted this check; no Pass or Fail is asserted.',
      Category: PATTERN_INHERENT_CATEGORY[name], Severity: getPatternSeverity(name),
      EvidenceKind: 'authoring-guidance', Topics: [],
    });
  }
  const identifiers = new Set<string>();
  patterns.forEach((pattern, index) => {
    const originalId = pattern.PatternId;
    let suffix = index + 1;
    while (identifiers.has(pattern.PatternId)) pattern.PatternId = `${originalId}-${suffix++}`;
    identifiers.add(pattern.PatternId);
  });
  return {
    Patterns: patterns, Summary: textValue(evaluation.Summary),
    policyVersion: STANDARD_REVIEW_POLICY_VERSION,
    assessmentNotes: ['AI findings are checked against the reviewed snapshot. No agent conversations or dependencies were executed.'],
  };
}
