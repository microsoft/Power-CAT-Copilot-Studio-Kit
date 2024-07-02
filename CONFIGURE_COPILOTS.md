# Configure copilots in Power CAT Copilot Studio Kit

The custom copilots you create and configure in Microsoft Copilot Studio can be tested from the Power CAT Copilot Studio Kit.
For this, you need to create a **Copilot Configuration** record taht will contain the required information to connect to these copilots and run tests against them.

![image](https://github.com/microsoft/Powercat-Copilotstudio-Accelerator/assets/37898885/966503f4-bc93-4914-81e0-59b7be9df25f)

## Configure a new copilot 

1. Open the Power CAT Copilot Studio Kit application (as seen in [installation instructions](./INSTALLATION_INSTRUCTIONS.md#access-the-copilot-studio-accelerator-app))
2. Navigate to **Copilots**.
3. Create a **New** Copilot Configuration record.
4. Fill in the below **information**.

| Column Name | Required | Description | 
| --- | --- | --- |
| **Name** | Yes | Name of the copilot configuration. <br> The name doesn't have to be the same as the copilot you target. |
| **Region** | Yes | Region where the copilot is deployed. <br> This is required to target the appropriate [Direct Line enpoint](https://learn.microsoft.com/azure/bot-service/rest-api/bot-framework-rest-direct-line-3-0-api-reference?view=azure-bot-service-4.0). |
| **Token Endpoint** | Depends | If _Channel Security_ isn't used or enforced, use the [token endpoint](https://learn.microsoft.com/microsoft-copilot-studio/publication-connect-bot-to-custom-application#retrieve-your-copilot-studio-copilot-parameters) that's available in the Mobile app channel. |
| **Channel Security** | No |  Check this option if [web and Direct Line channel security](https://learn.microsoft.com/microsoft-copilot-studio/configure-web-security) is enabled. <br> That way, a token can be obtained in exchange of a secret. |
| **Secret Location** | Depends | When _Channel Security_ is checked, choose where you prefer to store the Direct Line channel secret. <br> Dataverse stores the secret in a secured column, while Key Vault requires to use an environment variable of type secret, and storing the secret in a Azure Key Vault. |
| **Secret** | Depends | When _Dataverse_ is selected as the _Secret Location_, this column stores the Direct Line channel secret. |
| **Environment Variable** | Depends | When _Key Vault_ is selected as the _Secret Location_, this column stores the schema name for the environment variable of type secret that links to the Azure Key Vault secret. <br> See [Configure secrets in Azure Key Vault](./CONFIGURE_COPILOTS.md#configure-secrets-in-azure-key-vault)|
| **Enrich With Azure Application Insights** | No | Option to enrich test results for Generative Answsers tests with Azure Application Insights telemetry data. |
| **Delay for Azure Application Insights Enrichment** | Depends | When _Enrich With Azure Application Insights_ is enabled, delay in minutes before trying to fetch data from Azure Application Insights. <br> Recommended value: 5 |
| **Enrich With Conversation Transcripts** | No | Option to enrich test results with Conversation Transcripts data stored in Dataverse. |
| **Delay for Conversation Transcripts Enrichment** | Depends | When _Enrich With Conversation Transcripts_ is enabled, delay in minutes before trying to fetch data from Conversation Transcripts in Dataverse. <br> Recommended value: 60 |
| **Dataverse URL** | Depends | When _Enrich With Conversation Transcripts_ is enabled, URL of Dataverse environment (e.g., https://org123.crm.dynamics.com) <br> The URL can be obtained from Microsoft Copilot Studio settings (⚙️), in session details > instance url. |
| **Copy Full Transcript** | No | When _Enrich With Conversation Transcripts_ is enabled, copies the full Conversation Transcript JSON as an attachment to the test result record. |
| **Analyze Generated Answers** | No | When this option is enabled, AI-generated tests are analyzed with a large language model (LLM) to compare the response with a sample answser or validation instructions. |
| **Generative AI Provider** | Depends | When _Analyze Generated Answers_ is enabled, LLM model that is used to do the analysis. Not configurable today, only AI Builder is supported |

5. **Save**

## Note about results enrichment with Dataverse Conversation Transcripts

> [!WARNING]
> - For the accelerator to be able to retrieve Conversation Transcript records from other Power Platform environments, the Microsoft Dataverse connection that is used when setting up solution must have `Read` access on the `ConversationTranscript` table records in the target environments.
> - Only environments within the same tenant can be targetted.

## Configure secrets in Azure Key Vault

> [!NOTE]
> Configurating this requires at least the System Administrator security role on the environment, as well as specific permissions in the Azure Key Vault.

If you don't want to store secrets directly in Dataverse, you can choose to store them in Azure Key Vault.
If you choose to do so, you then need to use environment variables of type secrets so that the Power CAT Copilot Studio Kit can fetch secrets from the key vault when running tests.
Because each copilot configuration may target a different copilot and use a different secret, you need to create individual environment variables for each secret.

1. Configure your Azure Key Vault by following this documentation: [Configure Azure Key Vault](https://learn.microsoft.com/power-apps/maker/data-platform/environmentvariables-azure-key-vault-secrets#configure-azure-key-vault).
2. Go to **[make.powerapps.com](https://make.powerapps.com/)**
3. Select to the **environment** in which you want to install the Power CAT Copilot Studio Kit.
4. Go to **Solutions**
5. Select **Common Data Services Default Solution** <br>
   _Note: you can choose to create or use your own custom solution as well. The idea here is to create environment variables that will be used by Power CAT Copilot Studio Kit to retrieve secrets from the Azure Key Vault._
6. Follow the steps in: [Create a new environment variable for the Key Vault secret](https://learn.microsoft.com/power-apps/maker/data-platform/environmentvariables-azure-key-vault-secrets#create-a-new-environment-variable-for-the-key-vault-secret)
7. Once created, use the environment variable **schema name** (e.g., cr42e_Copilot1DirectLineSecret) in the Copilot Configuration record.



