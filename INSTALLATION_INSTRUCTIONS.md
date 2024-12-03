# Install the Power CAT Copilot Studio Kit

## Download

1. Download the latest version of the Power CAT Copilot Studio Kit **managed** solution here: <br>
   [aka.ms/DownloadCopilotStudioKit](https://aka.ms/DownloadCopilotStudioKit) 

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

When upgrading to November release from an older version of the kit, please take backup of your agent configuration as the data model for agent configuration has changed.

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

After the import process has finished, complete these steps to enable the Conversation KPIs related flows:
1. Navigate to **Power Automate**
1. Make sure you have the environment with Copilot Studio Kit selected
1. Select **Solutions**
1. Select **Copilot Studio Kit**
1. Select **Cloud flows**
1. Turn on the following flows in the following order
   1. Conversation KPI Tracked Variables Child
   1. Conversation KPI Main Child
   1. Conversation KPI Manual
   1. Synchronize files into Copilot Studio Child Flow
   1. Synchronize into Copilot Studio
   1. Synchronize files into Copilot On Demand
   1. Any remaining flows in the solution that are turned off

> [!NOTE]  
> While upgrading the Copilot Studio Kit, you might encounter the following error: "*Solution "Power CAT Copilot Studio Kit" failed to import: ImportAsHolding failed with exception: Cannot delete attribute: cat_copilottestrunid from Entity: cat_CopilotTestRun since the attribute is not a custom field.*".
>
> This is a known issue that is being investigated. As a workaround, stage the upgrade before applying it. For detailed instructions, please see [here](https://learn.microsoft.com/power-apps/maker/data-platform/update-solutions).

## Access the Power CAT Copilot Studio Kit app

1. Go to **[make.powerapps.com](https://make.powerapps.com/)**
1. Select to the **environment** in which you want to install the Power CAT Copilot Studio Kit.
1. Navigate to **Apps**.
1. Locate and select **Power CAT Copilot Studio Kit**.
1. Select **Play**.
1. **Bookmark** the app (optional)

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
1. Click "**...**" and select **View semantic model**
1. Open **File**->**Settings**
1. Verify that **Data source credentials** don't have any issues, sign-in to fix as required.
1. Navigate to **Refresh** and set the refresh schedule to your liking.

### Updating the environment variable

In order to set up the embedded Conversation KPIs dashboard, you need to update the related environment variable with correct identifiers.

1. Navigate to Power Apps and to the environment where you installed the Copilot Studio Kit
1. Open **Solutions** and **Default Solution**
1. Select **Environment variables**
1. Locate and select **Conversation KPIs Report**
1. Replace placeholders in the **Default Value** with the actual **Workspace name**, **Workspace GUID**, **Report Name** and **Report GUID** you noted down during the publishing process.
1. Save

## Next step
[Configure users and teams](/SETUP_USERS_AND_TEAMS.md)
