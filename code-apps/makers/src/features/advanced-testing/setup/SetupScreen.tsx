/**
 * Advanced Testing — Setup screen (sub-feature root).
 *
 * Mounted lazily from `AdvancedTestingRouter` at `/advanced-testing/setup`.
 *
 * Single-page layout (replaces the prior 3-tab shell): a Fluent v9 Accordion
 * with three sections (Connections, Flows, Environment Variables) all open by
 * default and independently collapsible. Each section's existing toolbar
 * (Refresh, Turn on all, Save) stays scoped to its panel.
 *
 * Backward compatibility for legacy deep links: `?tab=<value>` on mount
 * scrolls the corresponding section into view, then the param is stripped
 * from the URL (`replaceState`) so subsequent collapses do not fight it.
 *
 * Section headers show a status Badge derived from the same React Query
 * caches the section components consume (dedup is automatic by query key,
 * so there is no extra network cost).
 */

import { useCallback, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Badge,
  Body1,
  Button,
  Divider,
  Title1,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import {
  ArrowLeft24Regular,
  Warning16Filled,
} from "@fluentui/react-icons";
import { ConnectionsTab } from "./components/ConnectionsTab";
import { FlowsTab } from "./components/FlowsTab";
import { EnvironmentVariablesTab } from "./components/EnvironmentVariablesTab";
import { useConnectionReferences } from "./hooks/useConnectionReferences";
import { useTestAutomationProcesses } from "./hooks/useTestAutomationProcesses";
import { useEnvironmentVariables } from "./hooks/useEnvironmentVariables";
import {
  type BadgeState,
  deriveConnectionsBadge,
  deriveEnvVarsBadge,
  deriveFlowsBadge,
} from "./utils/setupStatus";

type SectionId = "connections" | "flows" | "environment-variables";

const SECTION_IDS: readonly SectionId[] = [
  "connections",
  "flows",
  "environment-variables",
];

// Legacy `?tab=` values map 1:1 to section ids today, but accept both for
// safety in case a deep link uses the old value verbatim.
function normalizeSectionParam(raw: string | null): SectionId | null {
  if (raw === null) return null;
  return (SECTION_IDS as readonly string[]).includes(raw) ? (raw as SectionId) : null;
}

const useStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalL,
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
  topBar: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
  },
  pageHeader: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    marginBottom: tokens.spacingVerticalL,
  },
  subtitleText: {
    color: tokens.colorNeutralForeground2,
  },
  headerLabel: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flex: 1,
    gap: tokens.spacingHorizontalM,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
  },
  panelBody: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalL,
    paddingTop: tokens.spacingVerticalS,
  },
});

interface SectionHeaderProps {
  title: string;
  badge: BadgeState;
}

function SectionHeader({ title, badge }: SectionHeaderProps) {
  const styles = useStyles();
  return (
    <span className={styles.headerLabel}>
      <span className={styles.headerTitle}>{title}</span>
      {badge.kind === "warn" ? (
        <Badge
          appearance="tint"
          color="warning"
          icon={<Warning16Filled />}
          aria-label={`${title} status: ${badge.label}`}
        >
          {badge.label}
        </Badge>
      ) : null}
    </span>
  );
}

export default function SetupScreen() {
  const styles = useStyles();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // ─── Backward-compat: ?tab=X on mount → scroll target section into view, then strip param.
  const connectionsRef = useRef<HTMLDivElement>(null);
  const flowsRef = useRef<HTMLDivElement>(null);
  const envVarsRef = useRef<HTMLDivElement>(null);
  const handledLegacyParamRef = useRef(false);

  useEffect(() => {
    if (handledLegacyParamRef.current) return;
    const target = normalizeSectionParam(searchParams.get("tab"));
    handledLegacyParamRef.current = true;
    if (target === null) return;

    const ref =
      target === "connections"
        ? connectionsRef
        : target === "flows"
          ? flowsRef
          : envVarsRef;
    // Defer one tick so the Accordion has mounted and laid out.
    window.requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    const next = new URLSearchParams(searchParams);
    next.delete("tab");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // ─── Badge data. React Query dedups by key; the section components re-use
  // the same hooks internally, so this adds no extra network calls.
  const crQuery = useConnectionReferences(true);
  const flowsQuery = useTestAutomationProcesses(true);
  const evQuery = useEnvironmentVariables(true);

  const connectionsBadge = deriveConnectionsBadge(crQuery.data, {
    isLoading: crQuery.isLoading,
    isError: crQuery.isError,
    isSuccess: crQuery.isSuccess,
  });
  const flowsBadge = deriveFlowsBadge(
    flowsQuery.data,
    flowsQuery.isLoading,
    flowsQuery.isError,
  );
  const envVarsBadge = deriveEnvVarsBadge(
    evQuery.data?.variables,
    evQuery.isLoading,
    evQuery.isError,
  );

  const handleBack = useCallback(() => navigate("/advanced-testing"), [navigate]);

  return (
    <main className={styles.page} aria-label="Advanced Testing setup">
      <div className={styles.topBar}>
        <Button
          appearance="subtle"
          icon={<ArrowLeft24Regular />}
          onClick={handleBack}
          aria-label="Back to Advanced Testing"
        >
          Back
        </Button>
      </div>

      <div className={styles.pageHeader}>
        <Title1>Setup</Title1>
        <Body1 className={styles.subtitleText}>
          Configure the connections, cloud flows, and environment variables that Advanced
          Testing depends on.
        </Body1>
      </div>

      <Accordion
        multiple
        collapsible
        defaultOpenItems={[...SECTION_IDS]}
        aria-label="Advanced Testing setup sections"
      >
        <AccordionItem value="connections" ref={connectionsRef}>
          <AccordionHeader>
            <SectionHeader title="Connections" badge={connectionsBadge} />
          </AccordionHeader>
          <AccordionPanel>
            <div className={styles.panelBody}>
              <ConnectionsTab enabled />
            </div>
          </AccordionPanel>
        </AccordionItem>

        <Divider />

        <AccordionItem value="flows" ref={flowsRef}>
          <AccordionHeader>
            <SectionHeader title="Flows" badge={flowsBadge} />
          </AccordionHeader>
          <AccordionPanel>
            <div className={styles.panelBody}>
              <FlowsTab enabled />
            </div>
          </AccordionPanel>
        </AccordionItem>

        <Divider />

        <AccordionItem value="environment-variables" ref={envVarsRef}>
          <AccordionHeader>
            <SectionHeader title="Environment Variables" badge={envVarsBadge} />
          </AccordionHeader>
          <AccordionPanel>
            <div className={styles.panelBody}>
              <EnvironmentVariablesTab enabled />
            </div>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </main>
  );
}
