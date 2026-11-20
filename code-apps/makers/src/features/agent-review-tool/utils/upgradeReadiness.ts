import type { LocalStageAOutput, StageBTopicComponent, UpgradeReadinessEvidence } from '../contracts/StageOutputs';
import { isSystemTopic } from './systemTopic';

/** A quote from Microsoft Learn. */
export interface LearnQuote {
  /** Plain text before the quote. It is not part of the quote. */
  lead?: string;
  /** The Microsoft Learn text, word for word. */
  text: string;
  url: string;
}

/** A link to a Microsoft Learn page. */
export interface LearnLink {
  label: string;
  url: string;
}

export const CHOOSE_HARNESS_URL = 'https://learn.microsoft.com/microsoft-copilot-studio/guidance/choose-harness';
export const UPGRADE_TO_COPILOT_URL =
  'https://learn.microsoft.com/microsoft-copilot-studio/upgrade-to-microsoft-copilot-from-standard-harness';

// Microsoft Learn text, quoted word for word. Do not edit the text.
export const UPGRADE_BENEFIT_QUOTES: readonly LearnQuote[] = [
  {
    text: "A functioning standard harness agent doesn't need to move simply because another harness is available.",
    url: CHOOSE_HARNESS_URL,
  },
  {
    lead: 'A migration',
    text: 'should be driven by a clear benefit such as better quality, more efficient orchestration, long-running execution, or access to a specific reasoning model or needed new capability.',
    url: CHOOSE_HARNESS_URL,
  },
  {
    text: 'Treat migration as re-architecture rather than component conversion.',
    url: CHOOSE_HARNESS_URL,
  },
  {
    text: 'The upgrade creates a copy of the agent onto the Microsoft Copilot harness. The upgrade carries over instructions, tools, and suggested prompts. Your custom topics can be rebuilt as skills of workflows. You get a report of what was migrated, what requires attention, and what was skipped. The upgrade consumes credits.',
    url: UPGRADE_TO_COPILOT_URL,
  },
];

export const UPGRADE_FACTS =
  'The upgrade is a preview feature. It creates a copy of the agent and uses credits. It does not migrate knowledge sources, Power Fx expressions, or child agents. You start the upgrade in chat on the Copilot Studio home page. This review does not change the agent and does not start an upgrade.';

/** The Microsoft Learn options for Azure AI Search knowledge on the Microsoft Copilot harness. */
export const AZURE_AI_SEARCH_OPTIONS: readonly LearnLink[] = [
  {
    label: 'Connect to Foundry IQ as a tool',
    url: 'https://learn.microsoft.com/microsoft-copilot-studio/agents-experience/foundry-iq-connect',
  },
  {
    label: 'Add the Azure AI Search connector as a tool',
    url: 'https://learn.microsoft.com/connectors/azureaisearch/',
  },
];

export const POWER_FX_LEGACY_MESSAGE = 'Run the review again to see Power Fx usage.';
export const KNOWLEDGE_KIND_LEGACY_MESSAGE = 'Run the review again to see the kind of each knowledge source.';
export const KNOWLEDGE_UNAVAILABLE_MESSAGE = 'Run the review again to see the knowledge sources.';
export const CHILD_AGENTS_UNAVAILABLE_MESSAGE = 'Run the review again to see the child agents.';

/**
 * The source of the knowledge part.
 * - 'current': the saved evidence, with the kind of each knowledge source.
 * - 'legacy-names': a review that was saved before the evidence existed. Names only.
 * - 'unavailable': the snapshot has no knowledge data.
 */
export type KnowledgeReadinessStatus = 'current' | 'legacy-names' | 'unavailable';

export interface KnowledgeReadinessItem {
  name: string;
  /** The raw YAML kind. Absent for the 'legacy-names' status. */
  kind?: string;
  isAzureAiSearch: boolean;
}

export interface PowerFxReadinessItem {
  name: string;
  kind: 'topic' | 'tool';
  expressionCount: number;
}

export interface UpgradeReadinessReport {
  knowledge: {
    status: KnowledgeReadinessStatus;
    items: KnowledgeReadinessItem[];
    /** True when 1 or more knowledge sources are Azure AI Search. */
    hasAzureAiSearch: boolean;
  };
  powerFx: {
    /** False for a review that was saved before the evidence existed. */
    available: boolean;
    /** The custom topics and tools with Power Fx. The list has 50 items at most. */
    items: PowerFxReadinessItem[];
    /** The number of custom topics and tools with Power Fx, before the list limit. */
    total: number;
  };
  /**
   * The names of the child agents. Undefined when the snapshot has no child agent data.
   * Language copies are not in the list.
   */
  childAgents: string[] | undefined;
  /** The names of the custom topics. System topics and language copies are not in the list. */
  customTopics: string[];
}

// Assumption: no ART fixture shows the YAML kind of an Azure AI Search knowledge source.
// This expression matches the probable kind names. Do not add the g flag, because test() with g keeps state.
const AZURE_AI_SEARCH_KIND = /azure\s*ai\s*search|azurecognitivesearch/i;

