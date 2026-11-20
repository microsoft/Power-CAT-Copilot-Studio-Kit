/**
 * Agent Template Catalog — hard-coded agent template definitions.
 *
 * Each entry represents a pre-configured agent template displayed in the
 * Agent Library gallery. Templates with zipUrl have downloadable solution
 * ZIPs that can be imported into the user's environment.
 *
 * Display data (description, instructions) is used for initial card/dialog rendering.
 * The actual instructions are lazy-loaded from the ZIP on dialog open via SolutionZipService.
 *
 * Icon gradients extracted from Figma (node 1687:17850).
 */
import type { AgentTemplate } from '../contracts/types';

// HPA icon imports — PNG, white on transparent, rendered on subtle gradient squircle
import iconPlanMyDay from '../assets/hpa-icons/plan-my-day.png';
import iconKnowMyCustomer from '../assets/hpa-icons/know-my-customer.png';
import iconExecBrief from '../assets/hpa-icons/exec-brief.png';
import iconMyCompanyPolicy from '../assets/hpa-icons/my-company-policy.png';
import iconRequestTracker from '../assets/hpa-icons/request-tracker.png';
import iconAiLearningAdvisor from '../assets/hpa-icons/ai-learning-advisor.png';
import iconStatusUpdateAgent from '../assets/hpa-icons/status-update-agent.png';
import iconSmeFinder from '../assets/hpa-icons/sme-finder.png';
import iconProjectDeltaDigest from '../assets/hpa-icons/project-delta-digest.png';
import iconPersonalNewsDigest from '../assets/hpa-icons/personal-news-digest.png';

// CSK icon imports — SVG, white on transparent, rendered on vibrant gradient squircle
import iconPlanMyDayCsk from '../assets/csk-icons/plan-my-day.svg';
import iconKnowMyCustomerCsk from '../assets/csk-icons/know-my-customer.svg';
import iconExecBriefCsk from '../assets/csk-icons/exec-brief.svg';
import iconMyCompanyPolicyCsk from '../assets/csk-icons/my-company-policy.svg';
import iconRequestTrackerCsk from '../assets/csk-icons/request-tracker.svg';

/** Agent template icon background — subtle gradient on white per Figma spec (HPA host) */
export const AGENT_ICON_GRADIENT = 'linear-gradient(138deg, rgba(40, 184, 210, 0.06) 0.11%, rgba(28, 157, 193, 0.06) 50.11%, rgba(57, 99, 198, 0.06) 100.11%)';

/** Original vibrant gradients — used by component catalog icons and CSK host template overrides */
export const ICON_GRADIENTS = {
  fern: 'linear-gradient(137deg, rgb(111,184,103) 0%, rgb(70,164,121) 50%, rgb(25,142,141) 100%)',
  lavender: 'linear-gradient(138deg, rgb(92,152,237) 1%, rgb(108,106,225) 51%, rgb(118,75,206) 100%)',
  cerulean: 'linear-gradient(138deg, rgb(40,184,210) 0%, rgb(28,157,193) 50%, rgb(57,99,198) 100%)',
  azure: 'linear-gradient(138deg, rgb(72,148,242) 0%, rgb(44,114,224) 50%, rgb(33,86,201) 100%)',
  rose: 'linear-gradient(138deg, rgb(242,120,131) 0%, rgb(225,81,150) 50%, rgb(176,54,180) 100%)',
  gold: 'linear-gradient(138deg, rgb(246,188,14) 0%, rgb(236,128,19) 50%, rgb(211,66,83) 100%)',
  fuchsia: 'linear-gradient(138deg, rgb(208,110,212) 0%, rgb(170,86,206) 50%, rgb(118,75,206) 100%)',
} as const;

/**
 * CSK host icon overrides.
 *
 * HPA (default) renders the white PNG over a subtle gradient per Figma spec.
 * CSK renders a white SVG over a vibrant gradient — visually distinct from
 * HPA so each host has its own template look. AgentLibraryPage merges these
 * overrides via `hostOverrides` when `host === 'csk'`.
 *
 * For templates without a dedicated CSK SVG yet, the override sets
 * `iconSvg: undefined` to suppress the HPA PNG and let SquircleIcon fall
 * through to the Fluent `icon` name on the base entry (white-on-vibrant).
 */
