# Configure agents in Power CAT Copilot Studio Kit

The custom agents you create and configure in Microsoft Copilot Studio can be tested from the Power CAT Copilot Studio Kit.
To do this, you need to create a **Agent Configuration** record that will contain the required information to connect to these agents and run tests against them.

![configure agents](https://github.com/user-attachments/assets/23586e64-4ea2-4056-abbc-17bb3d4e69a5)

From November 2024 release onwards, multiple configuration types are supported:
- **Test Automation** - Allows bulk testing of custom agents
- **Conversation KPIs** - Parses conversation transcripts of selected custom agents and generates Conversation KPI records
- **File Synchronization** - Allows selectively synchronizing content from SharePoint locations to custom agent knowledge base as files

Multiple configuration types are supported in single agent configuration record. Only relevant configuration sections are visible in the agent configuration view.

## Create new Agent Configuration record

1. Open the Power CAT Copilot Studio Kit application (as seen in [installation instructions](./INSTALLATION_INSTRUCTIONS.md#access-the-copilot-studio-accelerator-app)).
2. Navigate to **Agents**.
3. Create a **New** Agent Configuration record.
4. Fill in the following  **information**.

| Column Name | Required | Description | 
| --- | --- | --- |
| **Name** | Yes | Name of the agent configuration. <br> The name doesn't have to be the same as the agent you target. |
| **Configuration Type(s)** | Yes | Select one or more configuration types as described above. |

Note: These fields are mandatory for all configuration types.

## Configure a new Agent for Test Automation

1. Select "**Test Automation**" from Configuration Type(s).
2. In addition to Base Configuration, fill in the following  **information**.

| Column Name | Required | Description | 
| --- | --- | --- |
| **Region** | Yes | Region where the agent is deployed. <br> This is required to target the appropriate [Direct Line endpoint](https://learn.microsoft.com/azure/bot-service/rest-api/bot-framework-rest-direct-line-3-0-api-reference?view=azure-bot-service-4.0). |
| **Token Endpoint** | Depends | If _Channel Security_ isn't used or enforced, use the [token endpoint](https://learn.microsoft.com/microsoft-copilot-studio/customize-default-canvas?tabs=webApp#retrieve-the-token-endpoint-for-your-agent) that's available in the Email app channel. |
| **Channel Security** |  |  Enable this option if [web and Direct Line channel security](https://learn.microsoft.com/microsoft-copilot-studio/configure-web-security) is enabled. <br> That way, a token can be obtained in exchange for a secret. **Note:** Channel Security needs to be enabled if user authentication is enabled. |
| **Secret Location** | Depends | When _Channel Security_ is checked, choose where you prefer to store the Direct Line channel secret. <br> Dataverse stores the secret in a secured column, while Key Vault requires to use an environment variable of type secret, and storing the secret in a Azure Key Vault. |
| **Secret** | Depends | When _Dataverse_ is selected as the _Secret Location_, this column stores the Direct Line channel secret. |
| **Environment Variable** | Depends | When _Key Vault_ is selected as the _Secret Location_, this column stores the schema name for the environment variable of type secret that links to the Azure Key Vault secret. <br> See [Configure secrets in Azure Key Vault](./CONFIGURE_COPILOTS.md#configure-secrets-in-azure-key-vault)|
| **User Authentication** |  | Select **Entra ID v2** if end user authentication is required for this agent. See [Enable authentication](./ENABLE-AUTHENTICATION.md) for instructions how to enable user authentication support. **Note:** Channel Security needs to be enabled if user authentication is enabled. |
| **Client ID** | Depends | Enter the application (client) ID of the application created to enable the  end user authentication for custom agent (https://learn.microsoft.com/microsoft-copilot-studio/configuration-authentication-azure-ad) |
| **Tenant ID** | Depends | Enter the tenant ID of the application created to enable end user authentication for custom agent |
| **Client Secret** | Depends | Enter the client secret that you created earlier [when enabling authentication support.](./ENABLE-AUTHENTICATION.md#create-authentication-application-for-copilot-studio-kit). "*KitAuthApp secret*" |
| **Scope** | Depends | Enter the custom scope that you created earlier [when enabling authentication support.](./ENABLE-AUTHENTICATION.md#3-define-a-custom-scope-for-your-copilot). Use the full scope URI format: "api://1234-4567/scope.name"|
| **Enrich With Azure Application Insights** |  | Enable this to enrich test results for Generative Answers tests with Azure Application Insights telemetry data. |
| **App Insights Client ID** | Depends | Enter the application (client) ID of the application that has been granted the permissions to read data from Application Insights resource |
| **App Insights Application ID** | Depends | Enter the **AppId** of your Application Insights resource. Please see [here](./ENABLE-APPINSIGHTS.md#steps-to-find-out-appid) for additional details. |
| **App Insights Secret Location** | Depends | Choose where you prefer to store the App Insights application secret. <br> Dataverse stores the secret in a secured column, while Key Vault requires to use an environment variable of type secret, and storing the secret in a Azure Key Vault. |
| **App Insights Tenant ID** | Depends | Enter the tenant ID of the Application Insights resource and the application |
| **App Insights Secret** | Depends | When _Dataverse_ is selected as the _Secret Location_, this column stores the App Insights application secret. |
| **App Insights Environment Variable** | Depends | When _Key Vault_ is selected as the _Secret Location_, this column stores the schema name for the environment variable of type secret that links to the App Insights application secret. |
| **Enrich With Conversation Transcripts** |  | Enable this option to enrich test results with data from Conversation Transcripts stored in Dataverse. |
| **Dataverse URL** | Depends | When _Enrich With Conversation Transcripts_ is enabled, URL of Dataverse environment (e.g., https://org123.crm.dynamics.com) <br> The URL can be obtained from Microsoft Copilot Studio settings (⚙️), in session details > instance url. |
| **Copy Full Transcript** | No | When _Enrich With Conversation Transcripts_ is enabled, copies the full Conversation Transcript JSON as an attachment to the test result record for further analysis. |
| **Analyze Generated Answers** |  | When this option is enabled, AI-generated tests are analyzed with a large language model (LLM) to compare the response with a sample answer or validation instructions. |
| **Generative AI Provider** | Depends | When _Analyze Generated Answers_ is enabled, LLM model that is used to do the analysis. Only **AI Builder** is supported at the moment |

3. **Save**

## Configure a new Agent for Conversation KPIs

1. Select "**Conversation KPIs**" from Configuration Type(s).
2. In addition to Base Configuration, fill in the following  **information**.

| Column Name | Required | Description | 
| --- | --- | --- |
| **Dataverse URL** | Yes | Dataverse URL where the conversation transcripts (and the agent) are located. Example: **"https://organizationname.crm.dynamics.com"** |
| **Agent ID** | Yes | Botid of the custom agent you are targeting. You can find this in Copilot Studio from **Settings->Session details->Copilot Id**.  |
| **Copy Full Transcript** | Yes | Optionally full transcript of the conversation is copied over and associated with the KPI record. This is required if you wish to inspect the conversation in the transcript visualizer (**Transcript**-tab on the Conversation KPI record.) |
| **Tracked Variables** | No | You can specify up to five custom variables you wish to track from the conversations (e.g. custom NPS score). The format is JSON array, example: **"[ "Activity.Channel", "Activity.Type" ]"** |
| **Agent Components** | No  | This is a readonly field which is populated with the components of the agent you have specified, e.g. topics, knowledge sources, etc. |

3. **Save**

![conversation kpi configuration](https://github.com/user-attachments/assets/910571bd-72a3-415b-8995-4f87b3764b2b)

## Configure a new Agent for File Synchronization

1. Select "**File Synchronization**" from Configuration Type(s).
2. In addition to Base Configuration, enter the following information:

| Column Name | Required | Description | 
| --- | --- | --- |
| **Agent ID (botid)** | Yes | Botid of the custom agent you are targeting. You can find this in Copilot Studio from **Settings->Session details->Copilot Id**. |
| **Dataverse URL** | Yes | Dataverse URL where the custom agent is located (and content will be synchronized to). Example: **"https://organizationname.crm.dynamics.com"** |

3. Add at least one **File Indexer Configuration** and fill in the following  **information**.

| Column Name | Required | Description | 
| --- | --- | --- |
| **Name** | Yes | Name of the File Indexer configuration. Example: **"HR documents"**|
| **Site Address** | Yes | Address of the SharePoint site you are synchronizing the content from. Example: **"https://organizationname.sharepoint.com/sites/sitename"** |
| **Library Name** | Yes |  The library in the SharePoint site you are synchronizing the content from. Example: **"Documents"** |
| **Agent Configuration** | Yes | The agent configuration this record belongs to. This is automatically populated if you create new record through agent configuration view. |
| **Include Nested Items** | Yes | If the content synchronization is limited to the exact location you specify, or whether the child items of that location will be included in the synchronization as well. |
| **Limit Entries to Folder** | No | Optionally you can specify a folder in the library to synchronize. Example: **"/HR-documents"**|
| **SharePoint Files Filter Query** | No | Optionally you can specify additional filters to use when selecting files to be synchronized. Leave empty for no additional filtering. Example: **PublicContent eq 'true'**|
| **Include SharePoint Pages** | No | Optionally you can include SharePoint pages in the synchronization.|
| **SharePoint Pages Filter Query** | No | Optionally you can specify additional filters to use when selecting pages to be synchronized. Leave empty for no additional filtering. Example: **PublicContent eq 'true'**|

4. **Save**

![file sync](https://github.com/user-attachments/assets/90bc990a-646c-4311-863f-6c5cba43a48d)

## Note about end user authentication

Copilot Studio Kit supports testing custom agents with Entra ID v2 (Azure Active Directory v2) service provider (with SSO) for end user authentication. To enable Copilot Studio Kit end user authentication on your application, please see instructions [here](./ENABLE-AUTHENTICATION.md).

## Note about results enrichment with Dataverse Conversation Transcripts

* For the Copilot Studio Kit to be able to retrieve Conversation Transcript records from other Power Platform environments, the Microsoft Dataverse connection that is used when setting up solution must have `Read` access on the `ConversationTranscript` table records in the target environments.
* Only environments within the same tenant can be targeted.

## Note about results enrichment with Application Insights

* For enriching test results from Application Insights, app registration is required within the same tenant as the Application Insights resource
* Application Insights resource and the application can reside in a different tenant than the custom agent being tested
* For detailed instructions on how to register the application and get the required information for the Application Insights resource, please see [here](./ENABLE-APPINSIGHTS.md).
* Make sure that the custom agent is configured to send telemetry to Application Insights resource and that it is the same as in the agent configuration in the Copilot Studio Kit. For information on how to connect your custom Agent to Application Insights, please see [here](./ENABLE-APPINSIGHTS.md)

## Configure secrets in Azure Key Vault

> [!NOTE]
> Configuring this requires at least the System Administrator security role on the environment, as well as specific permissions in the Azure Key Vault.

If you do not want to store secrets directly in Dataverse, you can choose to store them in Azure Key Vault.
If you choose to do so, you then need to use environment variables of type secrets so that the Power CAT Copilot Studio Kit can fetch secrets from the key vault when running tests.
Because each agent configuration may target a different agent and use a different secret, you need to create individual environment variables for each secret.

1. Configure your Azure Key Vault by following this documentation: [Configure Azure Key Vault](https://learn.microsoft.com/power-apps/maker/data-platform/environmentvariables-azure-key-vault-secrets#configure-azure-key-vault).
2. Go to **[make.powerapps.com](https://make.powerapps.com/)**
3. Select the **environment** in which you want to install the Power CAT Copilot Studio Kit.
4. Go to **Solutions**
5. Select **Common Data Services Default Solution** <br>
   _Note: you can choose to create or use your own custom solution as well. The idea here is to create environment variables that will be used by Power CAT Copilot Studio Kit to retrieve secrets from the Azure Key Vault._
6. Follow the steps in: [Create a new environment variable for the Key Vault secret](https://learn.microsoft.com/power-apps/maker/data-platform/environmentvariables-azure-key-vault-secrets#create-a-new-environment-variable-for-the-key-vault-secret)
7. Once created, use the environment variable **schema name** (e.g., cr42e_Copilot1DirectLineSecret) in the agent Configuration record.

## Next step
- [Configure tests](./CONFIGURE_TESTS.md)

