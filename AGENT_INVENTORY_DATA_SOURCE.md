# Agent Inventory — Data Source 

Overview
--------

This document is the authoritative reference for the Agent Details table (Dataverse) that powers the Agent Inventory. It lists every field, the Dataverse source or detection rule, version/maturity, and a concise description for downstream consumers.

Audience
--------

- Platform engineers and integrators implementing sync or validation logic
- Operators and support teams troubleshooting agent configurations
- Analysts and report authors consuming Agent Details for dashboards and reports

How to use this document
------------------------

- Consult the schema table for exact column names, data types and sources.
- Use the derivation rules below when implementing detection logic or validation tests.
- The Version column indicates field maturity (V1..V3).

Terminology
-----------

- Dataverse tables referenced include `bot`, `botcomponent`, `processes`, and Conversation Transcript.
- "Topic v2" denotes the platform topic schema used in conversational flows.

| Column Name | Column Schema Name | Data Type | Source | Version | Description |
|---|---|---|---:|:--:|---|
| Agent ID | cat_agentid | Text | Dataverse: Table `bot` → `botid` column | V1 | Dataverse unique identifier for the agent (botid). |
| Name | cat_name | Text | Dataverse: Table `bot` → `name` column | V1 | The agent's display name. |
| Type | cat_type | Text | Custom field (CSV) | V2 | Agent type (e.g., Declarative, Custom). |
| Environment Name | cat_environmentname | Text | Power Platform Admin connector — `List environments as admin` output: prefer `friendlyName`, fallback to `displayName` or `properties.linkedEnvironmentMetadata.friendlyName` | V1 | Environment display name where the agent is deployed. |
| Environment ID | cat_environmentid | Text | Power Platform Admin connector — `List environments as admin` output: `name` (instance identifier) | V1 | Unique identifier for the environment (instance name). |
| Environment Type | cat_environmenttype | Text | Power Platform Admin connector — `List environments as admin` output: `properties.environmentSku` | V1 | Environment SKU/type (e.g., Production, Development). |
| Description | cat_description | Multiline Text | Dataverse: Table `botcomponent` where `componenttypename` = Custom GPT (15) → `description` column | V1 | Human-readable description of the agent. |
| Instructions |  | Multiline Text | Dataverse: Table `botcomponent` (Custom GPT) → YAML `data` column → `instructions` property | V1 | Admin-facing instructions or usage guidance for the agent. |
| Agent Created Date | cat_agentcreateddate | DateTime | Dataverse: Table `bot` → `createdon` column | V1 | Creation timestamp for the agent. |
| Agent Modified Date | cat_agentmodifieddate | DateTime | Dataverse: Table `bot` → `modifiedon` column | V1 | Last modification timestamp for the agent. |
| Agent Created By | cat_agentcreatedby | Text | Dataverse: Table `bot` → `createdby` column | V1 | User who created the agent. |
| Agent Modified By | cat_agentmodifiedby | Text | Dataverse: Table `bot` → `modifiedby` column | V1 | User who last modified the agent. |
| Managed State | cat_managedstate | Text | Dataverse: Table `bot` → `ismanaged` column | V1 | Indicates whether the agent is managed or unmanaged. |
| Published | cat_published | Boolean | Dataverse: Table `bot` → published date present → true | V1 | True if the agent has a published date. |
| Published Date | cat_publisheddate | DateTime | Dataverse: Table `bot` → `published` (published date) column | V1 | Timestamp when the agent was published. |
| Published By | cat_publishedby | Text | Dataverse: Table `bot` → `publishedby` column | V2 | User who published the agent. |
| Default Application ID | cat_defaultapplicationid | Text | Dataverse: Table `bot` → `synchronizationstatus` JSON → `applicationId` property | V1 | Default application ID associated with the agent. |
| Uses Gen AI | cat_usesgenai | Boolean | Derived: true if agent uses any of actions, prompts, knowledge sources, MCP, customized responses, classic generative sources, AI knowledge, or has generative orchestration | V1 | Indicates whether the agent uses generative AI capabilities. |
| Orchestration Type | cat_orchestrationtype | Text | Dataverse: Table `bot` → `configuration` JSON → `GenerativeActionsEnabled` (true → generative; otherwise classic) | V1 | Orchestration type (generative or classic). |
| Autonomous Agent |  | Boolean | Dataverse: Table `botcomponent` → `componenttypename` = External Trigger (17) → presence = true | V2 | True if the agent contains an external trigger component (autonomous). |
| Uses Enhanced Search Results | cat_usesenhancedsearchresults | Boolean | Dataverse: Table `bot` → `configuration` JSON → `isSemanticSearchEnabled` (true → true) | V1 | Indicates whether semantic/enhanced search is enabled. |
| Uses Tools | cat_usesactions | Boolean | Dataverse: Table `botcomponent` (Topic v2) → `data` contains `TaskDialog` → true | V1 | True if the agent uses tool/action nodes. |
| Uses AI Knowledge | cat_usesaiknowledge | Boolean | Dataverse: Table `bot` → `configuration` JSON → `useModelKnowledge` (true → true) | V1 | Indicates whether the agent is allowed to use general AI knowledge. |
| Uses Knowledge Sources |  | Boolean | Dataverse: Table `botcomponent` where `componenttypename` = Bot File Attachment (KnowledgeSources) → `data.KnowledgeSourceConfiguration` present → true | V1 | True if any knowledge sources are configured. |
| Uses Classic Generative Answers Sources |  | Boolean | Dataverse: Table `botcomponent` (Topic v2) → `data.searchAndSummarizeContent` contains classic sources (publicdatasource, sharePointSearchDataSource, customdatasource, azureopenaionyourdatasource) → true | V2 | True if classic generative answer sources are configured. |
| Uses Prompts | cat_usesaibuilderprompts | Boolean | Dataverse: Table `botcomponent` (Topic v2) → `data` contains `InvokeAIBuilderModelAction` → true | V1 | True if AI Builder prompts are used. |
| Uses MCP |  | Boolean | Dataverse: Table `botcomponent` (Topic v2) → `data` contains `kind: InvokeExternalAgentTaskAction` → true | V2 | True if Model Context Protocol (MCP) actions are present. |
| Uses Customized response |  | Boolean | Dataverse: Table `botcomponent` (Topic v2) → `data` contains `kind: AnswerQuestionWithAI` → true | V2 | True if customized response nodes are present. |
| Uses Generative Topics |  | Boolean | Dataverse: Topic/action inspection → presence of `InvokeAgentTaskAction` → true | V3 | True if generative topic actions (InvokeAgentTaskAction) are used. |
| Uses Connector Maker Auth Context |  | Boolean | Dataverse: `botcomponent.data` → `connectionProperties.mode` = `maker` → true | V2 | True if any connector is configured to run in maker authentication mode. |
| Uses Cloud Flow Auth Context |  | Boolean | Dataverse: Table `processes` → `clientdata.connectionreferences` + `impersonation`/`runtimesource` logic (impersonation = {} or embedded runtimesource → maker; impersonation.source=invoker → invoker) | V2 | Indicates whether invoked cloud flows require maker or invoker auth context. |
| End-User Authentication Type | cat_enduserauthenticationtype | Text | Dataverse: Table `bot` → `authenticationmode` column | V1 | End-user authentication mode for the agent. |
| Requires Secured Access (Direct Line) |  | Boolean | (Web channel security setting — may not be available from Dataverse) | V3 | Indicates whether Direct Line (web channel) requires secured access. |
| Uses HTTP Requests | cat_useshttprequests | Boolean | Dataverse: Table `botcomponent` (Topic v2) → `data` contains `HttpRequestAction` → true | V1 | True if the agent issues HTTP request actions. |
| Uses Skills | cat_usesskills | Boolean | Dataverse: Table `botcomponent` (Topic v2) → `data` contains `InvokeSkillAction` → true | V2 | True if the agent invokes skills. |
| Knowledge Sources | cat_knowledgesources | Multiline Text | Dataverse: `botcomponent` (KnowledgeSources) → `data.KnowledgeSourceConfiguration` | V1 | List of configured knowledge sources (raw configuration). |
| Classic Data Sources |  | Multiline Text | Dataverse: Table `botcomponent` (Topic v2) → `data.searchAndSummarizeContent` (publicdatasource, sharePointSearchDataSource, customdatasource, azureopenaionyourdatasource) | V2 | List of classic data sources referenced by the agent. |
| Http Request Actions | cat_httprequestactions | Multiline Text | Dataverse: Table `botcomponent` (Topic v2) → `data` contains `HttpRequestAction` entries | V1 | List of configured HTTP request actions. |
| Prompts | cat_aibuilderpromts | Multiline Text | Dataverse: Table `botcomponent` (Topic v2) → `data` contains `InvokeAIBuilderModelAction` entries | V1 | List of AI Builder prompts used by the agent. |
| Connections |  | Multiline Text | Agent connections: `botcomponent.data.connectionreference` + `connectionProperties.mode`; Flow connections: `processes.clientdata.connectionreferences` (api name, impersonation, runtimesource) — derive connection name and auth mode (maker or invoker) | V2 | Connector/flow connection names and inferred auth modes (maker/invoker). |
| Agent Triggers |  | Multiline Text | Dataverse: Table `botcomponent` → `componenttypename` = External Trigger (17) → `data.triggerConnectionType` | V2 | List of trigger connectors used by the agent. |
| Usage Info |  | Multiline Text | Licensing API — usage report endpoints (see Usage reporting endpoints section) | V3 | Usage and licensing information (sourced from Licensing API). |
| Uses Custom Knowledges Sources | cat_UsesCustomKnowledgesSources | Boolean | Dataverse: Table `botcomponent` (Topic v2) → `data` starts with `kind: AdaptiveDialog` and `beginDialog.kind: OnKnowledgeRequested` → true | V2 | True if custom adaptive knowledge-request dialogs are present. |
| Uses Deep Reasoning Models | cat_UsesDeepReasoningModels | Boolean | Dataverse: Table `bot` → `configuration.optInUseLatestModels` (true → true) | V2 | True if the agent opts into latest/deeper reasoning models. |
| Uses File Input | cat_UsesFileInput | Boolean | Dataverse: Table `bot` → `configuration.isFileAnalysisEnabled` (true → true) | V2 | True if file analysis/input is enabled. |
| EnvironmentUrl | cat_EnvironmentUrl | Text | Power Platform Admin connector — `List environments as admin` output: instance URL | V2 | Environment instance URL. |
| IsTranscriptAvailable | cat_IsTranscriptAvailable | Text | Dataverse: Conversation Transcript table — presence indicates availability | V2 | Indicates whether conversation transcripts exist for the agent. |

