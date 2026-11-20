import type { AgentTypeHelpItem } from '../contracts/types';

import winwireLogo from '../assets/logos/winwire.jpeg';
import microsoftLogo from '../assets/logos/microsoft.jpeg';
import esteelauderLogo from '../assets/logos/esteelauder.jpeg';
import csxLogo from '../assets/logos/csx.jpeg';
import nttdataLogo from '../assets/logos/nttdata.jpeg';
import etihadLogo from '../assets/logos/etihad.jpg';

/**
 * Static data for the 6 agent types displayed on the Agent Type Help screen.
 */
export const agentTypeHelpItems: AgentTypeHelpItem[] = [
  {
    name: 'Assistant',
    definition:
      'Helps a person complete a task or make a decision.',
    example: 'A conversational agent helps log IT tickets.',
    customerExample:
      'See how WinWire built an Assistant agent to help healthcare workers summarize and document clinical insights more efficiently.',
    customer: 'WinWire',
    customerLogo: winwireLogo,
    customerStoryUrl:
      'https://www.microsoft.com/en/customers/story/24336-winwire-technologies-azure',
    valueBenefits: [
      'Improved accuracy',
      'Reduced manual effort',
      'Increased productivity',
    ],
  },
  {
    name: 'Collaborator',
    definition:
      'Works with people or systems to get things done.',
    example: 'An agent that collects information from a user, then escalates to a manager.',
    customerExample:
      'See how Microsoft uses a Collaborator agent to help employees access HR, IT, and Finance services in one place.',
    customer: 'Microsoft',
    customerLogo: microsoftLogo,
    customerStoryUrl:
      'https://www.microsoft.com/en/customers/story/22306-microsoft-microsoft-copilot-studio',
    valueBenefits: [
      'Faster time to resolution',
      'Reduced manual effort',
      'Increased employee experience',
    ],
  },
  {
    name: 'Advisor',
    definition:
      'Gives insights, guidance, or recommendations.',
    example: 'An agent suggests next-best actions based on data.',
    customerExample:
      'See how Estee Lauder uses an Advisor agent to empower employees with guided support and insights',
    customer: 'Estee Lauder',
    customerLogo: esteelauderLogo,
    customerStoryUrl:
      'https://www.microsoft.com/en/customers/story/23488-the-estee-lauder-companies-microsoft-copilot-studio',
    valueBenefits: [
      'Improved accuracy',
      'Reduced manual effort',
      'Increased productivity',
    ],
  },
  {
    name: 'Orchestrator',
    definition:
      'Coordinates a series of steps across systems or teams.',
    example: 'An agent that manages onboarding steps across departments (e.g., tasks, forms).',
    customerExample:
      'See how CSX uses an Orchestrator agent to streamline new hire onboarding across teams.',
    customer: 'CSX',
    customerLogo: csxLogo,
    customerStoryUrl:
      'https://www.microsoft.com/en/customers/story/24556-csx-microsoft-copilot-studio',
    valueBenefits: [
      'Faster task completion',
      'Improved compliance and consistency',
      'Stronger employee experience',
    ],
  },
  {
    name: 'Retriever',
    definition:
      'Finds and returns information on request.',
    example: 'An agent that answers FAQs using knowledge base content.',
    customerExample:
      'See how NTT DATA uses a Retriever agent to answer internal questions using trusted enterprise knowledge.',
    customer: 'NTT DATA',
    customerLogo: nttdataLogo,
    customerStoryUrl:
      'https://www.microsoft.com/en/customers/story/23907-ntt-data-azure-ai-foundry',
    valueBenefits: [
      'Improved accuracy',
      'Smarter decision-making',
      'Increased productivity',
    ],
  },
  {
    name: 'Performer',
    definition:
      'Takes direct action and completes tasks automatically.',
    example: 'An agent that updates a record when conditions are met.',
    customerExample:
      'See how Etihad uses a Performer agent to automate flight crew operations and reduce manual workload.',
    customer: 'Etihad',
    customerLogo: etihadLogo,
    customerStoryUrl:
      'https://www.microsoft.com/en/customers/story/1549268778936670138-etihad-airways-travel-transportation-dynamics-365-en-united-arab-emirates',
    valueBenefits: [
      'Improved compliance and consistency',
      'Reduced manual effort',
      'Reduced operational costs',
    ],
  },
];
