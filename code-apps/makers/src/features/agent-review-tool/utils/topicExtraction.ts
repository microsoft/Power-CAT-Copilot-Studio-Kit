import type { BotComponent, MissingFields, MissingFieldEvidence } from '../contracts/ServiceContracts';
import type { LocalStageAOutput, StageBTopicComponent } from '../contracts/StageOutputs';
import { extractVariables } from './yamlUtils';
import { getNamingApplicability, getRoutingApplicability, recordValue, textValue } from './topicApplicability';

/** Extract one topic and its declared variables from a single reviewed YAML snapshot. */
export function extractStandardTopic(
  component: BotComponent,
  parsed: Record<string, unknown>,
  mode: LocalStageAOutput['orchestrationMode'],
  missing: MissingFields,
  evidence: MissingFieldEvidence,
): StageBTopicComponent {
  const name = component.name || 'Unnamed';
  const routing = getRoutingApplicability(parsed, mode);
  const hasModelNameOverride = Object.prototype.hasOwnProperty.call(parsed, 'modelDisplayName');
  const hasModelDescriptionOverride = Object.prototype.hasOwnProperty.call(parsed, 'modelDescription');
  const modelName = hasModelNameOverride ? textValue(parsed.modelDisplayName) : textValue(component.name);
  const modelDescription = hasModelDescriptionOverride
    ? textValue(parsed.modelDescription)
    : textValue(component.description);
  const namingApplicability = getNamingApplicability(parsed, routing, component.name);
  const topic: StageBTopicComponent = {
    TopicName: name,
    TopicId: component.botcomponentid || component.componentidunique || component.schemaname,
    SchemaName: component.schemaname,
    TriggerKind: textValue(recordValue(parsed.beginDialog)?.kind),
    RoutingApplicability: routing,
    NamingApplicability: namingApplicability,
    ParseStatus: 'complete',
    ModelName: modelName,
    ModelDescription: modelDescription,
    ModelDescriptionStatus: !hasModelDescriptionOverride
      || parsed.modelDescription == null || typeof parsed.modelDescription === 'string'
      ? 'complete' : 'unavailable',
  };
  const recordMissing = (key: keyof MissingFields, setting: string, variable?: string, current?: string) => {
    const savedValue = current ?? '';
    (evidence[key] ??= []).push({
      item: name, componentId: topic.TopicId, schemaName: component.schemaname,
      variable, setting, current: savedValue,
      evidence: {
        source: 'configuration', status: variable === '' ? 'unverified' : 'verified', setting,
        quote: savedValue, reason: variable === '' ? 'The malformed declaration has no stable variable identity.'
          : 'This declared setting has no readable nonblank text in the reviewed configuration.',
      },
    });
  };
  if (namingApplicability.status === 'applicable' && !topic.ModelName?.trim()) {
    missing.missingModelNames.push(name);
    recordMissing('missingModelNames', 'Model name', undefined, topic.ModelName);
  }
  if (routing.status === 'applicable' && topic.ModelDescriptionStatus === 'complete'
    && !topic.ModelDescription?.trim()) {
    missing.missingModelDescriptions.push(name);
    recordMissing('missingModelDescriptions', 'Model description', undefined, topic.ModelDescription);
  }

  for (const direction of ['input', 'output'] as const) {
    const type = parsed[`${direction}Type`];
    const legacy = parsed[`${direction}Variables`];
    const absent = type === undefined && legacy === undefined;
    const modern = recordValue(type);
    const modernProvided = type !== undefined;
    const modernProperties = modern?.properties;
    const hasModernDeclaration = modernProvided && type !== null && modern !== undefined
      && (modernProperties === undefined || recordValue(modernProperties) !== undefined);
    const legacyProvided = legacy !== undefined;
    const hasLegacyDeclaration = legacyProvided && legacy !== null
      && (recordValue(legacy) !== undefined || Array.isArray(legacy));
    const malformedDeclaration = (modernProvided && !hasModernDeclaration) || (legacyProvided && !hasLegacyDeclaration);
    const declarations = hasModernDeclaration && modernProperties !== undefined
      ? modernProperties
      : hasLegacyDeclaration ? legacy : hasModernDeclaration ? undefined : undefined;
    const bindingsOnly = direction === 'input'
      && !hasModernDeclaration && !hasLegacyDeclaration
      && Array.isArray(parsed.inputs) && parsed.inputs.length > 0;
    const readable = (absent && !bindingsOnly) || hasModernDeclaration || hasLegacyDeclaration;
    const extracted = readable ? extractVariables(declarations, direction === 'input' ? parsed.inputs : undefined) : [];
    const variables = extracted.map(v => ({ VariableName: v.VariableName, VariableDescription: v.VariableDescription }));
    if (direction === 'input') {
      topic.InputVariables = variables;
      topic.InputVariablesStatus = readable && !malformedDeclaration && extracted.every(v => v.VariableName.trim())
        ? 'complete' : 'unavailable';
    } else {
      topic.OutputVariables = variables;
      topic.OutputVariablesStatus = readable && !malformedDeclaration && extracted.every(v => v.VariableName.trim())
        ? 'complete' : 'unavailable';
    }
    for (const variable of extracted) {
      const reference = { topic: name, variable: variable.VariableName };
      if (!variable.displayName?.trim()) {
        (direction === 'input' ? missing.missingInputVariableNames : missing.missingOutputVariableNames).push(reference);
        recordMissing(direction === 'input' ? 'missingInputVariableNames' : 'missingOutputVariableNames',
          `${direction === 'input' ? 'Input' : 'Output'} variable display name`, variable.VariableName, variable.displayName);
      }
      if (!variable.VariableDescription?.trim()) {
        (direction === 'input' ? missing.missingInputVariableDescriptions : missing.missingOutputVariableDescriptions).push(reference);
        recordMissing(direction === 'input' ? 'missingInputVariableDescriptions' : 'missingOutputVariableDescriptions',
          `${direction === 'input' ? 'Input' : 'Output'} variable description`, variable.VariableName, variable.VariableDescription);
      }
    }
  }
  const queries = parsed.triggerQueries ?? recordValue(recordValue(parsed.beginDialog)?.intent)?.triggerQueries;
  if (Array.isArray(queries)) topic.triggerQueries = queries.filter((q): q is string => typeof q === 'string');
  return topic;
}
