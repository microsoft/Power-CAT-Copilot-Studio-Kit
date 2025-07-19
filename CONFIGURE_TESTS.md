# Configure tests in Power CAT Copilot Studio Kit

## Create a new test set

**Test sets** are used to group multiple **tests** together. That way, when running tests, you select a test set, and each test in the test set will be executed as part of the run.

1. Open the Power CAT Copilot Studio Kit application (as seen in [installation instructions](./INSTALLATION_INSTRUCTIONS.md#access-the-copilot-studio-accelerator-app))
2. Navigate to **Test Sets**.
3. Create a **New** Agent Test Set record.
4. Provide a **Name**.
5. **Save**.

## The different types of test

| Test Type | Description |
| --- | --- | 
| **Response Match** | This is the simplest type of test, and it can be immediately evaluated. It compares the agent response with the expected response using selected comparison operator. By default, exact match ("equals") is used. Other available comparison operators are "Does not equal", "Contains", "Does not contain", "Begins with", "Does not begin with", "Ends with" and "Does not end with". |
| **Attachments (Adaptive Cards, etc.)** | Compares the agent attachments JSON response with the expected attachments JSON. <br> Note: this is the full array of attachments. By default, exact match ("equals") is used. Other available comparison operators are "Does not equal", "Contains", "Does not contain". There is a special comparison operator called "AI Validation" which leverages LLM to validate the attachment based on validation instructions provided by the maker, similarly to generative answers. |
| **Topic Match** | _Only available when Dataverse enrichment is configured._ <br> When the Dataverse enrichment step completes, compares the expected topic name and the triggered topic name. <br><br>Since the May release, Topic Match test type also supports *multi-topic match* with custom agents that have generative orchestration enabled. In multi-topic matching, the topics are separated with comma, eg. "**Topic1,Topic2**". |
| **Generative Answers** | _Only available if AI Builder enrichment is configured._ <br> Uses a large language model to assess if the AI-generated answer is close to a sample answer or honors validation instructions. <br> When _Azure Application Insights enrichment_ is configured, negative tests, such as Moderation or No Search Results can also be tested. | 
| **Multi-turn** | Multi-turn test consists of one or more test cases of other types, e.g. response match, attachments, topic match and/or generative answers. All child tests in a multi-turn test are executed within the same conversation context in the specified order. Multi-turn tests are useful for testing a scenario end-to-end, and for testing custom agents with generative orchestration. | 
| **Plan Validation** | Plan validation test allows maker to validate that the dynamic plan of custom agent includes the expected tools. This test type is meant for Copilot Studio custom agents that have generative orchestration enabled. | 

## Create a new test

After you've created a Test Set, you can add Tests to it.
From the Tests subgrid, select **New Agent Test**

![new test set](https://github.com/user-attachments/assets/cf4155a6-1946-415b-b6c4-5659618625b4)


| Column Name | Required | Description | 
| --- | --- | --- |
| **Name** | Yes | Name of the test. This can be an internal reference ID, e.g., TST-001. |
| **Agent Test Set** | Yes | Parent test set for the test |
| **Test Type** | Yes | One of the above test types |
| **Send startConversation Event** |   | If enabled, the startConversation start will be sent to the agent so that it [proactively starts the conversation](https://learn.microsoft.com/microsoft-copilot-studio/configure-bot-greeting?tabs=web), and the test utterance is only sent after. This is typically only required when the *Conversation Start* topic has some logic that has to be executed before responding to user/test utterance. |
| **Expected Position of the Response Message** |   | Don't set a value if unsure. <br> This option allows the to capture a specific agent response if it sends multiple messages. For example, if the agent first says "Hello" and then "How can I help you?", and if you want to test the second message, set 1. Please note that the order is 0-based, which means that the first message is indexed with 0, second response is 1, etc. |
| **Test Utterance** | Yes | The message that you want to send to the agent as part of the test |
| **Expected Response** | Depends | Mandatory for a Response Match. <br> Expected response from the agent. <br> For a Generative Answers test, this is where you can set a sample answer or your own validation instructions for the large language model.  |
| **External Variables JSON** |   | JSON record for any [external or contextual value](https://learn.microsoft.com/microsoft-copilot-studio/authoring-variables-bot?tabs=webApp#add-global-variables-to-a-custom-canvas) you may want to pass of the agent as part of the test. E.g., <br> { "Language": "fr" }  |
| **Seconds Before Getting Answer** | | Number of seconds to wait before evaluating the response from the bot. In most cases this can be left empty, but is useful in e.g. situations where the agent calls an API and the response might take longer than usually. |
| **Expected Generative Answers Outcome** | Depends | Mandatory for the Generative Answers type of test. Should be either _Answered_ or _Not Answered_. <br> When Azure Application Insights enrichment is enabled, you may choose _Moderated_ or _No Search Results_. |
| **Expected Topic Name** | Depends | Mandatory for Topic Match type of test. <br> Name of the topic that is expected to be triggered. Multi-topic match is supported with custom agents that have generative orchestration enabled. In the case of multi-topic match, topics are entered comma-separated, e.g. "Topic1,Topic2". Do not add extra whitespace. Multi-topic matching ensures that the expected topics are among the topics in the plan. |
| **Expected Attachments JSON** | Depends | Mandatory for Attachments (Adaptive Cards, etc.) type of test. <br> Full attachments JSON array that is expected from the agent response. |
| **Expected Tools** | Depends | Mandatory for Plan Validation type of test. <br> Comma separated list of expected tools (Tools, Actions and Connected agents). No extra whitespace, order does not matter. Example "Weather,Climate change", |
| **Pass Threshold %** | Depends | Mandatory for Plan Validation type of test. <br> Percentage of expected tools that needs to be included in the dynamic plan for the test to pass. 100% means all expected tools need to be in the dynamic plan for the test to succeed. Additional tools present in the dynamic plan are not taken into account. |

### Multi-turn

If the test type is multi-turn, you can specify one or more child tests of *regular* types. Each child test also has an order and criticality attached to it. Order defines the order of execution within the same conversation context (within multi-turn test case), and criticality defines if the child test case **has** to pass for the multi-turn test execution to continue.

![multiturn test setup](https://github.com/user-attachments/assets/cea90fa3-2db7-4616-9c3a-21be8d86da3c)

Any child tests that require post-testing evalution, such as topic match or generative answers, are left in pending state and test execution will continue regardless of the criticality status. If any of the critical tests fail, the execution of multi-turn is halted and its result is deemed failed. If all the critical child test cases succeed, the result of multi-turn is also success.

![multiturn results view](https://github.com/user-attachments/assets/bf070846-5444-42a9-b07d-f588667dd465)

Non-critical child test cases can be used to "feed" information to custom agents with generative orchestration, or if the response simply does not matter, but is building up to the following critical tests.

### Plan validation

If the test type is plan validation, maker can specify a comma separated list of tool names that are expected to be included in the dynamic plan for the test utterance. Tools, actions and connected agents can be included. No extra whitespace is allowed and the order in the expected tools field does not matter. Pass threshold % specifies the required portion of expected tools that need to be in the dynamic plan for the test to succeed. This test leverages conversation transcripts and will be evaluated post actual test run as an enrichment activity.

<img width="1744" height="1017" alt="plan validation" src="https://github.com/user-attachments/assets/ebc83984-1e66-47c1-a2d7-bf06c0a0bac3" />

Read more about generative orchestration from [Microsoft Learn](https://learn.microsoft.com/microsoft-copilot-studio/advanced-generative-actions).

## Use Excel to bulk create or update tests

After creating a test set, you may use Excel to bulk create or update tests.
1. From your **test set** record
1. Switch the subgrid view from **Tests** to **Export/Import View**.
1. In the subgrid commands, select **Export Agent Tests in Excel Online**.
1. Add and modify tests as required.
1. Click **Save**.
1. **Wait** for the import to complete and succeed.

Please be aware that if you are importing **multi-turn child tests**, you have to create or import the actual parent multi-turn test first, and import the child test cases after.

> [!NOTE]
> Learn more about Excel import and export in Power Apps model-driven apps here: [How to import data
](https://learn.microsoft.com/power-apps/user/import-data)

## Duplicating a Test Set

Users may duplicate a full test set by selecting the **Duplicate Test Set** command.

![image](https://github.com/microsoft/Powercat-Copilotstudio-Accelerator/assets/37898885/a31e9c83-1321-46e3-a887-defa47521a9d)

## Duplicating a Test Case

Users may duplicate a single test case by selecting the **Duplicate Test Case** command. This is especially useful when creating variants of single test case (varying just the location, time, amount, etc.)

## Next step
- [Run tests](./RUN_TESTS.md)
