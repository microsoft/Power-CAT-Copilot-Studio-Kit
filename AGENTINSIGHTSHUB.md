# Agent Insights Hub

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Setup Guide](#setup-guide)
   - [Step 1: Connect Copilot to Application Insights](#step-1-connect-copilot-to-application-insights)
   - [Step 2: Create Azure App Registration](#step-2-create-azure-app-registration)
   - [Step 3: Configure Agent in Agent Insights Hub](#step-3-configure-agent-in-agent-insights-hub)
   - [Step 4: Run Initial Sync](#step-4-run-initial-sync)
5. [Features & Navigation](#features--navigation)
6. [KPIs & Metrics Reference](#kpis--metrics-reference)
7. [Import Queries (KQL)](#import-queries-kql)
8. [Sync Operations](#sync-operations)
9. [UI Components Reference](#ui-components-reference)
   - [Action Buttons](#action-buttons-home-page)
   - [Key Metrics Cards](#key-metrics-cards-home-page)
   - [Charts Reference](#charts-reference)
   - [Dialogs Reference](#dialogs-reference)
   - [Page-Specific Features](#page-specific-features)
   - [Global Filter Bar](#global-filter-bar)
10. [Troubleshooting Guide](#troubleshooting-guide)
11. [Useful Links](#useful-links)

---

## Overview

**Agent Insights Hub** is an enterprise analytics layer that complements existing Copilot Studio analytics capabilities. It pulls aggregated metrics from Application Insights and stores them within Dataverse, making agent analytics accessible within the Copilot Studio Kit.

### What Agent Insights Hub Brings to the Table

| Capability                         | Description                                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **🏢 Enterprise-Wide Visibility**  | Managing dozens of agents across multiple business units and environments? Get one unified dashboard—no jumping between individual agent analytics pages or workbooks           |
| **📊 Cross-Agent Benchmarking**    | Compare engagement rates, resolution rates, and satisfaction scores across your entire agent portfolio. Which agents are excelling? Which need attention? One view answers that |
| **🔑 Simplified Access**           | Using non-interactive authentication, your operations and leadership teams can access centralized reporting without per-user Azure RBAC setup                                   |
| **🎯 No Kusto Expertise Required** | Business analysts get a no-code UI with intuitive visualizations and filters—no need to write complex KQL queries                                                               |
| **📅 365+ Day Retention**          | Store historical metrics in Dataverse without extra Azure costs                                                                                                                 |
| **🔒 Privacy-Safe Access**         | Users view aggregates only; no access to message content or PII                                                                                                                 |

### How It Fits: The Analytics Landscape

Agent Insights Hub is designed to complement—not compete with—existing Microsoft analytics tools:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        COPILOT STUDIO ANALYTICS ECOSYSTEM                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────────┐  │
│  │   COPILOT STUDIO    │  │   APP INSIGHTS      │  │   AGENT INSIGHTS HUB    │  │
│  │   Analytics Tab     │  │   Dashboard         │  │                         │  │
│  ├─────────────────────┤  ├─────────────────────┤  ├─────────────────────────┤  │
│  │                     │  │                     │  │                         │  │
│  │  👤 For: Agent      │  │  👨‍💻 For: Developers │  │  👔 For: Operations &   │  │
│  │     Makers          │  │                     │  │     Leadership          │  │
│  │                     │  │                     │  │                         │  │
│  │  🎯 Purpose:        │  │  🎯 Purpose:        │  │  🎯 Purpose:            │  │
│  │  Building &         │  │  Deep telemetry &   │  │  Understanding          │  │
│  │  refining           │  │  debugging          │  │  performance at scale   │  │
│  │  individual agents  │  │                     │  │  without technical      │  │
│  │                     │  │                     │  │  complexity             │  │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────────┘  │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Key Differentiators

| Feature                 | Copilot Studio Analytics | App Insights Dashboard  | Agent Insights Hub           |
| ----------------------- | ------------------------ | ----------------------- | ---------------------------- |
| **Target Audience**     | Agent Makers             | Developers              | Operations & Leadership      |
| **Scope**               | Single Agent             | Single Workspace        | Enterprise-wide              |
| **Technical Skill**     | Low                      | High (KQL required)     | None (No-code UI)            |
| **Cross-Agent View**    | ❌                       | ❌                      | ✅                           |
| **Benchmarking**        | ❌                       | ❌                      | ✅                           |
| **Authentication**      | Per-user                 | Azure RBAC              | Non-interactive (simplified) |
| **Data Storage**        | Azure (90 days default)  | Azure (90 days default) | Dataverse (365+ days)        |
| **Pre-aggregated Data** | ❌                       | ❌                      | ✅                           |
| **AI Recommendations**  | Limited                  | ❌                      | ✅                           |

### What We Store vs. What We Don't

**Privacy by Design:** We do NOT export raw conversation data. Only pre-computed aggregates are stored:

| ✅ What We Store          | ❌ What We Don't Store    |
| ------------------------- | ------------------------- |
| Session counts per day    | Conversation transcripts  |
| Average CSAT scores       | Individual user messages  |
| Topic completion rates    | User identities or PII    |
| Error frequency counts    | Raw telemetry logs        |
| Response time percentiles | Actual response content   |
| Channel distribution      | User personal information |

---

## Architecture

### High-Level Architecture Diagram

```mermaid
flowchart TB
    subgraph "Azure Cloud"
        AI[("🔷 Application Insights<br/>Raw Telemetry<br/>90-day retention")]
        AAD["🔐 Azure AD<br/>App Registration"]
    end

    subgraph "Power Platform"
        subgraph "Power Automate"
            F1["⚡ Daily Sync Flow<br/>Scheduled @ 2 AM UTC"]
            F2["⚡ On-Demand Sync Flow<br/>Manual Trigger"]
            F3["⚡ Historical Backfill Flow<br/>Generate Metrics"]
        end

        subgraph "Dataverse"
            DV1[("📊 Daily Metrics")]
            DV2[("📊 Topic Metrics")]
            DV3[("📊 Error Details")]
            DV4[("📊 Tool Metrics")]
            DV5[("⚙️ Agent Configurations")]
            DV7[("📝 Sync Logs")]
        end

        subgraph "Code Apps"
            APP["🖥️ Agent Insights Hub<br/>React + Fluent UI"]
        end
    end

    subgraph "Copilot Studio"
        CS["🤖 Copilot Agent"]
    end

    CS -->|"Telemetry Events"| AI
    AAD -->|"OAuth Token"| F1
    AAD -->|"OAuth Token"| F2
    AAD -->|"OAuth Token"| F3

    F1 -->|"KQL Queries"| AI
    F2 -->|"KQL Queries"| AI
    F3 -->|"KQL Queries"| AI

    F1 -->|"Upsert"| DV1
    F1 -->|"Upsert"| DV2
    F1 -->|"Upsert"| DV3
    F1 -->|"Upsert"| DV4

    F2 --> DV1
    F2 --> DV2
    F2 --> DV3

    F3 --> DV1
    F3 --> DV2
    F3 --> DV3

    DV5 -->|"Config"| F1
    DV5 -->|"Config"| F2

    F1 -->|"Log"| DV6
    F2 -->|"Log"| DV6

    APP -->|"Read"| DV1
    APP -->|"Read"| DV2
    APP -->|"Read"| DV3
    APP -->|"Read"| DV4
    APP -->|"CRUD"| DV5
    APP -->|"Read"| DV6

    style AI fill:#0078D4,color:white
    style AAD fill:#00A4EF,color:white
    style APP fill:#742774,color:white
    style CS fill:#0F6CBD,color:white
```

### Data Flow Sequence

```mermaid
sequenceDiagram
    participant User as 👤 User
    participant App as 🖥️ Agent Insights Hub
    participant DV as 📊 Dataverse
    participant PA as ⚡ Power Automate
    participant AAD as 🔐 Azure AD
    participant AI as 🔷 App Insights

    Note over User,AI: Daily Automated Sync (2 AM UTC)
    PA->>DV: Get Active Configurations
    DV-->>PA: Configuration List
    loop For Each Configuration
        PA->>AAD: Request OAuth Token
        AAD-->>PA: Access Token
        PA->>AI: Execute KQL Queries
        AI-->>PA: Aggregated Metrics
        PA->>DV: Upsert Metrics Records
        PA->>DV: Create Sync Log Entry
    end

    Note over User,AI: Manual Sync Now
    User->>App: Click "Sync Now"
    App->>DV: Update ActionParameters
    DV-->>PA: Trigger Flow (Record Modified)
    PA->>AAD: Request OAuth Token
    AAD-->>PA: Access Token
    PA->>AI: Execute KQL Queries
    AI-->>PA: Aggregated Metrics
    PA->>DV: Upsert Metrics Records
    DV-->>App: Data Refreshed
    App-->>User: Show Updated Dashboard
```

---

## Prerequisites

Before setting up Agent Insights Hub, ensure you have:

### Azure Requirements

- [ ] Azure subscription with Application Insights resources
- [ ] Azure AD admin permissions (to create App Registrations)
- [ ] Access to Copilot Studio agents you want to monitor

### Power Platform Requirements

- [ ] System Administrator role in Dataverse environment
- [ ] Power Automate Premium license (for HTTP connector)
- [ ] Copilot Studio Kit solution installed

### Technical Knowledge

- [ ] Basic understanding of Azure AD authentication
- [ ] Familiarity with KQL (Kusto Query Language) - optional
- [ ] Power Automate flow management - optional

---

## Setup Guide

### Step 1: Connect Copilot to Application Insights

Before Agent Insights Hub can collect metrics, your Copilot Studio agent must be connected to Azure Application Insights.

> 📖 **Official Guide:** [Connect your Copilot Studio agent to Application Insights](https://learn.microsoft.com/en-us/microsoft-copilot-studio/advanced-bot-framework-composer-capture-telemetry#connect-your-copilot-studio-agent-to-application-insights)

#### Quick Steps:

1. **Create Application Insights Resource** (if not exists)

   - Go to [Azure Portal](https://portal.azure.com)
   - Create new Application Insights resource
   - Note the **Connection String** and **Instrumentation Key**

2. **Connect Agent to App Insights**

   - Open Copilot Studio
   - Go to **Settings** → **Agent details**
   - Scroll to **Application Insights**
   - Enter your **Connection String**
   - Click **Save**

3. **Verify Connection**
   - Have a test conversation with your agent
   - Go to Application Insights → **Logs**
   - Run: `customEvents | where timestamp > ago(1h) | take 10`
   - You should see events from your Copilot

#### Key Events Captured

| Event Name           | Description                 |
| -------------------- | --------------------------- |
| `ConversationStart`  | New conversation initiated  |
| `ConversationEnd`    | Conversation completed      |
| `TopicStart`         | Topic triggered             |
| `TopicEnd`           | Topic completed             |
| `TopicRedirect`      | Topic redirected to another |
| `BotMessageReceived` | User sent a message         |
| `BotMessageSend`     | Bot responded               |
| `OnErrorLog`         | Error occurred              |

---

### Step 2: Create Azure App Registration

Agent Insights Hub uses OAuth 2.0 client credentials to securely query Application Insights.

> 📖 **Official Guide:** [Set up Azure AD authentication for Application Insights](https://learn.microsoft.com/en-us/azure/azure-monitor/app/azure-ad-authentication?tabs=aspnetcore#set-up-authentication)

#### 2.1 Register Application in Azure AD

1. Sign in to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** → **App registrations**
3. Click **New registration**
4. Enter details:
   - **Name:** `Copilot Monitoring Hub - App Insights Reader`
   - **Supported account types:** Accounts in this organizational directory only
   - **Redirect URI:** Leave blank
5. Click **Register**
6. **Copy these values:**

| Field                   | Store In                       |
| ----------------------- | ------------------------------ |
| Application (client) ID | `cat_azureappinsightsclientid` |
| Directory (tenant) ID   | `cat_azureappinsightstenantid` |

#### 2.2 Create Client Secret

1. In your App Registration, go to **Certificates & secrets**
2. Click **New client secret**
3. Enter:
   - **Description:** `Copilot Monitoring Hub Secret`
   - **Expires:** 24 months (or per your policy)
4. Click **Add**
5. **IMPORTANT:** Copy the secret **Value** immediately

**Secret Storage Options:**

| Option                      | Security Level | Configuration                                |
| --------------------------- | -------------- | -------------------------------------------- |
| **Key Vault** (Recommended) | High           | `cat_azureappinsightssecretlocationcode = 2` |
| **Dataverse**               | Medium         | `cat_azureappinsightssecretlocationcode = 1` |

#### 2.3 Grant API Permissions

1. In App Registration → **API permissions**
2. Click **Add a permission**
3. Select **APIs my organization uses**
4. Search for **Log Analytics API**
5. Select **Application permissions** → **Data.Read**
6. Click **Add permissions**
7. Click **Grant admin consent for [Your Organization]**

#### 2.4 Assign Azure RBAC Role

1. Go to your **Application Insights** resource
2. Click **Access control (IAM)**
3. Click **Add** → **Add role assignment**
4. Select role: **Monitoring Reader** or **Log Analytics Reader**
5. Search for your app registration name
6. Click **Review + assign**

#### 2.5 Get Application Insights Details

From your Application Insights resource, copy:

| Field          | Where to Find    | Store In                            |
| -------------- | ---------------- | ----------------------------------- |
| Application ID | API Access blade | `cat_azureappinsightsapplicationid` |
| Workspace ID   | Properties blade | Used in KQL queries                 |

---

### Step 3: Configure Agent in Agent Insights Hub

#### Option A: Add Single Agent (Manual)

1. Open **Agent Insights Hub** in your Power Apps environment
2. Click **Add Agent** button (+ icon)
3. Fill in the configuration form:

| Field                   | Description                           | Example                |
| ----------------------- | ------------------------------------- | ---------------------- |
| **Name**                | Display name for this config          | `Production HR Bot`    |
| **Agent Name**          | Exact name from Copilot Studio        | `HR Assistant`         |
| **App Insights App ID** | Application ID from Azure             | `abc123-...`           |
| **Tenant ID**           | Azure AD Tenant ID                    | `xyz789-...`           |
| **Client ID**           | App Registration Client ID            | `def456-...`           |
| **Secret Location**     | Where secret is stored                | Dataverse or Key Vault |
| **Secret**              | Client secret value or Key Vault name | `***`                  |

4. Click **Save**

#### Option B: Bulk Import (Multiple Agents)

1. Click **Bulk Import** button
2. **Download Template:** Click the download icon to get Excel template
3. **Fill in Template:** One row per agent configuration

| Column               | Required        | Description                      |
| -------------------- | --------------- | -------------------------------- |
| Name                 | ✅              | Configuration display name       |
| Agent Name           | ✅              | Copilot Studio agent name        |
| App Insights App ID  | ✅              | Application Insights App ID      |
| Tenant ID            | ✅              | Azure AD Tenant ID               |
| Client ID            | ✅              | App Registration Client ID       |
| Secret Location      | ✅              | `1` = Dataverse, `2` = Key Vault |
| Secret               | When Location=1 | Client secret value              |
| Environment Variable | When Location=2 | Key Vault secret name            |

4. **Upload:** Drag and drop your Excel file
5. **Review:** Check the preview grid for errors
6. **Import:** Click **Import All** to create configurations

#### Bulk Import Features

- **Paste from Excel:** Copy cells and paste directly into the grid
- **Edit in Grid:** Modify values directly in the spreadsheet-like interface
- **Row Validation:** Red highlighting shows invalid rows
- **Progress Tracking:** See real-time import progress

---

### Step 4: Run Initial Sync

After configuring agents, sync historical data:

#### Sync Now (Incremental)

Syncs yesterday's data for selected agent(s):

1. Select agent from dropdown (or "All Agents")
2. Click **Sync Now** button
3. Wait for confirmation toast message
4. View results in **Sync Logs** page

#### Generate Metrics (Historical Backfill)

Backfills up to 180 days of historical data:

1. Click **Generate Metrics** button
2. Select agent configuration
3. Choose date range:
   - **Last 7 Days**
   - **Last 30 Days**
   - **Last 90 Days**
   - **Last 180 Days**
   - **Custom Range**
4. Click **Generate**
5. Monitor progress in Sync Logs

> ⚠️ **Note:** Historical backfill may take several minutes depending on data volume.

---

## Features & Navigation

### Navigation Menu

| Page              | Icon | Description                                       |
| ----------------- | ---- | ------------------------------------------------- |
| **Home**          | 🏠   | Dashboard overview with key metrics and charts    |
| **Daily Metrics** | 📊   | Day-by-day session, message, and response metrics |
| **Topic Metrics** | 📑   | Topic performance, completion rates, durations    |
| **Error Details** | ❌   | Error tracking, codes, and trends                 |
| **Tool Metrics**  | 🔧   | Action/connector execution times                  |
| **Sync Logs**     | 📝   | History of sync operations                        |

### Global Filters

All pages share common filters in the header:

| Filter         | Options                       | Description                    |
| -------------- | ----------------------------- | ------------------------------ |
| **Agent**      | All Agents / [Specific Agent] | Filter data by agent           |
| **Date Range** | Last 7/30/90/180 days, Custom | Time period for metrics        |
| **Channel**    | All / Teams / WebChat / etc.  | Filter by conversation channel |
| **Data Mode**  | Production / Test / Both      | Include or exclude test data   |

### Action Buttons

| Button               | Action                         | Availability     |
| -------------------- | ------------------------------ | ---------------- |
| **Add Agent**        | Create new agent configuration | Home page        |
| **Show Agents**      | View/edit all configurations   | Home page        |
| **Bulk Import**      | Import multiple configurations | Home page        |
| **Generate Metrics** | Backfill historical data       | Home page        |
| **Sync Now**         | Trigger immediate sync         | Home page        |
| **Export**           | Download data as Excel         | All metric pages |

---

## KPIs & Metrics Reference

### Daily Metrics

| KPI                            | Description                 | Calculation                                          |
| ------------------------------ | --------------------------- | ---------------------------------------------------- |
| **Total Sessions**             | Unique conversations        | Count of distinct `conversationId`                   |
| **Unique Users**               | Distinct users              | Count of distinct `user_Id`                          |
| **Total Messages**             | User messages sent          | Count of `BotMessageReceived` where `type='message'` |
| **Bot Responses**              | Messages from bot           | Count of `BotMessageSend`                            |
| **Error Count**                | Errors occurred             | Count of `OnErrorLog` events                         |
| **Error Rate**                 | Error percentage            | `(Errors / Sessions) × 100`                          |
| **Avg Response Time**          | Mean response duration      | `Total Response Time / Response Count`               |
| **P50/P90/P95/P99 Response**   | Percentile response times   | Percentile calculations on response durations        |
| **Single-Turn Sessions**       | One-message conversations   | Sessions with exactly 1 user message                 |
| **Multi-Turn Sessions**        | Multi-message conversations | Sessions with 2+ user messages                       |
| **Short/Medium/Long Sessions** | Duration categories         | <1min / 1-5min / >5min                               |

### Topic Metrics

| KPI                   | Description              | Calculation                              |
| --------------------- | ------------------------ | ---------------------------------------- |
| **Trigger Count**     | Times topic started      | Count of `TopicStart` events             |
| **Completion Count**  | Times topic finished     | Count of `TopicEnd` events               |
| **Completion Rate**   | Success percentage       | `(Completions / Triggers) × 100`         |
| **Redirect Count**    | Topic redirections       | Count of `TopicRedirect` events          |
| **Abandonment Count** | Incomplete topics        | `Triggers - Completions - Redirects`     |
| **Abandonment Rate**  | Drop-off percentage      | `(Abandonments / Triggers) × 100`        |
| **Avg Duration**      | Mean topic duration      | `Total Duration / Duration Count`        |
| **Median Duration**   | P50 topic duration       | 50th percentile of topic durations       |
| **P95 Duration**      | 95th percentile duration | For identifying slow topics              |
| **Message Count**     | Messages within topic    | Messages between TopicStart and TopicEnd |
| **Action Count**      | Actions executed         | Connector/Flow calls within topic        |
| **Avg Action Time**   | Mean action duration     | `Total Action Time / Action Count`       |

### Error Details

| KPI                   | Description       | Calculation                          |
| --------------------- | ----------------- | ------------------------------------ |
| **Error Code**        | Error identifier  | From `customDimensions.errorCode`    |
| **Error Message**     | Error description | From `customDimensions.errorMessage` |
| **Occurrence Count**  | Error frequency   | Count of errors with same code       |
| **Sessions Affected** | Impact scope      | Distinct sessions with this error    |
| **Users Affected**    | User impact       | Distinct users encountering error    |
| **First/Last Seen**   | Error timeline    | Min/Max timestamp for error          |

### Tool Metrics

| KPI                  | Description              | Calculation                                   |
| -------------------- | ------------------------ | --------------------------------------------- |
| **Node Kind**        | Action type              | InvokeFlowAction, InvokeConnectorAction, etc. |
| **Invocation Count** | Times called             | Count of action executions                    |
| **Success Count**    | Successful calls         | Actions without errors                        |
| **Success Rate**     | Reliability              | `(Successes / Invocations) × 100`             |
| **Avg Elapsed Time** | Mean execution time      | `Total Elapsed / Invocation Count`            |
| **P90 Elapsed Time** | 90th percentile duration | For SLA monitoring                            |
| **Max Elapsed Time** | Slowest execution        | For identifying bottlenecks                   |

---

## Import Queries (KQL)

The following KQL queries are used to extract aggregated metrics from Application Insights:

### Query Files

| File                                                                           | Target Table        | Grain                                                               |
| ------------------------------------------------------------------------------ | ------------------- | ------------------------------------------------------------------- |
| [Import_DailyMetrics.kql](../../../Import%20Queries/Import_DailyMetrics.kql)   | `cat_dailymetrics`  | date + agent + channel + dataSource                                 |
| [Import_TopicMetrics.kql](../../../Import%20Queries/Import_TopicMetrics.kql)   | `cat_topicmetrics`  | date + agent + topic + channel + dataSource                         |
| [Import_ErrorDetails.kql](../../../Import%20Queries/Import_ErrorDetails.kql)   | `cat_errordetails`  | date + agent + errorCode + channel + dataSource                     |
| [Import_ToolMetrics.kql](../../../Import%20Queries/Import_ToolMetrics.kql)     | `cat_toolmetrics`   | date + agent + nodeKind + channel + dataSource                      |
| [Import_ActionMetrics.kql](../../../Import%20Queries/Import_ActionMetrics.kql) | `cat_actionmetrics` | date + agent + nodeKind + topicId + actionId + channel + dataSource |

### Running Queries Manually

1. Open Azure Portal → Application Insights → Logs
2. Copy query content from the `.kql` file
3. Modify variables if needed:
   ```kql
   let startDate = ago(180d);  // Adjust lookback period
   let endDate = now();
   ```
4. Run query and export results

### Query Output Format

Each query outputs data ready for Dataverse import with:

- **name**: Alternate key for upsert operations
- **metricDate**: Date of aggregation
- **agentName**: Agent identifier
- **channelId**: Conversation channel
- **dataSource**: "Production" or "Test Data"
- **[Metric Columns]**: Aggregated values

### Important: BotMessageReceived Event Types

```
BotMessageReceived fires for TWO different things:
1. messageType = "message" → Actual user typed a message (COUNT THIS)
2. messageType = "event"   → System events (conversation start, etc.) - IGNORE

Always filter: name == "BotMessageReceived" AND messageType == "message"
```

---

## Sync Operations

### Automated Daily Sync

A Power Automate flow runs daily at **2:00 AM UTC** to:

1. Retrieve all active agent configurations
2. Authenticate with Azure AD
3. Execute KQL queries for yesterday's data
4. Upsert results into Dataverse tables
5. Log execution status

### Manual Sync Now

Triggers immediate sync for selected agent(s):

```mermaid
flowchart LR
    A[User clicks Sync Now] --> B[Update ActionParameters field]
    B --> C[Power Automate trigger fires]
    C --> D[Get OAuth Token]
    D --> E[Execute KQL Queries]
    E --> F[Upsert to Dataverse]
    F --> G[Show success toast]
```

### Sync Log Status Codes

| Code | Status      | Description               |
| ---- | ----------- | ------------------------- |
| 1    | Not Started | Sync queued but not begun |
| 2    | Running     | Currently executing       |
| 3    | Complete    | Successfully finished     |
| 4    | Error       | Failed with error         |
| 5    | Cancelled   | Manually cancelled        |

---

## Troubleshooting Guide

### Common Issues

#### 1. No Data Showing in Dashboard

**Symptoms:** Dashboard shows empty state, no metrics displayed

**Checklist:**

- [ ] Agent is connected to Application Insights (verify in Copilot Studio settings)
- [ ] Test conversations have been made (data exists in App Insights)
- [ ] Agent configuration exists and is active
- [ ] Sync has been run (check Sync Logs)
- [ ] Date range filter includes data dates
- [ ] Agent filter matches configuration name

**Debug Steps:**

1. Run this query in Application Insights:
   ```kql
   customEvents
   | where timestamp > ago(7d)
   | where cloud_RoleName == "Microsoft Copilot Studio"
   | summarize count() by cloud_RoleInstance
   ```
2. Verify `cloud_RoleInstance` matches your agent name in configuration

#### 2. Sync Failing with Authentication Error

**Symptoms:** Sync logs show "Error" status with auth-related message

**Checklist:**

- [ ] Client secret hasn't expired
- [ ] Tenant ID is correct
- [ ] Client ID is correct
- [ ] API permissions granted and admin consented
- [ ] RBAC role assigned on Application Insights resource

**Debug Steps:**

1. Test authentication manually:
   ```powershell
   $body = @{
       grant_type    = "client_credentials"
       client_id     = "YOUR_CLIENT_ID"
       client_secret = "YOUR_SECRET"
       scope         = "https://api.loganalytics.io/.default"
   }
   $token = Invoke-RestMethod -Uri "https://login.microsoftonline.com/YOUR_TENANT_ID/oauth2/v2.0/token" -Method POST -Body $body
   $token.access_token
   ```
2. If token fails, verify Azure AD app registration settings

#### 3. Data Not Matching Application Insights Dashboard

**Symptoms:** Numbers differ between Agent Insights Hub and native Azure dashboard

**Possible Causes:**

- Different time zones (Agent Insights uses UTC)
- Different date range selections
- Test data inclusion/exclusion differences
- Aggregation grain differences

**Resolution:**

1. Ensure same date range is selected
2. Check "Data Mode" filter (Production vs Test)
3. Review query logic in KQL files for calculation methods

#### 4. Bulk Import Failures

**Symptoms:** Some rows fail during bulk import

**Checklist:**

- [ ] All required fields populated (Name, Agent Name, App Insights App ID, Tenant ID, Client ID)
- [ ] GUIDs are in correct format (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
- [ ] No special characters in Name field
- [ ] Secret provided when Secret Location = Dataverse

**Resolution:**

1. Check row highlighting for validation errors
2. Hover over red cells for specific error message
3. Fix issues and retry

#### 5. Charts Not Rendering

**Symptoms:** Charts show loading spinner indefinitely or error

**Checklist:**

- [ ] Data exists for selected filters
- [ ] Browser is up to date
- [ ] No console errors in browser dev tools

**Resolution:**

1. Clear browser cache
2. Try different date range
3. Check browser console (F12) for JavaScript errors

### Error Messages Reference

| Error           | Cause               | Solution                                   |
| --------------- | ------------------- | ------------------------------------------ |
| `AADSTS7000215` | Secret expired      | Regenerate client secret in Azure AD       |
| `AADSTS700016`  | Wrong tenant        | Verify tenant ID in configuration          |
| `403 Forbidden` | Missing permissions | Add Monitoring Reader role on App Insights |
| `Invalid query` | KQL syntax error    | Check query in App Insights Logs blade     |
| `Rate limited`  | Too many requests   | Wait and retry, or reduce query frequency  |

---

## Useful Links

### Microsoft Documentation

| Topic                           | Link                                                                                                                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connect Copilot to App Insights | [Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-copilot-studio/advanced-bot-framework-composer-capture-telemetry#connect-your-copilot-studio-agent-to-application-insights) |
| Azure AD Authentication Setup   | [Microsoft Learn](https://learn.microsoft.com/en-us/azure/azure-monitor/app/azure-ad-authentication?tabs=aspnetcore#set-up-authentication)                                                |
| Copilot Studio Analytics        | [Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-copilot-studio/analytics-overview)                                                                                          |
| Application Insights Overview   | [Microsoft Learn](https://learn.microsoft.com/en-us/azure/azure-monitor/app/app-insights-overview)                                                                                        |
| KQL Quick Reference             | [Microsoft Learn](https://learn.microsoft.com/en-us/azure/data-explorer/kql-quick-reference)                                                                                              |

### Related Documentation

| Document              | Location                                                        |
| --------------------- | --------------------------------------------------------------- |
| Dataverse Schema      | [DATAVERSE_SCHEMA.md](../../../docs/DATAVERSE_SCHEMA.md)        |
| Flow Specifications   | [FLOW_SPECIFICATIONS.md](../../../flows/FLOW_SPECIFICATIONS.md) |
| Azure AD Auth Setup   | [AZURE_AD_AUTH_SETUP.md](../../../docs/AZURE_AD_AUTH_SETUP.md)  |
| Import Queries README | [Import Queries README](../../../Import%20Queries/README.md)    |
| KPI Gap Analysis      | [KPI_GAP_ANALYSIS.md](../../../docs/KPI_GAP_ANALYSIS.md)        |

### Source Code

| Component     | Location                                                                   |
| ------------- | -------------------------------------------------------------------------- |
| Main App      | [App.tsx](../src/App.tsx)                                                  |
| Home Page     | [HomePage.tsx](../src/pages/HomePage/HomePage.tsx)                         |
| Daily Metrics | [DailyMetricsPage.tsx](../src/pages/DailyMetricsPage/DailyMetricsPage.tsx) |
| Topic Metrics | [TopicMetricsPage.tsx](../src/pages/TopicMetricsPage/TopicMetricsPage.tsx) |
| Error Details | [ErrorDetailsPage.tsx](../src/pages/ErrorDetailsPage/ErrorDetailsPage.tsx) |
| Tool Metrics  | [ToolMetricsPage.tsx](../src/pages/ToolMetricsPage/ToolMetricsPage.tsx)    |
| Sync Logs     | [SyncLogsPage.tsx](../src/pages/SyncLogsPage/SyncLogsPage.tsx)             |
| Dialogs       | [components/Dialogs/](../src/components/Dialogs/)                          |

### External Tools

| Tool             | Purpose                | Link                                                               |
| ---------------- | ---------------------- | ------------------------------------------------------------------ |
| Azure Portal     | Manage Azure resources | [portal.azure.com](https://portal.azure.com)                       |
| Power Apps Maker | Build Power Apps       | [make.powerapps.com](https://make.powerapps.com)                   |
| Power Automate   | Manage flows           | [make.powerautomate.com](https://make.powerautomate.com)           |
| Copilot Studio   | Manage agents          | [copilotstudio.microsoft.com](https://copilotstudio.microsoft.com) |

---

## UI Components Reference

### Action Buttons (Home Page)

| Button          | Icon | Description                      | Action                                                                                |
| --------------- | ---- | -------------------------------- | ------------------------------------------------------------------------------------- |
| **Add Agent**   | ➕   | Create a new agent configuration | Opens Add Agent Dialog to configure a new Copilot agent with App Insights credentials |
| **Show Agents** | 👁️   | View all configured agents       | Opens dialog showing all agent configurations with edit/delete options                |
| **Bulk Import** | ⬆️   | Import multiple agents at once   | Opens Excel-like grid for bulk configuration import                                   |
| **Sync Now**    | 🔄   | Trigger immediate data sync      | Opens Generate Metrics Dialog to sync data for selected agent(s)                      |
| **Export**      | ⬇️   | Export data to Excel             | Downloads current view data as Excel file (available on metric pages)                 |

### Key Metrics Cards (Home Page)

The top row displays 6 key metric cards with trend indicators:

| Metric Card               | Icon | Description                                   | Trend Calculation                          |
| ------------------------- | ---- | --------------------------------------------- | ------------------------------------------ |
| **Conversation Sessions** | 💬   | Total unique conversations in selected period | Compares to previous period of same length |
| **Unique Users**          | 👥   | Distinct users who interacted with agent      | Compares to previous period                |
| **Responses**             | ↩️   | Total bot responses sent                      | No trend shown                             |
| **Avg Response**          | ⏱️   | Average response time in seconds              | No trend shown                             |
| **Duration**              | ⏲️   | Average session duration in minutes           | Compares to previous period                |
| **Errors**                | ❌   | Total errors occurred                         | Inverted trend (down is good)              |

**Trend Indicators:**

- 🟢 **Green arrow up**: Positive change (more users, sessions)
- 🔴 **Red arrow up**: Negative change (more errors)
- ⬇️ **Arrow down**: Decrease from previous period
- Percentage shows change vs previous period of same length

### Insights Cards

| Card                | Purpose                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Analysis**        | Auto-generated summary of agent performance including conversation count, unique users, average duration, and error rate |
| **Recommendations** | AI-powered suggestions based on metrics (e.g., investigate errors if rate >5%, monitor slow responses)                   |

### Charts Reference

#### Usage Overview Section

| Chart                        | Type      | Data Source        | Description                                                          |
| ---------------------------- | --------- | ------------------ | -------------------------------------------------------------------- |
| **Top Topics**               | List      | `cat_topicmetrics` | Top 5 most triggered topics ranked by trigger count                  |
| **Conversations by Channel** | Donut Pie | `cat_dailymetrics` | Distribution of conversations across channels (Teams, WebChat, etc.) |

#### Session Analysis Section

| Chart                             | Type      | Data Source        | Description                                                           |
| --------------------------------- | --------- | ------------------ | --------------------------------------------------------------------- |
| **Single vs Multi-turn Sessions** | Donut Pie | `cat_dailymetrics` | Ratio of one-message conversations vs multi-message conversations     |
| **Session Duration Distribution** | Donut Pie | `cat_dailymetrics` | Breakdown by duration: Short (<1min), Medium (1-10min), Long (>10min) |

#### Health & Errors Section

| Chart                          | Type           | Data Source        | Description                                                      |
| ------------------------------ | -------------- | ------------------ | ---------------------------------------------------------------- |
| **Error Distribution by Type** | Donut Pie      | `cat_errordetails` | Top 8 most common error codes                                    |
| **Tool Success Rate (%)**      | Horizontal Bar | `cat_toolmetrics`  | Success percentage for each tool/connector (sorted lowest first) |

#### Response Performance Section

| Chart                         | Type         | Data Source        | Description                                                      |
| ----------------------------- | ------------ | ------------------ | ---------------------------------------------------------------- |
| **Average Response Time**     | Area Chart   | `cat_dailymetrics` | Daily trend of average response time (seconds) over last 30 days |
| **P90 Response Time**         | Area Chart   | `cat_dailymetrics` | Daily trend of 90th percentile response time (seconds)           |
| **Response Time Percentiles** | Vertical Bar | `cat_dailymetrics` | P10, P50, P90, P95, P99 response times comparison                |
| **Slow Responses Over Time**  | Area Chart   | `cat_dailymetrics` | Daily count of responses taking >16 seconds                      |

#### Slowest Execution Section

| Chart                                | Type           | Data Source        | Description                                          |
| ------------------------------------ | -------------- | ------------------ | ---------------------------------------------------- |
| **Tool Execution (Top 10 Slowest)**  | Horizontal Bar | `cat_toolmetrics`  | Top 10 slowest tools by P90 execution time (seconds) |
| **Topic Execution (Top 10 Slowest)** | Horizontal Bar | `cat_topicmetrics` | Top 10 slowest topics by median duration (seconds)   |

### Data Aggregation Methods

#### How Metrics Are Calculated

| Aggregation     | Method              | Formula                                   |
| --------------- | ------------------- | ----------------------------------------- |
| **Sum**         | Simple total        | `SUM(field)` across filtered records      |
| **Average**     | Weighted average    | `SUM(total_field) / SUM(count_field)`     |
| **Percentiles** | Weighted percentile | Weight by response count when aggregating |
| **Trend**       | Period comparison   | `((Current - Previous) / Previous) × 100` |

#### Period Comparison Logic

```
Current Period: [startDate, endDate] from filter
Previous Period: Same length BEFORE startDate

Example (Last 30 Days):
- Current: Dec 17, 2025 → Jan 16, 2026
- Previous: Nov 17, 2025 → Dec 16, 2025

Trend = ((Current Total - Previous Total) / Previous Total) × 100%
```

### Dialogs Reference

#### Add Agent Dialog

| Field                | Type        | Required    | Description                                     |
| -------------------- | ----------- | ----------- | ----------------------------------------------- |
| Name                 | Text        | ✅          | Display name for this configuration             |
| Agent                | Lookup/Text | ✅          | Select from Agent Details or enter name         |
| App Insights App ID  | GUID        | ✅          | Application Insights Application ID             |
| Tenant ID            | GUID        | ✅          | Azure AD Tenant ID                              |
| Client ID            | GUID        | ✅          | App Registration Client ID                      |
| Secret Location      | Choice      | ✅          | Dataverse (1) or Key Vault (2)                  |
| Secret               | Text        | Conditional | Client secret (when Location=Dataverse)         |
| Environment Variable | Text        | Conditional | Key Vault secret name (when Location=Key Vault) |

#### Show Agents Dialog

Displays a table of all configured agents with:

- Agent Name
- App Insights App ID
- Last Sync Date
- Status
- **Edit** button (opens Add Agent Dialog in edit mode)
- **Delete** button (with confirmation)

#### Bulk Import Dialog

Excel-like spreadsheet interface with:

- **Download Template**: Get Excel template with headers
- **Upload File**: Drag & drop or click to upload Excel/CSV
- **Paste from Excel**: Copy cells and paste directly into grid
- **Row Validation**: Real-time validation with error highlighting
- **Progress Bar**: Shows import progress during bulk create
- **Import All**: Creates all valid configurations

| Column               | Width | Required    | Description                |
| -------------------- | ----- | ----------- | -------------------------- |
| Name                 | 140px | ✅          | Configuration display name |
| Agent Name           | 140px | ✅          | Copilot Studio agent name  |
| App Insights App ID  | 280px | ✅          | Application ID GUID        |
| Tenant ID            | 280px | ✅          | Tenant GUID                |
| Client ID            | 280px | ✅          | Client ID GUID             |
| Secret Location      | 120px | ✅          | 1=Dataverse, 2=Key Vault   |
| Secret               | 200px | Conditional | Client secret value        |
| Environment Variable | 200px | Conditional | Key Vault reference        |

#### Generate Metrics Dialog (Sync Now)

| Field             | Options                       | Description                           |
| ----------------- | ----------------------------- | ------------------------------------- |
| Agent             | [Dropdown]                    | Select specific agent or "All Agents" |
| Date Range        | Last 7/30/90/180 Days, Custom | Period to sync data for               |
| Custom Start Date | Date picker                   | When "Custom" is selected             |
| Custom End Date   | Date picker                   | When "Custom" is selected             |

### Page-Specific Features

#### Daily Metrics Page

| Component                | Description                                            |
| ------------------------ | ------------------------------------------------------ |
| **Summary Metrics Grid** | Key daily metrics in card format                       |
| **Sessions Trend Chart** | Line chart showing daily session counts                |
| **Messages Trend Chart** | Line chart showing daily message volumes               |
| **Data Table**           | Sortable, filterable table of all daily metric records |
| **Export Button**        | Download visible data as Excel                         |

#### Topic Metrics Page

| Component                | Description                                             |
| ------------------------ | ------------------------------------------------------- |
| **Summary Cards**        | Total triggers, completions, abandonments, avg duration |
| **Top Topics Bar Chart** | Horizontal bar chart of most triggered topics           |
| **Completion Rate Pie**  | Donut chart showing completion vs abandonment           |
| **Topic Duration Trend** | Area chart of average topic duration over time          |
| **Data Table**           | Full topic metrics with all columns                     |

#### Error Details Page

| Component                | Description                                         |
| ------------------------ | --------------------------------------------------- |
| **Summary Cards**        | Total errors, unique codes, affected sessions/users |
| **Error Trend Chart**    | Daily error count over time                         |
| **Error Types Pie**      | Distribution of error codes                         |
| **Error Code Bar Chart** | Top error codes by occurrence                       |
| **Data Table**           | Detailed error records with codes, messages, counts |

#### Tool Metrics Page

| Component               | Description                                   |
| ----------------------- | --------------------------------------------- |
| **Summary Cards**       | Total calls, success rate, avg execution time |
| **Tool Usage Pie**      | Distribution of tool/action invocations       |
| **Success Rate Bar**    | Success percentage per tool                   |
| **Response Time Chart** | Average execution time per tool               |
| **Data Table**          | Full tool metrics data                        |

#### Sync Logs Page

| Component            | Description                                                      |
| -------------------- | ---------------------------------------------------------------- |
| **Refresh Button**   | Reload sync log data                                             |
| **Status Badges**    | Color-coded status (Running=blue, Complete=green, Error=red)     |
| **Data Table**       | Sync execution history with status, dates, record counts, errors |
| **Link to Flow Run** | Opens Power Automate flow run details                            |

### Global Filter Bar

Present on all pages in the header:

| Filter           | Type        | Options                                                    | Default                       |
| ---------------- | ----------- | ---------------------------------------------------------- | ----------------------------- |
| **Agent**        | Dropdown    | "All Agents" + list of configured agents                   | All Agents                    |
| **Date Range**   | Dropdown    | Last 7/30/90/180 Days, Custom                              | Last 90 Days                  |
| **Custom Start** | Date Picker | Any date                                                   | Hidden unless Custom selected |
| **Custom End**   | Date Picker | Any date                                                   | Hidden unless Custom selected |
| **Channel**      | Dropdown    | All, Teams, WebChat, DirectLine, Mobile, WhatsApp, Unknown | All                           |
| **Data Mode**    | Dropdown    | Production, Test, Both                                     | Production                    |

### Theme Support

| Theme          | Description                               |
| -------------- | ----------------------------------------- |
| **Light Mode** | Default Fluent UI light theme             |
| **Dark Mode**  | Fluent UI dark theme (toggle in nav rail) |

Navigation rail includes a theme toggle button (sun/moon icon) in the header area.

---

## Appendix

### Dataverse Tables Used

| Table                      | Display Name        | Purpose                               |
| -------------------------- | ------------------- | ------------------------------------- |
| `cat_copilotconfiguration` | Agent Configuration | Agent settings and Azure credentials  |
| `cat_dailymetrics`         | Daily Metrics       | Daily aggregated session/message data |
| `cat_topicmetrics`         | Topic Metrics       | Topic-level performance data          |
| `cat_errordetails`         | Error Details       | Error tracking and analysis           |
| `cat_toolmetrics`          | Tool Metrics        | Action/connector performance          |
| `cat_copilotstudiokitlogs` | Sync Logs           | Flow execution history                |
| `cat_agentdetails`         | Agent Details       | Agent registry                        |

### Technology Stack

| Layer          | Technology                 |
| -------------- | -------------------------- |
| Frontend       | React 18 + TypeScript      |
| UI Components  | Fluent UI v9               |
| Charts         | Fluent UI React Charts     |
| Build Tool     | Vite                       |
| Data Layer     | Dataverse SDK (generated)  |
| Backend        | Power Automate Cloud Flows |
| Authentication | Azure AD OAuth 2.0         |
| Data Source    | Azure Application Insights |

---

_Document generated for Agent Insights Hub v1.1.4_
