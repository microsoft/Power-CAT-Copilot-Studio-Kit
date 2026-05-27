import { palette } from "./theme";

/**
 * Feature catalog preserved verbatim from the previous bundle so that the
 * "Features" table on the new page lists the same 15 items in the same order.
 */
export interface Feature {
  name: string;
  desc: string;
  pillar: "Quality" | "Governance" | "Analytics" | "Components";
}

export const features: Feature[] = [
  {
    name: "Test Automation",
    desc: "Batch testing with multi-turn conversations, LLM-graded evaluation, and Excel-based test set management — complementing Copilot Studio's built-in evaluation framework",
    pillar: "Quality",
  },
  {
    name: "Rubric Refinement",
    desc: "AI-generated evaluation rubrics that define consistent quality scoring criteria for agent responses",
    pillar: "Quality",
  },
  {
    name: "Pipeline Testing",
    desc: "Automated quality gates integrated into your deployment pipeline — block releases that fail test thresholds",
    pillar: "Quality",
  },
  {
    name: "Agent Inventory",
    desc: "Dataverse-based agent catalog with owner, environment, and status metadata — extending platform admin center visibility with custom fields",
    pillar: "Governance",
  },
  {
    name: "Compliance Hub",
    desc: "Risk scoring, automated quarantine workflows, and admin follow-up tracking for agent compliance management",
    pillar: "Governance",
  },
  {
    name: "Agent Review Tool",
    desc: "Static analysis that detects common anti-patterns in agent configurations before they reach production",
    pillar: "Governance",
  },
  {
    name: "Conversation KPIs",
    desc: "Aggregated cross-agent performance metrics in Dataverse — complementing Copilot Studio's per-agent analytics with org-wide views",
    pillar: "Analytics",
  },
  {
    name: "Conversation Analyzer",
    desc: "Prompt-driven transcript analysis to identify patterns, escalation causes, and improvement opportunities across conversations",
    pillar: "Analytics",
  },
  {
    name: "Agent Value Summary",
    desc: "ROI dashboard that maps agent activity to business value for executive reporting",
    pillar: "Analytics",
  },
  {
    name: "Application Insights",
    desc: "Pre-built Application Insights integration for deep operational telemetry and custom monitoring dashboards",
    pillar: "Analytics",
  },
  {
    name: "SharePoint Sync",
    desc: "Automated synchronization of knowledge sources from SharePoint document libraries into agent configurations",
    pillar: "Governance",
  },
  {
    name: "Webchat Playground",
    desc: "Custom webchat styling, embedding configuration, and interactive agent testing environment",
    pillar: "Quality",
  },
  {
    name: "Adaptive Cards Gallery",
    desc: "Pre-built adaptive card templates for common conversational patterns and data presentation",
    pillar: "Components",
  },
  {
    name: "Auth Setup",
    desc: "Guided walkthrough for Entra ID v2 SSO configuration, streamlining authentication setup for testing",
    pillar: "Quality",
  },
  {
    name: "PowerShield",
    desc: "Governed DLP connector access workflow — maker self-service requests, admin approval, and automatic policy creation",
    pillar: "Governance",
  },
];

export const pillarColor: Record<Feature["pillar"], string> = {
  Quality: palette.pillarQuality,
  Governance: palette.pillarGovernance,
  Analytics: palette.pillarAnalytics,
  Components: palette.pillarComponents,
};
