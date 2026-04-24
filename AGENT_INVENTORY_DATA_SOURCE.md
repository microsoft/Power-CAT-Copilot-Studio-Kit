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

> Columns that were previously Boolean are now "Choice" data type with three option values:**Yes**, **No**, **NA** (replacing the former True/False).

Agents which are not accessible within the environment are added using One Inventory data from PPAC. The **Source (One Inventory)** column below shows the mapping for these agents.

| No | Column Name | Column Logical Name | Data Type | Source (Environment) | Source (One Inventory) | Version | Description |
|---:|---|---|---|---|---|:--:|---|
| 1 | Agent ID | cat_agentid | Text | Dataverse: Table `bot` → `botid` column | From power platform resource query → `name` | V1 | Dataverse unique identifier for the agent (botid). |
| 2 | Name | cat_name | Text | Dataverse: Table `bot` → `name` column | From power platform resource query → `properties.displayName` | V1 | The agent's display name. |
| 3 | Type | cat_type | Text | If the Template starts with gpt then declarative else custom | If Agent Created In is Copilot Studio Lite then declarative else custom | V2 | Agent type (e.g., Declarative, Custom). |
| 4 | Environment Name | cat_environmentname | Text | Power Platform for Admins V2 — `Retrieve a list of environments` output: `displayName` | From power platform resource query → `environmentName` | V1 | Environment display name where the agent is deployed. |
| 5 | Environment ID | cat_environmentid | Text | Power Platform for Admins V2 — `Retrieve a list of environments` output: `id` (instance identifier) | From power platform resource query → `properties.environmentId` | V1 | Unique identifier for the environment (instance name). |
| 6 | Environment Type | cat_environmenttype | Text | Power Platform for Admins V2 — `Retrieve a list of environments` output: `type` | From power platform resource query → `environmentType` | V1 | Environment SKU/type (e.g., Production, Development). |
| 7 | Description | cat_description | Multiline Text | Dataverse: Table `botcomponent` where `componenttypename` = Custom GPT (15) → `description` column | | V1 | Human-readable description of the agent. |
| 8 | Instructions | cat_instructions | Multiline Text | Dataverse: Table `botcomponent` (Custom GPT) → YAML `data` column → `instructions` property | | V1 | Admin-facing instructions or usage guidance for the agent. |
| 9 | Agent Created Date | cat_agentcreateddate | DateTime | Dataverse: Table `bot` → `createdon` column | From power platform resource query → `properties.createdAt` | V1 | Creation timestamp for the agent. |
| 10 | Agent Modified Date | cat_agentmodifieddate | DateTime | Dataverse: Table `bot` → `modifiedon` column | | V1 | Last modification timestamp for the agent. |
| 11 | Agent Created By | cat_agentcreatedby | Text | Dataverse: Table `bot` → `createdby` column | | V1 | User who created the agent. |
| 12 | Agent Modified By | cat_agentmodifiedby | Text | Dataverse: Table `bot` → `modifiedby` column | | V1 | User who last modified the agent. |
| 13 | Managed State | cat_managedstate | Text | Dataverse: Table `bot` → `ismanaged` column | | V1 | Indicates whether the agent is managed or unmanaged. |
| 14 | Published | cat_publishedcode | Choice | Dataverse: Table `bot` → published date present → true | true if Published Date has value | V1 | True if the agent has a published date. |
| 15 | Published Date | cat_publisheddate | DateTime | Dataverse: Table `bot` → `published` (published date) column | From power platform resource query → `properties.lastPublishedAt` | V1 | Timestamp when the agent was published. |
| 16 | Published By | cat_publishedby | Text | Dataverse: Table `bot` → `publishedby` column | | V2 | User who published the agent. |
| 17 | Default Application ID | cat_defaultapplicationid | Text | Dataverse: Table `bot` → `synchronizationstatus` JSON → `applicationId` property | From power platform resource query → `properties.entraId` | V1 | Default application ID associated with the agent. |
| 18 | Uses Gen AI | cat_usesgenaicode | Choice | Derived: true if agent uses any of tools, prompts, knowledge sources, MCP, customized responses, classic generative sources, AI knowledge, or has generative orchestration | NA | V1 | Indicates whether the agent uses generative AI capabilities. |
| 19 | Orchestration Type | cat_orchestrationtype | Text | Dataverse: Table `bot` → `configuration` JSON → `GenerativeActionsEnabled` (true → generative; otherwise classic) | From power platform resource query → `properties.orchestrationType` | V1 | Orchestration type (generative or classic). |
| 20 | Autonomous Agent | cat_autonomousagentcode | Choice | Dataverse: Table `botcomponent` → `componenttypename` = External Trigger (17) → presence = true | NA | V2 | True if the agent contains an external trigger component (autonomous). |
| 21 | Uses Enhanced Search Results | cat_usesenhancedsearchresultscode | Choice | Dataverse: Table `bot` → `configuration` JSON → `isSemanticSearchEnabled` (true → true) | NA | V1 | Indicates whether semantic/enhanced search is enabled. |
| 22 | Uses Tools | cat_usestoolscode | Choice | Dataverse: Table `botcomponent` (Topic v2) → `data` contains `TaskDialog` → true | NA | V1 | True if the agent uses tool/action nodes. |
| 23 | Uses AI Knowledge | cat_usesaiknowledgecode | Choice | Dataverse: Table `bot` → `configuration` JSON → `useModelKnowledge` (true → true) | NA | V1 | Indicates whether the agent is allowed to use general AI knowledge. |
| 24 | Uses Knowledge Sources | cat_usesknowledgesourcescode | Choice | Dataverse: Table `botcomponent` where `componenttypename` = Bot File Attachment or Knowledge Sources → `data.KnowledgeSourceConfiguration` present → true | NA | V1 | True if any knowledge sources are configured. |
| 25 | Uses Classic Generative Answers Sources | cat_usesclassicgenerativeanswerssourcescode | Choice | Dataverse: Table `botcomponent` (Topic v2) → In the `data` column, the property `searchAndSummarizeContent` contains any of the classic sources: publicdatasource, sharePointSearchDataSource, customdatasource, and azureopenaionyourdatasource → true | NA | V2 | True if classic generative answer sources are configured. |
| 26 | Uses Prompts | cat_usespromptscode | Choice | Dataverse: Table `botcomponent` (Topic v2) → `data` contains `InvokeAIBuilderModelAction or InvokeAIBuilderModelTaskAction` → true | NA | V1 | True if AI Builder prompts are used. |
| 27 | Uses MCP | cat_usesmcpcode | Choice | Dataverse: Table `botcomponent` (Topic v2) → `data` contains `kind: InvokeExternalAgentTaskAction` → true | NA | V2 | True if Model Context Protocol (MCP) actions are present. |
| 28 | Uses Customized Response | cat_usescustomizedresponsecode | Choice | Dataverse: Table `botcomponent` (Topic v2) → `data` contains `kind: AnswerQuestionWithAI` → true | NA | V2 | True if customized response nodes are present. |
| 29 | Uses Connector Maker Auth Context | cat_usesconnectormakerauthcontextcode | Choice | Dataverse: `botcomponent.data` → `connectionProperties.mode` = `maker` → true | NA | V2 | True if any connector is configured to run in maker authentication mode. |
| 30 | Uses Cloud Flow Auth Context | cat_usescloudflowauthcontextcode | Choice | Dataverse: Table `processes` → `clientdata.connectionreferences` + `impersonation`/`runtimesource` logic (impersonation = {} or embedded runtimesource → maker; impersonation.source=invoker → invoker) | NA | V2 | Indicates whether invoked cloud flows require maker or invoker auth context. |
| 31 | End User Authentication Type | cat_enduserauthenticationtype | Text | Dataverse: Table `bot` → `authenticationmode` column | From power platform resource query → `properties.authenticationMode` | V1 | End-user authentication mode for the agent. |
| 32 | Uses HTTP Requests | cat_useshttprequestscode | Choice | Dataverse: Table `botcomponent` (Topic v2) → `data` contains `HttpRequestAction` → true | NA | V1 | True if the agent issues HTTP request actions. |
| 33 | Uses Skills | cat_usesskillscode | Choice | Dataverse: Table `botcomponent` (Topic v2) → `data` contains `InvokeSkillAction` → true | NA | V2 | True if the agent invokes skills. |
| 34 | Knowledge Sources | cat_knowledgesources | Multiline Text | Dataverse: Table `botcomponent` where `componenttypename` = Bot File Attachment -> `FileDataName` or Knowledge Sources → `data.KnowledgeSourceConfiguration` | | V1 | List of configured knowledge sources (raw configuration). |
| 35 | Classic Data Sources | cat_classicdatasources | Multiline Text | Dataverse: Table `botcomponent` (Topic v2) → In the `data` column, the property `searchAndSummarizeContent` contains any of the classic sources: publicdatasource, sharePointSearchDataSource, customdatasource, and azureopenaionyourdatasource | | V2 | List of classic data sources referenced by the agent. |
| 36 | Http Request Actions | cat_httprequestactions | Multiline Text | Dataverse: Table `botcomponent` (Topic v2) → `data` contains `HttpRequestAction` entries | | V1 | List of configured HTTP request actions. |
| 37 | Prompts | cat_prompts | Multiline Text | Dataverse: Table `botcomponent` (Topic v2) → `data` contains `InvokeAIBuilderModelAction or InvokeAIBuilderModelTaskAction` entries | | V1 | List of AI Builder prompts used by the agent. |
| 38 | Connections | cat_connections | Multiline Text | Agent connections: `botcomponent.data.connectionreference` + `connectionProperties.mode`; Flow connections: `processes.clientdata.connectionreferences` (api name, impersonation, runtimesource) — derive connection name and auth mode (maker or invoker) | | V2 | Connector/flow connection names and inferred auth modes (maker/invoker). |
| 39 | Agent Triggers | cat_agenttriggers | Multiline Text | Dataverse: Table `botcomponent` → `componenttypename` = External Trigger (17) → `data.triggerConnectionType` | | V2 | List of trigger connectors used by the agent. |
| 40 | Uses Custom Knowledge Source | cat_usescustomknowledgesourcecode | Choice | Dataverse: Table `botcomponent` (Topic v2) → `data` starts with `kind: AdaptiveDialog` and `beginDialog.kind: OnKnowledgeRequested` → true | NA | V2 | True if custom adaptive knowledge-request dialogs are present. |
| 41 | Uses Deep Reasoning Models | cat_usesdeepreasoningmodelscode | Choice | Dataverse: Table `bot` → `configuration.optInUseLatestModels` (true → true) | NA | V2 | True if the agent opts into latest/deeper reasoning models. |
| 42 | Uses File Input | cat_usesfileinputcode | Choice | Dataverse: Table `bot` → `configuration.isFileAnalysisEnabled` (true → true) | NA | V2 | True if file analysis/input is enabled. |
| 43 | Environment Url | cat_environmenturl | Text | Power Platform for Admins V2 — `Retrieve a list of environments` output: `URL` | Power Platform for Admins V2 — `Retrieve a list of environments` output: `URL` | V2 | Environment instance URL. |
| 44 | Is Transcript Available | cat_istranscriptavailablecode | Choice | Dataverse: `conversationtranscript` table — presence indicates availability | NA | V2 | Indicates whether conversation transcripts exist for the agent. |
| 45 | Agent Created By ADID | cat_agentcreatedbyadid | Text | Dataverse: `systemuser` table — ADID or Azure Object ID | From power platform resource query → `properties.createdBy` | V3 | Azure active directory id of created by user. |
| 46 | Agent Test Configured | cat_agenttestconfiguredcode | Choice | Agent Test Run table and Agent Test Case table exists for the agent is considered as agent test configured | NA | V3 | Test case configured for the agent in the copilot studio kit test automation. |
| 47 | Template | cat_template | Text | Dataverse: `bot` table — template | | V3 | Used to identify the template and version used for the bot default content. |
| 48 | Agent Created by UPN | cat_agentcreatedbyupn | Text | Dataverse: `systemuser` table — domainname | | V3 | Agent creator email Id. |
| 49 | Uses Evaluation | cat_usesevaluationcode | Choice | Dataverse: Table `botcomponent` where `componenttypename` = Test Case and `componenttype` = 19 | NA | V3 | Returns true if test evaluation is configured for the agent. |
| 50 | Web Search Enabled | cat_websearchenabledcode | Choice | Dataverse: Table `botcomponent` where `componenttypename` = Custom GPT and `componenttype` = 15 and `data` contains "webBrowsing: true" | NA | V3 | Is web search enabled in the agent. |
| 51 | Agent Created In | cat_agentcreatedin | Text | Copilot Studio | From power platform resource query → `properties.createdIn` | v4 | Agen created in like Copilot studio or M365 Copilot etc |
| 52 | Agent Schema Name | cat_agentschemaname | Text | Dataverse: Table `bot` SchemaName | From power platform resource query → `properties.schemaName` | V4 | Agent's schema name |
| 54 | HasSysAdminAccess | cat_hassysadminaccesscode | Choice | True | false | V4 | True if the agent is accessible within the environment to fetch data for agent inventory. If true then the features of the agent will be available in agent inventory else you may see NA and empty for the agent (Only limited data is available from one inventory PPAC). |
| 55 | Location | cat_location | Text | Location of the agent (Environmen region) | From power platform resource query → `location` | V4 | Location of the agent |
| 56 | Model | cat_model | Text |  | From power platform resource query → `properties.model` | V4 | Model the agent is using |
| 57 | First Usage Date | cat_firstusagedate | Date | Usage metrics data available in Power Platform Admin Center | Usage metrics data available in Power Platform Admin Center | V3 | Represents the agent's first usage date derived from available usage metrics. Currently supports a maximum look‑back of 180 days. |
| 58 | First Usage Feature | cat_firstusagefeature | Text | Usage metrics data available in Power Platform Admin Center | Usage metrics data available in Power Platform Admin Center | V3 | Represents the first feature used within the agent, based on usage metrics available in the system. Currently supports a maximum look‑back of 180 days. |
| 59 | Last Usage Date | cat_lastusagedate | Date | Agent last usage date from the usage metrics data from power platform admin center | Agent last usage date from the usage metrics data from power platform admin center | V3 | Agent last usage date from the usage metrics data from power platform admin center |
| 60 | Last Usage Feature | cat_lastusagefeature | Text | Agent last usage feature from the usage metrics data from power platform admin center | Agent last usage feature from the usage metrics data from power platform admin center | V3 | Agent last usage feature from the usage metrics data from power platform admin center |
| 61 | Usage Agent Action (Billed) | cat_usageagentactionbilled | Whole Number | Agent billed usage from the usage metrics data from power platform admin center | Agent billed usage from the usage metrics data from power platform admin center | V3 | Represents the billing message associated with the feature utilized by the agent. |
| 62 | Usage Agent Action (Non-Billed) | cat_usageagentactionnonbilled | Whole Number | Agent non billed usage from the usage metrics data from power platform admin center | Agent non billed usage from the usage metrics data from power platform admin center | V3 | Represents the non billing message for the feature utilized by the agent |
| 63 | Usage Agent Flow Actions (Billed) | cat_usageagentflowactionsbilled | Whole Number | Agent billed usage from the usage metrics data from power platform admin center | Agent billed usage from the usage metrics data from power platform admin center | V3 | Represents the billing message associated with the feature utilized by the agent |
| 64 | Usage Agent Flow Actions (Non-Billed) | cat_usageagentflowactionsnonbilled | Whole Number | Agent non billed usage from the usage metrics data from power platform admin center | Agent non billed usage from the usage metrics data from power platform admin center | V3 | Represents the non billing message for the feature utilized by the agent |
| 65 | Usage Classic Answer (Billed) | cat_usageclassicanswerbilled | Whole Number | Agent billed usage from the usage metrics data from power platform admin center | Agent billed usage from the usage metrics data from power platform admin center | V3 | Represents the billing message associated with the feature utilized by the agent |
| 66 | Usage Classic Answer (Non-Billed) | cat_usageclassicanswernonbilled | Whole Number | Agent non billed usage from the usage metrics data from power platform admin center | Agent non billed usage from the usage metrics data from power platform admin center | V3 | Represents the non billing message for the feature utilized by the agent |
| 67 | Usage Generative Answer (Billed) | cat_usagegenerativeanswerbilled | Whole Number | Agent billed usage from the usage metrics data from power platform admin center | Agent billed usage from the usage metrics data from power platform admin center | V3 | Represents the billing message associated with the feature utilized by the agent |
| 68 | Usage Generative Answer (Non-Billed) | cat_usagegenerativeanswernonbilled | Whole Number | Agent non billed usage from the usage metrics data from power platform admin center | Agent non billed usage from the usage metrics data from power platform admin center | V3 | Represents the non billing message for the feature utilized by the agent |
| 69 | Usage Text And Gen AI Tools Basic (Billed) | cat_usagetextandgenaitoolsbasicbilled | Whole Number | Agent billed usage from the usage metrics data from power platform admin center | Agent billed usage from the usage metrics data from power platform admin center | V3 | Represents the billing message associated with the feature utilized by the agent |
| 70 | Usage Text And Gen AI Tools Basic (Non-Billed) | cat_usagetextandgenaitoolsbasicnonbilled | Whole Number | Agent non billed usage from the usage metrics data from power platform admin center | Agent non billed usage from the usage metrics data from power platform admin center | V3 | Represents the non billing message for the feature utilized by the agent |
| 71 | Usage Text And Gen AI Tools Premium (Billed) | cat_usagetextandgenaitoolspremiumbilled | Whole Number | Agent billed usage from the usage metrics data from power platform admin center | Agent billed usage from the usage metrics data from power platform admin center | V3 | Represents the billing message associated with the feature utilized by the agent |
| 72 | Usage Text And Gen AI Tools Premium (Non-Billed) | cat_usagetextandgenaitoolspremiumnonbilled | Whole Number | Agent non billed usage from the usage metrics data from power platform admin center | Agent non billed usage from the usage metrics data from power platform admin center | V3 | Represents the non billing message for the feature utilized by the agent |
| 73 | Usage Text And Gen AI Tools Standard (Billed) | cat_usagetextandgenaitoolsstandardbilled | Whole Number | Agent billed usage from the usage metrics data from power platform admin center | Agent billed usage from the usage metrics data from power platform admin center | V3 | Represents the billing message associated with the feature utilized by the agent |
| 74 | Usage Text And Gen AI Tools Standard (Non-Billed) | cat_usagetextandgenaitoolsstandardnonbilled | Whole Number | Agent non billed usage from the usage metrics data from power platform admin center | Agent non billed usage from the usage metrics data from power platform admin center | V3 | Represents the non billing message for the feature utilized by the agent |
| 75 | Usage Data | cat_usagedata | Multiline Text | Agent usage data from the power platform admin center as json | Agent usage data from the power platform admin center as json | V3 | Agent usage data in json |

