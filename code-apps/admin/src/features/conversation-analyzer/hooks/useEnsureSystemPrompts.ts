/**
 * Ensures the required system prompts (PII Analysis, Sentiment Analysis) exist. Runs once on feature mount.
 */

import { useEffect, useRef } from 'react';
import { ensureSystemPrompts } from '../services/FeatureBootstrapService';

/** Hook that ensures system prompts exist. Call once at the feature root. */
export function useEnsureSystemPrompts() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    ensureSystemPrompts().catch(() => {});
  }, []);
}
