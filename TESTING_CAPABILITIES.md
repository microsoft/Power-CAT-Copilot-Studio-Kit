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

## Technical Details

### Connection References

| Connection Reference | Connector | Required |
|---|---|---|
| Copilot Studio Kit - Dataverse | Microsoft Dataverse | Yes — core data operations for all test features |

### Environment Variables

| Display Name | Schema Name | Default | Description |
|---|---|---|---|
| Delay for Azure Application Insights Enrichment (Minutes) | `cat_DelayforAzureApplicationInsightsEnrichment` | 5 | Wait time before querying Application Insights after a test run, allowing telemetry ingestion to complete |
| Delay for Conversation Transcripts Enrichment (Minutes) | `cat_DelayforConversationTranscriptsEnrichment` | 35 | Wait time before querying Dataverse Conversation Transcripts after a test run, allowing transcript records to be created |

### Cloud Flows

| Flow Name | Trigger Type | Purpose |
|---|---|---|
| Test Automation \| Run Agent Tests | Automated | Main orchestrator — executes test cases against agents via Direct Line and coordinates enrichment steps |
| Test Automation \| Run Multiturn Tests (Child) | Child flow | Executes multi-turn test sequences within a single conversation context |
| Test Automation \| Analyze Generated Answers with AI Builder | Child flow | Uses AI Builder prompts to compare AI-generated responses against expected answers or validation instructions |
| Test Automation \| Enrich with Azure Application Insights | Child flow | Retrieves additional telemetry data (generative answer details) from Azure Application Insights |
| Test Automation \| Enrich with Dataverse Conversation Transcripts | Child flow | Analyzes Conversation Transcript records to extract triggered topic names, intent recognition scores, etc. |
| Test Automation \| Multi-Topic Transcripts Enrichment (Child) | Child flow | Handles transcript enrichment for conversations that span multiple topics |
| Test Automation \| Update Agent Test Run Rollup Columns | Automated | Recalculates and updates aggregate result columns on test run records |
| Test Automation \| Assign Copilot Studio Kit Tester Role to Team | Automated | Assigns the required security role to a team for test execution permissions |
| Test Automation \| AI Builder Credit Consumption | Automated | Tracks AI Builder credit usage from AI-powered test analysis |
| Test Automation \| Validate Agent Plans (Child) | Child flow | Validates tool selections in the dynamic plan of custom agents with generative orchestration |
| Test Automation \| Rubrics AI Grading Flow | Automated | Performs AI-based grading of agent responses using defined rubrics |
| Test Automation \| Rubrics Refinement | Automated | Iterates on rubric definitions to improve grading accuracy |
| Pipeline \| Validate Agent Using Test Cases | Automated | Pipeline-triggered flow that runs test cases as part of a deployment validation gate |

### Dataverse Tables

| Display Name | Schema Name | Shared | Description |
|---|---|---|---|
| Agent Test | `cat_CopilotTest` | No | Individual test case definitions (utterance, expected response, test type) |
| Agent Test Result | `cat_CopilotTestResult` | No | Stores the outcome of each executed test case |
| Agent Test Run | `cat_CopilotTestRun` | No | Represents a single execution run across a test set |
| Agent Test Set | `cat_CopilotTestSet` | No | Groups related test cases together for batch execution |
| Agent Configuration | `cat_CopilotConfiguration` | Yes — shared with other kit features | Stores agent connection details (token endpoint, Application Insights keys, etc.) |
| Error Details | `cat_ErrorDetails` | No | Captures detailed error information from failed test executions |
| Rubric | `cat_Rubric` | Yes — shared with Rubric Refinement | Defines grading criteria used by AI-based response evaluation |
| Rubric Example | `cat_RubricExample` | Yes — shared with Rubric Refinement | Sample graded responses used as reference examples for rubric-based evaluation |

### DLP Configuration

The following connectors must be allowed to communicate within the same DLP policy group for the testing features to function:

- **Microsoft Dataverse** — Required for all test data operations
- **Microsoft Entra ID** — Required only when testing agents configured with manual authentication (SSO scenarios)
- **Direct Line channels in Copilot Studio** — Required for communicating with agents during test execution

> **Note:** If your environment DLP policies block any of these connectors, the corresponding cloud flows will fail at runtime. Ensure all three connectors are in the same business data group when testing agents that use SSO authentication.

Back to the [landing page](./README.md#power-cat-copilot-studio-kit)
