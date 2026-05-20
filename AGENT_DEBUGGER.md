# Agent Debugger

The **Agent Debugger** is a diagnostic tool that lets users load any recorded conversation and inspect every decision the agent made — step by step, with timing, token usage, knowledge sources, arguments, and observations.

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Getting Started — Filters](#getting-started--filters)
4. [Analysis View](#analysis-view)
   - [General Information](#general-information)
   - [Execution Path](#execution-path)
   - [Performance Timeline](#performance-timeline)
   - [Conversation Preview](#conversation-preview)
   - [Debug Information](#debug-information)
   - [Transcript JSON](#transcript-json)
5. [Troubleshooting](#troubleshooting)

---

## Overview

When a conversation takes place in Copilot Studio, the platform records a detailed activity log — every message, every plan step triggered, every knowledge source searched, every action invoked — as a **Conversation Transcript** in Dataverse. The Agent Debugger reads that transcript and surfaces it in a structured, human-readable interface.

**What it shows:**

| Area | What you learn |
|---|---|
| General Information | Session count, turn count, outcome, duration, start time, channel, and AI model used |
| Execution Path | Which topics, actions, knowledge searches, code steps, and connected agents ran — and in what order |
| Performance Timeline | How long each step took per conversation turn; instantly spot slow steps |
| Conversation Preview | Full chat exchange, rendered with markdown and adaptive cards |
| Debug Information | Step-by-step execution for the selected user message: every topic, action, knowledge search, and tool invoked — with thought, arguments, observation, token counts, and knowledge sources |
| Transcript JSON | Full raw transcript activities as syntax-highlighted, searchable JSON — opened via the **View JSON** link in the Conversation Preview header |

**Key capabilities:**

- Debug **multi-agent conversations**: automatically detects connected and child agents, and loads their transcripts automatically
- Inspect **step arguments and observations**: see exactly what inputs were passed to every action, tool, or knowledge source — and what it returned
- Review **token consumption**: prompt and completion token counts per step and per turn
- Correlate **knowledge sources**: see what was searched, what was returned, and what was actually cited in the answer
- Copy conversation IDs, step IDs, or any JSON for use in support tickets or bug reports

---

## Prerequisites

### 1. Agent Inventory

The Agent Debugger lists agents from the Agent Inventory. Run an Agent Inventory sync before using this feature to ensure agents and their transcript availability are up to date.

See the Agent Inventory documentation for setup instructions:
**→ [AGENT\_INVENTORY.md](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/AGENT_INVENTORY.md)**

### 2. Security role and connection permissions

The feature is available only to users with either the **CSK – Administrator** or **System Administrator** security role within the kit.

Additionally, the signed-in user must have **Read** access to the required tables in the target environment where agent resides. For user-level access, the **Bot Transcript Viewer** and **Bot Viewer** security roles can be assigned within the target environment. Feel free to create custom security roles with required **Read** level permissions on below tables and assign it to signed-in user.

| Table | Logical Name |
|---|---|
| **Conversation Transcripts** | `conversationtranscripts` |
| **Bot Components** | `botcomponents` |

> **Cross-environment access:** If the agent being debugged is in a different environment from where the kit is installed, the signed-in user must have required read permissions.

---

## Getting Started — Filters

When you open Agent Debugger, you see a three-step cascading filter bar before any data is loaded.

```
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────────┐
│  Environment     │ → │  Agent           │ → │  Conversation ID     │
│  (dropdown)      │   │  (dropdown)      │   │  (search + dropdown) │
└──────────────────┘   └──────────────────┘   └──────────────────────┘
                                                           │
                                                   [ Analyze ]
```

### Filter 1 — Environment

Populated from the distinct environment names found in Agent Inventory. Selecting an environment narrows the Agent dropdown to only agents registered in that environment.

### Filter 2 — Agent

Shows all agents in the selected environment that have at least one conversation transcript. Selecting an agent loads the most recent 50 conversations for the Conversation ID dropdown.

### Filter 3 — Conversation ID

- **Default:** Shows the 50 most recent unique conversations for the selected agent.
- **Typing in the box:** Triggers a full search across all transcripts for that agent (up to 100,000 records), allowing you to find older or specific conversations.

Once a Conversation ID is selected, the **Analyze** button becomes active. Click it to open the full analysis view.

---

## Analysis View

The analysis view opens after clicking **Analyze**. It consists of a **General Information** summary row at the top, an **Execution Path** and **Performance Timeline** for step-level inspection, a **Conversation Preview** panel with a **View JSON** link for the raw Transcript JSON, and a **Debug Information** panel for per-step details.

### General Information

Displayed as summary cards at the top of the analysis view.

| Field | Description |
|---|---|
| **Sessions** | Number of conversation sessions (multiple sessions occur when a user returns to the same conversation after inactivity) |
| **Turns** | Number of user messages in the conversation |
| **Outcome** | Session outcome reported by the platform (e.g., Resolved, Escalated, Abandoned, SystemError) |
| **Duration** | Total conversation duration from first to last activity |
| **Start Time** | When the conversation began (local time) |
| **Channel** | Communication channel used (e.g., webchat, msteams) — shown when available |

### Execution Path

The Execution Path lists every step the agent's orchestrator executed, grouped by conversation turn. Each step card shows the step name, type, duration, and outcome.

### Performance Timeline

The Performance Timeline shows execution time per step across all turns, making it easy to identify which steps caused latency. Steps are grouped by conversation turn and displayed with their duration. The slowest step in each turn is highlighted so bottlenecks are immediately visible.

### Conversation Preview

The Conversation Preview panel shows the full conversation exchange as it appeared to the user, including bot and user messages, Adaptive Cards, suggested actions, feedback, and knowledge references. Clicking a user message loads that turn's steps into the Debug Information panel. The **View JSON** link in the header opens the full Transcript JSON dialog.

### Debug Information

The Debug Information panel shows detailed information for a selected step: the LLM's reasoning thought, input arguments, observation returned, token usage, and knowledge sources searched and cited. Click any user message in the Conversation Preview to load its steps, then select a step to view its details here.

For **multi-agent conversations**, the Agent Debugger automatically detects connected and child agents from the parent transcript and surfaces them as special step cards. Each connected agent card shows the agent name, execution time, the instruction passed to it, and the child conversation ID. The child transcript and its metadata are loaded automatically — every step the child agent executed is available directly from the card.

### Transcript JSON

The **View JSON** link in the Conversation Preview header opens a dialog showing the full raw transcript activities with syntax highlighting, search, and copy-to-clipboard.

Use this when:
- You need to inspect an event type not surfaced in the Debug Information panel
- You want to copy specific fields for a support ticket
- You are investigating unexpected behaviour in the parsed views

---

## Troubleshooting

### Agent does not appear in the Environment or Agent dropdown

**Cause:** The agent has not been synced to Agent Inventory, or it doesn't have any conversation transcripts.

**Resolution:**
1. Run a manual Agent Inventory sync for the environment in question.
2. Verify the agent record exists in the `cat_agentdetails` table in Dataverse.
3. Check that the `cat_istranscriptavailablecode` column is set to `1` on that record. The sync sets this flag when at least one transcript exists.
4. See [AGENT\_INVENTORY.md](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/AGENT_INVENTORY.md) for full sync instructions.


### Conversation ID not found in the dropdown

**Cause:** The dropdown pre-loads only the 50 most recent conversations for performance — older transcripts still exist in Dataverse but are not shown by default. Alternatively, the transcript may not have been written yet if the conversation just ended.

**Resolution:**
1. Type the conversation ID directly into the Conversation ID field — this triggers a full search across all transcripts for that agent.
2. If the conversation just ended, wait 35-40 minutes for the transcript to be written to Dataverse, then refresh.


### "Analyze" loads but shows no steps in the Debug Information panel

**Cause:** The transcript exists but contains only message-type activities with no diagnostic trace events. This typically happens when the conversation came from a channel that does not emit trace data (e.g., certain custom channels or very old schema versions).

**Resolution:**
1. Click the **View JSON** link in the Conversation Preview header to confirm activities are present.
2. Look for `type: "trace"` or `type: "event"` entries. If absent, the channel may not emit trace data — this is expected for certain custom channels and older schema versions.


### "Access denied" or blank page on load

**Cause:** Missing roles or permissions in one or both environments.

**Resolution:**
1. In the **kit environment**, the user must have the **CSK - Administrator** or **System Administrator** role to access Agent Debugger.
2. In the **target environment** where the agent resides, the singed-in user must have sufficient access to read the `conversationtranscripts`, and `botcomponents` tables.


### Transcripts appear incomplete (missing early messages)

**Cause:** Long conversations are split across multiple Dataverse records (1 MB limit per record). If some records were purged due to retention policy, the merged transcript will have gaps.

**Resolution:**
1. Dataverse purges conversation transcripts older than 30 days by default. If retention is the issue, update the bulk delete job schedule in **Power Apps → Settings → Advanced settings → Data Management → Bulk Record Deletion**.
2. If retention is not the cause, verify that all transcript records for the conversation exist in the `conversationtranscripts` table in Dataverse.


### Steps show raw schema names instead of readable topic names

**Cause:** The `botcomponents` table lookup failed or the component record was deleted.

**Resolution:**
1. Verify the signed-in user has read access to the `botcomponents` table in the target environment.
2. If the component was deleted from Copilot Studio, no matching record exists and the debugger falls back to the raw schema name (e.g. `cr123_mytopic`). This is expected for deleted topics or actions.
