import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

export interface UserSettings {
  /** Dataverse SystemUser GUID — injected by the Power Apps host. */
  userId: string;
  /** User Principal Name (UPN) — injected by the Power Apps host. */
  userName: string;
}

export interface AppContextValue {
  userSettings: UserSettings;
}

const AppContext = createContext<AppContextValue | null>(null);

interface AppContextProviderProps {
  children: ReactNode;
  value: AppContextValue;
}

export function AppContextProvider({ children, value }: AppContextProviderProps) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (ctx === null) {
    throw new Error('useAppContext must be used within AppContextProvider');
  }
  return ctx;
}
