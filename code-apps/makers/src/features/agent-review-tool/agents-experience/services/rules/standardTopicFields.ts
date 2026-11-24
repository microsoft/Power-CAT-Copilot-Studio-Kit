import type { LocalPattern, MissingFields, ParsedBotData } from '../../../contracts/ServiceContracts';
import type { PatternTopic } from '../../../contracts/StageOutputs';
import { PATTERN_INHERENT_CATEGORY, getPatternSeverity } from '../../../utils/patternUtils';
import { getTopicRuleScope } from '../../../utils/topicApplicability';
import { createStandardSystemTopicMatcher } from '../../../utils/systemTopic';

export const standardFieldRules = [
  ['missingModelNames', 'Missing Model Name', 'model name', 'model names'],
  ['missingModelDescriptions', 'Missing Model Description', 'model description', 'model descriptions'],
  ['missingInputVariableNames', 'Missing Input Variable Name', 'display name', 'display names'],
  ['missingInputVariableDescriptions', 'Missing Input Variable Description', 'description', 'descriptions'],
  ['missingOutputVariableNames', 'Missing Output Variable Name', 'display name', 'display names'],
  ['missingOutputVariableDescriptions', 'Missing Output Variable Description', 'description', 'descriptions'],
] as const;

export const standardFieldRecommendations = [
  'Use a concise, meaningful name. Confirm the effective model-facing name before changing an authoring name or override.',
  'Provide a short description for each applicable topic explaining its purpose and selection conditions.',
  'Add a clear display name to each input variable to specify what data is expected.',
  'Add a description to each input variable explaining its purpose, expected format, and constraints.',
  'Add a clear display name to each output variable to specify what data is produced.',
  'Add a description to each output variable explaining its content, format, and downstream use.',
];

