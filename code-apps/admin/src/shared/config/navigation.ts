import { lazy } from 'react';
import type { NavigationConfig } from '../types/navigation';
import {
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
  DataUsageSparkle20Regular,
  DataUsageSparkle20Filled,
  BrainSparkle20Regular,
  BrainSparkle20Filled,
  HexagonThree20Regular,
  HexagonThree20Filled,
} from '@fluentui/react-icons';
import {
  CopilotStudioKitIcon20Regular,
  CopilotStudioKitIcon20Filled,
} from '../icons/CopilotStudioKitIcon';
import {
  PowerShieldIcon20Regular,
  PowerShieldIcon20Filled,
} from '../../features/power-shield/shared/icons/PowerShieldIcon';

export const navigationConfig: NavigationConfig = {
  sections: [
    {
      id: 'configure',
      label: 'Configure',
      routes: [
        {
          path: '/agents',
          label: 'Agents',
          iconRegular: CopilotStudioKitIcon20Regular,
          iconFilled: CopilotStudioKitIcon20Filled,
          section: 'configure',
          component: lazy(() => import('../../features/agents/AgentsPage')),
          mdaPageParams: 'pagetype=entitylist&etn=cat_copilotconfiguration',
        },
      ],
    },
    {
      id: 'administration',
      label: 'Administration',
      routes: [
        {
          path: '/agent-inventory/*',
          label: 'Agent Inventory',
          iconRegular: Grid20Regular,
          iconFilled: Grid20Filled,
          section: 'administration',
          component: lazy(() => import('../../features/agent-inventory/AgentInventoryPage')),
        },
        {
          path: '/conversation-kpis',
          label: 'Conversation KPI',
          iconRegular: DataHistogram20Regular,
          iconFilled: DataHistogram20Filled,
          section: 'administration',
          component: lazy(() => import('../../features/conversation-kpis/ConversationKPIsPage')),
          mdaPageParams: 'pagetype=dashboard&id=55b614bd-ec8a-ef11-ac21-7c1e520cbfa3&type=system&_canOverride=true',
        },
        {
          path: '/kpi-details',
          label: 'KPI Details View',
          iconRegular: DataUsageSparkle20Regular,
          iconFilled: DataUsageSparkle20Filled,
          section: 'administration',
          component: lazy(() => import('../../features/kpi-details/KPIDetailsPage')),
          mdaPageParams: 'pagetype=entitylist&etn=cat_copilotkpi',
        },
        {
          path: '/conversation-analyzer/*',
          label: 'Conversation Analyzer',
          iconRegular: ChatMultiple20Regular,
          iconFilled: ChatMultiple20Filled,
          section: 'administration',
          component: lazy(() => import('../../features/conversation-analyzer/ConversationAnalyzerPage')),
        },
        {
          path: '/agent-value-summary',
          label: 'Agent Value Summary',
          iconRegular: Gauge20Regular,
          iconFilled: Gauge20Filled,
          section: 'administration',
          component: lazy(() => import('../../features/agent-value-summary/AgentValueSummaryPage')),
        },
        {
          path: '/agent-insights-hub',
          label: 'Agent Insights Hub',
          iconRegular: Lightbulb20Regular,
          iconFilled: Lightbulb20Filled,
          section: 'administration',
          component: lazy(() => import('../../features/agent-insights-hub/AgentInsightsHub')),
        },
        {
          path: '/agent-debugger',
          label: 'Agent Debugger',
          iconRegular: BrainSparkle20Regular,
          iconFilled: BrainSparkle20Filled,
          section: 'administration',
          component: lazy(() => import('../../features/agent-debugger/AgentDebugger')),
        },
      ],
    },
    {
      id: 'productivity',
      label: 'Productivity',
      routes: [
        {
          path: '/agent-library',
          label: 'Agent Library',
          iconRegular: HexagonThree20Regular,
          iconFilled: HexagonThree20Filled,
          section: 'productivity',
          component: lazy(() => import('../../features/agent-library')),
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
          section: 'governance',
          component: lazy(() => import('../../features/compliance-hub/ComplianceHubPage')),
          mdaPageParams: 'pagetype=custom&name=cat_compliancehub_329f8',
        },
        {
          path: '/power-shield/*',
          label: 'Request Center',
          iconRegular: PowerShieldIcon20Regular,
          iconFilled: PowerShieldIcon20Filled,
          section: 'governance',
          component: lazy(() => import('../../features/power-shield/PowerShieldPage')),
        },
      ],
    },
  ],
};

try {
  const isDev = import.meta.env?.DEV ?? false;
  if (isDev) {
    const paths = new Set<string>();
    for (const section of navigationConfig.sections) {
      for (const route of section.routes) {
        if (paths.has(route.path)) {
          console.error(`Duplicate route path: ${route.path}`);
        }
        paths.add(route.path);
      }
    }
  }
} catch {
  // Skip validation if import.meta is not available
}
