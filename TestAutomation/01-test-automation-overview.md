# Test Automation Overview

## Table of Contents

- [What is Test Automation in Copilot Studio Kit?](#what-is-test-automation-in-copilot-studio-kit)
- [The Problem It Solves](#the-problem-it-solves)
- [Key Benefits](#key-benefits)
- [Core Concepts](#core-concepts)
- [The Six Test Types](#the-six-test-types)
- [The Testing Workflow](#the-testing-workflow)
- [Enrichment Pipeline Overview](#enrichment-pipeline-overview)
- [Where Rubrics Fit In](#where-rubrics-fit-in)
- [Who Should Use Test Automation?](#who-should-use-test-automation)
- [What's Included in the Current Release](#whats-included-in-the-current-release)
- [Getting Started](#getting-started)

---

## What is Test Automation in Copilot Studio Kit?

The Power CAT Copilot Studio Kit is a comprehensive Power Platform application that empowers makers to automate the testing of Microsoft Copilot Studio agents. By running automated tests against the Copilot Studio Direct Line API, the Kit enables you to:

- **Validate agent behavior** across multiple test scenarios
- **Detect regressions** when agents are modified or redeployed
- **Ensure quality** before production deployment
- **Scale testing** beyond what's practical with manual testing

The Kit provides a user-friendly interface for configuring agent connections, creating test sets, running tests, and analyzing results—all from within a model-driven Power App.

---

## The Problem It Solves

Manual testing of conversational AI agents presents significant challenges:

### Manual Testing Limitations

- **Time-Consuming**: Testing even a small set of scenarios manually can take hours
- **Error-Prone**: Human testers may miss edge cases or inconsistencies
- **Not Repeatable**: Manual tests are hard to reproduce consistently
- **Doesn't Scale**: Testing across multiple environments or after every change is impractical

### Regression Risks

- **Silent Failures**: Changes to one part of an agent can break other scenarios
- **Environment Drift**: Agents behave differently across development, test, and production
- **Version Confusion**: Hard to know which agent version passed which tests

### AI Non-Determinism

- **Unpredictable Responses**: Generative AI doesn't always give the same answer twice
- **Hard to Validate**: Traditional exact-match testing fails for AI-generated content
- **Quality Variability**: AI responses may be acceptable but not identical to expected output

**Test Automation in Copilot Studio Kit solves these problems** by providing automated, repeatable, AI-aware testing capabilities.

---

## Key Benefits

### Automated Regression Testing

- Run the same test suite repeatedly after every agent change
- Catch breaking changes before they reach production
- Build confidence in continuous delivery workflows

### Multi-Environment Validation

- Test the same agent across development, test, and production environments
- Verify environment-specific configurations (authentication, data sources)
- Ensure consistent behavior regardless of deployment location

### AI-Powered Validation

- Use AI Builder to evaluate non-deterministic generative answers
- Compare responses semantically rather than requiring exact matches
- Apply custom rubrics for domain-specific quality standards

### CI/CD Integration

- Integrate test runs into Power Platform Pipelines
- Create quality gates that prevent deployment of failing agents
- Automate testing as part of your solution deployment workflow

### Rich Test Analytics

- Aggregate success rates, latency metrics, and failure counts
- Drill down into individual test results for detailed analysis
- Enrich results with data from Application Insights, Dataverse, and AI Builder

---

## Core Concepts

Understanding these core concepts will help you work effectively with test automation:

### Agent Configurations

An **Agent Configuration** is a connection profile that defines how to connect to a specific Copilot Studio agent for testing. It includes:

- Direct Line API connection details (region, token endpoint, secrets)
- Authentication settings (if the agent requires user sign-in)
- Enrichment options (Application Insights, Dataverse, AI Builder)

**Think of it as**: A saved connection profile for a specific agent.

### Test Sets

A **Test Set** is a collection of related test cases grouped together. Test sets help you organize tests by feature, priority, or scenario.

**Example**: "Login Flow Tests", "FAQ Tests", "Generative Answers Suite"

### Test Cases

A **Test Case** (also called "Agent Test") defines a single test scenario. Each test case specifies:

- The test utterance (what the user says)
- The expected response or behavior
- The test type (Response Match, Topic Match, etc.)
- Pass/fail criteria

**Example**: Send "What is your return policy?" and expect a response containing "30 days"

### Test Runs

A **Test Run** executes all test cases in a test set against a specific agent configuration. When you create a test run:

1. All tests in the test set are executed sequentially
2. Individual test results are created for each test
3. Enrichment steps run (if configured) to gather additional data
4. Aggregated metrics are calculated

**Think of it as**: Running a test suite against an agent.

### Test Results

A **Test Result** is the outcome of running a single test case as part of a test run. Results include:

- Pass/fail status
- Agent response text
- Latency metrics
- Enriched data (topics, intent scores, generative answer details)

### Enrichment Pipeline

The **Enrichment Pipeline** is a series of automated steps that gather additional data about test results after the initial test run completes:

1. **App Insights Enrichment** (~5 min delay): Retrieves generative answer details and telemetry
2. **Generated Answers Analysis** (requires App Insights): Uses AI Builder to evaluate generative responses
3. **Dataverse Enrichment** (~60 min delay): Retrieves conversation transcripts, topics, and intent scores

**Why enrichment?**: Some data isn't available immediately via Direct Line API and must be retrieved from other sources.

---

## The Six Test Types

The Copilot Studio Kit supports six distinct test types, each designed for specific validation scenarios:

### 1. Response Match

**Purpose**: Validate that the agent's text response matches expected text using comparison operators.

**Use Cases**:
- Testing deterministic responses (FAQs, greeting messages)
- Verifying specific phrases appear in responses
- Ensuring responses don't contain prohibited content

**Pass Criteria**: Response matches expected text based on the selected comparison operator (equals, contains, begins with, etc.)

---

### 2. Attachments Match

**Purpose**: Validate that the agent returns expected attachments (Adaptive Cards, files, images).

**Use Cases**:
- Testing Adaptive Card structure and content
- Verifying file attachments are returned
- Validating rich responses with buttons and actions

**Pass Criteria**: Attachment JSON matches expected JSON, or AI validation passes based on validation instructions.

---

### 3. Topic Match

**Purpose**: Verify that the expected Copilot Studio topic is triggered by the test utterance.

**Use Cases**:
- Testing intent recognition accuracy
- Validating topic routing logic
- Ensuring correct topics are triggered for multi-topic scenarios (generative orchestration)

**Pass Criteria**: The triggered topic name matches the expected topic name. For multi-topic matching, all expected topics must be present in the plan.

**Requirement**: Dataverse enrichment must be enabled.

---

### 4. Generative Answers

**Purpose**: Evaluate the quality of AI-generated responses using semantic comparison or custom rubrics.

**Use Cases**:
- Testing knowledge base responses
- Validating generative answers from Copilot Studio's generative capabilities
- Ensuring AI-generated content meets quality standards

**Pass Criteria**: AI Builder determines the response matches the sample answer, follows validation instructions, or meets rubric criteria.

**Requirement**: AI Builder enrichment must be enabled for response analysis; App Insights enrichment provides additional diagnostics.

---

### 5. Multi-turn Tests

**Purpose**: Test conversational flows that span multiple turns within the same conversation context.

**Use Cases**:
- Testing scenarios end-to-end (e.g., book appointment → confirm details → receive confirmation)
- Handling connection authorization popups
- Testing custom agents with generative orchestration
- Validating information-gathering workflows

**Pass Criteria**: All critical child tests must pass; non-critical child tests may fail without failing the entire multi-turn test.

**Special Feature**: Multi-turn tests consist of child test cases (of any regular type) executed in specified order within the same conversation.

---

### 6. Plan Validation

**Purpose**: Validate that the dynamic plan of a custom agent with generative orchestration includes expected tools, actions, or connected agents.

**Use Cases**:
- Testing generative orchestration behavior
- Verifying the agent selects appropriate tools for a given utterance
- Ensuring expected actions are included in the execution plan

**Pass Criteria**: The percentage of expected tools found in the dynamic plan meets or exceeds the pass threshold.

**Requirement**: Dataverse enrichment must be enabled.

---

## The Testing Workflow

The typical test automation workflow follows these steps:

### Step 1: Configure Agent Connection

Create an **Agent Configuration** with connection details for your Copilot Studio agent. Enable optional enrichment features based on your testing needs.

**See**: [Agent Configuration Setup](02-agent-configuration-setup.md)

---

### Step 2: Create Test Set and Test Cases

Create a **Test Set** and add individual **Test Cases**. Each test case specifies an utterance, expected behavior, and test type.

**See**: [Creating and Managing Tests](03-creating-and-managing-tests.md)

---

### Step 3: Run Tests

Create a **Test Run** by selecting a test set and agent configuration. The Kit executes all tests and creates individual test results.

**See**: [Running and Enriching Tests](04-running-and-enriching-tests.md)

---

### Step 4: Enrich Results (Optional)

If enrichment features are enabled, wait for enrichment steps to complete (~5 min for App Insights, ~60 min for Dataverse).

**See**: [Running and Enriching Tests](04-running-and-enriching-tests.md)

---

### Step 5: Analyze Results

Review aggregated metrics and detailed test results. Investigate failures and make adjustments to your agent or test cases.

**See**: [Running and Enriching Tests](04-running-and-enriching-tests.md)

---

### Step 6: Iterate

Update your agent, re-run tests, and verify improvements. Use test automation as part of your continuous improvement process.

**See**: [Best Practices and Workflows](05-best-practices-and-workflows.md)

---

## Enrichment Pipeline Overview

The enrichment pipeline gathers additional data about test results after the initial test execution completes. This data enhances test results with information not available through the Direct Line API alone.

### Stage 1: App Insights Enrichment

**When**: ~5 minutes after test run completes
**Provides**:
- Generative answer outcome (Answered, Moderated, No Search Results)
- Generative answer details and diagnostics
- Telemetry data from Application Insights

**Required For**: Generative Answers tests (diagnostics), AI Builder enrichment (prerequisite)

---

### Stage 2: Generated Answers Analysis

**When**: After App Insights enrichment completes
**Provides**:
- AI Builder evaluation of generative responses
- Grade (1-5) and rationale when using rubrics
- Pass/fail determination based on sample answer or validation instructions

**Required For**: Generative Answers tests (pass/fail determination)

**Cost**: 50 AI Builder credits per test

---

### Stage 3: Dataverse Enrichment

**When**: ~60 minutes after test run completes
**Provides**:
- Triggered topic name and ID
- Intent recognition scores
- Full conversation transcript JSON
- Citations used in generative answers

**Required For**: Topic Match tests, Plan Validation tests, transcript analysis

---

**Important**: Not all tests require enrichment. Response Match and Attachments Match tests can be evaluated immediately without enrichment steps.

**See**: [Agent Configuration Setup](02-agent-configuration-setup.md) for details on enabling enrichment.

---

## Where Rubrics Fit In

**Rubrics** are reusable evaluation standards for grading AI-generated responses. The Copilot Studio Kit includes a dedicated **Rubrics Refinement** feature for creating, testing, and iteratively improving rubrics.

### Using Rubrics in Test Automation

Rubrics can be used in two ways:

1. **Test Case Level (Testing Mode)**: Assign a rubric to individual Generative Answers test cases for regular quality assurance with custom grading criteria.

2. **Test Run Level (Refinement Mode)**: Assign a rubric to an entire test run to iteratively refine the rubric by comparing AI and human grading.

**See**: [Rubrics Refinement Documentation](../RubricRefinement/01-rubrics-refinement-overview.md) for complete details on creating and using rubrics.

---

## Who Should Use Test Automation?

Test automation in Copilot Studio Kit is ideal for:

- **Makers**: Building and iterating on Copilot Studio agents who need confidence that changes don't break existing functionality
- **Quality Assurance Teams**: Responsible for validating agent behavior before production deployment
- **DevOps Teams**: Integrating automated testing into CI/CD pipelines for continuous delivery
- **Enterprise Organizations**: Requiring repeatable, auditable testing for compliance and governance
- **Anyone with Regression Risk**: Teams that update agents frequently and need to catch breaking changes

---

## What's Included in the Current Release

The current release of test automation includes:

- **Six test types**: Response Match, Attachments Match, Topic Match, Generative Answers, Multi-turn, Plan Validation
- **Agent configuration management**: Support for multiple agent configurations with secrets management (Dataverse or Azure Key Vault)
- **User authentication**: Support for Entra ID v2 authenticated agents with SSO
- **Enrichment pipeline**: Three-stage enrichment with App Insights, AI Builder, and Dataverse
- **Rubric integration**: Use custom rubrics for Generative Answers evaluation
- **Excel bulk operations**: Export, edit, and import test cases in bulk
- **Multi-turn testing**: Test scenarios end-to-end within the same conversation context
- **CI/CD integration**: Power Platform Pipelines support with quality gates
- **Test duplication**: Easily duplicate test sets, test cases, and test runs
- **Rich analytics**: Aggregated metrics, detailed results, and conversation transcript visualization

---

## Getting Started

Ready to start using test automation? Follow these steps:

### Prerequisites

1. **Install the Copilot Studio Kit** in your Power Platform environment
2. **Create a Copilot Studio agent** to test
3. **Obtain Direct Line channel information** from your agent's channel configuration

**See**: [Installation Instructions](../INSTALLATION_INSTRUCTIONS.md)

---

### Next Steps

1. **Configure an agent connection**: [Agent Configuration Setup](02-agent-configuration-setup.md)
2. **Create your first test set**: [Creating and Managing Tests](03-creating-and-managing-tests.md)
3. **Run tests and analyze results**: [Running and Enriching Tests](04-running-and-enriching-tests.md)
4. **Explore best practices**: [Best Practices and Workflows](05-best-practices-and-workflows.md)
5. **Quick reference**: [Reference](06-reference.md)

---

**Next**: [Agent Configuration Setup →](02-agent-configuration-setup.md)
