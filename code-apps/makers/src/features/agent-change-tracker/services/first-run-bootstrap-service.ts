import { MicrosoftDataverseService } from '../../../generated/services/MicrosoftDataverseService';
import type { AvailableAgent, TrackingConfig } from '../contracts/change-tracker';
import { getTrackableAgents } from './available-agents-service';
import { addTrackingConfig, listTrackingConfigs } from './change-tracker-service';
import { shouldUseLocalStore } from './connection-mode';
import { CURRENT_ORG, initTrackingEnvironmentId } from './tracking-org';

const TOP_AGENT_COUNT = 5;
const MIN_TRANSCRIPT_COUNT = 50;
const LOCAL_PREVIEW_STEP_MS = 600;
const LOG_PREFIX = '[AgentChangeTracker bootstrap]';

interface TranscriptAggregateRow {
  botId?: unknown;
  transcriptCount?: unknown;
  latestTranscriptOn?: unknown;
}

interface TranscriptCandidate {
  agent: AvailableAgent;
  transcriptCount: number;
  latestTranscriptOn: number;
}

let firstRunPromise: Promise<TrackingConfig[]> | undefined;
let bootstrapCompleted = false;
let bootstrapInterrupted = false;
let bootstrapPending = false;
const bootstrapListeners = new Set<() => void>();

function setBootstrapPending(pending: boolean): void {
  if (bootstrapPending === pending) return;
  bootstrapPending = pending;
  bootstrapListeners.forEach((listener) => listener());
}

/** Subscribe to first-run bootstrap state shared by every React Query observer. */
export function subscribeFirstRunBootstrap(listener: () => void): () => void {
  bootstrapListeners.add(listener);
  return () => {
    bootstrapListeners.delete(listener);
  };
}

/** Current first-run bootstrap state for useSyncExternalStore. */
export function getFirstRunBootstrapSnapshot(): boolean {
  return bootstrapPending;
}

function normalizeId(value: string | undefined): string {
  return (value ?? '').trim().replace(/[{}]/g, '').toLowerCase();
}

function aggregateRows(data: Record<string, unknown> | undefined): TranscriptAggregateRow[] {
  const value = (data as { value?: unknown } | undefined)?.value;
  return Array.isArray(value) ? (value as TranscriptAggregateRow[]) : [];
}

function aliasedValue(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const alias = value as Record<string, unknown>;
  return alias.value ?? alias.Value ?? value;
}

function aggregateBotId(row: TranscriptAggregateRow): string {
  const value = aliasedValue(row.botId);
  if (typeof value === 'string') return normalizeId(value);
  if (value && typeof value === 'object') {
    const lookup = value as Record<string, unknown>;
    const id = lookup.id ?? lookup.Id;
    if (typeof id === 'string') return normalizeId(id);
  }
  return '';
}

function aggregateTranscriptCount(row: TranscriptAggregateRow): number {
  const value = aliasedValue(row.transcriptCount);
  const count = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(count) ? count : 0;
}

