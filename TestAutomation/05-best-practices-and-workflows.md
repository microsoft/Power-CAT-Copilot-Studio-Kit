# Best Practices and Workflows

## Table of Contents

- [Test Design Best Practices](#test-design-best-practices)
- [Organizing Test Sets](#organizing-test-sets)
- [Test Maintenance Strategies](#test-maintenance-strategies)
- [Choosing the Right Test Type](#choosing-the-right-test-type)
- [Working with Multi-turn Tests](#working-with-multi-turn-tests)
- [Handling Non-Deterministic AI Responses](#handling-non-deterministic-ai-responses)
- [Authentication Testing](#authentication-testing)
- [Managing Enrichment Dependencies](#managing-enrichment-dependencies)
- [CI/CD Integration Workflows](#cicd-integration-workflows)
- [Cost Optimization](#cost-optimization)
- [Troubleshooting Common Issues](#troubleshooting-common-issues)
- [Advanced Scenarios](#advanced-scenarios)
- [Integrating with RubricRefinement Workflow](#integrating-with-rubricrefinement-workflow)

---

## Test Design Best Practices

Follow these principles when designing test cases:

### 1. Make Tests Atomic

**Principle**: Each test should validate a single, specific behavior.

**Why**: Atomic tests are easier to debug when they fail. If a test validates multiple behaviors, you won't know which part failed without additional investigation.

**Good Example**:
- Test 1: "User provides valid credentials → Login succeeds"
- Test 2: "User provides invalid credentials → Login fails with error"
- Test 3: "Logged-in user accesses dashboard → Dashboard loads"

**Bad Example**:
- Test 1: "User logs in, accesses dashboard, views profile, and logs out"

---

### 2. Make Tests Independent

**Principle**: Tests should not depend on execution order or state from other tests.

**Why**: Independent tests can run in parallel, be reordered, or run individually without breaking.

**Good Example**:
- Each test sets up its own required state
- Tests clean up after themselves (if applicable)
- Tests don't share conversation context (except multi-turn)

**Bad Example**:
- Test 2 assumes data created by Test 1
- Test 3 expects conversation state from Test 2

---

### 3. Use Descriptive Names

**Principle**: Test names should clearly describe what they validate and expected outcome.

**Format**: `[Feature] - [Scenario] - [Expected Outcome]`

**Good Examples**:
- "Login - Valid Credentials - Returns Welcome Message"
- "FAQ - Return Policy - Contains 30 Days"
- "Product Search - Empty Query - Returns Error"

**Bad Examples**:
- "Test 1"
- "Agent Test"
- "TST-001" (without additional description)

---

### 4. Use Representative Utterances

**Principle**: Test utterances should match how real users communicate.

**Why**: Tests should reflect actual user behavior and language patterns.

**Good Examples**:
- "What is your return policy?"
- "How do I reset my password?"
- "Can I get a refund?"

**Bad Examples**:
- "RETURN_POLICY_QUERY"
- "RESET_PASSWORD"
- "Refund procedure information request"

---

### 5. Balance Exact and Flexible Matching

**Principle**: Use exact matching for deterministic responses; use flexible matching or AI validation for generative responses.

**Response Match Tests**: Use **Equals** for scripted, deterministic responses
**Generative Answers Tests**: Use **Contains** or **AI validation** for non-deterministic responses

**Why**: Exact matching fails when AI generates semantically correct but textually different responses.

---

### 6. Test Both Positive and Negative Cases

**Principle**: Validate not only that correct inputs work, but also that incorrect inputs fail gracefully.

**Positive Tests**:
- Valid inputs produce expected outputs
- Happy path scenarios work correctly

**Negative Tests**:
- Invalid inputs produce appropriate errors
- Edge cases are handled gracefully
- Security inputs (SQL injection, XSS) are safely rejected

---

### 7. Document Complex Tests

**Principle**: Use clear names and add comments in the Result Reason field for complex scenarios.

**When to Document**:
- Multi-turn tests with complex flows
- Tests with special timing requirements
- Tests that depend on external state
- Tests with non-obvious expected behavior

---

## Organizing Test Sets

Effective test set organization makes test automation more maintainable and efficient.

### Organization Strategy 1: By Feature Area

Group tests by the features they validate:

**Example Test Sets**:
- "User Authentication"
- "Product Catalog"
- "Order Management"
- "Customer Support - FAQs"

**Pros**: Easy to find tests related to a specific feature
**Cons**: May duplicate setup/teardown logic across test sets
**Best For**: Feature teams responsible for specific areas

---

### Organization Strategy 2: By Priority

Group tests by criticality:

**Example Test Sets**:
- "P0 - Critical Smoke Tests" (must pass before any deployment)
- "P1 - High Priority Regression" (run before releases)
- "P2 - Full Regression Suite" (run weekly)
- "P3 - Edge Cases" (run monthly)

**Pros**: Run critical tests first; useful for staged testing
**Cons**: Tests may span multiple features, harder to maintain
**Best For**: Quality gates in deployment pipelines

---

### Organization Strategy 3: By Test Type

Group tests by validation approach:

**Example Test Sets**:
- "Response Match - Scripted Responses"
- "Generative Answers - Quality Gates"
- "Topic Match - Intent Recognition"
- "Multi-turn - End-to-End Scenarios"

**Pros**: Useful when testing specific enrichment features
**Cons**: Less intuitive for feature-based work
**Best For**: Testing specific capabilities or enrichment configurations

---

### Organization Strategy 4: By Environment

Group tests by target environment:

**Example Test Sets**:
- "Production - Smoke Tests"
- "Staging - Full Regression"
- "Development - Experimental Tests"

**Pros**: Clear separation of environment-specific tests
**Cons**: May need to maintain parallel test sets
**Best For**: Multi-environment deployment scenarios

---

### Recommended Hybrid Approach

Combine multiple strategies:

**Level 1**: Priority (P0, P1, P2)
**Level 2**: Feature Area within priority
**Naming**: Include test type hints

**Example Structure**:
- "P0 - Authentication (Response + Topic)"
- "P0 - Generative Answers (Quality Gates)"
- "P1 - Product Catalog (Full Regression)"
- "P2 - Edge Cases (Multi-turn)"

---

## Test Maintenance Strategies

### Regular Review

**Frequency**: Monthly or after significant agent changes

**Review Activities**:
- Remove obsolete tests (for deprecated features)
- Update expected responses (for intentional changes)
- Add tests for new features
- Consolidate duplicate tests

---

### Version Control for Test Configurations

**Strategy**: Export test sets to Excel and store in version control

**Benefits**:
- Track changes to test configurations over time
- Restore previous test versions if needed
- Share test definitions with team via Git

**How**:
1. Export test set to Excel
2. Save Excel file to Git repository
3. Document changes in commit messages
4. Import from Excel to restore or deploy to new environment

---

### Handling Expected Changes

**When agent responses change intentionally**:

1. **Review failed tests**: Not all failures are regressions
2. **Update expected values**: If new behavior is correct, update test expectations
3. **Document why**: Add notes in Result Reason explaining why expectations changed
4. **Baseline rerun**: Create new baseline test run after updates

---

## Choosing the Right Test Type

Use this decision tree to select the appropriate test type:

### Decision Tree

**Question 1**: Are you testing a multi-step conversation flow?
- **Yes** → Use **Multi-turn**
- **No** → Continue

**Question 2**: Are you testing an AI-generated response?
- **Yes** → Use **Generative Answers**
- **No** → Continue

**Question 3**: Are you testing which topic is triggered?
- **Yes** → Use **Topic Match**
- **No** → Continue

**Question 4**: Are you testing tool selection in generative orchestration?
- **Yes** → Use **Plan Validation**
- **No** → Continue

**Question 5**: Are you testing attachments (Adaptive Cards, files)?
- **Yes** → Use **Attachments Match**
- **No** → Continue

**Question 6**: Are you testing a text response?
- **Yes** → Use **Response Match**

---

### Test Type Selection Guide

| Scenario | Test Type | Why |
|----------|-----------|-----|
| Testing FAQ responses | Response Match | Deterministic, scripted responses |
| Testing generative knowledge base | Generative Answers | Non-deterministic, AI-generated |
| Verifying correct topic triggers | Topic Match | Intent recognition validation |
| Testing Adaptive Card structure | Attachments Match | Rich response validation |
| Testing end-to-end booking flow | Multi-turn | Multi-step conversation |
| Validating tool selection | Plan Validation | Generative orchestration testing |

---

## Working with Multi-turn Tests

### When to Use Multi-turn Tests

Multi-turn tests are powerful but more complex. Use them when:

- **Sequential context matters**: The agent needs information from previous turns
- **End-to-end scenarios**: Testing complete workflows (e.g., book → confirm → complete)
- **Connection authorization**: Handling OAuth or connection popups
- **Generative orchestration**: Testing tool selection across multiple turns
- **Error recovery**: Validating how agent handles corrections

### Designing Criticality

**Critical Tests**: Must pass for the scenario to succeed
- Final validation steps
- Key decision points
- Expected final outcomes

**Non-Critical Tests**: Used to feed information or set context
- Information-gathering turns
- Intermediate steps where exact response doesn't matter
- Context-building for critical tests

### Example: Appointment Booking

**Turn 1** (Non-Critical): "I want to book an appointment"
- Response: "What service do you need?"
- Criticality: Non-critical (just gathering info)

**Turn 2** (Non-Critical): "Haircut"
- Response: "What date works for you?"
- Criticality: Non-critical (still gathering info)

**Turn 3** (Critical): "Next Monday at 10 AM"
- Response: "Your appointment is confirmed for Monday at 10 AM"
- Criticality: **Critical** (validates booking succeeds)

---

### Trade-offs of Multi-turn Tests

**Pros**:
- Test realistic conversational flows
- Validate context handling
- Test end-to-end scenarios

**Cons**:
- More complex to maintain
- Harder to debug when they fail
- Longer execution time
- All child tests must be in same test set

**Best Practice**: Use multi-turn tests sparingly for critical scenarios; prefer independent tests for most cases.

---

## Handling Non-Deterministic AI Responses

AI-generated responses are inherently variable. Here's how to test them effectively:

### Strategy 1: Use Validation Instructions

Instead of exact expected response, describe what makes a good response:

**Validation Instructions**: "The response should mention a 30-day return window, explain how to initiate a return, and include a link to the returns portal."

**Why**: Focuses on key content rather than exact wording.

---

### Strategy 2: Use Rubrics for Quality Standards

Define a rubric with quality criteria, then use it across multiple tests:

**Rubric**: "Customer Service Response Quality"
- Criterion 1: Response is polite and professional
- Criterion 2: Response fully addresses the question
- Criterion 3: Response includes actionable next steps

**Why**: Consistent, reusable evaluation criteria.

---

### Strategy 3: Focus on Semantic Content, Not Phrasing

Use **Contains** instead of **Equals** for key phrases:

**Expected**: "30 days"
**Comparison**: Contains

**Why**: Allows for natural language variation while ensuring key information is present.

---

### Strategy 4: Test Negative Cases

For generative answers, test not only what should be answered, but also what shouldn't:

- **Expected Outcome**: Not Answered (for out-of-scope questions)
- **Expected Outcome**: Moderated (for inappropriate content)
- **Expected Outcome**: No Search Results (for topics not in knowledge base)

---

## Authentication Testing

### Testing Authenticated Agents

When your agent requires user authentication:

1. **Configure authentication** in the agent configuration (see [Agent Configuration Setup](02-agent-configuration-setup.md#configuring-user-authentication))
2. **Create agent configuration with authentication enabled**
3. **Test as usual** - the Kit handles authentication automatically

**Important**: The authenticated user is the one whose credentials are stored in the agent configuration, not individual test users.

---

### Testing Connection Authorization

Some agents require connection authorization (e.g., SharePoint, Dataverse):

**Challenge**: Agent presents an authorization popup before accessing data.

**Solution**: Use multi-turn tests to handle authorization flow.

**Complete Guide**: See [Allow Connection Popup](../ALLOW_CONNECTION_POPUP.md) for step-by-step example.

---

### SSO and Token Management

**Token Handling**: The Kit manages tokens automatically:
- Obtains tokens via Direct Line
- Refreshes tokens as needed
- Handles authentication challenges

**Best Practice**: Use separate agent configurations for authenticated and non-authenticated testing to avoid token-related issues.

---

## Managing Enrichment Dependencies

### Understanding the Pipeline

**Key Insight**: Enrichment stages have dependencies and timing constraints.

**App Insights → AI Builder**: AI Builder analysis requires App Insights data
**Dataverse**: Independent, but has longest delay (~60 min)

### Planning Test Execution

**Same-Day Results**: Run tests requiring Dataverse enrichment in the morning; results ready by afternoon.

**Overnight Testing**: Schedule comprehensive test suites overnight to accommodate all delays.

**Immediate Feedback**: Use Response Match tests for quick validation without enrichment.

---

### Rerunning Enrichment

If enrichment fails or needs to be reprocessed:

1. Fix the configuration issue (e.g., App Insights permissions)
2. Use **Rerun** commands to process enrichment without re-executing tests
3. Saves time and AI Builder credits

**See**: [Rerunning Specific Enrichment Steps](04-running-and-enriching-tests.md#rerunning-specific-enrichment-steps)

---

### Cost Considerations

**AI Builder Credits**: 50 credits per Generative Answers test

**Strategies**:
- Enable AI Builder enrichment only when needed
- Use rubrics at test case level (grade only) for cost savings
- Reserve test run level rubrics (grade + rationale) for refinement
- Test selectively rather than running all tests every time

---

## CI/CD Integration Workflows

### Overview

The Copilot Studio Kit integrates with **Power Platform Pipelines** to enable automated testing and deployment with quality gates.

**Goal**: Ensure only agents that pass required tests are deployed to production.

---

### What It Allows

- **Automated Validation**: Automatically run tests before deployment
- **Quality Gates**: Block deployment if tests don't pass
- **Continuous Delivery**: Integrate testing into deployment lifecycle
- **Governed Deployment**: Reduce manual steps and errors

---

### High-Level Steps

1. **Configure Power Platform Pipeline**: Link development and production environments
2. **Add Pre-Deployment Step**: Configure pipeline to run tests before deployment
3. **Create Test Run**: Triggered automatically when deployment requested
4. **Evaluate Results**: Pipeline checks if required percentage of tests pass
5. **Proceed or Block**: Deployment continues (if tests pass) or stops (if tests fail)

---

### Requirements

- **Pipeline Host Environment**: Central control point for deployments
- **Development Environment**: Where agent is developed and tested
- **Target Environment**: Production environment for deployment
- **Copilot Studio Kit**: Installed in host or development environment

---

### Detailed Documentation

For complete setup instructions and configuration details, see:

**PDF Guide**: [Automated Testing and Deployment Overview](https://github.com/user-attachments/files/21301068/Automated.Testing.and.Deployment.of.Copilot.Studio.Agents.Overview.pdf)

**Source File**: [AUTOMATED_TESTING.md](../AUTOMATED_TESTING.md)

---

### Best Practices for CI/CD Testing

1. **Use P0 smoke tests for quality gates**: Only critical tests should block deployment
2. **Set realistic pass thresholds**: 100% pass rate may be too strict; 95% might be appropriate
3. **Run comprehensive tests post-deployment**: Full regression after deployment completes
4. **Monitor test results over time**: Track pass rates to detect degradation
5. **Separate test sets by purpose**: Smoke tests vs. full regression

---

## Cost Optimization

### Understanding Costs

**AI Builder Credits**: Primary cost driver for test automation

- **Generative Answers tests**: 50 credits per test
- **Rubric refinement (test run level)**: 50 credits + additional for rationale generation
- **Rubric testing (test case level)**: 50 credits (no rationale)

**Other Costs**:
- Power Automate runs (included in most licenses)
- Dataverse storage (for test results)

---

### Optimization Strategies

#### Strategy 1: Use Test Case Level Rubrics

**Cost**: Grade only (50 credits)
**Savings**: No rationale generation (reduces processing costs)

**When**: Regular quality assurance with stable rubrics

---

#### Strategy 2: Selective Enrichment

**Enable enrichment only when needed**:
- Response Match tests: No enrichment required
- Attachments Match: No enrichment (unless using AI validation)
- Generative Answers: Enable only AI Builder (skip App Insights if diagnostics not needed)

**Savings**: Reduces AI Builder analysis runs

---

#### Strategy 3: Selective Test Execution

**Don't run all tests every time**:
- P0 tests: Daily or per deployment
- P1 tests: Weekly
- P2 tests: Monthly

**Savings**: Reduces total AI Builder credit consumption

---

#### Strategy 4: Balance Coverage and Cost

**Not every test needs AI validation**:
- Use Response Match with **Contains** for key phrases
- Reserve Generative Answers for critical quality scenarios
- Use rubrics only where custom evaluation criteria are essential

---

### Cost Estimation

**Example Test Suite**:
- 50 Response Match tests: 0 credits
- 20 Generative Answers tests: 20 × 50 = 1,000 credits
- 10 Topic Match tests: 0 credits (Dataverse only)

**Daily Run**: 1,000 credits/day
**Monthly**: ~30,000 credits/month

**Optimization**: Reduce Generative Answers tests to 10 → 500 credits/day, 15,000 credits/month (50% savings)

---

## Troubleshooting Common Issues

### Issue 1: Tests Stuck in Pending Status

**Symptoms**: Tests remain Pending even after enrichment completes

**Possible Causes**:
- Enrichment not configured
- Enrichment failed silently
- Required data not available

**Solutions**:
1. Check enrichment status fields on test run
2. Verify enrichment configuration in agent configuration
3. Check Power Automate flow run history for errors
4. For Topic Match: Verify topic was actually triggered (check transcript)
5. For Generative Answers: Verify AI Builder capacity is available

---

### Issue 2: Authentication Failures

**Symptoms**: Tests fail with authentication errors

**Possible Causes**:
- Incorrect Client ID, Tenant ID, or Scope
- Client Secret expired
- Applications not properly linked in Azure Portal

**Solutions**:
1. Verify all authentication fields in agent configuration
2. Check Client Secret expiration in Azure Portal
3. Ensure KitAuthApp is authorized client in CopilotStudioAuthApp
4. See detailed troubleshooting: [Enable Authentication](../ENABLE-AUTHENTICATION.md)

---

### Issue 3: Test Timeouts

**Symptoms**: Tests fail with timeout errors

**Possible Causes**:
- Agent takes too long to respond
- Network issues
- Agent is processing heavy workloads

**Solutions**:
1. Increase **Seconds Before Getting Answer** in test case configuration
2. Check agent performance in Copilot Studio
3. Verify network connectivity to Direct Line endpoints
4. Consider offloading heavy processing to async operations

---

### Issue 4: Topic Match Failures

**Symptoms**: Topic Match tests fail even though topic seems correct

**Possible Causes**:
- Topic name mismatch (case-sensitive, extra spaces)
- Multiple topics matched (returns "IntentCandidates")
- Fallback triggered (returns "UnknownIntent")

**Solutions**:
1. Check exact topic name in Dataverse enrichment results
2. Verify expected topic name matches exactly (case, spacing)
3. For multi-topic: Ensure comma-separated with no extra whitespace
4. Review conversation transcript to see actual topic triggered

---

### Issue 5: False Negatives in Generative Answers

**Symptoms**: AI Builder marks good responses as failed

**Possible Causes**:
- Validation instructions too strict or ambiguous
- Sample answer not representative
- Rubric criteria not well-defined

**Solutions**:
1. Refine validation instructions to be more flexible
2. Use multiple sample answers or better validation instructions
3. Use Rubrics Refinement to align AI grading with human judgment
4. See: [Rubrics Refinement Workflow](../RubricRefinement/04-rubric-refinement-workflow.md)

---

## Advanced Scenarios

### Multi-Environment Testing

**Scenario**: Test the same agent across Dev, Test, and Prod environments

**Approach**:
1. Create separate agent configurations for each environment
2. Use the same test set across all configurations
3. Create test runs for each configuration
4. Compare results to detect environment-specific issues

**Benefits**: Ensures consistent behavior across environments

---

### Regression Testing

**Scenario**: Detect when agent changes break existing functionality

**Approach**:
1. Create baseline test run with current agent version
2. After agent updates, rerun the same test set
3. Compare new results with baseline
4. Investigate any regressions (tests that passed before, fail now)

**Tool**: Use Duplicate Run to rerun same configuration easily

---

### Load Testing

**Scenario**: Test agent performance under load

**Approach**:
1. Create multiple test runs simultaneously
2. Monitor average latency metrics
3. Identify performance degradation

**Limitation**: The Kit is not designed for high-volume load testing; use specialized tools for serious load testing

---

### Multi-Language Testing

**Scenario**: Test agent responses in multiple languages

**Approach**:
1. Create test sets for each language
2. Use **External Variables JSON** to pass language context:
   ```json
   { "Language": "fr" }
   ```
3. Set expected responses in target language
4. Use Generative Answers with validation instructions in target language

---

## Integrating with RubricRefinement Workflow

The Copilot Studio Kit includes a dedicated **Rubrics Refinement** feature for creating and improving reusable evaluation standards.

### Typical Workflow

**Phase 1: Rubric Refinement**
1. Create initial rubric defining quality standards
2. Assign rubric at **test run level** (refinement mode)
3. Execute test run with AI grading + detailed rationale
4. Provide human grades for comparison
5. Analyze misalignment
6. Refine rubric based on insights
7. Repeat until alignment is acceptable

**Phase 2: Regular Testing**
1. Assign refined rubric at **test case level** (testing mode)
2. Use in ongoing test automation
3. AI grading without rationale (cost-effective)
4. Pass/fail based on passing grade

### When to Use Rubrics in Test Automation

**Use Rubrics When**:
- Standard validation instructions aren't sufficient
- You need domain-specific quality standards
- You want consistent, reusable evaluation criteria
- You're testing critical communications (IR reports, customer-facing content)

**Don't Use Rubrics When**:
- Simple validation instructions work fine
- Cost is a major concern (rubrics consume more credits)
- Responses are deterministic (use Response Match instead)

### Complete Rubrics Documentation

**See**: [Rubrics Refinement Overview](../RubricRefinement/01-rubrics-refinement-overview.md)

---

**Previous**: [← Running and Enriching Tests](04-running-and-enriching-tests.md) | **Next**: [Reference →](06-reference.md)
