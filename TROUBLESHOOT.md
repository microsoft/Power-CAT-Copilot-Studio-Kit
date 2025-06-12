# Troubleshoot errors in Power CAT Copilot Studio Kit
## AppForbidden or other DLP errors

Ensure that you have the following connectors allowed in the DLP policy

![image](https://github.com/user-attachments/assets/5fc5ead4-72d4-427b-b354-12940a00a0d8)

## Authentication errors

Typically, two app registrations need to be created for the end user authentication:

**KitAuthApp** – Used in Copilot Studio Kit agent configurations

**CopilotStudioAuthApp**  - Used in Copilot Studio, linked to KitAuthApp

#### General checklist
* Ensure that the custom agent (Copilot Studio) and the Copilot Studio Kit are on the same tenant
* Before enabling end user authentication, make sure authentication is disabled on both the custom agent and agent configuration in Copilot Studio Kit and run a simple test to verify that the connectivity works

#### Checklist for KitAuthApp
* In Azure Portal, Authentication, verify that Web Redirect URI has the Dataverse URI where Copilot Studio Kit is deployed to
* Verify that supported account types is “Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)”
* In API permissions, verify that User.Read permission is in the list, delegated and has admin consent granted
* Verify that client secret is created and that secret is in the Agent Configuration (User Authentication->Client Secret)

#### Checklist for CopilotStudioAuthApp
*	In Azure Portal, Authentication, verify that Web Redirect URI has
    * https://europe.token.botframework.com/.auth/web/redirect
    * https://token.botframework.com/.auth/web/redirect	
* Verify that implicit grant and hybrid flows are enabled for Access tokens and ID tokens
* Verify that supported account types is “Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)”
* In Certificates & secrets, ensure client secret is generated and used in Copilot Studio agent configuration (Settings->Security->Authentication->Client secret)
* In API permissions, verify that openid, profile and User.Read are in the list, delegated and admin consent granted
* In Expose an API, verify that custom scope is created, admins and users can consent and it is enabled. Verify that it is entered in Copilot Studio agent configuration (Settings->Security->Authentication->Token exchange URL)
* Verify that the client id of KitAuthApp is in the Authorized client applications.

#### Checklist for the agent configuration in Copilot Studio
* In Settings->Security->Authentication, verify that
  * Authenticate Manually is enabled
  * Users are required to sign in (at least for the troubleshooting purposes)
  * Redirect URL is set (https://token.botframework.com/.auth/web/redirect)
  * Service provider is Azure Active Directory v2
  * Client ID is the client id of CopilotStudioAuthApp
  * Client secret is the one generated for CopilotStudioAuthApp
  * Token Exchange Url is the custom scope created in CopilotStudioAuthApp
  * Scopes include at least profile and openid
*	Make sure bot has been published with this configuration
*	Ensure that test pane works
*	Ensure that demo site works (including login)

#### Checklist for the agent configuration in Copilot Studio Kit
* Ensure token endpoint is correctly set (copied from mobile channel) OR channel security is set and the correct secret is configured
* Ensure user authentication is set to “Entra ID v2”
* Ensure that the Client ID is the client id of KitAuthApp
* Ensure  Scope is the custom scope created in CopilotStudioAuthApp and same as in Copilot Studio authentication settings
* Ensure	that client secret in User Authentication->Client Secret matches with the value of the client secret created for **KitAuthApp*
* Ensure that **Channel Security** is enabled in **Direct Line Settings** and has valid configuration

#### Checklist for test configuration
* Try your test with and without sending the conversation start event (found from Advanced tab on the test), depending on your agent configuration this might make a difference

#### Checklist for the browser
* Ensure that third-party cookies are allowed from the browser

## Test Run Errors

If any cloud flow fails to run, the corresponding step status will be **Error**.

On the Test Run record, the **Error Details** will display a URL to navigate to the failed cloud flow run instance:

![image](https://github.com/microsoft/Powercat-Copilotstudio-Accelerator/assets/37898885/1603d127-bc28-4c81-9235-e6c486f36347)

You can then troubleshoot further in Power Automate:

![image](https://github.com/microsoft/Powercat-Copilotstudio-Accelerator/assets/37898885/13e7e8bf-318a-480f-8ef7-1f2c87d8c7ea)
