# Configure copilots in Copilot Studio Accelerator

## Configure a new copilot 

The custom copilots you create and configure in Microsoft Copilot Studio can be tested from the Copilot Studio Accelerator.
For this, you need to create a **Copilot Configuration** record taht will contain the required information to connect to these copilots and run tests against them.

1. Open the Copilot Studio Accelerator application (as seen in [installation instructions](./INSTALLATION_INSTRUCTIONS.md#access-the-copilot-studio-accelerator-app))
2. Navigate to **Copilots**.
3. Create a **New** Copilot Configuration record.
4. Fill in the below **information**.

| Column Name | Mandatory | Description | 
| --- | --- | --- |
| **Name** | Yes | Name of the copilot configuration. <br> The name doesn't have to be the same as the copilot you target. |
| **Region** | Yes | Region where the copilot is deployed. <br> This is required to target the appropriate [Direct Line enpoint](https://learn.microsoft.com/azure/bot-service/rest-api/bot-framework-rest-direct-line-3-0-api-reference?view=azure-bot-service-4.0). |
| **Token Endpoint** | Depends | If _Channel Security_ isn't used or enforced, use the [token endpoint](https://learn.microsoft.com/microsoft-copilot-studio/publication-connect-bot-to-custom-application#retrieve-your-copilot-studio-copilot-parameters) that's available in the Mobile app channel. |
| **Channel Security** |  |  Check this option if [web and Direct Line channel security](https://learn.microsoft.com/microsoft-copilot-studio/configure-web-security) is enabled. <br> That way, a token can be obtained in exchange of a secret. |
| **Secret Location** | Depends | When _Channel Security_ is checked, choose where you prefer to store the Direct Line channel secret. <br> Dataverse stores the secret in a secured column, while Key Vault requires to use an environment variable of type secret, and storing the secret in a Azure Key Vault. |
| **Secret** | Depends | When _Dataverse_ is selected as the Secret Location, this column stores the Direct Line channel secret. |
| **Environment Variable** | Depends | When _Key Vault_ is selected as the Secret Location, this column stores the schema name for the environment variable of type secret that links to the Azure Key Vault secret. <br> See [Configure secrets in Azure Key Vault](./CONFIGURE_COPILOTS.md#configure-secrets-in-azure-key-vault)|
| **Enrich With Azure Application Insights** |  | Option to enrich test results for Generative Answsers tests with Azure Application Insights telemetry data. |
| **Delay for Azure Application Insights Enrichment** | Depends | When _Enrich With Azure Application Insights_ is enabled, delay in minutes before trying to fetch data from Azure Application Insights. <br> Recommended value: 5 |
| **Enrich With Conversation Transcripts** |  | Option to enrich test results with Conversation Transcripts data stored in Dataverse. |
| **Delay for Conversation Transcripts Enrichment** | Depends | When _Enrich With Conversation Transcripts_ is enabled, delay in minutes before trying to fetch data from Conversation Transcripts in Dataverse. <br> Recommended value: 60 |
| **Dataverse URL** | Depends | When _Enrich With Conversation Transcripts_ is enabled, URL of Dataverse environment (e.g., https://org123.crm.dynamics.com) <br> The URL can be obtained from Microsoft Copilot Studio settings (⚙️), in session details > instance url. |
| **Copy Full Transcript** |  | When _Enrich With Conversation Transcripts_ is enabled, copies the full Conversation Transcript JSON as an attachment to the test result record. |
| **Analyze Generated Answers** |  | When this option is enabled, AI-generated tests are analyzed with a large language model (LLM) to compare the response with a sample answser or validation instructions. |
| **Generative AI Provider** | Depends | When _Analyze Generated Answers_ is enabled, LLM model that is used to do the analysis. Not configurable today, only AI Builder is supported |

5. **Save**

## Configure secrets in Azure Key Vault)
