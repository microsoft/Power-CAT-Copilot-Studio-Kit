/**
 * Advanced Testing — landing page.
 *
 * Header uses the same tokens as ComponentLibraryPage (Title1 + Body1 in a
 * subtitle row with a subtle Learn more link) so typography and spacing match
 * the rest of the app.
 */

import {
  Badge,
  Body1,
  Button,
  Link,
  Title1,
  Tooltip,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { Settings24Regular } from "@fluentui/react-icons";
import { useNavigate } from "react-router-dom";
import { QuickActions } from "./components/QuickActions";
import { TestRunsTable } from "./components/TestRunsTable";
import { TestSetsSection } from "./components/TestSetsSection";
import { useSetupStatus } from "./setup/hooks/useSetupStatus";
import type { SetupStatusSummary } from "./setup/utils/setupStatus";

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalL, // 16px
    paddingTop: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalXXL,
    paddingLeft: tokens.spacingHorizontalXL,
    paddingRight: tokens.spacingHorizontalXL,
    maxWidth: "1280px",
    width: "100%",
    minHeight: "100%",
    marginLeft: "auto",
    marginRight: "auto",
  },
  pageHeader: {
    display: "flex",
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalXXXL,
  },
  headerText: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    minWidth: 0,
  },
  subtitleRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: "4px",
  },
  subtitleText: {
    color: tokens.colorNeutralForeground2,
  },
  gearWrapper: {
    position: "relative",
    display: "inline-flex",
  },
  badgeOverlay: {
    position: "absolute",
    top: "2px",
    right: "2px",
    pointerEvents: "none",
  },
});

/**
 * Builds the dynamic Tooltip text and accessible name for the gear button.
 * Identical text is used for both so screen readers and sighted users get
 * the same information regardless of how Fluent resolves the labelling.
 */
function getSetupButtonLabel(status: SetupStatusSummary): string {
  if (status.overall === "warning" && status.sectionsWithWarnings.length > 0) {
    return `Open Advanced Testing setup. Needs attention: ${status.sectionsWithWarnings.join(", ")}.`;
  }
  if (status.overall === "error") {
    return "Open Advanced Testing setup. Couldn't check setup status.";
  }
  return "Open Advanced Testing setup";
}

/** Maps overall status to a Fluent Badge color, or null when no badge should render. */
function getBadgeColor(
  status: SetupStatusSummary,
): "warning" | "informative" | null {
  if (status.overall === "warning") return "warning";
  if (status.overall === "error") return "informative";
  return null;
}

export default function AdvancedTesting() {
  const styles = useStyles();
  const navigate = useNavigate();
  const setupStatus = useSetupStatus();
  const setupLabel = getSetupButtonLabel(setupStatus);
  const badgeColor = getBadgeColor(setupStatus);

  return (
    <main className={styles.page} aria-label="Advanced Testing">
      <div className={styles.pageHeader}>
        <div className={styles.headerText}>
          <Title1>Advanced Testing</Title1>
          <div className={styles.subtitleRow}>
            <Body1 className={styles.subtitleText}>
              Configure agents, manage rubrics, create and execute test cases, and review results
              for your Copilot Studio agents.
            </Body1>
            <Link
              href="https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/TESTING_CAPABILITIES.md"
              target="_blank"
              rel="noopener noreferrer"
            >
              Learn more
            </Link>
          </div>
        </div>
        <span className={styles.gearWrapper}>
          <Tooltip content={setupLabel} relationship="label">
            <Button
              appearance="subtle"
              icon={<Settings24Regular />}
              aria-label={setupLabel}
              onClick={() => navigate("/advanced-testing/setup?tab=connections")}
            />
          </Tooltip>
          {badgeColor ? (
            <Badge
              size="tiny"
              appearance="filled"
              color={badgeColor}
              className={styles.badgeOverlay}
              aria-hidden="true"
            />
          ) : null}
        </span>
      </div>

      <QuickActions />
      <TestSetsSection />
      <TestRunsTable />
    </main>
  );
}
