import type { ParsedBotData } from '../../contracts/ServiceContracts';
import type { ResourceDetail } from '../../contracts/StageOutputs';
import type {
  AeConnectedAgent, AeKnowledgeSource, AeTool, AeTopic, AgentsExperienceModel,
} from '../contracts/AgentsExperienceModel';
import type { EvaluationConfiguration } from '../contracts/EvaluationEvidence';

/**
 * The part of a parsed standard agent this projection actually reads.
 *
 * Declared structurally rather than as `ParsedBotData` because the Stage A snapshot
 * (`LocalStageAOutput`) carries every one of these fields and none of the rest, and inventing the
 * missing `ParsedBotData` members — `missingFields` in particular — purely to satisfy a parameter
 * type would be fabricating evidence to make a call compile. Both shapes satisfy this, so there is
 * still one projection.
 */
export type StandardAgentSource = Pick<ParsedBotData,
  | 'agentInstructions' | 'agentSettings' | 'toolDetails' | 'connectedAgents' | 'childAgents'
  | 'knowledgeDetails' | 'topicComponents' | 'topics'>;

/** Absence of evaluation evidence, expressed as three empty arrays rather than a placeholder row. */
const NO_EVALUATION: EvaluationConfiguration = {
  evaluationSets: [], testCases: [], multiTurnCases: [],
};

/**
 * A delegation target, mapped without deciding whether it is a child or a connected agent.
 *
 * `targetSchemaName` is only ever set on a connected agent — a child agent is defined inside the
 * reviewed agent and so names no target — which is why the same mapper serves both populations.
 */
function delegationTarget(detail: ResourceDetail): AeConnectedAgent {
  return {
    name: detail.name,
    schemaname: detail.schemaName ?? '',
    description: detail.description,
    componentId: detail.componentId,
    botSchemaName: detail.targetSchemaName,
  };
}

/**
 * Topics, preferring the parsed components over the bare name list.
 *
 * `parseStandardComponents` emits both, but a `ParsedBotData` rebuilt from a persisted snapshot can
 * carry only the names. Falling back to those keeps the population *present* — which is what pillar
 * applicability turns on — instead of reporting an agent with topics as having none.
 */
function topicsOf(parsed: StandardAgentSource): AeTopic[] {
  const components = parsed.topicComponents;
  if (components?.length) {
    return components.map(topic => ({
      name: topic.TopicName,
      schemaname: topic.SchemaName ?? '',
      componentId: topic.TopicId,
      description: topic.ModelDescription,
    }));
  }
  return (parsed.topics ?? []).map(name => ({ name, schemaname: '' }));
}

/**
 * Projects a parsed standard agent onto `AgentsExperienceModel`, the one model the shared scorer
 * reads.
 *
 * The scorer was made standard-capable before anything could feed it: `computePillarBreakdown`
 * resolves a rule's pillar from the registry and decides applicability from the populations present
 * on this model. Without a projection a standard agent reached it as nothing at all, so every
 * pillar looked inapplicable and the harness — not the agent — decided the score. This is the
 * missing input, not a second scoring path.
 *
 * Three mappings are deliberate and are the reason this is not a mechanical field copy:
 *
 * - **Topics are their own population, not skills.** A standard agent routes over topics where a
 *   copilot agent routes over skills, so they occupy the same pillar slot but are not the same
 *   thing. Keeping them in `topics` lets the pillar be applicable for a standard agent while
 *   `skills` stays honestly empty, and keeps them out of the capability denominator
 *   `computeCoverage` builds from `tools`/`skills`/`connectedAgents`.
 * - **Child agents stay separate from connected agents.** A child agent is defined inside this
 *   agent; a connected agent is a reference out to another one. The parser tracks them as two
 *   arrays and the standard orchestration rules read `childAgents` specifically, so merging them
 *   here would make a rule about sub-agents fire on a reference and vice versa.
 * - **`kind` collapses to `ConnectorTool` for everything that is not MCP.** `AeTool.kind` is a
 *   two-value copilot union and a standard `toolType` has five values. Collapsing follows the
 *   precedent already set where this projection's narrower predecessor did the same, rather than
 *   widening a copilot contract to carry standard vocabulary.
 *
 * Evaluation rows are taken from `evaluation` and never re-derived from `ParsedBotData.testCases`:
 * the normalized evidence is the designed seam, it already holds `Ae*` values produced by the same
 * parsers both harnesses use, and the bare `testCases` name list cannot express set membership,
 * graders or expected steps. An agent with no evidence yields three empty arrays, which the
 * evaluation rules read as a real absence.
 *
 * `agentSettings.raw` carries the parsed settings so nothing is silently dropped; the persistence
 * layer strips it deliberately as unbounded maker JSON.
 */
export function standardAgentsExperienceModel(
  parsed: StandardAgentSource,
  evaluation: EvaluationConfiguration = NO_EVALUATION,
): AgentsExperienceModel {
  return {
    agentSettings: {
      instructions: parsed.agentInstructions ?? '',
      enableWebSearch: parsed.agentSettings?.useModelKnowledge,
      raw: { ...(parsed.agentSettings ?? {}) },
    },
    tools: (parsed.toolDetails ?? []).map((tool): AeTool => ({
      name: tool.name,
      displayName: tool.displayName,
      description: tool.description,
      schemaname: tool.schemaName ?? '',
      componentId: tool.componentId,
      kind: tool.toolType === 'mcp' ? 'McpTool' : 'ConnectorTool',
    })),
    skills: [],
    connectedAgents: (parsed.connectedAgents ?? []).map(delegationTarget),
    childAgents: (parsed.childAgents ?? []).map(delegationTarget),
    knowledge: (parsed.knowledgeDetails ?? []).map((source): AeKnowledgeSource => ({
      name: source.name,
      schemaname: source.schemaName ?? '',
      componentId: source.componentId,
      sourceKind: source.sourceType,
    })),
    topics: topicsOf(parsed),
    evaluationSets: evaluation.evaluationSets,
    testCases: evaluation.testCases,
    multiTurnCases: evaluation.multiTurnCases,
    triggers: [],
    unknownKinds: [],
  };
}

/**
 * The same agent as `standardAgentsExperienceModel`, reshaped for `computeCoverage`.
 *
 * Coverage asks "are this agent's capabilities exercised by its tests?", and for that one question
 * a child agent and a connected agent are the same thing: both are delegation targets a test case
 * can declare it expects to invoke. The scoring model keeps them apart because the orchestration
 * rules distinguish them; merging here rather than there keeps each consumer's view correct without
 * giving either one a second model to maintain.
 *
 * Topics are left as they are because `computeCoverage` builds its denominator from
 * `tools`/`skills`/`connectedAgents` only — a topic is not a capability a case can declare, so it
 * never reaches the capability list and cannot inflate it.
 */
export function standardCoverageModel(
  parsed: StandardAgentSource,
  evaluation: EvaluationConfiguration = NO_EVALUATION,
): AgentsExperienceModel {
  const model = standardAgentsExperienceModel(parsed, evaluation);
  const merged = new Map<string, AeConnectedAgent>();
  for (const agent of [...model.connectedAgents, ...(model.childAgents ?? [])]) {
    const key = agent.schemaname || agent.name;
    if (key && !merged.has(key)) merged.set(key, agent);
  }
  return { ...model, connectedAgents: [...merged.values()] };
}
