import type {
  LocalStageAOutput,
  ResourceDetail,
  StageBTopicComponent,
  ToolDetail,
} from '../contracts/StageOutputs';
import {
  STANDARD_REVIEW_UNIT_INDEX,
  STANDARD_REVIEW_UNIT_INDEXES,
  type StandardReviewCorpusComponent,
  type StandardReviewRule,
  type StandardReviewRuleApplicability,
  type StandardReviewUnit,
  type StandardReviewWorkflowCorpus,
} from '../contracts/StandardReviewWorkflow';
import { hasInstructionText } from './instructionEvidence';
import { isPopulationIncomplete } from './patternUtils';
import { STANDARD_REVIEW_POLICY_VERSION } from './reviewAssessment';
import {
  STANDARD_INSTRUCTION_WORKFLOW_RULES,
  STANDARD_PATTERN_WORKFLOW_RULES,
  type StandardReviewRuleTemplate,
} from './standardReviewWorkflowRules';
import { isStandardConversationalSystemTopic } from './systemTopic';

interface BuildCorpusOptions {
  correlationId: string;
  sourceEnvironment: string;
}

function uniqueComponentId(
  preferred: string | undefined,
  kind: string,
  index: number,
  seen: Set<string>,
): string {
  const base = preferred?.trim() || `${kind}:${index + 1}`;
  let candidate = base;
  let suffix = 2;
  while (seen.has(candidate)) candidate = `${base}:${suffix++}`;
  seen.add(candidate);
  return candidate;
}

function topicComponent(
  topic: StageBTopicComponent,
  index: number,
  seen: Set<string>,
): StandardReviewCorpusComponent {
  const componentId = uniqueComponentId(topic.TopicId, 'topic', index, seen);
  return {
    componentId,
    componentType: 'topic',
    name: topic.TopicName,
    schemaName: topic.SchemaName,
    facts: {
      sourceComponentId: topic.TopicId,
      triggerKind: topic.TriggerKind,
      routingApplicability: topic.RoutingApplicability,
      namingApplicability: topic.NamingApplicability,
      parseStatus: topic.ParseStatus ?? 'unavailable',
      modelDescriptionStatus: topic.ModelDescriptionStatus ?? 'unavailable',
      inputVariablesStatus: topic.InputVariablesStatus ?? 'unavailable',
      outputVariablesStatus: topic.OutputVariablesStatus ?? 'unavailable',
      triggerQueriesStatus: Array.isArray(topic.triggerQueries) ? 'complete' : 'unavailable',
      isStandardSystemTopic: isStandardConversationalSystemTopic(topic),
    },
    fields: {
      modelName: topic.ModelName ?? '',
      modelDescription: topic.ModelDescription ?? '',
      inputVariables: (topic.InputVariables ?? []).map((variable) => ({
        name: variable.VariableName,
        description: variable.VariableDescription ?? '',
      })),
      inputVariableDescriptions: (topic.InputVariables ?? [])
        .filter((variable) => variable.VariableDescription?.trim())
        .map((variable) => ({
          name: variable.VariableName,
          description: variable.VariableDescription,
        })),
      outputVariables: (topic.OutputVariables ?? []).map((variable) => ({
        name: variable.VariableName,
        description: variable.VariableDescription ?? '',
      })),
      outputVariableDescriptions: (topic.OutputVariables ?? [])
        .filter((variable) => variable.VariableDescription?.trim())
        .map((variable) => ({
          name: variable.VariableName,
          description: variable.VariableDescription,
        })),
      triggerQueries: topic.triggerQueries ?? [],
      triggerPhraseSummary: Array.isArray(topic.triggerQueries)
        ? `${new Set(topic.triggerQueries.map(query => query.trim()).filter(Boolean)).size} trigger phrases`
        : 'Trigger phrase metadata unavailable',
    },
  };
}

