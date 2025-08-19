# Agent Inventory — Data Source 

Overview
--------

This document is the authoritative reference for the Agent Details table (Dataverse) that powers the Agent Inventory page in Copilot Studio Kit. It lists every field, the Dataverse source or detection rule, version/maturity, and a concise description for downstream consumers.

Audience
--------

- Platform engineers and integrators implementing sync or validation logic
- Operators and support teams troubleshooting agent configurations
- Analysts and report authors consuming Agent Details for dashboards and reports

How to use this document
------------------------

- Use the schema table for exact column names, data types and sources.
- Use the derivation rules below when implementing detection logic or validation tests.
- The Version column indicates field maturity (V1, V2).

Terminology
-----------

- Dataverse tables referenced include `bot`, `botcomponent`, `processes`, and `conversationtranscript`.
- "Topic v2" denotes the platform topic schema used in conversational flows.

| No | Column Name | Column Schema Name | Data Type | Source | Version | Description |
|---:|---|---|---|---:|:--:|---|
| 1 | Agent ID | cat_agentid | Text | Dataverse: Table `bot` → `botid` column | V1 | Dataverse unique identifier for the agent (botid). |
| 2 | Name | cat_name | Text | Dataverse: Table `bot` → `name` column | V1 | The agent's display name. |
| 3 | Type | cat_type | Text | Hard coded value as Custom | V2 | Agent type (e.g., Declarative, Custom). |
| 4 | Environment Name | cat_environmentname | Text | Power Platform Admin connector — `List environments as admin` output: prefer `friendlyName`, fallback to `displayName` or `properties.linkedEnvironmentMetadata.friendlyName` | V1 | Environment display name where the agent is deployed. |
| 5 | Environment ID | cat_environmentid | Text | Power Platform Admin connector — `List environments as admin` output: `name` (instance identifier) | V1 | Unique identifier for the environment (instance name). |
| 6 | Environment Type | cat_environmenttype | Text | Power Platform Admin connector — `List environments as admin` output: `properties.environmentSku` | V1 | Environment SKU/type (e.g., Production, Development). |
| 7 | Description | cat_description | Multiline Text | Dataverse: Table `botcomponent` where `componenttypename` = Custom GPT (15) → `description` column | V1 | Human-readable description of the agent. |
| 8 | Instructions | cat_Instructions | Multiline Text | Dataverse: Table `botcomponent` (Custom GPT) → YAML `data` column → `instructions` property | V1 | Admin-facing instructions or usage guidance for the agent. |
| 9 | Agent Created Date | cat_agentcreateddate | DateTime | Dataverse: Table `bot` → `createdon` column | V1 | Creation timestamp for the agent. |
| 10 | Agent Modified Date | cat_agentmodifieddate | DateTime | Dataverse: Table `bot` → `modifiedon` column | V1 | Last modification timestamp for the agent. |
| 11 | Agent Created By | cat_agentcreatedby | Text | Dataverse: Table `bot` → `createdby` column | V1 | User who created the agent. |
| 12 | Agent Modified By | cat_agentmodifiedby | Text | Dataverse: Table `bot` → `modifiedby` column | V1 | User who last modified the agent. |
| 13 | Managed State | cat_managedstate | Text | Dataverse: Table `bot` → `ismanaged` column | V1 | Indicates whether the agent is managed or unmanaged. |
| 14 | Published | cat_published | Boolean | Dataverse: Table `bot` → published date present → true | V1 | True if the agent has a published date. |
| 15 | Published Date | cat_publisheddate | DateTime | Dataverse: Table `bot` → `published` (published date) column | V1 | Timestamp when the agent was published. |
| 16 | Published By | cat_publishedby | Text | Dataverse: Table `bot` → `publishedby` column | V2 | User who published the agent. |
| 17 | Default Application ID | cat_defaultapplicationid | Text | Dataverse: Table `bot` → `synchronizationstatus` JSON → `applicationId` property | V1 | Default application ID associated with the agent. |
| 18 | Uses Gen AI | cat_usesgenai | Boolean | Derived: true if agent uses any of actions, prompts, knowledge sources, MCP, customized responses, classic generative sources, AI knowledge, or has generative orchestration | V1 | Indicates whether the agent uses generative AI capabilities. |
| 19 | Orchestration Type | cat_orchestrationtype | Text | Dataverse: Table `bot` → `configuration` JSON → `GenerativeActionsEnabled` (true → generative; otherwise classic) | V1 | Orchestration type (generative or classic). |
| 20 | Autonomous Agent | cat_AutonomousAgent | Boolean | Dataverse: Table `botcomponent` → `componenttypename` = External Trigger (17) → presence = true | V2 | True if the agent contains an external trigger component (autonomous). |
| 21 | Uses Enhanced Search Results | cat_usesenhancedsearchresults | Boolean | Dataverse: Table `bot` → `configuration` JSON → `isSemanticSearchEnabled` (true → true) | V1 | Indicates whether semantic/enhanced search is enabled. |
| 22 | Uses Tools | cat_usesactions | Boolean | Dataverse: Table `botcomponent` (Topic v2) → `data` contains `TaskDialog` → true | V1 | True if the agent uses tool/action nodes. |
| 23 | Uses AI Knowledge | cat_usesaiknowledge | Boolean | Dataverse: Table `bot` → `configuration` JSON → `useModelKnowledge` (true → true) | V1 | Indicates whether the agent is allowed to use general AI knowledge. |
| 24 | Uses Knowledge Sources | cat_UsesKnowledgeSources | Boolean | Dataverse: Table `botcomponent` where `componenttypename` = Bot File Attachment or Knowledge Sources → `data.KnowledgeSourceConfiguration` present → true | V1 | True if any knowledge sources are configured. |
| 25 | Uses Classic Generative Answers Sources | cat_UsesClassicGenerativeAnswersSources | Boolean | Dataverse: Table `botcomponent` (Topic v2) → In the `data` column, the property `searchAndSummarizeContent` contains any of the classic sources: publicdatasource, sharePointSearchDataSource, customdatasource, and azureopenaionyourdatasource → true | V2 | True if classic generative answer sources are configured. |
| 26 | Uses Prompts | cat_usesaibuilderprompts | Boolean | Dataverse: Table `botcomponent` (Topic v2) → `data` contains `InvokeAIBuilderModelAction` → true | V1 | True if AI Builder prompts are used. |
| 27 | Uses MCP | cat_UsesMCP | Boolean | Dataverse: Table `botcomponent` (Topic v2) → `data` contains `kind: InvokeExternalAgentTaskAction` → true | V2 | True if Model Context Protocol (MCP) actions are present. |
| 28 | Uses Customized response | cat_UsesCustomizedResponse | Boolean | Dataverse: Table `botcomponent` (Topic v2) → `data` contains `kind: AnswerQuestionWithAI` → true | V2 | True if customized response nodes are present. |
| 29 | Uses Connector Maker Auth Context | cat_UsesConnectorMakerAuthContext | Boolean | Dataverse: `botcomponent.data` → `connectionProperties.mode` = `maker` → true | V2 | True if any connector is configured to run in maker authentication mode. |
| 30 | Uses Cloud Flow Auth Context | cat_UsesCloudFlowAuthContext | Boolean | Dataverse: Table `processes` → `clientdata.connectionreferences` + `impersonation`/`runtimesource` logic (impersonation = {} or embedded runtimesource → maker; impersonation.source=invoker → invoker) | V2 | Indicates whether invoked cloud flows require maker or invoker auth context. |
| 31 | End-User Authentication Type | cat_enduserauthenticationtype | Text | Dataverse: Table `bot` → `authenticationmode` column | V1 | End-user authentication mode for the agent. |
| 32 | Uses HTTP Requests | cat_useshttprequests | Boolean | Dataverse: Table `botcomponent` (Topic v2) → `data` contains `HttpRequestAction` → true | V1 | True if the agent issues HTTP request actions. |
| 33 | Uses Skills | cat_usesskills | Boolean | Dataverse: Table `botcomponent` (Topic v2) → `data` contains `InvokeSkillAction` → true | V2 | True if the agent invokes skills. |
| 34 | Knowledge Sources | cat_knowledgesources | Multiline Text | Dataverse: Table `botcomponent` where `componenttypename` = Bot File Attachment -> `FileDataName` or Knowledge Sources → `data.KnowledgeSourceConfiguration` | V1 | List of configured knowledge sources (raw configuration). |
| 35 | Classic Data Sources | cat_ClassicDataSources | Multiline Text | Dataverse: Table `botcomponent` (Topic v2) → In the `data` column, the property `searchAndSummarizeContent` contains any of the classic sources: publicdatasource, sharePointSearchDataSource, customdatasource, and azureopenaionyourdatasource | V2 | List of classic data sources referenced by the agent. |
| 36 | Http Request Actions | cat_httprequestactions | Multiline Text | Dataverse: Table `botcomponent` (Topic v2) → `data` contains `HttpRequestAction` entries | V1 | List of configured HTTP request actions. |
| 37 | Prompts | cat_aibuilderpromts | Multiline Text | Dataverse: Table `botcomponent` (Topic v2) → `data` contains `InvokeAIBuilderModelAction` entries | V1 | List of AI Builder prompts used by the agent. |
| 38 | Connections | cat_Connections | Multiline Text | Agent connections: `botcomponent.data.connectionreference` + `connectionProperties.mode`; Flow connections: `processes.clientdata.connectionreferences` (api name, impersonation, runtimesource) — derive connection name and auth mode (maker or invoker) | V2 | Connector/flow connection names and inferred auth modes (maker/invoker). |
| 39 | Agent Triggers | cat_AgentTriggers | Multiline Text | Dataverse: Table `botcomponent` → `componenttypename` = External Trigger (17) → `data.triggerConnectionType` | V2 | List of trigger connectors used by the agent. |
| 40 | Uses Custom Knowledges Sources | cat_UsesCustomKnowledgesSources | Boolean | Dataverse: Table `botcomponent` (Topic v2) → `data` starts with `kind: AdaptiveDialog` and `beginDialog.kind: OnKnowledgeRequested` → true | V2 | True if custom adaptive knowledge-request dialogs are present. |
| 41 | Uses Deep Reasoning Models | cat_UsesDeepReasoningModels | Boolean | Dataverse: Table `bot` → `configuration.optInUseLatestModels` (true → true) | V2 | True if the agent opts into latest/deeper reasoning models. |
| 42 | Uses File Input | cat_UsesFileInput | Boolean | Dataverse: Table `bot` → `configuration.isFileAnalysisEnabled` (true → true) | V2 | True if file analysis/input is enabled. |
| 43 | EnvironmentUrl | cat_EnvironmentUrl | Text | Power Platform Admin connector — `List environments as admin` output: instance URL | V2 | Environment instance URL. |
| 44 | IsTranscriptAvailable | cat_IsTranscriptAvailable | Text | Dataverse: `conversationtranscript` table — presence indicates availability | V2 | Indicates whether conversation transcripts exist for the agent. |

