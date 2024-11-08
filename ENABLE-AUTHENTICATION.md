# Enable user authentication

**Copilot Studio Kit** supports testing custom Agents with user authentication using Entra ID v2 (Azure Active Directory v2) as the service provider with SSO enabled. These instructions will help you to make sure you have the necessary prerequisites in place and to create the required app registration (or modify existing app) to be used with Copilot Studio Kit for user authentication. 

Some of the required actions have already been described in detail in the **Microsoft Copilot Studio** documentation, and for those we will refer to the existing documentation instead of duplicating the steps here.

## Prerequisites
**Microsoft Copilot Studio** has been configured to support single sign-on with Microsoft Entra ID. For more information on how to configure SSO in the **Microsoft Copilot Studio**, please see the instructions [here](https://learn.microsoft.com/microsoft-copilot-studio/configure-sso).

On this page, we refer to the existing app created for user authentication as the **"copilot_auth_app"** 

> [!NOTE]  
> If you have already created app registration for App Insights enrichment, you **may** reuse that application as **"kit_canvas_app"** instead of creating another application. If you wish to do that, you can skip the **Create the app registration** step below and proceed with **Add Redirect URI**. 

## Create canvas app registration for Copilot Studio Kit
On this page, we refer to the new app created specifically for Copilot Studio Kit as the **"kit_canvas_app"** 

### 1. Create the app registration ("kit_canvas_app")
Follow [these](https://learn.microsoft.com/en-us/microsoft-copilot-studio/configuration-authentication-azure-ad#create-an-app-registration) steps to create new app registration to use with **Copilot Studio Kit**. Make note of the **Client ID** and **Tenant ID** of the app registration.

### 2. Add Redirect URI
With these steps, you will add the Dataverse URL of the environment hosting Copilot Studio Kit as **redirect URI** to the **"kit_canvas_app"** to allow Copilot Studio Kit to use this app registration for authentication purposes.
1. After creating the app registration, go to **Authentication**, and then select **Add a platform**.
1. Under **Platform configurations**, select **Add a platform**, and then select **Single-page application**.
1. Under **Redirect URIs**, enter your **Dataverse environment URL** (https://\<hostname>\.crm.dynamics.com/)
1. In the **Implicit grant and hybrid flows section**, turn on both Access tokens (used for implicit flows) and ID tokens (used for implicit and hybrid flows).
1. Select **Configure** to confirm your changes.
1. Go to **API Permissions**. Select **Grant admin consent** for <your tenant name> and then **Yes**. For this step, you might have to reach out to your administrator if you do not have the required permissions.

### 3. Define a custom scope for your Agent
Following [these](https://learn.microsoft.com/en-us/microsoft-copilot-studio/configure-sso?tabs=classic#define-a-custom-scope-for-your-copilot) steps, associate your **"copilot_auth_app"** with the **"kit_canvas_app"**. In the **Expose an API**-step, make note of the full scope URI (api://1234-4567/scope.name).

You will need to enter the **Client ID**, **Tenant ID** and the **Full scope URI** in the Agent configuration to enable user authentication support in the Copilot Studio Kit.

> [!NOTE]  
> If you are planning to test Agents using SharePoint as knowledge source, you need to add **Files.Read.All** and **Sites.Read.All** delegated API permissions to your application (**"copilot_auth_app"**). Remember to specify the same scopes in Copilot Studio as described [here](https://learn.microsoft.com/microsoft-copilot-studio/nlu-generative-answers-sharepoint-onedrive#advanced-authentication-scenarios).
