# Enable user authentication

**Copilot Studio Kit** supports testing custom Copilots with user authentication using Entra ID v2 (Azure Active Directory v2) as the service provider with SSO enabled.

## Prerequisites
**Microsoft Copilot Studio** has been configured to support single sign-on with Microsoft Entra ID. For more information on how to configure SSO in the **Microsoft Copilot Studio**, please see instructions [here](https://learn.microsoft.com/microsoft-copilot-studio/configure-sso).

In this documentation, we refer to the existing app created for user authentication as **"copilot_auth_app"** 

## Create canvas app registration for Copilot Studio Kit
In this documentation, we refer to the new app created specifically for Copilot Studio Kit as **"kit_canvas_app"** 

### Create the app registration
1. Follow [these](https://learn.microsoft.com/en-us/microsoft-copilot-studio/configuration-authentication-azure-ad#create-an-app-registration) steps to create new app registration to use with Copilot Studio Kit.

### Add Redirect URI
With these steps, you will add the Dataverse URL of the environment hosting Copilot Studio Kit as **redirect URI** to the **"kit_canvas_app"** to allow Copilot Studio Kit to use this app registration for authentication purposes.
1. After creating the app registration, go to **Authentication**, and then select **Add a platform**.
1. Under **Platform configurations**, select **Add a platform**, and then select **Web**.
1. Under **Redirect URIs**, enter your **Dataverse environment URL** (https://<hostname>.crm.dynamics.com/)
1. In the **Implicit grant and hybrid flows section**, turn on both Access tokens (used for implicit flows) and ID tokens (used for implicit and hybrid flows).
1. Select **Configure** to confirm your changes.
1. Go to **API Permissions**. Select **Grant admin consent** for <your tenant name> and then **Yes**.
> [!NOTE]
> For the last step (admin consent) you might have to reach out to your administrator if you do not have the required permissions.

### Define a custom scope for your Copilot
1. Following [these](https://learn.microsoft.com/en-us/microsoft-copilot-studio/configure-sso?tabs=classic#define-a-custom-scope-for-your-copilot) steps, associate your **"copilot_auth_app"** with the **"kit_canvas_app"**. Make note of the full scope URI (api://1234-4567/scope.name) from the **Expose an API**-step. You will need to enter the **Client ID**, **Tenant ID** and the **Full scope URI** in the Copilot configuration to enable user authentication support in Copilot Studio Kit.

> [!NOTE]  
> If you are planning to test Copilots using SharePoint as their knowledge source, you need to add Files.Read.All and Sites.Read.All delegated API permissions to your application. Remember to specify the same scopes in Copilot Studio as described [here](https://learn.microsoft.com/microsoft-copilot-studio/nlu-generative-answers-sharepoint-onedrive#advanced-authentication-scenarios).
