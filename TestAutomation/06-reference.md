# Reference

## Table of Contents

- [Quick Start Checklist](#quick-start-checklist)
- [Test Type Reference Table](#test-type-reference-table)
- [Comparison Operators Reference](#comparison-operators-reference)
- [Test Case Field Reference](#test-case-field-reference)
- [Agent Configuration Field Reference](#agent-configuration-field-reference)
- [Enrichment Pipeline Reference](#enrichment-pipeline-reference)
- [Test Result Field Reference](#test-result-field-reference)
- [Status Values and Meanings](#status-values-and-meanings)
- [Timing and Delays Reference](#timing-and-delays-reference)
- [AI Builder Credit Usage](#ai-builder-credit-usage)
- [Rubric Integration Reference](#rubric-integration-reference)
- [External Variables JSON Format](#external-variables-json-format)
- [Sample Test Configurations](#sample-test-configurations)
- [Multi-turn Test Patterns](#multi-turn-test-patterns)
- [Common Error Messages and Solutions](#common-error-messages-and-solutions)
- [Glossary](#glossary)
- [Useful Links](#useful-links)

---

## Quick Start Checklist

Follow these steps to get started with test automation:

### Prerequisites
- [ ] Copilot Studio Kit installed in Power Platform environment
- [ ] Copilot Studio agent created and published
- [ ] Direct Line channel configured on agent

### Step 1: Configure Agent Connection
- [ ] Navigate to **Agents** in Copilot Studio Kit
- [ ] Create new **Agent Configuration** record
- [ ] Set **Configuration Type**: Test Automation
- [ ] Configure **Region** and **Token Endpoint** (or Channel Security + Secret)
- [ ] *Optional*: Enable enrichment features (App Insights, AI Builder, Dataverse)
- [ ] Save agent configuration

### Step 2: Create Test Set
- [ ] Navigate to **Test Sets**
- [ ] Create new **Agent Test Set** record
- [ ] Provide descriptive name
- [ ] Save test set

### Step 3: Add Test Cases
- [ ] From test set, create **New Agent Test**
- [ ] Select **Test Type**
- [ ] Provide **Test Utterance** and expected outcome
- [ ] Configure test-type-specific fields
- [ ] Save test case
- [ ] Repeat for additional tests

### Step 4: Run Tests
- [ ] Navigate to **Test Runs**
- [ ] Create new **Agent Test Run** record
- [ ] Select **Agent Test Set** and **Agent Configuration**
- [ ] Save to start execution
- [ ] Wait for **Run Status** to reach **Complete**

### Step 5: Analyze Results
- [ ] Check **Aggregated Results** (success rate, latency)
- [ ] Review **Detailed Results** in test results subgrid
- [ ] Investigate any failed tests
- [ ] *Optional*: Wait for enrichment to complete (~5-60 min)

### Step 6: Iterate
- [ ] Update agent based on test results
- [ ] Update test expectations if needed
- [ ] Duplicate test run to rerun tests
- [ ] Compare new results with baseline

---

## Test Type Reference Table

| Test Type | Purpose | Pass Criteria | Prerequisites | Timing |
|-----------|---------|---------------|---------------|--------|
| **Response Match** | Validate text response matches expected text | Response matches using comparison operator | None | Immediate |
| **Attachments Match** | Validate attachments (Adaptive Cards, files) | Attachments JSON matches expected JSON or AI validation passes | None (AI Builder optional) | Immediate (or ~5 min for AI validation) |
| **Topic Match** | Verify correct topic is triggered | Triggered topic name matches expected topic | Dataverse enrichment | ~60 min |
| **Generative Answers** | Evaluate quality of AI-generated responses | AI determines response matches sample answer, validation instructions, or rubric | AI Builder enrichment; App Insights recommended | ~5-10 min |
| **Multi-turn** | Test multi-step conversational flows | All critical child tests pass | Depends on child tests | Depends on child tests |
| **Plan Validation** | Validate tools in dynamic plan | Percentage of expected tools found ≥ pass threshold | Dataverse enrichment; generative orchestration enabled | ~60 min |

---

## Comparison Operators Reference

Available for **Response Match** and **Attachments Match** test types.

| Operator | Behavior | Use Cases | Example |
|----------|----------|-----------|---------|
| **Equals** | Exact match (default) | Deterministic responses, structured output | Expected: "Hello!" → Actual: "Hello!" ✅ |
| **Does not equal** | Must not match exactly | Negative testing, ensure variation | Expected: "Error" → Actual: "Success" ✅ |
| **Contains** | Expected is substring of actual | Flexible matching, key phrases | Expected: "30 days" → Actual: "We offer a 30 day return policy" ✅ |
| **Does not contain** | Expected must not appear | Prohibited content, negative testing | Expected: "password" → Actual: "Contact support" ✅ |
| **Begins with** | Actual starts with expected | Greeting messages, consistent openings | Expected: "Hello" → Actual: "Hello! How can I help?" ✅ |
| **Does not begin with** | Actual must not start with expected | Ensure responses don't start with specific text | Expected: "Error" → Actual: "Success!" ✅ |
| **Ends with** | Actual ends with expected | Consistent closings, signatures | Expected: "team!" → Actual: "Thanks, Support team!" ✅ |
| **Does not end with** | Actual must not end with expected | Ensure responses don't end with specific text | Expected: "Error" → Actual: "Process completed." ✅ |

---

## Test Case Field Reference

### Common Fields (All Test Types)

| Field | Required | Description | Format/Values |
|-------|----------|-------------|---------------|
| **Name** | Yes | Descriptive test name | Text (e.g., "TST-001 - Login Happy Path") |
| **Agent Test Set** | Yes | Parent test set | Lookup (auto-populated if creating from test set) |
| **Test Type** | Yes | Type of validation | Response Match, Attachments Match, Topic Match, Generative Answers, Multi-turn, Plan Validation |
| **Test Utterance** | Yes | Message to send to agent | Text |
| **Send startConversation Event** | No | Send proactive greeting event before test utterance | Yes/No (default: No) |
| **Expected Position of the Response Message** | No | Capture specific message if agent sends multiple | 0-based index (0 = first, 1 = second, etc.) |
| **External Variables JSON** | No | Contextual variables to pass to agent | JSON object: `{"Language": "fr"}` |
| **Seconds Before Getting Answer** | No | Wait time before evaluating response | Number (seconds) |

### Response Match Specific

| Field | Required | Description |
|-------|----------|-------------|
| **Expected Response** | Yes | Expected text response |
| **Comparison Operator** | Yes | How to compare responses (default: Equals) |

### Attachments Match Specific

| Field | Required | Description |
|-------|----------|-------------|
| **Expected Attachments JSON** | Yes | Full expected attachments array as JSON |
| **Comparison Operator** | Yes | How to compare attachments (default: Equals) |
| **Operation Type** | Depends | **Comparison Operator** or **Invoke Actions** (for multi-turn) |
| **Adaptive Card Payload** | Depends | For Invoke Actions: the action to perform (JSON) |

### Topic Match Specific

| Field | Required | Description |
|-------|----------|-------------|
| **Expected Topic Name** | Yes | Topic that should be triggered (comma-separated for multi-topic) |

### Generative Answers Specific

| Field | Required | Description |
|-------|----------|-------------|
| **Expected Response** | Yes | Sample answer OR validation instructions |
| **Expected Generative Answers Outcome** | Yes | Answered, Not Answered, Moderated, No Search Results |
| **Rubric** | No | Custom rubric for evaluation |
| **Passing Grade** | No | Minimum grade to pass (1-5, default: 5) if rubric selected |

### Plan Validation Specific

| Field | Required | Description |
|-------|----------|-------------|
| **Expected Tools** | Yes | Comma-separated list of expected tool names (no extra whitespace) |
| **Pass Threshold %** | Yes | Percentage of expected tools that must be in plan (0-100) |

### Multi-turn Child Test Specific

| Field | Required | Description |
|-------|----------|-------------|
| **Order** | Yes | Execution order (0-based) |
| **Criticality** | Yes | Critical or Non-Critical |
| All standard fields | Yes | Configure as for standalone test |

---

## Agent Configuration Field Reference

### Base Configuration

| Field | Required | Description |
|-------|----------|-------------|
| **Name** | Yes | Descriptive name for configuration |
| **Configuration Type(s)** | Yes | Test Automation, Conversation KPIs, or File Synchronization |

### Direct Line Settings

| Field | Required | Description |
|-------|----------|-------------|
| **Region** | Yes | Azure region where agent is deployed |
| **Token Endpoint** | Depends | Required if Channel Security not enabled |
| **Channel Security** | No | Enable to use secrets instead of token endpoint |
| **Secret Location** | Depends | Dataverse or Key Vault (if Channel Security enabled) |
| **Secret** | Depends | Direct Line secret (if using Dataverse) |
| **Environment Variable** | Depends | Schema name of environment variable (if using Key Vault) |

### User Authentication

| Field | Required | Description |
|-------|----------|-------------|
| **User Authentication** | No | Select Entra ID v2 if authentication required |
| **Client ID** | Depends | Application (client) ID of KitAuthApp |
| **Tenant ID** | Depends | Directory (tenant) ID of KitAuthApp |
| **Scope** | Depends | Full scope URI from CopilotStudioAuthApp |
| **Secret Location** (User Auth) | Depends | Dataverse or Key Vault |
| **Client Secret** | Depends | Client secret for KitAuthApp (if using Dataverse) |
| **Environment Variable** (User Auth) | Depends | Schema name of environment variable (if using Key Vault) |

### Enrichment - App Insights

| Field | Required | Description |
|-------|----------|-------------|
| **Enrich With Azure Application Insights** | No | Enable to retrieve generative answer details |
| **App Insights Client ID** | Depends | Application (client) ID with App Insights permissions |
| **App Insights Application ID** | Depends | AppId of Application Insights resource |
| **App Insights Tenant ID** | Depends | Tenant ID of Application Insights resource |
| **App Insights Secret Location** | Depends | Dataverse or Key Vault |
| **App Insights Secret** | Depends | Client secret (if using Dataverse) |
| **App Insights Environment Variable** | Depends | Schema name of environment variable (if using Key Vault) |

### Enrichment - AI Builder

| Field | Required | Description |
|-------|----------|-------------|
| **Analyze Generated Answers** | No | Enable to evaluate generative responses with AI Builder |
| **Generative AI Provider** | Depends | Select AI Builder (currently only supported provider) |

### Enrichment - Dataverse

| Field | Required | Description |
|-------|----------|-------------|
| **Enrich With Conversation Transcripts** | No | Enable to retrieve topic names, transcripts, citations |
| **Dataverse URL** | Depends | URL of Dataverse environment (e.g., https://org.crm.dynamics.com) |
| **Copy Full Transcript** | No | Copy full conversation transcript JSON as attachment |

---

## Enrichment Pipeline Reference

| Stage | Timing | Provides | Required For | Dependencies |
|-------|--------|----------|--------------|--------------|
| **App Insights Enrichment** | ~5 min after test run | Generative answer outcome, diagnostics, telemetry | Generative Answers diagnostics | None |
| **Generated Answers Analysis** | After App Insights completes | AI evaluation, grade + rationale (if rubric), pass/fail | Generative Answers tests | App Insights Enrichment |
| **Dataverse Enrichment** | ~60 min after test run | Topic name, intent scores, transcripts, citations, dynamic plan | Topic Match, Plan Validation | None |

---

## Test Result Field Reference

### Automatically Populated Fields

| Field | Description | Availability |
|-------|-------------|--------------|
| **Conversation ID** | Unique conversation identifier from Direct Line | Immediate |
| **Agent Test Run** | Related test run | Immediate |
| **Agent Test** | Related test case | Immediate |
| **Result** | Success, Failed, Unknown, Error, Pending | Immediate (may update after enrichment) |
| **Result Reason** | Auto-generated explanation | Immediate (may update after enrichment) |
| **Latency (ms)** | Response time | Immediate |
| **Message Sent** | Timestamp of test utterance | Immediate |
| **Response Received** | Timestamp of agent response | Immediate |
| **Response** | Text message from agent | Immediate |
| **Suggested Actions** | JSON of suggested actions | Immediate |
| **Attachments** | JSON of attachments array | Immediate |
| **App Insights Result** | Generative answer details | After App Insights enrichment (~5 min) |
| **Triggered Topic ID** | Unique identifier of topic | After Dataverse enrichment (~60 min) |
| **Triggered Topic / Event** | Name of triggered topic | After Dataverse enrichment (~60 min) |
| **Recognized Intent Score** | Intent confidence score | After Dataverse enrichment (~60 min) |
| **Conversation Transcript** | Full conversation JSON | After Dataverse enrichment (~60 min, if enabled) |
| **Citations** | Citations used for generative answers | After Dataverse enrichment (~60 min) |

### Editable Fields

| Field | Description | Use Case |
|-------|-------------|----------|
| **Result** | Can be manually updated | Correct false positives/negatives |
| **Result Reason** | Can be manually edited | Add human review comments, notes |

---

## Status Values and Meanings

### Run Status

| Status | Meaning |
|--------|---------|
| **Not Run** | Test run created but execution not yet started |
| **Running** | Tests are currently executing |
| **Complete** | All tests have executed successfully |
| **Error** | An error occurred during execution |

### Enrichment Status (App Insights, AI Builder, Dataverse)

| Status | Meaning |
|--------|---------|
| **Pending** | Waiting for data to become available or prerequisite enrichment to complete |
| **Running** | Enrichment cloud flow is executing |
| **Complete** | Enrichment completed successfully |
| **Error** | Enrichment failed (link to error provided) |

### Test Result Status

| Status | Meaning |
|--------|---------|
| **Success** | Test passed |
| **Failed** | Test failed |
| **Unknown** | Unable to determine pass/fail |
| **Error** | An error occurred during test execution |
| **Pending** | Awaiting enrichment data to determine pass/fail |

---

## Timing and Delays Reference

| Operation | Timing | Notes |
|-----------|--------|-------|
| **Test Execution** | Seconds to minutes | Depends on number of tests and agent response time |
| **Response Match / Attachments Match Results** | Immediate | No enrichment required |
| **App Insights Data Availability** | ~5 min after test run | Approximate; may vary |
| **AI Builder Analysis** | After App Insights completes | Runs immediately once App Insights done |
| **Dataverse Data Availability** | ~60 min after test run | Approximate; conversation transcripts written with delay |
| **Total Time (All Enrichment)** | ~60-65 min | Accounts for both App Insights and Dataverse |

### Planning Recommendations

- **Immediate feedback**: Use Response Match tests
- **Same-day results**: Run Generative Answers tests in the morning
- **Overnight testing**: Run comprehensive suites including Topic Match and Plan Validation

---

## AI Builder Credit Usage

| Activity | Credits per Test | Notes |
|----------|------------------|-------|
| **Generative Answers (Testing Mode)** | 50 | Grade only, no rationale |
| **Generative Answers (Refinement Mode)** | 50 + additional | Grade + detailed rationale (more expensive) |
| **AI Validation for Attachments** | 50 | When using AI Validation comparison operator |

### Cost Estimation Example

**Test Suite**:
- 50 Response Match tests: 0 credits
- 20 Generative Answers tests: 20 × 50 = 1,000 credits
- 10 Topic Match tests: 0 credits
- **Total**: 1,000 credits per run

**Monthly Cost** (daily runs):
- 1,000 credits/day × 30 days = 30,000 credits/month

---

## Rubric Integration Reference

### Two Modes of Rubric Usage

| Aspect | Testing Mode (Test Case Level) | Refinement Mode (Test Run Level) |
|--------|--------------------------------|-----------------------------------|
| **Assignment Level** | Individual test case | Entire test run |
| **When to Use** | Ongoing quality assurance | Rubric refinement |
| **AI Output** | Grade only (cost-effective) | Grade + detailed rationale (expensive) |
| **Pass/Fail** | Grade ≥ passing grade | Passing grade informational only |
| **Goal** | Identify low-quality responses | Minimize AI-human misalignment |
| **Non-GA Test Types** | Run normally | Skipped |

### Decision Guide

| Question | Answer | Use This Mode |
|----------|--------|---------------|
| Are you refining a rubric? | Yes | Test Run Level (Refinement Mode) |
| Do you have a stable rubric? | Yes | Test Case Level (Testing Mode) |
| Need AI reasoning? | Yes | Test Run Level (more expensive) |
| High-volume testing? | Yes | Test Case Level (cost-effective) |

**See**: [Rubrics Refinement Documentation](../RubricRefinement/01-rubrics-refinement-overview.md)

---

## External Variables JSON Format

**Purpose**: Pass contextual or global variables to the agent during test execution.

**Format**: JSON object with variable name-value pairs

**Examples**:

```json
{
  "Language": "fr"
}
```

```json
{
  "UserRole": "Administrator",
  "Department": "Sales"
}
```

```json
{
  "OrderID": "ORD-12345",
  "CustomerID": "CUST-67890"
}
```

**Use Cases**:
- Multi-language testing
- Role-based testing
- Context-specific scenarios
- Passing identifiers for data lookups

**See**: [Copilot Studio Variables Documentation](https://learn.microsoft.com/microsoft-copilot-studio/authoring-variables-bot?tabs=webApp#add-global-variables-to-a-custom-canvas)

---

## Sample Test Configurations

### Example 1: Simple Response Match

**Scenario**: Test that agent provides business hours

**Configuration**:
- **Name**: "FAQ - Business Hours"
- **Test Type**: Response Match
- **Test Utterance**: "What are your business hours?"
- **Expected Response**: "We're open Monday through Friday, 9 AM to 5 PM."
- **Comparison Operator**: Equals

**Expected Result**: Pass if response matches exactly

---

### Example 2: Generative Answers with Validation Instructions

**Scenario**: Test that agent provides helpful return policy information

**Configuration**:
- **Name**: "Policy - Return Guidelines"
- **Test Type**: Generative Answers
- **Test Utterance**: "What is your return policy?"
- **Expected Response**: "The response should mention a 30-day return window, explain how to initiate a return, and include contact information for support."
- **Expected Generative Answers Outcome**: Answered

**Expected Result**: Pass if AI Builder determines response meets validation criteria

---

### Example 3: Multi-turn Conversation

**Scenario**: Test appointment booking flow

**Parent Multi-turn Test**:
- **Name**: "Appointment Booking - End to End"
- **Test Type**: Multi-turn

**Child Test 1** (Order: 0, Non-Critical):
- **Test Type**: Response Match
- **Test Utterance**: "I want to book an appointment"
- **Expected Response**: "service"
- **Comparison Operator**: Contains

**Child Test 2** (Order: 1, Non-Critical):
- **Test Type**: Response Match
- **Test Utterance**: "Haircut"
- **Expected Response**: "date"
- **Comparison Operator**: Contains

**Child Test 3** (Order: 2, Critical):
- **Test Type**: Response Match
- **Test Utterance**: "Next Monday at 10 AM"
- **Expected Response**: "confirmed"
- **Comparison Operator**: Contains

**Expected Result**: Pass if final confirmation message contains "confirmed"

---

### Example 4: Plan Validation

**Scenario**: Verify generative orchestration selects correct tools

**Configuration**:
- **Name**: "Orchestration - Weather and Climate"
- **Test Type**: Plan Validation
- **Test Utterance**: "What's the weather and latest climate change research?"
- **Expected Tools**: "Weather,Climate change research"
- **Pass Threshold %**: 100

**Expected Result**: Pass if both tools appear in dynamic plan

---

## Multi-turn Test Patterns

### Pattern 1: Connection Authorization

**Use Case**: Handle OAuth or connection authorization popup

**Structure**:
1. **Child Test 1** (Non-Critical): Capture authorization prompt
2. **Child Test 2** (Critical): Invoke "Allow" action, validate data retrieved

**Complete Example**: [Allow Connection Popup](../ALLOW_CONNECTION_POPUP.md)

---

### Pattern 2: Information Gathering

**Use Case**: Agent collects information across multiple turns

**Structure**:
1. **Child Test 1** (Non-Critical): Initial request
2. **Child Test 2** (Non-Critical): Provide first piece of info
3. **Child Test 3** (Non-Critical): Provide second piece of info
4. **Child Test 4** (Critical): Validate final outcome

**Example**: Booking flow (service → date → time → confirmation)

---

### Pattern 3: Error Recovery

**Use Case**: Test how agent handles corrections

**Structure**:
1. **Child Test 1** (Non-Critical): Provide invalid input
2. **Child Test 2** (Non-Critical): Validate error message
3. **Child Test 3** (Critical): Provide corrected input, validate success

**Example**: Invalid date → error → valid date → booking confirmed

---

### Pattern 4: Generative Orchestration

**Use Case**: Test tool selection across conversation

**Structure**:
1. **Child Test 1** (Critical): First question triggers Tool A
2. **Child Test 2** (Critical): Follow-up question triggers Tool B
3. **Child Test 3** (Critical): Validate combined results

**Example**: "What's the weather?" → "Any climate trends?" → Combined weather + climate insights

---

## Common Error Messages and Solutions

| Error Message | Possible Cause | Solution |
|---------------|----------------|----------|
| "Failed to obtain Direct Line token" | Incorrect Token Endpoint or Secret | Verify Token Endpoint or Secret in agent configuration |
| "Authentication failed" | Incorrect authentication configuration | Verify Client ID, Tenant ID, Scope, and Client Secret |
| "Timeout waiting for response" | Agent taking too long to respond | Increase "Seconds Before Getting Answer" or check agent performance |
| "App Insights enrichment failed" | App Insights configuration issue | Verify App Insights Application ID and permissions |
| "Dataverse enrichment failed" | Dataverse URL or permissions issue | Verify Dataverse URL and connection permissions |
| "Insufficient AI Builder credits" | AI Builder capacity exhausted | Purchase or allocate more AI Builder credits |
| "Topic name not found in transcript" | Topic wasn't triggered or Dataverse enrichment incomplete | Verify topic was triggered; wait for enrichment to complete |
| "Expected tools not found in plan" | Tools not selected by orchestration or wrong tool names | Check tool names match exactly; verify generative orchestration enabled |

---

## Glossary

**Agent Configuration**: A connection profile defining how to connect to a specific Copilot Studio agent for testing.

**AI Builder**: Microsoft's AI service used to evaluate generative responses in test automation.

**App Insights**: Azure Application Insights, used for telemetry and generative answer diagnostics.

**Attachments**: Rich responses from agents (Adaptive Cards, files, images).

**Channel Security**: Security feature for Direct Line that requires secrets instead of token endpoints.

**Comparison Operator**: Defines how expected and actual values are compared (Equals, Contains, etc.).

**Criticality**: Property of multi-turn child tests indicating whether failure should halt execution (Critical) or continue (Non-Critical).

**Dataverse Enrichment**: Process of retrieving conversation transcript data from Dataverse.

**Direct Line API**: Bot Framework API used to communicate with Copilot Studio agents.

**Enrichment Pipeline**: Three-stage process (App Insights, AI Builder, Dataverse) for gathering additional test result data.

**External Variables**: Contextual or global variables passed to the agent during test execution.

**Generative Answers**: AI-generated responses from Copilot Studio's generative capabilities.

**Generative Orchestration**: Copilot Studio feature where AI dynamically selects and executes tools.

**Multi-turn Test**: Test type consisting of multiple child tests executed sequentially in the same conversation context.

**Plan Validation**: Test type for validating tools selected in dynamic plans by generative orchestration.

**Rubric**: Reusable evaluation standard for grading AI-generated responses.

**Rubrics Refinement**: Iterative process for creating and improving rubrics by aligning AI grading with human judgment.

**Test Case**: Individual test scenario (also called "Agent Test").

**Test Result**: Outcome of running a single test case as part of a test run.

**Test Run**: Execution of all test cases in a test set against a specific agent configuration.

**Test Set**: Collection of related test cases grouped together.

**Topic Match**: Test type for verifying correct Copilot Studio topic is triggered.

**Validation Instructions**: Natural language criteria for evaluating generative responses.

---

## Useful Links

### Copilot Studio Documentation

- [Microsoft Copilot Studio Overview](https://learn.microsoft.com/microsoft-copilot-studio/fundamentals-what-is-copilot-studio)
- [Configure Web Channel Security](https://learn.microsoft.com/microsoft-copilot-studio/configure-web-security)
- [User Authentication in Copilot Studio](https://learn.microsoft.com/microsoft-copilot-studio/configuration-authentication-azure-ad)
- [Generative Orchestration](https://learn.microsoft.com/microsoft-copilot-studio/advanced-generative-actions)
- [Global Variables](https://learn.microsoft.com/microsoft-copilot-studio/authoring-variables-bot?tabs=webApp#add-global-variables-to-a-custom-canvas)

### Azure and Bot Framework

- [Direct Line API Reference](https://learn.microsoft.com/azure/bot-service/rest-api/bot-framework-rest-direct-line-3-0-api-reference?view=azure-bot-service-4.0)
- [Azure Application Insights](https://learn.microsoft.com/azure/azure-monitor/app/app-insights-overview)
- [Azure Key Vault Secrets](https://learn.microsoft.com/power-apps/maker/data-platform/environmentvariables-azure-key-vault-secrets)

### AI Builder

- [AI Builder Overview](https://learn.microsoft.com/ai-builder/overview)
- [AI Builder Licensing](https://learn.microsoft.com/ai-builder/administer-licensing)

### Power Platform

- [Power Platform Pipelines](https://learn.microsoft.com/power-platform/alm/pipelines)
- [Power Apps Model-Driven Apps](https://learn.microsoft.com/power-apps/maker/model-driven-apps/model-driven-app-overview)
- [Excel Import and Export](https://learn.microsoft.com/power-apps/user/import-data)

### Copilot Studio Kit

- [Installation Instructions](../INSTALLATION_INSTRUCTIONS.md)
- [Enable Authentication](../ENABLE-AUTHENTICATION.md)
- [Enable App Insights](../ENABLE-APPINSIGHTS.md)
- [Automated Testing with Pipelines](../AUTOMATED_TESTING.md)
- [Allow Connection Popup Pattern](../ALLOW_CONNECTION_POPUP.md)
- [Rubrics Refinement Documentation](../RubricRefinement/01-rubrics-refinement-overview.md)
- [GitHub Repository](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit)
- [Report Issues](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues)

---

**Previous**: [← Best Practices and Workflows](05-best-practices-and-workflows.md)
