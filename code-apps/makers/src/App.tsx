import { Suspense, lazy, useEffect, useState, createContext, useContext } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Spinner, makeStyles, tokens } from '@fluentui/react-components';
import { Layout } from './shared/components/Layout';
import { LazyLoadErrorBoundary } from './shared/components/LazyLoadErrorBoundary';
import { ArtifactReviewRunnerProvider } from './features/agent-review-tool/skills-automations/context/ArtifactReviewRunner';
import { CopilotReviewRunnerProvider } from './features/agent-review-tool/agents-experience/context/CopilotReviewRunner';
import { StandardReviewRunnerProvider } from './features/agent-review-tool/context/StandardReviewRunner';
import { DAReviewRunnerProvider } from './features/agent-review-tool/declarative-agent/context/DAReviewRunner';
import { ReviewWorkflowRouteNotice } from './features/agent-review-tool/components/ReviewWorkflowNotice';
import { navigationConfig } from './shared/config/navigation';
import { initMdaContextFromSdk, isMdaContext } from './shared/utils/mda-navigation';
import { markTelemetryReady } from './shared/services/featureTelemetry';
import './App.css';

const AdaptiveCardsPage = lazy(
  () => import('./features/adaptive-cards/AdaptiveCardsPage')
);
const CopilotReviewRoute = lazy(
  () => import('./features/agent-review-tool/agents-experience/CopilotReviewRoute')
);
const DeclarativeReviewRoute = lazy(
  () => import('./features/agent-review-tool/declarative-agent/DeclarativeReviewRoute')
);
const StandardReviewRoute = lazy(
  () => import('./features/agent-review-tool/components/review-page/StandardReviewRoute')
);
const SkillsReviewRoute = lazy(
  () => import('./features/agent-review-tool/skills-automations/SkillsReviewRoute')
);

export const MdaContext = createContext<boolean | null>(null);
export const useMdaContext = () => useContext(MdaContext);

/**
 * Forwards the pre-GA review URL to its current path.
 *
 * `useParams` is avoided so the query string survives: the review screen reads
 * `view` and `run` from it, and dropping them would silently change what the
 * link opens.
 */
function LegacyModernReviewRedirect() {
  const { pathname, search } = useLocation();
  const next = pathname.replace('/agent-review-tool/modern/', '/agent-review-tool/copilot/');
  return <Navigate to={`${next}${search}`} replace />;
}

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

const STANDALONE_ROUTE = '/agent-review-tool';
const DEFAULT_MDA_ROUTE = navigationConfig.sections[0]?.routes[0]?.path ?? STANDALONE_ROUTE;

function RoutePersistence({ onResolved }: { onResolved: (isMda: boolean, initialRoute: string) => void }) {
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

      if (!mda) {
        onResolved(false, STANDALONE_ROUTE);
        navigate(STANDALONE_ROUTE, { replace: true });
        markTelemetryReady();
        return;
      }

      if (deeplink) {
        sessionStorage.setItem('lastRoute', deeplink);
        onResolved(true, deeplink);
        navigate(deeplink, { replace: true });
        markTelemetryReady();
        return;
      }

      const savedRoute = sessionStorage.getItem('lastRoute');
      const route = savedRoute && savedRoute !== '/' ? savedRoute : DEFAULT_MDA_ROUTE;
      onResolved(true, route);
      if (location.pathname === '/') {
        navigate(route, { replace: true });
      }
      markTelemetryReady();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

export default function App() {
  const [isMda, setIsMda] = useState<boolean | null>(null);
  const [initialRoute, setInitialRoute] = useState<string | null>(null);
  const allRoutes = navigationConfig.sections.flatMap((section) => section.routes);

  const handleResolved = (mda: boolean, route: string) => {
    setIsMda(mda);
    setInitialRoute(route);
  };

  return (
    <MdaContext.Provider value={isMda}>
      <HashRouter>
        <LazyLoadErrorBoundary>
          <RoutePersistence onResolved={handleResolved} />
          {/*
            Above the router on purpose. A skills review runs for minutes, and
            when it lived inside the review tab, switching tab or opening
            another page unmounted it and silently destroyed a run the user had
            already paid an AI call for. Mounted here, nothing the user does
            inside the app can interrupt it.
          */}
          <ArtifactReviewRunnerProvider>
            <CopilotReviewRunnerProvider>
              <DAReviewRunnerProvider>
                <StandardReviewRunnerProvider>
                  <Layout>
                  <Suspense fallback={<LoadingFallback />}>
                    <ReviewWorkflowRouteNotice />
                    <Routes>
                  {allRoutes.map((route) => (
                    <Route
                      key={route.path}
                      path={route.path}
                      element={<route.component />}
                    />
                  ))}
                  {/* Sub-routes not in navigation config */}
                  <Route path="/adaptive-cards/:id" element={<AdaptiveCardsPage />} />
                  <Route path="/agent-review-tool/copilot/:botId" element={<CopilotReviewRoute />} />
                  {/*
                    Declarative reviews are keyed by their review record, not by a
                    bot id, so this is a sibling route rather than a `:type`
                    segment on the one above.

                    `DeclarativeAgentTab` and `DAReviewRunner` navigate here.
                  */}
                  <Route path="/agent-review-tool/declarative/:reviewId" element={<DeclarativeReviewRoute />} />
                  {/*
                    Standard reviews, keyed by bot id like the Copilot route.
                    `openReviewDialog` now navigates here, so the grid opens this
                    page rather than ReviewDialogV2.
                  */}
                  <Route path="/agent-review-tool/standard/:botId" element={<StandardReviewRoute />} />
                  {/*
                    Skills and automations reviews, keyed by review id like the
                    declarative route: the same bundle can be reviewed more than
                    once, so the saved row is what a link points at.
                  */}
                  <Route path="/agent-review-tool/skills/:reviewId" element={<SkillsReviewRoute />} />
                  {/*
                    The review screen moved from /modern/ to /copilot/ when the
                    product reached GA and renamed the experience. Links already
                    saved or shared keep working, query string included.
                  */}
                  <Route path="/agent-review-tool/modern/:botId" element={<LegacyModernReviewRedirect />} />

                  {initialRoute !== null && (
                    <Route path="*" element={<Navigate to={initialRoute} replace />} />
                  )}
                    </Routes>
                  </Suspense>
                  </Layout>
                </StandardReviewRunnerProvider>
              </DAReviewRunnerProvider>
            </CopilotReviewRunnerProvider>
          </ArtifactReviewRunnerProvider>
        </LazyLoadErrorBoundary>
      </HashRouter>
    </MdaContext.Provider>
  );
}
