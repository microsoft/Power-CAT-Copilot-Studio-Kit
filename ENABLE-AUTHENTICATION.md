# Enable end user authentication

Copilot Studio Kit supports testing custom Copilots with end user authentication enabled using Entra ID v2 (Azure Active Directory v2) as the service provider.

For more information on how to enable user authentication for custom Copilot in **Microsoft Copilot Studio**, please see https://learn.microsoft.com/en-us/microsoft-copilot-studio/configuration-authentication-azure-ad

## Modify the user authentication application

To enable end user authentication support on **Copilot Studio Kit**, dataverse environment URL has to be added as Single-page application redirect URI on the application registration used for user authentication.

Please note that user authentication has to be enabled in **Microsoft Copilot Studio** and application registration created before proceeding with these steps.

1. Log in to the [Azure Portal](https://portal.azure.com/).
1. Navigate to the App registrations.
1. Locate and select the application used for user authentication
1. Note down the Application (client) ID and Directory (tenant) ID - these will be used later in Copilot Configuration as **Client ID** and **Tenant ID**.
1. In the sidebar, navigate to Manage > Authentication.
1. Add your Dataverse environment URL (https://<hostname>.crm.dynamics.com/) to the Single-page application redirect URI list. 

<img alt="copilot-user-auth-portal-redirect-uri" src="https://github.com/user-attachments/assets/343c43eb-1b5f-4bd3-aae3-23d5dbaf81ae">

## Enable user authentication on your Copilot configuration

Install Copilot Studio Kit 

1. Navigate to **Copilot Studio Kit**
2. 