function resourceComponent(
  resource: ResourceDetail | ToolDetail,
  componentType: 'tool' | 'connected-agent' | 'knowledge',
  index: number,
  seen: Set<string>,
): StandardReviewCorpusComponent {
  const componentId = uniqueComponentId(resource.componentId, componentType, index, seen);
  const detail = resource as ToolDetail & { sourceType?: string; url?: string };
  return {
    componentId,
    componentType,
    name: resource.name,
    schemaName: resource.schemaName,
    facts: {
      sourceComponentId: resource.componentId,
      kind: resource.kind,
      targetSchemaName: resource.targetSchemaName,
      targetId: resource.targetId,
      parentComponentId: resource.parentComponentId,
      toolType: detail.toolType,
      sourceType: detail.sourceType,
    },
    fields: {
      description: resource.description ?? '',
      displayName: detail.displayName ?? '',
      url: detail.url ?? '',
    },
  };
}

function applicability(
  eligibleComponentIds: string[],
  reason: string,
  incomplete = false,
): StandardReviewRuleApplicability {
  if (eligibleComponentIds.length > 0) {
    return { status: 'applicable', reason, eligibleComponentIds };
  }
  return {
    status: incomplete ? 'not-assessed' : 'not-applicable',
    reason,
    eligibleComponentIds: [],
  };
}

function isModelSelectableTopic(component: StandardReviewCorpusComponent): boolean {
  return !component.facts.isStandardSystemTopic
    && (component.facts.routingApplicability as { status?: string } | undefined)?.status === 'applicable'
    && typeof component.fields.modelDescription === 'string'
    && component.fields.modelDescription.trim().length > 0;
}

function hasDescription(component: StandardReviewCorpusComponent): boolean {
  return typeof component.fields.description === 'string'
    && component.fields.description.trim().length > 0;
}

function hasDirectLinkBehavior(instructions: string): boolean {
  return instructions.split(/\r?\n|(?<=[.!?])\s+/).some((line) =>
    /\b(?:link|links|url|urls|website|websites|hyperlink|hyperlinks)\b/i.test(line)
    && /\b(?:share|send|include|provide|surface|return|display|direct)\w*\b/i.test(line));
}

function hasDirectProfessionalAdviceBehavior(instructions: string): boolean {
  return instructions.split(/\r?\n|(?<=[.!?])\s+/).some((line) =>
    /\b(?:medical|health(?:care)?|legal|law|attorney|financial|finance|investment|tax(?:ation)?)\b/i
      .test(line)
    && /\b(?:advice|advise|guidance|recommend|interpret|answer|respond|assist|help|explain|provide)\w*\b/i
      .test(line)
    && !/\b(?:route|delegate|transfer|call|connected agent)\w*\b/i.test(line));
}

function rule(
  template: StandardReviewRuleTemplate,
  scope: StandardReviewRuleApplicability,
): StandardReviewRule {
  return {
    ruleId: template.ruleId,
    name: template.name,
    category: template.category,
    applicability: scope,
    evaluationQuestion: template.evaluationQuestion,
    failWhen: template.failWhen,
    rejectWhen: template.rejectWhen,
    source: template.source,
    requiredEvidence: {
      mustReferenceEligibleComponent: true,
      mustQuoteExactly: true,
      allowEmptyQuoteForAbsence: template.category === 'instructions',
      allowedFieldPaths: template.allowedFieldPaths,
    },
  };
}