---

## Field derivation & detection rules (summary)

The following rules summarize how derived and boolean fields are detected. They are extracted from the above Source/Description cells in the schima table.

- Managed State — Read `bot.ismanaged`; maps to managed/unmanaged.
- Published — True when the `bot` record has a published date.
- Published Date — Taken from `bot.published` (published timestamp).
- Published By — Taken from `bot.publishedby`.
- Uses Gen AI — Derived: true when the agent uses any of actions, prompts, knowledge sources, MCP, customized responses, classic generative sources, AI knowledge, or has generative orchestration enabled.
- Orchestration Type — `bot.configuration.GenerativeActionsEnabled` → `generative` else `classic`.
- Autonomous Agent — True when a `botcomponent` with `componenttypename` = External Trigger (17) exists.
- Uses Enhanced Search Results — `bot.configuration.isSemanticSearchEnabled` true → enabled.
- Uses Tools — Presence of `TaskDialog` entries in Topic v2 `botcomponent.data`.
- Uses AI Knowledge — `bot.configuration.useModelKnowledge` true → allowed.
- Uses Knowledge Sources — Presence of `botcomponent` KnowledgeSources (`data.KnowledgeSourceConfiguration`).
- Uses Classic Generative Answers Sources — Topic v2 `data.searchAndSummarizeContent` contains classic source entries (publicdatasource, sharePointSearchDataSource, customdatasource, azureopenaionyourdatasource).
- Uses Prompts — Topic v2 `data` contains `InvokeAIBuilderModelAction`.
- Uses MCP — Topic v2 `data` contains `kind: InvokeExternalAgentTaskAction`.
- Uses Customized response — Topic v2 `data` contains `kind: AnswerQuestionWithAI`.
- Uses Generative Topics — Presence of `InvokeAgentTaskAction` in topic/action definitions.
- Uses Connector Maker Auth Context — Any `botcomponent.data.connectionProperties.mode` = `maker`.
- Uses Cloud Flow Auth Context — Derived from `processes.clientdata.connectionreferences` using `impersonation` and `runtimesource` rules (impersonation = {} or embedded runtimesource → maker; impersonation.source = invoker → invoker).
- End-User Authentication Type — `bot.authenticationmode`.
- Requires Secured Access (Direct Line) — Web channel security; may not be retrievable from Dataverse.
- Uses HTTP Requests — Topic v2 `data` contains `HttpRequestAction`.
- Uses Skills — Topic v2 `data` contains `InvokeSkillAction`.
- Uses Custom Knowledge Sources — Topic v2 `data` begins with `kind: AdaptiveDialog` and `beginDialog.kind: OnKnowledgeRequested`.
- Uses Deep Reasoning Models — `bot.configuration.optInUseLatestModels` true → true.
- Uses File Input — `bot.configuration.isFileAnalysisEnabled` true → true.
- IsTranscriptAvailable — Presence in Conversation Transcript table.

If you need more detail for a specific field, I can paste the original verbatim CSV cell for that field.

---
