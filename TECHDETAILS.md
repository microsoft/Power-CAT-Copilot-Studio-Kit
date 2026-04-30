# Technical Information about Copilot Studio Kit

This document provides a comprehensive technical reference for the [Power CAT Copilot Studio Kit](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit), including environment variables, connection references, DLP connector requirements, and a feature-to-component matrix. Use this as a guide during installation, environment configuration, and DLP policy setup.

---

## Environment Variables

### General

| Name | Schema Name | Type | Default | Description | Used By |
| :-- | :-- | :-- | :-- | :-- | :-- |
| Instance Url | `cat_InstanceUrl` | String | — | Dataverse environment URL | File Synchronization, Compliance Hub |
| Power Automate Region | `cat_PowerAutomateEndpoint` | String | `Commercial` | Power Automate environment region (e.g., Commercial, GCC, GCC High) | Global |
| App ID | `cat_AppID` | String | — | Application ID for the Copilot Studio Kit canvas app | Compliance Hub |
| Code App Shared Flag | `cat_CodeAppSharedFlag` | Yes/No | `No` | Flag indicating whether the Code App has been shared | Component Library |

### Compliance Hub

| Name | Schema Name | Type | Default | Description | Used By |
| :-- | :-- | :-- | :-- | :-- | :-- |
| Admin Approval Before Maker Notification | `cat_AdminApprovalBeforeMakerNotification` | Yes/No | `No` | If enabled, an approval is sent to the admin before the maker receives a notification | Compliance Hub |
| Maker Team ID | `cat_AgentMakerTeamID` | String | `00000000-0000-0000-0000-000000000000` | Azure AD group Object ID for agent makers | Compliance Hub |
| Case Intake SLA | `cat_CaseIntakeSLA` | Integer | `5` | Number of days for the maker to complete the intake form | Compliance Hub |
| Case Review SLA | `cat_CaseReviewSLA` | Integer | `5` | SLA in days for the admin to complete compliance case review | Compliance Hub |
| Case Summary Email Frequency | `cat_CaseSummaryEmailFrequency` | String | `WEEKLY` | How often admins receive compliance case summary emails (e.g., DAILY, WEEKLY) | Compliance Hub |
| Compliance Admin Group ID | `cat_GovernanceAdminAlias` | String | — | Azure AD Group Object ID for the compliance admin team | Compliance Hub |
| Compliance Documentation Link | `cat_ComplianceDocumentationLink` | String | `https://aka.ms/CopilotStudioKit` | Link to your organization's compliance documentation | Compliance Hub |
| Compliance Support Contact Alias | `cat_ComplianceSupportContactAlias` | String | — | Email alias for compliance support inquiries | Compliance Hub |
| Require Case For No Risk | `cat_RequireCaseForNoRisk` | Yes/No | `No` | If enabled, a compliance case is created even for agents classified as no risk | Compliance Hub |
| Send Case Alerts via Email | `cat_SendCaseAlertsToMakerViaEmail` | Yes/No | `Yes` | Send email notifications to makers for compliance case updates | Compliance Hub |
| Send Case Alerts via Teams | `cat_SendCaseAlertsToMakerViaTeams` | Yes/No | `Yes` | Send Teams notifications to makers for compliance case updates | Compliance Hub |

### Test Automation

| Name | Schema Name | Type | Default | Description | Used By |
| :-- | :-- | :-- | :-- | :-- | :-- |
| Delay for Azure App Insights Enrichment (Minutes) | `cat_DelayforAzureApplicationInsightsEnrichment` | Integer | `5` | Minutes to wait after running a test before fetching App Insights telemetry | Test Automation |
| Delay for Conversation Transcripts Enrichment (Minutes) | `cat_DelayforConversationTranscriptsEnrichment` | Integer | `35` | Minutes to wait after running a test before fetching conversation transcript data | Test Automation |

### Adaptive Cards Gallery & WebChat Playground

