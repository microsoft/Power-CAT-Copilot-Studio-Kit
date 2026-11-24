/**
 * Agent Review Tool Feature Entry Point
 *
 * This is the main entry point for the Agent Review Tool feature.
 * It wraps the Dashboard component with FilterProvider and applies the
 * indigo review theme.
 */

import React from 'react';
import { FluentProvider, makeStyles, tokens } from '@fluentui/react-components';
import { FilterProvider } from './context/FilterContext';
import { Dashboard } from './components/Dashboard';
import { copilotStudioReviewLightTheme } from './agents-experience/components/copilotStudioReviewTheme';

const useStyles = makeStyles({
  // The app shell paints a teal-tinted wash for the rest of the app. The review
  // experience is indigo, so it paints its own surface here instead of letting
  // the teal show through the transparent provider.
  surface: {
    width: '100%',
    minHeight: '100vh',
    padding: '20px',
    background: `linear-gradient(160deg, ${tokens.colorNeutralBackground2} 0%, ${tokens.colorBrandBackground2} 100%)`,
  },
  content: {
    maxWidth: '1000px',
    margin: '0 auto',
  },
});

/**
 * AgentReviewTool component
 *
 * Root component for the Agent Review Tool feature.
 * Provides theme and context to all child components.
 *
 * The indigo review theme is applied here rather than app-wide, so the whole
 * review experience (all three tabs) reads as a distinct surface while the
 * rest of the app keeps the teal root brand.
 *
 * @example
 * ```tsx
 * // In App.tsx routing
 * <Route path="/agent-review-tool" element={<AgentReviewTool />} />
 * ```
 */
export default function AgentReviewTool() {
  const styles = useStyles();

  return (
    <FluentProvider theme={copilotStudioReviewLightTheme} style={{ backgroundColor: 'transparent' }}>
      <FilterProvider>
        <div className={styles.surface}>
          <div className={styles.content}>
            <Dashboard />
          </div>
        </div>
      </FilterProvider>
    </FluentProvider>
  );
}
