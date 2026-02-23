# Life Sciences — Project Manager Multi-Agent Architecture

The **Life Sciences Project Manager Multi-Agent Architecture** is designed to reduce the administrative burden on clinical program managers and enhance the quality, speed, and compliance of project management activities across clinical trials. The solution applies Microsoft Copilot Studio, Power Platform, and Azure AI services to build a network of specialized AI agents — orchestrated by a central Project Manager Agent — that automate status reporting, meeting lifecycle management, stakeholder communications, risk management, and clinical program planning.

By integrating with enterprise systems including Veeva Vault (QMS, CTMS, RIM), MS Project, Jira, SmartSheet, SAP, and ServiceNow, the architecture provides a comprehensive, GxP-compliant approach to managing clinical trial data, automating regulatory-grade workflows, and delivering AI-driven insights — all within the Microsoft ecosystem.

This article outlines the key components, workflows, agent details, data flows, and compliance considerations, offering a blueprint for implementing a robust project management support system in regulated life sciences environments.

> [!TIP]
> This article describes a solution idea. Your cloud architect can use this guidance to help visualize the major components for a typical implementation of this architecture. Use this article as a starting point to design a well-architected solution that aligns with your workload's specific requirements.

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
8. **Reporting & Visualization** — Power BI, MS Project Roadmap, Power Apps

---

## Scenario Details

### Business Problem

Life Sciences project managers operating in clinical development face extreme administrative pressure. A typical Phase II/III clinical program may span 3–7 years, involve 50–200+ clinical sites across multiple countries, and require coordination among sponsors, CROs (Contract Research Organizations), Principal Investigators, IRBs/Ethics Committees, and Regulatory Authorities — while maintaining GCP compliance, tracking 200+ TMF documents, managing risk registers, and producing governance-grade reports on a weekly basis.

Manual execution of these tasks leads to:

- **Delayed status reports** causing sponsor dissatisfaction and missed governance meetings — weekly reports require aggregating data from 5–7 disparate systems (Jira, Veeva Vault, SmartSheet, MS Project, SAP), consuming 4–8 hours per report cycle.
- **Inconsistent meeting minutes** that fail GCP inspection requirements — governance meetings (steering committees, DSMB safety reviews, investigator meetings) generate extensive minutes and action items tracked manually, leading to missed follow-ups and accountability gaps.
- **Stakeholder communication bottlenecks** — different stakeholders (executives, CROs, investigators, regulators) require different levels of detail and tone. Manual drafting and GDP compliance review creates delays.
- **Reactive risk management** — risk registers not updated in real time, leading to undetected trial delays. By the time a risk surfaces in a periodic review, mitigation options may be limited.
- **Planning complexity** — protocol amendment impacts not modelled, causing unplanned schedule slippage. A single site activation delay can cascade across enrollment, data lock, and submission timelines.

### Solution Overview

The PM Multi-Agent Architecture addresses these problems by deploying a Copilot Studio Orchestrator Agent that receives all PM requests — whether typed in Teams, triggered by a schedule, or raised by an enterprise system event — and delegates to five specialist Connected Agents. Each agent is deeply integrated with the clinical systems of record and produces GxP-compliant, audit-ready outputs:

- **Status Reports Agent** reduces report generation time from hours to minutes by automatically aggregating cross-system data and producing GCP-compliant reports.
- **Meeting Management Agent** automates the full meeting lifecycle — scheduling, agenda creation, transcription, ICH E6(R3)-aligned minutes drafting, TMF archival, and CRO action item routing.
- **Stakeholder Comms Agent** generates audience-segmented, GDP-compliant communications with mandatory approval gates before external distribution.
- **Risk Management Agent** enables proactive, AI-driven risk identification and severity scoring using Azure AI Foundry, syncing CAPAs from Veeva Vault QMS in real time.
- **Project Planning Agent** provides AI-assisted planning with protocol amendment cascade impact modelling, PDUFA date slippage prediction, automated WBS/RACI generation, and critical path monitoring.

### Business Value and Outcomes

- 70–80% reduction in status report preparation time.
- Automated MoM generation within 15 minutes of meeting conclusion with eTMF filing.
- Real-time risk scoring with predictive alerts 2–4 weeks ahead of risk materialization.
- 50% reduction in stakeholder communication cycle time with 100% GDP compliance rate.
- Unified PM Command Center providing cross-portfolio visibility.
- Full 21 CFR Part 11 audit trail across all agent interactions and decisions.

---

## Workflow

The following steps describe the end-to-end flow across all agents. Each numbered step corresponds to a zone in the architecture diagram.

### Step 1 — User Initiates Request (User Channels)

The Life Sciences PM (or an automated system trigger) initiates a request via one of six entry channels:

- **Microsoft Teams** (primary): Conversational interface for real-time agent interaction during project standups, steering committee meetings, or ad hoc queries.
- **Outlook Email**: Email-based triggers for automated report generation, meeting summaries, or stakeholder communication drafts.
- **Website / Portal (Power Pages)**: Web-based interface for external stakeholders (CRO partners, Investigators) to interact with the agent or access published study updates without requiring a Teams license.
- **Scheduled Trigger (Power Automate)**: Recurrence-based automation — weekly status reports, bi-weekly risk register reviews, monthly Investigator newsletters.
- **Webhook / Agent SDK**: Event-driven triggers from enterprise systems (e.g., a new CAPA raised in Veeva Vault fires a webhook that activates the Risk Management Agent autonomously).
- **Power Apps — PM Command Center**: Mobile-first canvas app for Risk Triage, CAPA Acknowledgement, GDP Communication Sign-off, Resource Requests, and Regulatory Milestone Override.

### Step 2 — Orchestrator Classifies Intent and Validates Access

The **PM Orchestrator Agent** (Copilot Studio, Generative Orchestration enabled) receives the request. It performs five functions:

1. **Intent Recognition & Routing**: Classifies the PM's natural language request into one of five domains (reporting / meetings / communications / risk / planning) using the Generative AI Planner and routes to the appropriate Connected Sub-Agent.
2. **Agent Selection & Delegation**: Selects the best sub-agent based on intent and routes with full conversation context. Supports parallel delegation for independent tasks (e.g., generating a status report AND scheduling a meeting simultaneously).
3. **Context & State Management**: Maintains multi-turn conversation state across sessions. Passes conversation history to sub-agents automatically per Copilot Studio Connected Agent behaviour. References prior conversation history stored in Microsoft Dataverse.
4. **Response Aggregation & Delivery**: Synthesises sub-agent responses into a coherent PM-facing reply in Teams.
5. **Multi-Turn Conversation Handling**: Manages clarification loops when the PM's request is ambiguous, or when AQS falls below threshold and additional input is required.

Before routing, the Orchestrator validates the user's **GxP role via Microsoft Entra ID RBAC** — a CRO user cannot access risk data for studies they are not assigned to. Every routing decision is logged to Dataverse for 21 CFR Part 11 audit trail. The Orchestrator also supports **autonomous event-triggered execution** — it can proactively activate sub-agents when enterprise system events occur (e.g., new CAPA raised in Veeva Vault) without any user prompt.

### Step 3 — Connected Sub-Agents Execute Tasks

