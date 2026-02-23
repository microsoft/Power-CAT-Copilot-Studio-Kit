# Life Sciences — Project Manager Multi-Agent Architecture

The **Life Sciences Project Manager Multi-Agent Architecture** is designed to reduce the administrative burden on Project Managers in the life sciences industry and improve the quality, speed, and regulatory compliance of project management deliverables. The solution applies Microsoft Copilot Studio, Power Platform, and Azure AI services to build a network of specialized AI agents — orchestrated by a central Project Manager Agent — that automate status reporting, meeting lifecycle management, stakeholder communications, risk management, and program planning.

The architecture is applicable across life sciences project management functions including clinical development, regulatory submissions, drug manufacturing, medical device programs, and commercial operations. The primary use case demonstrated in this article focuses on clinical trial program management — the most complex and compliance-intensive scenario.

By integrating with enterprise systems including Veeva Vault (QMS, CTMS, RIM), MS Project, Jira, SmartSheet, SAP, and ServiceNow, the architecture provides a comprehensive approach to managing life sciences projects — automating regulatory-grade workflows, enforcing audit-ready governance, and delivering AI-driven insights — all within the Microsoft ecosystem.

This article outlines the key components, workflows, agent details, data flows, and compliance considerations, offering a blueprint for implementing a robust project management support system in regulated life sciences environments.

---

## Architecture Diagram

![Architecture diagram illustrating the Life Sciences Project Manager Multi-Agent Architecture with orchestrator, five connected agents, AI services, enterprise integrations, data platform, performance monitoring, reporting, and governance layers.](Final%20Architecture/image.png)

*Download a [draw.io file](ProjectManager-Final.drawio) of this architecture.*

The architecture spans eight functional zones:

1. **User Channels & Triggers** — entry points for PM interaction
2. **Orchestration** — PM Orchestrator Agent routing and coordination
3. **Connected Agents** — five specialist sub-agents
4. **AI & Automation Services** — shared AI/ML and workflow layer
5. **Enterprise Integrations** — line-of-business system connectors
6. **Data Platform** — Microsoft Dataverse as structured data backbone
7. **Performance Monitoring** — observability and agent quality scoring
8. **Reporting & Visualization** — Power BI, Power Apps

---

## Scenario Details

### Business Problem

Project Managers in the life sciences industry face extreme administrative pressure driven by the volume of cross-functional coordination, regulatory scrutiny, and multi-vendor governance required across pharmaceutical, biotech, and medical device programs. Whether managing a clinical development program, a regulatory submission, a drug manufacturing scale-up, or a commercial launch, PMs must aggregate data from disparate enterprise systems, produce governance-grade reports, manage risk registers, coordinate across internal teams and external partners, and maintain full audit trails — all under strict GxP and regulatory compliance requirements.

Manual execution of these tasks leads to:

- **Delayed status reports** — weekly reports require aggregating data from 5–7 disparate systems (Jira, Veeva Vault, SmartSheet, MS Project, SAP), consuming 4–8 hours per report cycle, causing sponsor dissatisfaction and missed governance meetings.
- **Inconsistent meeting minutes** — governance meetings (steering committees, review boards, vendor oversight meetings) generate extensive minutes and action items tracked manually, leading to missed follow-ups, accountability gaps, and documentation that may not meet regulatory inspection requirements.
- **Stakeholder communication bottlenecks** — different stakeholders (executives, CROs, vendors, investigators, regulators) require different levels of detail and tone. Manual drafting and GDP compliance review creates delays.
- **Reactive risk management** — risk registers not updated in real time, leading to undetected program delays. By the time a risk surfaces in a periodic review, mitigation options may be limited.
- **Planning complexity** — change impacts (protocol amendments, scope changes, regulatory feedback) are not modelled proactively, causing unplanned schedule slippage and resource conflicts across programs.

### Solution Overview

The PM Multi-Agent Architecture addresses these problems by deploying a Copilot Studio Orchestrator Agent that receives all PM requests — whether typed in Teams, triggered by a schedule, or raised by an enterprise system event — and delegates to five specialist Connected Agents. Each agent is deeply integrated with the enterprise systems of record and produces audit-ready outputs:

- **Status Reports Agent** reduces report generation time from hours to minutes by automatically aggregating cross-system data and producing compliance-ready reports.
- **Meeting Management Agent** automates the full meeting lifecycle — scheduling, agenda creation, transcription, minutes drafting, document archival, and action item routing.
- **Stakeholder Comms Agent** generates audience-segmented, GDP-compliant communications with mandatory approval gates before external distribution.
- **Risk Management Agent** enables proactive, AI-driven risk identification and severity scoring using Microsoft Foundry, syncing CAPAs and quality events from Veeva Vault QMS in real time.
- **Project Planning Agent** provides AI-assisted planning with change impact modelling, milestone slippage prediction, automated WBS/RACI generation, and critical path monitoring.

