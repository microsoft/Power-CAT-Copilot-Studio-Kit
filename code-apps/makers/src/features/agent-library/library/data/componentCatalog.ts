/**
 * Component catalog — static data bundled with the app (GAL-3).
 *
 * This is the source of truth for component library entries.
 * Each component has its own dedicated solution — installing one does not affect others.
 *
 * Validated against exported solution files on 2026-03-11.
 */

import type { ComponentTemplate } from '../contracts/types';
import { ICON_GRADIENTS } from './agentTemplateCatalog';

// SVG icon imports — Figma-exported white icons for gradient squircles
import iconResearch from '../assets/icon-research-component.svg';
import iconContentSynthesis from '../assets/icon-content-synthesis.svg';
import iconExecBriefComp from '../assets/icon-exec-brief-component.svg';
import iconDocExtraction from '../assets/icon-doc-extraction.svg';
import iconLogCot from '../assets/icon-log-cot.svg';
import iconServiceNow from '../assets/icon-servicenow.svg';
import iconSaveConvHistory from '../assets/icon-save-conv-history.svg';

// Image imports — Vite resolves these to hashed URLs at build time.
import docextIcon from '../assets/docext-icon.png';
import docextHero from '../assets/docext-hero.png';
import researchIcon from '../assets/research-icon.png';
import researchHero from '../assets/research-hero.png';
import execbriefIcon from '../assets/execbrief-icon.png';
import execbriefHero from '../assets/execbrief-hero.png';
import consynthIcon from '../assets/consynth-icon.png';
import snowIcon from '../assets/snow-icon.png';

