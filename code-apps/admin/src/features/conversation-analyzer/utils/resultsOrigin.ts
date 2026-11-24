/** Query param recording which tab opened the agent screens, so breadcrumbs lead back to it. */
export const RESULTS_ORIGIN_PARAM = 'from';
/** Query param with the agent's environment URL, used to pick the right agent when a bot ID exists in several environments. */
export const RESULTS_ENV_PARAM = 'env';
export const CONVERSATIONS_ORIGIN = 'conversations';
export const PROMPT_INSIGHTS_ORIGIN = 'prompt-insights';

const ORIGIN_CRUMBS: Record<string, { label: string; to: string }> = {
  [CONVERSATIONS_ORIGIN]: { label: 'Conversations', to: '/conversation-analyzer?tab=conversations' },
  [PROMPT_INSIGHTS_ORIGIN]: { label: 'Prompt insights', to: '/conversation-analyzer?tab=prompt-insights' },
};
const AGENTS_CRUMB = { label: 'Agents', to: '/conversation-analyzer?tab=agents' };

/** Returns the origin only when it is a known non-default tab. */
export function normalizeOrigin(origin: string | null | undefined): string | undefined {
  return origin && origin in ORIGIN_CRUMBS ? origin : undefined;
}

/** Breadcrumb for the tab that opened the agent screens; defaults to Agents. */
export function getOriginCrumb(origin: string | null | undefined) {
  const known = normalizeOrigin(origin);
  return known ? ORIGIN_CRUMBS[known] : AGENTS_CRUMB;
}

/**
 * `?from=…&env=…` suffix that carries the origin and the agent's environment to the next agent screen.
 * The environment is needed because the same bot ID can exist in several environments.
 */
export function originQuery(origin: string | null | undefined, environmentUrl?: string): string {
  const query = new URLSearchParams();
  const known = normalizeOrigin(origin);
  if (known) query.set(RESULTS_ORIGIN_PARAM, known);
  if (environmentUrl) query.set(RESULTS_ENV_PARAM, environmentUrl);
  const text = query.toString();
  return text ? `?${text}` : '';
}

/** Analysis results URL for one agent, scoped to its environment when known. */
export function agentResultsPath(
  agentId: string,
  options: { environmentUrl?: string; promptId?: string; origin?: string | null } = {},
): string {
  const query = new URLSearchParams();
  if (options.promptId) query.set('promptId', options.promptId);
  const known = normalizeOrigin(options.origin);
  if (known) query.set(RESULTS_ORIGIN_PARAM, known);
  if (options.environmentUrl) query.set(RESULTS_ENV_PARAM, options.environmentUrl);
  const text = query.toString();
  return `/conversation-analyzer/agents/${encodeURIComponent(agentId)}/conversations${text ? `?${text}` : ''}`;
}