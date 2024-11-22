# Enable user authentication

**Copilot Studio Kit** supports testing custom Copilots with user authentication using Entra ID v2 (Azure Active Directory v2) as the service provider with SSO enabled. These instructions include all the steps required to enable end user authentication on your agent in Copilot Studio, create and configure the required applications in Azure Portal and finally create the agent configuration in Copilot Studio Kit.

## Prerequisites
- Copilot Studio Kit has been installed

## Create authentication application for Copilot Studio Kit
Related instructions in Microsoft Learn: https://learn.microsoft.com/en-us/microsoft-copilot-studio/configure-sso?tabs=classic#create-an-app-registration-in-microsoft-entra-id-for-your-custom-canvas

1. Navigate to **Azure Portal**
1. Navigate to **App registrations** in Azure Portal
1. Select **New registration**
1. Enter a name for your application. We will call this application "**KitAuthApp**".
1. Under **Supported account types**, select **Accounts in any organizational tenant (Any Microsoft Entra ID directory - Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)**.
1. Leave the **Redirect URI** section blank for now. We will be entering that information later in the next steps.
1. Select **Register**, you will be sent to the "**Overview**"-page of your new application.
1. Make note of the "**Directory (tenant) ID**" and "**Application (client) ID**". We will need these when creating agent registration in Copilot Studio Kit and associating the Copilot Studio with the Copilot Studio Kit app.
1. Expand **Manage** and select **Authentication**
1. Under **Platform configurations**, select **Add a platform**, and then select **Single-page application**.
1. Under **Redirect URIs**, enter your **Dataverse environment URL** (https://\<hostname>\.crm.dynamics.com/)
1. In the **Implicit grant and hybrid flows**-section, turn on both **Access tokens** (used for implicit flows) and **ID tokens** (used for implicit and hybrid flows).
1. Select **Configure** to confirm your changes.
1. Go to **API Permissions**.
1. Select **Grant admin consent for <your tenant name>**, and then select **Yes**. If the button isn't available, you might need to ask a tenant administrator to do enter it for you.

## Create authentication application for Copilot Studio
Related instructions in Microsoft Learn: https://learn.microsoft.com/en-us/microsoft-copilot-studio/configuration-authentication-azure-ad

1. Navigate to **Azure Portal**
1. Navigate to **App registrations** in Azure Portal
1. Select **New registration**
1. Enter a name for your application. We will call this application "**CopilotStudioAuthApp**".
1. Under **Supported account types**, select **Accounts in any organizational tenant (Any Microsoft Entra ID directory - Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)**.
1. Leave the **Redirect URI** section blank for now. We will be entering that information later in the next steps.
1. Select **Register**, you will be sent to the "**Overview**"-page of your new application.
1. Make note of the "**Directory (tenant) ID**" and "**Application (client) ID**". We will need these when enabling end user authentication in Copilot Studio.
1. Expand **Manage** and select **Authentication**
1. Under **Platform configurations**, select **Add a platform**, and then select **Web**.
1. Under **Redirect URIs**, enter "**https://token.botframework.com/.auth/web/redirect**", and select **Configure**. This action takes you back to the **Platform configurations** page.
1. Under **Redirect URIs** for the **Web** platform, select **Add URI**.
1. Enter "**https://europe.token.botframework.com/.auth/web/redirect**", and select **Save**.
1. In the **Implicit grant and hybrid flows** section, select both **Access tokens (used for implicit flows)** and **ID tokens (used for implicit and hybrid flows)**.
1. Select **Save**
1. Under **Manage**, select **Certificates & secrets**.
1. In the **Client secrets** section, select **New client secret**.
1. Enter a **description**. Preferably something descriptive.
1. Select the **expiry period**.
1. Select **Add** to create the secret.
1. Make note of the secret's "**Value**". We will need this when enabling end user authentication in Copilot Studio.
1. Under **Manage**, select **API permissions**.
1. Select **Add a permission**, and then select **Microsoft Graph**.
1. Select **Delegated permissions**.
1. Expand **OpenId permissions** and turn on "**openid**" and "**profile**".
1. (Optional, required for SharePoint knowledge source) Expand **Files** and turn on **Files.Read.All**
1. (Optional, required for SharePoint knowledge source) Expand **Sites** and turn on **Sites.Read.All**
1. Select **Add permissions**
1. Select **Grant admin consent for <your tenant name>**, and then select **Yes**. If the button isn't available, you might need to ask a tenant administrator to do enter it for you.
1. Select **Expose an API** and select **Add a scope**
1. Select **Save and continue**
1. In **Scope name**, enter descriptive name. We will use **copilot.studio.scope**.
1. Under **Who can consent?**, select **Admins and users**
1. Enter descriptive name and description in **Admin consent display name** and **Admin consent description**
1. Ensure **State** is **Enabled**
1. Select **Add scope**
1. Make note of the full scope name under **Scopes**. We will need this later when enabling end user authentication in Copilot Studio. (api://xxx/copilot.studio.scope)
1. Select **Add a client application**
1. In **Client ID**, enter the **Client ID** of the "**KitAuthApp**" that we created earlier.
1. Verify that the scope in **Authorized scopes** is the one that you created earlier (**copilot.studio.scope**). Turn on (check) that scope.
1. Select **Add application**.

## Enable end user authentication on your custom agent
Related instructions in Microsoft Learn: https://learn.microsoft.com/microsoft-copilot-studio/configure-sso and https://learn.microsoft.com/microsoft-copilot-studio/nlu-generative-answers-sharepoint-onedrive#advanced-authentication-scenarios

1. Navigate to **Copilot Studio**
1. Open **Settings**
1. Select **Security**
1. Select **Authentication**
1. Select **Authenticate manually**
1. Enable **Require users to sign in**
1. Do not change **Redirect URL**, make sure **Service provider** is **Azure Active Directory v2**.
1. In **Client ID**, enter the **Client ID** of **CopilotStudioAuthApp**
1. In **Client secret**, enter the **Client secret** created for **CopilotStudioAuthApp**
1. In **Token exchange  URL**, enter the full name of the scope (api://xxx/copilot.studio.scope) that we created for **CopilotStudioAuthApp**
1. (Optional, required for SharePoint knowledge source) In **Scopes**, add **Files.Read.All**
1. (Optional, required for SharePoint knowledge source) In **Scopes**, add **Sites.Read.All**
1. Click **Save**, then **Save** again from the dialog.
1. Close **Settings**
1. Click **Publish**, then **Publish** again from the dialog.

## Create agent configuration with end user authentication enabled
Related instructions in the Copilot Studio Kit repository: https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/CONFIGURE_COPILOTS.md

1. Navigate to Copilot Studio Kit
1. Select **Agents** from the navigation.
1. Click **New**
1. Enter **Name**
1. From **Configuration Type(s)** select **Test Automatiojn**
1. Fill  **Direct Line Settings**-section, enter either **Token Endpoint** or enable **Channel Security** and enter Direct Line secret.
1. In **User Authentication**-section, for **User Authencation** select **Entra ID v2**
1. For **Client ID**, enter the **Client ID** of **KitAuthApp**
1. For **Tenant ID** enter the **Directory ID** of **KitAuthApp**
1. For **Scope**, enter the full scope name (api://xxx/copilot.studio.scope) created for **CopilotStudioAuthApp**
1. Click **Save & Close**

Now you are ready to start testing your agent with end user authentication enabled!

To recap what we did here:
-Created app registration specifically for Copilot Studio Kit authentication
-Created app registration for Copilot Studio authentication
-Linked the applications so that Copilot Studio Kit is able to authenticate to Direct Link via Copilot Studio authentication application
-Enabled authentication in custom agent in Copilot Studio
-Created agent configuration in Copilot Studio Kit with end user authentication enabled
