# Agent Inventory

## Agent Inventory overview

Copilot Studio Kit Agent Inventory feature can be used to easily get a tenant-wide visibility to all the **custom agents** and **declarative agents** in the organization, across environments. Agent inventory data includes basic metadata like creation times, publish status and authentication mode, as well as information on the feature usage like knowledge sources used, usage of prompts, orchestration type and more.

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
You can view usage details for your agent over the past 180 days in **Agent Inventory**. Agent Usage Metrics is distributed as an optional separate solution due to its connector requirements.

### Prerequisites 

Before using the usage metrics feature:

1. **Install** the **Copilot Studio Kit main solution**.
2. **Ensure** that the connector **HTTP with Microsoft Entra ID (preauthorized)** is allowed in your environment.

### Installation Instructions 

To enable usage metrics on top of the Copilot Studio Kit main solution, you must **import the `AgentInventoryUsage` solution**, available in the **Latest release Assets directory**.

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


> [!NOTE]
> The visibility to agents is *limited* and *controlled* by the connection references in the solution. 

## Data Collection Modes

The data collection process is controlled by the **Enable One Inventory** environment variable, which determines how agent data is retrieved and loaded into Agent Inventory.

### Enable One Inventory = "Yes" (One Inventory mode)

When **Enable One Inventory** is set to **Yes**, the process uses One Inventory data:

1. Agent data is retrieved from One Inventory through the Power Platform Admin Center.
2. Environments are listed using the **Copilot Studio Kit - Power Platform for Admins V2** connector.
3. The One Inventory agent data is combined with the environments list to construct environment details.
4. For each environment, agent details are loaded into Agent Inventory by merging agents fetched from the environment with the corresponding One Inventory data.

### Enable One Inventory = "No" (Standard mode)

When **Enable One Inventory** is set to **No**, the process follows the standard data collection approach:

1. All environments are listed using the **Copilot Studio Kit - Power Platform for Admins V1** connector.
2. Agents are fetched for each environment.
3. Agent data is loaded into Agent Inventory.

In both modes, the **Copilot Studio Kit - Dataverse** connector connects to each environment to gather detailed agent information (metadata, feature usage, configuration) — but only where the configured account has **system admin access**.

For full tenant-wide visibility, the connection references must be configured with an account that has the **Power Platform admin role** and to view all the features need to have **system admin level permission** to all environments. Other accounts can be used, but the inventory will be limited to the environments the user has system admin access to.

Back to the [landing page](./README.md#power-cat-copilot-studio-kit)
