/**
 * standardSnapshot
 *
 * Assembles the deterministic standard-agent snapshot — parsed components plus the
 * local checks derived from them — from metadata and components that are already in
 * hand.
 *
 * It lives in `utils` rather than in `StageAService` because the service also owns the
 * live path, which reaches Dataverse through `botService`. Hosts that supply their own
 * components must not pull that dependency in, so the shared part is kept free of it and
 * the service delegates here. One implementation, two callers.
 */
import type { BotMetadata } from '../contracts/ReviewResult';
import type { BotComponent } from '../contracts/ServiceContracts';
import type { LocalStageAOutput } from '../contracts/StageOutputs';
import { parseNormalizedEvaluationEvidence } from '../agents-experience/services/evaluation/normalizedEvaluationEvidence';
import { buildLocalPatterns } from './localPatternBuilder';
import { parseStandardComponents } from './stageAParser';
import { resolveOrchestrationMode } from './topicApplicability';
import { STANDARD_REVIEW_POLICY_VERSION } from './reviewAssessment';

/** The metadata fields the snapshot reads. Narrower than `BotMetadata` so callers holding
 * only a captured row need not invent the rest. */
export type StandardSnapshotMetadata =
  Pick<BotMetadata, 'botId' | 'name' | 'description' | 'configuration' | 'agentSettings'>;

/**
 * Build the standard-agent snapshot without making any network or AI call.
 *
 * @param metadata - Agent identity and settings.
 * @param components - The agent's bot components.
 * @param source - Where the components came from; recorded so downstream stages can tell
 *   a live agent from an uploaded ZIP.
 */
export function extractStandardSnapshot(
  metadata: StandardSnapshotMetadata,
  components: BotComponent[],
  source: 'live' | 'zip',
): LocalStageAOutput {
  const mode = metadata.configuration !== undefined
    ? resolveOrchestrationMode(metadata.configuration)
    : metadata.agentSettings?.orchestrationMode ?? 'unknown';
  const data = parseStandardComponents(components, metadata.botId, metadata.name, mode, source);
  return {
    botId: data.botId, botName: data.botName, agentDescription: metadata.description,
    agentSettings: { ...metadata.agentSettings, orchestrationMode: mode },
    topicCount: data.topicCount, toolCount: data.toolCount, knowledgeCount: data.knowledgeCount,
    testCaseCount: data.testCaseCount, agentInstructions: data.agentInstructions,
    orchestrationMode: mode, policyVersion: STANDARD_REVIEW_POLICY_VERSION, source,
    configurationAvailable: data.configurationAvailable,
    localPatterns: buildLocalPatterns(data),
    topics: data.topics, topicComponents: data.topicComponents, tools: data.tools,
    knowledgeSources: data.knowledgeSources, toolDetails: data.toolDetails,
    knowledgeDetails: data.knowledgeDetails, childAgents: data.childAgents,
    connectedAgents: data.connectedAgents, entities: data.entities,
    configurationComponents: data.configurationComponents,
    unknownComponents: data.unknownComponents,
    testCaseDetails: data.testCaseDetails, parsingErrors: data.parsingErrors,
    // Derived here because this is where the components are. The parser decides availability
    // itself — a live read with no evaluation rows is complete evidence of an agent with no
    // evaluations, while a ZIP that never carried them reports `unavailable` instead of pretending
    // the same thing. Scoring depends on that distinction, so it is made once, at the read.
    evaluationEvidence: parseNormalizedEvaluationEvidence(components, { source }),
    upgradeReadinessEvidence: data.upgradeReadinessEvidence,
  };
}
