import { lazy } from 'react';
import type { NavigationConfig } from '../types/navigation';
import {
  DocumentBulletList20Regular,
  DocumentBulletList20Filled,
  Beaker20Regular,
  Beaker20Filled,
  CodeTextEdit20Regular,
  CodeTextEdit20Filled,
  CardUi20Regular,
  CardUi20Filled,
  Prompt20Regular,
  Prompt20Filled,
  HexagonThree20Regular,
  HexagonThree20Filled,
  History20Regular,
  History20Filled,
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
      id: 'productivity',
      label: 'Productivity',
      routes: [
        {
          // Mirror the upstream CSK Code App nav entry — folder import via
          // `index.ts` keeps the wrapper file private and matches the
          // reference's `lazy(() => import('../../features/component-library'))`
          // pattern. No `mdaPageParams` — the Agent Library renders inside
          // the Code App, never deep-links to the MDA.
          path: '/agent-library',
          label: 'Agent Library',
          iconRegular: HexagonThree20Regular,
          iconFilled: HexagonThree20Filled,
          section: 'productivity',
          component: lazy(() => import('../../features/agent-library')),
        },
        {
          path: '/agent-change-tracker',
          label: 'Agent Change Tracker',
          iconRegular: History20Regular,
          iconFilled: History20Filled,
          section: 'productivity',
          component: lazy(() => import('../../features/agent-change-tracker/AgentChangeTrackerPage')),
        },
        {
          path: '/webchat-playground',
          label: 'Webchat Playground',
          iconRegular: DocumentBulletList20Regular,
          iconFilled: DocumentBulletList20Filled,
          section: 'productivity',
          component: lazy(() => import('../../features/webchat-playground/WebchatPlaygroundPage')),
          mdaPageParams: 'pagetype=custom&name=cat_webchatcustomizer_48d6e',
        },
        {
          path: '/advanced-testing/*',
          label: 'Advanced Testing',
          iconRegular: Beaker20Regular,
          iconFilled: Beaker20Filled,
          section: 'productivity',
          component: lazy(() => import('../../features/advanced-testing/AdvancedTestingRouter')),
        },
        {
          path: '/agent-review-tool',
          label: 'Agent Review Tool',
          iconRegular: CodeTextEdit20Regular,
          iconFilled: CodeTextEdit20Filled,
          section: 'productivity',
          component: lazy(() => import('../../features/agent-review-tool/AgentReviewToolPage')),
        },
        {
          path: '/adaptive-cards',
          label: 'Adaptive Cards',
          iconRegular: CardUi20Regular,
          iconFilled: CardUi20Filled,
          section: 'productivity',
          component: lazy(() => import('../../features/adaptive-cards/AdaptiveCardsPage')),
          mdaPageParams: 'pagetype=custom&name=cat_adaptivecards_4476e',
        },
        {
          path: '/prompt-advisor',
          label: 'Prompt Advisor',
          iconRegular: Prompt20Regular,
          iconFilled: Prompt20Filled,
          section: 'productivity',
          component: lazy(() => import('../../features/prompt-advisor/PromptAdvisorPage')),
        },
      ],
    },
    {
      id: 'governance',
      label: 'Governance',
      routes: [
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
