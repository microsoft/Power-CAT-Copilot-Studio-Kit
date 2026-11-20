import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { getContext } from '@microsoft/power-apps/app';
import {
  checkIsAdmin,
  getUserProfile,
  resolveCskRole,
  resolveDataverseUserIdByUpn,
} from '../services/dataverse/authService';
import { ensureTenantId } from '../services/settings/tenantSettingsService';
import type { CskRole } from '../config/navigation';

export interface AuthState {
  role: 'admin' | 'none';
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

interface ResolvedUser {
  dvUserId: string;
  tenantId: string;
}

async function resolveUser(): Promise<ResolvedUser> {
  if (import.meta.env.DEV) {
    console.log('[PowerShield:AdminAuth] resolveUser: DEV mode — using mock user');
    return { dvUserId: DEV_MOCK_USER_ID, tenantId: '' };
  }
  const sdkCtx = await getContext();
  const upn = sdkCtx.user?.userPrincipalName ?? '';
  const tenantId = sdkCtx.user?.tenantId ?? '';
  if (!upn) throw new Error('Power Apps SDK returned empty UPN.');
  const dvUserId = await resolveDataverseUserIdByUpn(upn);
  return { dvUserId, tenantId };
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<AuthBootState>({ phase: 'loading' });

  const initialize = useCallback(async () => {
    setBoot({ phase: 'loading' });
    try {
      console.log('[PowerShield:AdminAuth] initialize: starting...');
      const { dvUserId, tenantId } = await resolveUser();

      // Auto-populate tenant ID in settings table (fire-and-forget)
      if (tenantId) {
        ensureTenantId(tenantId).catch((err) =>
          console.warn('[PowerShield:AdminAuth] ensureTenantId failed (non-blocking):', err),
        );
      }

      const isDev = import.meta.env.DEV;
      const devProfile = isDev
        ? { aadObjectId: '', upn: 'dev@localhost', displayName: 'Dev User' }
        : null;

      const [isAdmin, profile, cskRole] = await Promise.all([
        isDev ? Promise.resolve(true) : checkIsAdmin(dvUserId).catch((err) => {
          console.error('[PowerShield:AdminAuth] checkIsAdmin THREW — returning false:', err);
          return false;
        }),
        devProfile ? Promise.resolve(devProfile) : getUserProfile(dvUserId),
        isDev ? Promise.resolve('CSK - Administrator' as CskRole) : resolveCskRole(dvUserId).catch((err) => {
          console.error('[PowerShield:AdminAuth] resolveCskRole THREW — returning unknown:', err);
          return 'unknown' as CskRole;
        }),
      ]);

      const role: AuthState['role'] = isAdmin ? 'admin' : 'none';
      console.log(`[PowerShield:AdminAuth] initialize: role=${role}, isAdmin=${isAdmin}, cskRole=${cskRole}`);

      const auth: AuthState = {
        role,
        cskRole,
        dvUserId,
        aadObjectId: profile.aadObjectId,
        upn: profile.upn,
        displayName: profile.displayName,
      };
      if (role === 'none') {
        console.warn('[PowerShield:AdminAuth] initialize: no admin role — showing unauthorized screen');
        setBoot({ phase: 'unauthorized', cskRole });
      } else {
        console.log('[PowerShield:AdminAuth] initialize: authorized — rendering admin app');
        setBoot({ phase: 'ready', auth });
      }
    } catch (err) {
      console.error('[PowerShield:AdminAuth] initialize FAILED:', err);
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
  if (ctx === null) throw new Error('useAuth must be used within AdminAuthProvider');
  return ctx;
}
