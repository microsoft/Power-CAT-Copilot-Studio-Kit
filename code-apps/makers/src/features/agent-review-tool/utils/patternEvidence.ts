import type { LocalStageAOutput, PatternTopic, ReviewEvidence, StageBTopicComponent, TopicRuleApplicability } from '../contracts/StageOutputs';
import { getTopicRuleScope, recordValue, textValue } from './topicApplicability';

interface RoutingSetting {
  name: string;
  componentId?: string;
  schemaName?: string;
  text?: string;
  scope: TopicRuleApplicability;
}

/** Read supplied evidence without coercion; verification must be established locally. */
export function readPatternEvidence(value: unknown, index: number): ReviewEvidence | undefined {
  if (value === undefined) return undefined;
  const row = recordValue(value);
  const source = row?.source;
  const status = row?.status;
  if (!row || (source !== 'configuration' && source !== 'instructions' && source !== 'ai-response')
    || (status !== 'verified' && status !== 'unverified' && status !== 'unavailable')
    || ['setting', 'quote', 'reason'].some(key => row[key] !== undefined && typeof row[key] !== 'string')) {
    throw new Error(`Stage B returned unreadable reference evidence in pattern ${index + 1}.`);
  }
  return { source, status: 'unverified', setting: textValue(row.setting), quote: textValue(row.quote), reason: textValue(row.reason) };
}

function unmatchedReference(reference: PatternTopic, reason: string): PatternTopic {
  return {
    ...reference,
    evidence: {
      ...reference.evidence, source: reference.evidence?.source ?? 'ai-response', status: 'unverified',
      reason: [reference.evidence?.reason, reason].filter(Boolean).join(' '),
    },
  };
}

function bindSetting(reference: PatternTopic, current: string | undefined, setting: string, available: boolean) {
  const verified = available && !!current?.trim()
    && (reference.evidence === undefined || reference.evidence.source === 'configuration')
    && [reference.setting, reference.evidence?.setting].every(value => value === undefined || value === setting)
    && [reference.current, reference.evidence?.quote].every(value =>
      value === undefined || (!!value.trim() && current.includes(value)));
  const status: ReviewEvidence['status'] = !available || current === undefined ? 'unavailable'
    : verified ? 'verified' : 'unverified';
  const reason = verified ? 'The supplied text and setting match the reviewed configuration; runtime behavior was not tested.'
    : 'The returned setting, current value or evidence cannot be confirmed against the reviewed configuration.';
  return {
    verified,
    reference: {
      ...reference, setting: reference.setting ?? setting,
      current: reference.current ?? (verified ? current : undefined),
      evidence: {
        ...reference.evidence, source: reference.evidence?.source ?? 'configuration', status,
        quote: reference.evidence?.quote ?? (verified ? current : undefined),
        setting: reference.evidence?.setting ?? setting,
        reason: [reference.evidence?.reason, reason].filter(Boolean).join(' '),
      },
    },
  };
}

/** Bind routing advice to a reviewed topic or callable description, never to a runtime claim. */
export function bindRoutingEvidence(reference: PatternTopic, stageA: LocalStageAOutput): {
  reference: PatternTopic; scope: TopicRuleApplicability; verified: boolean;
} {
  const settings: RoutingSetting[] = [
    ...stageA.topicComponents.map((topic): RoutingSetting => ({
      name: topic.TopicName, componentId: topic.TopicId, schemaName: topic.SchemaName,
      text: topic.ModelDescription, scope: getTopicRuleScope(topic, 'Unclear Model Description'),
    })),
    ...[...(stageA.toolDetails ?? []), ...(stageA.connectedAgents ?? [])].map((resource): RoutingSetting => ({
      name: resource.name, componentId: resource.componentId, schemaName: resource.schemaName, text: resource.description,
      scope: resource.description?.trim()
        ? { status: 'applicable', reason: 'A callable description is available for authoring review.' }
        : { status: 'not-assessed', reason: 'The callable description is unavailable.' },
    })),
    ...[
      ...(stageA.childAgents ?? []), ...(stageA.configurationComponents ?? []), ...(stageA.unknownComponents ?? []),
      ...(stageA.entities ?? []), ...(stageA.knowledgeDetails ?? []),
    ].map((resource): RoutingSetting => ({
      name: resource.name, componentId: resource.componentId, schemaName: resource.schemaName,
      scope: { status: 'not-assessed', reason: 'This resource is not a supported topic or callable target for this check.' },
    })),
  ];
  const matches = settings.filter(setting => setting.name === reference.item
    && (!reference.componentId || setting.componentId === reference.componentId)
    && (!reference.schemaName || setting.schemaName === reference.schemaName));
  const setting = matches.length === 1 ? matches[0] : undefined;
  const scope: TopicRuleApplicability = reference.variable
    ? { status: 'not-assessed', reason: 'Variable-level routing evidence is not supported by this check.' }
    : setting?.scope ?? { status: 'not-assessed', reason: 'A unique reviewed topic or callable could not be matched.' };
  if (!setting) return { scope, verified: false, reference: unmatchedReference(reference, scope.reason) };
  const bound = bindSetting(reference, setting.text, 'Selection description', scope.status === 'applicable');
  return {
    scope, verified: bound.verified,
    reference: {
      ...bound.reference, componentId: setting.componentId ?? reference.componentId,
      schemaName: setting.schemaName ?? reference.schemaName,
    },
  };
}

/** Bind an AI reference to one reviewed topic and validate its claimed current text. */
export function bindPatternEvidence(
  reference: PatternTopic, topics: StageBTopicComponent[], patternName: string,
): { reference: PatternTopic; topic?: StageBTopicComponent; verified: boolean } {
  const matches = topics.filter(topic => topic.TopicName === reference.item
    && (!reference.componentId || topic.TopicId === reference.componentId)
    && (!reference.schemaName || topic.SchemaName === reference.schemaName));
  const topic = matches.length === 1 ? matches[0] : undefined;
  if (!topic) {
    return {
      reference: unmatchedReference(reference, 'A unique reviewed topic could not be matched.'),
      verified: false,
    };
  }
  const input = patternName.includes('Input Variable');
  const output = patternName.includes('Output Variable');
  const legacyTopicName = patternName === 'Unclear Topic Name';
  let current: string | undefined;
  let setting: string;
  if (input || output) {
    const variables = (input ? topic.InputVariables : topic.OutputVariables) ?? [];
    const matched = variables.filter(v => v.VariableName === reference.variable);
    const variable = matched.length === 1 ? matched[0] : undefined;
    current = patternName.endsWith('Name') ? variable?.VariableName : variable?.VariableDescription;
    setting = `${input ? 'Input' : 'Output'} variable ${patternName.endsWith('Name') ? 'name' : 'description'}`;
  } else if (legacyTopicName) {
    current = topic.TopicName;
    setting = 'Authoring topic name';
  } else {
    current = patternName.includes('Model Name') ? topic.ModelName : topic.ModelDescription;
    setting = patternName.includes('Model Name') ? 'Model-facing name' : 'Model description';
  }
  const available = topic.ParseStatus !== 'unavailable'
    && (legacyTopicName ? topic.RoutingApplicability?.status === 'applicable' : input ? topic.InputVariablesStatus !== 'unavailable' : output
      ? topic.OutputVariablesStatus !== 'unavailable'
      : patternName.includes('Model Name') || topic.ModelDescriptionStatus !== 'unavailable');
  const bound = bindSetting(reference, current, setting, available);
  return {
    topic, verified: bound.verified,
    reference: {
      ...bound.reference, componentId: topic.TopicId, schemaName: topic.SchemaName,
    },
  };
}
