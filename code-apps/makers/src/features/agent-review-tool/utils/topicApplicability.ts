import type { LocalStageAOutput, StageBTopicComponent, TopicRuleApplicability } from '../contracts/StageOutputs';

type OrchestrationMode = LocalStageAOutput['orchestrationMode'];

/**
 * Triggers that fire on a platform event rather than on the model choosing a topic.
 *
 * This is an allow-list on purpose. An unrecognised trigger stays Not assessed rather than falling
 * through to "not applicable", because a trigger the platform adds later could well participate in
 * generative selection, and claiming it does not would turn a real gap into a silent pass.
 */
const nonSelectionTriggers = new Set([
  'OnActivity', 'OnEventActivity', 'OnRedirect', 'OnSystemRedirect',
  'OnConversationStart', 'OnUnknownIntent', 'OnSelectIntent',
  'OnError', 'OnGeneratedResponse', 'OnOutgoingMessage',
  'OnEscalate', 'OnSignIn', 'OnSignOut',
  // Voice and telephony events. Each is raised by the call itself, never by topic selection.
  'OnAnsweringMachineDetected', 'OnSilence', 'OnUnrecognizedSpeech', 'OnUnknownDtmfKey',
  'OnCallDisconnect', 'OnCallTransferFailure', 'OnDtmfKeyPress',
]);

/** Read a metadata object without trusting arrays, nulls or scalar values. */
export function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

/** Retain a supplied string exactly; never coerce metadata into evidence. */
export function textValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Resolve only the explicit standard configuration flag, with no default-to-generative behavior. */
export function resolveOrchestrationMode(configuration: unknown): OrchestrationMode {
  let value: unknown = configuration;
  if (typeof configuration === 'string') {
    try {
      value = JSON.parse(configuration);
    } catch (error) {
      if (error instanceof SyntaxError) return 'unknown';
      throw error;
    }
  }
  const flag = recordValue(recordValue(value)?.settings)?.GenerativeActionsEnabled;
  return flag === true ? 'generative' : flag === false ? 'classic' : 'unknown';
}

/** Determine generative selection from the trigger and mode, not a topic's name or description. */
export function getRoutingApplicability(parsed: unknown, mode: OrchestrationMode): TopicRuleApplicability {
  const topic = recordValue(parsed);
  const trigger = textValue(recordValue(topic?.beginDialog)?.kind);
  if (trigger && nonSelectionTriggers.has(trigger)) {
    return { status: 'not-applicable', reason: `The ${trigger} trigger does not use model selection between topics.` };
  }
  if (trigger !== 'OnRecognizedIntent') {
    return {
      status: 'not-assessed',
      reason: 'A supported topic trigger is unavailable.',
      unclassifiedTrigger: true,
    };
  }
  if (mode === 'unknown') {
    return { status: 'not-assessed', reason: 'The reviewed configuration does not establish the orchestration mode.' };
  }
  if (mode === 'classic') {
    return { status: 'not-applicable', reason: 'Classic orchestration uses intent/phrase routing, not generative topic selection.' };
  }
  return { status: 'applicable', reason: 'Generative orchestration can select this intent topic.' };
}

/** Use the component authoring name when no explicit model-name override was supplied. */
export function getNamingApplicability(
  parsed: unknown,
  routing: TopicRuleApplicability,
  componentName?: string,
): TopicRuleApplicability {
  if (routing.status !== 'applicable') return routing;
  const topic = recordValue(parsed);
  if (!topic) {
    return {
      status: 'not-assessed',
      reason: 'The effective model-facing name could not be read from the reviewed metadata.',
    };
  }
  const hasOverride = Object.prototype.hasOwnProperty.call(topic, 'modelDisplayName');
  const override = topic.modelDisplayName;
  if (hasOverride && override !== null && typeof override !== 'string') {
    return {
      status: 'not-assessed',
      reason: 'The explicit model-facing name is malformed and cannot be assessed safely.',
    };
  }
  if (!hasOverride && typeof componentName !== 'string') {
    return {
      status: 'not-assessed',
      reason: 'Neither an explicit model-facing name nor a readable component authoring name is available.',
    };
  }
  return {
    status: 'applicable',
    reason: hasOverride
      ? 'The explicit model-facing name field is readable for this model-selected topic.'
      : 'The component authoring name is the effective name because no model-name override was supplied.',
  };
}

/** Resolve the population a topic-level rule can assess. */
export function getTopicRuleScope(topic: StageBTopicComponent, name: string): TopicRuleApplicability {
  if (topic.ParseStatus === 'unavailable') {
    return { status: 'not-assessed', reason: 'The topic configuration could not be read.' };
  }
  if (name.includes('Model Name')) {
    const naming = topic.NamingApplicability
      ?? { status: 'not-assessed' as const, reason: 'Naming applicability is unavailable.' };
    if (naming.status === 'applicable' && name.startsWith('Unclear') && !topic.ModelName?.trim()) {
      return {
        status: 'not-applicable',
        reason: 'There is no model name to assess for clarity; the missing-name check covers this absence.',
      };
    }
    return naming;
  }
  if (name.includes('Model Description') || name === 'Overlapping Topic Descriptions') {
    if (topic.ModelDescriptionStatus === 'unavailable') {
      return { status: 'not-assessed', reason: 'The model description metadata is not readable text.' };
    }
    const routing: TopicRuleApplicability = topic.RoutingApplicability
      ?? { status: 'not-assessed', reason: 'Routing applicability is unavailable.' };
    if (routing.status === 'applicable' && (name.startsWith('Unclear') || name === 'Overlapping Topic Descriptions')
      && !topic.ModelDescription?.trim()) {
      return { status: 'not-applicable', reason: 'There is no description to assess for clarity or overlap; the missing-description check covers this absence.' };
    }
    return routing;
  }
  const input = name.includes('Input Variable');
  const output = name.includes('Output Variable');
  if (input || output) {
    const variables = input ? topic.InputVariables : topic.OutputVariables;
    const state = input ? topic.InputVariablesStatus : topic.OutputVariablesStatus;
    if (state === 'unavailable') {
      return { status: 'not-assessed', reason: 'Variable declarations could not be read.' };
    }
    if (name.startsWith('Unclear') && name.endsWith('Description')
      && !variables?.some(variable => variable.VariableDescription?.trim())) {
      return { status: 'not-applicable', reason: 'There are no populated variable descriptions to assess for clarity.' };
    }
    return variables?.length
      ? { status: 'applicable', reason: 'Declared variables are available in the reviewed topic.' }
      : { status: 'not-applicable', reason: 'The reviewed topic declares no variables for this rule.' };
  }
  return { status: 'not-assessed', reason: 'The scope of this topic rule is not supported.' };
}

/** Combine eligibility without turning an unknown topic into a category-wide pass. */
export function aggregateTopicScope(
  topics: StageBTopicComponent[], name: string, unknownComponents = 0,
): TopicRuleApplicability {
  const scopes = topics.map(t => getTopicRuleScope(t, name));
  const unreadable = scopes.find(s => s.status === 'not-assessed' && !s.unclassifiedTrigger);
  if (unknownComponents || unreadable) {
    return unreadable ?? { status: 'not-assessed', reason: 'Some components could not be classified or read.' };
  }
  return scopes.find(s => s.status === 'applicable')
    ?? scopes.find(s => s.status === 'not-assessed')
    ?? { status: 'not-applicable', reason: 'No reviewed topic is applicable to this rule.' };
}
