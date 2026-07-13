# Technical information about Copilot Agent Kit
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
| Copilot Agent Kit - Dataverse | Microsoft Dataverse connection reference for Copilot Agent Kit | Required |
| Copilot Agent Kit - Power Platform for Admins | This connection reference is used to get a list of environments in Agent Inventory feature | Required for Agent Inventory |
| Copilot Agent Kit - SharePoint | This connection reference is used with SharePoint synchronization | Required for SharePoint synchronization |

## Connectors used (for DLP configuration purposes)

| Connector | Used by feature(s) |
| :-- | :-- |
| Microsoft Dataverse | Core (all features), Power Shield, Agent Review Tool |
| Power Platform for Admins | Agent Inventory |
| Power Platform for Admins V2 | Agent Inventory, Compliance Hub |
| Microsoft Teams | Compliance Hub |
| Office 365 Groups | Compliance Hub |
| Office 365 Users | Compliance Hub |
| Office 365 Outlook | Compliance Hub |
| Approvals | Compliance Hub |
| SharePoint Online | SharePoint File Sync |
| Power Apps for Makers | Setup Wizard, Power Shield |
| HTTP with Microsoft Entra ID (preauthorized) | Power Shield, Usage Metrics |
| Microsoft Copilot Studio | Test Automation and Pipeline |

## Agent Inventory data sources
Please refer to the [Agent Inventory -Data Source](AGENT_INVENTORY_DATA_SOURCE.md) file for more information.








