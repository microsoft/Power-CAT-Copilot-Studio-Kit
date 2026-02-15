# Creating and Managing Tests

## Table of Contents

- [Overview](#overview)
- [Creating Test Sets](#creating-test-sets)
- [The Six Test Types in Detail](#the-six-test-types-in-detail)
  - [Response Match](#1-response-match)
  - [Attachments Match](#2-attachments-match)
  - [Topic Match](#3-topic-match)
  - [Generative Answers](#4-generative-answers)
  - [Multi-turn Tests](#5-multi-turn-tests)
  - [Plan Validation](#6-plan-validation)
- [Test Case Common Configuration Fields](#test-case-common-configuration-fields)
- [Comparison Operators Reference](#comparison-operators-reference)
- [Using Excel for Bulk Operations](#using-excel-for-bulk-operations)
- [Duplicating Tests and Test Sets](#duplicating-tests-and-test-sets)
- [Organizing Test Sets](#organizing-test-sets)
- [Best Practices for Test Design](#best-practices-for-test-design)

---

## Overview

Tests are organized in a two-level hierarchy:

1. **Test Sets**: Collections of related test cases
2. **Test Cases**: Individual test scenarios

When you run tests, you select a **Test Set**, and all **Test Cases** in that set are executed against a specified agent configuration.

---

## Creating Test Sets

A **Test Set** is a logical grouping of test cases. Test sets help you organize tests by feature area, priority, or test type.

### Steps to Create a Test Set

1. Open the **Power CAT Copilot Studio Kit** application
2. Navigate to **Test Sets** from the left navigation
3. Click **+ New** to create a new Agent Test Set record
4. Provide a descriptive **Name** (e.g., "FAQ Tests", "Login Flow", "Generative Answers Suite")
5. Click **Save**

### Test Set Naming Conventions

Choose names that clearly communicate the test set's purpose:

- **By Feature**: "User Authentication", "Product Catalog", "Order Management"
- **By Priority**: "P0 Critical Tests", "P1 High Priority", "P2 Regression Suite"
- **By Test Type**: "Response Match Tests", "Generative Answers QA", "Multi-turn Scenarios"
- **By Environment**: "Production Smoke Tests", "Staging Full Suite"

---

## The Six Test Types in Detail

The Copilot Studio Kit supports six distinct test types. Each type is designed for specific validation scenarios.

---

### 1. Response Match

**Purpose**: Validate that the agent's text response matches expected text using comparison operators.

#### When to Use Response Match

- Testing **deterministic responses** (greetings, FAQs, scripted responses)
- Verifying **specific phrases** appear in responses
- Ensuring responses **don't contain** prohibited content
- Testing **exact text** matching for structured outputs

#### How It Works

1. Send a test utterance to the agent
2. Capture the agent's response text
3. Compare the actual response with the expected response using the selected comparison operator
4. Pass if the comparison succeeds; fail otherwise

#### Configuration Fields

| Field | Required | Description |
|-------|----------|-------------|
| **Test Type** | Yes | Select **Response Match** |
| **Test Utterance** | Yes | The message to send to the agent |
| **Expected Response** | Yes | The expected text response |
| **Comparison Operator** | Yes | How to compare responses (default: Equals) |

#### Example

**Test Utterance**: "What are your business hours?"
**Expected Response**: "We're open Monday through Friday, 9 AM to 5 PM"
**Comparison Operator**: Equals

**Result**:
- **Pass**: If agent responds with exactly "We're open Monday through Friday, 9 AM to 5 PM"
- **Fail**: If agent responds with anything else

#### Tips

- Use **Equals** for exact matching
- Use **Contains** for flexible matching (e.g., response must include "Monday through Friday")
- Use **Begins with** for greeting messages
- Use **Does not contain** for negative testing (ensure prohibited words don't appear)

---

### 2. Attachments Match

**Purpose**: Validate that the agent returns expected attachments (Adaptive Cards, files, images).

#### When to Use Attachments Match

- Testing **Adaptive Card** structure and content
- Verifying **file attachments** are returned
- Validating **rich responses** with buttons and actions
- Testing **dynamic card generation**

#### How It Works

1. Send a test utterance to the agent
2. Capture the attachments array from the agent's response
3. Compare the actual attachments JSON with the expected attachments JSON
4. Pass if the comparison succeeds; fail otherwise

#### Configuration Fields

| Field | Required | Description |
|-------|----------|-------------|
| **Test Type** | Yes | Select **Attachments (Adaptive Cards, etc.)** |
| **Test Utterance** | Yes | The message to send to the agent |
| **Expected Attachments JSON** | Yes | The full expected attachments array as JSON |
| **Comparison Operator** | Yes | How to compare attachments (default: Equals) |
| **Operation Type** | Depends | For multi-turn: **Comparison Operator** or **Invoke Actions** |
| **Adaptive Card Payload** | Depends | For Invoke Actions: the action to perform (e.g., button click) |

#### Comparison Operators for Attachments

| Operator | Description |
|----------|-------------|
| **Equals** | Attachment JSON must match exactly |
| **Does not equal** | Attachment JSON must not match |
| **Contains** | Expected JSON is a subset of actual attachments |
| **Does not contain** | Expected JSON must not appear in actual attachments |
| **AI Validation** | Use AI to validate attachments based on validation instructions |

#### AI Validation for Attachments

When using **AI Validation**, you can provide natural language validation instructions instead of exact JSON:

**Expected Attachments JSON**: "The Adaptive Card should include a product image, product title, price, and an 'Add to Cart' button"

The AI Builder model will evaluate the attachment structure semantically.

#### Example: Testing an Adaptive Card

**Test Utterance**: "Show me the product details for Product A"
**Expected Attachments JSON**:
```json
[
  {
    "contentType": "application/vnd.microsoft.card.adaptive",
    "content": {
      "type": "AdaptiveCard",
      "body": [
        {
          "type": "TextBlock",
          "text": "Product A"
        }
      ]
    }
  }
]
```
**Comparison Operator**: Contains

#### Multi-turn: Invoking Actions

In multi-turn tests, you can use attachments tests to **invoke actions** on Adaptive Cards (e.g., clicking buttons):

**Operation Type**: Invoke Actions
**Adaptive Card Payload**:
```json
{
  "action": "Allow",
  "id": "submit",
  "shouldAwaitUserInput": true
}
```

This is useful for handling connection authorization popups or form submissions.

**See**: [Allow Connection Popup](../ALLOW_CONNECTION_POPUP.md) for a complete example.

---

### 3. Topic Match

**Purpose**: Verify that the expected Copilot Studio topic is triggered by the test utterance.

#### When to Use Topic Match

- Testing **intent recognition** accuracy
- Validating **topic routing** logic
- Ensuring correct topics are triggered for ambiguous utterances
- Testing **multi-topic scenarios** (agents with generative orchestration)

#### How It Works

1. Send a test utterance to the agent
2. Wait for Dataverse enrichment to complete (~60 minutes)
3. Retrieve the triggered topic name from the conversation transcript
4. Compare the actual topic name with the expected topic name
5. Pass if they match; fail otherwise

#### Configuration Fields

| Field | Required | Description |
|-------|----------|-------------|
| **Test Type** | Yes | Select **Topic Match** |
| **Test Utterance** | Yes | The message to send to the agent |
| **Expected Topic Name** | Yes | The name of the topic that should be triggered |

#### Single Topic Match

**Test Utterance**: "I want to reset my password"
**Expected Topic Name**: "Password Reset"

**Result**:
- **Pass**: If the "Password Reset" topic is triggered
- **Fail**: If any other topic (or no topic) is triggered

#### Multi-Topic Match (Generative Orchestration)

For custom agents with **generative orchestration** enabled, you can test that multiple expected topics are included in the dynamic plan:

**Test Utterance**: "What's the weather and climate change impact?"
**Expected Topic Name**: "Weather,Climate change" *(comma-separated, no extra whitespace)*

**Result**:
- **Pass**: If both "Weather" and "Climate change" appear in the dynamic plan
- **Fail**: If either topic is missing

> **Important**: For multi-topic matching, enter topics as comma-separated values with no extra whitespace. Order does not matter.

#### Prerequisites

- **Dataverse Enrichment must be enabled** in the agent configuration
- Wait approximately **60 minutes** after test run completes for results

---

### 4. Generative Answers

**Purpose**: Evaluate the quality of AI-generated responses using semantic comparison or custom rubrics.

#### When to Use Generative Answers

- Testing **knowledge base** responses
- Validating **generative answers** from Copilot Studio's generative capabilities
- Ensuring AI-generated content meets quality standards
- Testing **non-deterministic** AI responses

#### How It Works

1. Send a test utterance to the agent
2. Wait for App Insights enrichment to complete (~5 minutes)
3. AI Builder evaluates the response using one of three methods:
   - **Sample Answer**: Compare response with a provided sample answer
   - **Validation Instructions**: Evaluate response based on natural language criteria
   - **Rubric**: Grade response using a custom rubric (1-5 scale)
4. Pass if evaluation succeeds; fail otherwise

#### Configuration Fields

| Field | Required | Description |
|-------|----------|-------------|
| **Test Type** | Yes | Select **Generative Answers** |
| **Test Utterance** | Yes | The message to send to the agent |
| **Expected Response** | Yes | Sample answer OR validation instructions |
| **Expected Generative Answers Outcome** | Yes | Answered, Not Answered, Moderated, or No Search Results |
| **Rubric** (optional) | No | Select a custom rubric for evaluation |
| **Passing Grade** (with rubric) | No | Minimum grade to pass (1-5, default: 5) |

#### Three Evaluation Methods

##### Method 1: Sample Answer

Provide a **sample answer** in the **Expected Response** field. AI Builder will compare the agent's response semantically with your sample.

**Example**:
**Test Utterance**: "What is your return policy?"
**Expected Response**: "We offer a 30-day money-back guarantee on all products. Simply contact our support team to initiate a return."
**Expected Generative Answers Outcome**: Answered

**Result**: AI Builder determines if the agent's response is semantically similar to the sample answer.

##### Method 2: Validation Instructions

Provide **natural language validation instructions** in the **Expected Response** field. AI Builder will evaluate the response based on your criteria.

**Example**:
**Test Utterance**: "What is your return policy?"
**Expected Response**: "The response should mention a 30-day return window and explain how to initiate a return."
**Expected Generative Answers Outcome**: Answered

**Result**: AI Builder checks if the response meets your specified criteria.

##### Method 3: Custom Rubric

Select a **Rubric** from the dropdown and specify a **Passing Grade**. AI Builder will grade the response using your rubric's criteria.

**Example**:
**Test Utterance**: "What is your return policy?"
**Rubric**: "Customer Service Response Quality"
**Passing Grade**: 5 (Exemplary)
**Expected Generative Answers Outcome**: Answered

**Result**: AI Builder grades the response (1-5). Pass if grade ≥ passing grade.

**See**: [Using Rubrics in Tests](../RubricRefinement/03-using-rubrics-in-tests.md) for complete rubric documentation.

#### Negative Testing

When **App Insights Enrichment** is enabled, you can test negative scenarios:

- **Expected Generative Answers Outcome**: Not Answered
- **Expected Generative Answers Outcome**: Moderated (content violated moderation policies)
- **Expected Generative Answers Outcome**: No Search Results (no relevant knowledge found)

#### Prerequisites

- **AI Builder Enrichment must be enabled** in the agent configuration (mandatory)
- **App Insights Enrichment** recommended for diagnostics and negative testing
- AI Builder credits available (50 credits per test)

---

### 5. Multi-turn Tests

**Purpose**: Test conversational flows that span multiple turns within the same conversation context.

#### When to Use Multi-turn Tests

- Testing **end-to-end scenarios** (e.g., book appointment → confirm → receive confirmation)
- Handling **connection authorization** popups
- Testing custom agents with **generative orchestration**
- Validating **information-gathering** workflows
- Testing **error recovery** flows

#### How It Works

1. Create a parent multi-turn test case
2. Add child test cases (of any regular type) to the multi-turn test
3. Specify **order** and **criticality** for each child test
4. When the test runs, all child tests execute sequentially in the same conversation context
5. Pass/fail determined by critical child tests

#### Configuration Fields (Parent Multi-turn Test)

| Field | Required | Description |
|-------|----------|-------------|
| **Test Type** | Yes | Select **Multi-turn** |
| **Name** | Yes | Descriptive name for the multi-turn scenario |

#### Configuration Fields (Child Test Cases)

| Field | Required | Description |
|-------|----------|-------------|
| **Test Type** | Yes | Any regular test type (Response Match, Attachments, Topic Match, Generative Answers) |
| **Order** | Yes | Execution order (0-based: 0 = first, 1 = second, etc.) |
| **Criticality** | Yes | **Critical** or **Non-Critical** |
| All standard fields | Yes | Configure as you would for a standalone test |

#### Criticality Explained

- **Critical**: If this child test fails, the entire multi-turn test stops and is marked as Failed
- **Non-Critical**: If this child test fails, execution continues to the next child test

**Use Non-Critical tests for**:
- "Feeding" information to the agent (the exact response doesn't matter)
- Optional steps in a workflow
- Tests that gather context for subsequent critical tests

#### Example: Connection Authorization Flow

**Parent Multi-turn Test**: "SharePoint Data Access with Authorization"

**Child Test 1** (Order: 0, Non-Critical):
- **Test Type**: Attachments Match
- **Test Utterance**: "Show me Fourth Coffee brands from SharePoint"
- **Expected Attachments JSON**: *[Adaptive Card with "Allow" button]*
- **Operation Type**: Comparison Operator
- **Comparison Operator**: Contains

**Child Test 2** (Order: 1, Critical):
- **Test Type**: Attachments Match
- **Test Utterance**: *(empty - this invokes an action)*
- **Operation Type**: Invoke Actions
- **Adaptive Card Payload**: `{"action": "Allow", "id": "submit", "shouldAwaitUserInput": true}`
- **Expected Response**: *(data from SharePoint)*

**Result**:
- Child Test 1 captures the authorization prompt (non-critical)
- Child Test 2 clicks "Allow" and validates data is retrieved (critical)
- Pass if data is retrieved after authorization

**Complete Example**: See [Allow Connection Popup](../ALLOW_CONNECTION_POPUP.md)

#### Tips for Multi-turn Tests

- Use **Order** carefully - tests execute in exact order specified
- Mark data-gathering steps as **Non-Critical**
- Mark validation steps as **Critical**
- Tests requiring enrichment (Topic Match, Generative Answers) will be left as **Pending** until enrichment completes
- All child tests execute in the **same conversation context** (same conversation ID)

---

### 6. Plan Validation

**Purpose**: Validate that the dynamic plan of a custom agent with generative orchestration includes expected tools, actions, or connected agents.

#### When to Use Plan Validation

- Testing **generative orchestration** behavior
- Verifying the agent selects **appropriate tools** for a given utterance
- Ensuring **expected actions** are included in the execution plan
- Validating **dynamic tool selection**

#### How It Works

1. Send a test utterance to the agent
2. The agent creates a dynamic plan (with generative orchestration)
3. Wait for Dataverse enrichment to complete (~60 minutes)
4. Retrieve the dynamic plan from the conversation transcript
5. Compare actual tools in the plan with expected tools
6. Pass if the percentage of expected tools found ≥ pass threshold

#### Configuration Fields

| Field | Required | Description |
|-------|----------|-------------|
| **Test Type** | Yes | Select **Plan Validation** |
| **Test Utterance** | Yes | The message to send to the agent |
| **Expected Tools** | Yes | Comma-separated list of expected tool names (no extra whitespace) |
| **Pass Threshold %** | Yes | Percentage of expected tools that must be in the plan (0-100) |

#### Example

**Test Utterance**: "What's the weather and latest climate change research?"
**Expected Tools**: "Weather,Climate change research" *(comma-separated, no spaces)*
**Pass Threshold %**: 100

**Result**:
- **Pass**: If both "Weather" and "Climate change research" are in the dynamic plan (100% of expected tools found)
- **Fail**: If only one or neither tool is in the plan

#### Pass Threshold Explained

- **100%**: All expected tools must be in the plan
- **50%**: At least half of the expected tools must be in the plan
- **0%**: Any expected tools in the plan will pass (not recommended)

> **Note**: Additional tools beyond the expected list are ignored. The test only checks that expected tools are present.

#### Order and Naming

- **Order does not matter**: Tools can appear in any order in the plan
- **No extra whitespace**: Use "Tool1,Tool2,Tool3" not "Tool1, Tool2, Tool3"
- **Exact names**: Tool names must match exactly as they appear in Copilot Studio

#### Prerequisites

- **Dataverse Enrichment must be enabled** in the agent configuration
- Agent must have **generative orchestration** enabled
- Wait approximately **60 minutes** after test run completes for results

**Learn More**: [Generative Orchestration in Microsoft Learn](https://learn.microsoft.com/microsoft-copilot-studio/advanced-generative-actions)

---

## Test Case Common Configuration Fields

These fields are available for most test types:

| Field | Required | Description |
|-------|----------|-------------|
| **Name** | Yes | Descriptive name for the test (e.g., "TST-001", "Login Flow - Happy Path") |
| **Agent Test Set** | Yes | Parent test set (automatically set if creating from test set view) |
| **Test Type** | Yes | One of the six test types |
| **Test Utterance** | Yes | The message to send to the agent |
| **Expected Response** | Depends | Required for Response Match and Generative Answers |
| **Expected Topic Name** | Depends | Required for Topic Match |
| **Expected Attachments JSON** | Depends | Required for Attachments Match |
| **Expected Tools** | Depends | Required for Plan Validation |
| **Pass Threshold %** | Depends | Required for Plan Validation |
| **Expected Generative Answers Outcome** | Depends | Required for Generative Answers |
| **Comparison Operator** | Depends | Used for Response Match and Attachments Match (default: Equals) |
| **External Variables JSON** | No | JSON object of contextual variables to pass to the agent |
| **Send startConversation Event** | No | Enable if the agent's Conversation Start topic has required logic |
| **Expected Position of the Response Message** | No | Capture a specific message if agent sends multiple (0-based index) |
| **Seconds Before Getting Answer** | No | Wait time before evaluating response (for slow APIs) |

---

## Comparison Operators Reference

Comparison operators define how expected and actual values are compared. Available for **Response Match** and **Attachments Match** test types.

| Operator | Description | Use Cases |
|----------|-------------|-----------|
| **Equals** | Exact match (default) | Deterministic responses, structured output |
| **Does not equal** | Must not match exactly | Negative testing, ensure response varies |
| **Contains** | Expected text is substring of actual | Flexible matching, key phrases present |
| **Does not contain** | Expected text must not appear | Prohibited content, negative testing |
| **Begins with** | Actual starts with expected | Greeting messages, consistent openings |
| **Does not begin with** | Actual must not start with expected | Ensure responses don't start with specific text |
| **Ends with** | Actual ends with expected | Consistent closings, signatures |
| **Does not end with** | Actual must not end with expected | Ensure responses don't end with specific text |

### Detailed Examples

#### Equals

**Expected**: "Hello! How can I help you today?"
**Actual**: "Hello! How can I help you today?"
**Result**: Pass ✅

**Actual**: "Hello! How may I assist you?"
**Result**: Fail ❌

---

#### Contains

**Expected**: "30-day return policy"
**Actual**: "We offer a 30-day return policy on all products."
**Result**: Pass ✅

**Actual**: "Our return policy is generous."
**Result**: Fail ❌

---

#### Does not contain

**Expected**: "password"
**Actual**: "Please contact support for assistance."
**Result**: Pass ✅ (no "password" mentioned)

**Actual**: "Your password has been reset."
**Result**: Fail ❌ ("password" is present)

---

#### Begins with

**Expected**: "Hello"
**Actual**: "Hello! Welcome to our support."
**Result**: Pass ✅

**Actual**: "Welcome! Hello and thank you."
**Result**: Fail ❌

---

## Using Excel for Bulk Operations

The Copilot Studio Kit supports **Excel export and import** for bulk test creation and updates.

### When to Use Excel

- Creating **many similar test cases** with variations
- **Bulk editing** test case fields
- **Migrating tests** from spreadsheets or documentation
- **Sharing test cases** with stakeholders for review

### Steps to Export Tests

1. Open your **Test Set** record
2. Switch the subgrid view from **Tests** to **Export/Import View**
3. In the subgrid commands, select **Export Agent Tests in Excel Online**
4. Excel Online opens with all test cases from the test set

### Steps to Import Tests

1. In the Excel workbook, **add or modify** test cases
2. Click **Save** in Excel
3. Wait for the import to complete
4. Return to the test set to verify imported tests

### Important Notes

- **Multi-turn child tests**: Create the parent multi-turn test first, then import child tests
- **Required fields**: Ensure all required fields are populated
- **Data validation**: Excel enforces some field validations

**Learn More**: [Excel Import and Export in Power Apps](https://learn.microsoft.com/power-apps/user/import-data)

---

## Duplicating Tests and Test Sets

Duplication is useful for creating test variants or reusing existing tests in new scenarios.

### Duplicating a Test Set

1. Open the **Test Set** record
2. Click the **Duplicate Test Set** command
3. A new test set is created with all tests copied
4. Rename the new test set as needed

**Use Cases**:
- Creating environment-specific test sets (Dev, Test, Prod)
- Preserving a baseline test set while experimenting
- Creating priority-based variants (P0, P1, P2)

---

### Duplicating a Test Case

1. Open the **Test Case** record
2. Click the **Duplicate Test Case** command
3. A new test case is created with identical configuration
4. Modify the duplicated test as needed

**Use Cases**:
- Creating test variants (e.g., testing different locations, amounts, times)
- Building similar tests with slight variations
- Creating negative test cases from positive tests

---

## Organizing Test Sets

Well-organized test sets make test automation more maintainable and efficient.

### Organization Strategies

#### By Feature Area

Group tests by the features they validate:

- "User Authentication Tests"
- "Product Catalog Tests"
- "Order Management Tests"
- "Customer Support Tests"

**Pros**: Easy to find tests related to a specific feature
**Cons**: May duplicate setup/teardown logic

---

#### By Priority

Group tests by criticality:

- "P0 - Critical Smoke Tests"
- "P1 - High Priority Regression"
- "P2 - Full Regression Suite"

**Pros**: Run critical tests first; useful for staged testing
**Cons**: Tests may span multiple features

---

#### By Test Type

Group tests by validation approach:

- "Response Match Tests"
- "Generative Answers Quality Suite"
- "Multi-turn Scenario Tests"

**Pros**: Useful when testing enrichment features
**Cons**: Less intuitive for feature-based testing

---

#### By Environment

Group tests by target environment:

- "Production - Smoke Tests"
- "Staging - Full Suite"
- "Development - Experimental"

**Pros**: Clear separation of environment-specific tests
**Cons**: May need to maintain parallel test sets

---

### Recommended Approach

**Hybrid Organization**: Combine strategies based on your needs

- **Top-Level**: Priority (P0, P1, P2)
- **Second-Level**: Feature Area (within each priority)
- **Naming**: Include test type hints in test case names

**Example Test Set Structure**:
- "P0 - Authentication (Response Match + Topic Match)"
- "P0 - Generative Answers (Quality Gates)"
- "P1 - Product Catalog (Full Regression)"
- "P2 - Error Handling (Edge Cases)"

---

## Best Practices for Test Design

Follow these principles when creating test cases:

### 1. Make Tests Atomic

**Principle**: Each test should validate a single, specific behavior.

**Bad**: "Test login and product search and checkout"
**Good**: Three separate tests for login, search, and checkout

**Why**: Atomic tests are easier to debug when they fail.

---

### 2. Make Tests Independent

**Principle**: Tests should not depend on the execution order or state from other tests.

**Bad**: Test 2 assumes data created by Test 1
**Good**: Each test sets up its own required state

**Why**: Independent tests can run in parallel and are more reliable.

---

### 3. Use Descriptive Names

**Principle**: Test names should clearly describe what they validate.

**Bad**: "Test 1", "Agent Test"
**Good**: "Login - Valid Credentials - Returns Welcome", "FAQ - Return Policy - Contains 30 Days"

**Format**: `[Feature] - [Scenario] - [Expected Outcome]`

---

### 4. Use Representative Utterances

**Principle**: Test utterances should match how real users communicate.

**Bad**: "RETURN_POLICY_QUERY"
**Good**: "What is your return policy?", "Can I return this?"

**Why**: Tests should reflect actual user behavior and language.

---

### 5. Balance Exact and Flexible Matching

**Principle**: Use exact matching for deterministic responses; use flexible matching or AI validation for generative responses.

**Response Match**: Use **Equals** for scripted responses
**Generative Answers**: Use **Contains** or **AI validation** for AI-generated content

**Why**: Exact matching fails for non-deterministic AI; flexible matching provides robustness.

---

### 6. Test Both Positive and Negative Cases

**Principle**: Validate not only that correct inputs work, but also that incorrect inputs fail gracefully.

**Positive**: "Valid login credentials → Welcome message"
**Negative**: "Invalid password → Error message", "SQL injection attempt → Safe error"

**Why**: Negative testing ensures robustness and security.

---

### 7. Document Complex Tests

**Principle**: Use the **Name** field and comments to document complex test scenarios.

**Example**: For multi-turn tests, clearly document the scenario flow and expected behavior.

**Why**: Future maintainers (including yourself) will understand the test purpose.

---

**Previous**: [← Agent Configuration Setup](02-agent-configuration-setup.md) | **Next**: [Running and Enriching Tests →](04-running-and-enriching-tests.md)