function aggregateLatestTranscriptOn(row: TranscriptAggregateRow): number {
  const value = aliasedValue(row.latestTranscriptOn);
  const timestamp = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function rankedAgentsFetchXml(): string {
  return [
    '<fetch aggregate="true">',
    '  <entity name="conversationtranscript">',
    '    <attribute name="name" alias="transcriptCount" aggregate="countcolumn" distinct="true" />',
    '    <attribute name="createdon" alias="latestTranscriptOn" aggregate="max" />',
    '    <attribute name="bot_conversationtranscriptid" alias="botId" groupby="true" />',
    '    <filter>',
    '      <condition attribute="createdon" operator="last-x-days" value="30" />',
    '    </filter>',
    '    <order alias="latestTranscriptOn" descending="true" />',
    '  </entity>',
    '</fetch>',
  ].join('');
}

function trackedAgentKey(agentId: string, environmentId: string | undefined): string {
  return `${normalizeId(environmentId)}:${normalizeId(agentId)}`;
}

/**
 * Offline equivalent of the transcript-ranked bootstrap. The local store has no
 * transcripts to rank, so the seeded catalog order stands in for "most recent
 * activity" — enough to exercise the real activation path, progress dialog and
 * completion behaviour without a live host.
 */
async function bootstrapLocalPreviewAgents(
  existingConfigs: TrackingConfig[],
): Promise<TrackingConfig[]> {
  const catalog = await getTrackableAgents();
  const trackedAgentKeys = new Set(
    existingConfigs.map((config) => trackedAgentKey(config.agentId, config.environmentId)),
  );

  for (const agent of catalog.slice(0, TOP_AGENT_COUNT)) {
    const agentId = agent.agentId as string;
    if (!agentId) continue;
    const key = trackedAgentKey(agentId, agent.environmentId);
    if (trackedAgentKeys.has(key)) continue;
    await new Promise((resolve) => setTimeout(resolve, LOCAL_PREVIEW_STEP_MS));
    await addTrackingConfig({
      agentId,
      agentName: agent.name || agentId,
      environmentId: agent.environmentId,
      environmentUrl: agent.environmentUrl,
    });
    trackedAgentKeys.add(key);
  }

  return listTrackingConfigs();
}

async function bootstrapTopTranscriptAgents(
  existingConfigs: TrackingConfig[],
): Promise<TrackingConfig[]> {
  if (await shouldUseLocalStore()) return bootstrapLocalPreviewAgents(existingConfigs);

  const environmentId = normalizeId(await initTrackingEnvironmentId());
  if (!environmentId) {
    throw new Error('The current environment could not be determined for automatic agent tracking.');
  }

  const catalog = await getTrackableAgents();
  const currentAgents = new Map<string, AvailableAgent>();
  for (const agent of catalog) {
    if (normalizeId(agent.environmentId) !== environmentId) continue;
    const agentId = normalizeId(agent.agentId);
    if (agentId) currentAgents.set(agentId, agent);
  }
  if (currentAgents.size === 0) return existingConfigs;

  const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
    CURRENT_ORG,
    'conversationtranscripts',
    undefined,
    'application/json',
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    rankedAgentsFetchXml(),
  );
  if (!result.success) {
    throw new Error('Recent agent transcripts could not be loaded for automatic tracking.');
  }

  const rankedCandidates = aggregateRows(result.data)
    .map((row) => ({
      agent: currentAgents.get(aggregateBotId(row)),
      transcriptCount: aggregateTranscriptCount(row),
      latestTranscriptOn: aggregateLatestTranscriptOn(row),
    }))
    .filter(
      (candidate): candidate is TranscriptCandidate =>
        Boolean(candidate.agent?.agentId) && candidate.transcriptCount > 0,
    )
    .sort((left, right) => right.latestTranscriptOn - left.latestTranscriptOn);

  const preferred = rankedCandidates.filter((candidate) => candidate.transcriptCount > MIN_TRANSCRIPT_COUNT);
  const lowerVolume = rankedCandidates.filter((candidate) => candidate.transcriptCount <= MIN_TRANSCRIPT_COUNT);
  const candidates = [...preferred, ...lowerVolume].slice(0, TOP_AGENT_COUNT);
  const trackedAgentKeys = new Set(
    existingConfigs.map((config) => trackedAgentKey(config.agentId, config.environmentId)),
  );

  for (const { agent } of candidates) {
    const agentId = agent.agentId as string;
    const key = trackedAgentKey(agentId, agent.environmentId);
    if (trackedAgentKeys.has(key)) continue;
    await addTrackingConfig({
      agentId,
      agentName: agent.name || agentId,
      environmentId: agent.environmentId,
      environmentUrl: agent.environmentUrl,
    });
    trackedAgentKeys.add(key);
  }

  return listTrackingConfigs();
}

/**
 * List tracked agents, completing first-run activation before returning an
 * empty result.
 *
 * Bootstrap runs at most once successfully per session, so neither the periodic
 * refetch nor a later manual removal can re-add agents. A bootstrap that failed
 * partway is marked interrupted so an explicit retry resumes the remaining
 * agents even though earlier additions already persisted.
 */
export async function listTrackingConfigsWithFirstRun(): Promise<TrackingConfig[]> {
  if (firstRunPromise) return firstRunPromise;

  const operation = (async () => {
    const configs = await listTrackingConfigs();
    if (bootstrapCompleted) return configs;
    if (configs.length > 0 && !bootstrapInterrupted) return configs;

    setBootstrapPending(true);
    try {
      const finalConfigs = await bootstrapTopTranscriptAgents(configs);
      bootstrapCompleted = true;
      bootstrapInterrupted = false;
      return finalConfigs;
    } catch (error: unknown) {
      bootstrapInterrupted = true;
      console.warn(LOG_PREFIX, 'First-run bootstrap failed.', error);
      throw error;
    } finally {
      setBootstrapPending(false);
    }
  })();

  firstRunPromise = operation;
  try {
    return await operation;
  } finally {
    if (firstRunPromise === operation) firstRunPromise = undefined;
  }
}
