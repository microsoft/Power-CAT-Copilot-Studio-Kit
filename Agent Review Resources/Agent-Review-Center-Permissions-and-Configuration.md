# Agent Review Center

## Permissions and Configuration Checklist

## Purpose

This guide gives the environment settings and security roles that Agent Review Center needs. Agent Review Center uses Power Apps Code Apps and Copilot Studio conversation transcripts.

The customer tenant admin usually grants these items, with help from the Power Platform admin and the System Administrator of each environment.

## Before you start

Make sure that the tenant has these items. The tenant admin usually supplies them.

- A Copilot Studio tenant license, and a Copilot Studio User License for each reviewer. You can share an agent only with users who have this user license.
- Power Apps Premium coverage for each user of Agent Review Center. This can be a Power Apps Premium license, pay-as-you-go billing, an App Pass, or auto-claim.
- Copilot Credits from a Copilot Studio capacity pack or a pay-as-you-go billing plan.

**Learn more:** [Assign licenses and manage access to Copilot Studio](https://learn.microsoft.com/en-us/microsoft-copilot-studio/requirements-licensing) | [Microsoft Copilot Studio licensing guidance](https://www.microsoft.com/licensing/guidance/microsoft-copilot-studio) | [Power Apps code apps overview](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/overview)

## Setup summary

| Requirement | Where to configure it | Who can configure it | Why it is necessary |
|---|---|---|---|
| **TARGET INSTALLATION ENVIRONMENT — STEPS 1-2** | | | |
| **Dataverse environment, not preview** | Power Platform admin center > Manage > Environments | Power Platform admin | Agent Review Center, Code Apps, and transcripts use Dataverse. |
| **Copilot Credits allocated** | Power Platform admin center > Licensing > Copilot Studio > Manage capacity | Power Platform admin | An environment can use prepaid credits only after you allocate them to it. |
| **Power Apps Code Apps on** | Power Platform admin center > Manage > Environments > Settings > Product > Features | Power Platform admin or environment admin | This setting lets the environment run code apps. |
| **AGENT ENVIRONMENT — STEPS 3-4** | | | |
| **Transcript recording on** | Power Platform admin center > Manage > Environments > Settings > Product > Features > Copilot Studio agents | Power Platform admin or environment admin | This setting saves agent session transcripts and metadata in Dataverse. |
| **Agent shared with reviewer** | Copilot Studio > agent > Share | Agent owner. A System Administrator assigns roles. | Transcript access applies only to agents that the user creates or that are shared with the user. |
| **Bot Transcript Viewer role** | Dataverse environment security roles, or Copilot Studio agent sharing | System Administrator, or an admin with permission to manage environment roles | This role lets the user read conversation transcripts. The Environment Maker role does not give this access. |
| **TARGET INSTALLATION ENVIRONMENT — STEPS 5-6** | | | |
| **Solution installed, flows on** | Power Apps > Solutions; Power Automate > Solutions > Cloud flows | System Administrator | A flow can run only if its connection references have valid connections. |
| **App role and app sharing** | Power Platform admin center > Environments > Users or Teams; Power Apps > Apps > Share | System Administrator; app owner | A user must have table access and a shared app to open Agent Review Center. |

## 1 Prepare the target installation environment

> **SCOPE — TARGET INSTALLATION ENVIRONMENT**
> Do these steps in the environment where you will install Agent Review Center.

- Use a Power Platform environment that has a **Dataverse** database.
- Do not use a **Dataverse for Teams** environment. In this type of environment, Copilot Studio does not save transcripts to the Dataverse transcript table.
- Use a standard release environment. Do not use an **early release cycle** environment. Early release environments get updates first and are for preview use, not for production.
- Allocate Copilot Credits to the environment. Go to **Power Platform admin center > Licensing > Copilot Studio**, and then select **Manage capacity**.

**Learn more:** [Create and manage environments](https://learn.microsoft.com/en-us/power-platform/admin/create-environment) | [Power Apps preview program and early release cycle environments](https://learn.microsoft.com/en-us/power-apps/maker/powerapps-preview-program) | [Manage Copilot Studio credits and capacity](https://learn.microsoft.com/en-us/power-platform/admin/manage-copilot-studio-messages-capacity)

## 2 Make sure that Power Apps Code Apps is on

> **SCOPE — TARGET INSTALLATION ENVIRONMENT**
> An environment setting controls Power Apps Code Apps.

1. Sign in to **Power Platform admin center**.
2. Select **Manage > Environments**.
3. Select the target installation environment.
4. Select **Settings > Product > Features**.
5. Find **Power Apps code apps**.
6. Look at the **Enable code apps** setting:
   - **On:** Code Apps are available in the environment.
   - **Off:** Code Apps are not available in the environment.
7. If the setting is **Off**, set **Enable code apps** to **On**.
8. If you changed the setting, select **Save**.

> [!NOTE]
> **WHO CAN CHANGE THIS SETTING**
> A Power Platform admin or an environment admin must change this setting. To change many environments at the same time, use environment groups and rules.

**Learn more:** [Power Apps code apps overview](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/overview)

## 3 Set transcript recording to on

> **SCOPE — AGENT ENVIRONMENT**
> Do these steps in the environment of the agent that you review.

Transcript recording and transcript access are two different items:

> [!IMPORTANT]
> **KEY DIFFERENCE**
> **Transcript recording** controls if the system saves conversation data.
> **Transcript access** controls who can read this data.

In **Power Platform admin center**, do these steps:

1. Select **Manage > Environments**.
2. Select the agent environment.
3. Select **Settings > Product > Features**.
4. Go to the **Copilot Studio agents** section.
5. Set these two settings to on:
   - Allow agent owners and editors to see session transcripts from conversation interactions in their agents.
   - Allow conversation transcripts and their associated metadata to be saved in Dataverse.
6. Select **Save**.

> [!CAUTION]
> Set the Dataverse transcript setting to on **before** the review period starts.
> This setting controls if the system writes transcripts to the Dataverse transcript table. The system saves transcripts only for conversations that occur after you set it to on.

An environment admin can change this setting for one environment. A System Administrator can apply the environment group rule **Accessing transcripts from conversations in Copilot Studio agents**. This rule overrides the settings of each environment in the group.

**Learn more:** [Control transcript access and retention](https://learn.microsoft.com/en-US/microsoft-copilot-studio/admin-transcript-controls)

## 4 Give access to the agent and its transcripts

> **SCOPE — AGENT ENVIRONMENT**
> In the agent environment, each reviewer must have three items:

- The Environment Maker role
- Shared access to the agent
- The Bot Transcript Viewer role

### Environment Maker role

A user must have the **Environment Maker** security role before you can share an agent with the user. This role includes the **ChatBotReaders** privilege. Users need this privilege to chat with agents in the environment.

The Environment Maker role does not give access to transcripts.

### Share the agent with the reviewer

The Bot Transcript Viewer role gives access only to transcripts of agents that the user creates or that are shared with the user. Thus, share the agent first:

1. Open the agent in **Copilot Studio**.
2. Select **...** > **Share**.
3. Add the reviewer.
4. Select a permission for the reviewer.
5. Select **Share**.

Copilot Studio has these permissions:

- **Editor** (collaborative authoring). The reviewer can see, edit, configure, share, and publish the agent. The reviewer cannot delete the agent.
- **Analytics Viewer.** The reviewer can see only the Analytics page of the agent. To see transcript data on this page, the reviewer must also have the Bot Transcript Viewer role.
- **Agent viewer.** The reviewer can see and run evaluations on the Evaluation page. The reviewer cannot change the agent.

### Give Bot Transcript Viewer access

**Bot Transcript Viewer** is a Dataverse security role. It is not an environment feature setting. By default, only admins have this role.

Give this role to each user who must read conversation transcripts. Assign the role in the agent environment in one of these two ways:

- **During agent sharing.** If the user who shares the agent is a System Administrator, the share panel shows the **Environment security roles** section. Assign the role in this section.
- **In Power Platform admin center.** Select the user under **Access > Users**. Then select **Manage security roles**.

> [!NOTE]
> The Environment Maker role alone does not give access to transcripts.
> If the agent content is sensitive, give transcript access only to users who have privacy training.

**Learn more:** [Share agents with other users](https://learn.microsoft.com/en-us/microsoft-copilot-studio/admin-share-bots) | [Download conversation transcripts in Power Apps](https://learn.microsoft.com/en-US/microsoft-copilot-studio/analytics-transcripts-powerapps)

## 5 Install the solution provided by Agent Review Center team

> **SCOPE — TARGET INSTALLATION ENVIRONMENT**
> Use an account that has the System Administrator role in the environment.

Before you start, make sure that the data policies of the environment allow all connectors that the solution uses. These connectors include Microsoft Dataverse. Code apps apply data policies when the app starts.

### Import the solution and set the connections

1. Sign in to **Power Apps**.
2. Select the target installation environment.
3. Select **Solutions > Import solution**.
4. Select **Browse**.
5. Select the managed solution file.
6. Select **Next**.
7. Examine the solution details.
8. Select **Next**.
9. For each connection reference, create or select a connection. This includes the Microsoft Dataverse connection reference.
10. Select **Import**.
11. Wait until the import is complete.

After the import, do these steps:

1. Open the solution.
2. Select **Connection references**.
3. Make sure that each connection reference has a valid connection.
4. If you change a connection reference, select **Save**.

### Make sure that the cloud flows are on

If each connection reference has a connection, the import gives each flow the status that it had at export. Thus, the flows are usually already on. To make sure, do these steps:

1. Sign in to **Power Automate**.
2. Select the target installation environment.
3. Select **Solutions**.
4. Open the Agent Review Center solution.
5. Select **Cloud flows**.
6. Make sure that the **Status** of each flow is **On**.
7. If the status of a flow is **Off**, select the flow and select **Turn on**.

> [!NOTE]
> The user who imports the solution becomes the owner of all its components. These components include flows and connection references. Select this user carefully.

**Learn more:** [Data policies](https://learn.microsoft.com/en-us/power-platform/admin/wp-data-loss-prevention) | [Import a solution that contains cloud flows](https://learn.microsoft.com/en-us/power-automate/import-flow-solution) | [Use a connection reference in a solution](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/create-connection-reference)

## 6 Give users access to Agent Review Center

> **SCOPE — TARGET INSTALLATION ENVIRONMENT**
> Each user must have two items:

- A security role that gives access to the Agent Review Center Dataverse tables
- Access to the code app

### Assign the Agent Review Center security role

You can assign the role to a Microsoft Entra ID group team. Members of the group then get the role automatically. You can also assign the role to individual users.

1. Sign in to **Power Platform admin center**.
2. Select **Manage > Environments**.
3. Select the target installation environment.
4. Under **Access**, select **See all** for **Teams** or for **Users**.
5. If you use a group team, do these steps:
   - Select **Create team**.
   - Set **Team type** to **Microsoft Entra ID Security Group**.
   - Select the group.
6. If you use individual users, select the user.
7. Select **Manage security roles**.
8. Select the Agent Review Center role.
9. Select **Save**.

### Share the code app

1. Sign in to **Power Apps**.
2. Select **Apps**.
3. Find **Agent Review Center**.
4. Select the item that has the type **Code**.
5. Select **...** > **Share**.
6. Add the users or security groups.
7. Select **Share**.

Code apps use the same sharing limits as canvas apps.

**Learn more:** [Manage group teams](https://learn.microsoft.com/en-us/power-platform/admin/manage-group-teams) | [Assign a security role to a user](https://learn.microsoft.com/en-us/power-platform/admin/assign-security-roles) | [Share a canvas app with your organization](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/share-app)

## Checklist

Before you use Agent Review Center, make sure that:

### Target installation environment

- [ ] The environment has Dataverse.
- [ ] The environment is a standard release environment, not an early release environment.
- [ ] The environment has an allocation of Copilot Credits.
- [ ] Power Apps Code Apps is on.

### Agent environment

- [ ] Transcript recording is on.
- [ ] The system saves transcripts and metadata in Dataverse.
- [ ] Each reviewer has the Environment Maker role.
- [ ] Each reviewer has shared access to the agent.
- [ ] Each reviewer who must read transcripts has the Bot Transcript Viewer role.
- [ ] No one uses the Environment Maker role as a replacement for the Bot Transcript Viewer role.

### Agent Review Center installation

- [ ] The solution is installed in the target installation environment.
- [ ] Each connection reference has a valid connection.
- [ ] Each cloud flow is on.
- [ ] Each user has the Agent Review Center security role.
- [ ] Each user has access to the shared code app.
- [ ] A Power Platform admin, an environment admin, or a System Administrator is available to change settings and assign roles.

## Open items

Public Microsoft documentation does not cover these items from the setup slide. The Agent Review Center team must give the answers.

1. **Security role:** What is the name of the Agent Review Center security role? Do admins and reviewers get different roles?
2. **Agent permission:** Must reviewers have the Editor permission ("Agent Maker" on the slide)? Or is a read-only permission enough, such as Analytics Viewer or Agent viewer?
3. **Workflows:** Must classic Dataverse workflows also be on, in addition to cloud flows?
4. **Provisioning settings:** What does "Not preview" include? Which other settings does the incomplete list on the slide include?
5. **Copilot Credit use:** Which Agent Review Center features use credits? You need this information to calculate the environment allocation.

## References

### Licensing and capacity

- [Assign licenses and manage access to Copilot Studio](https://learn.microsoft.com/en-us/microsoft-copilot-studio/requirements-licensing)
- [Microsoft Copilot Studio licensing guidance](https://www.microsoft.com/licensing/guidance/microsoft-copilot-studio)
- [Manage Copilot Studio credits and capacity](https://learn.microsoft.com/en-us/power-platform/admin/manage-copilot-studio-messages-capacity)
- [Power Apps code apps overview](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/overview)

### Environment and installation

- [Create and manage environments](https://learn.microsoft.com/en-us/power-platform/admin/create-environment)
- [Power Apps preview program and early release cycle environments](https://learn.microsoft.com/en-us/power-apps/maker/powerapps-preview-program)
- [Data policies](https://learn.microsoft.com/en-us/power-platform/admin/wp-data-loss-prevention)
- [Import a solution that contains cloud flows](https://learn.microsoft.com/en-us/power-automate/import-flow-solution)
- [Use a connection reference in a solution](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/create-connection-reference)
- [Manage group teams](https://learn.microsoft.com/en-us/power-platform/admin/manage-group-teams)
- [Assign a security role to a user](https://learn.microsoft.com/en-us/power-platform/admin/assign-security-roles)
- [Share a canvas app with your organization](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/share-app)

### Agent access and transcripts

- [Share agents with other users](https://learn.microsoft.com/en-us/microsoft-copilot-studio/admin-share-bots)
- [Control transcript access and retention](https://learn.microsoft.com/en-US/microsoft-copilot-studio/admin-transcript-controls)
- [Download conversation transcripts in Power Apps](https://learn.microsoft.com/en-US/microsoft-copilot-studio/analytics-transcripts-powerapps)