---

## Field derivation & detection rules

Below are concise detection rules for each derived or boolean field (refer to logical column names in parentheses).

- Agent ID (`cat_agentid`): Dataverse `bot.botid`.
- Name (`cat_name`): Dataverse `bot.name`.
- Type (`cat_type`): if the Template starts with `gpt` or Agent Created In is Copilot Studio Lite then `Declarative` else `Custom`.
- Environment Name (`cat_environmentname`): Power Platform for Admins V2 — `Retrieve a list of environments` output: `displayName`.
- Environment ID (`cat_environmentid`): Power Platform for Admins V2 — `Retrieve a list of environments` output: `id` (instance identifier).
- Environment Type (`cat_environmenttype`): Power Platform for Admins V2 — `Retrieve a list of environments` output: `type`.
- Description (`cat_description`): `botcomponent` where `componenttypename` = Custom GPT (15) → `description`.
- Instructions (`cat_instructions`): `botcomponent` (Custom GPT) → YAML `data.instructions`.
- Agent Created Date (`cat_agentcreateddate`): `bot.createdon`.
- Agent Modified Date (`cat_agentmodifieddate`): `bot.modifiedon`.
- Agent Created By (`cat_agentcreatedby`): `bot.createdby`.
- Agent Modified By (`cat_agentmodifiedby`): `bot.modifiedby`.
- Managed State (`cat_managedstate`): `bot.ismanaged` (managed vs unmanaged).
- Published (`cat_publishedcode`): true when `bot` contains a published timestamp.
- Published Date (`cat_publisheddate`): `bot.published` timestamp.
- Published By (`cat_publishedby`): `bot.publishedby`.
- Default Application ID (`cat_defaultapplicationid`): `bot.synchronizationstatus` JSON → `applicationId`.
- Uses Gen AI (`cat_usesgenaicode`): true if agent uses any of tools/actions, prompts, knowledge sources, MCP, customized responses, classic generative sources, AI knowledge, or has generative orchestration enabled.
- Orchestration Type (`cat_orchestrationtype`): `bot.configuration.GenerativeActionsEnabled` → `generative` else `classic`.
- Autonomous Agent (`cat_autonomousagentcode`): true when `botcomponent.componenttypename` = External Trigger (17) exists.
- Uses Enhanced Search Results (`cat_usesenhancedsearchresultscode`): `bot.configuration.isSemanticSearchEnabled` = true.
- Uses Tools (`cat_usestoolscode`): Topic v2 `botcomponent.data` contains `TaskDialog` entries.
- Uses AI Knowledge (`cat_usesaiknowledgecode`): `bot.configuration.useModelKnowledge` = true.
- Uses Knowledge Sources (`cat_usesknowledgesourcescode`): presence of KnowledgeSources `botcomponent` entries (e.g., `data.KnowledgeSourceConfiguration` or Bot File Attachment entries).
- Uses Classic Generative Answers Sources (`cat_usesclassicgenerativeanswerssourcescode`): Topic v2 `data.searchAndSummarizeContent` includes classic source types (publicdatasource, sharePointSearchDataSource, customdatasource, azureopenaionyourdatasource).
- Uses Prompts (`cat_usespromptscode`): Topic v2 `data` contains `InvokeAIBuilderModelAction` or `InvokeAIBuilderModelTaskAction`.
- Uses MCP (`cat_usesmcpcode`): Topic v2 `data` contains `kind: InvokeExternalAgentTaskAction`.
- Uses Customized Response (`cat_usescustomizedresponsecode`): Topic v2 `data` contains `kind: AnswerQuestionWithAI`.
- Uses Connector Maker Auth Context (`cat_usesconnectormakerauthcontextcode`): any `botcomponent.data.connectionProperties.mode` = `maker`.
- Uses Cloud Flow Auth Context (`cat_usescloudflowauthcontextcode`): derived from `processes.clientdata.connectionreferences` using `impersonation` and `runtimesource` rules (impersonation = {} or embedded runtimesource → maker; impersonation.source = invoker → invoker).
- End-User Authentication Type (`cat_enduserauthenticationtype`): `bot.authenticationmode`.
- Uses HTTP Requests (`cat_useshttprequestscode`): Topic v2 `data` contains `HttpRequestAction` entries.
- Uses Skills (`cat_usesskillscode`): Topic v2 `data` contains `InvokeSkillAction` entries.
- Knowledge Sources (`cat_knowledgesources`): raw `data.KnowledgeSourceConfiguration` from `botcomponent` (multi-line JSON/YAML).
- Classic Data Sources (`cat_classicdatasources`): Topic v2 `data.searchAndSummarizeContent` classic entries aggregated.
- Http Request Actions (`cat_httprequestactions`): Topic v2 `data` → `HttpRequestAction` configurations.
- Prompts (`cat_prompts`): Topic v2 `data` contains `InvokeAIBuilderModelAction` or `InvokeAIBuilderModelTaskAction` entries.
- Connections (`cat_connections`): aggregate from `botcomponent.data.connectionreference` + `connectionProperties.mode` and `processes.clientdata.connectionreferences` (api name, impersonation, runtimesource) to derive connection name and auth mode (maker/invoker).
- Agent Triggers (`cat_agenttriggers`): `botcomponent` rows where `componenttypename` = External Trigger (17) → `data.triggerConnectionType`.
- Usage Info: collected from Licensing API endpoints for entitlement and consumption reports.
- Uses Custom Knowledge Source (`cat_usescustomknowledgesourcecode`): Topic v2 `data` begins with `kind: AdaptiveDialog` and `beginDialog.kind: OnKnowledgeRequested`.
- Uses Deep Reasoning Models (`cat_usesdeepreasoningmodelscode`): `bot.configuration.optInUseLatestModels` = true.
- Uses File Input (`cat_usesfileinputcode`): `bot.configuration.isFileAnalysisEnabled` = true.
- Environment Url (`cat_environmenturl`): Power Platform for Admins V2 — `Retrieve a list of environments` output: instance URL.
- Is Transcript Available (`cat_istranscriptavailablecode`): true when records exist for the agent in `conversationtranscript`.
- Agent Created By ADID (`cat_agentcreatedbyadid`): `systemuser` table → ADID or Azure Object ID of the user who created the agent.
- Agent Test Configured (`cat_agenttestconfiguredcode`): true when test run exists in Agent Test Run and test case exists in Agent Test Case table for the agent (Copilot Studio Kit test automation).
- Last Usage Date (`cat_lastusagedate`): last usage date from usage metrics in Power Platform Admin Center.
- Last Usage Feature (`cat_lastusagefeature`): last usage feature from usage metrics in Power Platform Admin Center.
- Template (`cat_template`): `bot` table → identifies template and version used for bot default content.
- Usage Agent Action (Billed) (`cat_usageagentactionbilled`): agent billed usage from usage metrics in Power Platform Admin Center.
- Usage Agent Flow Actions (Billed) (`cat_usageagentflowactionsbilled`): agent billed usage from usage metrics in Power Platform Admin Center.
- Usage Classic Answer (Billed) (`cat_usageclassicanswerbilled`): agent billed usage from usage metrics in Power Platform Admin Center.
- Usage Generative Answer (Billed) (`cat_usagegenerativeanswerbilled`): agent billed usage from usage metrics in Power Platform Admin Center.
- Usage Text And GenAI Tools Basic (Billed) (`cat_usagetextandgenaitoolsbasicbilled`): agent billed usage from usage metrics in Power Platform Admin Center.
- Usage Text And GenAI Tools Premium (Billed) (`cat_usagetextandgenaitoolspremiumbilled`): agent billed usage from usage metrics in Power Platform Admin Center.
- Usage Text And GenAI Tools Standard (Billed) (`cat_usagetextandgenaitoolsstandardbilled`): agent billed usage from usage metrics in Power Platform Admin Center.
- Usage Agent Action (Non-Billed) (`cat_usageagentactionnonbilled`): agent non-billed usage from usage metrics in Power Platform Admin Center.
- Usage Agent Flow Actions (Non-Billed) (`cat_usageagentflowactionsnonbilled`): agent non-billed usage from usage metrics in Power Platform Admin Center.
- Usage Classic Answer (Non-Billed) (`cat_usageclassicanswernonbilled`): agent non-billed usage from usage metrics in Power Platform Admin Center.
- Usage Generative Answer (Non-Billed) (`cat_usagegenerativeanswernonbilled`): agent non-billed usage from usage metrics in Power Platform Admin Center.
- Usage Text And GenAI Tools Basic (Non-Billed) (`cat_usagetextandgenaitoolsbasicnonbilled`): agent non-billed usage from usage metrics in Power Platform Admin Center.
- Usage Text And GenAI Tools Premium (Non-Billed) (`cat_usagetextandgenaitoolspremiumnonbilled`): agent non-billed usage from usage metrics in Power Platform Admin Center.
- Usage Text And GenAI Tools Standard (Non-Billed) (`cat_usagetextandgenaitoolsstandardnonbilled`): agent non-billed usage from usage metrics in Power Platform Admin Center.
- UsageData (`cat_usagedata`): agent usage from usage metrics in Power Platform Admin Center as json.
- Agent Created by UPN (`cat_agentcreatedbyupn`): `systemuser` table → domainname of the user who created the agent.
- First Usage Date (`cat_firstusagedate`): first usage date from usage metrics in Power Platform Admin Center. Currently supports a maximum look-back of 180 days.
- First Usage Feature (`cat_firstusagefeature`): first feature used within the agent from usage metrics in Power Platform Admin Center. Currently supports a maximum look-back of 180 days.
- Uses Evaluation (`cat_usesevaluationcode`): true when `botcomponent` where `componenttypename` = Test Case and `componenttype` = 19 exists for the agent.
- Web Search Enabled (`cat_websearchenabledcode`): true when `botcomponent` where `componenttypename` = Custom GPT and `componenttype` = 15 contains `webBrowsing: true` in data.
- Agent Created In (`cat_agentcreatedin`): Copilot Studio or Copilot Studio Lite (M365 Copilot).
- Agent Schema Name (`cat_agentschemaname`): Dataverse `bot` table → `SchemaName`.
- HasPPACEnvMismatch (`cat_hasppacenvmismatchcode`): true if the agent is listed in One Inventory PPAC but not available in the environment.
- HasSysAdminAccess (`cat_hassysadminaccesscode`): true if the agent is accessible within the environment to fetch data for agent inventory.
- Location (`cat_location`): location of the agent (environment region).
- Model (`cat_model`): model the agent is using.

