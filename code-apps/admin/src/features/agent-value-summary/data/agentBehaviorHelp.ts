import type { AgentBehaviorHelpItem } from '../contracts/types';

import enecoLogo from '../assets/logos/eneco.jpeg';
import amgenLogo from '../assets/logos/amgen.jpeg';
import dowLogo from '../assets/logos/dow.jpeg';
import nttdataLogo from '../assets/logos/nttdata.jpeg';
import mciLogo from '../assets/logos/mci.jpeg';
import tmobileLogo from '../assets/logos/tmobile.jpeg';

/**
 * Static data for the 6 agent behaviors displayed on the Agent Behavior Help screen.
 */
export const agentBehaviorHelpItems: AgentBehaviorHelpItem[] = [
  {
    name: 'Sense',
    agentNoun: 'sensor',
    definition:
      'Continuously monitors input, activity, or system data to detect patterns.',
    example:
      "Monitors stock levels across retail locations and raises alerts when restocking is required.",
    customerExample:
      'The agent aggregates telemetry and grid stats to identify patterns and usage anomalies - sensing system-level trends',
    commonAgentTypes: ['Orchestrator', 'Retriever'],
    primaryAgentType: 'Retriever',
    customer: 'ENECO',
    customerLogo: enecoLogo,
    customerStoryUrl:
      'https://www.microsoft.com/en/customers/story/22686-eneco-microsoft-copilot-studio',
  },
  {
    name: 'Decide',
    agentNoun: 'decider',
    definition:
      'Develops a structured approach to achieving an outcome.',
    example:
      "Designs a phased onboarding plan for new hires based on team, role, and location.",
    customerExample:
      'The agent reviews data and regulatory rules to guide decisions in clinical trial reporting - delivering recommendations based on complex inputs.',
    commonAgentTypes: ['Advisor', 'Orchestrator'],
    primaryAgentType: 'Advisor',
    customer: 'Amgen',
    customerLogo: amgenLogo,
    customerStoryUrl:
      'https://www.microsoft.com/en/customers/story/23550-amgen-microsoft-copilot-studio',
  },
  {
    name: 'Act',
    agentNoun: 'actor',
    definition:
      'Carries out tasks or actions directly, often in response to a condition or user request.',
    example:
      "Processes a refund and notifies customer service tasks autonomously.",
    customerExample:
      'The agent reviews freight rates, flags billing discrepancies, and optimizes logistic workflows, directly intervening in supply chain processes.',
    commonAgentTypes: ['Performer', 'Assistant'],
    primaryAgentType: 'Performer',
    customer: 'Dow',
    customerLogo: dowLogo,
    customerStoryUrl:
      'https://www.microsoft.com/en/customers/story/19829-dow-microsoft-365-copilot',
  },
  {
    name: 'Reflect',
    agentNoun: 'reflector',
    definition:
      'Evaluates outcomes, learns from past interactions or data and recommends improvements.',
    example:
      "Recommends adjustments to delivery schedules based on historical delays and traffic patterns.",
    customerExample:
      'Their system reviews summarization performance, applies insights to improve accuracy - reflecting on results to tune future behavior.',
    commonAgentTypes: ['Advisor', 'Orchestrator'],
    primaryAgentType: 'Advisor',
    customer: 'NTT DATA',
    customerLogo: nttdataLogo,
    customerStoryUrl:
      'https://www.microsoft.com/en/customers/story/23907-ntt-data-azure-ai-foundry',
  },
  {
    name: 'Collaborate',
    agentNoun: 'collaborator',
    definition:
      'Supports coordination and communication across people, teams or systems.',
    example:
      "Facilitates multi-department approvals for a supplier contract by notifying stakeholders and capturing input.",
    customerExample:
      'The agent supports collaborative workflows and shared knowledge across teams, not just performing tasks or making decisions.',
    commonAgentTypes: ['Collaborator', 'Orchestrator', 'Assistant'],
    primaryAgentType: 'Collaborator',
    customer: 'MCI',
    customerLogo: mciLogo,
    customerStoryUrl:
      'https://www.microsoft.com/en/customers/story/21168-mci-group-microsoft-365-copilot',
  },
  {
    name: 'Respond',
    agentNoun: 'responder',
    definition:
      'Replies to user prompts, questions, or interactions with helpful information, typically in real-time.',
    example:
      "Answers customer FAQs about returns policy and offers a link to initiate a return.",
    customerExample:
      'Customer-facing chatbot answers support inquiries and assists users - responding conversationally and contextually.',
    commonAgentTypes: ['Assistant'],
    primaryAgentType: 'Assistant',
    customer: 'T-Mobile',
    customerLogo: tmobileLogo,
    customerStoryUrl:
      'https://www.microsoft.com/en/customers/story/23087-t-mobile-usa-microsoft-copilot-studio',
  },
];
