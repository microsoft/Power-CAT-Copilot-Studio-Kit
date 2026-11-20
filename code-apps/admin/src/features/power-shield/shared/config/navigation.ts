import type { ComponentType } from 'react';
import {
  Home20Regular,
  Home20Filled,
  Grid20Regular,
  Grid20Filled,
  DataHistogram20Regular,
  DataHistogram20Filled,
  ChatMultiple20Regular,
  ChatMultiple20Filled,
  Gauge20Regular,
  Gauge20Filled,
  Lightbulb20Regular,
  Lightbulb20Filled,
  ShieldTask20Regular,
  ShieldTask20Filled,
  DocumentBulletList20Regular,
  DocumentBulletList20Filled,
  TasksApp20Regular,
  TasksApp20Filled,
  Beaker20Regular,
  Beaker20Filled,
  ReceiptPlay20Regular,
  ReceiptPlay20Filled,
  CodeTextEdit20Regular,
  CodeTextEdit20Filled,
  Screenshot20Regular,
  Screenshot20Filled,
  Prompt20Regular,
  Prompt20Filled,
  PeopleInterwoven20Regular,
  PeopleInterwoven20Filled,
  HexagonThree20Regular,
  HexagonThree20Filled,
  DataUsageSparkle20Regular,
  DataUsageSparkle20Filled,
  BrainSparkle20Regular,
  BrainSparkle20Filled,
} from '@fluentui/react-icons';
import {
  CopilotStudioKitIcon20Regular,
  CopilotStudioKitIcon20Filled,
} from '../icons/CopilotStudioKitIcon';
import {
  PowerShieldIcon20Regular,
  PowerShieldIcon20Filled,
} from '../icons/PowerShieldIcon';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type CskRole = 'CSK - Administrator' | 'CSK - Maker' | 'unknown';

export const CSK_ROLES = {
  ADMINISTRATOR: 'CSK - Administrator' as CskRole,
  MAKER: 'CSK - Maker' as CskRole,
} as const;

export interface NavRoute {
  path: string;
  label: string;
  iconRegular: ComponentType<{ className?: string }>;
  iconFilled: ComponentType<{ className?: string }>;
  /** MDA page params for redirect; when absent the route is internal to this Code App */
  mdaPageParams?: string;
  /** CSK roles that can see this route. Undefined = visible to all CSK roles. */
  roles?: CskRole[];
}

export interface NavSection {
  id: string;
  label: string;
  routes: NavRoute[];
}

