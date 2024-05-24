## First Time Setup Instructions
- Get started with the Copilotstudio Accelerator Setup:
### Description
The Copilot Studio Accelerator is a Power Platform-based solution that helps automate testing of custom copilots. The main use cases are intent accuracy testing and generative answers testing. This release introduces several new features and improvements to enhance the testing process and ensure high-quality outputs.

### Prerequisites

To leverage the new features in Copilot Studio Accelerator 1.0.0, ensure the following prerequisites are met:

1. **Direct Line Secret**:
   - Valid subscription to Copilot Studio.
   - Secure storage setup for Direct Line secret in Dataverse or Azure Key Vault.
     ![image](https://github.com/microsoft/Powercat-Copilotstudio-Accelerator/assets/29349597/d08cbc9b-02d0-4dc0-b0fa-a808086bf904)


2. **Region Availability**:
   - Select the appropriate region (Default, Europe, India) for your deployment.

3. **Azure Application Insights**:
   - Active Azure account with permissions to access Application Insights.
   - Properly configured Application Insights resource to monitor and log generative answer tests. Refer to [Advanced Bot Framework Composer Capture Telemetry](https://learn.microsoft.com/en-us/microsoft-copilot-studio/advanced-bot-framework-composer-capture-telemetry?tabs=webApp) for detailed setup instructions.
   ![image](https://github.com/microsoft/Powercat-Copilotstudio-Accelerator/assets/29349597/d1a12c2f-cad3-4250-be53-b56ee6e8c288)

4. **Dataverse**:
   - A fully operational Dataverse environment.
   - Permissions to access and manage Conversation Transcript records within Dataverse. Refer to [Work with conversation transcripts](https://learn.microsoft.com/en-us/microsoft-copilot-studio/analytics-sessions-transcripts) for detailed setup instructions.
   - Proper setup for data enrichment processes to utilize full conversation transcripts.

5. **AI Builder**:
   - Access to AI Builder within your Microsoft Power Platform.
   - AI Builder credits to utilize the generative AI capabilities.


### Security Roles

1. **Copilot Studio Accelerator Administrator**:
   - Full administrative access to configure, manage, and maintain the Copilot Studio Accelerator environment.

2. **Copilot Studio Accelerator Configurator**:
   - Access to set up and configure testing parameters, Direct Line secrets, and integrations.

3. **Copilot Studio Accelerator Tester**:
   - Permissions to execute tests and view results, ensuring that testers can validate copilot performance and accuracy.

---

These updates bring significant enhancements to the Copilot Studio Accelerator, enabling better testing, insights, and accuracy for generative AI answers. Ensure all prerequisites are met to fully utilize the new capabilities.


## Upgrade Instructions
- Upgrading from the latest version of the Copilotstudio Accelerator:
