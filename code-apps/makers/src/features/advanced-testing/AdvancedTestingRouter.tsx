/**
 * Advanced Testing feature router. Landing lives at `/advanced-testing/`;
 * Setup lives at `/advanced-testing/setup`.
 */

import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Spinner, makeStyles, tokens } from "@fluentui/react-components";
import AdvancedTesting from "./AdvancedTesting";
import { useFeatureTelemetry } from "../../shared/hooks/useFeatureTelemetry";

const Setup = lazy(() => import("./setup/SetupScreen"));
const ModelAssessment = lazy(() => import("../model-assessment/ModelAssessmentPage"));

const useStyles = makeStyles({
  fallback: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: tokens.spacingVerticalXXL,
  },
});

function Fallback() {
  const styles = useStyles();
  return (
    <div className={styles.fallback} role="status" aria-live="polite">
      <Spinner label="Loading…" />
    </div>
  );
}

export default function AdvancedTestingRouter() {
  useFeatureTelemetry('advanced-testing', 'Advanced Testing');
  return (
    <Suspense fallback={<Fallback />}>
      <Routes>
        <Route index element={<AdvancedTesting />} />
        <Route path="setup" element={<Setup />} />
        <Route path="model-assessment" element={<ModelAssessment />} />
        <Route path="*" element={<Navigate to="" replace />} />
      </Routes>
    </Suspense>
  );
}