### Business Value and Outcomes

- 70–80% reduction in status report preparation time.
- Automated MoM generation within 15 minutes of meeting conclusion with controlled document filing.
- Real-time risk scoring with predictive alerts 2–4 weeks ahead of risk materialization.
- 50% reduction in stakeholder communication cycle time with 100% GDP compliance rate.
- Unified PM Command Center providing cross-portfolio visibility.
- Full regulatory-grade audit trail across all agent interactions and decisions.

---

## Workflow

The following steps describe the end-to-end flow across all agents. Each numbered step corresponds to a zone in the architecture diagram.

### Step 1 — User Channels

The Life Sciences PM (or an automated system trigger) initiates a request via one of six entry channels:

- **Microsoft Teams**: Conversational interface for real-time agent interaction during project standups, governance meetings, or ad hoc queries.
- **Outlook Email**: Email-based triggers for automated report generation, meeting summaries, or stakeholder communication drafts.
- **Website / Portal**: Web-based interface for external stakeholders such as CRO partners or regulatory personnel.
- **Scheduled Trigger**: Time-based automation — weekly status reports, bi-weekly risk register reviews, monthly stakeholder newsletters.
- **Webhook / Agent SDK**: Event-driven triggers from enterprise systems (e.g., a new CAPA raised in Veeva Vault activates the Risk Management Agent).
- **Power Apps**: PM Command Center for operational actions, approvals, and escalation management.

### Step 2 — Orchestration (Project Manager Orchestrator Agent)

The **PM Orchestrator Agent** (Copilot Studio, Generative Orchestration enabled) receives the request. It performs five functions as shown in the architecture:

1. **Intent Recognition & Routing**: Classifies the PM's natural language request into one of five domains (reporting / meetings / communications / risk / planning) and routes to the appropriate Connected Sub-Agent.
2. **Agent Selection & Delegation**: Selects the best sub-agent based on intent and routes with full conversation context. Supports parallel delegation for independent tasks.
3. **Context & State Management**: Maintains multi-turn conversation state across sessions. References prior conversation history stored in Microsoft Dataverse.
4. **Response Aggregation & Delivery**: Collects outputs from delegated agents, synthesises a unified response, and delivers it back through the originating channel.
5. **Multi-Turn Conversation Handling**: Manages clarification loops when the PM's request is ambiguous or when additional input is required.

### Step 3 — Connected Agents Execute Tasks

