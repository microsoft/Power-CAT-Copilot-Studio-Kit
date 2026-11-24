/**
 * mockData.ts
 *
 * Mock data for DA review test mode (VITE_DA_REVIEW_TEST_MODE=true).
 * Uses Gardener.zip expected output as the test fixture.
 */

import type { DAEvaluationResult } from '../contracts/DAEvaluationResult';

export const MOCK_DA_EVALUATION: DAEvaluationResult = {
  instructionsCriterion: {
    
    status: 'Warning',
    issues: [
      {
        severity: 'Medium',
        description: 'Instructions lack explicit references to connected SharePoint knowledge sources',
        recommendation:
          'Reference the OneDriveAndSharePoint knowledge source explicitly: "Use the connected SharePoint library for plant care guides"',
      },
      {
        severity: 'Low',
        description: 'Instructions do not define domain-specific terminology',
        recommendation:
          'Define gardening terms like "deadheading", "hardiness zones", and "NPK ratios" to ensure consistent interpretation',
      },
    ],
    passingChecks: [
      { description: 'Instructions define a clear purpose and persona as a gardening assistant' },
      { description: 'Tone is explicitly specified as friendly and approachable' },
      { description: 'Instructions use markdown headers to separate topic areas' },
    ],
  },
  knowledgeCriterion: {
    
    status: 'Pass',
    issues: [],
    passingChecks: [
      { description: 'OneDriveAndSharePoint knowledge source is scoped to a specific SharePoint site' },
      { description: 'Knowledge sources align with the agent\'s stated gardening domain' },
    ],
  },
  capabilitiesCriterion: {
    
    status: 'Warning',
    issues: [
      {
        severity: 'Low',
        description: 'GraphicArt capability enabled but not referenced in instructions',
        recommendation:
          'Add instruction: "Use image generation to create visual planting guides when helpful" or remove GraphicArt if not needed',
      },
    ],
    passingChecks: [
      { description: 'No duplicate capability types present in the manifest' },
    ],
  },
  actionsCriterion: {
    
    status: 'Pass',
    issues: [],
    passingChecks: [
      { description: 'No actions configured — not required for this agent type' },
    ],
  },
  conversationStartersCriterion: {
    
    status: 'Pass',
    issues: [],
    passingChecks: [
      { description: '5 conversation starters present, meeting the minimum of 3' },
      { description: 'All starters have both title and text fields populated' },
      { description: 'Starters cover diverse gardening topics including planting, care, and troubleshooting' },
    ],
  },
  gracefulErrorHandlingCriterion: {
    
    status: 'Fail',
    issues: [
      {
        severity: 'High',
        description: 'Instructions do not define behavior for incorrect or out-of-scope inputs',
        recommendation:
          'Add an error handling section: "If the user asks about topics outside gardening, politely decline and redirect: \'I\'m specialized in gardening. For other topics, please use Microsoft 365 Copilot.\'"',
      },
      {
        severity: 'High',
        description: 'No handling defined for inappropriate or abusive language',
        recommendation:
          'Add instruction: "If the user sends inappropriate language or attempts to misuse the agent, respond: \'I\'m not able to help with that. Please keep our conversation focused on gardening topics.\'"',
      },
    ],
    passingChecks: [
      { description: 'Instructions acknowledge the agent\'s topic boundaries through its focused gardening scope' },
    ],
  },
  summary:
    'The Gardener agent has strong conversation starters and relevant SharePoint knowledge sources. The main improvement areas are adding graceful error handling for incorrect inputs and inappropriate language (a MS Store Must Fix requirement), referencing knowledge sources explicitly in instructions, and either using or removing the GraphicArt capability.',
};