// The last dot segment of a schema name when it is a language tag, for example hr-HR or zh-Hans-CN.
const LANGUAGE_TAG_SEGMENT = /\.([a-z]{2,3}(?:-[A-Za-z0-9]{2,8})+)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Identify the copy of a topic or a child agent for a secondary language of a multilingual agent,
 * for example 'Gen AI (hr-HR)' with the schema name 'copilots_header_8ac77.topic.GenAI.hr-HR'.
 * The schema name must end with a language tag and the name must end with the same tag in
 * parentheses. A base item is not necessary, because a saved snapshot can contain a copy with no base item.
 */
function isLanguageCopy(name: unknown, schemaName: unknown): boolean {
  if (typeof name !== 'string' || typeof schemaName !== 'string') return false;
  const tag = LANGUAGE_TAG_SEGMENT.exec(schemaName.trim())?.[1];
  return tag !== undefined && name.trim().endsWith(` (${tag})`);
}

function nameOf(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (!isRecord(value)) return '';
  const name = value.name;
  return typeof name === 'string' ? name.trim() : '';
}

function names(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map(nameOf).filter((name) => name.length > 0);
}

function childAgentNames(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return names(value.filter((agent) => !(isRecord(agent) && isLanguageCopy(agent.name, agent.schemaName))));
}

/** Read the saved evidence. A saved snapshot is JSON, so check each value at run time. */
function readEvidence(value: unknown): UpgradeReadinessEvidence | undefined {
  if (!isRecord(value)) return undefined;
  const savedKnowledge = value.knowledgeSources;
  const savedPowerFx = value.powerFx;
  if (!Array.isArray(savedKnowledge) || !Array.isArray(savedPowerFx)) return undefined;

  const knowledgeSources: UpgradeReadinessEvidence['knowledgeSources'] = [];
  for (const item of savedKnowledge) {
    if (!isRecord(item)) continue;
    const name = nameOf(item);
    if (!name) continue;
    const kind = typeof item.kind === 'string' ? item.kind.trim() : '';
    knowledgeSources.push({ name, kind: kind || 'Unknown' });
  }

  const powerFx: UpgradeReadinessEvidence['powerFx'] = [];
  for (const item of savedPowerFx) {
    if (!isRecord(item)) continue;
    const name = nameOf(item);
    const kind = item.kind === 'topic' ? 'topic' : item.kind === 'tool' ? 'tool' : undefined;
    const expressionCount = item.expressionCount;
    if (!name || !kind) continue;
    if (typeof expressionCount !== 'number' || !Number.isFinite(expressionCount) || expressionCount <= 0) continue;
    powerFx.push({ name, kind, expressionCount });
  }

  const savedCount = value.powerFxComponentCount;
  return {
    knowledgeSources,
    powerFx,
    powerFxComponentCount: typeof savedCount === 'number' && Number.isFinite(savedCount) ? savedCount : powerFx.length,
  };
}

function knowledgeReadiness(
  stageA: LocalStageAOutput,
  evidence: UpgradeReadinessEvidence | undefined,
): UpgradeReadinessReport['knowledge'] {
  if (evidence) {
    const items = evidence.knowledgeSources.map((source) => ({
      name: source.name,
      kind: source.kind,
      isAzureAiSearch: AZURE_AI_SEARCH_KIND.test(source.kind),
    }));
    return { status: 'current', items, hasAzureAiSearch: items.some((item) => item.isAzureAiSearch) };
  }
  const legacyNames = names(stageA.knowledgeDetails) ?? names(stageA.knowledgeSources);
  if (legacyNames) {
    return {
      status: 'legacy-names',
      items: legacyNames.map((name) => ({ name, isAzureAiSearch: false })),
      hasAzureAiSearch: false,
    };
  }
  return { status: 'unavailable', items: [], hasAzureAiSearch: false };
}

function customTopicNames(topics: unknown): string[] {
  if (!Array.isArray(topics)) return [];
  const result: string[] = [];
  for (const item of topics) {
    if (!isRecord(item)) continue;
    const topicName = item.TopicName;
    if (typeof topicName !== 'string' || !topicName.trim()) continue;
    if (isLanguageCopy(topicName, item.SchemaName)) continue;
    const triggerKind = item.TriggerKind;
    const triggerQueries = item.triggerQueries;
    // The system topic check calls toLowerCase() on each trigger query, so give it text values only.
    const topic: StageBTopicComponent = {
      TopicName: topicName,
      TriggerKind: typeof triggerKind === 'string' ? triggerKind : undefined,
      triggerQueries: Array.isArray(triggerQueries)
        ? triggerQueries.filter((query): query is string => typeof query === 'string')
        : undefined,
    };
    if (!isSystemTopic(topic)) result.push(topicName.trim());
  }
  return result;
}

/**
 * Build the upgrade readiness report from a saved Stage A snapshot.
 *
 * The function is pure. It changes nothing, and it calls no service and no AI. A review that
 * was saved before the evidence existed gets the fallbacks of the report.
 */
export function buildUpgradeReadiness(stageA: LocalStageAOutput): UpgradeReadinessReport {
  const evidence = readEvidence(stageA.upgradeReadinessEvidence);
  return {
    knowledge: knowledgeReadiness(stageA, evidence),
    powerFx: evidence
      ? {
          available: true,
          items: evidence.powerFx,
          total: Math.max(evidence.powerFxComponentCount, evidence.powerFx.length),
        }
      : { available: false, items: [], total: 0 },
    childAgents: childAgentNames(stageA.childAgents),
    customTopics: customTopicNames(stageA.topicComponents),
  };
}