function configurationRules(
  stageA: LocalStageAOutput,
  topics: StandardReviewCorpusComponent[],
): StandardReviewRule[] {
  const incomplete = stageA.configurationAvailable === false
    || !!stageA.unknownComponents?.length
    || stageA.topicComponents.some((topic) => topic.ParseStatus === 'unavailable');
  const selectable = topics.filter(isModelSelectableTopic);

  return STANDARD_PATTERN_WORKFLOW_RULES
    .filter((template) => template.category === 'configuration')
    .map((template) => {
      let eligible: StandardReviewCorpusComponent[] = [];
      if (template.ruleId === 'STD-PATTERN-MODEL-NAME') {
        eligible = topics.filter((component) =>
          (component.facts.namingApplicability as { status?: string } | undefined)?.status === 'applicable'
          && typeof component.fields.modelName === 'string'
          && component.fields.modelName.trim());
      } else if (template.ruleId === 'STD-PATTERN-MODEL-DESCRIPTION') {
        eligible = selectable;
      } else {
        const field = template.ruleId === 'STD-PATTERN-INPUT-NAME'
          ? 'inputVariables'
          : template.ruleId === 'STD-PATTERN-INPUT-DESCRIPTION'
            ? 'inputVariableDescriptions'
            : template.ruleId === 'STD-PATTERN-OUTPUT-NAME'
              ? 'outputVariables'
              : 'outputVariableDescriptions';
        eligible = topics.filter((component) =>
          Array.isArray(component.fields[field]) && component.fields[field].length > 0);
      }
      const reason = eligible.length
        ? 'Eligible reviewed configuration fields are available.'
        : incomplete
          ? 'Some reviewed components could not be identified or read, so an empty eligible population cannot be confirmed for this rule.'
          : 'No reviewed component is eligible for this rule.';
      return rule(template, applicability(
        eligible.map((component) => component.componentId),
        reason,
        incomplete,
      ));
    });
}

function routingRules(
  stageA: LocalStageAOutput,
  topics: StandardReviewCorpusComponent[],
  callables: StandardReviewCorpusComponent[],
): StandardReviewRule[] {
  const incomplete = isPopulationIncomplete(stageA);
  const selectableTopics = topics.filter(isModelSelectableTopic);
  const describedCallables = callables.filter(hasDescription);
  const classicTopics = stageA.orchestrationMode === 'classic'
    ? topics.filter((component) =>
      component.facts.triggerKind === 'OnRecognizedIntent')
    : [];
  const classicTriggerDataIncomplete = classicTopics.some((component) =>
    component.facts.triggerQueriesStatus !== 'complete');

  return STANDARD_PATTERN_WORKFLOW_RULES
    .filter((template) => template.category === 'routing')
    .map((template) => {
      const eligible = template.ruleId === 'STD-ROUTE-TOPIC-OVERLAP'
        ? [...selectableTopics, ...describedCallables]
        : template.ruleId === 'STD-PATTERN-TOOL-ROUTING-GAP'
          ? describedCallables
          : classicTopics.filter((component) =>
            component.facts.triggerQueriesStatus === 'complete');
      const minimum = template.ruleId === 'STD-ROUTE-TOPIC-OVERLAP' ? 2 : 1;
      const scoped = eligible.length >= minimum ? eligible : [];
      const triggerDataUnavailable = template.ruleId === 'STD-PATTERN-MISSING-TRIGGERS'
        && (stageA.orchestrationMode === 'unknown' || classicTriggerDataIncomplete);
      if (triggerDataUnavailable) {
        return rule(template, {
          status: 'not-assessed',
          reason: 'Trigger-phrase metadata is unavailable for one or more eligible classic topics.',
          eligibleComponentIds: [],
        });
      }
      const reason = scoped.length
        ? 'The reviewed snapshot contains enough eligible routing text for this rule.'
        : incomplete
          ? 'Some reviewed components could not be identified or read, so the eligible routing population cannot be confirmed for this rule.'
          : 'The reviewed snapshot does not contain enough eligible routing text for this rule.';
      return rule(template, applicability(
        scoped.map((component) => component.componentId),
        reason,
        incomplete,
      ));
    });
}

function instructionRules(
  instructions: StandardReviewCorpusComponent,
): StandardReviewRule[] {
  const inputAvailable = hasInstructionText(instructions.fields.instructions);
  const instructionText = inputAvailable
    ? instructions.fields.instructions as string
    : '';
  return STANDARD_INSTRUCTION_WORKFLOW_RULES.map((template) => {
    if (!inputAvailable) {
      return rule(template, {
        status: 'not-assessed',
        reason: 'No readable agent instructions were supplied.',
        eligibleComponentIds: [],
      });
    }
    if (template.ruleId === 'link-safety' && !hasDirectLinkBehavior(instructionText)) {
      return rule(template, {
        status: 'not-applicable',
        reason: 'The instructions do not direct the agent to share links or URLs.',
        eligibleComponentIds: [],
      });
    }
    if (template.ruleId === 'advice-disclaimers'
      && !hasDirectProfessionalAdviceBehavior(instructionText)) {
      return rule(template, {
        status: 'not-applicable',
        reason: 'The instructions do not direct this agent to provide professional advice.',
        eligibleComponentIds: [],
      });
    }
    return rule(template, {
      status: 'applicable',
      reason: 'The complete agent-instructions field is available for the original Stage C criterion.',
      eligibleComponentIds: [instructions.componentId],
    });
  });
}

