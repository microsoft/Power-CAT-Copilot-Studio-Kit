# Technical information about Copilot Studio Kit
## Environment variables

| Name | Description  | Notes |
| :-- | :-- | :-- |
| Agent Token Endpoint | Token endpoint for Copilot Studio custom agent which will be used for webchat preview in WebChat Playground and Adaptive Cards Gallery features | Optional. Emulator is used if not set. |
| Conversation KPIs Report | Holds Conversation KPIs report and workspace details. | Required for embedded Conversation KPIs dashboard. [More details](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/INSTALLATION_INSTRUCTIONS.md#configure-the-embedded-conversation-kpi-dashboard) |
| Dataverse URL| URL of the Copilot Studio custom agent Dataverse instance | Required for SharePoint synchronization. |
| Delay for Azure Application Insights Enrichment (Minutes) | Delay between running the test case and trying to fetch additional information from App Insights | Default value 5 minutes |
| Delay for Conversation Transcripts Enrichment (Minutes) | Delay between running the test case and trying to fetch additional information from conversation transcript | Default value 60 minutes |
| Power Automate Endpoint | Power Automate domain to use on links to flows. | Can be adjusted if using the Kit in GCC |

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
| Power platform for admins | | Used in Agent Inventory |
| Microsoft Entra ID | | |





