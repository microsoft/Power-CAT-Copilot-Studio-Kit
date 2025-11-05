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


> [!NOTE]
> It is important to understand that the visibility to the agents is *limited* and *controlled* by the connection references in the solution. **Copilot Studio Kit - Power Platform for Admins** is used to fetch the list of environments in the tenant and **Copilot Studio Kit - Dataverse** is used to gather the agent information from the environments. For full visibility, the connection references have to be configured with account having Power Platform admin role and system admin level permission to all the environments. Other accounts can be used as well, but the visibility of the agent inventory is limited to the environments the user has system admin access to.

Back to the [landing page](./README.md#power-cat-copilot-studio-kit)
