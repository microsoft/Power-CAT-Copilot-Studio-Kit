Before you begin, please make sure to study the [prerequisites](/PREREQUISITES.md)

> [!NOTE]
> Before you download and install the Copilot Studio Kit, ensure that you [enable code components](https://learn.microsoft.com/en-us/power-apps/developer/component-framework/component-framework-for-canvas-apps#enable-the-power-apps-component-framework-feature) in your environment first.

# Installing the Power Cat Copilot Studio Kit ([Appsource](https://appsource.microsoft.com/product/dynamics-365/microsoftpowercatarch.copilotstudiokit?tab=Overview))

## Deploy from AppSource

1. Navigate to Copilot Studio Kit in AppSource (https://appsource.microsoft.com/product/dynamics-365/microsoftpowercatarch.copilotstudiokit?tab=Overview)
1. Click **Get it now**
1. Sign-in if required
1. You are presented with **Install Copilot Studio Kit** view
1. From the drop-down list, select the environment where you want to deploy Copilot Studio Kit
1. Carefully study the presented Terms and Statements, if you agree, check the boxes to indicate that and click **Install**
1. Installation will begin

## Post deployment steps

After the installation finishes, proceed with these post deployment steps:

1. Go to **[make.powerapps.com](https://make.powerapps.com/)**
1. Go to **Solutions**
1. Select **Default Solution**
1. Select **Connection references**
1. Locate "**Copilot Studio Kit - Dataverse**" and open it for editing.
1. Ensure all required fields are filled and the selected connection is valid. Create new connection to Dataverse as required.
1. Click **Save**

Please see the common and optional configuration steps below.

# Installing the Power CAT Copilot Studio Kit (Github)

## Download

1. Download the latest version of the Power CAT Copilot Studio Kit **managed** solution by going to the latest GitHub Release below: <br>
   [Power Cat Copilot Studio Kit Latest GitHub Releases](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/releases/latest) 

## Install CopilotStudioAccelerator.zip

1. Go to **[make.powerapps.com](https://make.powerapps.com/)**
1. Select to the **environment** in which you want to install the Power CAT Copilot Studio Kit.
1. Go to **Solutions**
1. Select **Import Solution**
1. Select **Browse**
1. Select **CopilotStudioAccelerator.zip**
1. Select **Next**
1. After reviewing the solution information, select **Next**
1. If prompted, create the required **connections**, and select **Import**.
1. Leave "**Conversation KPIs report**" values as-is for now, you will be updating these in the later steps.
1. Wait for the import operation to successfully complete.

## Upgrading existing solution

If you have earlier version of Copilot Studio Kit installed and want to upgrade it to the latest version, follow these steps:

1. Go to **[make.powerapps.com](https://make.powerapps.com/)**
1. Select to the **environment** in which you want to install the Power CAT Copilot Studio Kit.
1. Go to **Solutions**
1. Select **Import Solution**
1. Select **Browse**
1. Select **CopilotStudioAccelerator.zip**
1. Select **Next**
1. Power Apps will recognize that this is an upgrade to an existing managed solution.
1. Confirm that you want to upgrade the existing solution by clicking **Next**
1. Leave "**Conversation KPIs report**" values as-is for now, you will be updating these in the later steps.
1. Select **Import**

> [!NOTE]  
> While upgrading the Copilot Studio Kit, you might encounter the following error: "*Solution "Power CAT Copilot Studio Kit" failed to import: ImportAsHolding failed with exception: Cannot delete attribute: cat_copilottestrunid from Entity: cat_CopilotTestRun since the attribute is not a custom field.*".
>
> This is a known issue that is being investigated. As a workaround, stage the upgrade before applying it. For detailed instructions, please see [here](https://learn.microsoft.com/power-apps/maker/data-platform/update-solutions).

# Common and shared configuration steps (applies to both AppSource and GitHub)

## Configure SharePoint Synchronization
Following steps are **optional** and required only if you plan to use the **SharePoint Synchronization** feature. You can also set these later at any time before using the feature.

Please note that the connection to the SharePoint should point to the source SharePoint site, and the Dataverse URL should point to the Dataverse instance associated with the (target) custom agents (where the content is synchronized **to**)

1. Go to **[make.powerapps.com](https://make.powerapps.com/)**
1. Go to **Solutions**
1. Select **Default Solution**
1. Select **Connection references**
1. Locate "**Copilot Studio Kit - SharePoint**" and open it for editing.
1. Ensure all required fields are filled and the selected connection is valid. Create new connection to Sharepoint as required.
1. Click **Save**
1. Select **Environment variables**
1. Locate and select **Dataverse URL**
1. Replace placeholder in the **Current Value** with the actual **Dataverse URL** pointing to the Dataverse instance associated with your **Copilot Studio agents**, for example: https://org123.crm.dynamics.com/
1. Click **Save**

## Configure Agent Inventory
Following steps are **optional** and required only if you plan to use the **Agent Inventory** feature. You can also set these later at any time before using the feature.

Please note that the visibility to the agents is limited and controlled by the connection references in the solution. **Copilot Studio Kit - Power Platform for Admins** is used to fetch the list of environments in the tenant and **Copilot Studio Kit - Dataverse** is used to gather the agent information from the environments. For full visibility, the connection references have to be configured with account having Power Platform admin role and system admin level permission to all the environments. Other accounts can be used as well, but the visibility of the agent inventory is limited to the environments the user has system admin access to.

1. Go to **[make.powerapps.com](https://make.powerapps.com/)**
1. Go to **Solutions**
1. Select **Default Solution**
1. Select **Connection references**
1. Locate "**Copilot Studio Kit - Power Platform for Admins**" and open it for editing.
1. This connection is used to list all the environments in the tenant. Use account with Power Platform Admin level permissions to get full visibility.
1. Ensure all required fields are filled and the selected connection is valid.
1. Click **Save**
1. Locate "**Copilot Studio Kit - Dataverse**" and open it for editing.
1. This connection is used to gather all the agent details from the environments. Use account with System Admin level permissions to all environments to get full visibility. Please note that this connection is used with other features in the Kit as well.
1. Ensure all required fields are filled and the selected connection is valid.
1. Click **Save**

## Enabling flows

> [!NOTE]  
> If you have not set up the environment variable for **SharePoint Synchronization** in the previous step, you don't have to enable the related flows (they start with **Sharepoint Synchronization**). This does not impact other features in the Kit.

1. Navigate to **Power Automate**
1. Make sure the environment with the Copilot Studio Kit is selected
1. Select **Solutions**
1. Select **Copilot Studio Kit**
1. Select **Cloud flows**
1. Make sure all the flows are enabled (Status = On)
1. Enable any flows that are not enabled, in the following order
   1. Flows that end with "**Grandchild**"
   1. Flows that end with "**Child**"
   1. Rest of the flows as required, in any order

## Configure the embedded Conversation KPI dashboard

These steps are required only if you plan to use the embedded Conversation KPI dashboard in the Copilot Studio Kit.

During the steps, please make note of the following values:
- Workspace name
- Workspace GUID
- Report name
- Report GUID

### Publishing the report

1. Download "**Conversation KPIs.pbit**" from the Copilot Studio Kit GitHub repository (November release)
1. Open the "**Conversation KPIs.pbit**" file in the Power BI Desktop-application
1. Enter the Dataverse URL as the "**Environment URL**" in the dialog that pops up and select **Load** (e.g. org3c23948.crm.dynamics.com, without the **https://** prefix)
   1. If the question does not pop up for some reason, enter the "**Environment URL**" in **Home**->**Transform data**->**Edit parameters**
1. Refresh data, sign in as required.
1. Save and publish to a workspace - Make note of the **Report name** and **Workspace name**
1. Navigate to "**https://app.powerbi.com/**" (Power BI service)
1. Open the report you published and make note of the **Workspace GUID** and **Report GUID** that are present in the URL.
   1. Please note that if you are publishing in "My Workspace", the Workspace GUID is: 00000000-0000-0000-0000-000000000000
1. Click "**...**" and select **View semantic model**
1. Open **File**->**Settings**
1. Verify that **Data source credentials** don't have any issues, sign-in to fix as required.
1. Navigate to **Refresh** and set the refresh schedule to your liking.

### Updating the report environment variable

In order to set up the embedded Conversation KPIs dashboard, you need to update the related environment variable with correct identifiers.

1. Navigate to Power Apps and to the environment where you installed the Copilot Studio Kit
1. Open **Solutions** and **Default Solution**
1. Select **Environment variables**
1. Locate and select **Conversation KPIs Report**
1. Replace placeholders in the **Default Value** with the actual **Workspace name**, **Workspace GUID**, **Report Name** and **Report GUID** you noted down during the publishing process.
1. Save

## Access the Power CAT Copilot Studio Kit app

1. Go to **[make.powerapps.com](https://make.powerapps.com/)**
1. Select to the **environment** in which you want to install the Power CAT Copilot Studio Kit.
1. Navigate to **Apps**.
1. Locate and select **Power CAT Copilot Studio Kit**.
1. Select **Play**.
1. **Bookmark** the app (optional)

## Next step
[Configure users and teams](/SETUP_USERS_AND_TEAMS.md)
