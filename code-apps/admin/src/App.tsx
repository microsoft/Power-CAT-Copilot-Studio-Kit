import { Suspense, useEffect, useState, lazy } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Spinner, makeStyles, tokens } from '@fluentui/react-components';
import { Layout } from './shared/components/Layout';
import { LazyLoadErrorBoundary } from './shared/components/LazyLoadErrorBoundary';
import { navigationConfig } from './shared/config/navigation';
import { MdaContext } from './shared/contexts/MdaContext';
import { initMdaContextFromSdk, isMdaContext } from './shared/utils/mda-navigation';
import { markTelemetryReady } from './shared/services/featureTelemetry';
import './App.css';

const AgentMetricStudioPage = lazy(() => import('./features/agent-metric-studio/AgentMetricStudioPage'));

const useLoadingStyles = makeStyles({
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    width: '100%',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  text: {
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground2,
  },
});

function LoadingFallback() {
  const styles = useLoadingStyles();
  return (
    <div className={styles.container} role="status" aria-live="polite">
      <Spinner size="extra-large" label="Loading..." labelPosition="below" />
    </div>
  );
}

const STANDALONE_ROUTE = '/agent-insights-hub';

function RoutePersistence({ onMdaResolved }: { onMdaResolved: (isMda: boolean) => void }) {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.pathname !== '/') {
      sessionStorage.setItem('lastRoute', location.pathname);
    }
  }, [location.pathname]);

  useEffect(() => {
    initMdaContextFromSdk().then((deeplink) => {
      const mda = isMdaContext();

      onMdaResolved(mda);

      if (deeplink) {
        sessionStorage.setItem('lastRoute', deeplink);
        navigate(deeplink, { replace: true });
        markTelemetryReady();
        return;
      }

      if (!mda) {
        navigate(STANDALONE_ROUTE, { replace: true });
        markTelemetryReady();
        return;
      }

      const savedRoute = sessionStorage.getItem('lastRoute');
      if (location.pathname === '/' && savedRoute && savedRoute !== '/') {
        navigate(savedRoute, { replace: true });
      }
      markTelemetryReady();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

export default function App() {
  const [isMda, setIsMda] = useState<boolean | null>(null);
  const allRoutes = navigationConfig.sections.flatMap((section) => section.routes);

  return (
    <MdaContext.Provider value={isMda}>
      <HashRouter>
        <LazyLoadErrorBoundary>
          <RoutePersistence onMdaResolved={setIsMda} />
          <Routes>
            {/* AMS renders full-screen without the shared Layout sidebar */}
            <Route path="/agent-metric-studio" element={
              <Suspense fallback={<LoadingFallback />}>
                <AgentMetricStudioPage />
              </Suspense>
            } />

            {/* All other routes render inside the Layout with sidebar nav */}
            <Route path="*" element={
              <Layout>
                <Suspense fallback={<LoadingFallback />}>
                  <Routes>
                    {allRoutes.map((route) => (
                      <Route
                        key={route.path}
                        path={route.path}
                        element={<route.component />}
                      />
                    ))}
                    <Route path="*" element={<Navigate to={STANDALONE_ROUTE} replace />} />
                  </Routes>
                </Suspense>
              </Layout>
            } />
          </Routes>
        </LazyLoadErrorBoundary>
      </HashRouter>
    </MdaContext.Provider>
  );
}