The Orchestrator routes to the appropriate Connected Sub-Agent, passing the full conversation history and context parameters automatically. See the [Connected Agents](#connected-agents-sub-agents) section for detailed flows per agent.

### Step 4 — AI & Automation Services Process Requests

The sub-agent executes its task via **Power Automate Agent Flows**, calling AI services as required: **Azure AI Foundry** (PDUFA date risk scoring, deviation severity prediction), **AI Builder** (document extraction from uploaded PDFs), **Azure OpenAI GPT-4o** (generative content drafting for minutes, reports, comms), and **Azure AI Search** (hybrid vector + BM25 retrieval over SharePoint SOP library and Veeva documents).

### Step 5 — Agent Quality Score (AQS) Gate

Before delivering any output to the PM or triggering an external action, each agent evaluates its response against the **Agent Quality Score (AQS)** threshold. **If AQS falls below the configured threshold, the agent does not proceed.** Instead it flags the low-confidence response to the PM with an explanation and requests clarification or additional input. This prevents hallucinated clinical data or ungrounded risk scores from reaching regulatory communications. See the [Agent Quality Score (AQS)](#agent-quality-score-aqs) section for full details.

### Step 6 — Enterprise System Data Retrieval and Write-back

Sub-agents retrieve and write data via enterprise system integrations: MS Project (IND/NDA milestones, Clinical Trial Master Schedule), Veeva Vault QMS/CTMS/RIM (CAPAs, enrollment actuals, regulatory documents), SmartSheet (CRO deliverables, site activation Gantt), Jira (CDM/biostatistics sprint tasks), and SAP (study budget actuals). See the [Enterprise System Integrations](#enterprise-system-integrations) section for authentication and connector details.

### Step 7 — GDP Approval Gate (Communications Agent Only)

For the **Stakeholder Communications Agent**, every outbound draft — Sponsor update, IRB report, Investigator newsletter, Regulatory Authority briefing — is routed through a mandatory **GDP-aligned Teams Approvals workflow** before any external send. The PM or Medical Director must approve. The approval decision (approver identity, timestamp, approved/rejected) is logged to Dataverse. If rejected, the agent returns the draft with reviewer comments for revision. The agent **will not send any external communication if this gate is not completed**.

### Step 8 — Thumbs Up / Down Feedback and Reinforcement Learning

Every agent response in the PM Teams interface includes a **thumbs up / thumbs down feedback mechanism**. Thumbs up signals a high-quality, accurate response. Thumbs down triggers a structured feedback form capturing: what was wrong (data incorrect / tone wrong / missing information / non-compliant format), and the correct expected output. This feedback is:

- Logged to Dataverse (`ls_AgentFeedback` table) with session ID, agent name, and AQS at time of response
- Reviewed weekly by the AI Operations team
- Used to **fine-tune agent prompts, adjust AQS thresholds, and retrain Azure AI Foundry models** in the next sprint
- Aggregated into the **GenAI Metrics Dashboard** as the GDP Compliance Rate and Grounding Rate KPIs

This constitutes a **human-in-the-loop reinforcement learning cycle** — agent quality improves continuously based on PM feedback without requiring full model retraining.

### Step 9 — Persist to Dataverse with Audit Trail

All agent state, conversation transcripts, risk register updates, stakeholder data, action logs, AQS scores, and feedback records are persisted to **Microsoft Dataverse** with full 21 CFR Part 11 compliant audit trail (who, what, when, previous value), row-level security enforcing study-level data isolation, and Microsoft Purview sensitivity labels applied to all clinical data records.

### Step 10 — Results Delivered and Reported

Results are returned to the PM via Teams chat. Dashboards are served via **Power BI** (DirectQuery from Dataverse — risk heatmaps, enrollment KPIs, CRO completion rates, RAG status), **MS Project Roadmap** (portfolio and timeline views), and **Word/PDF documents** filed to SharePoint eTMF (GCP-compliant minutes, status reports, RACI, RBM Plan).

### Step 11 — Governance and Observability

All platform operations are governed by **Microsoft Entra ID** (identity, RBAC), **Microsoft Purview** (21 CFR Part 11 / Annex 11 data classification and compliance), **Responsible AI Content Safety** guardrails (grounding verification, GDP compliance rate monitoring), **Azure Key Vault** (OAuth secrets for Veeva Vault and Jira connectors), **Azure DevOps CI/CD** (GAMP 5 change control with IQ/OQ/PQ release gates), and **Managed Environments** (Dev/Test/Prod separation).

---

## Connected Agents (Sub-Agents)

All five sub-agents are built as **Copilot Studio Connected Agents**, each with their own orchestration, tools, and knowledge sources.

---

### Agent 1 — Status Reports Agent

**Function**: Auto-generates GCP-compliant clinical study status reports covering IND/NDA/MAA regulatory milestone status, CRO deliverable completion, site activation KPIs, enrollment vs target, and protocol deviation trends. Distributes reports to sponsor, study team, and governance committees on schedule or on demand. Archives version-controlled reports to SharePoint eTMF.

**Agent Flow:**
```
PM request / Scheduled trigger (weekly/bi-weekly governance cadence)
  → Orchestrator routes to Status Reports Agent
  → Agent queries MS Project (IND/NDA milestones, critical path % complete)
  → Agent queries Veeva Vault CTMS (site activation count, enrollment actuals vs target)
  → Agent queries SmartSheet (CRO deliverable completion rate, Gantt status)
  → Agent queries Jira (CDM/biostat sprint task completion — if applicable)
  → AQS gate: score all retrieved data for completeness and grounding
  → GPT-4o drafts status report using GCP-compliant Word template from SharePoint
  → Power Automate → Outlook: distribute to sponsor and study team
  → Power Automate → SharePoint: archive to eTMF document library (version-controlled)
  → Post summary to Teams study channel
  → Dataverse: log report metadata and AQS score
  → 👍/👎 PM feedback captured → AQS updated
```

**Dataflow Diagram:**
```
[Scheduled Trigger / User Request]
        │
        ▼
[Orchestrator: Intent = "Generate Status Report"]
        │
        ▼
[Status Reports Agent Activated]
        │
        ├──► [MS Project] ──► IND/NDA milestones, critical path % complete
        ├──► [Veeva Vault CTMS] ──► Site activation count, enrollment actuals vs target
        ├──► [SmartSheet] ──► CRO deliverable completion rate, Gantt status
        └──► [Jira] ──► CDM/biostat sprint task completion
                │
                ▼
        [AQS Gate: Verify completeness and grounding]
                │
                ▼
        [GPT-4o: Draft report using GCP-compliant template]
                │
                ▼
        [Output: Word/PDF Clinical Study Status Report]
                │
                ├──► [SharePoint eTMF: Archive (version-controlled)]
                ├──► [Outlook: Distribute to sponsor & study team]
                ├──► [Teams: Post summary in study channel]
                └──► [Dataverse: Log report metadata + AQS]
```

**AI Services Used**: Azure OpenAI GPT-4o (report drafting), Azure AI Search (retrieve SOP templates from SharePoint knowledge base)

**Connected Applications**: MS Project (Native PA connector), Veeva Vault CTMS (Custom Connector — OAuth 2.0/OIDC), SmartSheet (Native PA connector), Jira REST API (Custom Connector — OAuth 2.0), SharePoint eTMF (Native), Outlook (Native)

**Output Format**: Word/PDF clinical study status report, Teams channel post summary

**Triggers**: Scheduled (weekly/bi-weekly governance cadence), On-demand via PM prompt

**Processing Mode**: **Independent** — each report generation is a self-contained operation. Multiple reports for different studies can run in parallel.

---

### Agent 2 — Meeting Management Agent

**Function**: Manages the end-to-end lifecycle of clinical governance meetings — DSMB (Data Safety Monitoring Board) safety reviews, Clinical Operations Reviews (COR), Site Initiation Visits (SIV), and Investigator kick-off meetings. Handles scheduling across sponsor, CRO, and site investigator calendars; generates GCP-compliant agendas and pre-read packs; transcribes meetings via Teams Intelligent Recap; drafts ICH E6(R3)-aligned minutes with decision log; archives to eTMF-structured SharePoint; extracts and routes CRO action items to MS Planner with deadline tracking.

**Agent Flow:**
```
Meeting request / SIV date confirmed in MS Project (event trigger)
  → Orchestrator routes to Meeting Management Agent
  → Agent queries MS Graph Calendar API: find availability across sponsor, CRO, investigator
  → Power Automate → MS Teams: create meeting with agenda (auto-drafted from SharePoint template)
  → Meeting occurs in Teams
  → Teams Premium Intelligent Recap generates transcript (VTT) + AI summary → stored in OneDrive
    [Alternative: Power Automate HTTP → Graph API GET /transcripts if Teams Premium unavailable]
  → Power Automate "When recording is ready" trigger fires
  → Transcript passed to Copilot Studio agent
  → AQS gate: verify transcript completeness and grounding before minute drafting
  → Agent drafts GCP-compliant minutes (attendees, decisions, action items) using GPT-4o
  → Power Automate → Teams Adaptive Card: PM approves minutes draft
  → Power Automate → SharePoint: file to eTMF Section 08 (Study Oversight) — version-controlled
  → Power Automate → MS Planner: create action items assigned to CRO contacts with due dates
  → Power Automate → Outlook: distribute minutes + action tracker to all attendees
  → 👍/👎 PM feedback captured → AQS updated
```

**Dataflow Diagram:**
```
[Teams Meeting Completed / SIV Date Confirmed / User Request]
        │
        ▼
[Orchestrator: Intent = "Generate MoM" or "Schedule Meeting"]
        │
        ▼
[Meeting Management Agent Activated]
        │
        ├──► [Teams Graph API] ──► Meeting transcript, attendees, recording
        ├──► [MS Graph Calendar API] ──► Availability across sponsor, CRO, investigator
        ├──► [Outlook Graph API] ──► Calendar invites
        │
        ▼
[AQS Gate: Verify transcript completeness]
        │
        ▼
[GPT-4o: Extract decisions, action items, draft ICH E6(R3)-aligned minutes]
        │
        ▼
[Teams Adaptive Card: PM Approves Minutes Draft]
        │
        ▼
[Output: GCP-Compliant MoM, Action Tracker]
        │
        ├──► [SharePoint eTMF: Section 08 — version-controlled]
        ├──► [MS Planner: Action items with CRO deadlines]
        ├──► [Outlook: Distribute minutes to all attendees]
        ├──► [Teams: Post summary in channel]
        └──► [Dataverse: Store MoM + AQS + audit record]
```

**AI Services Used**: Azure OpenAI GPT-4o (minutes drafting), Teams Premium Intelligent Recap (transcription), Azure AI Search (retrieve GCP minutes templates from SharePoint)

**Connected Applications**: MS Teams & Teams Premium (Native), MS Graph Calendar API (Native PA — HTTP action), SharePoint eTMF (Native), MS Planner (Native), Outlook (Native)

**Output Format**: GCP-compliant meeting minutes (Word/PDF), TMF-filed agenda + attendance record, action item tracker in MS Planner

**Triggers**: On-demand via PM prompt, Scheduled (recurring governance cadence), Event-based (SIV date confirmed in MS Project)

**Processing Mode**: **Sequential** — agenda creation → meeting → transcript processing → MoM generation → approval → TMF archival. Each step depends on the previous.

---

### Agent 3 — Stakeholder Communications Agent

**Function**: Drafts and distributes GDP-compliant, audience-segmented communications across the clinical trial ecosystem — Sponsor progress updates, IRB/Ethics Committee continuing review reports, CRO performance summaries, Principal Investigator newsletters (across 20–100+ sites), and Regulatory Authority briefing drafts (FDA Type B meeting requests, EMA safety signal updates). Enforces GDP-aligned Teams Approvals workflow before any external send. Archives approved communications to SharePoint with full version control.

**Agent Flow:**
```
PM request / Scheduled trigger (monthly newsletter) / Event (enrollment deviation threshold)
  → Orchestrator routes to Stakeholder Comms Agent
  → Agent queries Dataverse stakeholder register: retrieve audience segment
  → Agent queries Veeva Vault CTMS: enrollment actuals vs forecast
  → Agent queries SmartSheet: CRO deliverable completion status
  → Agent queries Jira: CDM/biostat task progress (for CRO technical update)
  → AQS gate: verify all source data is grounded before drafting
  → GPT-4o drafts audience-specific communication using approved templates
  → Power Automate → Teams Approvals: GDP mandatory approval gate
      PM / Medical Director reviews draft → Approves or Rejects with comments
      [AGENT DOES NOT PROCEED IF NOT APPROVED]
  → If approved:
      Power Automate → Outlook Graph Mail API: send personalised email per segment
      Power Automate → SharePoint: publish update to Investigator portal
      Power Automate → Dataverse: log approval record (approver, timestamp, version) — 21 CFR Part 11
  → Microsoft Forms: collect investigator/CRO feedback post-communication
  → 👍/👎 PM feedback captured → AQS + feedback log updated
```

**Dataflow Diagram:**
```
[User Request / Scheduled Trigger / Enrollment Deviation Event]
        │
        ▼
[Orchestrator: Intent = "Stakeholder Communication"]
        │
        ▼
[Stakeholder Comms Agent Activated]
        │
        ├──► [Dataverse] ──► Stakeholder register, audience segments
        ├──► [Veeva Vault CTMS] ──► Enrollment actuals vs forecast
        ├──► [SmartSheet] ──► CRO deliverable completion status
        └──► [SharePoint] ──► Communication templates, brand guidelines
                │
                ▼
        [AQS Gate: Verify source data grounding]
                │
                ▼
        [GPT-4o: Generate audience-segmented content]
                │
                ▼
        [GDP Approval Gate — Teams Approvals]
                │
        ┌───────┴───────┐
        │               │
   👍 Approved      👎 Rejected
        │               │
        ▼               ▼
  [Distribute]    [Revise based on
        │          reviewer comments]
        ├──► [Outlook: Personalised emails per segment]
        ├──► [SharePoint: Update Investigator portal]
        ├──► [Dataverse: 21 CFR Part 11 approval record]
        └──► [Microsoft Forms: Collect post-comms feedback]
```

**AI Services Used**: Azure OpenAI GPT-4o (communication drafting), Azure AI Search (retrieve SOP and regulatory briefing templates from SharePoint)

**Connected Applications**: Outlook — Send Email V2 via Agent Flow (Native), Teams Approvals GDP gate (Native), SharePoint Investigator Portal (Native), SmartSheet (Native), Veeva Vault CTMS (Custom Connector — OAuth 2.0/OIDC), Jira REST (Custom Connector — OAuth 2.0), Microsoft Forms (Native), Dataverse stakeholder register (Native)

**Output Format**: Audience-segmented emails (Sponsor / IRB / CRO / Investigator), SharePoint portal updates, GDP approval audit record in Dataverse

**Triggers**: Scheduled (monthly Investigator newsletter, quarterly IRB report), On-demand, Event-based (enrollment deviation exceeds threshold in Veeva Vault CTMS)

**Processing Mode**: **Sequential with gate** — Draft → GDP Approval gate (human-in-the-loop — must complete before proceeding) → Send → Archive. Will not proceed if approval is rejected.

---

### Agent 4 — Risk Management Agent

**Function**: Maintains an ICH E6(R3)-compliant risk register in Dataverse covering GCP/GMP protocol deviations, IMP (Investigational Medicinal Product) supply chain disruptions, regulatory approval risks (CRL probability, PDUFA date slippage), data integrity flags, and site performance risks. Syncs CAPA and QualityEvent records from Veeva Vault QMS via Custom Connector. Scores risk severity using Azure AI Foundry trained on historical trial deviation and delay data. Escalates critical risks via Teams Adaptive Cards with Acknowledge/Escalate actions. Publishes live risk heatmap and RAID log via Power BI embedded in Teams.

**Agent Flow:**
```
Scheduled weekly review / New CAPA raised in Veeva Vault (webhook trigger) / PM on-demand
  → Orchestrator routes to Risk Management Agent (or fires autonomously on event trigger)
  → Custom Connector: GET CAPAs, QualityEvents, deviation records from Veeva Vault QMS
  → Native Connector: GET milestone-linked tasks from MS Project (flag tasks at risk)
  → Native Connector: GET IMP resupply schedule from SmartSheet (flag stockout risk)
  → All retrieved risk data written to Dataverse ls_RiskRegister table
  → AQS gate: verify risk data completeness and source grounding
  → Azure AI Foundry custom model: score risk severity (probability × impact)
      [If AQS < threshold → flag to PM for manual review, do not auto-escalate]
  → Power BI DirectQuery: update live risk heatmap from Dataverse (embedded in Teams)
  → For risks scored HIGH:
      Teams Adaptive Card: escalation alert to PM + Medical Monitor
      Card includes: Risk ID, category, severity score, affected study, recommended action
      Buttons: [Acknowledge] [Escalate to Sponsor] [Open RAID Log]
  → PM action captured via Adaptive Card response → logged to Dataverse
  → Generate RAID log (Excel/Word) from Dataverse risk table → file to SharePoint
  → 👍/👎 PM feedback captured → AQS + Azure AI Foundry retraining queue updated
```

**Dataflow Diagram:**
```
[Scheduled Trigger (Weekly) / Veeva Vault Webhook / User Request]
        │
        ▼
[Orchestrator: Intent = "Risk Assessment"]
(or autonomous event-triggered activation)
        │
        ▼
[Risk Management Agent Activated]
        │
        ├──► [Veeva Vault QMS] ──► CAPAs, QualityEvents, deviation records
        ├──► [MS Project] ──► Milestone-linked tasks at risk
        ├──► [SmartSheet] ──► IMP resupply schedule (stockout risk)
        ├──► [Azure AI Search (RAG)] ──► Historical risk patterns, ICH E6(R3) templates
        └──► [Jira] ──► Risk-tagged issues, blockers
                │
                ▼
        [Dataverse: Write to ls_RiskRegister table]
                │
                ▼
        [AQS Gate: Verify completeness and grounding]
                │
                ▼
        [Azure AI Foundry: Risk severity scoring (probability × impact)]
                │
                ▼
        [GPT-4o: RAID log narrative drafting]
                │
                ├──► [Power BI: Update live risk heatmap (DirectQuery)]
                ├──► [Teams Adaptive Card: Escalation alert (if HIGH)]
                │    [Buttons: Acknowledge | Escalate to Sponsor | Open RAID Log]
                ├──► [SharePoint: File RAID log (Excel/Word)]
                └──► [Dataverse: Log AQS + PM action response]
```

**AI Services Used**: Azure AI Foundry (custom risk severity scoring model — NOT direct GPT-4o), Azure OpenAI GPT-4o (RAID log narrative drafting), Azure AI Search (retrieve ICH E6(R3) risk assessment templates)

**Connected Applications**: Veeva Vault QMS — CAPAs, QualityEvents, deviations (Custom Connector — OAuth 2.0/OIDC), MS Project — milestone risk flags (Native), SmartSheet — IMP resupply schedule (Native), Dataverse risk register (Native), Power BI risk heatmap (DirectQuery from Dataverse)

**Output Format**: Power BI risk heatmap (embedded Teams), RAID log (Excel/Word — SharePoint filed), Teams Adaptive Card escalation alerts

**Triggers**: Scheduled (weekly ICH E6(R3) risk reassessment), Event-based (new CAPA raised in Veeva Vault — webhook), On-demand

**Processing Mode**: **Independent + Event-triggered** — operates autonomously. A new CAPA in Veeva Vault triggers the agent without any PM prompt or dependency on other agents. Risk scores may inform other agents (e.g., Status Reports Agent includes risk summary).

---

### Agent 5 — Project Planning Agent

**Function**: Supports end-to-end clinical program planning — Integrated Development Plan (IDP) framework generation, Clinical Trial Master Schedule build and maintenance in MS Project, protocol amendment cascade impact modelling (IRB re-approval lead time, site retraining, consent form update requirements), resource allocation conflict detection across CRA/CRO/biostatistician pools, and PDUFA date delay risk prediction using Azure AI Foundry. Auto-generates RACI matrix, Risk-Based Monitoring (RBM) Plan, and Study Project Charter from SharePoint regulatory templates. Flags critical path slippage proactively to PM.

**Agent Flow:**
```
PM request (plan a new study / model amendment impact / check schedule health) / Scheduled weekly
  → Orchestrator routes to Project Planning Agent
  → Agent queries MS Project: retrieve Clinical Trial Master Schedule
  → Agent queries SmartSheet: retrieve site activation Gantt (planned vs actual)
  → Agent queries Jira: retrieve CDM/biostat sprint velocity and outstanding tasks
  → Agent queries Dataverse: retrieve ls_ProtocolAmendment table (amendment impact rules)
  → AQS gate: verify schedule data completeness before analysis

  [For PDUFA risk prediction:]
  → Azure AI Foundry model: predict PDUFA date slippage probability using:
      - Current enrollment velocity vs plan
      - Number of open protocol deviations (from Veeva QMS)
      - Outstanding database queries
      - Historical PDUFA outcomes for comparable programs
  → If slippage probability > threshold: Teams alert with recommended mitigation

  [For protocol amendment impact:]
  → Agent applies standard impact rules from Dataverse lookup:
      IRB re-approval = +6 weeks, site retraining = +2 weeks,
      consent update = +3 weeks per site, IMP reformulation = +12 weeks
  → Power Automate → MS Project: create amendment impact tasks, update milestones
  → Agent drafts amendment impact summary narrative

  [For document generation:]
  → GPT-4o + Word template from SharePoint:
      auto-draft RACI matrix, RBM Plan, or Study Project Charter
  → Power Automate → SharePoint: file to controlled document library

  → Power Automate → Veeva Vault RIM: sync planning risks affecting regulatory readiness
  → 👍/👎 PM feedback captured → AQS updated, AI Foundry retraining queue updated
```

**Dataflow Diagram:**
```
[User Request / Scheduled Weekly / Protocol Amendment Event]
        │
        ▼
[Orchestrator: Intent = "Project Planning"]
        │
        ▼
[Project Planning Agent Activated]
        │
        ├──► [MS Project] ──► Clinical Trial Master Schedule, milestones, critical path
        ├──► [SmartSheet] ──► Site activation Gantt, resource availability
        ├──► [Jira] ──► CDM/biostat sprint velocity
        ├──► [SAP OData API] ──► Budget allocation, resource costs
        └──► [Dataverse] ──► ls_ProtocolAmendment rules, resource register
                │
                ▼
        [AQS Gate: Verify schedule data completeness]
                │
                ▼
        [Azure AI Foundry: PDUFA slippage prediction]
        [GPT-4o: Generate WBS / RACI / RBM Plan / Amendment impact narrative]
                │
                ▼
        [Output: Schedules, WBS, RACI, RBM Plan]
                │
                ├──► [MS Project: Update Clinical Trial Master Schedule]
                ├──► [SmartSheet: Update resource plan]
                ├──► [Veeva Vault RIM: Sync regulatory readiness risks]
                ├──► [SharePoint: File RACI/RBM Plan to controlled library]
                ├──► [Dataverse: Store plan snapshot + AQS]
                └──► [Power BI: Update project dashboard]
```

**AI Services Used**: Azure AI Foundry (PDUFA date slippage probability model — trained on historical trial data), Azure OpenAI GPT-4o (RACI/RBM Plan/Charter drafting, amendment impact narrative), Azure AI Search (retrieve IDP and RBM Plan templates from SharePoint). MS Project scheduling engine handles critical path and resource levelling — not Copilot Studio.

**Connected Applications**: MS Project for the Web (Native), MS Project Roadmap — cross-study portfolio view (Native), SmartSheet (Native), Jira REST (Custom Connector — OAuth 2.0), Veeva Vault RIM (Custom Connector — OAuth 2.0/OIDC), SAP (OData API), SharePoint (Native), Dataverse (Native)

**Output Format**: Updated Clinical Trial Master Schedule (MS Project), RACI matrix + RBM Plan (Word — SharePoint filed), IDP framework draft, Teams alert for critical path deviations and PDUFA risk, WBS task creation in MS Project

**Triggers**: Scheduled (weekly schedule health check vs baseline), Event-based (protocol amendment logged in Dataverse, high-severity CAPA raised in Veeva Vault), On-demand

**Processing Mode**: **Sequential** — planning follows an inherent dependency chain: scope definition → WBS → schedule → resource allocation → dependency mapping. Protocol amendment impact modelling follows amendment type → standard impact rules → milestone update.

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
clinical trial Project Managers with GxP-compliant project management tasks.

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
- Azure AI Foundry models (risk scoring, PDUFA prediction) are project management
  decision-support tools only — not medical devices or clinical decision support systems.
- Safety signal detection is out of scope — redirect to validated pharmacovigilance system.
```

---

## Knowledge Sources

- **Standard Operating Procedures (SOPs)**: Organizational SOPs for project management, clinical trial conduct, and documentation — indexed in Azure AI Search with hybrid vector + BM25 retrieval and Semantic Ranker.
- **Clinical Trial Protocols**: Active study protocols from Veeva Vault, providing context for study-specific agent responses.
- **Regulatory Guidelines**: ICH E6(R3) (Good Clinical Practice), FDA 21 CFR Part 11, EMA Annex 11, ICH E2E guidelines indexed as knowledge sources.
- **Historical Project Data**: Past project reports, risk logs, and meeting minutes stored in Dataverse and SharePoint for pattern recognition and benchmarking.
- **Template Library**: GCP-compliant report templates, GDP communication templates, RACI/WBS/RBM Plan templates stored in SharePoint eTMF and referenced by agents.
- **SharePoint Semantic Index**: Out-of-the-box knowledge grounding for M365 content, providing additional RAG context across SharePoint document libraries.

---

## Components

The following components are used in the Life Sciences Project Manager Multi-Agent Architecture.

### Orchestration & Agents

[**Microsoft Copilot Studio**](https://learn.microsoft.com/en-us/microsoft-copilot-studio/): Low-code platform for building, testing, and deploying the orchestrator and connected agents. Provides generative orchestration capabilities, multi-agent coordination via Connected Agents pattern, and topic-based routing. Chosen for its native integration with Microsoft 365, Dataverse, and Power Platform.

[**Microsoft Foundry (Azure AI Foundry)**](https://learn.microsoft.com/en-us/azure/ai-foundry/): Hosts custom predictive models trained on historical clinical trial data. Used by Risk Management Agent (deviation severity scoring) and Project Planning Agent (PDUFA date slippage probability prediction). Azure AI Foundry is the correct component for custom model training and deployment — GPT-4o is not called directly for scoring tasks.

### AI & Generative Services

[**Azure OpenAI Service (GPT-4o)**](https://learn.microsoft.com/en-us/azure/ai-services/openai/): The generative language model powering all content drafting — status report narratives, meeting minutes, stakeholder communications, RACI and RBM Plan documents. Accessed via Copilot Studio's built-in Azure OpenAI integration. Authentication uses **Microsoft Entra ID Managed Identity** (not API Key) for GxP production compliance. Embeddings use `text-embedding-3-large` for semantic knowledge retrieval.

[**Azure AI Search**](https://learn.microsoft.com/en-us/azure/search/): Hybrid search (Vector + BM25) with Semantic Ranker over the SharePoint SOP library and Veeva Vault document index. Enables all agents to retrieve relevant GCP guidelines, regulatory templates, and SOPs using natural language queries. Configured to handle both conceptual and exact regulatory terminology searches.

[**AI Builder**](https://learn.microsoft.com/en-us/ai-builder/): Provides document processing and extraction models — used to extract structured data from uploaded CRO deliverable reports, protocol amendment PDFs, and site-submitted paper records that need to be digitised before agent processing.

### Automation & Integration

[**Power Automate Agent Flows**](https://learn.microsoft.com/en-us/power-automate/): The execution backbone for all five agents. Agent Flows are structured, rules-based workflows incorporating AI actions, optimized for compliance-critical processes. All scheduled triggers, event-based triggers, approval workflows, connector calls, and document filing operations run through Power Automate.

[**Agent Tools / Connectors**](https://learn.microsoft.com/en-us/connectors/):
- **Native PA Connectors**: MS Project, SmartSheet, SharePoint, Outlook, Teams, MS Planner, Microsoft Forms — available out-of-the-box.
- **Custom Connectors**: Jira REST API (OAuth 2.0) and Veeva Vault REST API (OAuth 2.0/OIDC → Session ID) — built using Custom Connector wizard with OpenAPI/Swagger import. Secrets stored in Azure Key Vault.

[**Model Context Protocol (MCP)**](https://learn.microsoft.com/en-us/microsoft-copilot-studio/agent-mcp-overview): Agent-to-Agent communication protocol enabling the Orchestrator to discover and invoke sub-agent capabilities. Dataverse MCP Server (public preview) enables agents to query structured Dataverse data using natural language. Transport: Streamable HTTP.

### User Interface

[**Microsoft Teams**](https://learn.microsoft.com/en-us/microsoftteams/): Primary conversational interface. Agent responses, Adaptive Card approval requests, risk escalation alerts, and meeting action items are all surfaced in Teams. Teams Premium provides Intelligent Recap for meeting transcription.

[**Power Apps — PM Command Center**](https://learn.microsoft.com/en-us/power-apps/): Mobile-first canvas app for PM action management: Risk Triage, CAPA Acknowledgement, GDP Communication Sign-off, Resource Requests, Regulatory Milestone Override.

[**Outlook**](https://learn.microsoft.com/en-us/graph/outlook-mail-concept-overview): Email-based interaction for scheduled status report distribution, meeting invite management, and GDP-approved stakeholder communication delivery. Integrated via Office 365 Outlook connector.

**Website / Portal (Power Pages)**: Web-based interface for external stakeholders (CRO partners, Investigators) to access published study updates without requiring a Teams license.

### Data Platform

[**Microsoft Dataverse**](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/): Central structured data platform for all agents. Provides row-level security enforcing study-level data isolation, 21 CFR Part 11 compliant auditing, and Microsoft Purview sensitivity labels. Dataverse Web API (OData v4) for all connector interactions. Dataverse Search provides AI-ready hybrid search over all tables.

**Key custom tables:**

| Table | Purpose | Used By |
|---|---|---|
| `ls_RiskRegister` | ICH E6(R3) risk records — ID, category, probability, impact, mitigation, owner | Risk Management Agent |
| `ls_StakeholderRegister` | IRB, CRO, Sponsor, Investigator contact register | Stakeholder Comms Agent |
| `ls_ProjectMilestone` | IND/NDA/PDUFA milestone tracking | Status Reports + Planning Agent |
| `ls_ProtocolAmendment` | Amendment impact rules by amendment type | Planning Agent |
| `ls_AuditLog` | 21 CFR Part 11 routing and action audit trail | All Agents |
| `ls_AgentFeedback` | Thumbs up/down feedback, AQS scores, session context | All Agents (reinforcement learning) |
| `conversationtranscript` | Native Copilot Studio conversation store | Orchestrator |

### Enterprise System Integrations

| System | API | Authentication | Connector Type | Scope |
|---|---|---|---|---|
| **Jira** (Atlassian) | REST API, HTTPS/443 | OAuth 2.0 | Custom Connector | CDM/biostatistics workstream tasks |
| **SmartSheet** | REST API, HTTPS/443 | OAuth 2.0 | Native PA Connector | Site activation Gantt, CRO deliverable tracker |
| **Veeva Vault** (QMS/CTMS/RIM/eTMF) | REST API, HTTPS/443 | OAuth 2.0/OIDC → Session ID | Custom Connector | CAPAs, deviations, enrollment actuals, regulatory docs |
| **SharePoint** | Graph API, CSOM, HTTPS/443 | M365 Auth | Native | eTMF folder structure, SOP library, investigator portal |
| **MS Teams** | Graph API, HTTPS/443 | M365 Auth | Native | Chat, meetings, Adaptive Cards, transcript retrieval |
| **SAP** | OData API, HTTPS/443 | SAP Auth | Native PA Connector | Study budget actuals — future phase |
| **ServiceNow** | REST API, HTTPS/443 | OAuth 2.0 | Native PA Connector | GxP IT incident → Risk Management flag |

### Reporting & Visualization

[**Power BI Dashboards**](https://learn.microsoft.com/en-us/power-bi/): Embedded in Microsoft Teams. All dashboards use **DirectQuery** against Dataverse (live data, not cached snapshots). Row-Level Security mirrors Dataverse study-level isolation. Key dashboards:

- **Risk Heatmap**: High/Medium/Low risks by category and study — fed by Risk Management Agent
- **Status Board**: IND/NDA milestone RAG status, CRO deliverable completion rate, enrollment progress — fed by Status Reports Agent
- **Resource View**: CRA/CRO/biostatistician allocation across studies — fed by Planning Agent
- **Comms Tracker**: GDP compliance rate, pending approvals, sent communication log — fed by Stakeholder Comms Agent
- **Meeting Logs**: Meeting frequency, action item completion rate, TMF filing compliance — fed by Meeting Management Agent
- **Trial Analytics**: Enrollment vs target, site performance, protocol deviations, CAPA status tracking

**Operational Metrics** (Power BI): CRO Deliverable Completion Rate, Study Budget Burn vs Forecast, Risk Score trend, Resource Utilization, Enrollment Progress.

**Project Dashboard** (split tools):
- Portfolio View + Timeline View → **MS Project Roadmap** (native scheduling tool)
- Health Indicators + RAG Status → **Power BI** (DirectQuery: Dataverse + MS Project)
- Executive Summary → **Word document** (auto-generated by Status Reports Agent → filed to SharePoint)

**GenAI Metrics Dashboard** (Power BI + Application Insights): Confidence Scores, Token Usage & Cost, Content Safety Flags, RAG Citation Quality, GDP Compliance Rate, Grounding Rate, Agent Response Latency, AQS Pass Rate.

> **Note on Safety Signals**: Power BI surfaces SAE (Serious Adverse Event) counts and trends for awareness only. Pharmacovigilance signal detection is a regulated activity governed by ICH E2E and must be conducted in a validated safety database (Veeva Vault Safety, Argus, or ARISg). This is outside the scope of the PM Agent architecture.

### Platform Governance, Security & Compliance

[**Microsoft Entra ID**](https://learn.microsoft.com/en-us/entra/fundamentals/whatis): Identity and access management. Enforces GxP RBAC (PM, CRA, Reg Affairs, CRO Partner, Sponsor roles), conditional access policies (MFA required for all clinical users), and Managed Identity for Azure service authentication.

[**Microsoft Purview**](https://learn.microsoft.com/en-us/purview/): Data governance and 21 CFR Part 11 / Annex 11 compliance. Sensitivity labels: *Confidential — Clinical Trial Data*, *Restricted — Regulatory Submission*, *Internal — CRO Confidential*. Auto-labelling policies detect and classify clinical data flowing through agent workflows.

[**Application Insights**](https://learn.microsoft.com/en-us/azure/azure-monitor/app/app-insights-overview): Technical performance monitoring — response latency, flow run success/failure rates, connector call telemetry. Provides non-GxP telemetry — GxP audit trail is maintained separately in Dataverse Audit and Purview Audit.

[**Responsible AI — Content Safety**](https://learn.microsoft.com/en-us/azure/ai-services/content-safety/): Guardrails and filters applied to all agent outputs. Prevents generation of misleading or non-compliant clinical content. Grounding verification ensures agents cite source data rather than generating unsupported claims.

[**Power Platform Admin Center — DLP Policies**](https://learn.microsoft.com/en-us/power-platform/admin/): Data Loss Prevention policies govern connector usage. Veeva Vault and Jira Custom Connectors are explicitly approved in the same DLP policy as SharePoint and Outlook. Dev/Test/Prod environment separation is enforced.

[**Azure Key Vault**](https://learn.microsoft.com/en-us/azure/key-vault/): Securely stores OAuth 2.0 client secrets for Veeva Vault and Jira Custom Connectors, SSL certificates, and encryption keys. Retrieved via Managed Identity — never hardcoded.

[**Azure DevOps CI/CD**](https://learn.microsoft.com/en-us/azure/devops/): Source control and ALM pipeline. GAMP 5-aligned change control: DEV → TEST (IQ/OQ/PQ) → PROD (Approve & Deploy gate). Every production change requires a linked QMS change control record.

[**Audit Logging — Dataverse Audit + M365 Compliance**](https://learn.microsoft.com/en-us/power-platform/admin/manage-dataverse-auditing): Tamper-evident audit trail satisfying 21 CFR Part 11: who accessed what data, when, and what changed (including previous values). M365 Compliance (Purview Audit) covers document access, email sends, and conversation history.

[**Managed Environments**](https://learn.microsoft.com/en-us/power-platform/admin/managed-environment-overview): Sharing limits restrict agent distribution to approved clinical users only. Solution Checker enforces quality standards. GxP access control prevents unapproved agents reaching production clinical environments.

---

## Data Architecture

### Volume and Format of Data

| Data Type | Source System | Volume | Format | Frequency |
|---|---|---|---|---|
| IND/NDA milestone dates | MS Project | Low (10–50 milestones per study) | Structured (tasks, dates, % complete) | Weekly sync |
| Site activation / enrollment actuals | Veeva Vault CTMS | Medium (20–200 sites per study) | Structured (JSON via REST API) | Daily sync |
| CAPA / deviation records | Veeva Vault QMS | Medium (50–500 records per study) | Structured (JSON via REST API) | Event-triggered |
| Regulatory documents | Veeva Vault RIM / eTMF | High (500–2,000 documents per study) | Unstructured (PDF, Word) | On-demand |
| CRO deliverable Gantt | SmartSheet | Low-Medium (100–500 rows) | Structured (rows/columns via REST API) | Weekly sync |
| CDM/biostat sprint tasks | Jira | Medium (100–1,000 issues per sprint) | Structured (JSON via REST API) | Daily sync |
| Meeting transcripts | Teams Premium / OneDrive | Low (1–5 meetings per week) | Unstructured (VTT transcript, text) | Post-meeting |
| SOPs / regulatory templates | SharePoint | Low (50–200 documents per study) | Unstructured (Word, PDF) | Static with versioned updates |
| Study budget actuals | SAP | Low (monthly financial close) | Structured (OData JSON) | Monthly |
| Status Reports (generated) | Agents → SharePoint | 4–8 per month per study | PDF / Word | Weekly / Bi-weekly |
| Risk Assessments | Agents → Dataverse | 50–500 risk items per study | JSON (Dataverse) | Daily scan + On-demand |
| Conversation Logs | Copilot Studio → Dataverse | 100–500 conversations per month | JSON (Dataverse) | Real-time |
| Audit Trail Records | Dataverse Audit | 10,000–100,000 per month | JSON (Dataverse) | Real-time |

### Static vs Dynamic Data Sources

| Category | Examples | Nature |
|---|---|---|
| **Static** | SOPs, regulatory templates, RACI/WBS/RBM Plan templates, SharePoint knowledge library, protocol documents, ICH-GCP guidelines, 21 CFR Part 11 requirements | Infrequent change. Versioned and controlled. Used as RAG knowledge sources for agents. Updated only when SOPs are revised or new regulatory guidance is issued. Indexed in Azure AI Search with quarterly re-indexing. |
| **Dynamic** | Enrollment actuals (Veeva CTMS), CAPA status (Veeva QMS), Jira sprint tasks, SmartSheet CRO tracker, MS Project milestone % complete, risk register (Dataverse), meeting transcripts, conversation logs | Change continuously during trial execution. Agents query these via live API calls or DirectQuery — never cache stale snapshots for regulatory outputs. |

### Sequential vs Independent Agent Execution

| Scenario | Execution Pattern | Detail |
|---|---|---|
| **Status Report generation** | Sequential | Agent first retrieves enrollment actuals → then milestone data → then CRO deliverable status → then generates report. Each step depends on the previous output. Multiple reports for different studies can run in parallel. |
| **Meeting lifecycle** | Sequential | Schedule → Agenda prep → Meeting → Transcription → Minutes drafting → Approval → TMF archival. Each step depends on the previous. |
| **Stakeholder comms** | Sequential with gate | Draft → GDP Approval gate (human-in-the-loop — must complete before proceeding) → Send → Archive. Will not proceed if approval is rejected. |
| **Risk escalation** | Independent + Event-triggered | Risk Management Agent operates independently and autonomously — a new CAPA in Veeva Vault triggers the agent without any PM prompt or dependency on other agents. |
| **Project Planning** | Sequential | Scope definition → WBS → Schedule → Resource allocation → Dependency mapping. Amendment impact follows amendment type → impact rules → milestone update. |
| **Multi-agent orchestration** | Independent delegation | Orchestrator delegates to sub-agents in parallel where tasks are independent (e.g., generating a status report AND scheduling a meeting simultaneously). |

---

## Agent Quality Score (AQS)

The **Agent Quality Score (AQS)** is a composite pre-delivery gate applied by every agent before outputting a response or triggering an external action. **If AQS falls below the configured threshold, the agent does not proceed** — it flags the low-confidence response to the PM with an explanation and requests clarification. This prevents hallucinated clinical data or ungrounded risk scores from reaching regulatory communications.

### AQS Calculation

| AQS Component | What It Measures | Weight |
|---|---|---|
| **RAG Citation Quality** | % of response claims citing verified source documents | 30% |
| **Confidence Score** | LLM certainty of generated content | 25% |
| **Content Safety** | Responsible AI filter pass/fail status | 25% |
| **Grounding Rate** | % of response supported by retrieved data (not hallucinated) | 20% |

### AQS Thresholds and Actions

| AQS Range | Status | Action |
|---|---|---|
| **0.90–1.00** | Excellent | Agent operates autonomously. Outputs delivered directly to users. Required threshold for regulatory communications (IRB reports, FDA briefings). |
| **0.75–0.89** | Good | Agent operates normally. Default threshold for internal outputs (status reports, meeting minutes, risk summaries). Periodic spot-checks by PM. |
| **0.60–0.74** | Warning | Agent outputs require PM review before delivery. Alert sent to admin. Agent flags response with explanation. |
| **Below 0.60** | Critical | Agent outputs are **blocked from delivery**. All responses require mandatory human review. Incident raised for investigation. Agent may be temporarily disabled pending remediation. |

AQS thresholds are configurable per agent and per output type (e.g., 0.90 for external regulatory communications, 0.75 for internal summaries).

### AQS Monitoring

AQS metrics are surfaced through:

- Real-time AQS scores per agent in the **Advisor Analytics** dashboard.
- AQS trend charts (7-day, 30-day rolling averages) in **Power BI**.
- Automated alerts when any agent's AQS drops below the configured threshold.
- Weekly AQS summary reports distributed to the PM and AI Operations team.
- Aggregated into the **GenAI Metrics Dashboard** alongside GDP Compliance Rate and Grounding Rate.

### Key Performance Indicators

| KPI | Target | Monitored By |
|---|---|---|
| Avg Response Time | < 10 seconds | Application Insights |
| Agent Accuracy % | > 90% (based on thumbs up feedback rate) | Advisor Analytics |
| Escalation Rate | < 5% of requests require human intervention | Conversational Logs |
| User Satisfaction | > 4.0/5.0 (based on feedback) | Conversational Logs |
| Uptime SLA | 99.9% | Application Insights |
| AQS Pass Rate | > 95% (< 5% of responses fall below threshold) | Dataverse ls_AgentFeedback |
| GDP Compliance Rate | 100% (all external comms go through approval gate) | Dataverse ls_AuditLog |
| Grounding Rate | > 90% of agent responses cite source documents | GenAI Metrics Dashboard |

---

## Assumptions

### Regulatory & Compliance Assumptions

1. **Microsoft Copilot Studio GxP Compliance**: Copilot Studio deployments are operated within a tenant configuration aligned to **21 CFR Part 11** (FDA electronic records), **EMA Annex 11** (EU computerised systems), and **ICH E6(R3)** (Good Clinical Practice). This includes full audit trail logging of all agent interactions and decisions, electronic signature support for approval workflows, data integrity controls (ALCOA+ principles: Attributable, Legible, Contemporaneous, Original, Accurate), and change control procedures for agent topic/instruction modifications. Microsoft provides compliance commitments — customers are responsible for validating their specific configurations.

2. **Azure AI Foundry GxP Compliance**: Azure AI Foundry deployments meet GxP validation requirements for AI/ML models used in risk scoring and PDUFA date prediction, including model validation documentation and version control, explainability of model predictions for regulatory audit, and segregation of development and production model environments. Azure AI Foundry models are **not** positioned as medical devices or clinical decision support tools — they are project management decision aids. All clinical decisions remain with qualified medical and regulatory personnel.

3. **HIPAA Compliance**: All components (Copilot Studio, Dataverse, Azure OpenAI, Azure AI Search, Power Automate, SharePoint) are deployed within a HIPAA-compliant Microsoft 365 / Azure tenant with Business Associate Agreements (BAAs) executed with Microsoft, PHI (Protected Health Information) encryption at rest and in transit, minimum necessary access controls, and de-identification of patient data before agent processing. No patient-identifiable information (PHI) is processed by any agent — all individual patient data remains in Veeva Vault CTMS and validated clinical systems. Only aggregate counts and metadata flow into Dataverse.

4. **GxP System Validation**: Power Platform environments (Test and Production) are validated under **GAMP 5** principles. The ALM pipeline (DEV → TEST → PROD) enforces IQ/OQ/PQ qualification gates before any agent or flow change reaches production clinical users.

5. **Veeva Vault**: Veeva Vault is the primary QMS, CTMS, and RIM system of record. It is a validated GxP platform. The Power Platform Custom Connector uses OAuth 2.0/OIDC → Session ID authentication. No patient-identifiable data is stored outside of Veeva Vault.

6. **Data Residency**: All data resides within the organization's designated geographic region (e.g., US, EU) in compliance with GDPR, data sovereignty requirements, and regional regulatory mandates.

7. **Network Security**: All enterprise integrations (Jira, Veeva Vault, SmartSheet, SAP, ServiceNow) communicate over private endpoints or VPN-secured connections, not over the public internet.

### Technical Assumptions

8. **Licensing**: Users hold Microsoft 365 E3 or E5 licenses with Copilot Studio capacity packs assigned. **Teams Premium** is licensed for users requiring meeting transcription (Intelligent Recap). All Power Platform environments are **Managed Environments** (Power Platform Premium). Premium connectors (Jira, SmartSheet, SAP, ServiceNow, custom connectors) require appropriate licensing.

9. **Enterprise System Availability**: All integrated enterprise systems provide API availability of ≥ 99.5% with documented rate limits.

10. **LLM Availability**: Azure OpenAI Service (GPT-4o) is provisioned with sufficient Tokens-Per-Minute (TPM) capacity. Provisioned Throughput Units (PTUs) are recommended for production workloads. Authentication uses Managed Identity — not API Key.

11. **User Authentication**: All users authenticated via Microsoft Entra ID with MFA enabled. Service-to-service authentication uses managed identities or service principals with certificate-based credentials.

12. **SharePoint Configuration**: SharePoint is configured with an **eTMF-aligned folder structure** (ICH E6 / DIA Reference Model sections) for controlled document storage.

13. **SAP Integration**: SAP integration (study financials) is a future phase deliverable and may require on-premises data gateway if SAP is hosted on-premise.

---

## Considerations

These considerations implement the pillars of Power Platform Well-Architected. Learn more in [Microsoft Power Platform Well-Architected](https://aka.ms/powa).

### Reliability

**Design for GxP validation**: Allocate responsibilities between agents and connectors to avoid unnecessary complexity in any single agent. The five-agent pattern ensures each agent is independently testable, validatable, and deployable through the GAMP 5 ALM pipeline. If the Risk Management Agent encounters an issue, the Status Reports Agent and Meeting Management Agent continue to operate independently.

**AQS threshold design**: Configure AQS thresholds conservatively for regulatory outputs (0.90 for external communications, 0.75 for internal summaries) to minimise the risk of non-compliant outputs reaching clinical or regulatory stakeholders.

**Handle Veeva Vault session timeout**: The Veeva Vault Custom Connector uses session-based authentication that can timeout. Implement session refresh logic in Power Automate flows (re-authenticate before each API call sequence) to prevent flow failures in long-running batch operations.

**Test for resiliency and availability**: Implement error handling and retry logic in all connectors. Configure Power Automate flows with exponential backoff retry policies for transient failures from enterprise system APIs.

**Design for redundancy**: Dataverse provides built-in high availability. Azure OpenAI Service should be deployed with regional failover. Knowledge sources in Azure AI Search should be replicated across availability zones. Uptime SLA targets of 99.9% should be configured with alerting for degradations.

### Security

**Apply record-level security in Dataverse** to enforce study-level data isolation across all agent interactions. Implement Business Unit and Team-based security models aligned with organizational hierarchy. Learn more in [record-level security in Dataverse](https://learn.microsoft.com/en-us/power-platform/admin/wp-security-cds#record-level-security-in-dataverse).

**Maintain 21 CFR Part 11 compliant audit trails** using [Dataverse auditing](https://learn.microsoft.com/en-us/power-platform/admin/manage-dataverse-auditing) — tamper-evident records of all risk register changes, approval decisions, and agent outputs.

**Protect API credentials** — store all OAuth secrets for Veeva Vault and Jira Custom Connectors in [Azure Key Vault](https://learn.microsoft.com/en-us/azure/key-vault/) accessed via Managed Identity. Never use API Key authentication in production GxP environments. Rotate credentials on a 90-day cadence.

**Enforce DLP policies** via Power Platform Admin Center to prevent sensitive clinical data from flowing to unauthorized connectors or external services. Veeva Vault and Jira Custom Connectors must be explicitly approved in DLP policy.

**Implement RBAC** with distinct GxP roles (PM, CRA, Reg Affairs, CRO Partner, Sponsor, Administrator). Each role should have minimum necessary permissions.

**Enable Purview data governance** for classification and labeling: *Confidential — Clinical Trial Data*, *Restricted — Regulatory Submission*, *Internal — CRO Confidential*. Auto-labelling policies detect and classify clinical data.

Follow [recommendations for monitoring and threat detection](https://learn.microsoft.com/en-us/power-platform/well-architected/security/monitor-threats).

### Operational Excellence

**Implement GAMP 5-aligned ALM**: The architecture follows DEV → TEST → PROD with Azure DevOps CI/CD pipelines. IQ/OQ/PQ qualification gates in TEST. Every production change requires a linked QMS change control record. Agent topics and instructions should be version-controlled.

**Conduct agent evaluations in TEST**: Run evaluation suites against known-good baselines. Track AQS scores in TEST and only promote when AQS ≥ 0.75. Automated AQS testing against golden datasets provides repeatable quality verification.

**Maintain comprehensive audit logging**: Every agent action, data retrieval, report generation, and user interaction must be logged in the Dataverse audit trail. This is mandatory for GxP compliance and regulatory inspection readiness (FDA, EMA).

**Document all agent configurations**: Agent instructions, topic definitions, knowledge source configurations, connector settings, AQS thresholds, and amendment impact rules should be documented and maintained in a validated system.

### Performance Efficiency

**Optimise LLM token consumption**: Use GPT-4o mini for simpler tasks (intent classification, basic formatting) and GPT-4o for complex tasks (risk narrative generation, multi-source summarization). Monitor token usage via GenAI Metrics Dashboard.

**Use parallel branching**: Power Automate flows with parallel branching handle multi-system data retrieval efficiently — the Status Reports Agent retrieves MS Project data and Veeva Vault CTMS data in parallel before merging for report generation.

**Use DirectQuery** (not scheduled import) in Power BI dashboards to ensure real-time data for risk heatmaps and enrollment tracking — avoiding stale regulatory data in governance-facing dashboards.

**Monitor agent response times**: Target < 10 seconds for simple queries, < 30 seconds for report generation, < 60 seconds for complex multi-source aggregations. Use Application Insights to track and alert on SLA breaches.

**Use asynchronous processing for long-running operations**: Status report generation and risk assessment scans should use asynchronous Power Automate flows that notify the user upon completion rather than blocking the conversation.

### Experience Optimization

**Design mobile-first**: The PM Command Center Power App is designed for CRAs and PMs frequently on-site at clinical trial locations. All approval workflows (GDP communication sign-off, CAPA acknowledgement) are completable on mobile without requiring Teams desktop.

**Support multi-turn conversation**: PMs can refine requests iteratively (e.g., "make the enrollment section more detailed" after reviewing a draft status report) without restarting the workflow.

**Provide multi-channel consistency**: Regardless of channel (Teams, Outlook, PM Command Center), agents provide consistent information and formatting.

**Implement progressive disclosure**: For complex outputs, present a summary first with the ability to drill down. Use adaptive cards in Teams for structured data (risk heatmaps, status summaries, approval buttons).

Learn more in [Introduction to conversational experiences](https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/cux-overview) and [Recommendations for designing conversational user experiences](https://learn.microsoft.com/en-us/power-platform/well-architected/experience-optimization/conversation-design).

---

## Responsible AI

**Privacy and Security**: Patient enrollment aggregate data (counts, percentages) and site-level data are protected by Entra ID RBAC, Dataverse row-level security, and Purview sensitivity labels. No patient-identifiable information (PHI) is processed by any agent — all individual patient data remains in Veeva Vault CTMS and validated clinical systems. The Microsoft HIPAA BAA must be in place. Encryption at rest (AES-256) and in transit (TLS 1.2+) is enforced.

**Clinical Decision Boundaries**: Azure AI Foundry models (risk scoring, PDUFA prediction) are project management decision-support tools only. They are explicitly not medical devices, not clinical decision support systems, and not pharmacovigilance tools. All clinical decisions remain with qualified medical and regulatory personnel. Agent outputs include source citations and confidence scores to support informed human review.

**Transparency and Explainability**: Every agent response includes the source documents and data fields used to generate it (RAG citation). AQS scores are visible to PM users for any response below the standard threshold. Data provenance is tracked — each report section cites its source system and timestamp. Thumbs down feedback is reviewed weekly and used to improve quality.

**Fairness and Non-discrimination**: Agent communications are generated from structured templates and source data only — no generative embellishment of clinical findings. This ensures consistency across all site communications and eliminates differential treatment risk.

**Reliability and Safety**: The AQS framework ensures agent outputs below quality thresholds are blocked from delivery and require human review. GDP approval gates prevent non-compliant content from reaching external stakeholders.

**Inclusiveness**: Multi-language content generation for global clinical programs. Adaptive cards and reports designed for accessibility compliance (WCAG 2.1 AA).

**Accountability**: Complete audit trails in Dataverse ensure every agent action is traceable to a specific user request, agent, and timestamp. AQS scoring provides quantitative accountability metrics.

**Human-in-the-Loop**: Critical outputs (stakeholder communications, risk escalations, report publications) require explicit human approval before delivery. The architecture augments — not replaces — the Project Manager's judgment.

---

## ALM Pipeline

The solution follows a GAMP 5-aligned Application Lifecycle Management pipeline:

```
DEV Environment (Unmanaged)
  → Develop and unit test agent topics, flows, custom connectors
  → Peer review via Azure DevOps pull request
  → Export solution as managed solution
        ↓ Export
TEST Environment (Managed)
  → IQ (Installation Qualification): verify solution deployed correctly
  → OQ (Operational Qualification): verify agent flows execute as designed
  → PQ (Performance Qualification): verify end-to-end clinical scenario execution
  → Attach IQ/OQ/PQ evidence to Azure DevOps release
  → Evals: automated AQS testing against golden dataset (AQS ≥ 0.75 gate)
  → Link to QMS change control record (Veeva Vault)
        ↓ Approve & Deploy
PROD Environment (Managed)
  → Managed Environment with sharing limits enforced
  → Change control record closed in Veeva Vault QMS
  → Post-deployment smoke test
  → Hypercare monitoring period (Application Insights + Dataverse Audit)
```

| Environment | Type | Purpose |
|---|---|---|
| **DEV** | Unmanaged | Development and unit testing of agent topics, connectors, flows, and configurations. |
| **TEST** | Managed | Validation and evaluation. IQ/OQ/PQ qualification. Automated AQS testing against golden dataset. |
| **PROD** | Managed | Production. Managed Environment with sharing limits. All changes via managed solutions through Azure DevOps CI/CD with linked QMS change control. |

---

## Contributors

*This article describes a solution idea. Your cloud architect can use this guidance to help visualize the major components for a typical implementation of this architecture.*

Principal authors:

- Solution architecture designed for the Life Sciences Project Manager role.

---

## Related Resources

- [Microsoft Power Platform Well-Architected](https://learn.microsoft.com/en-us/power-platform/well-architected/)
- [Microsoft Copilot Studio — Connected Agents](https://learn.microsoft.com/en-us/microsoft-copilot-studio/)
- [Microsoft Copilot Studio — Generative Orchestration](https://learn.microsoft.com/en-us/microsoft-copilot-studio/)
- [Copilot Studio Guidance](https://learn.microsoft.com/en-us/microsoft-copilot-studio/guidance/)
- [Power Platform Custom Connectors](https://learn.microsoft.com/en-us/connectors/custom-connectors/)
- [Azure AI Foundry](https://learn.microsoft.com/en-us/azure/ai-foundry/)
- [Azure OpenAI Service](https://learn.microsoft.com/en-us/azure/ai-services/openai/)
- [Azure AI Search](https://learn.microsoft.com/en-us/azure/search/)
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
- [FDA 21 CFR Part 11 — Electronic Records](https://www.fda.gov/regulatory-information/search-fda-guidance-documents/part-11-electronic-records-electronic-signatures-scope-and-application)
- [ICH E6(R3) — Good Clinical Practice](https://www.ich.org/page/efficacy-guidelines)
- [GAMP 5 — Good Automated Manufacturing Practice](https://ispe.org/publications/guidance-documents/gamp-5-guide-2nd-edition)

---

## Reference Architecture Patterns

This solution idea follows patterns established in the Microsoft Power Platform Architecture Center:

- [Healthcare Patient Support Agent](https://learn.microsoft.com/en-us/power-platform/architecture/solution-ideas/agent-healthcare-patient-support)
- [Rental Property Portal Agent](https://learn.microsoft.com/en-us/power-platform/architecture/solution-ideas/agent-rental-portal)
- [EVVIE Application](https://learn.microsoft.com/en-us/power-platform/architecture/solution-ideas/app-evvie)
- [Custom Contact Center Agent](https://learn.microsoft.com/en-us/power-platform/architecture/solution-ideas/agent-custom-contact-center)
- [Travel Customer Concierge Agent](https://learn.microsoft.com/en-us/power-platform/architecture/solution-ideas/agent-travel-customer)
- [Ticket and Refund Management Agent](https://learn.microsoft.com/en-us/power-platform/architecture/solution-ideas/agent-ticket-and-refund)
- [Auto AI Triage](https://learn.microsoft.com/en-us/power-platform/architecture/solution-ideas/auto-ai-triage)
- [Cardio Triage Agent](https://learn.microsoft.com/en-us/power-platform/architecture/solution-ideas/cardio-triage-agent)
- [Anomaly Detection Agent](https://learn.microsoft.com/en-us/power-platform/architecture/solution-ideas/agent-anomaly-detection)
- [Customer Support Agent](https://learn.microsoft.com/en-us/power-platform/architecture/solution-ideas/customer-support-agent)
- [Onboarding Agent](https://learn.microsoft.com/en-us/power-platform/architecture/solution-ideas/onboarding-agent)
- [Donor Management Agent](https://learn.microsoft.com/en-us/power-platform/architecture/solution-ideas/agent-donor-management)
- [Learning Management Application](https://learn.microsoft.com/en-us/power-platform/architecture/solution-ideas/app-learning-management)

---

*Life Sciences — Project Manager Multi-Agent Architecture*
*Microsoft Power Platform Architecture Patterns*
*February 2026*
