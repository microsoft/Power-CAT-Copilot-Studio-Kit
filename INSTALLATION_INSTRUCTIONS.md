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
1. Power Apps will recognize that this is an upgrade to an existing managed solution. Confirm that you want to upgrade the existing solution by clicking **Next** and then **Import**

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

## Configure Conversation KPI report (optional)

1. Download "**Conversation KPIs.pbit**" from the Copilot Studio Kit GitHub repository
1. Open the file in Power BI Desktop
1. Enter the Dataverse URL as the "**Environment URL**" in the dialog that pops up and select **Load** (e.g. org3c23948.crm.dynamics.com, without https:// prefix)
   1. If the question does not pop-up for some reason, enter the "**Environment URL**" in **Home**->**Transform data**->**Edit parameters**
1. Refresh data, sign in as required.
1. Save and publish to a workspace
1. Navigate to "**https://app.powerbi.com/**"
1. Open the workspace where you saved the report to.
1. Locate and open the semantic model (the dataset) for the report (it has the same name, different type)
1. Open **File**->**Settings**
1. Verify that **Data source credentials** don't have any issues, sign-in to fix as required.
1. Navigate to **Refresh** and set the refresh schedule to your liking.
1. 
1. 
1. 

## Next step
[Configure users and teams](/SETUP_USERS_AND_TEAMS.md)