function humanizeIdentifier(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function variableDescriptionGuidance(
  item: PatternTopic,
  direction: 'input' | 'output',
): Pick<PatternTopic, 'suggested' | 'remediation'> {
  const variable = item.variable?.trim() ?? '';
  const readableVariable = humanizeIdentifier(variable);
  const suggestedText = direction === 'input'
    ? `The ${readableVariable} supplied to ${item.item} by its caller. Use the format required by the target action; do not continue when the value is blank.`
    : `The ${readableVariable} returned by ${item.item} for use by the calling topic.`;
  return {
    suggested: suggestedText,
    remediation: {
      findingTitle: `${item.item} ${direction} "${variable}" has no description`,
      whyItMatters: `Without a description, a maker cannot confirm what "${variable}" ${direction === 'input' ? 'must contain' : 'returns'} for "${item.item}".`,
      makerAction: `In "${item.item}", describe the "${variable}" ${direction} with its purpose, expected format, ${direction === 'input' ? 'source and blank-value behavior' : 'and downstream use'}.`,
      suggestedText,
      acceptanceCheck: `Open "${item.item}" and confirm that "${variable}" has a nonblank description that states its purpose, expected format, and ${direction === 'input' ? 'blank-value behavior' : 'downstream use'}.`,
    },
  };
}

function affectedItems(data: ParsedBotData, key: keyof MissingFields, name: string): PatternTopic[] {
  if (data.missingFieldEvidence) return data.missingFieldEvidence[key] ?? [];
  const entries = data.missingFields[key];
  return entries.flatMap(entry => {
    const topicName = typeof entry === 'string' ? entry : entry.topic;
    const variable = typeof entry === 'string' ? undefined : entry.variable;
    const matches = data.topicComponents?.filter(t => t.TopicName === topicName) ?? [];
    const topic = matches.length === 1 ? matches[0] : undefined;
    const variableRule = name.includes('Variable');
    const variables = (name.includes('Input') ? topic?.InputVariables : topic?.OutputVariables) ?? [];
    const matchedVariables = variable?.trim() ? variables.filter(value => value.VariableName === variable) : [];
    const matchedVariable = matchedVariables.length === 1 ? matchedVariables[0] : undefined;
    const setting = variableRule
      ? `${name.includes('Input') ? 'Input' : 'Output'} variable ${name.endsWith('Name') ? 'display name' : 'description'}`
      : name.endsWith('Name') ? 'Model-facing name' : 'Model description';
    const current = variableRule ? name.endsWith('Name') ? undefined : matchedVariable?.VariableDescription
      : name.endsWith('Name') ? topic?.ModelName : topic?.ModelDescription;
    const readable = !!topic && topic.ParseStatus !== 'unavailable';
    const verified = readable && !current?.trim() && (variableRule ? matchedVariables.length === 1
      : getTopicRuleScope(topic, name).status === 'applicable');
    return [{
      item: topicName, variable, componentId: topic?.TopicId, schemaName: topic?.SchemaName, setting, current,
      evidence: {
        source: 'configuration', status: verified ? 'verified' : readable ? 'unverified' : 'unavailable', setting,
        quote: current,
        reason: verified ? 'The declared setting has no nonblank text in the reviewed configuration.'
          : 'The reported missing setting could not be confirmed from a unique declaration and its available metadata.',
      },
    }];
  });
}

/** Shared field algorithm preserves topic scope, blank overrides and variable-specific remediation. */
export function buildStandardFieldPattern(data: ParsedBotData, index: number): LocalPattern {
  const [key, name, singular, plural] = standardFieldRules[index];
  // One exclusion, applied once, to one population. Excluding standard system
  // topics in two places — by id here and by name there — left `missing` and
  // `items` filtered differently, so `incompleteEvidence` compared two
  // populations that had never been reduced the same way.
  const isStandardSystemTopicItem = createStandardSystemTopicMatcher(data.topicComponents ?? []);
  const reported = affectedItems(data, key, name);
  const excluded = key === 'missingModelDescriptions' ? reported.filter(isStandardSystemTopicItem) : [];
  // Remove one reported entry per excluded item, so a custom topic with the same name stays counted.
  const excludedCounts = new Map<string, number>();
  for (const item of excluded) excludedCounts.set(item.item, (excludedCounts.get(item.item) ?? 0) + 1);
  const missing = data.missingFields[key].filter((entry) => {
    const topicName = typeof entry === 'string' ? entry : entry.topic;
    const count = excludedCounts.get(topicName) ?? 0;
    if (!count) return true;
    excludedCounts.set(topicName, count - 1);
    return false;
  });
  const scope = data.ruleScopes?.[name];
  const items = reported.filter(item => !excluded.includes(item)).map(item => {
    const direction = key === 'missingInputVariableDescriptions' ? 'input'
      : key === 'missingOutputVariableDescriptions' ? 'output' : undefined;
    return direction && item.variable?.trim() && item.evidence?.status === 'verified'
      ? { ...item, ...variableDescriptionGuidance(item, direction) }
      : item;
  });
  const verifiedItems = items.filter(item => item.evidence?.status === 'verified');
  const missingCount = verifiedItems.length;
  const incompleteEvidence = verifiedItems.length < missing.length;
  const topics = [...new Set(verifiedItems.map(item => item.item))];
  const assessmentStatus = missingCount > 0 ? 'fail' : incompleteEvidence ? 'not-assessed'
    : scope?.status === 'not-assessed' ? 'not-assessed'
      : scope?.status === 'not-applicable' ? 'not-applicable' : 'pass';
  const assessmentReason = incompleteEvidence
    ? 'Some reported missing settings could not be confirmed from the available component metadata.' : scope?.reason;
  const direction = index < 4 ? 'input' : 'output';
  const description = index < 2
    ? missingCount > 0
      ? `${missingCount} topic(s) are missing a ${singular}: ${topics.join(', ')}`
      : `All topics have ${plural} defined.`
    : missingCount > 0
      ? `${missingCount} ${direction} variable(s) are missing a ${singular} across ${topics.length} topic(s)`
      : `All ${direction} variables have ${plural} defined.`;
  return {
    patternId: `local-pattern-${index + 1}`, patternName: name,
    description: assessmentStatus === 'not-applicable' || assessmentStatus === 'not-assessed'
      ? assessmentReason ?? 'Assessment data is unavailable.' : description,
    recommendation: standardFieldRecommendations[index],
    status: assessmentStatus === 'pass', assessmentStatus, assessmentReason,
    topics, affectedItems: items,
    category: PATTERN_INHERENT_CATEGORY[name], severity: getPatternSeverity(name),
    evidenceKind: 'configuration-fact',
  };
}