export const COMPONENT_CATALOG: ComponentTemplate[] = [
  {
    id: 'document-extraction',
    name: 'Document Extraction',
    description:
      'Transforms uploaded documents into structured data using AI Builder. Parses and extracts key fields based on a configurable schema for invoice processing, contract review, form digitization, or any scenario requiring structured information from unstructured documents.',
    learnMoreUrl: 'https://aka.ms/csk-components/doc-extract',
    categories: ['Connect'],
    technologyTags: ['AI Builder Prompt'],
    inputs: [
      {
        name: 'DocumentContent',
        description:
          'Full text from the file or pasted content.',
        isRequired: true,
      },
      {
        name: 'ExtractionSchema',
        description:
          'The extraction schema — key fields to extract from the document content. For example, if the document is an invoice the schema would contain fields like name, invoice number, date, etc.',
        isRequired: true,
      },
    ],
    outputs: [
      {
        name: 'Text',
        description:
          'Structured extracted data returned by the AI Builder prompt.',
      },
    ],
    solutionUniqueName: 'CopilotStudioKit_DocumentExtraction_Component',
    solutionVersion: '1.0.0.0',
    zipUrl: 'https://aka.ms/cskagentlib/comp/docextract',
    downloadUrl: 'https://aka.ms/cskagentlib/comp/docextract',
    copilotStudioPath: 'component-collections',
    icon: 'DocumentTextExtract20Filled',
    iconColor: 'Teal',
    iconImage: docextIcon,
    thumbnailImage: docextHero,
    iconSvg: iconDocExtraction,
    copilotStudioComponentName: 'Document Extraction Component',
    requiresExternalConnection: false,
    type: 'component' as const,
    iconGradient: ICON_GRADIENTS.rose,
    toolsAndActions: ['AI Builder Prompt'],
  },
  {
    id: 'content-synthesizer',
    name: 'Content Synthesizer',
    description:
      'Synthesizes research content into structured, evidence-based sections with inline citations. Integrates insights across sources by theme — not source by source — producing markdown with headings, key findings, takeaways, and a confidence footer. Used as the shared synthesis module in both the Research Component and Executive Brief Generator pipelines, or as a standalone synthesis tool.',
    learnMoreUrl: 'https://aka.ms/csk-components/content-synth',
    categories: ['Create'],
    technologyTags: ['AI Builder Prompt'],
    inputs: [
      {
        name: 'Content',
        description:
          'Markdown research output generated from the user\'s query, used as input for synthesizing content.',
        isRequired: true,
      },
      {
        name: 'ResearchPrompt',
        description:
          'The user\'s research question or query.',
        isRequired: true,
      },
    ],
    outputs: [
      {
        name: 'Text',
        description:
          'Synthesized section in markdown with themed headings, key findings, takeaways, citations, and a confidence footer.',
      },
    ],
    solutionUniqueName: 'CopilotStudioKit_ContentSynth_Component',
    solutionVersion: '1.0.0.0',
    zipUrl: 'https://aka.ms/cskagentlib/comp/synthesis',
    downloadUrl: 'https://aka.ms/cskagentlib/comp/synthesis',
    copilotStudioPath: 'component-collections',
    icon: 'DocumentBulletList20Filled',
    iconColor: 'Teal',
    iconImage: consynthIcon,
    iconSvg: iconContentSynthesis,
    copilotStudioComponentName: 'Content Synthesizer Component',
    requiresExternalConnection: false,
    type: 'component' as const,
    iconGradient: ICON_GRADIENTS.gold,
    toolsAndActions: ['AI Builder Prompt'],
  },
  {
    id: 'research-component',
    name: 'Research Component',
    description:
      'Synthesizes information from multiple web sources into a comprehensive research report. Uses a 3-stage AI pipeline — research planning, content synthesis, and report finalization — for competitive analysis, market research, policy review, or any scenario requiring a consolidated view across multiple information sources.',
    learnMoreUrl: 'https://aka.ms/csk-components/research',
    categories: ['Create'],
    technologyTags: ['Topic', 'AI Builder Prompt'],
    inputs: [
      {
        name: 'ResearchPrompt',
        description:
          'The main topic or subject matter the user wants content about.',
        isRequired: true,
      },
      {
        name: 'AdditionalInstructions',
        description:
          'Optional context such as focus areas or constraints.',
        isRequired: false,
      },
      {
        name: 'InstructionsForInformationCompiler',
        description:
          'Controls the style and length of each synthesized section.',
        isRequired: false,
      },
      {
        name: 'InstructionsForReportFinalizer',
        description:
          'Controls how the final report is assembled from synthesized sections.',
        isRequired: false,
      },
    ],
    outputs: [
      {
        name: 'FinalReportContent',
        description:
          'The final research report as Markdown, combining all synthesized sections and citations.',
      },
    ],
    solutionUniqueName: 'CopilotStudioKit_Research_Component',
    solutionVersion: '1.0.0.0',
    zipUrl: 'https://aka.ms/cskagentlib/comp/research',
    downloadUrl: 'https://aka.ms/cskagentlib/comp/research',
    copilotStudioPath: 'component-collections',
    icon: 'Search20Filled',
    iconColor: 'Green',
    iconImage: researchIcon,
    thumbnailImage: researchHero,
    iconSvg: iconResearch,
    copilotStudioComponentName: 'Research Component',
    requiresExternalConnection: false,
    type: 'component' as const,
    iconGradient: ICON_GRADIENTS.lavender,
    toolsAndActions: ['Topic', 'AI Builder Prompt'],
  },
  {
    id: 'executive-brief-generator',
    name: 'Executive Brief Component',
    description:
      'Generates concise, decision-oriented executive summaries from complex inputs. Uses a 3-stage AI pipeline — strategic planning, insight synthesis, and brief finalization — for board meeting preparation, project status updates, quarterly business reviews, or any scenario requiring a polished summary for stakeholders.',
    learnMoreUrl: 'https://aka.ms/csk-components/exec-brief',
    categories: ['Create'],
    technologyTags: ['Topic', 'AI Builder Prompt'],
    inputs: [
      {
        name: 'ResearchPrompt',
        description:
          'The brief topic or question (for example, "AI adoption strategy for mid-market companies").',
        isRequired: true,
      },
      {
        name: 'AdditionalInstructions',
        description:
          'Optional company context, focus areas, or constraints.',
        isRequired: false,
      },
    ],
    outputs: [
      {
        name: 'FinalReportContent',
        description:
          'The executive brief as Markdown, combining all insights and citations into a polished summary.',
      },
    ],
    solutionUniqueName: 'CopilotStudioKit_ExecBrief_Component',
    solutionVersion: '1.0.0.0',
    zipUrl: 'https://aka.ms/cskagentlib/comp/execbrief',
    downloadUrl: 'https://aka.ms/cskagentlib/comp/execbrief',
    copilotStudioPath: 'component-collections',
    icon: 'DocumentBriefcase20Filled',
    iconColor: 'Orange',
    iconImage: execbriefIcon,
    thumbnailImage: execbriefHero,
    iconSvg: iconExecBriefComp,
    copilotStudioComponentName: 'Executive Brief Component',

    requiresExternalConnection: false,
    type: 'component' as const,
    iconGradient: ICON_GRADIENTS.cerulean,
    toolsAndActions: ['Topic', 'AI Builder Prompt'],
  },
  {
    id: 'log-chain-of-thoughts',
    name: 'Log Chain of Thoughts',
    description:
      'Surfaces the orchestrator\'s intermediate reasoning as italicized messages in the conversation. After installing, add this instruction to your agent: "After every tool, topic, or step you take (except when you are already calling /Log Chain of Thoughts or other debug/logging topics), log your intermediate reasoning by calling /Log Chain of Thoughts."',
    learnMoreUrl: 'https://microsoft.github.io/mcscatblog/posts/power-of-topics-copilot-studio/',
    categories: ['Analyze'],
    technologyTags: ['Topic'],
    inputs: [
      {
        name: 'CoT',
        description:
          'Full intermediate chain of thought / rationale from the model for the current step.',
        isRequired: true,
      },
    ],
    outputs: [],
    solutionUniqueName: 'CopilotStudioKit_LogCoT_Component',
    solutionVersion: '1.0.0.0',
    zipUrl: 'https://aka.ms/cskagentlib/comp/logcot',
    downloadUrl: 'https://aka.ms/cskagentlib/comp/logcot',
    copilotStudioPath: 'component-collections',
    icon: 'BrainSparkle20Filled',
    iconColor: 'Purple',
    iconSvg: iconLogCot,
    copilotStudioComponentName: 'Log Chain of Thoughts Component',
    requiresExternalConnection: false,
    type: 'component' as const,
    iconGradient: ICON_GRADIENTS.gold,
    toolsAndActions: ['Topic'],
  },
  {
    id: 'save-conversation-history',
    name: 'Save Conversation History',
    description:
      'Captures the full conversation transcript into a variable for downstream use. Call this topic at the end of a conversation or before escalation to preserve the full transcript — pass it to a Power Automate flow to create a support ticket, store it in SharePoint, or hand it off to a human agent.',
    learnMoreUrl: 'https://microsoft.github.io/mcscatblog/posts/power-of-topics-copilot-studio/',
    categories: ['Connect'],
    technologyTags: ['Topic'],
    inputs: [
      {
        name: 'conversationHistory',
        description:
          'Entire conversation history in the format \'User: …, Agent: …\'.',
        isRequired: true,
      },
    ],
    outputs: [],
    solutionUniqueName: 'CopilotStudioKit_SaveConvHistory_Component',
    solutionVersion: '1.0.0.0',
    zipUrl: 'https://aka.ms/cskagentlib/comp/chathistory',
    downloadUrl: 'https://aka.ms/cskagentlib/comp/chathistory',
    copilotStudioPath: 'component-collections',
    icon: 'PeopleCheckmark20Filled',
    iconColor: 'Green',
    iconSvg: iconSaveConvHistory,
    copilotStudioComponentName: 'Save Conversation History Component',
    requiresExternalConnection: false,
    type: 'component' as const,
    iconGradient: ICON_GRADIENTS.fuchsia,
    toolsAndActions: ['Topic'],
  },
  {
    id: 'servicenow-ticket-assistant',
    name: 'ServiceNow Ticket Assistant',
    description:
      'Provides end-to-end ServiceNow incident management directly from a Copilot Studio agent. Includes five topics covering the full incident lifecycle — Create Incident, Check Status, Resolve/Close Incident, Get Recent Incidents, and Next Actions. Uses adaptive cards to collect user input in the conversation.',
    learnMoreUrl: 'https://aka.ms/csk-components/snow',
    inputsLabel: 'Component',
    categories: ['Act'],
    technologyTags: ['ServiceNow Connector', 'Topic', 'Adaptive Cards'],
    inputs: [
      {
        name: 'ServiceNow | Create Incident',
        description:
          'Create a new ServiceNow incident by collecting required incident details and submitting it to ServiceNow.',
      },
      {
        name: 'ServiceNow | Check Incident Status',
        description:
          'Retrieve the latest status and key details of a ServiceNow incident using an Incident Number.',
      },
      {
        name: 'ServiceNow | Resolve or Close an Incident',
        description:
          'Resolve or close an existing ServiceNow incident by incident number, including resolution code and resolution notes.',
      },
      {
        name: 'ServiceNow | Get User Recent Incidents',
        description:
          'Retrieve and display the most recent ServiceNow incidents created by or associated with the current user.',
      },
      {
        name: 'ServiceNow | Next Actions',
        description:
          'Display a reusable menu to guide the user to the next supported ServiceNow operation.',
      },
    ],
    solutionUniqueName: 'CopilotStudioKit_ServiceNow_Components',
    solutionVersion: '1.0',
    zipUrl: 'https://aka.ms/cskagentlib/comp/servicenow',
    downloadUrl: 'https://aka.ms/cskagentlib/comp/servicenow',
    copilotStudioPath: 'component-collections',
    icon: 'PlugConnected24Regular',
    iconColor: 'Blue',
    iconImage: snowIcon,
    iconSvg: iconServiceNow,
    copilotStudioComponentName: 'Service Now Ticket Component',
    requiresExternalConnection: true,
    type: 'component' as const,
    iconGradient: ICON_GRADIENTS.fern,
    toolsAndActions: ['ServiceNow Connector', 'Topic', 'Adaptive Cards'],
  },
];
