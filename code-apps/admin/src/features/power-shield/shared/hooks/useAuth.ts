import { useAuth as _useAuth } from '../contexts/AuthContext';
import type { AuthState } from '../contexts/AuthContext';

export type { AuthState };

/**
 * Returns the current user's authentication state.
 * Must be used inside `AuthContextProvider` — throws otherwise.
 */
export function useAuth(): AuthState {
  return _useAuth();
}
