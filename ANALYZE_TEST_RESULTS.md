# Analyzing test results in Power CAT Copilot Studio Kit

## Test run details

The Copilot Test Run view offers an overview of the various run statuses:

| Status | Description | 
| --- | --- | 
| **Run Status** | Main process that runs each individual Copilot Test against the Copilot Configuration using the Direct Line API, and creates a corresponding Copilot Test Result record. | 
| **App Insights Enrichment Status** | Only runs if _Enrich With Azure Application Insights_ is enabled on the related Copilot Configuration record. | 
| **Generated Answers Analysis** | Only runs if _Analyze Generated Answers_	is enabled on the related Copilot Configuration record. | 
| **Dataverse Enrichment Status** | Only runs if _Enrich With Conversation Transcripts_ is enabled on the related Copilot Configuration record.  | 

![image](https://github.com/microsoft/Powercat-Copilotstudio-Accelerator/assets/37898885/9a0e2a82-3387-4433-83f8-d1a56164784f)

## Aggregated results

After a cloud flow runs, aggregated results are calculated.

| Aggregated Result | Description | 
| --- | --- | 
| **# Tests** | Number of test results. | 
| **Success Rate (%)** | Percentage of the number of Test Result records with a Success result compared to the total number of test results. | 
| **Average Latency (ms)** | Average time it took for the copilot to send the message after it received the test utterance, in milliseconds. | 
| **# Success** | Number of Test Result records with a Success result. | 
| **# Failed** | Number of Test Result records with a Failed result. | 
| **# Pending** | Number of Test Result records with a Pending result. | 
| **# Unknown** | Number of Test Result records with an Unknown result. | 
| **# Error** | Number of Test Result records with an error result. | 

## Detailed results

Results should be analyzed after each step has completed, as some results will only be available after these steps complete.
For example, Topic Match tests need Dataverse Enrichment to fully run, as only this step provides information on the topic name that was triggered.

The results view is editable, so that results can be adjusted individually.

Each result has a **Result Reason** that's automatically populated. It will contain an explanation for the Result. <br>
For AI-generated assessments, it will recommend a human review: `AI-generated assessment of the response. Please review`. <br>
This attribute can be used by testers to add their own comments and notes on a test.

![image](https://github.com/microsoft/Powercat-Copilotstudio-Accelerator/assets/37898885/9de27a17-efe4-4220-9492-889bb623ddb7)

For different kinds of tests, different subgrid views may be leveraged:
- Generative Answers Results
- Response Match Results
- Topic Match Results
- Attachment Results

![image](https://github.com/microsoft/Powercat-Copilotstudio-Accelerator/assets/37898885/42c9d0bc-0357-404e-ae83-95917c50af5e)

## Copilot Test Result form details

The Copilot Test Result form offers additional details on an individual test execution. <br>
These records are automatically created.

| Column Name |  Description | 
| --- | --- |
| **Conversation ID** | Identifier of the conversation provided by the Direct Line API. |
| **Copilot Test Run** | Related test run. |
| **Copilot Test** | Related test. The details of the test are displayed in a Quick View form. |
| **Result** | Result: `Success`, `Failed`, `Unknown`, `Error`, `Pending`.  |
| **Result** | Auto-generated explanation of the Result. |
| **Latency (ms)** | Time it took for the copilot to send the message back after it received the test utterance, in milliseconds. |
| **Message Sent** | Timestamp of the message sent by the user. |
| **Response Received** | Timestamp of the message sent by the copilot. |
| **Response** | Text message received from the copilot |
| **App Insights Result** | Generative answer results from Azure Application Insights (when _Enrich With Azure Application Insights_ is enabled) |
| **Triggered Topic ID** | Unique identifier of the Chatbot Subcomponent record corresponding to the triggered topic in Dataverse (when _Enrich With Conversation Transcripts_ is enabled) |
| **Triggered Topic / Event** | Name of the triggered topic (when _Enrich With Conversation Transcripts_ is enabled). <br > In case of multiple topics matched, `IntentCandidates`. For Conversational Boosting and Fallback, `UnknownIntent`. |
| **Recognized Intent Score** | In case of intent recognition, score of the top intent. |
| **Conversation Transcript** | File attachment of the full conversation transcript JSON (when _Enrich With Conversation Transcripts_ is enabled and _Copy Full Transcript_ is set to yes.|
| **Suggested Actions** | When available, JSON of the suggested actions returned by the copilot and associated to its reponse. |
| **Attachments** |  When available, JSON of the attachments array returned by the copilot and associated to its response. |
| **Citations** | For generated answers, JSON array of the citations that were used to generate the answer (when _Enrich With Conversation Transcripts_ is enabled ) |