| Name | Schema Name | Type | Default | Description | Used By |
| :-- | :-- | :-- | :-- | :-- | :-- |
| Agent Token Endpoint | `cat_AgentTokenEndpoint` | String | — | Token endpoint for the Copilot Studio custom agent used for webchat preview. Optional — the built-in emulator is used if not set. See [setup instructions](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/ADAPTIVE_CARDS_GALLERY.md#setup-note). | Adaptive Cards Gallery, WebChat Playground |

### Conversation KPIs

| Name | Schema Name | Type | Default | Description | Used By |
| :-- | :-- | :-- | :-- | :-- | :-- |
| Conversation KPIs Report | `cat_ConversationKPIReport` | JSON | — | Power BI workspace and report details for the embedded KPI dashboard. See [configuration steps](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/INSTALLATION_INSTRUCTIONS.md#configure-the-embedded-conversation-kpi-dashboard). | Conversation KPIs |

### Agent Value Summary

| Name | Schema Name | Type | Default | Description | Used By |
| :-- | :-- | :-- | :-- | :-- | :-- |
| Enable Value Component | `cat_Enablevaluecomponent` | Yes/No | `No` | Enables the value classification component on the agent detail page | Agent Value Summary |

---

## Connection References

All connection references below are defined in the solution. Set these up during installation per the [Installation Instructions](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/INSTALLATION_INSTRUCTIONS.md).

| # | Name | Connector | Required For | Notes |
| :-- | :-- | :-- | :-- | :-- |
| 1 | Copilot Studio Kit - Dataverse | `shared_commondataserviceforapps` | **All features** | Core connection — required for every feature in the Kit |
| 2 | Copilot Studio Kit - Power Platform for Admins | `shared_powerplatformforadmins` | Agent Inventory | Used to retrieve the list of Power Platform environments |
| 3 | Copilot Studio Kit - Outlook | `shared_office365` | Compliance Hub | Used for sending email notifications for compliance cases |
| 4 | Copilot Studio Kit - SharePoint | `shared_sharepointonline` | File Synchronization | Used for synchronizing files from SharePoint document libraries |
| 5 | Copilot Studio Kit - Standard approvals | `shared_approvals` | Compliance Hub | Used for compliance case approval workflows |
| 6 | Copilot Studio Kit - Office 365 Groups | `shared_office365groups` | Compliance Hub | Used for Azure AD / Entra group membership lookups |
| 7 | Copilot Studio Kit - Office 365 Users | `shared_office365users` | Compliance Hub | Used for user profile lookups in compliance workflows |
| 8 | Copilot Studio Kit - Power Platform for Admins V2 | `shared_powerplatformadminv2` | Agent Inventory, Compliance Hub | Used for advanced admin operations across environments |
| 9 | Copilot Studio Kit - Microsoft Teams | `shared_teams` | Compliance Hub | Used for sending Teams notifications for compliance case alerts |

---

## Connectors Used (for DLP Configuration)

The following connectors **must** be classified as **Business** (or allowed) in your DLP policies for the Copilot Studio Kit to function correctly. They must all be in the **same DLP group**.

| # | Connector | API Name | Used By | Notes |
| :-- | :-- | :-- | :-- | :-- |
| 1 | Microsoft Dataverse | `shared_commondataserviceforapps` | All features | Core data connector used by every flow and app |
| 2 | SharePoint | `shared_sharepointonline` | File Synchronization | Reading/writing files from SharePoint libraries |
| 3 | Office 365 Outlook | `shared_office365` | Compliance Hub | Sending email notifications and case summary digests |
| 4 | Power Platform for Admins | `shared_powerplatformforadmins` | Agent Inventory | Listing environments and agent metadata |
| 5 | Power Platform for Admins V2 | `shared_powerplatformadminv2` | Agent Inventory, Compliance Hub | Advanced admin operations (capacity, usage) |
| 6 | Standard Approvals | `shared_approvals` | Compliance Hub | Approval workflows for compliance cases |
| 7 | Office 365 Groups | `shared_office365groups` | Compliance Hub | Checking group membership for admin/maker teams |
| 8 | Office 365 Users | `shared_office365users` | Compliance Hub | Looking up user profiles and emails |
| 9 | Microsoft Teams | `shared_teams` | Compliance Hub | Sending adaptive card notifications via Teams |
| 10 | Microsoft Entra ID | — | Test Automation | Obtaining user access tokens for agents with manual authentication |
| 11 | [Legacy] Microsoft Dataverse | — | Legacy support | Retained for backward compatibility |
| 12 | Direct Line channels in Copilot Studio | — | Test Automation | Communicating with agents during automated test runs |
| 13 | Power Apps for Makers | — | Setup Wizard | Creating and validating connections during initial setup |
| 14 | HTTP with Microsoft Entra ID (preauthorized) | — | Agent Inventory (Usage Metrics) | Used by the separate Usage Metrics solution for API calls |

> **Tip:** If you are using the [Agent Inventory Usage Metrics](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/AGENT_INVENTORY_DATA_SOURCE.md) add-on solution, ensure the **HTTP with Microsoft Entra ID (preauthorized)** connector is also allowed.

---

## Feature → Component Matrix

The table below maps each Kit feature to its primary canvas apps, model-driven apps, cloud flows, and Dataverse tables.

### Canvas & Model-Driven Apps

| Feature | App Name | App Type |
| :-- | :-- | :-- |
| All Features | Copilot Studio Kit | Canvas App (main hub) |
| Setup | Setup Wizard | Canvas App |
| Compliance Hub | Compliance Hub (embedded views) | Model-Driven App components |
| Component Library | Copilot Studio Kit - Component Library | Component Library |

### Cloud Flows (Key Flows by Feature)

| Feature | Key Cloud Flows | Trigger |
| :-- | :-- | :-- |
| Test Automation | Run Test Set, Enrich Results from App Insights, Enrich Results from Conversation Transcripts | Manual / Scheduled |
| File Synchronization | Sync Files from SharePoint | Automated (SharePoint trigger) |
| Agent Inventory | Fetch Environments, Sync Agent Metadata | Scheduled |
| Compliance Hub | Create Compliance Case, Send Case Notification (Email), Send Case Notification (Teams), Process Approval, Send Case Summary Digest | Automated / Scheduled |
| Conversation KPIs | Fetch Conversation Transcripts | Scheduled |
| Adaptive Cards Gallery | (Operates within the canvas app — no dedicated flows) | — |

### Core Dataverse Tables

| Table Display Name | Schema Name | Used By |
| :-- | :-- | :-- |
| Agent | `cat_copilot` | Agent Inventory, Test Automation, Compliance Hub |
| Agent Test | `cat_copilottest` | Test Automation |
| Agent Test Run | `cat_copilottestrun` | Test Automation |
| Agent Test Result | `cat_copilottestresult` | Test Automation |
| Compliance Case | `cat_compliancecase` | Compliance Hub |
| Compliance Case Activity | `cat_compliancecaseactivity` | Compliance Hub |
| Conversation KPI | `cat_conversationkpi` | Conversation KPIs |
| Agent Configuration | `cat_copilotconfiguration` | Global configuration |
| Synchronized File | `cat_synchronizedfile` | File Synchronization |
| Environment | `cat_environment` | Agent Inventory |
| Adaptive Card Template | `cat_adaptivecardtemplate` | Adaptive Cards Gallery |

> **Note:** This is not an exhaustive list of all tables. See the solution file for the complete entity manifest.

---

## Agent Inventory Data Sources

Please refer to the [Agent Inventory — Data Source](AGENT_INVENTORY_DATA_SOURCE.md) file for detailed information about data sources, including Microsoft Graph, Power Platform Admin connectors, and the optional Usage Metrics solution.

---

## Additional Resources

- [Installation Instructions](INSTALLATION_INSTRUCTIONS.md)
- [Adaptive Cards Gallery](ADAPTIVE_CARDS_GALLERY.md)
- [Compliance Hub](COMPLIANCE_HUB.md)
- [Test Automation](TEST_AUTOMATION.md)
- [Agent Inventory Data Source](AGENT_INVENTORY_DATA_SOURCE.md)
- [Back to main page](README.md)
