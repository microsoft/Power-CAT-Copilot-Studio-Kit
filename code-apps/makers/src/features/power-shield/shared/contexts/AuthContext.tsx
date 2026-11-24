import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { getContext } from '@microsoft/power-apps/app';
import {
  checkIsMaker,
  getUserProfile,
  resolveCskRole,
  resolveDataverseUserIdByUpn,
} from '../services/dataverse/authService';
import type { CskRole } from '../config/navigation';

export interface AuthState {
  role: 'maker' | 'none';
  cskRole: CskRole;
  dvUserId: string;
  aadObjectId: string;
  upn: string;
  displayName: string;
}

export type AuthBootState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string; retry: () => void }
  | { phase: 'unauthorized'; cskRole: CskRole }
  | { phase: 'ready'; auth: AuthState };

const AuthBootContext = createContext<AuthBootState>({ phase: 'loading' });
const AuthContext = createContext<AuthState | null>(null);

const DEV_MOCK_USER_ID = '00000000-0000-0000-0000-000000000001';

async function resolveUserId(): Promise<string> {
  if (import.meta.env.DEV) {
    console.log('[PowerShield:Auth] resolveUserId: DEV mode — using mock user');
    return DEV_MOCK_USER_ID;
  }
  const sdkCtx = await getContext();
  const upn = sdkCtx.user?.userPrincipalName ?? '';
  if (!upn) throw new Error('Power Apps SDK returned empty UPN.');
  const userId = await resolveDataverseUserIdByUpn(upn);
  return userId;
}

export function PowerShieldAuthProvider({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<AuthBootState>({ phase: 'loading' });

  const initialize = useCallback(async () => {
    setBoot({ phase: 'loading' });
    try {
      console.log('[PowerShield:Auth] initialize: starting...');
      const dvUserId = await resolveUserId();

      const isDev = import.meta.env.DEV;
      const devProfile = isDev
        ? { aadObjectId: '', upn: 'dev@localhost', displayName: 'Dev User' }
        : null;

      const [isMaker, cskRole, profile] = await Promise.all([
        isDev ? Promise.resolve(true) : checkIsMaker(dvUserId).catch((err) => {
          console.error('[PowerShield:Auth] checkIsMaker THREW — returning false:', err);
          return false;
        }),
        isDev ? Promise.resolve('CSK - Maker' as CskRole) : resolveCskRole(dvUserId).catch((err) => {
          console.error('[PowerShield:Auth] resolveCskRole THREW — returning unknown:', err);
          return 'unknown' as CskRole;
        }),
        devProfile ? Promise.resolve(devProfile) : getUserProfile(dvUserId),
      ]);

      const role: AuthState['role'] = isMaker ? 'maker' : 'none';
      console.log(`[PowerShield:Auth] initialize: role=${role}, isMaker=${isMaker}, cskRole=${cskRole}`);

      const auth: AuthState = {
        role, cskRole, dvUserId,
        aadObjectId: profile.aadObjectId, upn: profile.upn, displayName: profile.displayName,
      };
      if (role === 'none') {
        console.warn('[PowerShield:Auth] initialize: no maker role — showing unauthorized screen');
        setBoot({ phase: 'unauthorized', cskRole });
      } else {
        console.log('[PowerShield:Auth] initialize: authorized — rendering maker app');
        setBoot({ phase: 'ready', auth });
      }
    } catch (err) {
      console.error('[PowerShield:Auth] initialize FAILED:', err);
      setBoot({
        phase: 'error',
        message: err instanceof Error ? err.message : 'Failed to load user profile.',
        retry: () => void initialize(),
      });
    }
  }, []);

  useEffect(() => { void initialize(); }, [initialize]);

  const isAuthorized = boot.phase === 'ready';
  return (
    <AuthBootContext.Provider value={boot}>
      {isAuthorized ? (
        <AuthContext.Provider value={boot.auth}>{children}</AuthContext.Provider>
      ) : (children)}
    </AuthBootContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuthBoot(): AuthBootState {
  return useContext(AuthBootContext);
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (ctx === null) throw new Error('useAuth must be used within PowerShieldAuthProvider');
  return ctx;
}