---

# Agent Usage History — Data Source

Overview
--------

This section documents the Agent Usage History table (`cat_agentusagehistory`) in Dataverse. It captures per-agent, per-feature, per-day usage metrics sourced from the Power Platform Admin Center.

| No | Column Name | Column Logical Name | Data Type | Source | Version | Description |
|---:|---|---|---|---:|:--:|---|
| 1 | Agent | cat_agent | Lookup | Derived: matched using `Resource Id` against Agent Details | | Lookup reference to the Agent Details record. |
| 2 | Agent ID | cat_agentid | Text | PPAC usage report → `Resource Id` column | | Unique identifier for the agent (botid). |
| 3 | Billed Copilot Credits | cat_billedcopilotcredits | Decimal | PPAC usage report → `Billed messages` column | | Billed copilot credits consumed by the agent. |
| 4 | Environment ID | cat_environmentid | Text | PPAC usage report → `Environment Id` column | | Unique identifier for the environment. |
| 5 | Feature Name | cat_featurename | Text | PPAC usage report → `Feature` column | | Name of the feature used by the agent. |
| 6 | Non-billed Copilot Credits | cat_nonbilledcopilotcredits | Decimal | PPAC usage report → `Non-billed messages` column | | Non-billed copilot credits for the agent. |
| 7 | Usage Date | cat_usagedate | DateTime | PPAC usage report → `Usage Date` column | | Date of the usage record. |

---

## Field derivation & detection rules

Below are concise detection rules for each field in the Agent Usage History table (refer to logical column names in parentheses).

- Agent (`cat_agent`): Derived — matched using PPAC report `Resource Id` against Agent Details records.
- Agent ID (`cat_agentid`): PPAC usage report → `Resource Id`.
- Billed Copilot Credits (`cat_billedcopilotcredits`): PPAC usage report → `Billed messages`.
- Environment ID (`cat_environmentid`): PPAC usage report → `Environment Id`.
- Feature Name (`cat_featurename`): PPAC usage report → `Feature`.
- Non-billed Copilot Credits (`cat_nonbilledcopilotcredits`): PPAC usage report → `Non-billed messages`.
- Usage Date (`cat_usagedate`): PPAC usage report → `Usage Date`.

---
