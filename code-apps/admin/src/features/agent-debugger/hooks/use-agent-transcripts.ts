import { useQuery } from "@tanstack/react-query";
import {
  searchAgentTranscriptsByName,
  getRecentAgentTranscripts,
  scanAgentTranscripts,
} from "../services/conversation-transcript-service";
import type { TranscriptScanResult } from "../services/conversation-transcript-service";
import { AGENT_STALE_TIME_MS } from "./use-agent-details";

/**
 * Searches an agent's transcripts by conversation name (id) server-side via
 * `contains(name, term)`. Searches ALL of the agent's transcripts with no client
 * record cap, returning only the matches. Enabled only when a non-empty search
 * term is provided; pass an already-debounced term to avoid a query per keystroke.
 */
export function useSearchAgentTranscripts(
  agentBotId: string | undefined,
  organizationUrl: string | undefined,
  searchTerm: string,
  since?: string,
  to?: string,
) {
  const term = searchTerm.trim();
  return useQuery({
    queryKey: [
      "searchAgentTranscripts",
      agentBotId,
      organizationUrl,
      term,
      since ?? null,
      to ?? null,
    ],
    queryFn: () =>
      searchAgentTranscriptsByName({
        organizationUrl: organizationUrl!,
        agentBotId: agentBotId!,
        searchTerm: term,
        limit: 50,
        since,
        to,
      }),
    enabled: !!agentBotId && !!organizationUrl && term.length > 0,
    staleTime: AGENT_STALE_TIME_MS,
  });
}

/** Fetches the most recent 50 unique transcript conversations for dropdown display. */
export function useRecentAgentTranscripts(
  agentBotId: string | undefined,
  organizationUrl: string | undefined,
  since?: string,
  to?: string,
) {
  return useQuery({
    queryKey: ["recentAgentTranscripts", agentBotId, organizationUrl, since ?? null, to ?? null],
    queryFn: () =>
      getRecentAgentTranscripts({
        organizationUrl: organizationUrl!,
        agentBotId: agentBotId!,
        limit: 50,
        since,
        to,
      }),
    enabled: !!agentBotId && !!organizationUrl,
    staleTime: AGENT_STALE_TIME_MS,
  });
}

/**
 * Scans an agent's recent transcripts (with content) once per agent + date
 * range, annotating each conversation with its channel and error state. Powers
 * the static channel dropdown and in-memory channel/error filtering.
 * Scans transcript `content` (channel is not a queryable Dataverse column), so
 * it is heavier than the list-only query — but runs once and is cached, with
 * all subsequent filtering done in memory. The service auto-reduces the record
 * limit on failure, so React Query retries are unnecessary here.
 */
export function useAgentScannedTranscripts(
  agentBotId: string | undefined,
  organizationUrl: string | undefined,
  since?: string,
  to?: string,
  enabled = true,
) {
  return useQuery<TranscriptScanResult>({
    queryKey: ["scannedAgentTranscripts", agentBotId, organizationUrl, since ?? null, to ?? null, "user-turns-flow-types"],
    queryFn: () =>
      scanAgentTranscripts({
        organizationUrl: organizationUrl!,
        agentBotId: agentBotId!,
        since,
        to,
      }),
    enabled: enabled && !!agentBotId && !!organizationUrl,
    staleTime: AGENT_STALE_TIME_MS,
    retry: false,
  });
}
