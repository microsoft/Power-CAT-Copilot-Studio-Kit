# Agent Inventory

## Agent Inventory overview

Copilot Studio Kit Agent Inventory feature can be used to easily get a tenant-wide visibility to all the **custom agents** and **declarative agents** in the organization, across environments.Agent inventory data includes basic metadata like creation times, publish status and authentication mode, as well as information on the feature usage like knowledge sources used, usage of prompts, orchestration type and more.

## Dashboard

Agent Inventory feature ships with a dashboard that provides an overview on agents, growth and AI adoption. Detailed data is available for each agent and can be exported for use in other applications.

![agent inventory dashboard](https://github.com/user-attachments/assets/f5c556f9-3dd0-41fb-acda-00c64c781b3e)

## Detailed view

From the Agent Inventory dashboard, users can see the total amount of agents in the tenant, usage % of generative AI features, actions and AI builder prompts
and how many agents are leveraging knowledge sources. Also visible are authentication mechanism used by the custom agents, agent creation timeline
visualizing the growth, and a list of top 5 environments by agent count.

Selecting an agent and pressing *View details* brings up a detailed view of the selected agent, including basic metadata on the custom agent,
the environment, creation time and creator, and detailed information the usage of different features such as actions, generative AI, skills, prompts,
knowledge sources and more.

> **Disclaimer:** The usage percentages shown here depend on the environments for which the user has System Administrator access.

![Copilot Studio Kit - Agent Details](https://github.com/user-attachments/assets/5e4e4344-2b0b-4ee6-91d9-7bc87f047fbe)


## List view

And finally, pressing *Show more* from the dashboard view, brings up a list view where users can find the information they are looking for by filtering, sorting and adding additional columns.

![agent inventory list view](https://github.com/user-attachments/assets/2e10abe5-e13e-4aae-a18b-ca6eb6c14469)

## Using Usage Metrics in Agent Inventory 
You can view usage details for your agent over the past 30 days in **Agent Inventory**. Agent Usage Metrics is distributed as an optional separate solution due to its connector requirements.

### Prerequisites 

Before using the usage metrics feature:

1. **Install** the **Copilot Studio Kit main solution**.
2. **Ensure** that the connector **HTTP with Microsoft Entra ID (preauthorized)** is allowed in your environment.

### Installation Instructions 

To enable usage metrics on top of the Copilot Studio Kit main solution, you must **import the `AgentInventoryUsage` solution**, available in the **September release Assets directory**.

During the import process, create a connection using the licensing host URL: https://licensing.powerplatform.microsoft.com/

<img width="400" alt="agent inventory usage" src="https://github.com/user-attachments/assets/bac647a7-462a-4021-ae60-e74094787a64" />

### How Usage Metrics Are Updated 

Usage data in the **Agent Details** table is refreshed in two ways:

1. **Automatically** when the Agent inventory runs on a daily schedule.  
2. **Manually** when you perform an **Agent Sync** operation.

### Where to View Usage Metrics 

In the **Agent Inventory Dashboard**, review the **Agents** grid. 
If the **Total Usage/Month** field contains a value, the **Usage Metrics** section will be displayed on the **Agent Details** page.

![Copilot Studio Kit - Agent Details With Usage](https://github.com/user-attachments/assets/197f0539-016c-4c26-8439-e2382fab9349)

## Technical Details

### Canvas Apps

| Display Name | Logical Name |
|---|---|
| Agent Inventory | `cat_agentinventory` |
| Agent Inventory Component Library | `cat_mcsagentsinventorycomponentlibrary` |

### Connection References

| Connection Reference | Connector | Required | Purpose |
|---|---|---|---|
| Copilot Studio Kit - Dataverse | `shared_commondataserviceforapps` | ✅ Yes | Reads/writes agent data across environments |
| Copilot Studio Kit - Power Platform for Admins | `shared_powerplatformforadmins` | ✅ Yes | Fetches the list of environments in the tenant |
| Copilot Studio Kit - Power Platform for Admins V2 | `shared_powerplatformadminv2` | ✅ Yes | Enhanced admin APIs for environment and agent queries |

> [!NOTE]
> The visibility to agents is *limited* and *controlled* by the connection references in the solution.

The data collection follows a two-step process:

1. **Copilot Studio Kit - Power Platform for Admins V2** connector first retrieves the list of agents from the Power Platform Admin Center (PPAC) and then fetches all environments.

2. **Copilot Studio Kit - Dataverse** connector then connects to each environment to gather detailed agent information (metadata, feature usage, configuration) — but only where the configured account has **system admin access**.

For full tenant-wide visibility, the connection references must be configured with an account that has the **Power Platform admin role** and to view all the features need to have **system admin level permission** to all environments. Other accounts can be used, but the inventory will be limited to the environments the user has system admin access to.

### Environment Variables

| Display Name | Logical Name | Description |
|---|---|---|
| Instance Url | `cat_InstanceUrl` | Dataverse environment URL for the current instance |

### Cloud Flows

| Flow Name | Trigger Type | Purpose |
|---|---|---|
| Agent Inventory \| Agents Data Load | Automated | Main orchestrator — initiates the full inventory sync across all environments |
| Agent Inventory \| Agents Data Load Child | Automated (child) | Per-environment processing — queries agents within a single environment |
| Agent Inventory \| Agents Data Load GrandChild | Automated (child) | Per-agent detail fetch — retrieves detailed metadata for an individual agent |
| Agent Inventory \| Agents Data Load On Demand | Instant (manual) | Manual trigger — lets users kick off an inventory sync on demand |
| Agent Inventory \| Agents Data Load Scheduler | Scheduled (daily) | Daily scheduled run — automatically refreshes inventory data every day |
| Agent Inventory \| Compliance Scan | Automated | Triggers a compliance check after inventory sync completes |

### Dataverse Tables

| Display Name | Logical Name | Description |
|---|---|---|
| Agent Details | `cat_AgentDetails` | Stores agent metadata collected from all environments |
| Agent Usage History | `cat_AgentUsageHistory` | Stores monthly usage metrics (requires optional `AgentInventoryUsage` solution) |

### DLP Configuration

The following connectors must be **allowed** in your environment's DLP policies for Agent Inventory to function:

| Connector | Required For |
|---|---|
| Microsoft Dataverse | Core data storage and retrieval |
| Power Platform for Admins | Environment discovery |
| Power Platform for Admins V2 | Enhanced admin API access |
| HTTP with Microsoft Entra ID (preauthorized) | Optional — only needed for the Usage Metrics solution |

Back to the [landing page](./README.md#power-cat-copilot-studio-kit)
