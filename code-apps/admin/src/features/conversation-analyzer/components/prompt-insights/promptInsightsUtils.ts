/** Helpers shared by the Prompt insights components. */

import { agentResultsPath, PROMPT_INSIGHTS_ORIGIN } from '../../utils/resultsOrigin';

const MINUTE_MS = 60_000;

/** "just now", "5 min ago", "3 hours ago", "2 days ago"; locale date after 30 days. */
export function formatRelativeTime(iso?: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.floor((Date.now() - then) / MINUTE_MS);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  if (days <= 30) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return new Date(iso).toLocaleDateString();
}

/** Up to two initials from the words of a prompt name that start with a letter. */
export function getPromptInitials(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
  return initials || '?';
}

/** Analysis results for one agent, filtered to a prompt; breadcrumbs lead back to Prompt insights. */
export function promptResultsPath(agentId: string, promptId: string, environmentUrl?: string): string {
  return agentResultsPath(agentId, { promptId, origin: PROMPT_INSIGHTS_ORIGIN, environmentUrl });
}

/** Manage prompts deep links (MP-6). */
export function managePromptsPath(action?: { view: string } | { create: true }): string {
  if (!action) return '/conversation-analyzer/prompts';
  if ('view' in action) return `/conversation-analyzer/prompts?view=${encodeURIComponent(action.view)}`;
  return '/conversation-analyzer/prompts?create=1';
}