function unit(
  base: Omit<StandardReviewUnit['corpus'], 'reviewUnit' | 'standardReview'>,
  unitId: string,
  componentIndex: StandardReviewUnit['componentIndex'],
  components: StandardReviewCorpusComponent[],
  rules: StandardReviewRule[],
): StandardReviewUnit {
  return {
    unitId,
    componentIndex,
    corpus: {
      ...base,
      review: { ...base.review, componentCount: components.length },
      reviewUnit: { unitId, componentIndex },
      agent: { ...base.agent, components },
      standardReview: {
        contract: {
          evaluator: rules[0]?.source.evaluator
            ?? (componentIndex < STANDARD_REVIEW_UNIT_INDEX.INSTRUCTIONS_SCOPE_UX
              ? 'stage-b-patterns'
              : 'stage-c-instructions'),
          sourcePrompt: componentIndex < STANDARD_REVIEW_UNIT_INDEX.INSTRUCTIONS_SCOPE_UX
            ? 'ai-Prompt-stageB-improved.md'
            : 'ai-Prompt-evaluate-AgentInstruction.md',
          expectedRuleIds: rules.map((item) => item.ruleId),
          completion: {
            completeStatus: 'complete',
            partialStatus: 'partial',
            requireEveryApplicableRule: true,
            requireNotAssessedForUnavailableRules: true,
          },
          remediation: {
            requireExactTarget: true,
            requireAgentContext: true,
            requireMakerAction: true,
            requireAcceptanceCheck: true,
          },
        },
        rules,
      },
    },
  };
}

/**
 * Build the three self-contained workflow units from one immutable Stage A snapshot.
 */
