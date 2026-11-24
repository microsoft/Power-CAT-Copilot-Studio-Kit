/**
 * The review runner's context object, its consumer hook, and its value type.
 *
 * Kept apart from the provider component so that file exports a component and
 * nothing else. React Fast Refresh can only replace a module whose exports are
 * all components; a hook or constant sharing the file forces a full reload on
 * every edit, and the provider is now the owner of any in-flight review — a
 * full reload would destroy the very run this design exists to protect.
 */
import { createContext, useContext } from 'react';

import type { UseArtifactReviewValue } from '../hooks/useArtifactReview';

export interface ArtifactReviewRunnerValue extends UseArtifactReviewValue {
  /**
   * True while the progress dialog belongs on screen.
   *
   * Separate from the phase, because a running review and a watched review are
   * now different things: the reader can send the run to the background and
   * carry on working while it continues.
   */
  watching: boolean;
  /** True while a review is running, whether or not anyone is watching it. */
  isRunning: boolean;
  /** Leaves the review running and gives the screen back. */
  sendToBackground: () => void;
  /** Re-opens the progress dialog from the background badge. */
  watch: () => void;
  /**
   * Set when a finished review could not be written to Dataverse. The result
   * then stays on the tab, because losing it would waste an AI call the user
   * has already paid for.
   */
  saveError: string | null;
}

export const ArtifactReviewRunnerContext = createContext<ArtifactReviewRunnerValue | null>(null);

/**
 * Reads the application-wide review runner.
 *
 * Throws rather than returning a local fallback: a silent fallback would mean a
 * review that runs inside a component again, which is the exact defect this
 * provider exists to remove.
 */
export function useArtifactReviewRunner(): ArtifactReviewRunnerValue {
  const value = useContext(ArtifactReviewRunnerContext);
  if (!value) {
    throw new Error('useArtifactReviewRunner must be used inside <ArtifactReviewRunnerProvider>.');
  }
  return value;
}