export interface PowerShieldNavConfig {
  sections: NavSection[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Full MDA navigation configuration — mirrors Copilot Agent Kit
// "PowerShield-Admin" is the current app (no mdaPageParams = internal route)
// ─────────────────────────────────────────────────────────────────────────────

export const navigationConfig: PowerShieldNavConfig = {
  sections: [
    {
      id: 'quick-links',
      label: 'Quick links',
      routes: [
        {
          path: '/',
          label: 'Home',
          iconRegular: Home20Regular,
          iconFilled: Home20Filled,
          mdaPageParams: 'pagetype=custom&name=cat_homecoe_70fca',
        },
      ],
    },
    {
      id: 'configure',
      label: 'Configure',
      routes: [
        {
          path: '/agents',
          label: 'Agents',
          iconRegular: CopilotStudioKitIcon20Regular,
          iconFilled: CopilotStudioKitIcon20Filled,
          mdaPageParams: 'pagetype=entitylist&etn=cat_copilotconfiguration',
        },
      ],
    },
    {
      id: 'administration',
      label: 'Administration',
      routes: [
        {
          path: '/agent-inventory',
          label: 'Agent Inventory',
          iconRegular: Grid20Regular,
          iconFilled: Grid20Filled,
          mdaPageParams: 'pagetype=custom&name=cat_agentinventory_0b104',
          roles: [CSK_ROLES.ADMINISTRATOR],
        },
        {
          path: '/conversation-kpis',
          label: 'Conversation KPI',
          iconRegular: DataHistogram20Regular,
          iconFilled: DataHistogram20Filled,
          mdaPageParams: 'pagetype=dashboard&id=55b614bd-ec8a-ef11-ac21-7c1e520cbfa3&type=system&_canOverride=true',
          roles: [CSK_ROLES.ADMINISTRATOR],
        },
        {
          path: '/kpi-details',
          label: 'KPI Details View',
          iconRegular: DataUsageSparkle20Regular,
          iconFilled: DataUsageSparkle20Filled,
          mdaPageParams: 'pagetype=entitylist&etn=cat_copilotkpi',
          roles: [CSK_ROLES.ADMINISTRATOR],
        },
        {
          path: '/conversation-analyzer',
          label: 'Conversation Analyzer',
          iconRegular: ChatMultiple20Regular,
          iconFilled: ChatMultiple20Filled,
          mdaPageParams: 'pagetype=custom&name=cat_conversationanalyser_c058b',
          roles: [CSK_ROLES.ADMINISTRATOR],
        },
        {
          path: '/agent-value-summary',
          label: 'Agent Value Summary',
          iconRegular: Gauge20Regular,
          iconFilled: Gauge20Filled,
          mdaPageParams: 'pagetype=custom&name=cat_agentvaluesummary_d89a0',
          roles: [CSK_ROLES.ADMINISTRATOR],
        },
        {
          path: '/agent-insights-hub',
          label: 'Agent Insights Hub',
          iconRegular: Lightbulb20Regular,
          iconFilled: Lightbulb20Filled,
          mdaPageParams: 'pagetype=custom&name=cat_agentinsightshub',
          roles: [CSK_ROLES.ADMINISTRATOR],
        },
        {
          path: '/agent-debugger',
          label: 'Agent Debugger',
          iconRegular: BrainSparkle20Regular,
          iconFilled: BrainSparkle20Filled,
          mdaPageParams: 'pagetype=custom&name=cat_agentdebugger',
          roles: [CSK_ROLES.ADMINISTRATOR],
        },
      ],
    },
    {
      id: 'governance',
      label: 'Governance',
      routes: [
        {
          path: '/compliance-hub',
          label: 'Compliance Hub',
          iconRegular: ShieldTask20Regular,
          iconFilled: ShieldTask20Filled,
          mdaPageParams: 'pagetype=custom&name=cat_compliancehub_329f8',
          roles: [CSK_ROLES.ADMINISTRATOR],
        },
        {
          // PowerShield — the CURRENT app. No mdaPageParams = internal route.
          path: '/power-shield-admin',
          label: 'Request Center',
          iconRegular: PowerShieldIcon20Regular,
          iconFilled: PowerShieldIcon20Filled,
          roles: [CSK_ROLES.ADMINISTRATOR],
        },
      ],
    },
    {
      id: 'productivity',
      label: 'Productivity',
      routes: [
        {
          path: '/component-library',
          label: 'Component Library',
          iconRegular: HexagonThree20Regular,
          iconFilled: HexagonThree20Filled,
          mdaPageParams: 'pagetype=custom&name=cat_componentlibrary',
        },
        {
          path: '/webchat-playground',
          label: 'Webchat Playground',
          iconRegular: DocumentBulletList20Regular,
          iconFilled: DocumentBulletList20Filled,
          mdaPageParams: 'pagetype=custom&name=cat_webchatcustomizer_48d6e',
        },
        {
          path: '/rubrics',
          label: 'Rubrics',
          iconRegular: TasksApp20Regular,
          iconFilled: TasksApp20Filled,
          mdaPageParams: 'pagetype=entitylist&etn=cat_rubric',
        },
        {
          path: '/test-sets',
          label: 'Test Sets',
          iconRegular: Beaker20Regular,
          iconFilled: Beaker20Filled,
          mdaPageParams: 'pagetype=entitylist&etn=cat_copilottestset',
        },
        {
          path: '/test-runs',
          label: 'Test Runs',
          iconRegular: ReceiptPlay20Regular,
          iconFilled: ReceiptPlay20Filled,
          mdaPageParams: 'pagetype=entitylist&etn=cat_copilottestrun',
        },
        {
          path: '/agent-review-tool',
          label: 'Agent Review Tool',
          iconRegular: CodeTextEdit20Regular,
          iconFilled: CodeTextEdit20Filled,
          mdaPageParams: 'pagetype=custom&name=cat_agentreviewtool',
        },
        {
          path: '/adaptive-cards',
          label: 'Adaptive Cards',
          iconRegular: Screenshot20Regular,
          iconFilled: Screenshot20Filled,
          mdaPageParams: 'pagetype=custom&name=cat_adaptivecards_4476e',
        },
        {
          path: '/prompt-advisor',
          label: 'Prompt Advisor',
          iconRegular: Prompt20Regular,
          iconFilled: Prompt20Filled,
          mdaPageParams: 'pagetype=custom&name=cat_promptadvisorstudio_6e1ce',
        },
        {
          path: '/collaboration-hub',
          label: 'Collaboration Hub',
          iconRegular: PeopleInterwoven20Regular,
          iconFilled: PeopleInterwoven20Filled,
          mdaPageParams: 'pagetype=custom&name=cat_homecoe_70fca',
        },
      ],
    },
  ],
};
