import { getContext } from '@microsoft/power-apps/app';
import { buildCopilotStudioAgentUrl } from '../../agent-change-tracker/services/agent-links';

const COPILOT_STUDIO_COMMERCIAL_HOST = 'https://copilotstudio.microsoft.com';
const COPILOT_STUDIO_PREVIEW_HOST = 'https://copilotstudio.preview.microsoft.com';

export async function getAssessmentAgentUrl(agentId: string): Promise<string> {
  const context = await getContext();
  const url = await buildCopilotStudioAgentUrl({
    agentId,
    environmentId: context.app.environmentId,
    environmentUrl: 'current',
  });
  if (!url) throw new Error('The agent or environment identifier is unavailable.');
  // Commercial agents open in the Copilot Studio preview portal; sovereign-cloud hosts are kept.
  const previewUrl = url.startsWith(`${COPILOT_STUDIO_COMMERCIAL_HOST}/`)
    ? COPILOT_STUDIO_PREVIEW_HOST + url.slice(COPILOT_STUDIO_COMMERCIAL_HOST.length)
    : url;
  return previewUrl.replace(/\/overview$/, '');
}
