# Analyzing test results in Power CAT Copilot Studio Kit

## Test run details

The Agent Test Run view offers an overview of the various run statuses:

| Status | Description | 
| --- | --- | 
| **Run Status** | Main process that runs each individual Agent Test against the Agent Configuration using the Direct Line API, and creates a corresponding Agent Test Result record. | 
| **App Insights Enrichment Status** | Only runs if _Enrich With Azure Application Insights_ is enabled on the related Agent Configuration record. | 
| **Generated Answers Analysis** | Only runs if _Analyze Generated Answers_	is enabled on the related Agent Configuration record. | 
| **Dataverse Enrichment Status** | Only runs if _Enrich With Conversation Transcripts_ is enabled on the related Agent Configuration record.  | 

![analyze test results](https://github.com/user-attachments/assets/c1aaa783-f43e-4c6d-996c-d49a124a5d9d)

## Aggregated results

After a cloud flow runs, aggregated results are calculated.

| Aggregated Result | Description | 
| --- | --- | 
| **# Tests** | Number of test results. | 
| **Success Rate (%)** | Percentage of the number of Test Result records with a Success result compared to the total number of test results. | 
| **Average Latency (ms)** | Average time it took for the agent to send the message after it received the test utterance, in milliseconds. | 
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

![detailed results](https://github.com/user-attachments/assets/9648ae07-98cf-4602-9468-8a29ecf7c3bb)

For different kinds of tests, different subgrid views may be leveraged:
- Generative Answers Results
- Response Match Results
- Topic Match Results
- Attachment Results

![image](https://github.com/microsoft/Powercat-Copilotstudio-Accelerator/assets/37898885/42c9d0bc-0357-404e-ae83-95917c50af5e)

## Agent Test Result form details

The Agent Test Result form offers additional details on an individual test execution. <br>
These records are automatically created.

| Column Name |  Description | 
| --- | --- |
| **Conversation ID** | Identifier of the conversation provided by the Direct Line API. |
| **Agent Test Run** | Related test run. |
| **Agent Test** | Related test. The details of the test are displayed in a Quick View form. |
| **Result** | Result: `Success`, `Failed`, `Unknown`, `Error`, `Pending`.  |
| **Result** | Auto-generated explanation of the Result. |
| **Latency (ms)** | Time it took for the agent to send the message back after it received the test utterance, in milliseconds. |
| **Message Sent** | Timestamp of the message sent by the user. |
| **Response Received** | Timestamp of the message sent by the agent. |
| **Response** | Text message received from the agent. |
| **App Insights Result** | Generative answer results from Azure Application Insights (when _Enrich With Azure Application Insights_ is enabled) |
| **Triggered Topic ID** | Unique identifier of the Chatbot Subcomponent record corresponding to the triggered topic in Dataverse (when _Enrich With Conversation Transcripts_ is enabled) |
| **Triggered Topic / Event** | Name of the triggered topic (when _Enrich With Conversation Transcripts_ is enabled). <br > In case of multiple topics matched, `IntentCandidates`. For Conversational Boosting and Fallback, `UnknownIntent`. |
| **Recognized Intent Score** | In case of intent recognition, score of the top intent. |
| **Conversation Transcript** | File attachment of the full conversation transcript JSON (when _Enrich With Conversation Transcripts_ is enabled and _Copy Full Transcript_ is set to yes.|
| **Suggested Actions** | When available, JSON of the suggested actions returned by the agent and associated to its reponse. |
| **Attachments** |  When available, JSON of the attachments array returned by the agent and associated to its response. |
| **Citations** | For generated answers, JSON array of the citations that were used to generate the answer (when _Enrich With Conversation Transcripts_ is enabled ) |

## Inspecting the transcript

If _Enrich With Conversation Transcripts_ is enabled and _Copy Full Transcript_ is set to yes, full transcript is copied on the test result. When analyzing a test result, navigating to the **Transcript**-tab will provide a detailed transcript view on the left side and easy-to-read visualization on the right side.

![Inspecting the transcript](https://github.com/user-attachments/assets/072bfe80-6ee2-4d3a-b483-7a6aebd776bc)

## Analyzing multi-turn test results

With the added support for multi-turn testing, the multi-turn tests are visible in the results view with other test types, and their overall result (Success/Failed) is visible on the Result-column. If you open the additional details page of multi-turn test by clicking the Conversation ID value, you will get a list of child tests the multiturn test consists of.

![multiturn detailed view](https://github.com/user-attachments/assets/4ecc7679-e7c0-40aa-95ad-1b39142f955b)

In the detailed view of multi-turn test result, you are able to see results of individual child tests and can drill down into their details. The result of multi-turn test itself is determined based on the results of its child tests that are marked as critical. Non-critical child tests are allowed to fail, and the multi-turn test case will continue to the next test case. If any of the critical child tests fail, test execution for that multi-turn will halt and the test will be marked as failed. If all the critical child tests of multi-turn test pass, the result of the multi-turn test will be considered success.

The reason why multi-turn test case might contain non-critical tests is that they can be used to feed information to generative orchestrator and the exact response to the test case in this case do not matter, just the critical test(s) that follow.

Multi-turn test (and thus the multi-turn test result) can include any of the regular test types, response match, attachments, topic match and generative answers.

## Next
Should you experience any issues, please see:
- [Troubleshooting](./TROUBLESHOOT.md)
- [Support](./SUPPORT.md)
