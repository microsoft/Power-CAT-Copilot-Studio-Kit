import { yamlParsingService, extractVariables } from '../parser/yamlUtils.js';
import { PATTERN_INHERENT_SEVERITY } from './patternUtils.js';
const ComponentType = {
    Topic: '0',
    TopicV2: '9',
    CustomGPT: '15',
    Skill: '1',
    SkillV2: '13',
    BotEntity: '3',
    BotEntityV2: '11',
    KnowledgeSource: '16',
    TestCase: '19',
};
const SYSTEM_TOPIC_NAMES = new Set([
    'Conversation Start',
    'Conversational boosting',
    'End of Conversation',
    'Fallback',
    'Multiple Topics Matched',
    'On Error',
    'Reset Conversation',
    'Escalate',
    'Sign in',
    'Sign out',
]);
const DEFAULT_TOPIC_NAMES = new Set([
    'Goodbye',
    'Greeting',
    'Start Over',
    'Thank you',
]);
const TOOL_THRESHOLD_HIGH = 25;
const TOOL_THRESHOLD_MEDIUM = 15;
const TEST_CASE_THRESHOLD = 10;
const CHILD_AGENT_SPRAWL_THRESHOLD = 5;
function detectYamlKind(component) {
    const yaml = component.data || component.content || '';
    const match = /^\s*kind\s*:\s*(\w+)/m.exec(yaml);
    return match?.[1];
}
function detectToolType(parsed) {
    const actionKind = parsed.action?.kind;
    switch (actionKind) {
        case 'InvokeFlowTaskAction':
            return 'flow';
        case 'InvokeExternalAgentTaskAction':
            return 'mcp';
        case 'InvokeConnectorTaskAction':
            return 'connector';
        case 'InvokeAIBuilderModelTaskAction':
            return 'prompt';
        default:
            return 'unknown';
    }
}
function detectKnowledgeSourceType(parsed) {
    const source = parsed.source;
    const kind = source?.kind;
    if (kind === 'SharePointSearchSource')
        return { sourceType: 'SharePoint', url: source?.site };
    if (kind === 'WebSearchSource' || kind === 'WebSource')
        return { sourceType: 'Web', url: source?.url };
    if (kind === 'DataverseSource')
        return { sourceType: 'Dataverse' };
    if (kind === 'FileSource' || kind === 'DocumentSource')
        return { sourceType: 'File' };
    return { sourceType: 'Unknown' };
}
/**
 * Standalone Stage A service.
 */
