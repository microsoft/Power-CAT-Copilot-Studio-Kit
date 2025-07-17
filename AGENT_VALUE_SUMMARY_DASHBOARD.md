# Agent value summary dashboard

The **Agent Value Component** is a modular solution designed to classify conversational and autonomous agents in Microsoft Copilot Studio according to their **type**, **behavior**, and **value benefit**. This classification enables organizations to:

* Understand the role and purpose of agents.
* Align agents with strategic goals.
* Quantify the value each agent delivers.

The component is composed of:

* A classification **Agent Value** table.
* A custom page that visualizes the spread and distribution of classified agents.
* Power Automate flows for automated classification using AI tools.
* An environment variable to enable the component

This is version (v1) of the component. It classifies agents based on static metadata and prompt-driven logic. V2 may extend this with session-level telemetry for real-time value estimation.

## Setup

### Environment variable
The environment variable "**Enable Value Component**" must be set to 'Yes' in order for the automated flows to operate

### Power Automate Flows
Must be 'Turned On' in order to operate

### Populating the Agent Value table
The cloud flow "**Value Summary | Initialize agent value inventory**" must be manually run.


## Dataverse table

1. **Agent Value**
The Agent value table is the core metadata table in V1 of the agent value component. It stores the classification output for each agent, including:

* Agent type
* Primary behavior
* Value benefit
* Date of classification

This table is automatically populated by Power Automate flows using AI tools prompt responses.

### Table schema

| Column name| Type | Description |
|:-----------|:------|:-------------|
| AgentId | Guid | Id of classified agent|
| Name | Text | Agent display name |
| Agent Type | Text | One of: Collaborator, Performer, Retriever, Orchestrator, Assistant, Advisor |
| Agent Behavior | Text | One of Sense, Decide, Act, Collaborate, Reflect, Respond |
| Agent Value Benefit | Text | One of ten defined value benefits |
| Classification date | Date/Time | Date of agent classification |
| EnvironmentDisplayName | Text | Display name of agents environment |
| EnvironmentId | Text | Id of environment |

## Power Automate Flows

1. Value summary | Initialize agent value inventory

> **Important:** This flow must be enabled and run manually in order to populate the Agent Value table. Only agents with completed metadata (description and instructions) will be classified.

**Triggered:** manually
**Purpose:** Iterates through all agents in the Agent Details table and classifies them if both the description and instructions are present.
**Actions:** 
* Filter agents with missing metadata
* Call AI Builder 'Run a prompt' action with the embedded classification prompt
* Parse and update:
- Agent Type
- Agent Behavior
- Agent Value Benefit
- Environment Id
- Environment Display Name
- Classification date

2. Value summary | New agent classification

**Triggered:** When a new row is added to Agent Details
**Purpose:** Runs classification immediately for new agents
**Actions:**
* Same logic as above, scoped to a single agent row

## AI Tools prompt: Classify agent

The "Run a prompt" action uses a structured system prompt to classify the agent. The embedded prompt includes:

### Prompt objective

Given an agent's instructions and description, assign it:

- A primary Agent Type
- A dominant Behavior
- A Value benefit it most likely delivers
- A simple formula or signal to measure this value
