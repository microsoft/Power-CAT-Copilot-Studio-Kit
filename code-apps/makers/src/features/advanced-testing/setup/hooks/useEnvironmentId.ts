/**
 * Resolves the current Power Platform environment id from the Power Apps SDK
 * context. The id is required to query available connections from the Power
 * Apps for Makers connector (`environment` filter).
 *
 * Ported from the inline `resolveEnvId` pattern in Power Shield's
 * `ConnectionHealthScreen.tsx`. Exposed as a hook so the Setup screen can share
 * the result across tabs and child components without re-calling `getContext()`.
 */

import { useEffect, useState } from "react";
import { getContext } from "@microsoft/power-apps/app";

const LOG_PREFIX = "[AdvancedTesting:Setup:Env]";

export interface EnvironmentIdState {
  /** Resolved environment id; `null` while loading or on failure. */
  environmentId: string | null;
  /** Human-readable error when resolution failed. `null` while loading or on success. */
  error: string | null;
  /** True while the first resolution attempt is in flight. */
  isLoading: boolean;
}

export function useEnvironmentId(): EnvironmentIdState {
  const [state, setState] = useState<EnvironmentIdState>({
    environmentId: null,
    error: null,
    isLoading: true,
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const ctx = await getContext();
        if (cancelled) return;
        const id = (ctx.app as unknown as Record<string, unknown>).environmentId as
          | string
          | undefined;
        if (id) {
          setState({ environmentId: id, error: null, isLoading: false });
        } else {
          setState({
            environmentId: null,
            error: "Environment id is unavailable from the Power Apps SDK context.",
            isLoading: false,
          });
        }
      } catch (err) {
        if (cancelled) return;
        console.warn(`${LOG_PREFIX} could not resolve environment id`, err);
        const message =
          err instanceof Error
            ? err.message
            : "Could not resolve the environment id from the Power Apps SDK context.";
        setState({ environmentId: null, error: message, isLoading: false });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
