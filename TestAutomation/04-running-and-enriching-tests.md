# Running and Enriching Tests

## Table of Contents

- [Overview](#overview)
- [Creating a Test Run](#creating-a-test-run)
- [Understanding Test Run Execution](#understanding-test-run-execution)
- [The Three-Stage Enrichment Pipeline](#the-three-stage-enrichment-pipeline)
- [Rubric Usage in Test Runs](#rubric-usage-in-test-runs)
- [Analyzing Test Run Results](#analyzing-test-run-results)
- [Inspecting Conversation Transcripts](#inspecting-conversation-transcripts)
- [Analyzing Multi-turn Test Results](#analyzing-multi-turn-test-results)
- [Duplicating Test Runs](#duplicating-test-runs)
- [Rerunning Specific Enrichment Steps](#rerunning-specific-enrichment-steps)
- [Understanding Pending Results](#understanding-pending-results)
- [Timing and Delays: Planning Your Testing](#timing-and-delays-planning-your-testing)

---

## Overview

A **Test Run** executes all test cases in a test set against a specific agent configuration. When you create a test run:

1. Individual tests are executed sequentially via the Direct Line API
2. **Test Results** are created for each test case
3. **Enrichment steps** run automatically (if configured) to gather additional data
4. **Aggregated metrics** are calculated and displayed

Test runs are the primary mechanism for executing automated tests and analyzing agent behavior.

---

## Creating a Test Run

### Steps to Create a Test Run

1. Open the **Power CAT Copilot Studio Kit** application
2. Navigate to **Test Runs** from the left navigation
3. Click **+ New** to create a new Agent Test Run record
4. Configure the test run:

| Field | Required | Description |
|-------|----------|-------------|
| **Name** | Yes | Descriptive name for the test run (e.g., "Production Smoke Test - 2025-02-15") |
| **Agent Test Set** | Yes | The test set to execute |
| **Agent Configuration** | Yes | The agent configuration to test against |
| **Rubric** (optional) | No | For rubric refinement mode (see below) |
| **Passing Grade** (optional) | No | Minimum grade for rubric-based tests (default: 5) |

5. Click **Save**

### What Happens Next

When you save a test run, execution begins automatically:

1. **Run Status** updates to **Running**
2. Cloud flow executes all tests in the test set
3. Individual **Test Result** records are created
4. **Run Status** updates to **Complete** when finished
5. Enrichment steps begin (if configured)

---

## Understanding Test Run Execution

### Test Run Status Progression

The **Run Status** field tracks the main test execution:

| Status | Description |
|--------|-------------|
| **Not Run** | Test run created but not yet executed |
| **Running** | Tests are currently executing |
| **Complete** | All tests have executed successfully |
| **Error** | An error occurred during execution (link to failed flow provided) |

### Execution Behavior

- **Sequential Execution**: Tests execute one at a time in the order they appear in the test set
- **Conversation Context**: Each test gets a new conversation (except multi-turn tests, which share context)
- **Error Handling**: If one test fails, execution continues with remaining tests
- **Result Creation**: A Test Result record is created for each test case

### After Execution Completes

When **Run Status** reaches **Complete**, enrichment steps may begin:

| Enrichment Status | Description |
|-------------------|-------------|
| **App Insights Enrichment Status** | Runs if enabled in agent configuration |
| **Generated Answers Analysis** | Runs after App Insights if enabled |
| **Dataverse Enrichment Status** | Runs if enabled in agent configuration |

Each enrichment status progresses: **Pending** → **Running** → **Complete**

---

## The Three-Stage Enrichment Pipeline

Enrichment gathers additional data about test results that isn't available through the Direct Line API alone.

### Stage 1: App Insights Enrichment

**Timing**: Begins ~5 minutes after test run completes

**Purpose**: Retrieve generative answer details and telemetry from Azure Application Insights

**What It Provides**:
- **Generative Answer Outcome**: Answered, Moderated, No Search Results
- **Generative Answer Details**: Why an answer was or wasn't generated
- **Agent Telemetry**: Performance metrics, diagnostics

**Required For**:
- Generative Answers test diagnostics
- Negative testing (Moderated, No Search Results outcomes)
- AI Builder analysis (prerequisite)

**Status Progression**:
1. **Pending**: Waiting for data to become available in App Insights (~5 min)
2. **Running**: Enrichment cloud flow is executing
3. **Complete**: All data retrieved and updated in test results

---

### Stage 2: Generated Answers Analysis

**Timing**: Runs immediately after App Insights enrichment completes

**Purpose**: Use AI Builder to evaluate generative responses

**What It Provides**:
- **AI-Powered Evaluation**: Semantic comparison with sample answers or validation instructions
- **Rubric Grading**: Grade (1-5) and rationale when using rubrics
- **Pass/Fail Determination**: Based on evaluation criteria

**Required For**:
- **Generative Answers** test type pass/fail results
- Rubric refinement (when rubric selected at test run level)

**Cost**: **50 AI Builder credits per Generative Answers test**

**Dependencies**:
- **App Insights Enrichment must complete first** (provides necessary data)
- AI Builder capacity must be available

**Status Progression**:
1. **Pending**: Waiting for App Insights enrichment to complete
2. **Running**: AI Builder analysis is executing
3. **Complete**: All generative answers tests evaluated

---

### Stage 3: Dataverse Enrichment

**Timing**: Begins ~60 minutes after test run completes

**Purpose**: Retrieve conversation transcript data from Dataverse

**What It Provides**:
- **Triggered Topic Name**: Exact topic that was triggered
- **Triggered Topic ID**: Unique identifier of the topic
- **Intent Recognition Score**: Confidence score for intent matching
- **Conversation Transcript**: Full conversation JSON (if Copy Full Transcript enabled)
- **Citations**: Sources used for generative answers
- **Dynamic Plan**: Tools selected by generative orchestration

**Required For**:
- **Topic Match** tests (provides topic name)
- **Plan Validation** tests (provides dynamic plan)
- Transcript analysis and debugging

**Dependencies**:
- Conversation transcript must be stored in Dataverse
- Microsoft Dataverse connection must have Read access to ConversationTranscript table

**Status Progression**:
1. **Pending**: Waiting for conversation transcript to become available (~60 min)
2. **Running**: Enrichment cloud flow is executing
3. **Complete**: All data retrieved and updated in test results

---

### Enrichment Dependencies Diagram

```
Test Run Completes
        ↓
   (wait ~5 min)
        ↓
┌─────────────────────────┐
│ App Insights Enrichment │
└─────────────────────────┘
        ↓
┌─────────────────────────────┐
│ Generated Answers Analysis  │  ← Requires App Insights
└─────────────────────────────┘

(wait ~60 min from test run completion)
        ↓
┌─────────────────────────┐
│ Dataverse Enrichment    │
└─────────────────────────┘
```

---

## Rubric Usage in Test Runs

Rubrics can be used in two distinct modes: **Testing Mode** (test case level) and **Refinement Mode** (test run level).

### Test Run Level Rubrics (Refinement Mode)

**When to Use**: When creating or refining a rubric through iterative improvement.

**How to Configure**:
1. Create or open a test run
2. In the **Rubric** field, select a rubric
3. Set the **Passing Grade** (default: 5)
   - This is **informational only** in refinement mode
   - The goal is alignment, not passing scores
4. Execute the test run

**What Happens**:
- Rubric applies to **all Generative Answer tests** in the test set
- Non-Generative Answer test types are **skipped**
- AI grading provides **grade + detailed rationale**
- Results view shows **rubric refinement interface** with human grading fields
- **More expensive**: Detailed rationales increase AI processing costs

**Purpose**: Minimize misalignment between AI and human grading by iteratively refining the rubric.

**See**: [Rubrics Refinement Documentation](../RubricRefinement/01-rubrics-refinement-overview.md)

---

### Test Case Level Rubrics (Testing Mode)

**When to Use**: When using a refined, trustworthy rubric for regular quality assurance.

**How to Configure**:
1. Open or create a test case with Test Type = Generative Answers
2. In the test case, select a **Rubric**
3. Set the **Passing Grade** (default: 5)
4. Run tests normally (no rubric selected at test run level)

**What Happens**:
- Rubric applies only to **that specific test case**
- AI grading provides **grade only** (no rationale) for cost efficiency
- Test passes if: AI grade ≥ passing grade
- Results view shows **standard test results**

**Purpose**: Automate quality checks with consistent, custom evaluation criteria.

---

### Rubric Decision Guide

| Question | Answer | Recommendation |
|----------|--------|----------------|
| Are you creating or refining a rubric? | Yes | Use **Test Run Level** (Refinement Mode) |
| Do you have a stable, well-aligned rubric? | Yes | Use **Test Case Level** (Testing Mode) |
| Do you need AI reasoning to understand grades? | Yes | Use **Test Run Level** (more expensive) |
| Are you running high-volume regression tests? | Yes | Use **Test Case Level** (cost-effective) |
| Do you want to compare AI and human assessment? | Yes | Use **Test Run Level** (Refinement Mode) |

---

## Analyzing Test Run Results

After a test run completes, analyze both aggregated metrics and detailed results.

### Aggregated Results

The test run record displays high-level metrics:

| Metric | Description |
|--------|-------------|
| **# Tests** | Total number of test results |
| **Success Rate (%)** | Percentage of tests that passed |
| **Average Latency (ms)** | Average response time from agent |
| **# Success** | Count of successful tests |
| **# Failed** | Count of failed tests |
| **# Pending** | Count of tests awaiting enrichment |
| **# Unknown** | Count of tests with unknown status |
| **# Error** | Count of tests that encountered errors |

**Use Aggregated Results For**:
- Quick health check (Is the agent working?)
- Regression detection (Did success rate drop?)
- Performance monitoring (Is latency increasing?)
- Quality gates (Is success rate above threshold?)

---

### Detailed Results View

The **Test Results** subgrid shows individual test outcomes:

**Standard Columns**:
- **Conversation ID**: Unique identifier for the conversation
- **Agent Test**: Name of the test case
- **Result**: Success, Failed, Unknown, Error, Pending
- **Result Reason**: Auto-generated explanation of the result
- **Latency (ms)**: Response time

**Specialized Views by Test Type**:
- **Generative Answers Results**: Shows AI assessment details, grades (if using rubrics)
- **Response Match Results**: Shows expected vs actual response
- **Topic Match Results**: Shows expected vs triggered topic
- **Attachment Results**: Shows attachment comparison results

**Switching Views**: Use the view selector dropdown to choose the appropriate specialized view.

---

### Individual Test Result Details

Click on a **Conversation ID** to open the detailed test result form:

#### General Tab

| Field | Description |
|-------|-------------|
| **Conversation ID** | Unique conversation identifier from Direct Line |
| **Agent Test Run** | Parent test run |
| **Agent Test** | Related test case (Quick View form shows test details) |
| **Result** | Success, Failed, Unknown, Error, Pending |
| **Result Reason** | Auto-generated or editable explanation |
| **Latency (ms)** | Time between message sent and response received |
| **Message Sent** | Timestamp when test utterance was sent |
| **Response Received** | Timestamp when agent responded |
| **Response** | Text message received from agent |

#### Enrichment Data

| Field | Provided By | Description |
|-------|-------------|-------------|
| **App Insights Result** | App Insights Enrichment | Generative answer outcome and details |
| **Triggered Topic ID** | Dataverse Enrichment | Unique identifier of triggered topic |
| **Triggered Topic / Event** | Dataverse Enrichment | Name of triggered topic (or "IntentCandidates" for multiple, "UnknownIntent" for fallback) |
| **Recognized Intent Score** | Dataverse Enrichment | Confidence score for intent recognition |
| **Conversation Transcript** | Dataverse Enrichment | Full conversation JSON (if Copy Full Transcript enabled) |
| **Suggested Actions** | Direct Line API | JSON of suggested actions |
| **Attachments** | Direct Line API | JSON of attachments array |
| **Citations** | Dataverse Enrichment | Citations used for generative answers |

#### Editing Results

The results view is **editable**:
- Update **Result** manually if needed
- Add notes to **Result Reason** for human review comments
- Useful for:
  - Marking false positives/negatives
  - Adding context for future reference
  - Tracking manual verification

---

## Inspecting Conversation Transcripts

When **Dataverse Enrichment** is enabled and **Copy Full Transcript** is set to Yes, full conversation transcripts are available for analysis.

### Viewing Transcripts

1. Open a **Test Result** record
2. Navigate to the **Transcript** tab
3. View:
   - **Left side**: Detailed JSON transcript
   - **Right side**: Easy-to-read visualization

### What Transcripts Contain

- All conversation turns (user and agent messages)
- Topic transitions
- Intent recognition details
- Variable values
- Dynamic plan (for generative orchestration)
- Internal agent state

### Use Cases for Transcript Analysis

- **Debugging**: Understanding why a topic was or wasn't triggered
- **Flow Analysis**: Seeing the exact path through your agent logic
- **Variable Inspection**: Checking variable values at each turn
- **Generative Orchestration**: Reviewing tool selection and execution

---

## Analyzing Multi-turn Test Results

Multi-turn tests have a hierarchical results structure.

### Multi-turn Results View

In the main test results view:
- Multi-turn tests appear alongside regular tests
- **Result** column shows overall pass/fail
- **Latency** shows total time for all child tests

### Multi-turn Detailed View

Click on a multi-turn test's **Conversation ID** to see:

1. **Parent Test Summary**: Overall result and metadata
2. **Child Tests Subgrid**: List of all child test results with:
   - Order (execution sequence)
   - Criticality (Critical or Non-Critical)
   - Individual results
   - Ability to drill down into each child test's details

### Multi-turn Pass/Fail Logic

- **Success**: All critical child tests passed
- **Failed**: Any critical child test failed (execution halts at first critical failure)
- **Pending**: One or more child tests awaiting enrichment

**Non-critical tests**:
- Allowed to fail without failing the multi-turn test
- Execution continues to next test even if non-critical test fails
- Useful for information-gathering steps

### Example

**Multi-turn Test**: "Connection Authorization Flow"

**Child Test 1** (Order: 0, Non-Critical, Result: Failed):
- Captures authorization prompt (expected to "fail" as it's just capturing the prompt)

**Child Test 2** (Order: 1, Critical, Result: Success):
- Clicks "Allow" button and validates data retrieval

**Overall Result**: **Success** (critical test passed, non-critical failure ignored)

---

## Duplicating Test Runs

Duplicating test runs allows you to quickly rerun the same test configuration.

### How to Duplicate

1. Open the **Test Run** record you want to duplicate
2. Click the **Duplicate Run** command
3. A new test run is created with:
   - Same test set
   - Same agent configuration
   - Same rubric settings (if any)
   - New name with timestamp or copy indicator

**Execution**: The duplicated test run starts automatically upon creation.

### When to Duplicate

- **Rerunning after changes**: Test the agent again after making updates
- **Different timing**: Run the same tests at a different time to compare results
- **Baseline comparison**: Create a baseline run, then duplicate and compare after changes
- **Regression testing**: Rerun the same suite regularly to catch regressions

**Tip**: Name duplicated runs with timestamps (e.g., "Production Tests - 2025-02-15 10:00") for easy tracking.

---

## Rerunning Specific Enrichment Steps

If an enrichment step fails or you need to reprocess results, you can rerun specific enrichment steps.

### Available Rerun Commands

- **Enrich with App Insights**: Rerun App Insights enrichment only
- **Analyze with AI Builder**: Rerun AI Builder analysis only
- **Enrich with Dataverse**: Rerun Dataverse enrichment only
- **Update Rollup Columns**: Recalculate aggregated metrics

### How to Rerun an Enrichment Step

1. Open the **Test Run** record
2. Click the **more commands** (...) button
3. Select the desired rerun command:
   - Enrich with App Insights
   - Analyze with AI Builder
   - Enrich with Dataverse
   - Update Rollup Columns
4. The selected step reruns for all applicable test results

### Important Notes

- **Rerun only processes test cases in Success or Pending status**
- Failed or Error test cases are skipped
- Rerunning does not re-execute the tests themselves (only enrichment)
- Useful for recovering from temporary issues (network errors, service outages)

### When to Rerun Enrichment

- **Temporary failures**: Network issues, service timeouts
- **Data not yet available**: Ran enrichment too early (before data was ready)
- **Configuration fixed**: Corrected App Insights or Dataverse configuration
- **Cost considerations**: Reran tests but don't want to re-consume AI Builder credits

---

## Understanding Pending Results

Some test results remain in **Pending** status until enrichment completes.

### Why Tests Stay Pending

| Test Type | Reason | Required Enrichment | Timing |
|-----------|--------|---------------------|--------|
| **Topic Match** | Topic name not available via Direct Line | Dataverse Enrichment | ~60 min |
| **Plan Validation** | Dynamic plan not available via Direct Line | Dataverse Enrichment | ~60 min |
| **Generative Answers** | AI evaluation required | AI Builder Analysis | ~5-10 min |

### What "Pending" Means

- **Not failed**: Pending is not a failure; it means evaluation is incomplete
- **Enrichment required**: The test is waiting for additional data
- **Automatic update**: Once enrichment completes, status updates automatically to Success or Failed

### Checking Pending Status

1. Check the **enrichment status** fields on the test run:
   - App Insights Enrichment Status
   - Generated Answers Analysis
   - Dataverse Enrichment Status
2. If status is **Pending**, wait for the appropriate delay
3. If status is **Complete** but tests still Pending, check for errors

### Troubleshooting Persistent Pending

If tests remain Pending after enrichment completes:

- **Topic Match**: Verify topic name was actually triggered (check transcript)
- **Plan Validation**: Verify generative orchestration is enabled
- **Generative Answers**: Check AI Builder capacity and App Insights configuration
- **All types**: Check enrichment error logs in Power Automate

---

## Timing and Delays: Planning Your Testing

Understanding enrichment timing helps you plan effective testing schedules.

### Immediate Results (No Enrichment)

**Test Types**: Response Match, Attachments Match (standard comparison)

**Timing**: Results available **immediately** after test run completes

**Best For**:
- Quick smoke tests
- Continuous integration pipelines
- Rapid feedback loops

---

### Short Delay (~5-10 minutes)

**Test Types**: Generative Answers

**Enrichment Required**:
1. App Insights Enrichment (~5 min)
2. AI Builder Analysis (runs immediately after)

**Timing**: Results available **~5-10 minutes** after test run completes

**Best For**:
- Quality assurance of generative responses
- Pre-deployment validation
- Regular regression testing

---

### Long Delay (~60 minutes)

**Test Types**: Topic Match, Plan Validation

**Enrichment Required**: Dataverse Enrichment (~60 min)

**Timing**: Results available **~60 minutes** after test run completes

**Best For**:
- Overnight regression suites
- Scheduled batch testing
- Weekly/monthly quality audits

---

### Planning Strategies

#### Strategy 1: Tiered Testing

1. **Tier 1** (Immediate): Run Response Match smoke tests for quick validation
2. **Tier 2** (~10 min): Run Generative Answers quality tests
3. **Tier 3** (~60 min): Run Topic Match and Plan Validation tests overnight

**Pros**: Fast feedback for critical tests, comprehensive coverage over time

---

#### Strategy 2: Scheduled Runs

Run comprehensive test suites on a schedule:
- **Daily**: Full suite runs overnight (accommodates 60-min delays)
- **Pre-deployment**: Smoke tests only (immediate results)
- **Weekly**: Extended regression with all test types

**Pros**: Predictable testing cadence, no waiting during work hours

---

#### Strategy 3: Separate Test Sets

Organize test sets by timing requirements:
- **Fast Tests** (Response Match, Attachments)
- **Medium Tests** (Generative Answers)
- **Slow Tests** (Topic Match, Plan Validation)

Run appropriate test set based on available time.

**Pros**: Flexible testing based on urgency and timing constraints

---

### Cost Optimization

**AI Builder Credits**: Generative Answers tests consume 50 credits each

**Strategies**:
- Use **test case level rubrics** (grade only, no rationale) for cost-effective regular testing
- Reserve **test run level rubrics** (grade + rationale) for refinement activities only
- Run expensive tests less frequently (e.g., weekly instead of daily)
- Use selective test sets for frequent runs

**See**: [Best Practices - Cost Optimization](05-best-practices-and-workflows.md#cost-optimization)

---

**Previous**: [← Creating and Managing Tests](03-creating-and-managing-tests.md) | **Next**: [Best Practices and Workflows →](05-best-practices-and-workflows.md)
