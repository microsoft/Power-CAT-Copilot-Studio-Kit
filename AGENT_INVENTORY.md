# Agent Inventory (Preview)

## Agent Inventory overview

Copilot Studio Kit Agent Inventory feature can be used to easily get a tenant-wide visibility to all the Copilot Studio custom agents in the organization, across environments. Agent inventory data includes basic metadata like creation times, publish status and authentication mode, as well as information on the feature usage like knowledge sources used, usage of prompts, orchestration type and more.

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

![agent inventory detailed view](https://github.com/user-attachments/assets/02dd5e90-9810-4bce-b500-df03cee118c6)

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

### How Usage Metrics Are Updated 

Usage data in the **Agent Details** table is refreshed in two ways:

1. **Automatically** every day at **3:00 AM server time**.
2. **Manually** when you perform an **Agent Sync** operation.

### Where to View Usage Data 

In the **Agent Inventory Dashboard**, check the **Agents grid**.
If the field **Usage Metrics Available** is set to **Yes**, a **Usage Data** section will appear in the **Agent Details** page.

![1757887427508](https://github.com/user-attachments/assets/f21cc4bd-b14e-45cb-87fc-85be6a7740f1)

> [!NOTE]
> It is important to understand that the visibility to the agents is *limited* and *controlled* by the connection references in the solution. **Copilot Studio Kit - Power Platform for Admins** is used to fetch the list of environments in the tenant and **Copilot Studio Kit - Dataverse** is used to gather the agent information from the environments. For full visibility, the connection references have to be configured with account having Power Platform admin role and system admin level permission to all the environments. Other accounts can be used as well, but the visibility of the agent inventory is limited to the environments the user has system admin access to.

Back to the [landing page](./README.md#power-cat-copilot-studio-kit)