export class StageAService {
    /**
     * Execute Stage A from pre-parsed ZIP data.
     */
    async executeStageAFromData(botMetadata, components) {
        const botData = await this.parseBotComponents(components, botMetadata.botId, botMetadata.name);
        const localPatterns = this.generateLocalPatterns(botData);
        return {
            botId: botData.botId,
            botName: botData.botName,
            agentDescription: botMetadata.description,
            topicCount: botData.topicCount,
            toolCount: botData.toolCount,
            knowledgeCount: botData.knowledgeCount,
            testCaseCount: botData.testCaseCount,
            agentInstructions: botData.agentInstructions,
            orchestrationMode: 'generative',
            localPatterns,
            topics: botData.topics,
            topicComponents: botData.topicComponents,
            tools: botData.tools,
            knowledgeSources: botData.knowledgeSources,
            toolDetails: botData.toolDetails,
            knowledgeDetails: botData.knowledgeDetails,
            childAgents: botData.childAgents,
            testCaseDetails: botData.testCaseDetails,
            parsingErrors: [],
        };
    }
    /**
     * Generate local patterns from parsed bot data.
     */
    generateLocalPatterns(botData) {
        const patterns = [];
        const mf = botData.missingFields;
        patterns.push({
            patternId: 'local-pattern-1',
            patternName: 'Missing Model Name',
            description: mf.missingModelNames.length > 0
                ? `${mf.missingModelNames.length} topic(s) are missing a model name: ${mf.missingModelNames.join(', ')}`
                : 'All topics have model names defined.',
            recommendation: 'Add a concise, meaningful model name to each topic describing its purpose and when it should be invoked.',
            status: mf.missingModelNames.length === 0,
            topics: mf.missingModelNames,
            category: 'Model Naming',
            severity: PATTERN_INHERENT_SEVERITY['Missing Model Name'],
        });
        patterns.push({
            patternId: 'local-pattern-2',
            patternName: 'Missing Model Description',
            description: mf.missingModelDescriptions.length > 0
                ? `${mf.missingModelDescriptions.length} topic(s) are missing a model description: ${mf.missingModelDescriptions.join(', ')}`
                : 'All topics have model descriptions defined.',
            recommendation: 'Provide a short description for each topic explaining its purpose and trigger conditions.',
            status: mf.missingModelDescriptions.length === 0,
            topics: mf.missingModelDescriptions,
            category: 'Model Description',
            severity: PATTERN_INHERENT_SEVERITY['Missing Model Description'],
        });
        const missingInputVarNameTopics = [...new Set(mf.missingInputVariableNames.map((v) => v.topic))];
        patterns.push({
            patternId: 'local-pattern-3',
            patternName: 'Missing Input Variable Name',
            description: mf.missingInputVariableNames.length > 0
                ? `${mf.missingInputVariableNames.length} input variable(s) are missing a display name across ${missingInputVarNameTopics.length} topic(s)`
                : 'All input variables have display names defined.',
            recommendation: 'Add a clear display name to each input variable to specify what data is expected. Use descriptive camelCase names (e.g., userId, orderDetails).',
            status: mf.missingInputVariableNames.length === 0,
            topics: missingInputVarNameTopics,
            category: 'Input Variables',
            severity: PATTERN_INHERENT_SEVERITY['Missing Input Variable Name'],
        });
        const missingInputVarDescTopics = [...new Set(mf.missingInputVariableDescriptions.map((v) => v.topic))];
        patterns.push({
            patternId: 'local-pattern-4',
            patternName: 'Missing Input Variable Description',
            description: mf.missingInputVariableDescriptions.length > 0
                ? `${mf.missingInputVariableDescriptions.length} input variable(s) are missing a description across ${missingInputVarDescTopics.length} topic(s)`
                : 'All input variables have descriptions defined.',
            recommendation: 'Add a description to each input variable explaining its purpose, expected format, and constraints.',
            status: mf.missingInputVariableDescriptions.length === 0,
            topics: missingInputVarDescTopics,
            category: 'Input Variables',
            severity: PATTERN_INHERENT_SEVERITY['Missing Input Variable Description'],
        });
        const missingOutputVarNameTopics = [...new Set(mf.missingOutputVariableNames.map((v) => v.topic))];
        patterns.push({
            patternId: 'local-pattern-5',
            patternName: 'Missing Output Variable Name',
            description: mf.missingOutputVariableNames.length > 0
                ? `${mf.missingOutputVariableNames.length} output variable(s) are missing a display name across ${missingOutputVarNameTopics.length} topic(s)`
                : 'All output variables have display names defined.',
            recommendation: 'Add a clear display name to each output variable to specify what data is produced. Use descriptive camelCase names (e.g., resultStatus, reportUrl).',
            status: mf.missingOutputVariableNames.length === 0,
            topics: missingOutputVarNameTopics,
            category: 'Output Variables',
            severity: PATTERN_INHERENT_SEVERITY['Missing Output Variable Name'],
        });
        const missingOutputVarDescTopics = [...new Set(mf.missingOutputVariableDescriptions.map((v) => v.topic))];
        patterns.push({
            patternId: 'local-pattern-6',
            patternName: 'Missing Output Variable Description',
            description: mf.missingOutputVariableDescriptions.length > 0
                ? `${mf.missingOutputVariableDescriptions.length} output variable(s) are missing a description across ${missingOutputVarDescTopics.length} topic(s)`
                : 'All output variables have descriptions defined.',
            recommendation: 'Add a description to each output variable explaining what it contains, its format, and how it should be used by downstream topics.',
            status: mf.missingOutputVariableDescriptions.length === 0,
            topics: missingOutputVarDescTopics,
            category: 'Output Variables',
            severity: PATTERN_INHERENT_SEVERITY['Missing Output Variable Description'],
        });
        const isHighTools = botData.toolCount > TOOL_THRESHOLD_HIGH;
        const isMediumTools = botData.toolCount > TOOL_THRESHOLD_MEDIUM;
        const hasExcessiveTools = isHighTools || isMediumTools;
        patterns.push({
            patternId: 'local-pattern-7',
            patternName: 'Excessive Tools Usage',
            description: isHighTools
                ? `This agent has ${botData.toolCount} tools configured, significantly increasing complexity and response latency`
                : isMediumTools
                    ? `This agent has ${botData.toolCount} tools configured, which may increase complexity`
                    : `Tools usage is appropriate (${botData.toolCount} tools configured)`,
            recommendation: hasExcessiveTools
                ? 'Consider reducing the number of tools. Keep focused sets of actions per agent to improve orchestration accuracy and reduce latency.'
                : 'Tools usage is within acceptable limits.',
            status: !hasExcessiveTools,
            topics: hasExcessiveTools ? botData.tools : [],
            category: 'Architecture',
            severity: PATTERN_INHERENT_SEVERITY['Excessive Tools Usage'],
        });
        const hasInadequateTestCases = botData.testCaseCount < TEST_CASE_THRESHOLD;
        patterns.push({
            patternId: 'local-pattern-8',
            patternName: 'Inadequate Test Cases',
            description: hasInadequateTestCases
                ? botData.testCaseCount === 0
                    ? 'No test cases defined for this agent'
                    : `Only ${botData.testCaseCount} test case(s) defined — insufficient for meaningful coverage`
                : `Test coverage is adequate (${botData.testCaseCount} test cases defined)`,
            recommendation: hasInadequateTestCases
                ? `Add more test cases to achieve adequate coverage (recommended: at least ${TEST_CASE_THRESHOLD} test cases).`
                : 'Test case coverage is adequate.',
            status: !hasInadequateTestCases,
            topics: [],
            category: 'Evaluation',
            severity: PATTERN_INHERENT_SEVERITY['Inadequate Test Cases'],
        });
        const agentsWithoutDescription = (botData.childAgents ?? []).filter((agent) => !agent.description || agent.description.trim() === '');
        const hasMissingAgentDescriptions = agentsWithoutDescription.length > 0;
        if ((botData.childAgents ?? []).length > 0) {
            patterns.push({
                patternId: 'local-pattern-9',
                patternName: 'Missing Child Agent Description',
                description: hasMissingAgentDescriptions
                    ? `${agentsWithoutDescription.length} child agent(s) are missing descriptions: ${agentsWithoutDescription.map((agent) => agent.name).join(', ')}. In generative orchestration, the parent agent routes to child agents based solely on their description — missing descriptions make child agents unreachable.`
                    : 'All child agents have descriptions.',
                recommendation: hasMissingAgentDescriptions
                    ? 'Add a clear, specific description to each child agent so the orchestrator can route to it correctly. Treat each child agent as a "tool" — its description is the only signal the orchestrator uses for routing.'
                    : 'Child agent descriptions are in place.',
                status: !hasMissingAgentDescriptions,
                topics: agentsWithoutDescription.map((agent) => agent.name),
                category: 'Architecture',
                severity: PATTERN_INHERENT_SEVERITY['Missing Child Agent Description'],
            });
        }
        const childAgentCount = (botData.childAgents ?? []).length;
        const hasAgentSprawl = childAgentCount > CHILD_AGENT_SPRAWL_THRESHOLD;
        if (childAgentCount > 0) {
            patterns.push({
                patternId: 'local-pattern-10',
                patternName: 'Child Agent Architecture Sprawl',
                description: hasAgentSprawl
                    ? `This agent has ${childAgentCount} child agents, which may indicate over-delegation. Too many agents makes it hard to maintain, debug, secure, or update.`
                    : `Child agent count is manageable (${childAgentCount} agent${childAgentCount > 1 ? 's' : ''} configured).`,
                recommendation: hasAgentSprawl
                    ? 'Review whether all child agents serve a distinct, meaningful purpose. Consolidate agents that handle small or overlapping tasks.'
                    : 'Child agent count is within acceptable limits.',
                status: !hasAgentSprawl,
                topics: hasAgentSprawl ? (botData.childAgents ?? []).map((agent) => agent.name) : [],
                category: 'Architecture',
                severity: PATTERN_INHERENT_SEVERITY['Child Agent Architecture Sprawl'],
            });
        }
        return patterns;
    }
    /**
     * Count components by type.
     */
    countComponentsByType(components, componentType) {
        return components.filter((component) => component.componenttype === componentType).length;
    }
    async parseBotComponents(components, botId, botName) {
        const topics = [];
        const topicComponents = [];
        const tools = [];
        const knowledgeSources = [];
        const testCases = [];
        const toolDetails = [];
        const knowledgeDetails = [];
        const childAgents = [];
        const testCaseDetails = [];
        let agentInstructions;
        const missingFields = {
            missingModelNames: [],
            missingModelDescriptions: [],
            missingInputVariableNames: [],
            missingInputVariableDescriptions: [],
            missingOutputVariableNames: [],
            missingOutputVariableDescriptions: [],
        };
        for (const component of components) {
            const name = component.name || 'Unnamed';
            const componentType = component.componenttype;
            if (componentType === ComponentType.CustomGPT) {
                const yamlSource = component.data || component.content || '';
                if (yamlSource && !agentInstructions) {
                    try {
                        const parsed = yamlParsingService.parseYAML(yamlSource);
                        if (parsed) {
                            const instructions = yamlParsingService.extractAgentInstructions(parsed);
                            if (instructions) {
                                agentInstructions = instructions;
                            }
                        }
                    }
                    catch {
                        // ignore
                    }
                }
            }
            else if (componentType === ComponentType.Topic || componentType === ComponentType.TopicV2) {
                const yamlKind = detectYamlKind(component);
                if (yamlKind === 'AgentDialog') {
                    try {
                        const yamlSource = component.data || component.content || '';
                        const parsed = yamlSource ? yamlParsingService.parseYAML(yamlSource) : null;
                        const description = parsed?.beginDialog?.description;
                        childAgents.push({ name, description });
                    }
                    catch {
                        childAgents.push({ name });
                    }
                    continue;
                }
                if (yamlKind === 'TaskDialog') {
                    tools.push(name);
                    const yamlSource = component.data || component.content || '';
                    try {
                        const parsed = yamlSource ? yamlParsingService.parseYAML(yamlSource) : null;
                        toolDetails.push({
                            name,
                            displayName: parsed?.modelDisplayName,
                            description: parsed?.modelDescription,
                            toolType: parsed ? detectToolType(parsed) : 'unknown',
                        });
                    }
                    catch {
                        toolDetails.push({ name, toolType: 'unknown' });
                    }
                    continue;
                }
                topics.push(name);
                if (SYSTEM_TOPIC_NAMES.has(name) || DEFAULT_TOPIC_NAMES.has(name)) {
                    continue;
                }
                const topicYaml = component.content || component.data || '';
                if (topicYaml) {
                    try {
                        const parsed = yamlParsingService.parseYAML(topicYaml);
                        if (parsed) {
                            const topicComp = {
                                TopicName: name,
                                ModelName: parsed.modelDisplayName ?? undefined,
                                ModelDescription: parsed.modelDescription ?? undefined,
                            };
                            if (!topicComp.ModelName?.trim()) {
                                missingFields.missingModelNames.push(name);
                            }
                            if (!topicComp.ModelDescription?.trim()) {
                                missingFields.missingModelDescriptions.push(name);
                            }
                            const inputVars = parsed.inputType
                                ? parsed.inputType.properties
                                : parsed.inputVariables;
                            if (inputVars) {
                                const extracted = extractVariables(inputVars);
                                extracted.forEach((variable) => {
                                    if (!variable.displayName?.trim()) {
                                        missingFields.missingInputVariableNames.push({ topic: name, variable: variable.VariableName });
                                    }
                                    if (!variable.VariableDescription?.trim()) {
                                        missingFields.missingInputVariableDescriptions.push({ topic: name, variable: variable.VariableName });
                                    }
                                });
                                topicComp.InputVariables = extracted.map((variable) => ({
                                    VariableName: variable.VariableName,
                                    VariableDescription: variable.VariableDescription,
                                }));
                            }
                            const outputVars = parsed.outputType
                                ? parsed.outputType.properties
                                : parsed.outputVariables;
                            if (outputVars) {
                                const extracted = extractVariables(outputVars);
                                extracted.forEach((variable) => {
                                    if (!variable.displayName?.trim()) {
                                        missingFields.missingOutputVariableNames.push({ topic: name, variable: variable.VariableName });
                                    }
                                    if (!variable.VariableDescription?.trim()) {
                                        missingFields.missingOutputVariableDescriptions.push({ topic: name, variable: variable.VariableName });
                                    }
                                });
                                topicComp.OutputVariables = extracted.map((variable) => ({
                                    VariableName: variable.VariableName,
                                    VariableDescription: variable.VariableDescription,
                                }));
                            }
                            if (Array.isArray(parsed.triggerQueries)) {
                                topicComp.triggerQueries = parsed.triggerQueries;
                            }
                            topicComponents.push(topicComp);
                        }
                        else {
                            topicComponents.push({ TopicName: name });
                        }
                    }
                    catch {
                        topicComponents.push({ TopicName: name });
                    }
                }
                else {
                    missingFields.missingModelNames.push(name);
                    missingFields.missingModelDescriptions.push(name);
                    topicComponents.push({ TopicName: name });
                }
            }
            else if (componentType === ComponentType.BotEntity ||
                componentType === ComponentType.BotEntityV2 ||
                componentType === ComponentType.KnowledgeSource) {
                knowledgeSources.push(name);
                const yamlSource = component.data || component.content || '';
                try {
                    const parsed = yamlSource ? yamlParsingService.parseYAML(yamlSource) : null;
                    if (parsed) {
                        const { sourceType, url } = detectKnowledgeSourceType(parsed);
                        knowledgeDetails.push({ name, sourceType, url });
                    }
                    else {
                        knowledgeDetails.push({ name, sourceType: 'Unknown' });
                    }
                }
                catch {
                    knowledgeDetails.push({ name, sourceType: 'Unknown' });
                }
            }
            else if (componentType === ComponentType.TestCase) {
                testCases.push(name);
                const yamlSource = component.data || component.content || '';
                try {
                    const parsed = yamlSource ? yamlParsingService.parseYAML(yamlSource) : null;
                    if (parsed?.kind === 'EvaluationData') {
                        const rows = parsed.rows;
                        const firstRow = rows?.[0];
                        const input = firstRow?.input ?? name;
                        const source = firstRow?.source === 'Generated' ? 'Generated' : 'Manual';
                        testCaseDetails.push({ name, input, source });
                    }
                }
                catch {
                    // ignore
                }
            }
        }
        return {
            botId,
            botName,
            topics,
            topicComponents,
            tools,
            knowledgeSources,
            testCases: [...new Set(testCases)],
            agentInstructions,
            topicCount: topics.length,
            toolCount: tools.length,
            knowledgeCount: knowledgeSources.length,
            testCaseCount: testCases.length,
            toolDetails,
            knowledgeDetails,
            childAgents,
            testCaseDetails,
            missingFields,
        };
    }
}
export const stageAService = new StageAService();