const CSK_ICON_OVERRIDES = {
  planMyDay: { iconSvg: iconPlanMyDayCsk, iconGradient: ICON_GRADIENTS.fern },
  knowMyCustomer: { iconSvg: iconKnowMyCustomerCsk, iconGradient: ICON_GRADIENTS.lavender },
  executiveBriefing: { iconSvg: iconExecBriefCsk, iconGradient: ICON_GRADIENTS.cerulean },
  myCompanyPolicy: { iconSvg: iconMyCompanyPolicyCsk, iconGradient: ICON_GRADIENTS.fuchsia },
  requestTracker: { iconSvg: iconRequestTrackerCsk, iconGradient: ICON_GRADIENTS.gold },
  // Temporary CSK look (Fluent fallback) — replace with SVG asset when available.
  aiLearningAdvisor: { iconSvg: undefined, iconGradient: ICON_GRADIENTS.cerulean },
  statusUpdateAgent: { iconSvg: undefined, iconGradient: ICON_GRADIENTS.fern },
  smeFinder: { iconSvg: undefined, iconGradient: ICON_GRADIENTS.lavender },
  projectDeltaDigest: { iconSvg: undefined, iconGradient: ICON_GRADIENTS.gold },
  personalNewsDigest: { iconSvg: undefined, iconGradient: ICON_GRADIENTS.rose },
} as const;

