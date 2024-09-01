# Enable Application Insights support

## Prerequisites

- Application Insights resource has been created and Copilot has been configured to send telemetry to it. Please see instructions [here](https://learn.microsoft.com/microsoft-copilot-studio/advanced-bot-framework-composer-capture-telemetry?tabs=webApp#connect-your-copilot-studio-copilot-to-application-insights).

## Steps to enable Application Insights support in Copilot Studio Kit

To enable Application Insights support in Copilot Studio Kit, new application registration is required.

1. [Register new application in Microsoft Entra ID](https://learn.microsoft.com/azure/azure-monitor/logs/api/register-app-for-token) and add new client secret for it. Make note of the secret as it will be used later as **App Insights Secret** in the Copilot configuration (depending on App Insights Secret location, please see the details [here](./CONFIGURE_COPILOTS.md#configure-a-new-copilot).)
1. Make note of the **Directory (tenant) ID** and **Application (client) ID** of the application as they will be used later as **App Insights Tenant ID** and **App Insights Client ID** in the Copilot configuration
1. Select **View API permissions** from the **Overview** (or navigate to **Manage** -> **API permissions** from the sidebar)
1. Select **Add a permission**
1. Select **APIs my organization uses** and search for **Application Insights API**. Select **Application Insights API** from the list.
1. Select **Delegated permissions**
1. Check **Data.Read** and proceed with **Add permissions**

![copilot-appinsights-permissions](https://github.com/user-attachments/assets/4f30f351-e7ff-4329-83aa-f4c9dc25191f)

And finally, you need to grant this application access to your Application Insights resource

1. Navigate to the Application Insights resource in Azure Portal.
1. Select **Access control (IAM)**.
1. Select **Add role assignment**.
1. Select **Reader** from the list and click **Next**.
1. Select **Select members**.
1. Search and select your application from the list. Finish by clicking **Select**
1. Proceed to **Review + assign** by clicking **Next**
1. Review the permissions and finish by clicking **Review + assign** button from the bottom of the screen.