---

## Field derivation & detection rules

Below are concise detection rules for each derived or boolean field (refer to schema column names in parentheses).

- Agent ID (`cat_agentid`): Dataverse `bot.botid`.
- Name (`cat_name`): Dataverse `bot.name`.
- Type (`cat_type`): hard-coded value `Custom` (V2).
- Environment Name (`cat_environmentname`): Power Platform Admin connector `List environments as admin` — prefer `friendlyName`, fallback to `displayName` or `properties.linkedEnvironmentMetadata.friendlyName`.
- Environment ID (`cat_environmentid`): admin connector `name` (instance identifier).
- Environment Type (`cat_environmenttype`): admin connector `properties.environmentSku`.
- Description (`cat_description`): `botcomponent` where `componenttypename` = Custom GPT (15) → `description`.
- Instructions (`cat_Instructions`): `botcomponent` (Custom GPT) → YAML `data.instructions`.
- Agent Created Date (`cat_agentcreateddate`): `bot.createdon`.
- Agent Modified Date (`cat_agentmodifieddate`): `bot.modifiedon`.
- Agent Created By (`cat_agentcreatedby`): `bot.createdby`.
- Agent Modified By (`cat_agentmodifiedby`): `bot.modifiedby`.
- Managed State (`cat_managedstate`): `bot.ismanaged` (managed vs unmanaged).
- Published (`cat_published`): true when `bot` contains a published timestamp.
- Published Date (`cat_publisheddate`): `bot.published` timestamp.
- Published By (`cat_publishedby`): `bot.publishedby`.
- Default Application ID (`cat_defaultapplicationid`): `bot.synchronizationstatus` JSON → `applicationId`.
- Uses Gen AI (`cat_usesgenai`): true if agent uses any of tools/actions, prompts, knowledge sources, MCP, customized responses, classic generative sources, AI knowledge, or has generative orchestration enabled.
- Orchestration Type (`cat_orchestrationtype`): `bot.configuration.GenerativeActionsEnabled` → `generative` else `classic`.
- Autonomous Agent (`cat_AutonomousAgent`): true when `botcomponent.componenttypename` = External Trigger (17) exists.
- Uses Enhanced Search Results (`cat_usesenhancedsearchresults`): `bot.configuration.isSemanticSearchEnabled` = true.
- Uses Tools (`cat_usesactions`): Topic v2 `botcomponent.data` contains `TaskDialog` entries.
- Uses AI Knowledge (`cat_usesaiknowledge`): `bot.configuration.useModelKnowledge` = true.
- Uses Knowledge Sources (`cat_UsesKnowledgeSources`): presence of KnowledgeSources `botcomponent` entries (e.g., `data.KnowledgeSourceConfiguration` or Bot File Attachment entries).
- Uses Classic Generative Answers Sources (`cat_UsesClassicGenerativeAnswersSources`): Topic v2 `data.searchAndSummarizeContent` includes classic source types (publicdatasource, sharePointSearchDataSource, customdatasource, azureopenaionyourdatasource).
- Uses Prompts (`cat_usesaibuilderprompts`): Topic v2 `data` contains `InvokeAIBuilderModelAction`.
- Uses MCP (`cat_UsesMCP`): Topic v2 `data` contains `kind: InvokeExternalAgentTaskAction`.
- Uses Customized Response (`cat_UsesCustomizedResponse`): Topic v2 `data` contains `kind: AnswerQuestionWithAI`.
- Uses Connector Maker Auth Context (`cat_UsesConnectorMakerAuthContext`): any `botcomponent.data.connectionProperties.mode` = `maker`.
- Uses Cloud Flow Auth Context (`cat_UsesCloudFlowAuthContext`): derived from `processes.clientdata.connectionreferences` using `impersonation` and `runtimesource` rules (impersonation = {} or embedded runtimesource → maker; impersonation.source = invoker → invoker).
- End-User Authentication Type (`cat_enduserauthenticationtype`): `bot.authenticationmode`.
- Uses HTTP Requests (`cat_useshttprequests`): Topic v2 `data` contains `HttpRequestAction` entries.
- Uses Skills (`cat_usesskills`): Topic v2 `data` contains `InvokeSkillAction` entries.
- Knowledge Sources (`cat_knowledgesources`): raw `data.KnowledgeSourceConfiguration` from `botcomponent` (multi-line JSON/YAML).
- Classic Data Sources (`cat_ClassicDataSources`): Topic v2 `data.searchAndSummarizeContent` classic entries aggregated.
- Http Request Actions (`cat_httprequestactions`): Topic v2 `data` → `HttpRequestAction` configurations.
- Prompts (`cat_aibuilderpromts`): Topic v2 `data` → `InvokeAIBuilderModelAction` configurations.
- Connections (`cat_Connections`): aggregate from `botcomponent.data.connectionreference` + `connectionProperties.mode` and `processes.clientdata.connectionreferences` (api name, impersonation, runtimesource) to derive connection name and auth mode (maker/invoker).
- Agent Triggers (`cat_AgentTriggers`): `botcomponent` rows where `componenttypename` = External Trigger (17) → `data.triggerConnectionType`.
- Usage Info: collected from Licensing API endpoints for entitlement and consumption reports.
- Uses Custom Knowledges Sources (`cat_UsesCustomKnowledgesSources`): Topic v2 `data` begins with `kind: AdaptiveDialog` and `beginDialog.kind: OnKnowledgeRequested`.
- Uses Deep Reasoning Models (`cat_UsesDeepReasoningModels`): `bot.configuration.optInUseLatestModels` = true.
- Uses File Input (`cat_UsesFileInput`): `bot.configuration.isFileAnalysisEnabled` = true.
- EnvironmentUrl (`cat_EnvironmentUrl`): admin connector `List environments as admin` → instance URL.
- IsTranscriptAvailable (`cat_IsTranscriptAvailable`): true when records exist for the agent in `conversationtranscript`.

---
