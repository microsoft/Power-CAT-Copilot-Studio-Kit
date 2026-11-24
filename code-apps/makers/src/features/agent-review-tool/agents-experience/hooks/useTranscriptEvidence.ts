import { useQuery } from '@tanstack/react-query';
import type { EvidenceState } from '../contracts/TranscriptEvidence';
import { loadTranscriptEvidence } from '../services/transcript/transcriptEvidenceService';

/**
 * Loads observed-usage evidence for one agent.
 *
 * Deliberately a separate query from the review model. A single conversation
 * has measured 1.3 MB, so blocking the Cost & efficiency tab on transcript
 * reads would regress the shipped tab's load. The published-band planning
 * calculator renders immediately and never waits on this.
 */
export function useTranscriptEvidence(options: {
  botId: string | null | undefined;
  orgUrl: string | null | undefined;
  configuredSkills: readonly string[];
  enabled?: boolean;
}) {
  const { botId, orgUrl, configuredSkills, enabled = true } = options;

  return useQuery<EvidenceState, Error>({
    queryKey: [
      'transcript-evidence',
      orgUrl ?? 'current',
      botId ?? 'none',
      // Skill coverage depends on the configured list, so it belongs in the key.
      [...configuredSkills].sort().join('|'),
    ],
    queryFn: async () =>
      loadTranscriptEvidence({
        botId: botId ?? '',
        organizationUrl: orgUrl ?? '',
        configuredSkills,
      }),
    enabled: enabled && Boolean(botId) && Boolean(orgUrl),
    // Transcripts are append-only history, so a long stale time is safe.
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
