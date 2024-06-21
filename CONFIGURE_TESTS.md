# Configure tests in Copilot Studio Accelerator

## Create a new test set

**Test sets** are used to group multiple **tests** together. That way, when running tests, you select a test set, and each test in the test set will be executed as part of the run.

1. Open the Copilot Studio Accelerator application (as seen in [installation instructions](./INSTALLATION_INSTRUCTIONS.md#access-the-copilot-studio-accelerator-app))
2. Navigate to **Test Sets**.
3. Create a **New** Copilot Test Set record.
4. Provide a **Name**.
5. **Save**.

## The different types of test

| Test Type | Description |
| --- | --- | 
| **Response Match** | This is the simplest type of test, and it can be immediately evaluated. <br> Compares the copilot response with the expected response. |
| **Attachments (Adaptive Cards, etc.)** | Compares the copilot attachments JSON response with the expected attachments JSON. <br> Note: this is the full array of attachments |
| **Topic Match** | _Only available when Dataverse enrichment is configured._ <br> When the Dataverse enrichment step completes, compares the expected topic name and the triggered topic name. |
| **Generative Answers** | _Only available if AI Builder enrichment is configured._ <br> Uses a large language model to assess if the AI-generated answer is close to a sample answer or honors validation instructions. <br> When _Azure Application Insights enrichment_ is configured, negative tests, such as Moderation or No Search Results can also be tested. | 

## Create a new test

After you've created a Test Set, you can add Tests to it.
From the Tests subgrid, select **New Copilot Test**

![image](https://github.com/microsoft/Powercat-Copilotstudio-Accelerator/assets/37898885/689cfa4a-2c4b-4cc2-be94-4484b00e8c71)

| Column Name | Required | Description | 
| --- | --- | --- |
| **Name** | Yes | Name of the test. This can be an internal reference ID, e.g., TST-001. |
| **Copilot Test Set** | Yes | Parent test set for the test |
| **Test Type** | Yes | One of the above test types |
| **Seconds Before Getting Answer** | Yes | Number of seconds before the tool checks for an answer. <br> Note: while the built-in Natural Language Understanding model usually takes less that 0.5s to send an answer back, the latency may vary based on a number of factor. Calling APIs, connectors or cloud flows as part of the first response may delay the message. Using generative AI features may also add extra latency. If unsure, put 10 seconds and adjust based on your results. |
| **Send startConversation Event** |   | If enabled, the startConversation start will be sent to the copilot so that it [proactively starts the conversation](https://learn.microsoft.com/microsoft-copilot-studio/configure-bot-greeting?tabs=web), and the test utterance is only sent after. |
| **Expected Position of the Response Message** |   | Don't set a value if unsure. <br> This option allows the to capture a specific copilot response if it sends multiple messages. For example, if the copilot first says "Hello" and then "How can I help you?", and if you want to test the second message, set 2. |
| **Test Utterance** | Yes | The message that you want to send to the copilot as part of the test |
| **Expected Response** | Depends | Mandatory for a Response Match. <br> Expected response from the copilot. <br> For a Generative Answers test, this is where you can set a sample answer or your own validation instructions for the large language model.  |
| **External Variables JSON** |   | JSON record for any [external or contextual value](https://learn.microsoft.com/microsoft-copilot-studio/authoring-variables-bot?tabs=webApp#add-global-variables-to-a-custom-canvas) you may want to pass of the Copilot as part of the test. E.g., <br> { "Language": "fr" }  |
| **Expected Generative Answers Outcome** | Depends | Mandatory for the Generative Answers type of test. Should be either _Answered_ or _Not Answered_. <br> When Azure Application Insights enrichment is enabled, you may choose _Moderated_ or _No Search Results_. |
| **Expected Topic Name** | Depends | Mandatory for Topic Match type of test. <br> Name of the topic that is expected to be triggered |
| **Expected Attachments JSON** | Depends | Mandatory for Attachments (Adaptive Cards, etc.) type of test. <br> Full attachments JSON array that is expected from the copilot response. |