export const agentTemplateCatalog: AgentTemplate[] = [
  // -----------------------------------------------------------------------
  // Wave 1 declarative agent templates (Figma node 1687:17850).
  // HPA: white-on-transparent PNG over subtle AGENT_ICON_GRADIENT.
  // CSK: vibrant gradient + dedicated SVG (via CSK_ICON_OVERRIDES).
  // -----------------------------------------------------------------------
  {
    id: 'planMyDay',
    name: 'Plan My Day',
    cardDescription:
      'Help users organize their daily tasks, meetings, and priorities with AI-powered scheduling and time management suggestions.',
    description:
      'Help users organize their daily tasks, meetings, and priorities with AI-powered scheduling and time management suggestions. Compiles a comprehensive morning briefing for executives using Microsoft 365 data \u2014 balancing business priorities with personal wellness.',
    type: 'template',
    agentType: 'declarative',
    icon: 'CalendarLtr20Filled',
    iconColor: 'Green',
    iconGradient: AGENT_ICON_GRADIENT,
    iconSvg: iconPlanMyDay,
    technologyUsed: ['Trigger', 'Prompt', 'MCP Server'],
    zipUrl: 'https://aka.ms/cskagentlib/da/planmyday',
    setupGuideUrl: 'https://aka.ms/cskagentlib/da/planmyday/instructions',
    downloadUrl: 'https://aka.ms/cskagentlib/da/planmyday/setupguidedownload',
    learnMoreUrl: 'https://aka.ms/cskagentlib/da/planmyday/learnmore',
    hostOverrides: { csk: CSK_ICON_OVERRIDES.planMyDay },
  },
  {
    id: 'knowMyCustomer',
    name: 'Know My Customer',
    cardDescription:
      "Enable sales and support teams to quickly surface key customer insights, history, and relationship context from your organization's data.",
    description:
      'Enable compliance and onboarding analysts to generate standardized, rules-driven KYC checklists tailored to client segment and jurisdiction. Performs automated gap analysis against uploaded documents, product-level due diligence, and competitor analysis.',
    type: 'template',
    icon: 'PersonTag20Filled',
    iconColor: 'Purple',
    iconGradient: AGENT_ICON_GRADIENT,
    iconSvg: iconKnowMyCustomer,
    technologyUsed: ['Topic', 'Prompt', 'Custom table'],
    zipUrl: 'https://aka.ms/cskagentlib/kyc',
    learnMoreUrl: 'https://aka.ms/cskagentlib/knowmycustomer/learnmore',
    hostOverrides: { csk: CSK_ICON_OVERRIDES.knowMyCustomer },
  },
  {
    id: 'executiveBriefing',
    name: 'Executive Briefing',
    cardDescription:
      'Automatically generate concise executive summaries and briefing documents from meetings, reports, and organizational data.',
    description:
      'The Executive Briefing Agent helps executives and their support teams prepare for leadership meetings, public events, and media interactions by generating structured, brand-aligned briefing documents and post-meeting summaries. The agent consolidates enterprise content from M365 sources into clear talking points, key messages, anticipated questions, and summaries, ensuring executives are always prepared, consistent, and aligned.',
    type: 'template',
    agentType: 'declarative',
    icon: 'DocumentBriefcase20Filled',
    iconColor: 'Blue',
    iconGradient: AGENT_ICON_GRADIENT,
    iconSvg: iconExecBrief,
    technologyUsed: ['Topic', 'Prompt', 'MCP Server'],
    zipUrl: 'https://aka.ms/cskagentlib/da/executivebriefing',
    setupGuideUrl: 'https://aka.ms/cskagentlib/da/executivebriefing/instructions',
    downloadUrl: 'https://aka.ms/cskagentlib/da/executivebriefing/setupguidedownload',
    learnMoreUrl: 'https://aka.ms/cskagentlib/da/executivebriefing/learnmore',
    hostOverrides: { csk: CSK_ICON_OVERRIDES.executiveBriefing },
  },
  {
    id: 'myCompanyPolicy',
    name: 'My Company Policy',
    cardDescription:
      'Help employees quickly find answers to company policy questions across HR, IT, travel, expense, and compliance guidelines.',
    description:
      "Help employees quickly find answers to company policy questions across HR, IT, travel, expense, and compliance guidelines. Knowledge-grounded Q and A agent that retrieves answers directly from your organization's policy documents.",
    type: 'template',
    agentType: 'declarative',
    hasSharePoint: true,
    icon: 'BookOpen20Filled',
    iconColor: 'Purple',
    iconGradient: AGENT_ICON_GRADIENT,
    iconSvg: iconMyCompanyPolicy,
    technologyUsed: ['Connector', 'Topic', 'Knowledge'],
    knowledgeSources: [
      { label: 'Site assets', required: true, placeholder: 'SharePoint site URL', kind: 'SharePointSearchSource' },
    ],
    zipUrl: 'https://aka.ms/cskagentlib/da/mycompanypolicy',
    setupGuideUrl: 'https://aka.ms/cskagentlib/da/mycompanypolicy/instructions',
    downloadUrl: 'https://aka.ms/cskagentlib/da/mycompanypolicy/setupguidedownload',
    learnMoreUrl: 'https://aka.ms/cskagentlib/da/mycompanypolicy/learnmore',
    hostOverrides: { csk: CSK_ICON_OVERRIDES.myCompanyPolicy },
  },
  {
    id: 'requestTracker',
    name: 'Request Tracker',
    cardDescription:
      'Streamline request intake and tracking workflows, giving teams visibility into status, approvals, and resolution timelines.',
    description:
      'Streamline request intake and tracking workflows, giving teams visibility into status, approvals, and resolution timelines. Provides full CRUD operations against a SharePoint list with topic routing, smart deduplication, and AI-powered request classification.',
    type: 'template',
    icon: 'Receipt20Filled',
    iconColor: 'Orange',
    iconGradient: AGENT_ICON_GRADIENT,
    iconSvg: iconRequestTracker,
    technologyUsed: ['Connector', 'Topic', 'Prompt', 'MCP Server', 'Custom table'],
    zipUrl: 'https://aka.ms/cskagentlib/requesttracker',
    learnMoreUrl: 'https://aka.ms/cskagentlib/requesttracker/learnmore',
    hostOverrides: { csk: CSK_ICON_OVERRIDES.requestTracker },
  },
  {
    id: 'aiLearningAdvisor',
    name: 'AI Learning Advisor',
    cardDescription:
      "Guide users through Microsoft’s AI and low-code tools with personalized learning paths and hands-on troubleshooting for Copilot Studio and Power Platform.",
    description:
      "Teaches and troubleshoots Microsoft's AI and low-code stack — Copilot Agent Builder, Copilot Studio, and Power Platform — with personalized learning plans, build guides, and error troubleshooting.",
    type: 'template',
    agentType: 'declarative',
    icon: 'HatGraduation24Regular',
    iconColor: 'Teal',
    iconSvg: iconAiLearningAdvisor,
    technologyUsed: ['Topic', 'Knowledge', 'Web search'],
    zipUrl: 'https://aka.ms/cskagentlib/da/learningadvisor',
    setupGuideUrl: 'https://aka.ms/cskagentlib/da/learningadvisor/instructions',
    downloadUrl: 'https://aka.ms/cskagentlib/da/learningadvisor/setupguidedownload',
    learnMoreUrl: 'https://aka.ms/cskagentlib/da/learningadvisor/learnmore',
    hostOverrides: { csk: CSK_ICON_OVERRIDES.aiLearningAdvisor },
  },
  {
    id: 'statusUpdateAgent',
    name: 'Status Update Agent',
    cardDescription:
      'Transform Microsoft 365 activity into polished status updates for daily wrap-ups, weekly reports, and stakeholder communications.',
    description:
      'Turns your Microsoft 365 activity into clear, audience-ready status updates — daily wrap-ups, weekly reports, manager emails, and brag-doc building for promotions and reviews.',
    type: 'template',
    agentType: 'declarative',
    icon: 'Trophy24Regular',
    iconColor: 'Green',
    iconSvg: iconStatusUpdateAgent,
    technologyUsed: ['Topic', 'Knowledge', 'Capabilities'],
    zipUrl: 'https://aka.ms/cskagentlib/da/statusupdateagent',
    setupGuideUrl: 'https://aka.ms/cskagentlib/da/statusupdateagent/instructions',
    downloadUrl: 'https://aka.ms/cskagentlib/da/statusupdateagent/setupguidedownload',
    learnMoreUrl: 'https://aka.ms/cskagentlib/da/statusupdateagent/learnmore',
    hostOverrides: { csk: CSK_ICON_OVERRIDES.statusUpdateAgent },
  },
  {
    id: 'smeFinder',
    name: 'SME Finder',
    cardDescription:
      'Identify credible Subject Matter Experts in your organization using M365 signals with evidence-based scoring and ready-to-send outreach',
    description:
      'Finds the most credible Subject Matter Experts inside your company for any topic — with cited evidence from M365 signals and ready-to-send outreach messages.',
    type: 'template',
    agentType: 'declarative',
    icon: 'PeopleSearch24Regular',
    iconColor: 'Purple',
    iconSvg: iconSmeFinder,
    technologyUsed: ['Topic', 'Knowledge', 'Capabilities'],
    zipUrl: 'https://aka.ms/cskagentlib/da/smefinder',
    setupGuideUrl: 'https://aka.ms/cskagentlib/da/smefinder/instructions',
    downloadUrl: 'https://aka.ms/cskagentlib/da/smefinder/setupguidedownload',
    learnMoreUrl: 'https://aka.ms/cskagentlib/da/smefinder/learnmore',
    hostOverrides: { csk: CSK_ICON_OVERRIDES.smeFinder },
  },
  {
    id: 'projectDeltaDigest',
    name: 'Project Delta Digest',
    cardDescription:
      "Generate executive-ready project status digests highlighting progress, blockers, and risks from your Microsoft 365 data.",
    description:
      "Produces concise, executive-ready project status digests — what shipped, what's moving, what's stuck, what's risky — from Outlook, Teams, SharePoint, and connected work-management systems.",
    type: 'template',
    agentType: 'declarative',
    icon: 'DocumentBulletList24Regular',
    iconColor: 'Amber',
    iconSvg: iconProjectDeltaDigest,
    technologyUsed: ['Topic', 'Knowledge', 'Capabilities'],
    zipUrl: 'https://aka.ms/cskagentlib/da/projectdeltadigest',
    setupGuideUrl: 'https://aka.ms/cskagentlib/da/projectdeltadigest/instructions',
    downloadUrl: 'https://aka.ms/cskagentlib/da/projectdeltadigest/setupguidedownload',
    learnMoreUrl: 'https://aka.ms/cskagentlib/da/projectdeltadigest/learnmore',
    hostOverrides: { csk: CSK_ICON_OVERRIDES.projectDeltaDigest },
  },
  {
    id: 'personalNewsDigest',
    name: 'Personal News Digest',
    cardDescription:
      'Deliver personalized organizational news briefings from Outlook, Teams, and SharePoint, prioritized by relevance and impact.',
    description:
      'Delivers a 30-second executive briefing of high-impact organizational news from Outlook, Teams, and SharePoint — tagged by priority and personalized to your role.',
    type: 'template',
    agentType: 'declarative',
    icon: 'News24Regular',
    iconColor: 'Orange',
    iconSvg: iconPersonalNewsDigest,
    technologyUsed: ['Topic', 'Knowledge', 'Web search'],
    zipUrl: 'https://aka.ms/cskagentlib/da/personalnewsdigest',
    setupGuideUrl: 'https://aka.ms/cskagentlib/da/personalnewsdigest/instructions',
    downloadUrl: 'https://aka.ms/cskagentlib/da/personalnewsdigest/setupguidedownload',
    learnMoreUrl: 'https://aka.ms/cskagentlib/da/personalnewsdigest/learnmore',
    hostOverrides: { csk: CSK_ICON_OVERRIDES.personalNewsDigest },
  },
];
