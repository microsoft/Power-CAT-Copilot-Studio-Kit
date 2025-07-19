## Testing capabilities  
The Power CAT Copilot Studio Kit is a user-friendly application that empowers makers to configure agents and test sets. It has native capabilities such as Excel export or import for bulk creation and updates.

By running individual tests against the Copilot Studio APIs (Direct Line), the agent responses are evaluated against expected results.
To further enrich results, additional data points can be retrieved from Azure Application Insights and from Dataverse, by analyzing Conversation Transcript records (to get the exact triggered topic name, intent recognition scores, etc.).
For AI-generated answers, that are by nature non-deterministic, AI Builder prompts are used to compare the generated answer with a sample answer or with validation instructions.

Today, the tool supports these types of tests:
- Response match
- Attachments match
- Topic match (requires Dataverse enrichment)
- Generative answers (requires AI Builder for response analysis, and Azure Application Insights for details on why an answer was or was not generated)
- Multi-turn test type is a special test type that consists of a set of test cases of *regular* types that are executed in specified order in same conversation context. Multi-turn tests can be used to test scenarios end-to-end, and for testing custom agents with generative orchestration.
- Plan validation allows maker to validate the tools included in the dynamic plan of Copilot Studio custom agent with generative orchestration

![image](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/assets/37898885/33496e94-0c7a-4e63-9291-9e461aa9b9e7)

![image](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/assets/37898885/25f071ff-6b4f-4f5f-b6a3-20193a2d1feb)

Read more on how to configure agent for [test automation](./CONFIGURE_COPILOTS.md#configure-a-new-agent-for-test-automation)

Back to the [landing page](./README.md#power-cat-copilot-studio-kit)
