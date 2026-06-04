# Agent Debugger

The **Agent Debugger** is a diagnostic tool that lets users load any recorded conversation and inspect every decision the agent made — step by step, with timing, token usage, knowledge sources, arguments, and observations.

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Getting Started — Filters](#getting-started--filters)
   - [Time Range Filter](#time-range-filter)
   - [Error Conversations Filter](#error-conversations-filter)
   - [Upload Snapshot Mode](#upload-snapshot-mode)
4. [Analysis View](#analysis-view)
   - [General Information](#general-information)
   - [Execution Path (Topic Flow Diagram)](#execution-path-topic-flow-diagram)
   - [Performance Timeline](#performance-timeline)
   - [Agent Details](#agent-details)
   - [Recommendations](#recommendations)
   - [Conversation Preview](#conversation-preview)
   - [Debug Information](#debug-information)
   - [Transcript JSON](#transcript-json)
5. [Troubleshooting](#troubleshooting)

---

## Overview

The Agent Debugger supports two data sources:

- **Conversation Transcript (Dataverse)** — when a conversation takes place in Copilot Studio, the platform records a detailed activity log as a Conversation Transcript in Dataverse. The Agent Debugger queries those records directly, so any published agent with transcript data is immediately available.
- **Copilot Studio Snapshot (ZIP)** — Copilot Studio's built-in **test pane** includes a **Download snapshot** button that exports the current test conversation as a ZIP file (`dialog.json` + `botContent.yml`). Dropping that ZIP into the Agent Debugger's Upload Snapshot tab gives you the full analysis view without any Dataverse connection. This is useful for debugging pre-production conversations, reproducing issues offline, or sharing a failing session with a colleague.

Both paths feed the same analysis interface — the panels, step details, and visualizations are identical regardless of how the data was loaded.

**What it shows:**

| Area | What you learn |
|---|---|
| General Information | Session count, turn count, outcome, duration, start time, channel, and AI model used |
| Execution Path | Which topics, actions, knowledge searches, code steps, and connected agents ran — and in what order, as a visual flow diagram |
| Performance Timeline | How long each step took per conversation turn; instantly spot slow steps and latency bottlenecks |
| Agent Details | Full agent configuration at the time of the conversation: instructions, topics, tools, knowledge sources, and child agents |
| Recommendations | Automatically detected issues with severity ratings, descriptions, and suggested fixes |
| Conversation Preview | Full chat exchange, rendered with markdown and adaptive cards |
| Debug Information | Step-by-step execution for the selected user message: every topic, action, knowledge search, and tool invoked — with thought, arguments, observation, token counts, knowledge sources, and error details |
| Transcript JSON | Full raw transcript activities as syntax-highlighted, searchable JSON — opened via the **View JSON** link in the Conversation Preview header |

**Key capabilities:**

- Debug **multi-agent conversations**: automatically detects connected and child agents, and loads their transcripts on demand
- Inspect **step arguments and observations**: see exactly what inputs were passed to every action, tool, or knowledge source — and what it returned
- Review **token consumption**: prompt and completion token counts per step and per turn, with model name
- Correlate **knowledge sources**: see what was searched, what was returned, and what was actually cited in the answer
- Surface **AI reasoning**: view the orchestrator's thought process before each step invocation
- Inspect **MCP server interactions**: protocol details, capabilities, and tool definitions for Model Context Protocol steps
- Review **Responsible AI blocks**: see when content was filtered and why
- Analyze **test-pane conversations offline** by uploading a Copilot Studio snapshot ZIP — no Dataverse connection needed
- Copy conversation IDs, step IDs, or any JSON for use in support tickets or bug reports

---

## Prerequisites

### 1. Agent Inventory

The Agent Debugger lists agents from the Agent Inventory. Before using this feature, the agent must be present in the Agent Inventory **and** have at least one conversation transcript recorded against it.

You can verify this by opening the Agent Inventory list view, selecting the agent, and clicking **Show more** to expand the additional fields. The **Is Transcript Available** field must be set to **Yes** — this flag is set automatically by the inventory sync when at least one conversation transcript exists for the agent in Dataverse.

> **→ See [Agent Inventory — List View](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/AGENT_INVENTORY.md#list-view) for instructions on how to use Show more and verify this field.**

If **Is Transcript Available** is **No**, the agent will not appear in the Agent dropdown in Agent Debugger. Run a manual Agent Inventory sync for the environment to refresh the flag, then check again.

See the Agent Inventory documentation for full setup instructions:
**→ [AGENT\_INVENTORY.md](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/AGENT_INVENTORY.md)**

### 2. Security role and connection permissions

The user must have the **CSK - Administrator** or **System Administrator** security role within the kit for this feature to be accessible.

The **Dataverse connection reference** used by the app must have **Read** access to the following tables in the target environment:

| Table | Logical Name |
|---|---|
| **Conversation Transcripts** | `conversationtranscripts` |
| **Bots** | `bot` |
| **Bot Components** | `botcomponents` |

> **Cross-environment access:** If the agent being debugged is in a different environment from where the kit is installed, the Dataverse connection must be authenticated in that remote environment with the same read permissions.

---

## Getting Started — Filters

When you open Agent Debugger, you see a filter bar with five controls before any data is loaded.

```
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────────┐
│  Environment     │ → │  Agent           │ → │  Conversation ID     │
│  (dropdown)      │   │  (dropdown)      │   │  (search + dropdown) │
└──────────────────┘   └──────────────────┘   └──────────────────────┘

┌───────────────────────────────┐   ┌──────────────────────────────────┐
│  Time Range                   │   │  Error conversations only        │
│  (preset or custom date/time) │   │  (toggle)                        │
└───────────────────────────────┘   └──────────────────────────────────┘
                                                           │
                                                   [ Analyze ]
```

### Environment

Populated from the distinct environment names found in Agent Inventory. Selecting an environment narrows the Agent dropdown to only agents registered in that environment.

### Agent

Shows all agents in the selected environment whose **Is Transcript Available** flag is set to **Yes** in Agent Inventory. This flag indicates the agent has at least one conversation transcript recorded in Dataverse. If an agent you expect to see is missing, verify its **Is Transcript Available** value using **Show more** in the [Agent Inventory list view](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/AGENT_INVENTORY.md#list-view) and run a manual sync if needed.

Selecting an agent loads the most recent 50 conversations within the selected time range for the Conversation ID dropdown.

### Time Range Filter (Optional)

A time range control appears alongside the filter bar to narrow the Conversation ID list to a specific window.

When **Custom range** is selected, date and time pickers appear to set an exact start and end timestamp. The Conversation ID dropdown is then repopulated with transcripts created within that window.

> **Note:** Typing a Conversation ID directly always searches all transcripts regardless of the active time range.


### Error Conversations Filter (Optional)

The **Show error conversations only** toggle filters the Conversation ID dropdown to conversations that contain at least one failed step or system error. Enable this when you are triaging incidents or reviewing agents with known reliability problems.

> **Performance note:** When enabled, the debugger scans the raw content of recent transcripts client-side to identify error patterns. This takes longer than the standard query. Leave the toggle off unless you specifically need to filter by errors.

### Conversation ID

- **Default:** Shows the 50 most recent unique conversations for the selected agent within the configured time range.
- **Typing in the box:** Triggers a full search across all transcripts for that agent (up to 100,000 records), allowing you to find older or specific conversations regardless of the time range.

Once a Conversation ID is selected, the **Analyze** button becomes active. Click it to open the full analysis view.

---

### Upload Snapshot Mode

The **Upload Snapshot** tab provides an alternative entry point that does not require Dataverse access. Instead of selecting a live conversation from the dropdowns, you upload a snapshot ZIP file downloaded directly from **Copilot Studio's test pane**.

**How to get a snapshot from Copilot Studio:**

1. Open your agent in **Copilot Studio** and navigate to the **Test** pane.
2. Run or review a conversation in the test pane.
3. Click the **Save snapshot** button (available in the test pane toolbar).
4. Copilot Studio downloads a `.zip` file containing:
   - `dialog.json` — all Bot Framework activities for the conversation (required)
   - `botContent.yml` — the bot's full component and flow definitions, used to resolve step names (optional; if absent, raw schema names are shown)

**When to use:**

- Debugging a conversation that happened in the **test pane** before the agent was published
- Analyzing a conversation from an environment you cannot authenticate against
- Reproducing issues offline or sharing a failing session with a colleague without granting Dataverse access
- Validating agent behavior in a local development environment

**How to upload:**

1. Switch to the **Upload Snapshot** tab in the Agent Debugger header.
2. Drag-and-drop the `.zip` file onto the drop zone, or click to browse for it.
3. The debugger validates the ZIP, extracts `dialog.json` and `botContent.yml`, and opens the full analysis view.

No environment, agent, or conversation ID selection is required — all metrics are derived directly from the uploaded file.

---

## Analysis View

The analysis view opens after clicking **Analyze** (or uploading a snapshot). It consists of a **General Information** summary row at the top, followed by a collapsible analysis section with four panels — **Execution Path**, **Performance Timeline**, **Agent Details**, and **Recommendations** — and a two-panel layout showing the **Conversation Preview** alongside the **Debug Information** panel.

### General Information

Displayed as summary metric tiles at the top of the analysis view.

| Field | Description |
|---|---|
| **Sessions** | Number of conversation sessions (multiple sessions occur when a user returns to the same conversation after inactivity) |
| **Turns** | Number of user messages in the conversation |
| **Outcome** | Session outcome reported by the platform (e.g., Resolved, Escalated, Abandoned, SystemError) |
| **Duration** | Total conversation duration from first to last activity |
| **Start Time** | When the conversation began (local time) |
| **Channel** | Communication channel used (e.g., webchat, msteams) — shown when available |
| **Model** | The AI model used by the agent's orchestrator for this conversation |

An **Open in Copilot Studio** link appears in the General Information header when a live agent is loaded. It opens the agent's configuration page directly in the Copilot Studio portal.

---

### Execution Path (Topic Flow Diagram)

The Execution Path renders as an **SVG-based directed flow chart** showing the full execution order across all conversation turns.

**Layout:**

- Steps flow left-to-right in execution order
- Dashed vertical lines mark **turn boundaries** — each user message starts a new section
- **Turn labels** appear at the top of each section and are clickable — clicking a turn label scrolls the Conversation Preview to that message

**Node types:**

| Node type | Appearance |
|---|---|
| Standard step | Rounded rectangle with step name and type icon |
| Connected agent | Container box grouping the child steps the agent executed |
| Child step | Smaller chip nested inside its parent agent container |

**Color coding:** Each step type has a distinct color. A **legend** at the bottom of the diagram maps colors to step categories (Topic, Knowledge, Tool, Connector, Flow, Code, MCP, Connected Agent, etc.).

**Step metadata:** Each node shows the step name and execution duration. Failed steps are highlighted in red.

---

### Performance Timeline

The Performance Timeline shows a **waterfall chart** of step execution times, grouped by conversation turn.

**Features:**

- **Expand/Collapse All** buttons toggle all turn sections at once
- Each turn section is collapsible individually
- **Per-turn statistics** show step count, slowest step name and duration, and failure count
- **Global summary** at the top shows total steps, total elapsed time, the slowest step across the entire conversation, and total failure count
- Step bars are **scaled to the turn's total duration**, making relative timing visible at a glance
- Steps slower than **5 seconds** are flagged with a warning indicator
- Color coding matches the Execution Path legend
- Failed steps appear in red

---

### Agent Details

The Agent Details panel shows the **full configuration of the agent** as it existed at the time the conversation was analyzed. It is organized into six tabs:

#### Overview Tab

Displays KPI tiles summarizing the agent's key configuration settings:

| Tile | Description |
|---|---|
| **Topics** | Total number of topics configured |
| **Tools** | Total number of tools (actions, connectors, flows) |
| **Knowledge** | Total number of knowledge sources |
| **Child Agents** | Number of connected child agents |
| **Orchestration** | Orchestration mode (e.g., Generative, Classic) |
| **Language** | Primary language of the agent |
| **Auth Mode** | Authentication mode (e.g., No Auth, Azure AD, Custom) |
| **Model Knowledge** | Whether the agent uses general model knowledge |
| **Semantic Search** | Whether semantic knowledge search is enabled |
| **Latest Models** | Whether the agent is configured to use the latest available AI models |

Each tile includes a tooltip with a plain-English explanation of the setting.

#### Instructions Tab

Displays the agent's full **system prompt** (instructions) as configured in Copilot Studio. This is the text that guides the orchestrator's behavior across all turns.

#### Topics Tab

Lists all topics configured in the agent. Each topic card shows:

- Topic name and description
- Input and output variables (names and types)
- Status badge (Enabled / Disabled)

#### Tools Tab

Lists all tools (actions) available to the agent. Each tool card shows:

- Tool name and description
- Type badge: **MCP**, **Flow**, **Connector**, or **Prompt**
- Status badge (Enabled / Disabled)

#### Knowledge Tab

Lists all knowledge sources configured for the agent. Each knowledge source card shows:

- Source name
- Type badge: **SharePoint**, **Web**, **Dataverse**, or **File**
- Source URL or path (where applicable)
- Status badge (Enabled / Disabled)

#### Agents Tab

Lists all child agents connected to this agent. Each child agent card shows:

- Agent name
- Relationship type (e.g., Connected Agent)
- Status badge (Enabled / Disabled)

---

### Recommendations

The Recommendations panel automatically detects issues in the conversation and surfaces them as actionable cards with severity ratings.

**Severity levels:**

| Level | Color | Meaning |
|---|---|---|
| **High** | Red | Likely caused a failed or incorrect response; investigate immediately |
| **Medium** | Yellow | Degraded experience or reliability risk; review soon |
| **Low** | Gray | Minor inefficiency or informational note |

**Issue types detected:**

| Issue | Severity | Description |
|---|---|---|
| Failed step / error | High | A step returned an error or exception |
| Responsible AI block | High | Content was filtered by the Responsible AI system |
| Conversation escalation | Medium | The conversation was handed off to a human agent |
| Conversation abandonment | Medium | The user left without a resolution |
| Fallback topic triggered | Medium | The agent failed to route the user's message to a topic |
| Slow step (>5s) | Medium | A step took more than 5 seconds to execute |
| Knowledge search failure | Medium | A knowledge source was queried but returned no results |
| Token limit approached | Medium | Token usage came close to the model's context window limit |
| Code step error | High | A Python code step raised an exception |
| MCP initialization failure | High | An MCP server failed to initialize during the conversation |

Each recommendation card shows:
- Severity icon and color
- Category badge (e.g., "Errors", "Performance", "Knowledge")
- Title and description of the detected issue
- A suggestion for how to investigate or resolve it
- A **Go to turn** button that scrolls the Conversation Preview to the relevant user message

When no issues are detected, the panel shows an **empty state** message. A preview option is available to see example recommendation cards for reference.

---

### Conversation Preview

The Conversation Preview panel shows the full conversation exchange as it appeared to the user, including:

- Bot and user message bubbles
- **Adaptive Cards** rendered inline (interactive cards sent by the agent)
- Suggested action chips
- Feedback prompts

**Interactivity:**

- Clicking a **user message bubble** loads that turn's steps into the Debug Information panel
- The selected message is highlighted so you can track which turn is active
- The panel is independently scrollable

The **View JSON** link in the Conversation Preview header opens the full Transcript JSON dialog.

---

### Debug Information

The Debug Information panel shows step-level details for the selected user message turn. The panel is divided into two parts: a **step list** on the left and a **step detail view** that opens when a step is selected.

#### Step List

The step list shows every orchestrator step executed for the selected turn:

- Step icon and color indicating the step type
- Step name (resolved to a friendly display name where possible)
- Execution duration
- Outcome indicator (success / failure)

Steps belonging to a **connected agent** are grouped inside a collapsible container card showing the agent name and total execution time. Expanding the container shows the child steps the agent executed. A **Fetch transcript** button on the container loads the child agent's full transcript on demand.

**Step types:**

| Type | Description |
|---|---|
| **Topic** | A named topic in the agent's topic list |
| **System Topic** | A built-in platform topic (e.g., Greeting, Fallback, Escalate) |
| **Knowledge** | A knowledge source search step |
| **Tool / Action** | A Power Automate flow or connector action |
| **Code** | A Python code execution step |
| **Custom Prompt** | A custom generative AI prompt step |
| **Reasoner** | An internal reasoning step used by the orchestrator |
| **MCP Server** | A Model Context Protocol tool invocation |
| **Connected Agent** | Delegation to a connected child agent |

#### Step Detail View

Selecting a step opens a detail panel with the following sections (shown when the data is present in the transcript):

**Thought Process**
The orchestrator's reasoning text recorded before the step was invoked. Shows how the model decided to call this step and what it expected from it.

**Step Type**
Classified label for the step (e.g., Topic, Knowledge, Tool, Connector, Code, MCP, Connected Agent).

**Arguments**
A collapsible JSON tree view of the input parameters passed to the step. Includes a copy button to capture the JSON for support tickets.

**Observation**
The output or return value from the step — what the orchestrator received back. Also displayed as a collapsible JSON tree with copy support.

**Code Preview**
For Python code steps, the source code is shown with syntax highlighting.

**Token Usage**
Prompt token count, completion token count, and total for the step, together with the model name used.

**Knowledge Sources**
Broken down into three categories:
- **Searched** — sources that were queried
- **Output** — results returned from the sources
- **Cited** — sources actually referenced in the final response

Each source entry shows the source name, type, URL (where available), and a link to open the source.

**MCP Server Info**
For MCP steps, shows the server's protocol version, declared capabilities, and the list of tools the server provided during initialization.

**Error Information**
When a step failed, shows the error code, error message, and — for Responsible AI blocks — the content safety category that triggered the filter.

**Adaptive Cards**
When the step produced an Adaptive Card response, the card is rendered inline in the detail panel exactly as the user would have seen it.

---

### Transcript JSON

The **View JSON** link in the Conversation Preview header opens a dialog showing the full raw transcript activities with:

- Syntax highlighting
- Full-text search within the JSON tree
- Copy-to-clipboard button for the entire payload

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

**Cause:** The dropdown pre-loads only the 50 most recent conversations within the active time range for performance — older transcripts still exist in Dataverse but are not shown by default. Alternatively, the transcript may not have been written yet if the conversation just ended.

**Resolution:**
1. Type the conversation ID directly into the Conversation ID field — this triggers a full search across all transcripts for that agent, ignoring the time range.
2. If the time range is narrow (e.g., "Last 30 minutes"), expand it or switch to a custom range that covers the conversation date.
3. If the conversation just ended, wait 35–40 minutes for the transcript to be written to Dataverse, then refresh.


### "Analyze" loads but shows no steps in the Debug Information panel

**Cause:** The transcript exists but contains only message-type activities with no diagnostic trace events. This typically happens when the conversation came from a channel that does not emit trace data (e.g., certain custom channels or very old schema versions).

**Resolution:**
1. Click the **View JSON** link in the Conversation Preview header to confirm activities are present.
2. Look for `type: "trace"` or `type: "event"` entries. If absent, the channel may not emit trace data — this is expected for certain custom channels and older schema versions.


### "Access denied" or blank page on load

**Cause:** Missing roles or permissions in one or both environments.

**Resolution:**
1. In the **kit environment**, the user must have the **CSK - Administrator** or **System Administrator** role to access Agent Debugger.
2. In the **target environment** where the agent resides, the Dataverse connection reference must have sufficient access to read the `conversationtranscripts`, `bot`, and `botcomponents` tables.


### Transcripts appear incomplete (missing early messages)

**Cause:** Long conversations are split across multiple Dataverse records (1 MB limit per record). If some records were purged due to retention policy, the merged transcript will have gaps.

**Resolution:**
1. Dataverse purges conversation transcripts older than 30 days by default. If retention is the issue, update the bulk delete job schedule in **Power Apps → Settings → Advanced settings → Data Management → Bulk Record Deletion**.
2. If retention is not the cause, verify that all transcript records for the conversation exist in the `conversationtranscripts` table in Dataverse.


### Steps show raw schema names instead of readable topic names

**Cause:** The `botcomponents` table lookup failed or the component record was deleted.

**Resolution:**
1. Verify the Dataverse connection reference has read access to the `botcomponents` table in the target environment.
2. If the component was deleted from Copilot Studio, no matching record exists and the debugger falls back to the raw schema name (e.g. `cr123_mytopic`). This is expected for deleted topics or actions.


### Agent Details panel shows no data

**Cause:** The agent configuration fetch failed, or the signed-in user's connection does not have read access to the `bot` and `botcomponents` tables in the target environment.

**Resolution:**
1. Verify read access to the `bot` and `botcomponents` tables for the connection reference used by the app.
2. If the agent was deleted or unpublished after the conversation was recorded, its configuration records may no longer exist. In this case the Agent Details panel will remain empty — the transcript and debug panels are still fully functional.


### Recommendations panel shows no issues but the conversation failed

**Cause:** Recommendations are derived from patterns in the transcript trace events. If the transcript lacks trace data (see above), or if the failure occurred outside the conversation (e.g., a silent network timeout not recorded in the transcript), no recommendations will be generated.

**Resolution:**
1. Open the Transcript JSON to look for raw error payloads that may not be surfaced as a recommendation.
2. Check the Execution Path for any steps shown in red — these indicate failures that may not map to a known recommendation pattern.
