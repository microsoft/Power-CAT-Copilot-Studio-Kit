import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FluentProvider } from '@fluentui/react-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import './index.css';
import App from './App.tsx';
import { copilotStudioTheme } from './styles/copilotStudioTheme';
import {
  SETUP_PERSIST_MAX_AGE_MS,
  getSafeSessionStorage,
  shouldPersistSetupQuery,
} from './features/advanced-testing/setup/persistence';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
    },
  },
});

const sessionStorageRef = getSafeSessionStorage();
const persister = sessionStorageRef
  ? createSyncStoragePersister({ storage: sessionStorageRef })
  : null;

const appTree = (
  <StrictMode>
    <FluentProvider theme={copilotStudioTheme}>
      {persister ? (
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister,
            maxAge: SETUP_PERSIST_MAX_AGE_MS,
            buster: __APP_BUSTER__,
            dehydrateOptions: {
              shouldDehydrateQuery: shouldPersistSetupQuery,
            },
          }}
        >
          <App />
        </PersistQueryClientProvider>
      ) : (
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      )}
    </FluentProvider>
  </StrictMode>
);

createRoot(document.getElementById('root')!).render(appTree);
