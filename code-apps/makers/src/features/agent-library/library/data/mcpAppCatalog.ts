/**
 * MCP App catalog - static data bundled with the app.
 *
 * MCP (Model Context Protocol) apps are downloadable packages hosted on GitHub.
 * Unlike templates and components, they are NOT installed into the environment -
 * the details dialog shows an "About this app" description with two actions:
 * Learn more (opens the source repo) and Download (opens the ZIP from GitHub).
 *
 * Content mirrors the Figma design (node 2544:25965 / dialog 2546:30907).
 * Categories use the shared industry taxonomy (see MCP_CATEGORY_FILTERS).
 */

import type { McpApp } from '../contracts/types';
import { ICON_GRADIENTS } from './agentTemplateCatalog';

export const MCP_APP_CATALOG: McpApp[] = [
  {
    id: 'ask-salesforce',
    name: 'Ask - Salesforce',
    type: 'mcp-app',
    description: 'Work your Salesforce pipeline in Copilot chat - open leads, opportunities, accounts, contacts, and cases as live cards you can filter, edit, and advance in a click.',
    aboutApp: 'Ask - Salesforce turns a Copilot conversation into a working CRM surface. Ask about your pipeline and it renders the actual records - opportunity boards, account detail views, editable lead and contact forms - as interactive widgets you act on right there. Log the next step, requalify a lead, or update a case without ever opening the Salesforce console. Because it reads and writes live CRM data over the Model Context Protocol, what you see is exactly what your team sees, so deals keep moving and nothing slips between tabs.',
    categories: ['Sales', 'Support', 'CRM'],
    downloadUrl: 'https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/raw/main/mcp-apps/ask-salesforce/ask-salesforce.zip',
    learnMoreUrl: 'https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/mcp-apps/ask-salesforce/README.md',
    icon: 'PersonSupport24Regular',
    iconColor: 'Purple',
    iconGradient: ICON_GRADIENTS.fuchsia,
  },
  {
    id: 'ask-servicenow',
    name: 'Ask - ServiceNow',
    type: 'mcp-app',
    description: 'Resolve ServiceNow work faster from Copilot chat - triage incidents, raise requests, push changes, and clear approvals with interactive cards, no console needed.',
    aboutApp: 'Ask - ServiceNow brings IT service management into the flow of a Copilot conversation. Incidents, requests, changes, problems, and HR cases arrive as interactive widgets you can scan, spin up, and update on the spot, with knowledge articles and pending approvals a tap away. Every card is backed by a live ServiceNow connection over the Model Context Protocol, so the status you read is the status of record. The result: sharper triage, confident action, and requests that keep moving toward resolution - even on a busy queue.',
    categories: ['Support', 'IT', 'Helpdesk'],
    downloadUrl: 'https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/raw/main/mcp-apps/ask-servicenow/ask-servicenow.zip',
    learnMoreUrl: 'https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/mcp-apps/ask-servicenow/README.md',
    icon: 'Chat24Regular',
    iconColor: 'DarkOrange',
    iconGradient: ICON_GRADIENTS.gold,
  },
  {
    id: 'ask-hubspot',
    name: 'Ask - HubSpot',
    type: 'mcp-app',
    description: 'Run your HubSpot CRM inside Copilot chat - browse and update companies, contacts, deals, orders, products, and activities as connected, editable record views.',
    aboutApp: 'Ask - HubSpot puts your growth stack one message away. Companies, contacts, deals, orders, products, and activities render as rich, interactive widgets you can search, create, and edit inline, with related records linked so you can follow a deal from first touch to closed order. It speaks to HubSpot live through the Model Context Protocol, reading and writing the same data your sellers rely on. Ask a question, get a working view - then move the deal forward without switching tools.',
    categories: ['Sales', 'CRM', 'Commerce'],
    downloadUrl: 'https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/raw/main/mcp-apps/ask-hubspot/ask-hubspot.zip',
    learnMoreUrl: 'https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/mcp-apps/ask-hubspot/README.md',
    icon: 'ContactCard24Regular',
    iconColor: 'Blue',
    iconGradient: ICON_GRADIENTS.azure,
  }
];