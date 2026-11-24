import { useCallback } from 'react';
import { useNavigate as useRouterNavigate } from 'react-router-dom';
import type { NavigateOptions } from 'react-router-dom';

/**
 * Base path for PowerShield Admin within CopilotStudioKitAdmin.
 * All internal PowerShield routes are nested under this prefix.
 */
export const POWER_SHIELD_BASE = '/power-shield';

/**
 * Navigation hook that automatically prefixes PowerShield's base path
 * to absolute route paths. Replaces `useNavigate` from react-router-dom
 * throughout the PowerShield Admin feature.
 *
 * - Numeric arguments (e.g., -1) pass through unchanged (history navigation).
 * - Absolute paths starting with `/` get prefixed with `/power-shield`.
 * - Relative paths pass through unchanged.
 */
export function useNavigate() {
  const navigate = useRouterNavigate();

  return useCallback(
    (to: string | number, options?: NavigateOptions) => {
      if (typeof to === 'number') {
        navigate(to);
      } else if (to === '/') {
        navigate(POWER_SHIELD_BASE, options);
      } else if (to.startsWith('/')) {
        navigate(`${POWER_SHIELD_BASE}${to}`, options);
      } else {
        navigate(to, options);
      }
    },
    [navigate],
  );
}
