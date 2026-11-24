/**
 * Which backend serves the Microsoft Copilot harness review (spec 014).
 *
 * Deliberately dependency-free. The choice is a `localStorage` read over a
 * compiled constant, and nothing else, so the progress adapters can label a
 * stage with the backend that is actually running without pulling the provider
 * factory — and with it `aiService` and the whole generated Dataverse client —
 * into a pure mapping function.
 *
 * `ReviewAiProvider` re-exports everything here, so callers that want the
 * factories keep importing that module.
 */

export type ReviewAiProviderKind = 'prompt' | 'workflow';

/** Overrides the compiled default. Set from the console to force a backend. */
const OVERRIDE_STORAGE_KEY = 'csk.reviewAiProvider';

/**
 * Active default backend.
 *
 * Set to `workflow` while spec 014 is being validated in CSK-Dev, so running a
 * review needs no console step. Set this back to `prompt` to roll back — the
 * localStorage override exists for one-off comparisons, not as the switch.
 */
const DEFAULT_PROVIDER: ReviewAiProviderKind = 'workflow';

/**
 * Resolves the active backend.
 *
 * Reads a `localStorage` override first so a maker can switch backends without
 * a redeploy; falls back to {@link DEFAULT_PROVIDER}.
 */
export function resolveReviewAiProvider(): ReviewAiProviderKind {
  try {
    const stored = localStorage.getItem(OVERRIDE_STORAGE_KEY);
    if (stored === 'prompt' || stored === 'workflow') return stored;
  } catch {
    // localStorage unavailable (private mode, embedded host) — use the default.
  }
  return DEFAULT_PROVIDER;
}

/**
 * Build stamp for the review backend, logged once per review.
 *
 * Which backend served a review is otherwise invisible: both write the same
 * result shape, so a stale browser bundle silently runs the old backend and the
 * review looks normal. This line is the only cheap way to tell them apart.
 */
export function logReviewBackend(kind: ReviewAiProviderKind): void {
  const source = (() => {
    try {
      const stored = localStorage.getItem(OVERRIDE_STORAGE_KEY);
      return stored === 'prompt' || stored === 'workflow'
        ? 'localStorage override'
        : 'compiled default';
    } catch {
      return 'compiled default';
    }
  })();
  console.info(
    `[CopilotReview] AI backend: ${kind} (${source}). Build: spec-014 child-rows.`,
  );
}