The Orchestrator delegates to the appropriate Connected Sub-Agent. Five agents are available — Status Reports, Meeting Management, Stakeholder Comms, Risk Management, and Project Planning. See the [Connected Agents](#connected-agents-sub-agents) section for detailed flows.

### Step 4 — AI & Automation Services

Sub-agents execute tasks via shared AI and automation services:

- **LLM**: Content generation, summarization, and intent classification.
- **Azure AI Search**: RAG-based retrieval over SharePoint SOP library and Veeva Vault documents.
- **AI Builder**: Document processing and entity extraction.
- **Agent Flows / Power Automate**: Multi-step workflow automation for report generation, approvals, and data synchronization.
- **Agent Tools / Connectors**: Pre-built and custom connectors to enterprise systems.
- **MCP (Model Context Protocol)**: Real-time, bidirectional integration with external tools and data sources.
- **Knowledge Sources**: SOPs, protocols, regulatory guidelines indexed via Azure AI Search.

### Step 5 — Enterprise Integrations

Sub-agents retrieve and write data via enterprise system integrations:

| System | Integration Method | Data Provided |
|---|---|---|
| **Jira** | REST API / MCP | Sprint status, backlog, risk issues, task assignments |
| **SmartSheet** | REST API / Custom Connector | Project trackers, milestone sheets, resource plans |
| **Veeva Vault** | REST API / Custom Connector | Clinical documents, CAPAs, deviations, enrollment actuals |
| **SharePoint** | Graph API / Document Mgmt | Project documents, templates, portal content |
| **SAP** | OData API | Budget data, resource costs |
| **ServiceNow** | REST API / Custom Connector | IT incidents, change requests |
| **MS Teams** | Graph API | Meeting transcripts, chat history, channel posts |

### Step 6 — Data Platform (Microsoft Dataverse)

All agent state, project data, and operational records are persisted to **Microsoft Dataverse** — the central data backbone:

- **Agent State**: Execution context, conversation turn state, delegation history.
- **Project Data**: Aggregated project information from enterprise sources.
- **Conversations**: Full conversation transcripts for audit and compliance.
- **Status**: Real-time project status snapshots (RAG indicators, milestone completion).
- **Audit Trail**: Complete record of all agent actions, decisions, and data modifications.
- **Logs**: System logs, error logs, and performance telemetry.

### Step 7 — Performance Monitoring

Real-time observability across all agent interactions, health metrics, and operational KPIs:

- **Application Insights**: Telemetry, performance metrics, error tracking, agent response times, availability monitoring.
- **Advisor Analytics**: Agent performance scoring, optimization recommendations, usage patterns.
- **Conversational / Feedback Logs**: User satisfaction scores (thumbs up/down), conversation transcripts, feedback analysis, improvement tracking.
- **KPI Metrics**: Avg Response Time, Agent Accuracy %, Escalation Rate, User Satisfaction, Uptime SLA.

### Step 8 — Reporting

Unified reporting layer for decision support through Power BI dashboards and PM Command Center:

- **Operational Metrics**: CRO Deliverable Completion Rate, Study Budget Burn vs Forecast, Milestone Tracking, Enrollment Progress.
- **Project Dashboard**: Portfolio View, Health Indicators, RAG Status, Timeline View (MS Project), Executive Summary.
- **Clinical Trial Analytics**: Enrollment vs Target, Site Performance, Protocol Deviations, Safety Signals, CAPA Status Tracking.
- **PM Command Center (Power Apps)**: Unified operational interface for cross-project status, agent actions, and escalation management.
- **Key Dashboards**: Risk Heatmap, Status Board, Resource View, Comms Tracker, Meeting Logs, Trial Analytics.

---

## Connected Agents (Sub-Agents)

All five sub-agents are built as **Copilot Studio Connected Agents**, each with their own orchestration, tools, and knowledge sources.

---

### Agent 1 — Status Reports Agent

**Function**: Auto-generates clinical study status reports from Jira, Veeva Vault, MS Project & SmartSheet. Produces PDF / HTML outputs.

**Capabilities** (as shown in diagram): SmartSheet integration, Auto-Report generation, Templates.

**Dataflow:**
```
[Scheduled Trigger / User Request]
        │
        ▼
[Orchestrator: Intent = "Generate Status Report"]
        │
        ▼
[Status Reports Agent Activated]
        │
        ├──► [Jira] ──► Sprint status, task completion
        ├──► [Veeva Vault] ──► Document milestones, enrollment data
        ├──► [SmartSheet] ──► CRO deliverable completion, Gantt status
        └──► [MS Project] ──► Timeline, critical path
                │
                ▼
        [LLM: Summarize & Format using templates]
                │
                ▼
        [Output: PDF / HTML Report]
                │
                ├──► [SharePoint: Archive report]
                ├──► [Outlook: Distribute to stakeholders]
                └──► [Dataverse: Log report metadata]
```

**AI Services**: LLM (report drafting), Azure AI Search (retrieve templates from SharePoint)

**Connected Applications**: Jira, SmartSheet, Veeva Vault, MS Project, SharePoint, Outlook

**Output**: PDF / HTML status reports

**Processing Mode**: **Independent** — each report is self-contained. Multiple reports can run in parallel.

---

### Agent 2 — Meeting Management Agent

**Function**: Manages end-to-end lifecycle of clinical governance meetings. Produces MoM (Minutes of Meeting) and Action Tracker outputs.

**Capabilities** (as shown in diagram): Teams integration, Outlook integration, Scheduling, MoM generation.

**Dataflow:**
```
[Teams Meeting Completed / User Request]
        │
        ▼
[Orchestrator: Intent = "Generate MoM" or "Schedule Meeting"]
        │
        ▼
[Meeting Management Agent Activated]
        │
        ├──► [MS Teams] ──► Meeting transcript, attendees
        ├──► [Outlook] ──► Calendar availability, invites
        │
        ▼
[LLM: Extract decisions, action items, draft minutes]
        │
        ▼
[Output: MoM, Action Tracker]
        │
        ├──► [Dataverse: Store MoM, update action items]
        ├──► [Outlook: Distribute minutes to attendees]
        ├──► [Teams: Post summary in channel]
        └──► [SharePoint: Archive to document library]
```

**AI Services**: LLM (minutes drafting, action item extraction)

**Connected Applications**: MS Teams, Outlook, SharePoint

**Output**: MoM documents, Action Tracker

**Processing Mode**: **Sequential** — agenda creation → meeting → transcript processing → MoM generation → action item creation.

---

### Agent 3 — Stakeholder Communications Agent

**Function**: Audience-segmented clinical communications, GDP-approved before send, SharePoint portal updates. Produces Exec Summaries and Newsletters.

**Capabilities** (as shown in diagram): Segmentation, GDP Approved, Email Drafts, Summaries.

**Dataflow:**
```
[User Request / Scheduled Trigger]
        │
        ▼
[Orchestrator: Intent = "Stakeholder Communication"]
        │
        ▼
[Stakeholder Comms Agent Activated]
        │
        ├──► [Dataverse] ──► Project status, stakeholder segments
        ├──► [SharePoint] ──► Communication templates
        │
        ▼
[LLM: Generate audience-segmented content]
        │
        ▼
[GDP Approval Gate (Human-in-the-Loop: Thumbs Up / Down)]
        │
        ├── 👍 Approved ──► [Outlook: Distribute to recipients]
        │                    [SharePoint: Update portal content]
        │                    [Dataverse: Log approval record]
        │
        └── 👎 Rejected ──► [Agent: Revise based on feedback]
```

**AI Services**: LLM (communication drafting)

**Connected Applications**: Outlook, SharePoint, Dataverse

**Output**: Exec Summaries, Newsletters

**Processing Mode**: **Sequential with gate** — Draft → GDP Approval (must complete before proceeding) → Send → Archive. Will not proceed if rejected.

---

### Agent 4 — Risk Management Agent

**Function**: Analyze clinical trial risks using Microsoft Foundry and Veeva Vault integration. Produces Risk Heatmap and RAID Logs.

**Capabilities** (as shown in diagram): LLM, Veeva Vault, Risk Scoring, RAID Log.

**Dataflow:**
```
[Scheduled Trigger / Veeva Vault Event / User Request]
        │
        ▼
[Orchestrator: Intent = "Risk Assessment"]
        │
        ▼
[Risk Management Agent Activated]
        │
        ├──► [Veeva Vault] ──► CAPAs, deviations, quality events
        ├──► [Jira] ──► Risk-tagged issues, blockers
        ├──► [Azure AI Search] ──► Historical risk patterns
        │
        ▼
[Microsoft Foundry: Risk severity scoring (probability × impact)]
        │
        ▼
[LLM: RAID log narrative drafting]
        │
        ▼
[Output: Risk Heatmap, RAID Logs]
        │
        ├──► [Power BI: Update risk heatmap dashboard]
        ├──► [Dataverse: Update risk register]
        ├──► [SharePoint: File RAID log]
        └──► [Teams: Escalation alert (if high severity)]
```

**AI Services**: Microsoft Foundry (risk severity scoring), LLM (RAID log drafting), Azure AI Search (risk templates)

**Connected Applications**: Veeva Vault, Jira, Dataverse, Power BI, SharePoint

**Output**: Risk Heatmap, RAID Logs

**Processing Mode**: **Independent + Event-triggered** — operates autonomously. Can be triggered by events in Veeva Vault without PM prompt.

---

### Agent 5 — Project Planning Agent

**Function**: End-to-end clinical program planning. Timeline optimization and resource allocation. Produces Schedules, WBS, and RACI outputs.

**Capabilities** (as shown in diagram): Scheduling, WBS / RACI, Resources, Dependencies.

**Dataflow:**
```
[User Request / Scheduled Weekly]
        │
        ▼
[Orchestrator: Intent = "Project Planning"]
        │
        ▼
[Project Planning Agent Activated]
        │
        ├──► [MS Project] ──► Milestones, critical path, timeline
        ├──► [SmartSheet] ──► Resource availability, tracker data
        ├──► [Jira] ──► Sprint capacity, task status
        ├──► [SAP] ──► Budget allocation, resource costs
        │
        ▼
[LLM: Generate WBS / RACI / Schedule]
        │
        ▼
[Output: Schedules, WBS, RACI]
        │
        ├──► [MS Project: Update timeline]
        ├──► [SmartSheet: Update resource plan]
        ├──► [SharePoint: File RACI/WBS documents]
        ├──► [Dataverse: Store plan snapshot]
        └──► [Power BI: Update project dashboard]
```

**AI Services**: LLM (WBS/RACI drafting, schedule narrative), Azure AI Search (retrieve planning templates)

**Connected Applications**: MS Project, SmartSheet, Jira, SAP, SharePoint, Dataverse

**Output**: Schedules, WBS, RACI

**Processing Mode**: **Sequential** — scope definition → WBS → schedule → resource allocation → dependency mapping.

---

### Cross-Agent Dependencies

While agents are independently deployable, the orchestrator manages cross-agent dependencies:

- The **Status Reports Agent** may request data from the **Risk Management Agent** to include a risk summary section in the report.
- The **Meeting Management Agent** may trigger the **Stakeholder Comms Agent** to distribute MoM to external stakeholders.
- The **Project Planning Agent** may invoke the **Risk Management Agent** to assess risks for a proposed timeline change.
- The **Orchestrator** supports parallel delegation for independent tasks (e.g., generating a status report AND scheduling a meeting simultaneously).

---

## Agent Instructions

The following instructions can be used as a starting point for configuring the Project Manager Orchestrator Agent in Copilot Studio:

```copilot
You are a helpful, professional Life Sciences Project Manager Assistant that supports
Project Managers with GxP-compliant project management tasks across life sciences programs.

You coordinate five specialized agents:
- Status report generation (Status Reports Agent)
- Meeting management and MoM creation (Meeting Management Agent)
- Stakeholder communications (Stakeholder Comms Agent)
- Risk assessment and RAID log management (Risk Management Agent)
- Project planning, scheduling, and resource allocation (Project Planning Agent)

You integrate with Veeva Vault (QMS/CTMS/RIM), MS Project, Jira, SmartSheet, SAP,
ServiceNow, SharePoint, and Microsoft Teams to provide accurate, real-time project insights.

**Rules:**
- Always confirm the study/project identifier before executing any action.
- Validate user GxP role via Entra ID RBAC before routing — CRO users cannot access
  risk data for studies they are not assigned to.
- For status reports, ask for the reporting period and audience (sponsor, internal, CRO).
- For risk assessments, present the risk heatmap and ask for confirmation before
  updating the RAID log.
- All stakeholder communications must be reviewed and approved via GDP approval gate
  before distribution — the agent must not send any external communication without approval.
- Never disclose patient-level or unblinded clinical trial data.
- If Agent Quality Score (AQS) for any agent response is below the configured threshold,
  do not proceed — flag the response to the PM with an explanation and request clarification.
- For regulatory communications (IRB reports, FDA briefings), use AQS threshold of 0.90.
- All outputs must comply with GDP (Good Documentation Practice) standards.
- All outputs must be archived to SharePoint eTMF with version control.

**Constraints:**
- Operate only within the scope of project management functions.
- If asked about clinical/medical decisions, politely redirect to the medical team.
- Microsoft Foundry models (risk scoring, PDUFA prediction) are project management
  decision-support tools only — not medical devices or clinical decision support systems.
- Safety signal detection is out of scope — redirect to validated pharmacovigilance system.
```

---

## Knowledge Sources

As shown in the AI & Automation Services zone, **Knowledge Sources** are indexed via Azure AI Search and include:

- **Standard Operating Procedures (SOPs)**: Organizational SOPs for project management and documentation.
- **Clinical Trial Protocols**: Active study protocols from Veeva Vault.
- **Regulatory Guidelines**: ICH-GCP guidelines, FDA 21 CFR Part 11 requirements.
- **Historical Project Data**: Past project reports, risk logs, and meeting minutes stored in Dataverse and SharePoint.
- **Template Library**: Report templates, communication templates, RACI/WBS templates stored in SharePoint.

---

## Components

The following components are used in the Life Sciences Project Manager Multi-Agent Architecture.

### Orchestration & Agents

[**Microsoft Copilot Studio**](https://learn.microsoft.com/en-us/microsoft-copilot-studio/): Low-code platform for building, testing, and deploying the orchestrator and connected agents. Provides generative orchestration capabilities, multi-agent coordination via Connected Agents pattern, and topic-based routing. Chosen for its native integration with Microsoft 365, Dataverse, and Power Platform.

[**Microsoft Foundry (Microsoft Foundry)**](https://learn.microsoft.com/en-us/azure/ai-foundry/): Hosts custom predictive models. Used by Risk Management Agent (risk severity scoring) and Project Planning Agent (schedule analysis). Provides custom model training and deployment capabilities.

### AI & Generative Services

[**Azure OpenAI Service (GPT-4o)**](https://learn.microsoft.com/en-us/azure/ai-services/openai/): The LLM powering content generation, summarization, intent classification, and conversational interactions across all agents.

[**Azure AI Search**](https://learn.microsoft.com/en-us/azure/search/): Enables Retrieval-Augmented Generation (RAG) by indexing enterprise knowledge sources (SOPs, protocols, regulatory guidelines) and providing grounded, contextual responses.

[**AI Builder**](https://learn.microsoft.com/en-us/ai-builder/): Provides document processing, form recognition, and entity extraction capabilities.

### Automation & Integration

[**Power Automate Agent Flows**](https://learn.microsoft.com/en-us/power-automate/): The execution backbone for all five agents. Agent Flows are structured, rules-based workflows incorporating AI actions, optimized for compliance-critical processes. All scheduled triggers, event-based triggers, approval workflows, connector calls, and document filing operations run through Power Automate.

[**Agent Tools / Connectors**](https://learn.microsoft.com/en-us/connectors/): Pre-built and custom connectors enabling agent communication with Jira, SmartSheet, Veeva Vault, SAP, ServiceNow, and other enterprise systems.

[**Model Context Protocol (MCP)**](https://learn.microsoft.com/en-us/microsoft-copilot-studio/agent-mcp-overview): Agent-to-Agent communication protocol enabling the Orchestrator to discover and invoke sub-agent capabilities. Dataverse MCP Server (public preview) enables agents to query structured Dataverse data using natural language. Transport: Streamable HTTP.

### User Interface

[**Microsoft Teams**](https://learn.microsoft.com/en-us/microsoftteams/): Primary conversational interface for agent interactions.

[**Outlook**](https://learn.microsoft.com/en-us/graph/outlook-mail-concept-overview): Email-based channel for report distribution, meeting invites, and stakeholder communications.

**Website / Portal**: Web-based interface for external stakeholders.

[**Power Apps**](https://learn.microsoft.com/en-us/power-apps/): PM Command Center for operational actions and approvals.

### Data Platform

[**Microsoft Dataverse**](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/): Central data platform storing all agent state, project data, conversations, status, audit trail, and logs. As shown in the architecture diagram, Dataverse entities include: Agent State, Project Data, Conversations, Status, Audit Trail, and Logs.

### Enterprise System Integrations

As shown in the architecture diagram:

| System | Integration Method | Data Provided |
|---|---|---|
| **Jira** | REST API / MCP | Sprint status, backlog, risk issues, task assignments |
| **SmartSheet** | REST API / Custom Connector | Project trackers, milestone sheets, resource plans |
| **Veeva Vault** | REST API / Custom Connector | Clinical documents, CAPAs, deviations, regulatory docs |
| **SharePoint** | Graph API / Document Mgmt | Project documents, templates, portal content |
| **SAP** | OData API | Budget data, resource costs |
| **ServiceNow** | REST API / Custom Connector | IT incidents, change requests |
| **MS Teams** | Graph API / Chat / Meetings | Meeting transcripts, chat history, channel posts |

### Reporting

[**Power BI Dashboards**](https://learn.microsoft.com/en-us/power-bi/): As shown in the architecture diagram, the reporting layer includes:

- **Operational Metrics**: CRO Deliverable Completion Rate, Study Budget Burn vs Forecast, Milestone Tracking, Enrollment Progress (Clinical Trials).
- **Project Dashboard**: Portfolio View, Health Indicators, RAG Status, Timeline View (MS Project), Executive Summary.
- **Clinical Trial Analytics**: Enrollment vs Target, Site Performance, Protocol Deviations, Safety Signals, CAPA Status Tracking.
- **PM Command Center (Power Apps)**: Unified operational interface for cross-project status and agent actions.

**Key Dashboards**: Risk Heatmap, Status Board, Resource View, Comms Tracker, Meeting Logs, Trial Analytics.

### Platform Governance, Security & Compliance

As shown in the Governance bar of the architecture diagram:

- [**Entra ID**](https://learn.microsoft.com/en-us/entra/fundamentals/whatis): Identity and access management, RBAC, MFA.
- [**Purview**](https://learn.microsoft.com/en-us/purview/): Data governance, classification, and compliance management.
- [**App Insights**](https://learn.microsoft.com/en-us/azure/azure-monitor/app/app-insights-overview): Technical performance monitoring and telemetry.
- [**Responsible AI**](https://learn.microsoft.com/en-us/azure/ai-services/content-safety/): Guardrails and content safety filters on all agent outputs.
- [**PP Admin Center**](https://learn.microsoft.com/en-us/power-platform/admin/): DLP policies, environment management, capacity monitoring.
- [**Azure Key Vault**](https://learn.microsoft.com/en-us/azure/key-vault/): Secure storage for API keys, connection strings, and secrets.
- [**Azure DevOps CI/CD**](https://learn.microsoft.com/en-us/azure/devops/): ALM pipeline for solution lifecycle management (DEV → TEST → PROD).
- [**Audit Logging**](https://learn.microsoft.com/en-us/power-platform/admin/manage-dataverse-auditing): Tamper-evident audit trail for all agent actions and data changes.
- [**Managed Environments**](https://learn.microsoft.com/en-us/power-platform/admin/managed-environment-overview): Sharing limits, solution checker enforcement, environment separation.

---

## Data Architecture

### Volume and Format of Data

| Data Type | Source System | Format | Frequency |
|---|---|---|---|
| Milestone dates | MS Project | Structured (tasks, dates, % complete) | Weekly sync |
| Enrollment / site actuals | Veeva Vault | Structured (JSON via REST API) | Daily sync |
| CAPA / deviation records | Veeva Vault | Structured (JSON via REST API) | Event-triggered |
| Regulatory documents | Veeva Vault | Unstructured (PDF, Word) | On-demand |
| CRO deliverable tracker | SmartSheet | Structured (JSON via REST API) | Weekly sync |
| Sprint tasks | Jira | Structured (JSON via REST API) | Daily sync |
| Meeting transcripts | MS Teams | Unstructured (VTT, text) | Post-meeting |
| SOPs / templates | SharePoint | Unstructured (Word, PDF) | Static with versioned updates |
| Budget actuals | SAP | Structured (OData JSON) | Monthly |

### Static vs Dynamic Data Sources

| Category | Examples |
|---|---|
| **Static** | SOPs, regulatory templates, RACI/WBS templates, protocol documents, regulatory guidelines. Versioned and controlled. Used as RAG knowledge sources. |
| **Dynamic** | Enrollment actuals, CAPA status, Jira sprint tasks, SmartSheet trackers, MS Project milestones, risk register, meeting transcripts, conversation logs. Queried via live API calls. |

---

## Agent Quality Score (AQS)

The **Agent Quality Score (AQS)** is a composite pre-delivery gate applied by every agent before outputting a response. **If AQS falls below the configured threshold, the agent does not proceed** — it flags the response to the PM and requests clarification.

AQS is calculated from four components:

| Component | Weight |
|---|---|
| RAG Citation Quality (% of claims citing verified sources) | 30% |
| Confidence Score (LLM certainty) | 25% |
| Content Safety (Responsible AI filter pass/fail) | 25% |
| Grounding Rate (% supported by retrieved data) | 20% |

AQS thresholds are configurable per agent and per output type. Default: 0.75 for internal outputs, 0.90 for external regulatory communications. Outputs below threshold are blocked and require human review.

---

## Assumptions

### Regulatory & Compliance Assumptions

1. **Copilot Studio and Foundry should be compliant with GxP, HIPAA**: Microsoft Copilot Studio and Microsoft Foundry deployments are operated within a tenant configuration aligned to **21 CFR Part 11** (FDA electronic records) and **EMA Annex 11** (EU computerised systems). This includes audit trail logging of all agent interactions and decisions, data integrity controls (ALCOA+ principles), and change control procedures for agent topic/instruction modifications. Microsoft provides compliance commitments — customers are responsible for validating their specific configurations.

2. **HIPAA Compliance**: All components (Copilot Studio, Dataverse, Azure OpenAI, Azure AI Search, Power Automate, SharePoint) are deployed within a [HIPAA](https://learn.microsoft.com/en-us/compliance/regulatory/offering-hipaa-hitech)-compliant Microsoft 365 / Azure tenant with Business Associate Agreements (BAAs) executed with Microsoft. PHI encryption at rest and in transit, and minimum necessary access controls are enforced.

3. **GxP System Validation**: Power Platform environments (Test and Production) are validated. The ALM pipeline (DEV → TEST → PROD) enforces evaluation gates before any agent or flow change reaches production.

4. **Veeva Vault**: Veeva Vault is the primary QMS, CTMS, and RIM system of record. It is a validated GxP platform integrated via REST API / Custom Connector as shown in the architecture.

5. **Data Residency**: All data resides within the organization's designated geographic region (e.g., US, EU) in compliance with GDPR and data sovereignty requirements.

6. **Network Security**: All enterprise integrations (Jira, Veeva Vault, SmartSheet, SAP, ServiceNow) communicate over private endpoints or VPN-secured connections.

### Technical Assumptions

7. **Licensing**: Users hold Microsoft 365 E3 or E5 licenses with Copilot Studio capacity packs assigned. All Power Platform environments are **Managed Environments**. Premium connectors (Jira, SmartSheet, SAP, ServiceNow, custom connectors) require appropriate licensing.

8. **Enterprise System Availability**: All integrated enterprise systems provide API availability of ≥ 99.5% with documented rate limits.

9. **LLM Availability**: Azure OpenAI Service is provisioned with sufficient capacity to handle concurrent agent invocations without throttling.

10. **User Authentication**: All users authenticated via Microsoft Entra ID with MFA enabled.

11. **SharePoint Configuration**: SharePoint is configured with a controlled folder structure for version-controlled document storage.

12. **SAP Integration**: SAP is integrated via OData API as shown in the architecture. On-premises data gateway may be required if SAP is hosted on-premise.

---

## Considerations

These considerations implement the pillars of Power Platform Well-Architected, a set of guiding tenets that improve the quality of a workload. Learn more in [Microsoft Power Platform Well-Architected](https://aka.ms/powa).

### Reliability

The five-agent pattern ensures each agent is independently testable and deployable. If one agent encounters an issue, the others continue to operate independently. Implement error handling and retry logic in all connectors for enterprise system API failures.

### Security

Apply [record-level security in Dataverse](https://learn.microsoft.com/en-us/power-platform/admin/wp-security-cds#record-level-security-in-dataverse) to enforce study-level data isolation across all agent interactions.

Use [Dataverse auditing](https://learn.microsoft.com/en-us/power-platform/admin/manage-dataverse-auditing) to maintain audit trails of all agent actions, approval decisions, and data changes.

Follow [recommendations for monitoring and threat detection](https://learn.microsoft.com/en-us/power-platform/well-architected/security/monitor-threats).

### Operational Excellence

The architecture follows a DEV → TEST → PROD ALM pipeline with Azure DevOps CI/CD. Agent evaluation suites run in TEST with AQS baseline verification before promotion to production.

### Performance Efficiency

Power Automate flows with parallel branching handle multi-system data retrieval efficiently. Learn more in [Use an asynchronous flow pattern](https://learn.microsoft.com/en-us/power-automate/guidance/coding-guidelines/asychronous-flow-pattern).

Power BI dashboards use DirectQuery against Dataverse for real-time data in risk heatmaps and project tracking.

### Experience Optimization

The PM Command Center Power App is designed mobile-first for PMs frequently on-site. The Orchestrator supports multi-turn conversation handling — PMs can refine requests iteratively without restarting the workflow.

Learn more in [Introduction to conversational experiences](https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/cux-overview) and [Recommendations for designing conversational user experiences](https://learn.microsoft.com/en-us/power-platform/well-architected/experience-optimization/conversation-design).

---

## Responsible AI

**Privacy and security**: Patient and program data is protected by encryption and complies with [Health Insurance Portability and Accountability Act (HIPAA)](https://learn.microsoft.com/en-us/compliance/regulatory/offering-hipaa-hitech) requirements.

**Transparency**: Agent responses cite source documents and data fields. AQS scores are visible to users for responses below threshold.

**Fairness**: Communications are generated from structured templates and source data only, ensuring consistency across all stakeholders.

**Reliability and safety**: The AQS framework blocks agent outputs below quality thresholds. GDP approval gates prevent non-compliant content from reaching external stakeholders.

**Accountability**: Complete audit trails in Dataverse ensure every agent action is traceable. Human approval is required before delivery of critical outputs.

**Human-in-the-loop**: Stakeholder communications, risk escalations, and report publications require explicit PM approval (thumbs up) before delivery.

---

## ALM Pipeline

As shown in the architecture diagram, the solution follows a three-environment ALM pipeline:

| Environment | Type | Purpose |
|---|---|---|
| **DEV** | Unmanaged | Development and testing of agent topics, connectors, flows, and configurations. |
| **TEST** | Managed | Validation and evaluation. Agent evaluation suites (Evals) run here. AQS baseline verification. |
| **PROD** | Managed | Production deployment. All changes arrive via managed solutions through Azure DevOps CI/CD. |

**Pipeline Flow**: DEV → Export → TEST → Evals → PROD

---

## Related Resources

- [Microsoft Power Platform Well-Architected](https://learn.microsoft.com/en-us/power-platform/well-architected/)
- [Copilot Studio Guidance](https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/)
- [Power Platform Custom Connectors](https://learn.microsoft.com/en-us/connectors/custom-connectors/)
- [Microsoft Foundry](https://learn.microsoft.com/en-us/azure/ai-foundry/)
- [Azure OpenAI Service](https://learn.microsoft.com/en-us/azure/ai-services/openai/)
- [Power Automate](https://learn.microsoft.com/en-us/power-automate/)
- [Microsoft Dataverse](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/)
- [Power BI](https://learn.microsoft.com/en-us/power-bi/)
- [Microsoft Entra ID](https://learn.microsoft.com/en-us/entra/identity/)
- [Microsoft Purview — Compliance and Data Governance](https://learn.microsoft.com/en-us/purview/)
- [Dataverse — Row-Level Security](https://learn.microsoft.com/en-us/power-platform/admin/wp-security-cds)
- [Dataverse Auditing](https://learn.microsoft.com/en-us/power-platform/admin/manage-dataverse-auditing)
- [Azure Key Vault](https://learn.microsoft.com/en-us/azure/key-vault/)
- [Microsoft Responsible AI practices](https://www.microsoft.com/en-in/ai/responsible-ai)
- [Microsoft HIPAA BAA](https://learn.microsoft.com/en-us/compliance/regulatory/offering-hipaa-hitech)

---
