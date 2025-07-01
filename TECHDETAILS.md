# Technical information about Copilot Studio Kit
## Environment variables

| Name | Description  | Notes |
| :-- | :-- | :-- |
| Agent Token Endpoint | Token endpoint for Copilot Studio custom agent which will be used for webchat preview in WebChat Playground and Adaptive Cards Gallery features | Optional. Emulator is used if not set. Please see [here](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/psimolin-may-release/ADAPTIVE_CARDS_GALLERY.md#setup-note) for setup information. |
| Conversation KPIs Report | Holds Conversation KPIs report and workspace details. | Required for embedded Conversation KPIs dashboard. [More details](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/INSTALLATION_INSTRUCTIONS.md#configure-the-embedded-conversation-kpi-dashboard) |
| Dataverse URL | URL of the Copilot Studio custom agent Dataverse instance | Required for SharePoint synchronization. |
| Delay for Azure Application Insights Enrichment (Minutes) | Delay between running the test case and trying to fetch additional information from App Insights | Default value 5 minutes |
| Delay for Conversation Transcripts Enrichment (Minutes) | Delay between running the test case and trying to fetch additional information from conversation transcript | Default value 60 minutes |

## Connection references

| Name | Description  | Notes |
| :-- | :-- | :-- |
| Copilot Studio Kit - Dataverse | Microsoft Dataverse connection reference for Copilot Studio Kit | Required |
| Copilot Studio Kit - Power Platform for Admins | This connection reference is used to get a list of environments in Agent Inventory feature | Required for Agent Inventory |
| Copilot Studio Kit - SharePoint | This connection reference is used with SharePoint synchronization | Required for SharePoint synchronization |

## Connectors used (for DLP configuration purposes)

| Name | Description  | Notes |
| :-- | :-- | :-- |
| Microsoft Dataverse | Provides access to Microsoft Dataverse actions and triggers for Power Platform environments. | Used everywhere in Kit |
| Sharepoint |  | Used in SharePoint synchronization |
| Office 365 Outlook | | Used in Agent Review Tool |
| Power Platform for Admins | | Used in Agent Inventory |
| Microsoft Entra ID | Used to obtain a user access token for connecting to the agent during test automation when the agent is configured with manual authentication. | Used in Test Automation |
| [Legacy] Microsoft Dataverse | | |
| Direct Line channels in Copilot Studio | | Used in Test Automation |
| Power Apps for Makers | Used to get or create the required connections in the Power Platform environment. | Used in the Setup Wizard |

## Agent Inventory data sources
| Field | Source  | Source detail |
| :-- | :-- | :-- |
| Name | Dataverse | bot |
| Description | Dataverse | botcomponent |
| Environment Name | Environments List | displayName  |
| Environment Type | Environments List | environmentSku |
| Orchestration Type | Dataverse | bot - GenerativeActionsEnabled |
| Uses Gen AI | Calculated | true if actions, prompts, knowledge sources, MCP, customized responses, classic generative answer sources, AI knowledge, generative orchestration |
| Uses Actions | Dataverse | botcomponent |
| Uses Prompts | Dataverse | botcomponent |
| Uses Knowledge Sources | Dataverse | multiple locations |
| Agent Created By | Dataverse | bot |
| Agent Created Date | Dataverse | bot |
| Agent ID | Dataverse | bot |
| Agent Modified By | Dataverse | bot |
| Agent Modified Date | Dataverse | bot |
| Created By | Dataverse | bot |
| Default Application ID | Dataverse | bot |
| End User Authentication Type | Dataverse | bot |
| Environment ID | Environments List | name |
| Http Request Actions | Dataverse | botcomponent |
| Instructions | Dataverse | botcomponent |
| Knowledge Sources | Dataverse | multiple locations |
| Managed State | Dataverse | bot |
| Modified By | Dataverse | bot |
| Prompts | Dataverse | botcomponent |
| Published | Dataverse | bot|
| Published By | Dataverse | bot |
| Published Date | Dataverse | bot |
| Uses AI Knowledge | Dataverse | bot |
| Uses Enhanced Search Results | Dataverse | bot |
| Uses HTTP Requests | Dataverse | botcomponent |
| Uses Skills | Dataverse | bot |
| Type | Dataverse | other |
| Autonomous Agent | Dataverse | botcomponent  |
| Uses Classic Generative Answers Sources | Dataverse | botcomponent |
| Uses MCP | Dataverse | botcomponent |
| Uses Customized response | Dataverse | botcomponent |
| Uses Connector Maker Auth Context | Dataverse | botcomponent |
| Uses Cloud Flow Auth Context | Dataverse | processes |
| Classic Data Sources | Dataverse | botcomponent |
| Connections | Dataverse | botcomponent, processes |
| Agent Triggers | Dataverse | botcomponent |
| Uses Custom Knowledges Sources | Dataverse | botcomponent |
| Uses Deep Reasoning Models | Dataverse | bot |
| Uses File Input | Dataverse | bot |
| EnvironmentUrl | Dataverse | Environments List |
| IsTranscriptAvailable | Dataverse | Conversation Transcript |