export function buildStandardReviewWorkflowCorpus(
  stageA: LocalStageAOutput,
  options: BuildCorpusOptions,
): StandardReviewWorkflowCorpus {
  const seen = new Set<string>();
  const instructionsId = uniqueComponentId(`agent:${stageA.botId}:instructions`, 'instructions', 0, seen);
  const instructions: StandardReviewCorpusComponent = {
    componentId: instructionsId,
    componentType: 'agent-instructions',
    name: `${stageA.botName} instructions`,
    schemaName: stageA.botId,
    facts: {
      orchestrationMode: stageA.orchestrationMode,
      source: stageA.source ?? 'live',
      configurationAvailable: stageA.configurationAvailable !== false,
    },
    fields: { instructions: stageA.agentInstructions ?? '' },
  };
  const topics = stageA.topicComponents.map((topic, index) =>
    topicComponent(topic, index, seen));
  const tools = (stageA.toolDetails ?? []).map((item, index) =>
    resourceComponent(item, 'tool', index, seen));
  const connectedAgents = (stageA.connectedAgents ?? []).map((item, index) =>
    resourceComponent(item, 'connected-agent', index, seen));
  const callables = [...tools, ...connectedAgents];
  const configurationTopics = topics.filter((component) => !component.facts.isStandardSystemTopic);
  const routingTopics = configurationTopics.filter((component) =>
    isModelSelectableTopic(component)
    || component.facts.triggerKind === 'OnRecognizedIntent');
  const routingCallables = callables.filter(hasDescription);
  const routingContext = [...routingTopics, ...routingCallables];
  const configRules = configurationRules(stageA, configurationTopics);
  const routeRules = routingRules(stageA, configurationTopics, callables);
  const instructionRuleSet = instructionRules(instructions);
  const instructionRuleIdsFor = (
    categories: Array<'Scope' | 'UX' | 'Safety' | 'Quality'>,
  ) => new Set(STANDARD_INSTRUCTION_WORKFLOW_RULES
    .filter((item) => categories.includes(item.criterionCategory))
    .map((item) => item.ruleId));
  const scopeAndUxRuleIds = instructionRuleIdsFor(['Scope', 'UX']);
  const safetyRuleIds = instructionRuleIdsFor(['Safety']);
  const qualityRuleIds = instructionRuleIdsFor(['Quality']);
  const scopeAndUxRules = instructionRuleSet.filter((item) =>
    scopeAndUxRuleIds.has(item.ruleId));
  const safetyRules = instructionRuleSet.filter((item) =>
    safetyRuleIds.has(item.ruleId));
  const qualityRules = instructionRuleSet.filter((item) =>
    qualityRuleIds.has(item.ruleId));
  const review = {
    correlationId: options.correlationId,
    botId: stageA.botId,
    botName: stageA.botName,
    sourceEnvironment: options.sourceEnvironment,
    sourceType: stageA.source ?? 'live',
    componentCount: STANDARD_REVIEW_UNIT_INDEXES.length,
  };
  const base = {
    schemaVersion: 2 as const,
    jobKind: 'StandardReview' as const,
    reviewPolicyVersion: STANDARD_REVIEW_POLICY_VERSION,
    review,
    agent: {
      purpose: stageA.agentDescription?.trim()
        || 'The agent purpose is not available in the reviewed snapshot.',
      orchestrationMode: stageA.orchestrationMode,
      instructionsComponentId: instructionsId,
      inventory: {
        topicCount: stageA.topicCount,
        toolCount: stageA.toolCount,
        connectedAgentCount: connectedAgents.length,
        knowledgeCount: stageA.knowledgeCount,
        entityCount: stageA.entities?.length ?? 0,
        configurationComponentCount: stageA.configurationComponents?.length ?? 0,
      },
      reviewLimits: [
        'This snapshot was not executed at runtime.',
        'Unavailable facts must produce not-assessed, not a finding.',
        ...(stageA.parsingErrors?.length ? ['Some component data could not be parsed.'] : []),
        ...(stageA.testCaseCount === 0 ? ['The snapshot does not establish live evaluation coverage.'] : []),
      ],
      components: [] as StandardReviewCorpusComponent[],
    },
  };
  const units = [
    unit(base, 'standard-configuration-quality', STANDARD_REVIEW_UNIT_INDEX.CONFIGURATION,
      configurationTopics, configRules),
    unit(base, 'standard-routing-and-references', STANDARD_REVIEW_UNIT_INDEX.ROUTING,
      routingContext, routeRules),
    unit(base, 'standard-instruction-scope-and-ux', STANDARD_REVIEW_UNIT_INDEX.INSTRUCTIONS_SCOPE_UX,
      [instructions], scopeAndUxRules),
    unit(base, 'standard-instruction-safety', STANDARD_REVIEW_UNIT_INDEX.INSTRUCTIONS_SAFETY,
      [instructions], safetyRules),
    unit(base, 'standard-instruction-quality', STANDARD_REVIEW_UNIT_INDEX.INSTRUCTIONS_QUALITY,
      [instructions], qualityRules),
  ];

  return {
    schemaVersion: 2,
    jobKind: 'StandardReview',
    generatedBy: 'CopilotStudioKitMakers/agent-review-tool',
    generatedOn: new Date().toISOString(),
    reviewPolicyVersion: STANDARD_REVIEW_POLICY_VERSION,
    review,
    standardReview: { reviewUnits: units },
    components: units.map((reviewUnit) => ({
      componentIndex: reviewUnit.componentIndex,
      kind: 'StandardReviewUnit',
      skillComponentId: reviewUnit.unitId,
      skillComponentUniqueId: reviewUnit.unitId,
      skillSchemaName: stageA.botId,
      skillName: reviewUnit.unitId,
      source: stageA.source ?? 'live',
      bundleHash: 'not-used',
    })),
  };
}
