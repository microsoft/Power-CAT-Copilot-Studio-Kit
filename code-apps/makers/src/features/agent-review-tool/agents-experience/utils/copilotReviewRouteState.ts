/**
 * Route state parsing for the Microsoft Copilot harness review screen (Task 11).
 *
 * Two modes:
 * - Run: `run=1&componentIdUnique=<guid>` — executes a new review
 * - View: `view=1&reviewId=<guid>` — reopens a saved review without rerunning AI
 *
 * Review depth is not part of the route. Every review runs the full pipeline; a
 * legacy `mode` parameter on an old bookmark is accepted and ignored.
 */

/** Parsed route state for the Microsoft Copilot harness review screen. */
export interface CopilotReviewRouteState {
  run: boolean;
  view: boolean;
  componentIdUnique: string | null;
  reviewId: string | null;
  agentVersion: string | null;
}

/**
 * Parses URLSearchParams into typed route state.
 *
 * @throws When `view=1` is set without a `reviewId` parameter.
 */
export function parseCopilotReviewRouteState(params: URLSearchParams): CopilotReviewRouteState {
  const run = params.get('run') === '1';
  const view = params.get('view') === '1';
  const componentIdUnique = params.get('componentIdUnique');
  const reviewId = params.get('reviewId');
  const agentVersion = params.get('agentVersion');

  if (run && view) {
    throw new Error('Cannot specify both run and view modes');
  }

  if (view && !reviewId) {
    throw new Error('Persisted review ID is required for view mode');
  }

  if (run && !componentIdUnique) {
    throw new Error('componentIdUnique is required for run mode');
  }

  return {
    run,
    view,
    componentIdUnique: componentIdUnique ?? null,
    reviewId: reviewId ?? null,
    agentVersion: agentVersion ?? null,
  };
}

/**
 * Builds a run-mode search string for navigating to a Copilot review.
 *
 * @param botName - Agent display name (URL-encoded)
 * @param componentIdUnique - Bot component unique ID
 */
export function buildRunSearchParams(
  botName: string,
  componentIdUnique: string,
  orgUrl?: string | null,
  environmentId?: string | null,
  agentVersion?: string | null,
): string {
  const params = new URLSearchParams({
    name: botName,
    run: '1',
    componentIdUnique,
  });
  if (orgUrl) params.set('orgUrl', orgUrl);
  if (environmentId) params.set('environmentId', environmentId);
  if (agentVersion) params.set('agentVersion', agentVersion);
  return params.toString();
}

/**
 * Builds a view-mode search string for reopening a persisted Copilot review.
 *
 * @param botName - Agent display name (URL-encoded)
 * @param reviewId - Dataverse review record ID
 * @param environmentId - Power Platform environment GUID for Copilot Studio deep-links
 */
export function buildViewSearchParams(
  botName: string,
  reviewId: string,
  environmentId?: string | null,
): string {
  const params = new URLSearchParams({
    name: botName,
    view: '1',
    reviewId,
  });
  if (environmentId) params.set('environmentId', environmentId);
  return params.toString();
}
