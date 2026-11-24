/**
 * Deep links from a tracked agent back to its authoring experience in Copilot
 * Studio. The tracking configuration stores the agent's `botid` and the
 * environment it lives in, which is exactly the pair Copilot Studio's agent URL
 * is keyed on. The host differs per cloud, so it is resolved from the same
 * configured environment variable the rest of the kit uses rather than hardcoded.
 */

import {
  buildCopilotStudioAgentOverviewUrl,
  getConfiguredCopilotStudioBaseUrl,
} from '../../../shared/services/copilotStudioUrl';
import { MicrosoftDataverseService } from '../../../generated/services/MicrosoftDataverseService';
import type { TrackingConfig } from '../contracts/change-tracker';

type AgentLinkConfig = Pick<TrackingConfig, 'agentId' | 'environmentId' | 'environmentUrl'>;

async function isNewExperienceAgent(config: AgentLinkConfig): Promise<boolean> {
  const organization = config.environmentUrl?.trim().replace(/\/+$/g, '');
  if (!organization) return false;

  const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
    organization,
    'bots',
    undefined,
    'application/json',
    undefined,
    undefined,
    'configuration',
    `botid eq ${config.agentId}`,
    undefined,
    undefined,
    undefined,
    1,
  );
  if (!result.success) return false;

  const rows = (result.data as { value?: Array<{ configuration?: string }> } | undefined)?.value ?? [];
  const configuration = rows[0]?.configuration;
  if (!configuration) return false;

  try {
    const parsed = JSON.parse(configuration) as { recognizer?: { $kind?: string } };
    return parsed.recognizer?.$kind === 'CLICopilotRecognizer';
  } catch {
    return false;
  }
}

/**
 * Builds the Copilot Studio overview URL for a tracked agent, or `null` when the
 * tracking configuration is missing either identifier the URL needs.
 */
export async function buildCopilotStudioAgentUrl(config: AgentLinkConfig): Promise<string | null> {
  const environmentId = config.environmentId?.trim();
  const agentId = config.agentId?.trim();
  if (!environmentId || !agentId) return null;

  const [baseUrl, isNewExperience] = await Promise.all([
    getConfiguredCopilotStudioBaseUrl(),
    isNewExperienceAgent(config).catch(() => false),
  ]);
  return buildCopilotStudioAgentOverviewUrl(baseUrl, environmentId, agentId, isNewExperience);
}
