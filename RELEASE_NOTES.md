# Release notes

This page tracks major releases of the **Copilot Agent Kit** (formerly *Power CAT Copilot Studio Kit* / *Copilot Studio Accelerator*). Each release ships as a set of solutions attached to a corresponding [GitHub release](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/releases).

For upgrade steps, see the [installation instructions](./INSTALLATION_INSTRUCTIONS.md#upgrading-existing-solution). Every release requires [code components](https://learn.microsoft.com/power-apps/developer/component-framework/component-framework-for-canvas-apps#enable-the-power-apps-component-framework-feature) and [code apps](https://learn.microsoft.com/power-apps/developer/code-apps/overview#enable-code-apps-on-a-power-platform-environment) to be enabled in the environment before install.

> [!NOTE]
> As of the May 2026 release, the Kit is officially named **Copilot Agent Kit**. Earlier releases used *Copilot Studio Kit* or *Copilot Studio Accelerator*. The rename reflects the Kit's expanded scope across Copilot Studio, Microsoft 365 Copilot, Microsoft Agent 365, Azure AI Foundry, and other agent platforms.

## Release history

| Release | Published | Highlights |
| :-- | :-- | :-- |
| [June 2026](#june-2026) | 2026-07-09 | Test Automation pipeline for authenticated agents; Agent Insights Hub channel expansion; Agent Inventory Actions; Agent Library GCC/GCC High support; Usage Metrics folded into main solution |
| [mid-June 2026](#mid-june-2026) | 2026-06-18 | Custom agent templates in Agent Library |
| [May 2026](#may-2026) | 2026-06-08 | Rebrand to **Copilot Agent Kit**; Agent Metrics Dashboard; Conversation Analyzer Dashboard; Power Shield feature health views; Wave 2 Agent Library templates; Agent Review Tool CI/CD |
| [April 2026](#april-2026) | 2026-05-04 | New: Agent Library, Agent Debugger, Power Shield; Code App modernization; Agent Review Tool declarative-agent ZIP support |
| [March 2026](#march-2026) | 2026-03-13 | New: Agent Insights Hub, Component Library; Conversation KPI feedback data |
| [January 2026](#january-2026) | 2026-01-30 | Rubric management & AI-powered refinement; six-month usage range |
| [December 2025](#december-2025) | 2025-12-04 | Agent Review Tool UI/engine refresh; SharePoint File Sync scale to 500+ files; Agent Inventory tool & web-search fields |
| [October 2025](#october-2025) | 2025-11-03 | New: Compliance Hub; separate admin/maker landing pages; Microsoft Authentication for adaptive card actions |
| [September 2025](#september-2025) | 2025-09-12 | Microsoft Authentication in test automation; usage data in Agent Inventory; AI Builder credit reporting |
| [July 2025](#july-2025) | 2025-07-18 | Plan Validation; adaptive card testing (operators + AI); Key Vault support; Agent Value Summary Dashboard |
| [May 2025](#may-2025) | 2025-05-23 | Setup Wizard; Agent Inventory V2; multi-topic match; Conversation Analyzer (preview) |
| [April 2025](#april-2025) | 2025-04-07 | Multi-turn test automation; Agent Inventory (preview); Agent Review Tool |
| [March 2025](#march-2025) | 2025-03-05 | Improved token handling; authenticated-agent testing re-enabled |
| [February 2025](#february-2025) | 2025-02-12 | Webchat Playground; Adaptive Cards Gallery; Conversation KPIs GA |
| [December 2024](#december-2024) | 2024-12-24 | SharePoint sync for pages/filters; Prompt Advisor (preview) |
| [November 2024](#november-2024) | 2024-12-05 | Conversation KPIs (preview); SharePoint synchronization |
| [September 2024](#september-2024) | 2024-09-18 | Entra ID v2 SSO; multiple App Insights instances; retry logic |
| [July 2024](#july-2024) | 2024-07-03 | Initial release — automated testing framework |

---

## June 2026

Released **2026-07-09** · [GitHub release](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/releases/tag/CopilotAgentKitJune2026)

### Test Automation
- **Test Automation Pipeline Automation** for agents that require authentication — run test suites as part of your deployment and DevOps workflows. See [Automated Testing](./AUTOMATED_TESTING.md).
- **In-Feature Settings** for Advanced Testing provide guided configuration of connections, cloud flows, and environment variables directly inside the feature experience.

### [Agent Insights Hub](./AGENT_INSIGHTS_HUB.md)
- Agent Configuration filtering.
- Support for **Copilot Evaluation**, **Microsoft 365 Copilot**, and **SharePoint** channels.
- Improved channel filtering and handling of unknown / unmapped channels.
- Reporting simplified by removing Action ID from grids, exports, and drill-in views.

### [Agent Inventory](./AGENT_INVENTORY.md)
- **Agent Inventory Actions** — administrators can now take actions directly from the inventory grid.

### [Agent Library](./AGENT_LIBRARY.md)
- Agent template filtering.
- Improved **draft mode** with clear active/inactive status indicators.
- Support for **GCC** and **GCC High** environments.

### Solution packaging
- **Agent Usage Components** merged into the main Copilot Agent Kit solution — the separate `AgentInventoryUsage` add-on is no longer required.

### Fixes
- [#727 — Flow hard-coded to Commercial API (not GCC-compliant)](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/727)
- [#739 — Disabling "One Inventory" doesn't work in large tenants without customization](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/739)
- [#753 — Model (`cat_model`) is blank for all "Custom" agents](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/753)
- [#761 — Setup Wizard `Get Solution Flows Details` optimized to reduce execution timeouts](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/761)
- [#748 — Hard-coded commercial endpoints failed in GCC for Agent Library & Adaptive Card Gallery](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/748)

---

## mid-June 2026

Released **2026-06-18** · [GitHub release](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/releases/tag/CopilotStudioAccelerator-June2026)

### [Agent Library](./AGENT_LIBRARY.md)
- Support for **custom agent templates**.

---

## May 2026

Released **2026-06-08** · [GitHub release](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/releases/tag/CopilotStudioAccelerator-May2026)

### Rebranding
- **Copilot Studio Kit is now Copilot Agent Kit.** The new name reflects the Kit's expanding focus across Copilot Studio, Microsoft 365 Copilot, Microsoft Agent 365, Azure AI Foundry, and other agent-based platforms. Most documentation and assets still reference the previous name; the solutions and end-user experience have been updated to Copilot Agent Kit branding.

### Dashboards
- **Agent Metrics Dashboard** — makers and admins can build custom dashboards and forecasts from Copilot Agent Kit data.
- **Conversation Analyzer Dashboard** — at-a-glance view of analysis coverage, trends, sentiment, credit consumption, and key analysis results. See [Conversation Analyzer](./CONVERSATION_ANALYZER.md).

### [Power Shield](./POWER_SHIELD.md)
- **Feature Health & Settings Views** — guided setup, health monitoring, and configuration inside the feature experience.

### [Conversation KPIs](./CONVERSATION_KPI.md)
- New KPI coverage for **agent tools**, **knowledge files**, **autonomous agents**, and **connected agents**.

### [Agent Inventory](./AGENT_INVENTORY.md)
- New fields: **Uses Computer Use**, **Number of Evaluations**, **Agent Owning Business Unit**.

### [Agent Insights Hub](./AGENT_INSIGHTS_HUB.md)
- Insights for **autonomous agents**: run counts, success rates, execution duration.
- Visibility into **connected agents**: invocation counts, success rates.

### [Agent Library](./AGENT_LIBRARY.md) — Wave 2 templates
- **AI Learning Advisor** — personalized guidance for Microsoft AI, Copilot Studio, Power Apps, Power Automate, Dataverse, and Microsoft 365 Copilot.
- **Status Update Agent** — progress reports, accomplishments, and activity summaries from Microsoft 365 data.
- **SME Finder** — identifies subject matter experts across the organization and prepares outreach recommendations.
- **Project Delta Digest** — summarizes project activity, milestones, blockers, and emerging risks.
- **Personal News Digest** — personalized business update summaries from Microsoft 365 signals.

### [Conversation Analyzer](./CONVERSATION_ANALYZER.md)
- Migrated to a **Code App architecture**.

### [Compliance Hub](./COMPLIANCE_HUB.md)
- Fixed threshold configuration issues.

### Test Automation
- Automatically processes dialogs presented by the agent at the start of a test session — no more one-time manual setup per account and agent. See [Automated Testing](./AUTOMATED_TESTING.md).
- **File input support** in test cases — provide files as inputs to agents under test.

### [Agent Debugger](./AGENT_DEBUGGER.md)
- **Snapshots** support.
- **Agent Details** view.
- Direct **link to Agent**.

### [Agent Review Tool](./AGENTREVIEWTOOL_REFERENCE_GUIDE.md)
- **CI/CD pipeline integration** — automated agent reviews as part of deployment workflows. See the [Agent Review Pipeline — CI/CD setup guide](./agent-review-pipeline/docs/Agent%20Review%20Pipeline%20-%20CICD%20Setup%20Guide.md).

### Fixes
- [#695 — Agent Inventory incorrectly flagged "Use Gen AI = Yes" when Generative AI was disabled](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/695)
- [#678 — Agents Data Load (Child) flow reported failure after successful processing](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/678)

---

## April 2026

Released **2026-05-04** · [GitHub release](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/releases/tag/CopilotStudioAccelerator-April2026)

### New features
- **[Agent Library](./AGENT_LIBRARY.md)** — a curated set of pre-configured agent templates (both custom and declarative) for high-impact business scenarios. Custom agents such as *Know My Customer* and *Request Tracker* install directly into Copilot Studio or download for manual import. Declarative agents are built with the M365 VS Code extension and can be customized before installation. Templates are hosted in a public GitHub repository with live updates. Two new reusable components — *log chain of thoughts* and *save conversation history* — added to the [Component Library](./COMPONENT_LIBRARY.md).
- **[Agent Debugger](./AGENT_DEBUGGER.md)** — a diagnostic tool in the Copilot Agent Kit Admin app. Load any recorded conversation and inspect every decision the agent made: topics, actions, knowledge searches, timing data, and token consumption.
- **[Power Shield](./POWER_SHIELD.md)** — a governance tool for managing agent and connector access through an approval-based DLP policy workflow. Makers submit requests for custom DLP policies tied to specific projects (environment selection, connector and action requests, customizable questionnaire). Admins review, approve, and automatically provision DLP policies via Power Platform APIs. Includes notifications, comment threads, and withdraw/modify support.

### Modernized to Code Apps
- [Agent Value Summary Dashboard](./AGENT_VALUE_SUMMARY_DASHBOARD.md)
- [Prompt Advisor](./PROMPT_ADVISOR.md)
- [Automated Testing](./AUTOMATED_TESTING.md) landing page

### Enhancements
- [Agent Review Tool](./AGENTREVIEWTOOL_REFERENCE_GUIDE.md) — reviews **declarative agents from a ZIP file** with additional review patterns.
- [Conversation Analyzer](./CONVERSATION_ANALYZER.md) — export analysis data, delete previous analysis records, better error handling when the selected agent has no transcripts, and Next/Previous navigation in the detailed results view.
- **Selective Excel export** of test cases and in-product evaluations, covering both Copilot Agent Kit automated tests and Copilot Studio native evals.
- [Conversation KPIs](./CONVERSATION_KPI.md) now include user prompts, agent responses, feedback, and knowledge file insights (files surfaced, used, and cited).
- [Agent Inventory](./AGENT_INVENTORY.md) — base agent data population from PPAC Agents Inventory is now toggleable.

### Fixes
- [#665 — Conversation KPI generation failed on `dd.MM.yyyy` date format](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/665)
- [#648 — Setup Wizard flow links didn't navigate to flow in GCC High](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/648)
- [#319 — Microsoft Authentication for GCC tenants](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/319)
- [#661 — "Query Power Platform resources: Agents" failed in GCC](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/661)
- [#671 — Agent Owner field within inventory](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/671)
- [#417 — Include agent schema in inventory](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/417)
- [#575 — Inventory: show if agent uses "general knowledge" and "info from the web"](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/575)
- [#664 — Agent Inventory showing deleted agents](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/664)
- [#652 — Agent Data Load Grand Child response not JSON](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/652)
- [#650 — Retrieve environments failing for agent inventory data load](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/650)
- [#603 — Usage Data Load (GrandChild) HTTP Bad Request](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/603)
- [#628 — Agent Usage stopped generating reports](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/628)
- [#674 — Cannot have usage data for the agent](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/674)
- [#657 — Connection request for Power Platform Admin Centre](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/657)
- [#514 — Conversation ID not resolved when ConversationStart topic is disabled](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/514)

---

## March 2026

Released **2026-03-13** · [GitHub release](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/releases/tag/CopilotStudioAccelerator-March2026)

### New features
- **[Agent Insights Hub](./AGENT_INSIGHTS_HUB.md)** — monitor agent performance, usage metrics, and conversation analytics across your Copilot Studio agents.
- **[Component Library](./COMPONENT_LIBRARY.md)** — a collection of ready-to-use, pre-built components for Microsoft Copilot Studio.

### Enhancements
- [Conversation KPIs](./CONVERSATION_KPI.md) now surface feedback data when available.
- [Agent Inventory](./AGENT_INVENTORY.md) populates base agent data from PPAC Agents Inventory.

### Fixes
- [#584 — Compliance Scan flow binary incompatibility](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/584)
- [#580 — Missing Unquarantine button](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/580)
- [#598 — Conversation KPIs discrepancies with Copilot Studio Analytics](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/598)
- [#552 — Plan Validation "Pass threshold was not met (0/10)" — actual tools not detected](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/552)
- [#585 — Agents Data Load (GrandChild): `GetFeatureEnabledState` not supported](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/585)
- [#511 — Timeout with Agent Inventory Usage Data Load](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/511)
- [#608 — Default environment agent consumption missing](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/608)
- [#609 — Billed messages vs PPAC consumption mismatch](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/609)
- [#610 — Billed messages and PPAC billed message mismatch](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/610)
- [#618 — Agent Sync not updating after running Child flow](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/618)
- [#612 — Compliance Scan flow error](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/612)
- [#602 — Compliance Scan flow error in Copilot Studio](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/602)

---

## January 2026

Released **2026-01-30** · [GitHub release](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/releases/tag/CopilotStudioAccelerator-January2026)

### [Rubric Refinement](./RubricRefinement/01-rubrics-refinement-overview.md)
- **Rubric management** for AI grading instructions.
- **AI-powered rubric refinement workflow**.
- **Rubric selection and AI grading** for Test Automation (*Generative Answers* test type).

### [Agent Inventory](./AGENT_INVENTORY.md)
- Usage data range expanded to **six months**.

### Fixes
- [#463 — Compliance Hub `GetBotQuarantineStatus` failed in GCC custom page](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/463)
- [#486 — Conversation KPI generation failed on null reference / conversation ID length](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/486)
- [#509 — Compliance case inventory button missing label](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/509)
- [#515 — Increase test utterance field length beyond 2000 characters](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/515)
- [#519 — Compliance Hub comments input box too small](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/519)
- [#520 — Compliance Hub comments cut off in timeline](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/520)
- [#521 — Enforcement action shows choice ID instead of value](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/521)
- [#522 — Unformatted date shown in case details](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/522)
- [#523 — SLA deadline shows placeholder text](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/523)
- [#525 — Update Case flow fails on "unrelate violation" step](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/525)
- [#528 — Missing Power CAT Copilot Studio Kit security roles](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/528)
- [#533 — Conversation KPIs: chat history order incorrect and CSAT not populating](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/533)
- [#535 — Agent Inventory: skip disabled environments during data load](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/535)
- [#538 — Conversation KPI generation: skip failed records and update status on errors](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/538)
- [#539 — Usage data load: report download fails](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/539)
- [#569 — Conversation KPI data not syncing to Power BI report](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/569)

---

## December 2025

Released **2025-12-04** · [GitHub release](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/releases/tag/CopilotStudioAccelerator-December2025)

### Enhancements
- [Agent Review Tool](./AGENTREVIEWTOOL_REFERENCE_GUIDE.md): improved UI and engine; improved load performance for review details.
- [File Synchronization](./FILE_SYNCHRONIZATION.md): SharePoint File Sync now supports syncing **over 500 files**.
- [Agent Inventory](./AGENT_INVENTORY.md): **AI Prompts** recognized as tools; **Web Search** available in inventory; usage performance improvements.
- [Conversation KPIs](./CONVERSATION_KPI.md): corrected display where Conversation ID appeared as "deflection"; transcript merging updated to respect new inactivity thresholds.
- [Agent Value Summary Dashboard](./AGENT_VALUE_SUMMARY_DASHBOARD.md): corrected summary number inconsistencies.
- [Setup Wizard](./SETUP_WIZARD.md): dropdown control for Boolean values (replaces free-text).
- Localization updates for side navigation.

### Fixes
- [#433 — Generative Answer failure](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/433)
- [#453 — Inventory data question handling](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/453)
- [#269 — Agent Review Tool slow loading](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/269)
- [#345 — Conversation KPI "deflection" ID issue](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/345)
- [#439 — Web Search in inventory / Bing Usage compliance thresholds & email](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/439)
- [#450 — Web Search in inventory](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/450)
- [#441 — Tools not detected in inventory](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/441)
- [#445 — Agent Inventory console error](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/445)
- [#459 — Sync Agent button disabled](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/459)
- [#480 — Agent Value Summary number oddities](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/480)
- [#461 — Hard-coded AdminAlias in "Agent Compliance | Quarantine" flow](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/461)
- [#466 — Compliance Hub thresholds: additional filter operators](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/466)
- [#442 — Compliance Hub: don't add users to maker group automatically](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/442)

---

## October 2025

Released **2025-11-03** · [GitHub release](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/releases/tag/CopilotStudioAccelerator-October2025)

### New feature
- **[Compliance Hub](./COMPLIANCE_HUB.md)** — customizable agent compliance review process built on top of the Agent Inventory data model.

### Enhancements
- Separate landing pages for **administrators** and **makers** — simplified roles with increased data segregation for makers.
- Historical agent usage information in the [agent details view](./AGENT_INVENTORY.md).
- Agent configuration cloning.
- [Conversation Analyzer](./CONVERSATION_ANALYZER.md) prompt management improvements; improved conversation selection.
- Validation for tracked variables in [Conversation KPIs](./CONVERSATION_KPI.md).
- Secret masking (for example, in the agent configuration view).
- Complete agent response in test results — all messages received from the agent are shown.
- Adaptive card actions support for [Microsoft Authentication](./MICROSOFTAUTHENTICATION.md).
- Knowledge source support in Plan Validation ([Automated Testing](./AUTOMATED_TESTING.md)).

### Fixes
- [#327 — Inaccurate percentages in Agent Value Summary](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/327)
- [#314 — Conversation KPI report refresh error](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/314)

---

## September 2025

Released **2025-09-12** · [GitHub release](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/releases/tag/CopilotStudioAccelerator-September2025)

### Enhancements
- Support for [Microsoft Authentication](./MICROSOFTAUTHENTICATION.md) in test automation.
- Custom agent usage data available in [Agent Inventory](./AGENT_INVENTORY.md) (originally shipped as a separate optional solution; merged into the main solution in June 2026).
- Support for adaptive card actions in test automation.
- Test run results now include cost information for generative answers testing and adaptive card AI validation (AI Builder credits).

### Fixes
- [#250 — Flow "Global | Get Current Dataverse Url" fails to run](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/250)
- [#278 — Environment `Default-xxxxxxxxxx` cannot be linked](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/278)
- [#249 — Invalid Operation — Division by Zero](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/249)

---

## July 2025

Released **2025-07-18** · [GitHub release](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/releases/tag/CopilotStudioAccelerator-July2025)

### [Automated Testing](./AUTOMATED_TESTING.md)
- **Plan Validation** for custom agents with generative orchestration — evaluate whether expected tools were used in the dynamic plan.
- **Adaptive card testing with comparison operators** — makers can define string comparison operators for test cases.
- **Adaptive card testing with AI** — provide validation instructions used with a custom prompt.
- **Test case cloning** — accelerate creating variations of the same test case.
- **Key Vault support** for the user authentication secret in agent configuration.

### New feature
- **[Agent Value Summary Dashboard](./AGENT_VALUE_SUMMARY_DASHBOARD.md)** — classifies agents in the Agent Inventory by type, behavior, and value benefit.

### Other
- [SharePoint synchronization](./FILE_SYNCHRONIZATION.md) configuration validation.

### Fixes
- [#111 — Scheduled tests / trigger events](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/111)
- [#220 — Make KPI tiles clickable for drill-through filtering in Agent Inventory](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/220)
- [#223 — Error while using Setup Wizard](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/223)

---

## May 2025

Released **2025-05-23** · [GitHub release](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/releases/tag/CopilotStudioAccelerator-May2025)

### New features
- **[Setup Wizard](./SETUP_WIZARD.md)** — guided post-deployment configuration steps.
- **[Agent Inventory](./AGENT_INVENTORY.md) V2** — new fields added.
- **Multi-topic match** for test automation — for testing custom agents with generative orchestration. See [Automated Testing](./AUTOMATED_TESTING.md).
- **[Conversation Analyzer](./CONVERSATION_ANALYZER.md) (preview)** — uses AI to analyze conversation transcripts with preconfigured or custom prompts.

### Fixes
- [#190 — Unable to sync files across environments](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/190)
- [#165 — Multi-turn test result showed success when a critical step failed](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/165)
- [#118 — Conversation KPIs: SessionID not unique in Session Details](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/118)
- [#120 — Transcript WebChat control empty in Conversation KPIs](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/120)
- [#168 — Pagination missing in File Sync flow](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/168)
- [#180 — Error authenticating with Entra instead of Manual](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/180)

---

## April 2025

Released **2025-04-07** · [GitHub release](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/releases/tag/CopilotStudioAccelerator-April2025)

### New features
- **[Agent Inventory](./AGENT_INVENTORY.md) (preview)**.
- **[Agent Review Tool](./AGENTREVIEWTOOL_REFERENCE_GUIDE.md)**.

### Enhancements
- Multi-turn support for test automation ([Automated Testing](./AUTOMATED_TESTING.md)).
- New string comparison operators for the *Response Match* test type.
- Floating widget sample in the [Webchat Playground](./WEBCHAT_PLAYGROUND.md).

### Fixes
- [#92](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/92)

---

## March 2025

Released **2025-03-05** · [GitHub release](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/releases/tag/CopilotStudioAccelerator-March2025)

### Enhancements
- Improved token-handling mechanism for testing authenticated custom agents.
- **Re-enabled** testing of authenticated custom agents (disabled temporarily in February 2025).

### Fixes
- [#56 — Test run results now capture test case information at execution time](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/56)
- [#90 — Removed delay between batches (was causing issues with certain SKUs)](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/90)
- [#91 — Configurable delay for test cases](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/91)

> [!NOTE]
> Testing of authenticated custom agents requires **channel security** to be enabled.

---

## February 2025

Released **2025-02-12** · [GitHub release](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/releases/tag/CopilotStudioKit-February2025)  
An earlier February 2025 build was published on 2025-02-06 as [`CopilotStudioAccelerator-February2025`](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/releases/tag/CopilotStudioAccelerator-February2025) with the same feature set.

### New features
- **[Webchat Playground](./WEBCHAT_PLAYGROUND.md)** — easy-to-use UI to modify Copilot Studio Webchat styles.
- **[Adaptive Cards Gallery](./ADAPTIVE_CARDS_GALLERY.md)** — reusable adaptive card templates demonstrating the extensibility of adaptive cards.

### Enhancements
- [Conversation KPIs](./CONVERSATION_KPI.md) is **generally available** — performance optimized and preview limitations lifted.
- Feature details moved from the landing page into their own pages.
- The Kit now depends on components from the [Creator Kit](https://learn.microsoft.com/power-platform/guidance/creator-kit/setup) — see the [installation instructions](./INSTALLATION_INSTRUCTIONS.md).

> [!NOTE]
> Testing of authenticated agents was **temporarily disabled** in this release while improvements were finalized. It was re-enabled in the March 2025 release.

---

## December 2024

Released **2024-12-24** · [GitHub release](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/releases/tag/CopilotStudioAccelerator-December2024)

### Enhancements
- [SharePoint synchronization](./FILE_SYNCHRONIZATION.md) now includes **pages** and **filters**.
- **[Prompt Advisor](./PROMPT_ADVISOR.md) (preview)** — helps makers develop effective prompts while learning prompt engineering skills.

### Fixes
- [#84 — Copilot tests failing](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/84)

---

## November 2024

Released **2024-12-05** · [GitHub release](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/releases/tag/CopilotStudioAccelerator-November2024)

### New features
- **[Conversation KPIs](./CONVERSATION_KPI.md)** — track and analyze the performance of custom agents.
- **[SharePoint Synchronization](./FILE_SYNCHRONIZATION.md)** — configure periodic selective content synchronization from SharePoint into the custom agent knowledge base.

### Other
- Added unmanaged solution alongside the managed distribution.

### Fixes
- [#60 — Error using Application Insights ("Could not load file or assembly")](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/60)

---

## September 2024

Released **2024-09-18** · [GitHub release](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/releases/tag/CopilotStudioAccelerator-September2024)

### Enhancements
- Support for Copilot user authentication using **Microsoft Entra ID v2 (SSO)**.
- Relaxed deployment requirements — an App Insights connection is no longer required during installation.
- Support for **multiple App Insights** instances.
- Direct Line requests moved to Dataverse actions to avoid being unintentionally blocked by DLP policies.
- Simplified Copilot and test configuration — manually specified delays replaced with automatic retry logic.
- Transcript visualizer for test results enriched from Dataverse.

---

## July 2024

Released **2024-07-03** · [GitHub release](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/releases/tag/CopilotStudioAccelerator-July2024)

### First release
The initial release of the **Power CAT Copilot Studio Kit** — a set of capabilities to augment [Microsoft Copilot Studio](https://aka.ms/CopilotStudio). This first version focused on helping makers **test custom copilots** and use a large language model to **validate AI-generated content**.

See the [overview](./README.md), [prerequisites](./PREREQUISITES.md), and [installation instructions](./INSTALLATION_INSTRUCTIONS.md) for setup.
