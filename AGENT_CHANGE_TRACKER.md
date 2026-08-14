# Agent Change Tracker

## Table of Contents

- [1. Overview](#1-overview)
- [2. Prerequisites](#2-prerequisites)
- [3. Getting Started](#3-getting-started)
  - [3.1 Run Agent Inventory Sync](#31-run-agent-inventory-sync)
  - [3.2 Add an Agent for Tracking](#32-add-an-agent-for-tracking)
  - [3.3 Continuous Change Tracking](#33-continuous-change-tracking)
- [4. Properties That Are Not Tracked](#4-properties-that-are-not-tracked)
- [5. Filters](#5-filters)
- [6. Change History](#6-change-history)
- [7. Actions](#7-actions)
- [8. Current Limitations](#8-current-limitations)
- [9. Troubleshooting](#9-troubleshooting)

---

## 1. Overview

**Agent Change Tracker** helps makers understand what changed in their Microsoft Copilot Studio agents, who made the change, and when it was saved.

After an agent is added for tracking, future saved changes automatically appear as grouped events in the Maker app. Changes can be reviewed by save, user, date, change type, and component type.

The timeline can show:

- Components or settings that were **Added**, **Updated**, or **Removed**
- The user who made the change
- The date and time of the save
- A version number for each save
- Before and after values for supported settings
- Friendly summaries and YAML details for supported agent components

> **Preview scope:** Agent Change Tracker currently supports agents in the **current environment**. Support for tracking all agents available in Agent Inventory is planned for a future release.

---

## 2. Prerequisites

Before using Agent Change Tracker, ensure the following requirements are met:

1. **Run Agent Inventory sync** - The Agent Inventory sync must complete at least once so Agent Change Tracker can list agents and their environment details.

   See [Agent Inventory documentation](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/AGENT_INVENTORY.md).

2. **User security role** - The feature is available to users with the **CSK - Maker** or **CSK - Administrator** security role.

3. **Current-environment access** - The signed-in user must be able to read the agent and its Copilot Studio components in the current Dataverse environment.

4. **App sharing** - The Copilot Studio Kit Maker app must be shared with the maker who will use the feature.

---

## 3. Getting Started

### 3.1 Run Agent Inventory Sync

Agent Change Tracker uses Agent Inventory as its source for the agents available in the **Track Agent** dialog.

1. Run the Agent Inventory sync for the current environment.
2. Wait for the sync to complete.
3. Confirm that the agent appears in Agent Inventory.
4. Open the **Copilot Studio Kit Maker** app.
5. Select **Agent Change Tracker** under **Productivity**.

If an agent is missing from the selection list, run Agent Inventory sync again and confirm that the agent belongs to the current environment.

### 3.2 Add an Agent for Tracking

1. Open **Agent Change Tracker**.
2. Select **Track Agent**.
3. In **Select agent for tracking**, type an agent name to search.
4. Select the agent.
5. Select **Add**.

When the agent is added, Agent Change Tracker:

1. Creates a tracking configuration for the agent.
2. Reads the agent and its components from the current environment.
3. Captures the current configuration as the baseline.
4. Stores the baseline as the agent's tracked state.
5. Activates change tracking.

The baseline represents the agent at the moment tracking starts. It does not appear as a change in the timeline.

> On first use, if no agents are tracked, the feature may automatically add up to five frequently used agents from the current environment. An agent is eligible for this first-run setup when it has more than 50 conversation transcripts in the previous 30 days.

### 3.3 Continuous Change Tracking

After an agent is added for tracking, tracking continues automatically. Makers can continue updating the agent in Copilot Studio as usual. When any maker saves a supported change to that agent, the change is captured and becomes available in Agent Change Tracker.

To review the history, select the tracked agent in Agent Change Tracker. The timeline groups related changes by save and shows when the change was made, who made it, and what was added, updated, or removed. Expand a save or an individual change card to view more details, including before and after values or YAML when available.

The history refreshes automatically. Select **Refresh** if a recent saved change is not yet visible.

---

## 4. Properties That Are Not Tracked

Due to current feature limitations, Agent Change Tracker cannot track changes to the following properties:

### Authentication

- **Authentication - Require users to sign in**
- **Authentication - Redirect URL**
- **Authentication - Service provider**
- **Authentication - Federated credential issuer**
- **Authentication - Federated credential value**
- **Authentication - Client ID**
- **Authentication - Token exchange URL**
- **Authentication - Login URL**
- **Authentication - Scopes**

Agent Change Tracker records the supported high-level authentication mode, but it does not display the authentication properties listed above.

### Optimized Canvas

- **Optimized Canvas - On/Off**
- **Optimized Canvas - Activation Threshold**

### Application Insights and advanced telemetry

- **Connection string**
- **Where can I find my connection string?**
- **Advanced options**
- **Log sensitive properties**
- **Node execution events**
- **Include node-level details in transcripts**
- **Enable sentiment analysis**

### Channels

- **Channel display name suffix**

Changes that only affect one of these properties will not produce a corresponding change card in the Agent Change Tracker timeline.

---

## 5. Filters

The filter bar appears after selecting a tracked agent.

| Filter | Description |
|---|---|
| **User** | Shows saves made by one or more selected users; the default is **All users**. |
| **Change type** | Shows **Added**, **Updated**, or **Removed** changes; multiple change types can be selected. |
| **Date** | Limits history to **All time**, **Last 24 hours**, **Last 7 days**, **Last 30 days**, or **Last 90 days**. |
| **Component type** | Shows only selected categories that exist in the agent's history, such as Settings, Instructions, Topics, Tools, or Knowledge sources. |

Select **Clear filters** to restore all filters to their default values.

The **Search agents** box in the tracked-agents panel filters the tracked list by agent name or environment.

---

## 6. Change History

Change history is organized by save transaction. Changes made in the same save are displayed together in one expandable group.

Each save group includes:

- Save date and time
- The user who made the change
- Counts of added, updated, and removed items
- A sequential agent version such as `v1.0.0.1`
- One card for each supported change in the save

The feature uses `1.0.0.0` for the hidden baseline. The first recorded save is displayed as `1.0.0.1`, the next as `1.0.0.2`, and so on.

History is retained for **30 days**. Older change-history records expire automatically.

For long histories, the timeline initially displays 25 save groups. Additional groups appear automatically as the user scrolls or when **Show earlier changes** is selected.

---

## 7. Actions

| Action | Description |
|---|---|
| **Track Agent** | Opens the agent selection dialog and adds the selected current-environment agent to change tracking. |
| **Select tracked agent** | Opens the selected agent's change history. |
| **Search agents** | Filters the tracked-agent list by agent name or environment. |
| **Open agent in Copilot Studio** | Opens the selected agent in Copilot Studio in a new browser tab. |
| **Refresh** | Immediately requests the latest change history instead of waiting for automatic polling. |
| **View YAML** | Shows the supported component definition for detailed review. |
| **Remove tracking** | Permanently deletes the tracking configuration, change history, and related records for the agent. This action cannot be undone. |

Removing tracking does not delete the Copilot Studio agent. It only deletes the Agent Change Tracker records associated with that agent.

---

## 8. Current Limitations

- Agent Change Tracker is currently limited to tracking agents in the **current environment**.
- A future release is planned to support tracking all agents available in Agent Inventory across environments.
- Tracking begins when the baseline is captured; changes made before the agent was added are not reconstructed.
- Change history is retained for 30 days.
- The properties listed in [Properties That Are Not Tracked](#4-properties-that-are-not-tracked) do not appear in the timeline.
- Some platform-generated or semantically unchanged updates are intentionally suppressed to reduce duplicate or noisy change cards.

---

## 9. Troubleshooting

### An agent does not appear in the Track Agent dialog

1. Confirm that Agent Inventory sync completed successfully.
2. Confirm that the agent appears in Agent Inventory.
3. Confirm that the agent is in the current environment.
4. Refresh Agent Change Tracker.

### A recent save does not appear

1. Confirm that the agent was added for tracking before the change was made.
2. Wait at least 20 seconds for automatic refresh.
3. Select **Refresh**.
4. Clear any active filters.
5. Confirm that the changed property is not listed under [Properties That Are Not Tracked](#4-properties-that-are-not-tracked).

### Tracking cannot be activated

Confirm that the current environment contains the Agent Change Tracker configuration and outbox components and that the signed-in user can access them.

### The timeline shows no changes

The baseline itself is not displayed. Save a tracked change in Copilot Studio, return to Agent Change Tracker, and select **Refresh** if the change does not appear automatically.

### A tracked agent is marked Deleted

The underlying Copilot Studio agent no longer exists in the current environment. The retained history can still be reviewed until tracking is removed or the 30-day history retention period expires.
