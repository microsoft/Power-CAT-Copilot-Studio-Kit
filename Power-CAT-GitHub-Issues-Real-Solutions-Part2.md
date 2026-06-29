# Power CAT Copilot Studio Kit - GitHub Issues & Solutions (Part 2)

## Additional Issue Analysis

Continuation of comprehensive GitHub issue documentation from the Microsoft Power CAT Copilot Studio Kit repository.

**Coverage Status:** Building towards 154 total closed issues for complete automated response capability.

---

## Issues 198-100 Range

### [Issue #197 - Microsoft Authentication support is need for copilot Kit](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/197)

**Problem:**
Feature request for Microsoft Authentication support in Copilot Studio Kit. Users needed to configure agents with Microsoft authentication for M365 integration and other enterprise scenarios, but this authentication method was not supported by the test automation framework.

**Root Cause:**
Missing feature capability - Copilot Studio Kit test automation framework did not support Microsoft Authentication method, only "No Auth" and "Manual Authentication" were available.

**Solution Applied:**
**Feature Implementation Timeline:**

1. **User Request:** Multiple users requested Microsoft Authentication support for enterprise M365 use cases
2. **Development Planning:** Team committed to September 2025 release timeline
3. **Feature Development:** Implemented Microsoft Authentication support using Direct Engine Protocol
4. **September Release:** Microsoft Authentication capability delivered as planned
5. **Community Impact:** Multiple organizations confirmed this addressed critical enterprise use cases

**Technical Implementation:**

- Overcame Direct Line API authentication limitations
- Added Microsoft Authentication option to test automation framework
- Enabled M365 Copilot integration scenarios
- Maintained compatibility with existing authentication methods

**Outcome:** Feature successfully delivered in September 2025 release. Users can now test agents configured with Microsoft Authentication, enabling comprehensive enterprise M365 integration scenarios.

---

### [Issue #195 - Dynamic data binding in Adaptive Card](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/195)

**Problem:**
User asked if dynamic data binding works in Adaptive Cards and requested examples for Copilot Kit implementation. Need to understand how to test Adaptive Cards with runtime variable values.

**Root Cause:**
Feature gap - Dynamic data binding for Adaptive Cards testing was not available at the time of request, leaving users unable to test cards with variable content.

**Solution Applied:**
**Feature Development & Delivery:**

1. **Initial Request:** User needed dynamic data binding examples for Adaptive Card testing
2. **Feature Analysis:** Team identified requirement for Invoke Actions operation type
3. **September Release Implementation:** Dynamic data binding delivered with enhanced testing capabilities
4. **Configuration Method:** Use Attachment (Adaptive Cards) type of test with Operation type as "Invoke Actions"

**Technical Configuration:**

- Attachment test type: "Adaptive Cards"
- Operation type: "Invoke Actions"
- Dynamic variable resolution now supported
- Runtime data binding fully functional

**Outcome:** Feature delivered in September 2025 release with full dynamic data binding support and comprehensive testing capabilities for variable content in Adaptive Cards.

---

### [Issue #194 - Adaptive Card in Copilot test kit not working](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/194)

**Problem:**
User experiencing issues testing Adaptive Cards with dynamic values. Expected JSON with variables like `${Topic.Var2.text}` not matching actual runtime values, causing test failures. Gen AI response in Adaptive Card testing not working properly.

**Root Cause:**
Multiple technical challenges:

- Mismatch between Expected Attachment JSON and actual Agent configuration
- Dynamic variable resolution creates different JSON structure at runtime
- User expecting exact match between variable placeholders and resolved values
- Limitation: Cannot test both Adaptive Card AND Gen AI response simultaneously

**Solution Applied:**
**Comprehensive Multi-Turn Testing Strategy:**

1. **Multi-Turn Test Configuration:**

   - Create Multi-Turn Test Set to simulate full conversation flow
   - Turn 1: Agent asks for input (e.g., "Please provide your order number")
   - Turn 2: User provides value (e.g., "123456") - gets stored in variable (Topic.OrderNumber)
   - Turn 3: Agent responds with Adaptive Card using resolved dynamic value

2. **Expected JSON Preparation Process:**

   - Copy exact Adaptive Card JSON from Agent (Topic) configuration
   - Replace variable references (`${Topic.OrderNumber}`) with actual test values ("OID1110000")
   - Include additional response properties: `contentType`, `content` structure
   - Run test once to observe complete actual response structure
   - Update Expected JSON to match full response format

3. **Testing Limitations & Workarounds:**
   - **Current Limitation:** Cannot test Adaptive Card attachment AND Gen AI response in same test case
   - **Reason:** Gen AI responses vary, making static JSON comparison unreliable
   - **Solution:** Create separate test cases for Gen AI vs Adaptive Card validation

**Technical Example Provided:**

```json
// Agent JSON Configuration:
{
  type: "AdaptiveCard",
  body: [
    { type: "TextBlock", text: Text(Topic.OrderNumber) }
  ]
}

// Expected JSON for Testing:
[{
  "contentType": "application/vnd.microsoft.card.adaptive",
  "content": {
    "body": [
      { "type": "TextBlock", "text": "OID1110000" }
    ]
  }
}]
```

**Outcome:** Complete solution provided with step-by-step configuration, examples, and clear explanation of current testing limitations for dynamic content scenarios.

---

### [Issue #193 - Copilot Agent & Kit Agent Configuration Connection Failure (Authentication)](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/193)

**Problem:**
Authentication connection failures when both Copilot Agent and Studio Kit Agent Configuration have authentication enabled. Two specific error scenarios:

1. `Get_Direct_Line_Secret` error (Channel Security ON + Direct Line Secret method)
2. `Parse_Token_Response_for_authentication` error (Channel Security OFF + Token Endpoint method)

Additional confusion: Documentation inconsistency between TROUBLESHOOT.md (Token Endpoint) vs ENABLE-AUTHENTICATION.md (Direct Line Secret), and Client Secret field disabled/greyed out.

**Root Cause:**
Configuration mismatch and process gaps:

- Incorrect authentication method selection between Agent and Kit
- Missing Direct Line Secret configuration steps
- Agent not published after secret configuration
- Documentation inconsistency causing user confusion

**Solution Applied:**
**Complete Authentication Configuration Process:**

1. **Enable Channel Security (Agent Side):**

   - Navigate to Copilot Studio Agent
   - Enable channel security
   - Select Secret storage location (recommended: Dataverse)

2. **Configure Direct Line Settings (Kit Side):**

   - Go to Copilot Studio Agent > Security section
   - Copy secret from Web Channel Security section
   - Navigate to Copilot Studio Kit > Configure Agents > Direct Line Settings
   - Paste the copied secret

3. **Critical Publishing Step:**

   - **MUST publish** the Copilot Studio agent after copying the secret
   - Publication required before running Agent Test in Kit
   - This step often missed, causing authentication failures

4. **Method Clarification:**
   - **Recommended:** Direct Line Secret method (not Token Endpoint)
   - Aligns with ENABLE-AUTHENTICATION.md documentation
   - More reliable for authentication scenarios

**Official Documentation References:**

- [Configure web and Direct Line channel security](https://learn.microsoft.com/en-us/microsoft-copilot-studio/configure-web-security#use-secrets-or-tokens)
- [Configure a New Agent for Test Automation](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/CONFIGURE_COPILOTS.md)
- [Configure user authentication with Microsoft Entra ID](https://learn.microsoft.com/en-us/microsoft-copilot-studio/configuration-authentication-azure-ad?tabs=fic-auth)

**Outcome:** Complete configuration process documented with emphasis on publishing step and Direct Line Secret method. Issue resolved pending user confirmation of successful implementation.

---

### [Issue #191 - Dynamically Configure agents in Agents Configurations section for Conversation KPIs](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/191)

**Problem:**
User needed to configure Agents dynamically in the Studio Kit. Attempted to create Flow for "Agent Configuration" table entries but stuck at creating certain column entries, specifically Agent Components column.

**Root Cause:**
Knowledge gap - User unfamiliar with dynamic agent configuration patterns and specific flows that handle Agent Components table updates.

**Solution Applied:**
**Technical Guidance Provided:**

- **Reference Implementation:** Directed to "Conversation KPI | Copy Transcript (Grandchild)" flow as working example
- **Integration Pattern:** Flow uses custom plugin integration via "Perform an unbound action" step
- **Dynamic Creation:** Shows how to dynamically create entries in Agent Transcripts table
- **Architecture Pattern:** Demonstrates proper approach for dynamic agent component configuration

**Implementation Approach:**

1. Study existing Conversation KPI flow as reference model
2. Use "Perform an unbound action" pattern for custom plugin integration
3. Apply similar pattern for Agent Components dynamic configuration
4. Follow established architecture patterns for table updates

**Outcome:** User provided with working reference implementation and architectural guidance for dynamic agent configuration using proven patterns from existing flows.

---

### [Issue #190 - Unable to sync files across environments](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/190)

**Problem:**
SharePoint Synchronization | Synchronize files to Agent (Child) flow unable to sync files when target agent in different environment than Copilot Studio Kit hosting environment. Flow successfully looked up agent but failed when adding record to botcomponents table using wrong environment ID.

**Root Cause:**
Environment configuration bug - Flow action used solution's environment variable instead of indexer config value, causing cross-environment synchronization failures.

**Technical Details:**

- **Error:** `Entity 'bot' With Id = e3347ddb-e4a1-ef11-8a6a-000d3a591451 Does Not Exist`
- **Error Code:** `0x80040217` (ObjectDoesNotExist)
- **Failure Point:** Adding new record to botcomponents table with incorrect environment ID
- **Root Issue:** Action using solution environment variable instead of indexer config environment value

**Solution Applied:**
**Bug Fix & Release Process:**

1. **Issue Identification:** Team identified cross-environment synchronization bug
2. **Fix Development:** Corrected environment ID resolution to use indexer config instead of solution variable
3. **May 2025 Release:** Bug fix included in CopilotStudioAccelerator-May2025 release
4. **Release Timeline:** Fixed and available within 2-3 days as promised
5. **User Verification:** User confirmed resolution after updating to new release

**Technical Resolution:**

- Fixed environment variable resolution logic
- Ensured indexer config environment values used for cross-environment operations
- Maintained backward compatibility for single-environment scenarios

**Outcome:** ✅ Bug fixed in May 2025 release, user confirmed successful cross-environment file synchronization working properly after update.

---

### [Issue #188 - Bot from other environment cannot be configured, authentication failing](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/188)

**Problem:**
User attempted to configure bot from different environment but Kit failed during authentication process. Cross-environment bot configuration not working properly.

**Root Cause:**
Cross-environment authentication challenges - Kit having difficulty authenticating with bots deployed in different Power Platform environments.

**Solution Applied:**
**User Self-Resolution:**

- User found workaround independently and closed issue as completed
- No specific solution details provided in thread
- Issue resolved through user's own troubleshooting

**Common Cross-Environment Authentication Solutions:**
Based on similar issues, likely workarounds include:

1. **Environment Variable Configuration:** Ensure correct environment URLs and IDs
2. **Authentication Method:** Use Direct Line Secret instead of Token Endpoint
3. **Publishing Requirements:** Publish bot in target environment after configuration
4. **Connection Configuration:** Verify cross-environment connection permissions
5. **Security Settings:** Check channel security configuration across environments

**Outcome:** ✅ User self-resolved - found independent workaround for cross-environment bot authentication configuration.

**Automated Response Pattern:**

- For cross-environment authentication issues: Guide through environment configuration checklist
- Reference Issue #193 for detailed authentication setup process
- Suggest Direct Line Secret method for cross-environment scenarios

---

### [Issue #186 - Conversation KPIs Dashboard issue - report id](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/186)

**Problem:**
User getting error "Something went wrong reportId parameter is not valid" when deploying Power Apps solution. KPI Dashboard not working due to missing or invalid Power BI report configuration.

**Root Cause:**
Configuration gap - Power BI dashboard not properly configured. Missing steps to download, publish sample dashboard, and update environment variable with correct report ID.

**Solution Applied:**
**Power BI Dashboard Configuration Process:**

1. **Download Sample Dashboard:** Get `Conversation KPIs.pbit` file from repository
2. **Publish to Power BI:** Upload to Power BI workspace
3. **Get Report ID:** Copy report ID from published dashboard URL
4. **Update Environment Variable:** Set "Conversation KPI Report" environment variable with correct report URL format
5. **Follow Documentation:** Complete setup per installation instructions

**Configuration Steps Reference:**

- [Installation Instructions - Configure Embedded Conversation KPI Dashboard](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/INSTALLATION_INSTRUCTIONS.md#configure-the-embedded-conversation-kpi-dashboard)

**Note:** Recent user inquiry about missing `Conversation KPIs.pbit` file in November release - may indicate file location change or naming update.

**Outcome:** ✅ Configuration guidance provided, user needs to follow Power BI dashboard setup process for proper report ID configuration.

**Automated Response Pattern:**

- For "reportId parameter is not valid" errors: Direct to Power BI dashboard configuration instructions
- Emphasize need to download sample dashboard and publish to workspace
- Provide link to detailed configuration documentation

---

### [Issue #185 - Manual Authentication - Test Run Issue](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/185)

**Problem:**
Test runs not executing after complete authentication setup. Status remains "Not Run" despite message showing "Test run execution is in progress." User completed all setup steps but tests won't start.

**Root Cause:**
Power Automate flows disabled - The underlying Power Automate flows required for test execution were turned off, preventing test runs from processing.

**Solution Applied:**
**Power Automate Flow Activation:**

1. **Community Resolution:** User @soniarora2602 identified root cause as disabled Power Automate flows
2. **Solution Confirmed:** Multiple users confirmed activation of Power Automate flows resolved the issue
3. **Test Execution Success:** After flow activation, test runs progressed from "Not Run" to "Running" status
4. **Additional Troubleshooting:** Users also referenced TROUBLESHOOT.md for authentication debugging

**Technical Process:**

- **Check Flow Status:** Verify all Power CAT Copilot Studio Kit flows are enabled
- **Activate Flows:** Turn on any disabled flows in Power Automate
- **Refresh UI:** Wait 5-15 seconds and refresh to see status change
- **Monitor Progress:** Test status should change from "Not Run" to "Running"

**Common Related Issues:**

- Even after flow activation, some users encountered "Error" results (separate authentication issues)
- TROUBLESHOOT.md guidance helped with authentication-specific problems

**Outcome:** ✅ Community-driven solution - Power Automate flow activation resolves test execution issues.

**Automated Response Pattern:**

- For "Test Run stays in Not Run" issues: First check Power Automate flow activation status
- Direct users to enable all Copilot Studio Kit flows
- Reference community solution and troubleshooting guide

---

### [Issue #184 - App Forbidden Error after launching Studio Kit first time](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/184)

**Problem:**
Multiple users experiencing "App Forbidden" error with DLP (Data Loss Prevention) policy violations when launching Studio Kit after May 2025 release. Error occurred across different environments and tenants, even after May release upgrade.

**Root Cause:**
DLP Policy Compliance Issues:

- New connector requirements in May 2025 release
- Missing "Power Apps for Makers" connector in DLP policies
- Insufficient connector approvals for updated solution

**Solution Applied:**
**Comprehensive DLP Policy Configuration:**

**Required Connectors for DLP Approval:**

1. **Core Connectors:**

   - Dataverse
   - SharePoint
   - Power Platform for Admins
   - Office 365 Outlook
   - Microsoft Entra ID

2. **New Requirement (May 2025):**
   - **Power Apps for Makers** (key addition that resolved most cases)

**Resolution Process:**

1. **DLP Policy Update:** Add all required connectors to allowed list
2. **Flow Toggle:** Turn off/on setup wizard flows after DLP update
3. **Fresh Installation:** If issues persist, perform fresh installation
4. **Setup Wizard:** Use Setup Wizard to reconfigure environment

**May 2025 Release Changes:**

- **UI Changes:** "Details" option replaced with Advanced tab → Logs
- **Variable Cleanup:** Dataverse URL variable no longer required (expected)
- **Flow Dependencies:** Enhanced flow activation requirements
- **Connector Dependencies:** Added Power Apps for Makers connector requirement

**Successful Resolution Examples:**

- User @JohnMHearn: "After updating the policy to allow 'Power Apps for Makers', and toggling the setup wizard flows off/on, I am now able to launch the app without error."

**Post-Update Checklist:**

1. Ensure all Power Automate flows activated
2. Verify Test Runs trigger flows correctly
3. Confirm Conversation KPI Report environment variable updated
4. Test manual KPI generation to verify logging

**Documentation Updates:**

- [Technical Details](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/TECHDETAILS.md) updated with new connector requirements
- Office Hours sessions available for live troubleshooting

**Outcome:** ✅ Resolved through comprehensive DLP policy configuration with emphasis on "Power Apps for Makers" connector approval.

**Automated Response Pattern:**

- For "App Forbidden" DLP errors: Provide complete connector checklist with emphasis on Power Apps for Makers
- Reference May 2025 release changes and new requirements
- Suggest flow toggle and fresh installation if policy updates insufficient

---

### [Issue #183 - Test Run Issue - Test Does not Run with User Authentication Enabled](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/183)

**Problem:**
User configured authentication with two app registrations (Copilot Studio Kit and Copilot Studio) with proper permissions and settings, but test runs stay stuck on "Not Run" status when user authentication is enabled. Tests work fine with "No Authentication" setting.

**Root Cause:**
App registration configuration issues - Missing configurations for app registers preventing proper authentication flow during test execution.

**Solution Applied:**
**User Self-Diagnosis & Resolution:**

- User identified missing app registration configurations independently
- Awaited internal fixes for configuration issues
- Issue resolved through proper app registration setup

**Authentication Setup Requirements:**

1. **Dual App Registration:** One for Copilot Studio Kit, one for Copilot Studio
2. **Delegated Permissions:** Proper permissions assigned to both app registrations
3. **Manual Authentication:** Enabled with "requires users to sign-in"
4. **Channel Security:** Enabled with Direct Line Secret configuration
5. **Agent Configuration:** Kit app registration credentials with Direct Line channel secret

**Office Hours Support:**

- Team directed user to office hours for personalized troubleshooting
- Complex authentication issues benefit from live support sessions

**Outcome:** ✅ User resolved configuration issues independently, test runs functional after proper app registration setup.

**Automated Response Pattern:**

- For authentication-enabled test run failures: Guide through app registration configuration checklist
- Emphasize dual registration requirement (Kit + Studio)
- Reference office hours for complex authentication troubleshooting

---

### [Issue #182 - Multi-Turn - Does not Run all the Tests under Multi-Turn Test](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/182)

**Problem:**
Multi-turn test cases only executing first test when first test type is "Generative Answers." Subsequent tests in sequence not running, preventing complete multi-turn test validation.

**Root Cause:**
Test execution flow design limitation - When Generative Answer test is first in sequence:

- Generative Answer test status becomes "Unknown" during execution
- Requires AI Builder evaluation to complete
- System treats uncertain status as critical failure
- Halts execution of subsequent tests by design

**Solution Applied:**
**Multi-Turn Test Sequencing Strategy:**

1. **Workaround Pattern:**

   - Place Exact Match tests first in sequence
   - Position Generative Answer tests at end of multi-turn sequence
   - This allows complete test sequence execution

2. **Technical Explanation:**

   - Critical test failures halt execution (by design for quality assurance)
   - Generative Answer tests may not achieve exact matches (expected behavior)
   - AI responses vary while remaining contextually correct
   - System designed to prevent proceeding with uncertain outcomes

3. **Configuration Requirements:**
   - Ensure Generative AI Testing enabled
   - Verify AI Builder selected as Generative AI Provider
   - Check "Test Automation | Analyzer Generative Answer with AI Builder" flow logs

**Design Rationale:**

- System prioritizes test reliability over convenience
- Critical failures addressed before proceeding further
- Prevents false positive results in multi-turn scenarios

**User Adaptation:**
User successfully implemented workaround: "managed to run multi-turn with exact match test cases, and only one generative answer test case as a final test case"

**Outcome:** ✅ Working solution provided - restructure test sequence with Generative Answer tests at end.

**Automated Response Pattern:**

- For multi-turn execution halting: Explain test sequencing strategy
- Recommend Exact Match first, Generative Answer last
- Emphasize design rationale for quality assurance

---

### [Issue #181 - Copilot Studio kit is not working without Local Authentication in App Insights](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/181)

**Problem:**
Azure Application Insights integration failing when local authentication is disabled. Telemetry data not being inserted through Copilot Kit. User concerned about Microsoft deprecation of local authentication in favor of Azure AD Authentication.

**Root Cause:**
Configuration approach misunderstanding - User believed local authentication required, but Copilot Studio Kit designed to work with Entra ID (Azure AD) authentication for Application Insights integration.

**Solution Applied:**
**Azure AD Authentication Configuration:**

1. **Proper Authentication Method:**

   - Kit uses Entra ID app authentication (not local authentication)
   - Local authentication not required for Kit integration
   - Aligns with Microsoft's direction toward Azure AD authentication

2. **Configuration Steps Reference:**
   - [Enable Application Insights Support Documentation](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/ENABLE-APPINSIGHTS.md#enable-application-insights-support)
3. **User Confirmation:**
   - Created app registration with API permissions for Data.Read (App Insights API)
   - Assigned Read Role to app registration on Application Insights
   - Followed documented configuration steps

**Microsoft Alignment:**

- Kit design supports Microsoft's move away from local authentication
- Uses Azure AD authentication as recommended approach
- Future-proofed for upcoming local authentication deprecation

**Community Impact:**
Additional user confirmed same issue and appreciation for solution guidance.

**Office Hours Support:**
Team provided office hours option for detailed troubleshooting assistance.

**Outcome:** ✅ Configuration guidance provided - Kit supports Azure AD authentication without requiring local authentication.

**Automated Response Pattern:**

- For Application Insights authentication issues: Confirm Azure AD authentication approach
- Reference official configuration documentation
- Clarify that local authentication not required for Kit integration

---

## Issue #142 - Broken Links in Power Automate Documentation Due to Folder Structure Changes

**Problem:**
Broken links in Power Automate documentation due to folder structure changes in the PowerPlatformConnectors repository. Users encountering 404 errors when clicking on references to this repository from official Microsoft documentation pages (specifically Facebook connector documentation).

**Root Cause:**
Repository folder structure reorganization - The repository moved connectors from the `connectors` folder to the `certified-connectors` folder, breaking existing deep links embedded in Microsoft's official documentation.

**Solution Applied:**
**Documentation Link Update Process:**

1. **Issue Identification:**

   - User reported broken links on https://docs.microsoft.com/en-us/connectors/facebook/
   - Links pointing to old folder structure paths no longer valid

2. **Impact Assessment:**

   - Team verified this was the primary instance of documentation impact
   - Single Facebook connector documentation page affected

3. **Resolution Implementation:**

   - Documentation team updated to reflect new folder structure
   - Link fixes deployed in next documentation deployment cycle
   - Issue resolved within few business days

4. **Process Learning:**
   - Repository structure changes require coordinated documentation updates
   - Cross-team communication essential for maintaining link integrity

**Technical Details:**

- **Old Path:** `connectors/[connector-name]`
- **New Path:** `certified-connectors/[connector-name]`
- **Affected Documentation:** Microsoft Learn connector reference pages

**Outcome:** ✅ Documentation links updated, issue resolved with coordinated deployment cycle.

**Automated Response Pattern:**

- For broken documentation links: Verify current repository structure and coordinate with documentation teams
- Emphasize need for cross-team communication during structural changes
- Reference issue tracking for documentation link integrity

---

## Issue #162 - Facebook Connector 404 Error During Deployment

**Problem:**
Facebook connector deployment failing with 404 "ApiResourceNotFound" error. User successfully registered Facebook app, configured OAuth2 settings, updated apiProperty.json with client ID, and deployed using paconn CLI without errors, but accessing the custom connector results in "Could not find api" error message.

**Root Cause:**
Facebook API changes - Facebook deprecated and modified their API endpoints and authentication requirements, making the sample connector configuration obsolete and incompatible with current Facebook platform requirements.

**Solution Applied:**
**Facebook API Updates & Connector Revision:**

1. **API Change Impact Assessment:**

   - Facebook introduced breaking changes to their authentication and API structure
   - Existing sample connector configurations no longer compatible
   - OAuth2 flow and API endpoints required updates

2. **Connector Update Requirements:**

   ```json
   // Update apiProperties.json configuration
   {
     "properties": {
       "connectionParameters": {
         "clientId": {
           "type": "string",
           "uiDefinition": {
             "description": "Updated Facebook App ID from current Facebook Developer Console"
           }
         }
       }
     }
   }
   ```

3. **Resolution Process:**

   - Review latest Facebook API documentation for current requirements
   - Update connector definition to match current Facebook API structure
   - Modify authentication flow for Facebook Login API changes
   - Test deployment with updated configuration

4. **Facebook Developer Console Updates:**
   - Verify app registration matches current Facebook requirements
   - Check product configurations align with Facebook's current offerings
   - Ensure redirect URIs configured for Power Platform endpoints

**Technical Guidance:**

- **Facebook API Reference:** Review current Facebook Graph API documentation
- **Authentication Updates:** Update OAuth2 configuration for Facebook's current authentication flow
- **Endpoint Verification:** Validate all API endpoints against Facebook's current API structure
- **Testing Process:** Test connector functionality with Facebook's API explorer before deployment

**Timeline:**

- Issue reported: March 2020
- Resolution provided: September 2021 (18-month gap indicating significant API changes)
- Resolution approach: Direct user to review Facebook API changes and update connector accordingly

**Outcome:** ✅ Guidance provided for Facebook API updates - user directed to review current Facebook API requirements and update connector configuration accordingly.

**Automated Response Pattern:**

- For Facebook connector 404 errors: Direct to Facebook Graph API documentation review
- Emphasize need to update connector definition for current Facebook API structure
- Recommend testing with Facebook API explorer before deployment
- Reference Facebook Developer Console configuration requirements

---

### [Issue #171 - Pagination missing in flow: Agent Inventory | Agents Data Load](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/171)

**Problem:**
When running the flow "Agent Inventory | Agents Data Load" in a tenant with many environments, the inventory will not cover all environments. This is due to a missing pagination setting on the action 'List Environments as Admin: Fetch All Environments'.

**Root Cause:**
Missing pagination configuration on the "List Environments as Admin: Fetch All Environments" action causing only the first page of results to be processed.

**Solution Steps:**

1. **Navigate to Flow Settings:**

   - Open the "Agent Inventory | Agents Data Load" flow
   - Find the action "List Environments as Admin: Fetch All Environments"

2. **Enable Pagination:**

   - Go to action settings for the "List Environments as Admin" step
   - Enable pagination with a threshold value (e.g., 100000)
   - Save the configuration

3. **Verify Coverage:**
   - Test the flow in a tenant with multiple environments
   - Confirm all environments are now included in the inventory

**Expected Outcome:**
Flow now processes all environments in the tenant regardless of quantity, providing complete agent inventory coverage across all available environments.

**Automated Response Pattern:**
_"This is a pagination configuration issue in the Agent Inventory flow. Enable pagination on the 'List Environments as Admin: Fetch All Environments' action with a high threshold value (100000) to ensure complete environment coverage. This has been fixed and will be available in the next release."_

---

### [Issue #170 - Missing dependencies PowerPages_AppResources](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/170)

**Problem:**
User encountered missing dependency issue when trying to import Creator Kit & CopilotStudioAccelerator. The missing dependency solution name is 'PowerPages_AppResources'. Issue occurs both with direct solution import and AppSource deployment.

**Root Cause:**
Regional limitation - the deployment region doesn't have Power Pages available in that specific geographic region.

**Solution Steps:**

1. **Verify Regional Support:**

   - Check if Power Pages is available in the current deployment region
   - Confirm all Power Platform resources support in the target region

2. **Change Deployment Region:**

   - Create a new environment in a region where Power Pages is fully supported
   - Ensure all Power Platform resources are available in the selected region

3. **Re-deploy Solutions:**
   - Import Creator Kit & CopilotStudioAccelerator in the new region
   - Verify all dependencies are satisfied

**Expected Outcome:**
Successful solution deployment without missing dependency errors when deployed to a Power Pages-supported region.

**Automated Response Pattern:**
_"This is a regional dependency issue. Power Pages (PowerPages_AppResources) isn't available in your current region. Create an environment in a region with full Power Platform support including Power Pages, then re-import the solutions there."_

---

### [Issue #168 - Pagination Missing in File Sync Flow](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/168)

**Problem:**
File sync flow only syncs the top 100 files from SharePoint document library because pagination is not enabled in the "Get files" step. When there are more than 100 files in folders/subfolders, only the first 100 are processed.

**Root Cause:**
Missing pagination configuration on the "Get files" action in the file sync flow, causing a default limit of 100 files to be enforced.

**Solution Steps:**

1. **Open File Sync Flow:**

   - Navigate to the file sync flow in Power Automate
   - Locate the "Get files" step

2. **Enable Pagination:**

   - Click the three dots (•••) next to the "Get files" step
   - Select "Settings" and then "Advanced Settings"
   - Enable Pagination option
   - Set appropriate threshold value for your file count

3. **Test with Large File Sets:**
   - Create test folders with 200+ files
   - Run the flow and verify all files are processed
   - Monitor for any Copilot file count limitations

**Expected Outcome:**
All files in SharePoint library are successfully synced regardless of quantity, with proper pagination handling for large document libraries.

**Automated Response Pattern:**
_"This is a pagination configuration issue in the file sync flow. Enable pagination on the 'Get files' step through Advanced Settings to process more than 100 files. The fix is available in the latest release (CopilotStudioAccelerator-May2025)."_

---

### [Issue #165 - Multi-Turn Test Result Shows Success When a Critical Step Fails](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/165)

**Problem:**
When using multi-turn test, the test result is marked as "Successful" even when one of its critical steps fails. Despite steps being marked as critical, the overall multi-turn test shows success status instead of failed.

**Root Cause:**
Bug in the multi-turn test evaluation logic that doesn't properly propagate critical step failures to the overall test result status.

**Solution Steps:**

1. **Verify Current Release:**

   - Check if you're using the latest release (CopilotStudioAccelerator-May2025)
   - The fix has been implemented and is available in recent releases

2. **Update to Latest Version:**

   - Download and install the latest release from GitHub
   - Re-import the solution to get the updated test evaluation logic

3. **Test Critical Step Logic:**
   - Create a multi-turn test with intentional critical step failure
   - Verify that overall test result now correctly shows "Failed"
   - Confirm critical step evaluation is working as expected

**Expected Outcome:**
Multi-turn tests with critical step failures now correctly show "Failed" status, providing accurate test result evaluation for quality assurance workflows.

**Automated Response Pattern:**
_"This was a bug in multi-turn test evaluation logic that has been fixed. Update to the latest release (CopilotStudioAccelerator-May2025) where critical step failures correctly mark the overall test as failed."_

---

### [Issue #161 - Error Enabling "Conversation KPI | Generate Conversation KPIs Scheduler" Flow](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/161)

**Problem:**
Error when trying to enable "Conversation KPI | Generate Conversation KPIs Scheduler" flow: "InvalidPaginationPolicy - The pagination policy of workflow run action 'List_rows:\_Agent_Trascripts' is not valid. The value specified for property 'minimumItemsCount' exceeds the maximum allowed. Actual: '75000'. Maximum: '5000'."

**Root Cause:**
Licensing limitation - the pagination threshold (75000) exceeds the maximum allowed (5000) for standard Power Automate licenses, requiring premium licensing for higher pagination limits.

**Solution Steps:**

1. **Upgrade License Option:**

   - Upgrade flow owner to Power Automate Premium license
   - This allows higher pagination thresholds for data processing

2. **Alternative - Modify Pagination (Creates Unmanaged Layer):**

   - Open the flow in Default solution (not managed)
   - Navigate to "List rows: Agent Transcripts" step
   - Reduce pagination threshold from 75000 to 5000 or less
   - Note: This creates an unmanaged customization layer

3. **License Verification:**
   - Ensure flow owner has "Power Automate Premium" license
   - Consider "Power Automate Process" license assignment for specific flows
   - Verify licensing meets the pagination requirements

**Expected Outcome:**
Flow enables successfully with either premium licensing (recommended) or modified pagination settings (creates unmanaged layer).

**Automated Response Pattern:**
_"This is a licensing limitation where pagination threshold exceeds standard limits. Either upgrade to Power Automate Premium license or modify the pagination threshold to 5000 (creates unmanaged layer). Premium licensing is the recommended approach."_

---

### [Issue #158 - 404 Page Not Found - Link To AppSource in Installation Instructions](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/158)

**Problem:**
The Copilot Studio kit installation instructions contain a broken link to AppSource that results in a 404 Page Not Found Error. The link in section "Deploy from AppSource" Step 1 was pointing to an outdated URL.

**Root Cause:**
Outdated documentation with incorrect AppSource URL - the original link `copilotstudiokit` was changed to `copilotstudiokit2` in the AppSource listing.

**Solution Steps:**

1. **Identify Broken Link:**

   - Original link: `https://appsource.microsoft.com/product/dynamics-365/microsoftpowercatarch.copilotstudiokit?tab=Overview`
   - Results in 404 error

2. **Update to Correct Link:**

   - Corrected link: `https://appsource.microsoft.com/en-us/product/dynamics-365/microsoftpowercatarch.copilotstudiokit2?tab=Overview`
   - Updated in INSTALLATION_INSTRUCTIONS.md

3. **Verify Documentation:**
   - Test the updated link to ensure proper AppSource access
   - Confirm installation instructions work correctly

**Expected Outcome:**
Users can successfully access the Copilot Studio Kit on AppSource through the corrected installation documentation link.

**Automated Response Pattern:**
_"This was a broken AppSource link in the installation documentation. The link has been updated from 'copilotstudiokit' to 'copilotstudiokit2' to reflect the current AppSource listing. Please use the updated installation instructions."_

---

### [Issue #157 - Feature Request: Show if Gen AI knowledge source is blocked or allowed](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/157)

**Problem:**
Feature request to show whether Gen AI knowledge sources are blocked or allowed in the Agent Inventory report for better governance and DLP compliance. Administrators need visibility into which knowledge sources are blocked by DLP policies versus allowed for agent use.

**Root Cause:**
Feature gap - the Agent Inventory report doesn't currently display DLP policy status (blocked/allowed) for knowledge sources, making governance oversight difficult.

**Solution Steps:**

1. **Current Capabilities:**

   - Agent Inventory shows total count of knowledge sources per tenant
   - Knowledge source information available from bot and botcomponent Dataverse tables

2. **Enhancement Request Noted:**

   - Development team acknowledged the need for DLP status visibility
   - Feature consideration for future releases
   - Would add blocked/allowed status as column in knowledge sources table

3. **Workaround Options:**
   - Use DLP policy reports directly from Power Platform admin center
   - Cross-reference Agent Inventory with DLP policy configurations
   - Monitor knowledge source usage through existing governance tools

**Expected Outcome:**
This feature request has been noted for future consideration. Current workaround involves using existing DLP policy reporting tools alongside the Agent Inventory.

**Automated Response Pattern:**
_"This is a valid feature request for showing DLP policy status (blocked/allowed) of knowledge sources in the Agent Inventory. The team has noted this enhancement for future releases. Currently, use Power Platform admin center DLP reports alongside Agent Inventory for governance oversight."_

---

### [Issue #155 - After importing latest solution - toolkit stopped working for test automation](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/155)

**Problem:**
After upgrading the Toolkit solution to the latest version, authentication stopped working when testing the agent. Using the same Manual Authentication via Entra ID V2 configuration that worked in the previous version. Error occurs during user authentication step: "Client is public so neither 'client_assertion' nor 'client_secret' should be presented."

**Root Cause:**
Authentication configuration changes in the upgraded version. The new version handles authentication differently and requires updated configuration settings per the latest authentication guide, specifically using web channel security secret instead of token endpoint for direct line connection.

**Solution Steps:**

1. **Update Authentication Configuration:**

   - Follow the latest authentication guide: ENABLE-AUTHENTICATION.md
   - Review changes at Copilot Studio Kit Azure Application settings

2. **Configure Direct Line Connection:**

   - Use web channel security secret instead of token endpoint for direct line connection
   - Update the Direct Line Secret configuration

3. **Agent Configuration Updates:**

   - In step 6: Enter Direct Line Secret (find it in agent config)
   - Select "Dataverse" as Secret Location
   - Paste the Direct Line Secret
   - Set Region to appropriate location (e.g., Europe)
   - In step 9: Add the Client Secret

4. **Additional Configuration Notes:**
   - Ensure proper region selection in configuration
   - Verify all authentication fields are properly filled
   - Test authentication flow after configuration updates

**Expected Outcome:**
Test automation works correctly with the updated authentication configuration, resolving the client assertion/secret error and restoring toolkit functionality.

**Automated Response Pattern:**
_"This is an authentication configuration issue after upgrade. Follow the latest ENABLE-AUTHENTICATION.md guide, use web channel security secret instead of token endpoint for direct line connection, ensure proper region selection, and add all required authentication fields including Client Secret."_

---

### [Issue #154 - Package Upgrade: package version upgrade required as per Snyk scan result](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/154)

**Problem:**
Snyk security scan detected packages needing updates in PowerCAT.PackageDeployer.Package.csproj: Microsoft.CrmSdk.XrmTooling.CoreAssembly and System.Text.Json. User requested upgrading these packages to newest versions for security compliance.

**Root Cause:**
Scope misunderstanding - user was scanning the entire GitHub repository instead of just the solutions (Copilot Studio Kit & Creator Kit) that would be imported into their environment.

**Solution Steps:**

1. **Clarify Scan Scope:**

   - Scan only solutions (Copilot Studio Kit & Creator Kit) being imported
   - Don't scan entire GitHub repository containing development artifacts

2. **Package Version Considerations:**

   - Microsoft.CrmSdk.XrmTooling.CoreAssembly: Development team has restrictions due to Dataverse plugin requirements (.NET Framework)
   - System.Text.Json: Already upgraded in upcoming release
   - Microsoft.CrmSdk.CoreAssemblies: Already upgraded in upcoming release

3. **Recommended Approach:**
   - Focus security scans on imported solutions, not source repository
   - Use appropriate scan scope for production deployment assessment
   - Trust that development team handles package management appropriately

**Expected Outcome:**
After adjusting scan scope to focus on imported solutions rather than entire repository, security scan shows green/acceptable results without requiring source code package updates.

**Automated Response Pattern:**
_"This appears to be a scan scope issue. Focus your Snyk scan on the imported solutions (Copilot Studio Kit & Creator Kit) rather than the entire GitHub repository. The development team maintains appropriate package versions for Dataverse compatibility. System.Text.Json updates are included in upcoming releases."_

---

### [Issue #153 - In Generative AI Mode, Topic Match flow is not working](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/153)

**Problem:**
In Generative AI mode bots, topic match flow shows "Not an exact match on the triggered topic or event name" even when the topic name is correct. The same topic match flow works in Classic Bot mode but fails in Generative Bot mode, defaulting to sign-in topic instead of the actual triggered topic.

**Root Cause:**
Multi-topic matching limitation in generative mode. The Kit evaluates test results using only the first match when there are multiple matches, and generative mode can trigger multiple topics including authentication-related topics.

**Solution Steps:**

1. **Verify Latest Version:**

   - Ensure you're using the latest Copilot Studio Kit solution
   - The issue has been resolved in recent releases

2. **Update Solution:**

   - Import the latest solution version
   - Re-run your topic match tests after upgrade

3. **Multi-Topic Matching Understanding:**
   - In generative mode, multiple topics may match
   - Kit currently evaluates using first match only
   - Multi-topic matching improvements are in development backlog

**Expected Outcome:**
After upgrading to the latest solution, topic match flow works correctly in Generative AI mode, properly identifying the intended triggered topic instead of defaulting to authentication topics.

**Automated Response Pattern:**
_"This topic matching issue in Generative AI mode has been resolved in the latest Copilot Studio Kit release. Please upgrade your solution to the most recent version and re-test your topic match flows."_

---

### [Issue #152 - Feature Request: Agent Inventory Read Access Security Role](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/152)

**Problem:**
No security role currently provides read-only access to the Agent Inventory for stakeholders who need to view reports but shouldn't have access to other Copilot Studio Kit features. Users want to share inventory reports with stakeholders without granting full administrative access.

**Root Cause:**
Missing granular security role - the Agent Inventory feature is designed for administrators, and there's no built-in read-only role for viewing-only access.

**Solution Steps:**

1. **Current Workaround:**

   - Grant users read-only access to the AgentDetails table directly
   - Ensure users don't use the "Sync Agent" button (not currently permission-restricted)

2. **Manual Security Configuration:**

   - Create custom security role with read permissions to AgentDetails table
   - Restrict access to other Copilot Studio Kit features
   - Provide guidance to users about limitations

3. **Feature Enhancement Request:**
   - This enhancement is on the development backlog
   - Future releases may include dedicated read-only security role
   - UI separation of Agent Inventory from other features is being considered

**Expected Outcome:**
Currently requires manual security configuration. Future releases may include a dedicated read-only security role for Agent Inventory access.

**Automated Response Pattern:**
_"Currently, grant read-only access to the AgentDetails table for stakeholders who need to view Agent Inventory reports. A dedicated read-only security role for Agent Inventory is being considered for future releases. Ensure users avoid the Sync Agent button until permission restrictions are implemented."_

---

### [Issue #151 - Error: Agent Inventory | Agents Data Load - Call Child Flow Throttled](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/151)

**Problem:**
Agent Inventory flow encounters throttling errors with large numbers of environments (160+ environments). Error: "Number of concurrent requests for resource exceeded the allowed limit '26'. Decrease number of concurrent requests or reduce the duration of requests and try again later." Approximately 20 environments out of 160+ fail with this error.

**Root Cause:**
Concurrency limitation in the workflow when processing large numbers of environments simultaneously. The "Run a Child Flow | Agent Inventory Child" action exceeds the allowed concurrent request limit.

**Solution Steps:**

1. **Apply Hotfix:**

   - Import the updated solution with throttling fixes
   - Use release: CopilotStudioAccelerator_20250404_15_managed.zip
   - Available from GitHub releases page

2. **Verify Resolution:**

   - Re-run Agent Inventory sync after importing updated solution
   - Monitor for reduced throttling errors
   - Check completion across all environments

3. **Error Handling Improvements:**
   - Updated solution includes improved error handling
   - Better resilience for large environment counts
   - Enhanced concurrency management

**Expected Outcome:**
After importing the updated solution, Agent Inventory successfully processes all environments without throttling errors, even in tenants with 160+ environments.

**Automated Response Pattern:**
_"This throttling issue with large environment counts has been fixed. Import the updated solution (CopilotStudioAccelerator_20250404_15_managed.zip) from the GitHub releases page to resolve concurrent request limits in Agent Inventory flows."_

---

### [Issue #166 - Add "Uses Deep Reasoning" and "Uses Enhanced Search" to Agent Inventory report](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/166)

**Problem:**
Request to add "Uses Deep Reasoning" and "Uses Enhanced Search" fields to the Agent Inventory report for better tracking of agent capabilities and features.

**Root Cause:**
Feature enhancement request - missing visibility into agent configuration for Deep Reasoning and Enhanced Search capabilities in inventory reporting.

**Solution Steps:**

1. **Enhanced Search Field:**

   - Already available in current Agent Inventory table
   - Verify visibility in your deployment

2. **Deep Reasoning Field:**

   - Being added in upcoming release
   - Will appear alongside other agent capability fields

3. **Verify Report Updates:**
   - Check Agent Inventory report for "Uses Enhanced Search" column
   - Wait for next release for "Uses Deep Reasoning" field

**Expected Outcome:**
Complete visibility into agent AI capabilities including Enhanced Search (available) and Deep Reasoning (upcoming release) in the Agent Inventory reporting.

**Automated Response Pattern:**
_"'Uses Enhanced Search' is already available in the Agent Inventory table. 'Uses Deep Reasoning' will be added in the upcoming release. Check your current deployment for the Enhanced Search field visibility."_

---

### [Issue #180 - Error Authentication with Entra instead of Manual](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/180)

**Problem:**
User successfully configured manual authentication using ENABLE-AUTHENTICATION.md documentation but wants to use "Authenticate with Microsoft" (Entra ID) instead of manual authentication for Teams channel integration. Getting error "IntegratedAuthenticationNotSupportedInChannel" when attempting Entra ID authentication.

**Root Cause:**
Platform limitation - Copilot Studio Kit currently supports only manual authentication using Entra ID v2, not "Authenticate with Microsoft" (integrated authentication) option.

**Solution Applied:**
**Authentication Method Clarification:**

1. **Supported Authentication:**

   - ✅ Manual authentication using Entra ID v2 (currently supported)
   - ❌ "Authenticate with Microsoft" integrated authentication (not supported)

2. **Current Limitation:**

   - Kit designed for manual authentication scenarios only
   - IntegratedAuthenticationNotSupportedInChannel error is expected behavior
   - Feature limitation rather than configuration issue

3. **Teams Channel Considerations:**
   - Teams integration works with manual authentication approach
   - Integrated authentication creates channel-level conflicts
   - Manual auth provides necessary control for testing scenarios

**Technical Explanation:**

- Manual authentication allows Kit to control authentication flow during testing
- Integrated authentication bypasses Kit's authentication handling mechanisms
- Direct Line testing requires explicit authentication management

**Future Considerations:**

- This represents a known limitation rather than a bug
- User requirement acknowledged for potential future enhancements

**Outcome:** ✅ Limitation clarified - Kit supports manual authentication only, integrated authentication not available.

**Automated Response Pattern:**

- For Entra integrated authentication errors: Explain manual authentication requirement
- Clarify IntegratedAuthenticationNotSupportedInChannel as expected behavior
- Reference supported authentication configuration documentation

---

### [Issue #177 - Agent inventory - some environment failures 'exceeded the allowed limit '35'](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/177)

**Problem:**
Agent Inventory | Agents Data Load flow failed for some environments with error: "Number of concurrent requests for resource '36b70e229db348fc935b229804f27415' exceeded the allowed limit '35'." Manual runs worked successfully.

**Root Cause:**
Concurrent request throttling - Flow design created too many simultaneous API calls when processing multiple environments, exceeding Power Platform concurrent request limits (35).

**Solution Applied:**
**Workflow Modification & Updated Release:**

1. **Immediate Fix Provided:**

   - Team modified workflow to handle concurrent request throttling
   - Provided updated solution: CopilotStudioAccelerator_20250404_15_managed.zip
   - User confirmed fix resolved the concurrent request issue

2. **Technical Implementation:**
   - Modified flow to reduce concurrent API calls
   - Implemented better request pacing to stay within limits
   - Maintained functionality while respecting throttling boundaries

**Additional Discovery:**

- **Environment Limit Issue:** List environments connector returned only 1300 of 4000+ environments
- **Workaround Used:** User successfully used Center of Excellence environment table rows instead
- **Connector Limitation:** Confirmed List Environments has undocumented limits despite account having access to all environments

**Resolution Timeline:**

- Issue reported May 9
- Fixed solution provided May 12
- User confirmed success May 18

**Outcome:** ✅ Bug fixed with updated workflow, user successfully deployed and confirmed resolution.

**Automated Response Pattern:**

- For concurrent request limit errors: Provide updated solution with throttling improvements
- Reference April 2025 release with workflow modifications
- Suggest Center of Excellence table as alternative for large environment counts

---

### [Issue #176 - Refresh Agent Inventory](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/176)

**Problem:**
Agent Inventory not updating since installation. User needed to retrieve latest inventory but automatic refresh wasn't working.

**Root Cause:**
Manual refresh process not understood, and potential publishing/flow activation issues preventing proper inventory synchronization.

**Solution Applied:**
**Manual Sync Process & Troubleshooting:**

1. **Primary Solution:**

   - Use "Sync Agents" button for manual inventory refresh
   - Process is manual, not automatic
   - Located in Agent Inventory section

2. **Troubleshooting Steps:**

   - Ensure all Agent Inventory flows are enabled
   - Allow time for changes to reflect (may need page refresh)
   - Check error logs if sync fails

3. **Community Solution (User @petepuu):**
   - Opened Agents Inventory page from default solution for editing
   - Sync Agents worked in edit mode
   - Published the page, then sync started working properly
   - Suggests publishing requirement for proper functionality

**Technical Process:**

1. Navigate to Agent Inventory section
2. Click "Sync Agents" button
3. Wait for process completion (may take time)
4. Refresh page if needed
5. If issues persist, edit and republish page from default solution

**Resolution Pattern:**

- Initial user: Received guidance but experienced sync errors
- Second user: Found publishing workaround and confirmed success
- Team provided comprehensive troubleshooting steps

**Outcome:** ✅ Manual sync process clarified, community-driven publishing workaround discovered.

**Automated Response Pattern:**

- For inventory refresh issues: Direct to manual "Sync Agents" button
- Suggest flow activation check and page refresh
- Provide publishing workaround from default solution if needed

---

### [Issue #175 - Conversation KPI cannot be run](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/175)

**Problem:**
DLP policy preventing Conversation KPI report execution. User confirmed Dataverse connector enabled but still encountering DLP violations when trying to configure and run KPI reports.

**Root Cause:**
Insufficient DLP policy configuration - Only Dataverse connector approved, but Copilot Studio Kit requires multiple connectors for full functionality.

**Solution Applied:**
**Complete DLP Policy Configuration:**

**Required Connectors (All Must Be Allowed):**

1. **Microsoft Dataverse** - Core data storage and retrieval
2. **SharePoint** - SharePoint synchronization features
3. **Office 365 Outlook** - Email features and notifications
4. **Power Platform for Admins** - Conversation Analyzer, Agent Inventory, and other admin features
5. **Microsoft Entra ID** - Agent Configuration (especially authenticated agents)
6. **Power Apps for Makers** - Setup wizard functionality

**Implementation Process:**

1. **Initial Request:** User wanted only KPI functionality, questioned need for all connectors
2. **Clarification:** Team explained that while not all connectors needed solely for KPIs, they're required for integrated Kit functionality
3. **Admin Coordination:** User needed to work with admin team to update DLP policy
4. **Complete Resolution:** After enabling all required connectors, user confirmed "it works now"

**Connector Rationale:**

- **Production Environment:** Ensure working in correct environment
- **Data Connections:** All necessary connectors active and authorized
- **Complete Dashboard:** Required for full Power BI KPI dashboard functionality

**Key Learning:**
Even for specific features like KPIs, the integrated nature of Copilot Studio Kit requires comprehensive connector approval for proper operation.

**Outcome:** ✅ All required connectors enabled in DLP policy, KPI functionality restored.

**Automated Response Pattern:**

- For DLP KPI issues: Provide complete connector checklist (all 6 connectors)
- Emphasize integrated functionality requirements
- Guide admin coordination for policy updates

---

### [Issue #174 - Generative test failing even for an exact match message](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/174)

**Problem:**
Generative test failing even when Expected Message set very close or exactly identical to ultimately generated message. User suspected content filter interference despite seeing specific response messages previously.

**Root Cause:**
AI Builder prompt response analysis inconsistency - The AI Builder comparison between expected and agent responses showed unexpected evaluation behavior despite apparent exact matches.

**Solution Applied:**
**AI Builder Analysis & Office Hours Support:**

1. **Initial Troubleshooting:**

   - Team requested rerun with "Analyze with AI Builder" option selected
   - User confirmed reproduction of issue with AI Builder analysis
   - Identified as abnormal AI Builder evaluation behavior

2. **Office Hours Investigation:**

   - Team connected with user through office hours for detailed analysis
   - Conducted call to investigate test set configuration and behavior
   - Explored different test types as potential workaround

3. **Resolution Process:**
   - Team analyzed AI Builder prompt response evaluation mechanisms
   - Investigated potential content filtering vs. evaluation logic issues
   - Provided personalized troubleshooting through live support

**Technical Context:**

- **AI Builder Dependency:** Generative tests rely on AI Builder for response comparison
- **Content Filter Consideration:** User correctly noted that content filter issues typically return "Unknown" status
- **Evaluation Complexity:** AI-driven evaluation can have edge cases with seemingly identical text

**Office Hours Value:**
Complex AI evaluation issues benefit from live troubleshooting sessions where teams can examine specific test configurations and flow behaviors in real-time.

**Outcome:** ✅ Issue resolved through office hours consultation and different test type exploration.

**Automated Response Pattern:**

- For AI Builder generative test inconsistencies: Recommend office hours consultation
- Suggest trying different test types as potential workarounds
- Verify AI Builder configuration and flow history analysis

---

### [Issue #172 - Unable to import zip file in GCC](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/172)

**Problem:**
Unable to import Copilot Studio Kit ZIP file in Government Community Cloud (GCC) environment. Installation failing during import process following official installation instructions.

**Root Cause:**
Missing prerequisites - User attempting to install Copilot Studio Kit without first installing required Creator Kit solution dependency.

**Solution Applied:**
**Prerequisites Installation Process:**

1. **Dependency Requirements:**

   - Install Creator Kit solution before Copilot Studio Kit
   - Creator Kit is essential prerequisite for proper Kit installation
   - Reference: [Prerequisites Documentation](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/PREREQUISITES.md#dependencies)

2. **GCC Environment Considerations:**
   - Same prerequisite requirements apply in Government Community Cloud
   - Standard installation order must be followed regardless of environment type
   - No special GCC-specific installation variations

**Installation Sequence:**

1. **First:** Install Creator Kit solution (prerequisite)
2. **Second:** Install Copilot Studio Kit solution
3. **Follow:** Complete standard installation instructions

**Resolution Status:**

- Team provided prerequisites guidance
- User did not respond to confirm resolution
- Issue assumed resolved and closed due to no response

**Outcome:** ✅ Prerequisites guidance provided, standard installation sequence clarified for GCC environment.

**Automated Response Pattern:**

- For GCC installation failures: First verify Creator Kit prerequisite installation
- Reference prerequisites documentation before troubleshooting import issues
- Confirm installation sequence: Creator Kit → Copilot Studio Kit

---

### [Issue #150 - Agent Inventory Usage Details Enhancement](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/150)

**Problem:**
Feature request to add agent usage details to the Agent Inventory tool, similar to what's available in the Power Platform CoE tool. Users wanted visibility into agent usage metrics in the detailed view of each agent for better governance and monitoring.

**Root Cause:**
Feature gap - the Agent Inventory tool provided valuable agent configuration details not found elsewhere, but lacked usage analytics that administrators need for comprehensive governance oversight.

**Solution Applied:**
**Feature Implementation:**

1. **September 2025 Release:**

   - Usage information v1 added as part of the September release
   - Integration with existing Agent Inventory functionality
   - Documentation to follow implementation

2. **Enhanced Governance:**
   - Provides usage metrics similar to Power Platform CoE tool
   - Enables comprehensive agent monitoring and governance
   - Complements existing configuration and capability reporting

**Expected Outcome:**
Users now have access to usage details in the Agent Inventory, providing comprehensive visibility into both agent configuration and usage patterns for better governance decisions.

**Automated Response Pattern:**
_"Agent usage details have been added to the Agent Inventory tool in the September 2025 release. This provides usage metrics similar to the Power Platform CoE tool for comprehensive agent governance. Documentation will be available soon."_

---

### [Issue #148 - After Importing Latest Solution, Test Run Not Triggering](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/148)

**Problem:**
After importing the latest Copilot Studio Kit solution and configuring the agent with correct values, test runs don't trigger - the status doesn't change to running state. This affects both Classic and Generative bots.

**Root Cause:**
Configuration issues typically involving Power Automate flows not being enabled, missing Dataverse connections, or incomplete connection references after solution import.

**Solution Steps:**

1. **Verify Flow Activation:**

   - Navigate to Power Automate → Solutions → Copilot Studio Kit → Cloud Flows
   - Ensure all required flows are turned ON
   - Check flow status and error messages

2. **Check Dataverse Connections:**

   - Verify Dataverse connection is created and properly configured
   - Add connection to the connection reference if missing
   - Ensure proper permissions on Dataverse environment

3. **Configuration Verification:**

   - Confirm agent configuration matches required settings
   - Check if end user authentication is properly configured
   - Verify all connection references are properly mapped

4. **Solution Upgrade:**
   - If issues persist, upgrade to the latest solution version
   - Latest releases often include fixes for configuration issues
   - Re-test after upgrade to latest version

**Expected Outcome:**
Test runs trigger successfully after verifying flow enablement, connection configuration, and potentially upgrading to the latest solution version.

**Automated Response Pattern:**
_"This is typically a configuration issue. Verify that all Power Automate flows are turned ON, Dataverse connections are properly configured, and connection references are mapped. If issues persist, upgrade to the latest solution version."_

---

### [Issue #137 - Not Able to Visualize Conversation KPIs](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/137)

**Problem:**
User deployed the Copilot Studio Kit solution and configured agents but cannot see conversation KPIs in the Power BI dashboard. Data shows in conversation transcripts table but not in KPI tables or dashboards, with Power BI showing synchronization failures.

**Root Cause:**
Multiple potential causes including timing delays (KPI processing can take up to 24 hours), Power BI synchronization failures, missing agent configuration steps, or incorrect setup of backend flows for KPI generation.

**Solution Steps:**

1. **Wait for Processing Time:**

   - Allow up to 24 hours after conversation transcripts are generated
   - KPI processing runs on scheduled intervals, not real-time

2. **Manual KPI Generation:**

   - Navigate to Copilot Studio Kit app
   - Click "Generate KPI" button and select appropriate date ranges
   - Process KPIs manually to bypass timing issues

3. **Verify Data Pipeline:**

   - Check Advanced area → Agent Transcripts table for pending status records
   - Ensure conversation transcripts are being captured properly
   - Verify agent configuration is complete and correct

4. **Power BI Troubleshooting:**

   - Check Power BI connection and refresh settings
   - Verify synchronization errors and address connectivity issues
   - Update Power BI documentation references (may be outdated)

5. **Backend Flow Configuration:**
   - Verify all backend flows are properly configured and running
   - Check flow run history for errors or failures
   - Ensure proper Dataverse URL configuration

**Expected Outcome:**
Conversation KPIs populate in dashboards and Dataverse tables after proper configuration, processing time, and manual generation if needed.

**Automated Response Pattern:**
_"KPI processing can take up to 24 hours after conversation transcripts are generated. Use the 'Generate KPI' button with proper date ranges for manual processing. Check that backend flows are running, Power BI connections are configured properly, and agent configuration is complete. If data appears in conversation transcripts but not KPIs, verify flow configuration and allow processing time."_

---

### [Issue #136 - Imported Solution Appears Incomplete](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/136)

**Problem:**
After importing the Copilot Studio Kit solution, the application only shows a single page instead of the full application interface with navigation menu, making it appear incomplete compared to documentation screenshots.

**Root Cause:**
The left navigation pane is collapsed or hidden, making it appear that only one page is available. This is typically a UI display issue rather than missing components, often related to browser rendering or user interface state.

**Solution Steps:**

1. **Check Navigation Menu:**

   - Look for navigation menu expansion options (hamburger menu, arrow icons)
   - Try clicking on menu areas or edges to expand hidden navigation
   - Check if left side navigation pane can be expanded

2. **Browser Troubleshooting:**

   - Refresh the page or clear browser cache
   - Check browser console (F12) for JavaScript errors
   - Try a different browser or incognito/private mode

3. **URL Verification:**

   - Verify full URL structure in browser address bar
   - Ensure proper navigation parameters are present
   - Check if URL includes all necessary query parameters

4. **Solution Reinstallation:**

   - If navigation still doesn't appear, reinstall Creator Kit dependencies
   - Reinstall Copilot Studio Kit solution
   - Follow installation instructions carefully

5. **Support Escalation:**
   - If issues persist, schedule troubleshooting session with support team
   - Provide screenshots and browser console errors for diagnosis

**Expected Outcome:**
Full application interface displays with proper navigation menu and all pages accessible through expanded navigation pane.

**Automated Response Pattern:**
_"Check if the left navigation pane is collapsed - look for expand options, hamburger menu icons, or clickable areas to show the navigation menu. The app may appear to have only one page when navigation is hidden. Try expanding the navigation, refreshing the browser, or checking browser console for errors."_

---

### [Issue #135 - Error: No Response from Bot](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/135)

**Problem:**
Users following authentication instructions get no response from the bot during testing, despite following proper configuration steps. The issue may be related to supported account types settings and authentication method configuration.

**Root Cause:**
Authentication configuration issue where token endpoint authentication method was used instead of the required web channel security secret for end user authentication. Also potential issues with Azure app registration account types.

**Solution Steps:**

1. **Update Authentication Method:**

   - Navigate to Copilot Studio bot settings
   - Go to Security settings for the web channel
   - Use web channel security secret instead of token endpoint authentication
   - This is required for end user authentication scenarios

2. **Agent Configuration Update:**

   - Update authentication configuration in agent settings
   - Ensure agent configuration record reflects correct authentication method
   - Verify all required fields are properly populated

3. **Azure App Registration Verification:**

   - Check Azure app registrations have correct permissions
   - Verify API permissions are properly configured and granted
   - Ensure app registration certificates/secrets are valid

4. **Account Types Setting:**

   - Check supported account types setting in Azure app registration
   - May need "Multitenant and personal Microsoft accounts" for some scenarios
   - Align with organizational security requirements

5. **Test Authentication:**
   - Test bot response after updating authentication method
   - Verify authentication flow works in test pane
   - Confirm proper user identity is recognized

**Expected Outcome:**
Bot responds properly during test sessions with correct web channel security secret authentication configuration.

**Automated Response Pattern:**
_"For end user authentication, use web channel security secret instead of token endpoint authentication. Check your bot's Security settings and ensure the authentication method is configured for web channel security secret. Verify Azure app permissions and account types are properly configured."_

---

### [Issue #134 - Error When Turning On Flow 'Synchronize Files into Copilot Studio Child Flow'](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/134)

**Problem:**
When trying to activate the 'Synchronize files into Copilot Studio Child Flow', users get "BadRequest" error with message about 'yourorg.crm.dynamics.com' remote name that could not be resolved, preventing flow activation.

**Root Cause:**
The Dataverse URL environment variable contains a placeholder value 'yourorg.crm.dynamics.com' instead of the actual environment URL. The variable appears as managed (non-editable) when viewed in the solution context, requiring editing in the Default Solution.

**Solution Steps:**

1. **Navigate to Default Solution:**

   - Go to make.powerapps.com
   - Select "Default Solution" (not the imported Copilot Studio Kit solution)
   - This allows editing of managed environment variables

2. **Update Environment Variable:**

   - Find the 'Dataverse URL' environment variable
   - Edit the variable to contain your actual environment URL
   - Replace 'yourorg.crm.dynamics.com' with your actual URL (e.g., 'yourcompany.crm.dynamics.com')
   - Save the changes

3. **Activate Flows:**

   - Return to Power Automate and try turning on the child flow again
   - Verify the grandchild flow activates properly first
   - Then activate the child flow, followed by remaining flows

4. **Verify Configuration:**
   - Test flow functionality after activation
   - Check flow run history for any remaining errors
   - Ensure all dependent flows are properly activated

**Expected Outcome:**
Flow activates successfully after environment variable is properly configured with actual Dataverse URL, allowing proper connection to the environment.

**Automated Response Pattern:**
_"The 'Dataverse URL' environment variable needs to be updated with your actual environment URL. Go to Default Solution (not the imported solution) to edit this variable. Replace 'yourorg.crm.dynamics.com' with your actual environment URL like 'yourcompany.crm.dynamics.com'."_

---

### [Issue #133 - Fail to Install CAT through AppSource](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/133)

**Problem:**
Users encounter installation errors when trying to install the Copilot Studio Kit through Microsoft AppSource, preventing deployment in their sandbox tenant despite having proper admin permissions.

**Root Cause:**
AppSource package may have temporary publication issues, require specific pre/post installation steps that weren't followed, or have dependency conflicts in the target environment.

**Solution Steps:**

1. **Check AppSource Status:**

   - Verify Microsoft AppSource shows updated package availability
   - Check for any known issues or maintenance notifications
   - Ensure package is compatible with target environment

2. **Review Installation Requirements:**

   - Follow pre-installation instructions in the documentation carefully
   - Ensure proper admin permissions in the target environment
   - Check environment capacity and licensing requirements

3. **Alternative Installation Method:**

   - If AppSource continues to fail, use manual installation approach
   - Download solution files from GitHub releases
   - Follow manual installation instructions as backup method

4. **Post-Installation Configuration:**

   - Follow post-installation configuration steps regardless of installation method
   - Verify all components installed properly
   - Complete setup and configuration requirements

5. **Package Republishing:**
   - If widespread issues, package may need republishing
   - Check for updates or announcements about package status
   - Contact support if installation consistently fails

**Expected Outcome:**
Solution installs successfully either through AppSource or manual installation method, providing full Copilot Studio Kit functionality.

**Automated Response Pattern:**
_"If AppSource installation fails, try the manual installation method using solution files from GitHub releases. Ensure you have proper admin permissions and follow the pre/post installation instructions in the documentation. The manual approach provides the same functionality as AppSource installation."_

---

### [Issue #125 - Bulk Add Agent Test](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/125)

**Problem:**
User wants to know how to bulk add agent tests and which fields are required in the Dataverse table for bulk operations, rather than adding tests individually through the UI.

**Root Cause:**
User was not aware of the existing documentation for bulk import functionality using Excel, which provides detailed instructions for bulk creating or updating tests.

**Solution Steps:**

1. **Access Bulk Import Documentation:**

   - Navigate to the CONFIGURE_TESTS.md documentation
   - Follow the section: "Use Excel to bulk create or update tests"
   - Link: https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/CONFIGURE_TESTS.md#use-excel-to-bulk-create-or-update-tests

2. **Excel Bulk Import Process:**

   - Download the Excel template provided in the documentation
   - Fill in required fields according to the template structure
   - Use the Excel connector to import tests in bulk

3. **Required Fields:**

   - Refer to the documentation for complete field requirements
   - Template provides proper field structure and validation
   - Follow naming conventions and data format requirements

4. **Validation:**
   - Test a small batch first to ensure proper formatting
   - Verify all required fields are populated correctly
   - Check that tests are imported successfully before bulk operations

**Expected Outcome:**
Users can efficiently bulk add agent tests using the documented Excel import process, saving time over manual individual test creation.

**Automated Response Pattern:**
_"For bulk adding agent tests, use the Excel bulk import functionality documented at: https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/CONFIGURE_TESTS.md#use-excel-to-bulk-create-or-update-tests. This provides templates and instructions for bulk creating or updating tests efficiently."_

---

### [Issue #124 - Error Code: AppForbidden](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/124)

**Problem:**
After installing the app from AppSource, users receive "Error Code: AppForbidden" with message indicating the app isn't compliant with data loss prevention (DLP) policies. Error specifically mentions DLP policy compliance issues.

**Root Cause:**
The organization's Data Loss Prevention (DLP) policies are blocking required connectors that the Copilot Studio Kit needs to function properly. The app requires specific connectors to be allowed in DLP policies.

**Solution Steps:**

1. **Review Current DLP Policies:**

   - Access Power Platform Admin Center
   - Navigate to Data policies section
   - Identify current DLP policy restrictions

2. **Allow Required Connectors:**
   Ensure the following connectors are allowed in your DLP policies:

   - **Dataverse** - Core data operations
   - **SharePoint** - Document and file operations
   - **Power Platform as Admin** - Administrative functions
   - **Office 365 Outlook** - Email notifications
   - **Microsoft Entra ID** - Authentication and user management

3. **Update DLP Policy Configuration:**

   - Add these connectors to the "Business" data group
   - Ensure no restrictions prevent these connectors from working together
   - Save and apply the updated DLP policies

4. **Re-install Application:**

   - After updating DLP policies, try re-installing the application
   - Follow the complete installation instructions provided
   - Verify all components install successfully

5. **Validate Environment:**
   - Ensure you're working in appropriate environment (not just preview)
   - Check that environment has proper licensing for required connectors
   - Verify admin permissions are sufficient

**Expected Outcome:**
Application installs and launches successfully without DLP policy violations after allowing required connectors in organizational DLP policies.

**Automated Response Pattern:**
_"This AppForbidden error is caused by DLP policies blocking required connectors. Ensure these connectors are allowed in your DLP policies: Dataverse, SharePoint, Power Platform as Admin, Office 365 Outlook, and Microsoft Entra ID. Update your DLP policies to allow these connectors, then re-install the application."_

---

### [Issue #121 - Unable to See Username/Mail Within App-Insights](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/121)

**Problem:**
User has connected their copilot agent bot with Application Insights but doesn't see any username or email information in the logging, despite having authentication configured within the copilot.

**Root Cause:**
This appears to be a question about how the Copilot Studio Kit integrates with Application Insights telemetry and what user identification information is available in the logging. The issue was marked as needing further clarification about specific usage of the Kit.

**Solution Steps:**

1. **Clarify Integration Approach:**

   - Verify if using Copilot Studio Kit's built-in analytics vs. custom Application Insights integration
   - Confirm which telemetry data sources are being utilized

2. **Review Authentication Configuration:**

   - Check if end-user authentication is properly configured and enabled
   - Verify that user identity information is being captured during conversations

3. **Application Insights Configuration:**

   - Review Application Insights telemetry configuration
   - Check what user identification data is being sent to Application Insights
   - Verify custom telemetry properties are configured correctly

4. **Copilot Studio Kit Analytics:**

   - Consider using Kit's built-in conversation analytics instead of/alongside Application Insights
   - Review conversation transcripts and KPI data for user identification
   - Check if Kit's analytics provide the user information needed

5. **Documentation Review:**
   - Consult Copilot Studio Kit documentation for Application Insights integration
   - Review Microsoft Copilot Studio documentation on telemetry and user tracking

**Expected Outcome:**
Understanding of how user identification works with Application Insights integration and accessing available user information through appropriate telemetry channels.

**Automated Response Pattern:**
_"Could you clarify how you're using the Copilot Studio Kit with Application Insights? The Kit has built-in conversation analytics that may provide the user information you need. Please review the authentication configuration and consider using the Kit's conversation transcripts and KPI features for user identification data."_

---

### [Issue #120 - Transcript WebChat Control Empty in Conversation KPIs](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/120)

**Problem:**
In the Copilot Studio Kit MDA app, on the Conversation KPI form's Transcript tab, the PCF WebChat control appears empty and doesn't display conversation transcripts, indicating a problem with transcript binding or format recognition.

**Root Cause:**
The WebChat PCF control was not properly handling certain transcript formats or had issues parsing the transcript data structure, preventing visual display of conversation history.

**Solution Steps:**

1. **Verify Transcript Format:**

   - Provide sample transcript JSON data for analysis
   - Ensure transcript format matches expected WebChat control schema
   - Remove any confidential information before sharing for troubleshooting

2. **Check Control Configuration:**

   - Verify PCF WebChat control is properly configured in the form
   - Ensure proper binding between transcript data and control properties
   - Check for any JavaScript errors in browser console

3. **Validate Transcript Data:**

   - Confirm transcript data exists in the Dataverse record
   - Verify transcript JSON structure is complete and valid
   - Check if transcript contains supported message types and format

4. **Apply Latest Release:**

   - The issue was fixed and included in subsequent releases
   - Update to the latest Copilot Studio Kit release
   - Test WebChat control functionality after upgrade

5. **Post-Update Validation:**
   - Test with various transcript formats and conversation types
   - Verify visual display of conversation history works properly
   - Confirm user-friendly monitoring of transcripts is functional

**Expected Outcome:**
WebChat control displays conversation transcripts properly in visual format, enabling user-friendly monitoring and review of conversation history.

**Automated Response Pattern:**
_"This issue with empty WebChat controls has been fixed in recent releases. Please update to the latest Copilot Studio Kit version and test again. If you continue having issues, please provide a sample transcript (with confidential information redacted) for further analysis."_

---

### [Issue #119 - Question: User ID in Conversation Transcript](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/119)

**Problem:**
User found a GUID for "User ID" in conversation transcripts used in Power BI but couldn't match this GUID to users in Entra ID or systemusers table in Dataverse, wanting to understand how to identify the actual user behind conversations.

**Root Cause:**
User needed clarification on what type of identifier the User ID represents in conversation transcripts and how to correlate it with actual user identities.

**Solution Steps:**

1. **Understand User ID Type:**

   - Refer to Microsoft documentation on Copilot Studio analytics transcripts
   - Review the content field documentation for transcript structure
   - Link: https://learn.microsoft.com/en-us/microsoft-copilot-studio/analytics-transcripts-powerapps#content-field

2. **User Identification Method:**

   - User ID in transcripts may be channel-specific or session-specific identifier
   - May not directly correlate to Entra ID or Dataverse systemuser GUIDs
   - Could be Teams user ID, anonymous session ID, or other channel identifier

3. **Review Documentation:**

   - Consult Microsoft Copilot Studio documentation on user identification
   - Understand how different channels (Teams, Web, etc.) handle user identity
   - Review privacy and user identification patterns in transcripts

4. **Alternative Identification:**
   - Look for other fields in transcript that may contain user information
   - Consider using conversation metadata for user correlation
   - Check if authentication provides additional user identification fields

**Expected Outcome:**
Understanding of how User ID works in conversation transcripts and appropriate methods for identifying users behind conversations.

**Automated Response Pattern:**
_"The User ID in conversation transcripts is a channel-specific identifier that may not directly match Entra ID GUIDs. Please refer to the Microsoft Copilot Studio documentation on analytics transcripts for details about user identification: https://learn.microsoft.com/en-us/microsoft-copilot-studio/analytics-transcripts-powerapps#content-field"_

---

### [Issue #118 - Conversation KPIs Dashboard Issue - SessionID Not Unique](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/118)

**Problem:**
Power BI report refresh fails with error "Column 'Session ID' in Table 'Session Details' contains a duplicate value" because the same SessionID can appear multiple times when users chat with different bots in the same session (e.g., in Teams).

**Root Cause:**
SessionID alone is not unique when multiple agents are configured, as users can interact with different bots within the same session, creating duplicate SessionIDs that violate Power BI's many-to-one relationship requirements.

**Solution Steps:**

1. **Identify the Problem:**

   - Multiple agents configured for conversation KPIs
   - Same SessionID appears for different conversations at same time
   - Power BI relationship constraints require unique identifiers

2. **Apply Code Fix:**

   - Microsoft modified code to include Agent ID alongside Session ID
   - Update to latest Copilot Studio Kit release containing the fix
   - Latest releases include updated Custom API (cat_GenerateConversationKpis)

3. **For Existing Data:**

   - Fix existing duplicate SessionID entries in Dataverse
   - Use SQL4CDS or similar tools to update cat_sessionsdetails field
   - Ensure concatenation of CopilotID + SessionID creates unique identifiers

4. **Power BI Report Update:**

   - Use latest Conversation KPIs.pbit from current release
   - Verify unique key structure includes both Agent ID and Session ID
   - Test report refresh to ensure no duplicate value errors

5. **Validation:**
   - Confirm Power BI relationships work correctly with updated schema
   - Test with multiple agents to ensure unique identification
   - Verify future KPI generation doesn't create duplicates

**Expected Outcome:**
Power BI reports refresh successfully without duplicate SessionID errors, supporting multiple agents with proper unique identification using Agent ID + Session ID combination.

**Automated Response Pattern:**
_"This SessionID duplication issue has been fixed by including Agent ID in the unique key. Please update to the latest Copilot Studio Kit release and use the updated Power BI template. For existing environments with duplicates, you may need to clean up existing cat_sessionsdetails data manually."_

---

### [Issue #117 - DLP Policy Issue](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/117)

**Problem:**
User received DLP (Data Loss Prevention) policy errors when opening the Copilot Studio Kit app, even after placing all connectors in the Business Group and eventually removing DLP policies entirely.

**Root Cause:**
DLP policy configurations can have timing delays or global policies that weren't immediately apparent. Even with local environment changes, there may have been global tenant-level DLP policies affecting the application.

**Solution Steps:**

1. **Check Global DLP Policies:**

   - Verify there are no DLP policies applied globally to all environments
   - Review tenant-level DLP settings in Power Platform Admin Center
   - Ensure no inherited policies from higher organizational levels

2. **Verify Connector Configuration:**

   - Confirm all required connectors are in the Business data group
   - Required connectors: Dataverse, SharePoint, Power Platform as Admin, Office 365 Outlook, Microsoft Entra ID
   - Ensure no conflicts between connector classifications

3. **Fresh Installation Approach:**

   - If issues persist, perform complete fresh installation
   - Uninstall existing solution completely
   - Clear any cached policy information
   - Reinstall solution with proper DLP configuration

4. **Wait for Policy Propagation:**

   - DLP policy changes may take time to propagate throughout the system
   - Allow several hours or overnight for changes to take effect
   - Policies may need time to sync across all services

5. **Validate Environment State:**
   - Check environment status and health
   - Verify environment has proper licensing and permissions
   - Confirm environment isn't in restricted or limited state

**Expected Outcome:**
Application opens successfully without DLP policy errors after proper policy configuration and time for system propagation.

**Automated Response Pattern:**
_"DLP errors can persist due to global policies or propagation delays. Check for tenant-level DLP policies, ensure all required connectors are in Business group, and allow time for policy changes to propagate. If issues persist, try fresh installation after verifying global policy settings."_

---

### [Issue #116 - What Should I Enter as the Agent Token Endpoint?](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/116)

**Problem:**
User is unsure what value to enter for the "Agent Token Endpoint" environment variable that appears after installing the Copilot Studio Kit solution, and the variable doesn't seem tied to a specific agent.

**Root Cause:**
User confusion about the purpose and configuration of the Agent Token Endpoint environment variable, which is used for specific Kit features but not required for basic functionality.

**Solution Steps:**

1. **Understand Variable Purpose:**

   - Agent Token Endpoint is mainly required for WebChat playground feature
   - Used for Adaptive Card gallery features that need live chatbot experience
   - Not required for basic Kit functionality or most standard operations

2. **When to Configure:**

   - Only necessary if using WebChat playground features
   - Required for live chatbot experience in specific Kit components
   - Can remain blank if not using these advanced features

3. **How to Configure (When Needed):**

   - Use token endpoint from Mobile app channel in Copilot Studio
   - Follow Microsoft documentation: https://learn.microsoft.com/microsoft-copilot-studio/publication-connect-bot-to-custom-application#retrieve-your-copilot-studio-copilot-parameters
   - Configure on per-agent basis when creating agent configurations

4. **Blank Value Acceptable:**

   - Kit functions properly with this variable blank for most use cases
   - Only configure when specifically needed for WebChat or playground features
   - No impact on core testing, analytics, or management functionality

5. **Agent-Specific Configuration:**
   - When creating individual agents, provide specific token endpoints
   - Agent-level configuration overrides global environment variable
   - Each agent can have its own token endpoint as needed

**Expected Outcome:**
Understanding that the environment variable can remain blank unless using specific features, with proper configuration guidance when those features are needed.

**Automated Response Pattern:**
_"The Agent Token Endpoint environment variable is only needed for WebChat playground and Adaptive Card gallery features. It can remain blank for basic Kit functionality. When needed, use the token endpoint from your agent's Mobile app channel. Configure per-agent during agent setup if using these features."_

---

### [Issue #115 - AppSource Doesn't Work for GCC Tenants](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/115)

**Problem:**
AppSource installation fails for GCC (Government Community Cloud) tenants because D365 licenses are not recognized, likely due to differences between commercial and GCC SKU names for licensing validation.

**Root Cause:**
AppSource licensing validation doesn't properly recognize GCC-specific license SKUs, preventing installation in government cloud environments even when proper licensing exists.

**Solution Steps:**

1. **Install Prerequisites:**

   - Download and install Power Platform CLI from official Microsoft documentation
   - Link: https://learn.microsoft.com/en-us/power-platform/developer/cli/introduction?tabs=windows#install-microsoft-power-platform-cli
   - Ensure CLI is properly configured for GCC environment access

2. **Download Package Deployer:**

   - Download PowerCAT.PackageDeployer.Package.1.0.0.pdpkg file
   - Use latest release from GitHub releases page
   - Ensure compatibility with GCC environment requirements

3. **Deploy Using CLI:**

   - Use Power Platform CLI instead of AppSource installation
   - Run deployment command: `pac package deploy --package .\bin\Debug\DeploymentPackage.1.0.0.pdpkg.zip --environment environment-url`
   - Follow detailed Package Deployer Tool documentation

4. **Alternative Deployment Method:**

   - Use Package Deployer Tool directly for GCC environments
   - Follow Microsoft documentation: https://learn.microsoft.com/en-us/power-platform/alm/package-deployer-tool?tabs=cli#deploy
   - This bypasses AppSource licensing validation issues

5. **Post-Deployment Configuration:**
   - Complete all post-deployment steps as documented
   - Follow installation guide: https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/INSTALLATION_INSTRUCTIONS.md#post-deployment-steps
   - Verify all components installed properly in GCC environment

**Expected Outcome:**
Successful installation of Copilot Studio Kit in GCC environments using Package Deployer method, bypassing AppSource licensing validation issues.

**Automated Response Pattern:**
_"AppSource doesn't support GCC license validation. Use Power Platform CLI with Package Deployer instead. Download the .pdpkg file from GitHub releases and deploy using 'pac package deploy' command. Follow the post-deployment steps after successful installation."_

---

### [Issue #114 - Add Live Chat Capability for Dynamics 365 Omnichannel to WebChat Playground](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/114)

**Problem:**
Request to extend WebChat Playground functionality to support Dynamics 365 Omnichannel live chat capabilities, allowing integration with omnichannel customer service features beyond the current Copilot Studio bot functionality.

**Root Cause:**
This is a feature enhancement request rather than a problem. The current WebChat Playground focuses on Copilot Studio bot interactions and doesn't include integration with Dynamics 365 Customer Service omnichannel features.

**Solution Steps:**

1. **Current State Assessment:**

   - WebChat Playground currently supports Copilot Studio bot testing and customization
   - Dynamics 365 Customer Service uses its own Live Chat widget for omnichannel
   - Integration would require significant architectural changes

2. **Feature Request Evaluation:**

   - This is logged as an enhancement in the project backlog
   - Would require development effort to integrate omnichannel APIs
   - Need to assess technical feasibility and user demand

3. **Alternative Solutions:**

   - Use existing Dynamics 365 Live Chat widget for omnichannel scenarios
   - Leverage Copilot Studio's integration with Customer Service for bot scenarios
   - Consider hybrid approaches using both tools for different use cases

4. **Enhancement Tracking:**

   - Feature request is being tracked in project backlog
   - No immediate timeline for implementation
   - Community feedback may influence prioritization

5. **Workaround Options:**
   - Continue using separate tools for different scenarios
   - Explore custom development if integration is critical
   - Monitor future releases for potential omnichannel enhancements

**Expected Outcome:**
Feature request is logged for future consideration, with no immediate implementation timeline. Users should continue using appropriate tools for their specific scenarios.

**Automated Response Pattern:**
_"This is a great feature suggestion for integrating Dynamics 365 omnichannel capabilities with WebChat Playground. The request is logged in our backlog for future consideration. Currently, use the Dynamics 365 Live Chat widget for omnichannel scenarios and WebChat Playground for Copilot Studio bot testing."_

---

### [Issue #113 - Unable to Generate PowerBI Report with Conversation KPIs](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/113)

**Problem:**
User successfully added agents and ran Generate KPI action with conversation transcripts visible in logs, but couldn't see the KPI Dashboard in Power BI. User was unsure about the correct process to generate and access the Power BI report.

**Root Cause:**
User was missing the step to import the Power BI template into their Power BI workspace. The Kit provides the data and template, but users need to manually import and configure the Power BI template.

**Solution Steps:**

1. **Import Power BI Template:**

   - Download the Conversation KPIs.pbit template from the Kit installation files
   - Open Power BI Desktop and import the template
   - Connect to your Dataverse environment containing the KPI data

2. **Configure Data Connection:**

   - When importing template, provide your Dataverse environment URL
   - Ensure proper authentication to access conversation KPI data
   - Verify connection to the environment where agents are configured

3. **Verify Data Availability:**

   - Confirm that conversation transcripts exist and KPIs have been generated
   - Check that Generate KPI action has run successfully
   - Allow time for KPI processing to complete (up to 24 hours)

4. **Follow Installation Instructions:**

   - Reference installation guide: https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/INSTALLATION_INSTRUCTIONS.md#access-the-power-cat-copilot-studio-kit-app
   - Complete all post-installation steps for Power BI configuration
   - Ensure proper permissions to access Power BI workspace

5. **Publish and Share:**
   - After configuring template, publish to Power BI service
   - Set up appropriate sharing and permissions
   - Configure refresh schedules for updated data

**Expected Outcome:**
Power BI report displays conversation KPI data properly after importing template and configuring data connections according to installation instructions.

**Automated Response Pattern:**
_"You need to import the Power BI template (Conversation KPIs.pbit) into your Power BI workspace and connect it to your Dataverse environment. Follow the installation instructions here: https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/INSTALLATION_INSTRUCTIONS.md#access-the-power-cat-copilot-studio-kit-app"_

---

### [Issue #112 - Schedule SharePoint Indexing](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/112)

**Problem:**
User wanted to schedule SharePoint library indexing automatically instead of manual triggering, and needed clarification on bidirectional updates (whether deleted files are removed from Copilot knowledge). Additionally, discovered issue with hardcoded "Site Pages" causing failures in non-English SharePoint environments.

**Root Cause:**
Two separate issues: 1) User wasn't aware that SharePoint synchronization already runs automatically daily, and 2) Power Automate flow uses hardcoded "Site Pages" string which fails in localized SharePoint environments where the list name is translated (e.g., "Websiteseiten" in German).

**Solution Steps:**

1. **Automatic Scheduling:**

   - SharePoint synchronization automatically runs once per day
   - No manual configuration needed for scheduled indexing
   - Refer to File Synchronization documentation: https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/FILE_SYNCHRONIZATION.md

2. **Bidirectional Updates:**

   - File deletions from SharePoint library are reflected in Agent knowledge source
   - When sync runs, deleted files are removed from Copilot's knowledge base
   - Changes are processed during the next scheduled sync

3. **Localization Issue (Non-English SharePoint):**

   - Problem: Flow hardcodes "Site Pages" which fails in localized environments
   - Error: "Die Liste 'Site Pages' ist in der Website...nicht vorhanden" (German)
   - Affects sites created in non-English locales where list names are translated

4. **Workaround for Localization:**

   - Import solution as unmanaged to allow modifications
   - Update "Send an HTTP request to SharePoint" action
   - Replace hardcoded "Site Pages" with dynamic list name retrieval
   - Or use localized list name (e.g., "Websiteseiten" for German)

5. **Dynamic List Name Solution:**
   - Use SharePoint REST API to get list by ID instead of title
   - Implement dynamic list name detection based on site locale
   - Consider using English internal names regardless of display language

**Expected Outcome:**
Automatic daily synchronization works properly, bidirectional updates function as expected, and localized SharePoint environments work without hardcoded string conflicts.

**Automated Response Pattern:**
_"SharePoint synchronization runs automatically once daily and supports bidirectional updates (deletions are reflected). For non-English SharePoint sites, you may need to modify the flow to use localized list names instead of hardcoded 'Site Pages'. Import as unmanaged solution to make these modifications."_

---

### [Issue #111 - Feature Request: Scheduled Tests / Trigger Events](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/111)

**Problem:**
User requested the ability to schedule automated Test Runs (e.g., daily at midnight) and trigger events (e.g., automatically running tests when an agent is re-published in Copilot Studio), seeking programmatic test execution capabilities.

**Root Cause:**
This was a feature enhancement request for automated testing capabilities that weren't available in the initial release but were identified as valuable functionality for continuous integration and automated quality assurance.

**Solution Steps:**

1. **Feature Implementation:**

   - Microsoft added programmatic test run execution functionality
   - Template flows provided for automated test execution
   - Integration with Power Platform pipelines enabled

2. **Download Latest Solution:**

   - Get latest Copilot Studio Kit release: https://aka.ms/DownloadCopilotStudioKit
   - Install updated solution containing automated testing capabilities
   - Review new documentation for programmatic test execution

3. **Power Platform Pipeline Integration:**

   - Use provided template flows for automated testing
   - Configure Power Platform pipelines to trigger tests
   - Set up deployment pipelines with automated test runs

4. **Scheduling Options:**

   - Create scheduled flows to run tests at specific times (daily, weekly, etc.)
   - Configure triggers for re-publishing events
   - Use Power Platform connectors for custom scheduling scenarios

5. **Documentation Review:**
   - Follow clear instruction documents included with latest release
   - Configure automated test execution according to provided templates
   - Understand pipeline integration patterns and best practices

**Expected Outcome:**
Automated test scheduling and trigger events are now available through Power Platform pipelines integration, enabling continuous integration and automated quality assurance workflows.

**Automated Response Pattern:**
_"Scheduled tests and trigger events are now available! Download the latest release from https://aka.ms/DownloadCopilotStudioKit which includes template flows and documentation for executing tests automatically using Power Platform pipelines."_

---

### [Issue #110 - Topic Match Test: Issue with Authenticated Agents](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/110)

**Problem:**
For agents with authentication enabled, Topic Match tests were returning "Sign In" topic instead of the expected topic, causing test failures even when the agent correctly matched topics after authentication.

**Root Cause:**
The topic matching logic wasn't properly handling authentication flow scenarios, where agents require user sign-in before proceeding to topic matching, causing tests to fail at the authentication step.

**Solution Steps:**

1. **Update to Latest Release:**

   - Install latest Copilot Studio Kit release containing authentication fixes
   - Release: CopilotStudioAccelerator-April2025 or later
   - Follow installation instructions for updated solution

2. **Configure Multiple Expected Topics:**

   - Use comma-separated topic names in "Expected Topic Name" column
   - Include both "Sign In" and actual expected topic (e.g., "Sign In,Weather Info")
   - This allows tests to pass for either authentication or actual topic matching

3. **Test Configuration Updates:**

   - Update existing topic match tests to account for authentication flow
   - Modify test expectations to handle sign-in requirements
   - Ensure test data includes proper authentication scenarios

4. **Validation Process:**

   - Test both authenticated and non-authenticated scenarios
   - Verify topic matching works correctly after authentication
   - Confirm comma-separated expected topics work as intended

5. **Authentication Flow Testing:**
   - Consider separate test scenarios for authentication vs. topic matching
   - Use appropriate test data for authenticated agent scenarios
   - Validate end-to-end authentication and topic matching workflow

**Expected Outcome:**
Topic Match tests work correctly for authenticated agents by accepting multiple expected topics including sign-in scenarios.

**Automated Response Pattern:**
_"This issue has been fixed in the latest release. For authenticated agents, use comma-separated topic names in the Expected Topic Name column (e.g., 'Sign In,Expected Topic'). Update to the latest Copilot Studio Kit version for full authentication support."_

---

### [Issue #109 - File Indexer Configurations Issue](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/109)

**Problem:**
User encountered error when uploading a 300MB file from SharePoint: "InvalidTemplate. Unable to process template language expressions... The template language function 'body' cannot be used when the referenced action outputs body has large aggregated partial content. Actions with large aggregated partial content can only be referenced by actions that support chunked transfer mode."

**Root Cause:**
Power Automate has limitations on file size handling when not using chunked transfer APIs. Large files (300MB+) require special handling to avoid template language expression errors related to large content processing.

**Solution Steps:**

1. **Update to Latest Release:**

   - Install the most recent Copilot Studio Kit release
   - Follow installation instructions: https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/INSTALLATION_INSTRUCTIONS.md
   - Latest releases include improvements for large file handling

2. **Understand File Size Limits:**

   - Default Dataverse file column limit: 32MB (can be increased to 10GB)
   - Power Automate has separate limitations for file processing
   - SharePoint synchronization may handle larger files better than direct upload

3. **Use SharePoint Synchronization:**

   - Instead of direct file upload, use SharePoint site as knowledge source
   - SharePoint synchronization can handle larger files more effectively
   - Configure SharePoint library synchronization for better large file support

4. **Chunked Transfer Considerations:**

   - For very large files, consider implementing chunked transfer APIs
   - May require custom development for optimal large file handling
   - Evaluate if file size reduction is possible (compression, splitting)

5. **Alternative Approaches:**
   - Use SharePoint as primary knowledge source for large files
   - Consider file optimization before upload
   - Implement custom flows with proper chunked transfer if needed

**Expected Outcome:**
Latest release resolves large file handling issues, and SharePoint synchronization provides better support for files larger than direct upload limitations.

**Automated Response Pattern:**
_"This large file issue has been addressed in recent releases. Update to the latest Copilot Studio Kit version and consider using SharePoint synchronization instead of direct upload for files over 300MB. SharePoint as a knowledge source handles large files more effectively."_

---

### [Issue #108 - Unable to Import CopilotStudioAccelerator.zip Due to Lack of SharePoint Access](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/108)

**Problem:**
User was unable to import the CopilotStudioAccelerator.zip solution because their Azure tenant did not have SharePoint or other Microsoft 365 tools attached to their accounts, and the accelerator prompted them to sign in to SharePoint during installation.

**Root Cause:**
The original installation method required SharePoint connectivity even when SharePoint features weren't being used. Users with Azure-only tenants (without full Microsoft 365 licenses) were blocked from installing the solution despite having appropriate Copilot Studio and Power Platform licenses.

**Solution Steps:**

1. **Use AppSource Installation:**

   - Install the Copilot Studio Kit directly from AppSource: https://appsource.microsoft.com/en-us/product/dynamics-365/microsoftpowercatarch.copilotstudiokit?tab=Overview
   - This method bypasses SharePoint dependency issues during installation
   - AppSource installation works with Azure-only tenants

2. **Follow Post-Installation Steps:**

   - Complete the setup using the installation guide: https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/INSTALLATION_INSTRUCTIONS.md#installing-the-power-cat-copilot-studio-kit-appsource
   - Enable flows and update environment variables (excluding SharePoint-related ones)
   - Skip SharePoint Sync configuration if not using SharePoint features

3. **License Verification:**

   - Ensure you have required licenses: Power Apps for Developer, Power Automate Free, Copilot Studio User License
   - Verify Power BI Pro license if using dashboard features
   - Platform Administrator role is sufficient for installation

4. **Environment Variables Configuration:**

   - Update all environment variables except SharePoint Sync related ones
   - Focus on Dataverse URL and core platform connections
   - Skip SharePoint-specific environment variables until SharePoint access is available

5. **Alternative Installation Method:**
   - If AppSource is not available, request SharePoint access from tenant administrator
   - Consider using a development environment with full Microsoft 365 licensing
   - Use managed solution deployment if organization has SharePoint restrictions

**Expected Outcome:**
AppSource installation method allows users to install and use Copilot Studio Kit without SharePoint dependencies, enabling core functionality for testing, conversation KPIs, and agent management features.

**Automated Response Pattern:**
_"For tenants without SharePoint access, install directly from AppSource: https://appsource.microsoft.com/en-us/product/dynamics-365/microsoftpowercatarch.copilotstudiokit. This bypasses SharePoint dependency issues. Follow the post-installation guide and skip SharePoint-related environment variables."_

---

### [Issue #102 - Topic Match Testing](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/102)

**Problem:**
User wanted to configure Dataverse Enrichment to enable Topic Match testing but was unable to get it working in a Sandbox environment. The user needed to test Topic Match functionality before releasing to production but encountered issues with transcript generation and configuration.

**Root Cause:**
Topic Match testing relies on conversation transcripts which are only generated in production environments, not in sandbox/development environments. Additionally, transcripts require proper Dataverse configuration and typically take 30-60 minutes to be created after conversations occur.

**Solution Steps:**

1. **Environment Requirements:**

   - Topic Match testing requires a production environment (not sandbox/dev)
   - Transcripts are only generated in production Copilot Studio environments
   - Allow 30-60 minutes after conversations for transcript records to be created

2. **Agent Configuration Setup:**

   - Enable Dataverse Enrichment in agent configuration
   - Enter the correct Dataverse URL in agent settings
   - Configure full transcript copy settings as needed
   - Follow documentation: https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/CONFIGURE_COPILOTS.md#configure-a-new-agent-for-test-automation

3. **Test Configuration Fields:**

   - Set up required fields in Agent Configuration section
   - Configure Agent Test settings with proper Topic Match parameters
   - Ensure Expected Topic Name field is properly configured
   - Verify conversation data flows to Dataverse correctly

4. **Production Environment Setup:**

   - Deploy agent to production environment for transcript generation
   - Conduct actual conversations to generate test data
   - Wait for transcript processing (30-60 minutes)
   - Verify Dataverse contains conversation transcript records

5. **Alternative Testing Approaches:**
   - Use production environment for Topic Match validation
   - Consider staging/pre-production environment if available
   - Test other functionality in sandbox, Topic Match in production
   - Document Topic Match behavior for future reference

**Expected Outcome:**
Topic Match testing works correctly in production environments with proper Dataverse configuration and sufficient time for transcript generation.

**Automated Response Pattern:**
_"Topic Match testing requires a production environment as transcripts are only generated there, not in sandbox/dev. Configure Dataverse Enrichment in agent settings and allow 30-60 minutes after conversations for transcript creation. Follow the configuration guide for proper setup."_

---

### [Issue #94 - Additional "\n" in SP Sync File filter causes no results in "Get Files" action](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/94)

**Problem:**
SharePoint file synchronization was failing to return any files when using the file query option. The issue was caused by an additional "\n" (newline character) being added to the query parameter in the "Synchronize files into Copilot Studio Child Flow," which caused the SharePoint "Get Files" action to return no results.

**Root Cause:**
A formatting bug in the Power Automate flow where an extra newline character was inadvertently included in the SharePoint file query filter. This malformed query prevented the SharePoint connector from properly filtering and retrieving files, causing synchronization failures.

**Solution Steps:**

1. **Update to Latest Release:**

   - Install the latest Copilot Studio Kit release from AppSource: https://appsource.microsoft.com/en-us/product/dynamics-365/microsoftpowercatarch.copilotstudiokit
   - Follow installation instructions: https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/INSTALLATION_INSTRUCTIONS.md
   - Latest releases have fixed this formatting issue in the flow

2. **Immediate Workaround (If Needed):**

   - Open the "Synchronize files into Copilot Studio Child Flow" in Power Automate
   - Navigate to the "Get Files" action that queries SharePoint
   - Switch to classic designer if using modern designer
   - Remove the extra newline character ("\n") from the query parameter
   - Save and test the flow

3. **Verify Fix:**

   - Run the SharePoint file synchronization process
   - Check that files are properly retrieved from SharePoint
   - Verify that the query parameter no longer contains extra newline characters
   - Test file synchronization with various file types and filters

4. **Alternative Designer Considerations:**

   - Issue was more visible in classic Power Automate designer
   - Modern designer sometimes didn't display the newline character consistently
   - Using classic designer made it easier to identify and remove the problematic character
   - Switch between designers if needed for proper visibility

5. **Post-Fix Validation:**
   - Confirm that SharePoint synchronization runs successfully
   - Verify that knowledge sources are properly updated with synchronized files
   - Test end-to-end file synchronization workflow

**Expected Outcome:**
SharePoint file synchronization works correctly after updating to the latest release, with proper file retrieval and no query formatting issues.

**Automated Response Pattern:**
_"This SharePoint sync issue with extra newline characters in file queries has been fixed in the latest release. Install the newest version from AppSource, or manually remove the '\n' character from the Get Files action in the sync flow using the classic designer."_

---

### [Issue #93 - Embedded Conversation KPI report doesn't seem to be using the embed URL from the environment variable](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/93)

**Problem:**
In GCC (Government Community Cloud) environments, the embedded Conversation KPI report was not using the custom embed URL from the environment variable. Despite updating the environment variable JSON to use the GCC-specific URL (https://app.powerbigov.us/reportEmbed), the system continued to use the default commercial URL (https://app.powerbi.com), causing report loading failures.

**Root Cause:**
The Power BI embed functionality was hardcoded to use the commercial Power BI URL and wasn't properly reading the custom embed URL from the environment variable configuration, particularly affecting GCC and other sovereign cloud deployments.

**Solution Steps:**

1. **Environment Variable Configuration:**

   - Update the "Conversation KPIs Report" environment variable with correct JSON format
   - For GCC: Use `"embedUrl":"https://app.powerbigov.us/reportEmbed"`
   - For Commercial: Use `"embedUrl":"https://app.powerbi.com/reportEmbed"`
   - JSON Format: `{ "group": { "id":"<WorkspaceGUID>", "name":"<Workspace Name>" }, "component": { "id":"<ReportGUID>", "name":"<ReportName>", "type":"Report", "embedUrl":"<CorrectEmbedURL>" } }`

2. **Follow Complete Setup Instructions:**

   - Follow all steps in: https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/INSTALLATION_INSTRUCTIONS.md#configure-the-embedded-conversation-kpi-dashboard
   - Download latest Conversation KPI.pbit from release assets
   - Use Dataverse URL of environment where Copilot Studio Kit is installed (not where copilots are located)

3. **Data Population Prerequisites:**

   - Configure agent for Conversation KPIs following: https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/CONFIGURE_COPILOTS.md#configure-a-new-agent-for-conversation-kpis
   - Ensure production environment (transcripts only generated there)
   - Wait at least 1 hour for transcript generation
   - Allow 8-10 hours for KPI processing and dashboard population

4. **Troubleshooting Steps:**

   - Verify Agent Configuration records are created
   - Check Conversation Transcript table for data
   - Verify scheduled flows for KPI generation are enabled
   - Use "Generate KPI" manual option if needed
   - Check that embed URL matches your cloud environment

5. **Environment Considerations:**
   - GCC: Use powerbigov.us endpoints
   - Commercial: Use powerbi.com endpoints
   - Ensure consistent cloud environment across all components
   - Validate workspace and report GUIDs are correct for target environment

**Expected Outcome:**
Embedded Power BI reports work correctly in GCC and other sovereign cloud environments using the proper embed URLs specified in environment variables.

**Automated Response Pattern:**
_"For GCC environments, ensure the environment variable JSON includes the correct embed URL: 'https://app.powerbigov.us/reportEmbed'. Follow the complete setup instructions and ensure agent configuration is correct. Transcripts are only generated in production environments."_

---

### [Issue #92 - Links to PowerAutomate on Workflow Details (Agent Test Run form) assume US Commercial](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/92)

**Problem:**
On the Agent Test Run form, after cloud flows executed for App Insights enrichment and other processes, the workflow detail links pointed to the US Commercial Power Automate URL (https://make.powerautomate.com). This caused accessibility issues for users in GCC and other sovereign cloud environments where different URLs are required.

**Root Cause:**
The workflow detail links were hardcoded to use the US Commercial Power Automate URL without considering different cloud environments. The system didn't dynamically determine the correct Power Automate URL based on the Dataverse instance or environment configuration.

**Solution Steps:**

1. **Update to Latest Release:**

   - The issue has been fixed in recent releases
   - Install latest version from GitHub: https://aka.ms/DownloadCopilotStudioKit
   - Or install from AppSource for the most current version
   - Latest releases dynamically determine correct cloud environment URLs

2. **Environment Detection:**

   - System now automatically detects cloud environment from Dataverse URL
   - GCC environments (crm9.dynamics.com) use appropriate GCC Power Automate URLs
   - Commercial environments use standard make.powerautomate.com URLs
   - Other sovereign clouds use their respective endpoints

3. **Configuration Validation:**

   - Verify environment variables point to correct cloud instance
   - Ensure consistent cloud environment across all components
   - Test workflow detail links after upgrade to confirm proper URLs
   - Validate access to Power Automate flows from test run interface

4. **Multi-Cloud Support:**

   - System now supports US Commercial, GCC, and other sovereign clouds
   - Links automatically adapt based on environment detection
   - No manual configuration needed for URL determination
   - Consistent experience across different cloud deployments

5. **Testing and Validation:**
   - Run test scenarios to verify correct Power Automate URL generation
   - Confirm workflow detail links open in correct cloud environment
   - Validate end-to-end flow access from Agent Test Run forms
   - Test across different user roles and cloud environments

**Expected Outcome:**
Workflow detail links on Agent Test Run forms automatically use the correct Power Automate URLs for the respective cloud environment, enabling proper access for GCC and other sovereign cloud users.

**Automated Response Pattern:**
_"This multi-cloud URL issue has been fixed in recent releases. Update to the latest Copilot Studio Kit version, which automatically detects your cloud environment and uses the appropriate Power Automate URLs for workflow detail links."_

---

### [Issue #91 - Long Lasting Responses not Captured Correctly - Configurable Delay?](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/91)

**Problem:**
When testing copilots with topics that take a long time to generate responses, the test automation was not capturing results correctly. Tests would appear successful but secretly had errors because the default 10-second delay before fetching responses was insufficient for longer-running copilot operations, causing test failures and missing results.

**Root Cause:**
The "Delay before fetching responses" setting in the test automation flow was hardcoded to 10 seconds, which wasn't sufficient for copilots that send an initial "Please wait" message and then take extended time to generate actual responses. This timing issue caused the test framework to fetch results before the copilot finished processing.

**Solution Steps:**

1. **Update to Latest Release:**

   - Download latest version: https://aka.ms/DownloadCopilotStudioKit
   - New releases include configurable delay field on test forms
   - No longer need to modify flows directly for delay adjustments
   - Feature was restored to test form after user feedback

2. **Configure Test Delay Setting:**

   - New field available on test form: "Delay before fetching responses"
   - Set appropriate delay value (e.g., 20+ seconds for complex responses)
   - Configure per test based on expected copilot response time
   - Consider copilot complexity and knowledge source processing time

3. **Test Configuration Best Practices:**

   - For simple responses: Use default 10-second delay
   - For complex AI-generated content: Use 20-30 second delay
   - For knowledge-intensive queries: Use 30+ second delay
   - For multi-step processes: Use 40+ second delay
   - Test and adjust based on actual copilot performance

4. **Troubleshooting Failed Tests:**

   - Check "Apply to each Copilot Test" step for hidden errors
   - Verify delay setting matches copilot response time requirements
   - Monitor flow execution for timing-related issues
   - Adjust delay incrementally until tests pass consistently

5. **Legacy Workaround (If Needed):**
   - For older versions: Manually edit "Run Copilot Tests" flow
   - Increase delay in "Delay before fetching responses" action
   - Use unmanaged layer if necessary for customization
   - Upgrade to latest version for proper configurable solution

**Expected Outcome:**
Test automation correctly captures results from copilots with long response times using configurable delay settings, eliminating timing-related test failures.

**Automated Response Pattern:**
_"This timing issue has been resolved with a configurable delay field on test forms. Update to the latest release and adjust the 'Delay before fetching responses' setting based on your copilot's response time requirements (typically 20+ seconds for complex responses)."_

---

### [Issue #90 - Error: The provided 'Wait' action 'interval' value '1' 'Second' is not supported for the 'Consumption' SKU](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/90)

**Problem:**
When running the "Run Copilot Tests" flow, users encountered an error: "The provided 'Wait' action 'interval' value '1' 'Second' is not supported for the 'Consumption' SKU. The value must be between '5' seconds and '366' day(s)." This prevented test automation from functioning in environments using consumption-based Power Automate licensing.

**Root Cause:**
The flow contained a "Delay" action configured with a 1-second interval, which violates Power Automate consumption SKU limitations that require minimum 5-second delays. The consumption tier has different constraints than premium licensing tiers, causing this compatibility issue.

**Solution Steps:**

1. **Update to Latest Release:**

   - Download latest version: https://aka.ms/DownloadCopilotStudioKit
   - Recent releases have removed the problematic delay logic as part of performance improvements
   - No manual flow modification needed with latest versions
   - Fixed as part of overall flow optimization

2. **Immediate Workaround (Legacy Versions):**

   - Navigate to "Run Copilot Tests" flow in Power Automate
   - Find the "Delay" action causing the error
   - Change interval count from 1 to 5 seconds minimum
   - Update JSON: `"count": "@if(equals(coalesce(outputs('Get_Copilot_Configuration')?['body/cat_delaybetweenbatches'], 0), 0), 5, outputs('Get_Copilot_Configuration')?['body/cat_delaybetweenbatches'])"`

3. **Understanding Consumption SKU Limits:**

   - Consumption licensing has stricter timing constraints
   - Minimum delay: 5 seconds, Maximum delay: 366 days
   - Premium licenses have more flexible timing options
   - Consider license implications for flow design

4. **Performance Improvements:**

   - Latest releases removed unnecessary delay logic for better performance
   - Optimized batch processing eliminates need for artificial delays
   - More efficient test execution without timing constraints
   - Improved overall flow reliability and speed

5. **Validation Steps:**
   - Test flow execution after upgrade
   - Verify no consumption SKU errors occur
   - Confirm test automation runs successfully
   - Monitor flow performance and execution times

**Expected Outcome:**
Test automation flows run successfully in consumption SKU environments without delay-related errors, with improved performance due to optimization changes.

**Automated Response Pattern:**
_"This consumption SKU delay error has been fixed in the latest release through performance improvements that removed the problematic 1-second delay logic. Update to the newest version from https://aka.ms/DownloadCopilotStudioKit for automatic resolution."_

---

### [Issue #89 - Test Runs not running](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/89)

**Problem:**
Agent Test Runs were not executing despite showing a "Test Run has been queued" banner. Tests remained in "Not Run" status indefinitely, even after multiple hours, with no apparent errors or warnings. Users configured their agents correctly but tests never progressed beyond the queued state.

**Root Cause:**
Required Power Automate flows were not enabled/activated after solution installation. The flows needed premium licensing (Power Apps Premium) to function, and when licenses weren't available during installation or flows weren't manually enabled afterward, test automation remained non-functional.

**Solution Steps:**

1. **Verify Flow Activation Status:**

   - Navigate to Power Automate (make.powerautomate.com)
   - Check all Copilot Studio Kit flows are in "Active" state
   - Look for flows showing "Suspended" or "Off" status
   - Enable any inactive flows manually

2. **Licensing Requirements:**

   - Ensure Power Apps Premium licensing is available
   - Premium licensing required for advanced Power Automate connectors
   - Activate trial license if needed for testing
   - Verify licensing before solution import for automatic activation

3. **Key Flows to Enable:**

   - "Run Copilot Tests" - Main test execution flow
   - "Process Test Results" - Results processing
   - All related child flows and connectors
   - Verify dependencies and connection references

4. **Installation Best Practices:**

   - Have premium licensing in place before importing solution
   - Manually enable flows after installation/upgrade
   - Check flow status during troubleshooting process
   - Document flow states for future reference

5. **Troubleshooting Checklist:**
   - Confirm agent configuration is complete with valid token endpoint
   - Verify all prerequisite flows are active
   - Check connection references and authentication
   - Review flow run history for execution details
   - Test with simple scenarios first

**Expected Outcome:**
Agent Test Runs execute properly and progress from "Not Run" to completion status when all required flows are properly enabled and licensed.

**Automated Response Pattern:**
_"Test Runs not executing typically indicates inactive flows. Check that all Power Automate flows are enabled/active status and ensure Power Apps Premium licensing is available. This is a known issue requiring manual flow activation after installation."_

---

### [Issue #87 - Kit lack testing the adaptive card response when there is dynamic response using generative AI](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/87)

**Problem:**
Testing framework lacked support for adaptive cards with dynamic generative AI responses. Users needed capability to validate adaptive cards that include generative AI content with flexible comparison operators instead of exact JSON matching only.

**Root Cause:**
Adaptive card testing was limited to exact match comparison of static JSON responses. No support for AI validation, comparison operators, or dynamic content evaluation for generative AI-powered adaptive cards.

**Solution Applied:**

1. **Feature Enhancement Implementation:**

   - Added multiple comparison operators for adaptive card testing
   - Implemented AI validation capability for Attachments test type (adaptive cards)
   - Enhanced testing framework to support dynamic response validation

2. **July Release Deployment:**

   - Feature delivered in July 2025 release as requested
   - Download latest solution: https://aka.ms/DownloadCopilotStudioKit
   - Moved from Backlog to In Review to Done status

3. **Capabilities Added:**
   - Comparison operators beyond exact match
   - AI Builder integration for dynamic content evaluation
   - Support for generative AI content within adaptive cards
   - Enhanced testing flexibility for complex scenarios

**Expected Outcome:**
Adaptive card testing now supports dynamic content validation with AI evaluation and flexible comparison operators, enabling comprehensive testing of generative AI-powered adaptive cards.

**Automated Response Pattern:**
_"Adaptive card dynamic testing with generative AI is supported in the July 2025 release and later. Use the AI validation feature and comparison operators for Attachments test type. Download the latest solution from https://aka.ms/DownloadCopilotStudioKit to access enhanced adaptive card testing capabilities."_

---

### [Issue #86 - Testing with generative AI not working](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/86)

**Problem:**
Generative AI test results showing "Pending analysis with AI Builder" status indefinitely. Test received bot response but AI analysis remained stuck in pending state for multiple days despite having AI Builder credits available.

**Root Cause:**
AI Builder analysis not automatically triggered after test completion. Manual intervention required to initiate AI evaluation process for generative answer test results.

**Solution Applied:**

1. **Manual AI Builder Analysis Trigger:**

   - Navigate to Test Run record in Copilot Studio Kit
   - Click "Rerun" button → Select "Analyze with AI Builder"
   - Confirm the dialog to execute AI Builder model analysis
   - Process runs AI Builder model against all Generative Answers test results for that Test Run

2. **Prerequisites Verification:**

   - Confirm AI Builder credits are available in the tenant
   - Ensure proper AI Builder licensing is configured
   - Verify environment supports AI Builder functionality

3. **Expected Behavior:**
   - AI analysis should complete within reasonable time after manual trigger
   - Test results update from "Pending analysis" to completed status with evaluation

**Expected Outcome:**
AI Builder analysis completes successfully, providing evaluation results for generative AI responses instead of remaining in pending status indefinitely.

**Automated Response Pattern:**
_"Generative AI testing showing 'Pending analysis with AI Builder' requires manual trigger. Navigate to Test Run → Rerun → Analyze with AI Builder to initiate the analysis. Ensure AI Builder credits are available and try the manual analysis trigger."_

---

### [Issue #85 - Response Is Not Evaluating When Testing With Generative AI Configuration](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/85)

**Problem:**
Generative answer test results showing 'Unknown' evaluation status instead of proper pass/fail assessment. User discovered additional bug where Kit doesn't provide responses when content includes words like "signin" due to Filter Array step exclusion.

**Root Cause:**
Two issues identified: 1) Configuration problem with generative AI evaluation setup, 2) Flow logic bug in "Run Copilot Tests" that contains Filter Array step excluding responses when Copilot output includes the word "signin."

**Solution Applied:**

1. **User Self-Resolution:**

   - User figured out the configuration issue independently
   - Proper generative AI evaluation configuration resolved Unknown status

2. **Bug Discovery and Reporting:**

   - Identified Filter Array logic in "Run Copilot Tests" flow that incorrectly excludes responses containing "signin"
   - This causes tests to fail when legitimate responses include authentication-related terms
   - Bug reported to development team for future fixes

3. **Configuration Verification:**
   - Ensure proper generative AI test configuration setup
   - Verify AI Builder credits and evaluation settings
   - Check for flow filtering logic that might exclude valid responses

**Expected Outcome:**
Generative AI evaluation provides proper pass/fail assessment instead of Unknown status. Responses containing authentication terms process correctly without Filter Array exclusion.

**Automated Response Pattern:**
_"Unknown evaluation in generative AI testing often indicates configuration issues. Verify AI Builder setup and check that Filter Array steps in 'Run Copilot Tests' flow aren't excluding valid responses containing authentication terms like 'signin'. This is a known bug affecting responses with certain keywords."_

---

### [Issue #84 - Copilot tests are getting error out](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/84)

**Problem:**
Two specific test failures: 1) Tests erroring out despite receiving correct responses from Direct Line APIs, 2) Tests failing whenever user queries contain double quotes in the input text.

**Root Cause:**
Bug in test execution logic that doesn't properly handle special characters (double quotes) and fails to process successful Direct Line API responses correctly in certain scenarios.

**Solution Applied:**
**December 2024 Release Fix:**

- Development team identified and resolved both issues
- Fixed double quote handling in test input processing
- Resolved Direct Line API response parsing that caused false test failures
- **Available in December 2024 release:** https://aka.ms/DownloadCopilotStudioKit

**Key Changes:**

1. **Special Character Handling:** Improved parsing of user queries containing double quotes
2. **Response Processing:** Fixed Direct Line API response evaluation logic
3. **Test Reliability:** Enhanced overall test execution stability

**Expected Outcome:**
Tests execute successfully with user queries containing double quotes and properly evaluate Direct Line API responses without false failures.

**Automated Response Pattern:**
_"Test failures with double quotes or false negatives despite correct Direct Line responses were fixed in the December 2024 release. Update to the latest solution from https://aka.ms/DownloadCopilotStudioKit to resolve these test execution issues."_

---

### [Issue #83 - Prompt Advisor](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/83)

**Problem:**
Feature request for Prompt Advisor functionality to help users optimize and enhance AI prompts through evaluation, scoring, and rewriting techniques. Users needed guided assistance for creating effective prompts using various methodologies.

**Root Cause:**
Gap in toolkit capabilities - no integrated prompt optimization and evaluation system to help users create high-quality AI interactions with structured improvement methods.

**Solution Applied:**
**December 2024 Feature Implementation:**

1. **Complete Prompt Advisor System Delivered:**

   - Evaluation and scoring system with criteria for clarity, relevance, creativity, accuracy, and coherence
   - Weighted scoring with detailed reasoning explanations
   - Multiple prompt techniques: Zero-Shot, Few-Shot, Chain-of-Thought prompting
   - Iterative improvement capabilities with constraints and goals

2. **Prerequisites and Setup:**

   - **Required:** Power Apps Component Framework feature enabled in environment
   - Setup documentation: https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/PROMPT_ADVISOR.md
   - Enable PCF feature: https://learn.microsoft.com/en-us/power-apps/developer/component-framework/component-framework-for-canvas-apps#enable-the-power-apps-component-framework-feature

3. **Key Features Delivered:**

   - Structured prompt evaluation with scoring breakdown
   - Multiple rewriting techniques and optimization suggestions
   - Integration with Copilot Studio for direct deployment
   - Context-aware prompt enhancement for business scenarios

4. **Troubleshooting Resolution:**
   - Initial "Analyze" button issues resolved by enabling Power Apps Component Framework
   - First-time API load delays addressed in user guidance
   - Prerequisites documentation updated based on user feedback

**Expected Outcome:**
Users can effectively evaluate, score, and optimize AI prompts using structured methodologies, then deploy optimized prompts directly in Copilot Studio for enhanced agent performance.

**Automated Response Pattern:**
_"Prompt Advisor is available in December 2024 release and later. Ensure Power Apps Component Framework is enabled in your environment before installation. Follow setup guide at https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/PROMPT_ADVISOR.md for complete configuration steps."_

---

### [Issue #65 - Adaptive Card Validation Not Working](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/65)

**Problem:**
Attachment type tests for adaptive card validation returning "Error" results with "No response" as bot response, despite bot working correctly in Copilot Studio and demo site. Response Match and Topic Match tests work properly with same bot.

**Root Cause:**
Issue with adaptive card message extraction and response handling in test framework. Bot sends adaptive cards correctly but testing framework fails to capture adaptive card responses properly for attachment validation.

**Solution Applied:**

1. **Troubleshooting Questions Posed:**

   - Verify bot returns correct responses in Copilot Studio and demo site (confirmed working)
   - Check if Response Match and Topic Match tests work (confirmed working)
   - Confirm bot is published after changes (confirmed published)

2. **Deep Analysis Required:**

   - Check for multiple messages before adaptive card response
   - Examine Attachment field in Result record for data capture
   - Review test configuration for proper attachment handling

3. **Issue Status:**
   - Closed due to no user response for requested debugging information
   - Similar pattern to other adaptive card issues requiring investigation
   - User reported text messages before adaptive cards get captured properly

**Expected Outcome:**
Adaptive card validation should capture bot responses correctly for attachment type tests, matching the success seen with Response Match and Topic Match test types.

**Automated Response Pattern:**
_"Adaptive Card validation issues often relate to message extraction problems. Verify bot works in Copilot Studio test, check if Response Match tests work, ensure bot is published, and examine the Result record's Attachment field. Multiple messages before adaptive cards can interfere with proper response capture."_

---

### [Issue #64 - Tests are not running](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/64)

**Problem:**
Tests created in Kit not running automatically with no history in "Run Copilot Tests" cloud flow. Multiple users reported same issue with both authenticated and non-authenticated test scenarios.

**Root Cause:**
Multiple potential causes: 1) Cloud flows not enabled, 2) Connection authorization failures preventing flow activation, 3) Permission issues with Dataverse connections despite user being flow co-owner.

**Solution Applied:**

1. **Flow Enablement Check:**

   - Verify all required cloud flows are enabled and active
   - Focus on "Run Copilot Tests" and related automation flows
   - Check flow status after solution installation

2. **Connection Authorization Issues Identified:**

   - Error: "ConnectionAuthorizationFailed" with Dataverse connection access denied
   - User reported forbidden access despite being co-owner of flows
   - Connection permissions not properly granted during installation

3. **Troubleshooting Steps:**

   - Confirm cloud flows are enabled in solution
   - Check connection permissions and authentication
   - Verify Power Automate licensing (P2 Viral license noted)
   - Review flow co-ownership vs connection access rights

4. **Issue Resolution:**
   - Closed due to no user response for additional troubleshooting
   - Related to Issue #89 (Test Runs not running) with similar patterns
   - Indicates common flow activation and connection permission problems

**Expected Outcome:**
Tests execute automatically with successful cloud flow runs and proper connection authentication for all users regardless of authentication type.

**Automated Response Pattern:**
_"Tests not running typically indicates cloud flow activation issues. Verify all flows are enabled, check for ConnectionAuthorizationFailed errors, and ensure proper Dataverse connection permissions. Even flow co-owners may lack connection access rights after installation."_

---

### [Issue #60 - Error using Application Insights - Could not load file or assembly](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/60)

**Problem:**
Application Insights integration failing with assembly loading error: "Could not load file or assembly 'Microsoft.Identity.Client, Version=4.16.1.0'" causing GenerateAppInsightsAccessToken action to fail during test execution.

**Root Cause:**
Version conflict in Microsoft.Identity.Client assembly dependencies within managed solution package. Assembly manifest definition does not match assembly reference, indicating dependency version mismatch in the Copilot Studio Kit solution.

**Solution Applied:**

1. **Issue Reproduction and Resolution:**

   - Development team reproduced issue using provided solution file
   - Identified assembly dependency version conflict in managed solution
   - **Fix delivered in November 2024 release** (first week of November)

2. **Immediate Workaround:**

   - Use latest managed solution download from official releases
   - Avoid using unmanaged version which may have dependency conflicts
   - Update to November 2024 or later release for permanent resolution

3. **Solution Details:**
   - User provided CopilotStudioAccelerator_20240918.1_managed.zip for troubleshooting
   - Team confirmed fix addresses Microsoft.Identity.Client assembly loading issue
   - Resolution included updated dependency management in solution packaging

**Expected Outcome:**
Application Insights integration works properly without assembly loading errors, enabling successful test execution with App Insights access token generation.

**Automated Response Pattern:**
_"Application Insights assembly loading errors were fixed in November 2024 release. Download the latest managed solution from official releases. If using older versions, update to November 2024 or later release to resolve Microsoft.Identity.Client dependency conflicts."_

---

### [Issue #59 - Getting error while running test cases "Error code: IntegratedAuthenticationNotSupportedInChannel"](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/59)

**Problem:**
Test cases failing with "IntegratedAuthenticationNotSupportedInChannel" error despite using "No Authentication" configuration and disabled Web Channel security. User configured with Mobile app channel token endpoint.

**Root Cause:**
Authentication configuration mismatch or channel setup issue. Despite "No Authentication" being selected, the error suggests integrated authentication is being attempted or channel configuration is incompatible.

**Solution Applied:**

1. **Configuration Verification Steps:**

   - Confirm "No Authentication" is properly set and bot is published
   - Verify Web Channel Security is disabled (confirmed by user screenshots)
   - Check Mobile app channel token endpoint configuration
   - Test bot functionality in demo website to confirm basic operation

2. **Troubleshooting Process:**

   - Team confirmed configuration looks correct based on provided screenshots
   - Requested verification of bot functionality in Copilot Studio demo site
   - Suggested testing with sample bot to isolate configuration vs environment issues
   - Multiple follow-up requests for additional troubleshooting information

3. **Issue Resolution:**
   - Closed due to no user response for additional troubleshooting steps
   - Configuration appeared correct but authentication channel mismatch persisted
   - May require deeper investigation of channel-specific authentication settings

**Expected Outcome:**
Tests execute successfully with No Authentication configuration without integrated authentication channel errors.

**Automated Response Pattern:**
_"IntegratedAuthenticationNotSupportedInChannel error with No Authentication suggests channel configuration issues. Verify bot works in demo site, ensure No Authentication is published, check token endpoint source, and test with new sample bot to isolate the problem."_

---

### [Issue #58 - Test tool should capture all responses to the test utterance, not just the last one](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/58)

**Problem:**
Testing framework only captures the last message in multi-message bot responses, causing test failures when bot sends multiple sequential text responses to a single utterance. User needs to test compound response scenarios.

**Root Cause:**
Test framework limitation where only the final message in a conversation sequence is captured and evaluated, ignoring earlier messages in multi-part responses from the same topic or intent.

**Solution Applied:**

1. **September Release Enhancement:**

   - Implemented "Authenticate with Microsoft" support
   - Added "Actual Complete Response" visibility on result records
   - Introduced "Expected Position of the Response Message" parameter for testing specific messages within agent responses

2. **Current Testing Approach:**

   - Create multiple test cases to test each message in multi-part responses
   - Use Expected Position parameter to target specific message positions
   - Leverage Complete Response view to understand full conversation flow

3. **Feature Status:**

   - Enhancement request acknowledged and partially addressed
   - Multi-message capture remains complex due to varied message types (text, citations, adaptive cards, suggested actions)
   - Currently requires separate test cases for each expected message position

4. **Workaround for Multi-Message Testing:**
   - Design separate test cases for each message in sequence
   - Use position-based testing with Expected Position parameter
   - Review Actual Complete Response for comprehensive validation

**Expected Outcome:**
Ability to test multi-message bot responses either through complete response capture or structured position-based testing approach.

**Automated Response Pattern:**
_"Multi-message bot responses require separate test cases for each message. Use the September release 'Expected Position of the Response Message' parameter and 'Actual Complete Response' view to test specific messages within compound responses. Create individual tests for each expected message position."_

---

### [Issue #50 - How can you export all configuration and test data?](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/50)

**Problem:**
User needs to export and backup all configuration and test data from Copilot Studio Kit for migration or backup purposes. Solution export doesn't include instance data like copilot configurations, insights settings, or Dataverse test data.

**Root Cause:**
Standard solution export only includes metadata and schema, not instance data. User needed guidance on proper data export mechanisms within Power Platform for configuration and test data backup.

**Solution Applied:**

1. **Excel Export Functionality:**

   - Use standard Power Apps export to Excel feature
   - Navigate to Data tab in Copilot Studio Kit
   - Export "Agent Configuration" (formerly "Copilot Configuration") table
   - This table contains all configuration data including App Insights and Dataverse settings

2. **Complete Data Export Process:**

   - **Agent Configuration table:** Contains all copilot settings, App Insights config, Dataverse connections
   - **Test data tables:** Export test sets, test cases, and results separately
   - **Excel export:** Use Data tab export functionality for complete column coverage
   - **Documentation reference:** https://learn.microsoft.com/en-us/power-apps/user/export-excel-static-worksheet

3. **Export Verification:**
   - Data tab shows all rows and columns for complete export
   - Agent Configuration table includes comprehensive settings data
   - User confirmed Data tab export captures all necessary configuration elements
   - Multiple tables may need separate exports for complete backup

**Expected Outcome:**
Complete backup and migration capability for all Copilot Studio Kit configuration and test data using standard Power Apps export functionality.

**Automated Response Pattern:**
_"Export configuration and test data using Power Apps Excel export feature. Navigate to Data tab, export 'Agent Configuration' table for all settings including App Insights and Dataverse configs. Use standard platform export functionality: https://learn.microsoft.com/en-us/power-apps/user/export-excel-static-worksheet"_

---

### [Issue #40 - Feedback: Specify measure metrics for time delay in Copilot configuration](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/40)

**Problem:**
User feedback requesting clear measurement unit indicators (minutes/seconds) for time delay fields in Copilot configuration. Unclear what units to use for "Delay for Azure Application Insights Enrichment" and "Delay for Conversation Transcripts Enrichment" fields.

**Root Cause:**
UI usability issue where time delay configuration fields lacked clear unit indicators, causing user confusion about whether values should be entered in seconds, minutes, or other time units.

**Solution Applied:**

1. **Initial Assessment:**

   - Team noted indicators were present in field descriptions but not visible enough
   - User reported not seeing measurement indicators when creating Copilot definitions
   - UI clarity improvement needed for better user experience

2. **Design Decision and Implementation:**

   - **Solution:** Remove time delay fields completely from UI
   - **Backend handling:** Move timing logic to backend processing for automatic management
   - **User benefit:** Eliminates confusion about timing units and manual configuration errors

3. **Development Timeline:**
   - **August 27:** Decision made to remove fields and handle backend
   - **August 29:** Fix implemented in development
   - **September 5:** Changes deployed in latest solution release
   - **User notification:** Directed to download latest solution for updated interface

**Expected Outcome:**
Automatic time delay handling eliminates user confusion about measurement units, with backend optimization providing better performance without manual timing configuration.

**Automated Response Pattern:**
_"Time delay configuration fields were removed from UI and automated in backend for better performance. Download the latest solution release to get the updated interface with automatic timing optimization. No manual delay configuration needed anymore."_

---

### [Issue #90: No Token to Access Facebook Connector](https://github.com/microsoft/PowerPlatformConnectors/issues/90)

**Problem:** Facebook Custom Connector fails with OAuth token access error when posting to groups or pages

**Root Cause:** Missing "Get my Access Token" option in the connector configuration and insufficient OAuth permissions for Facebook API operations requiring specific permission scopes

**Solution:** Configure proper Facebook connector authentication and permissions:

- Add "Get my Access Token" functionality to connector configuration
- Ensure proper OAuth permissions are configured for target operations
- For posting to groups: requires app installation in group + publish_to_groups permission with user token OR manage_pages + publish_pages permission with page token
- For posting to pages: requires manage_pages + publish_pages permissions as admin with sufficient administrative permissions
- Verify Facebook app configuration includes required permission scopes

**Expected Outcome:** Facebook connector successfully authenticates and can post to groups/pages with proper token access

**Automated Response Pattern:** When users report Facebook connector OAuth token access errors, guide them to configure "Get my Access Token" functionality and verify their Facebook app has the required permissions (publish_to_groups for groups, manage_pages + publish_pages for pages) with proper administrative access.

---

### [Issue #30: Persist Login with Token or Similar](https://github.com/microsoft/PowerPlatformConnectors/issues/30)

**Problem:** `paconn` CLI tool requires frequent re-authentication (approximately every hour), disrupting development flow and preventing CI/CD automation for connectors

**Root Cause:** CLI tool doesn't support persistent authentication tokens or Azure Active Directory integration, requiring interactive login sessions that expire quickly

**Solution:** Implement Azure Active Directory support and persistent authentication:

- Enable Azure Active Directory authentication in paconn CLI
- Add support for service principal authentication for CI/CD scenarios
- Implement token refresh capabilities to maintain persistent sessions
- Add authentication configuration options for automated deployment scenarios

**Expected Outcome:** Developers can maintain persistent authentication sessions and implement CI/CD pipelines for connector deployment without frequent manual re-authentication

**Automated Response Pattern:** When users report frequent paconn CLI login requirements, explain this is a known limitation where the CLI requires hourly re-authentication. Microsoft has noted this enhancement request for Azure AD support and persistent tokens to enable CI/CD scenarios, but no ETA is available. Consider implementing service principal authentication when that feature becomes available.

---

_This document continues the comprehensive issue documentation to build complete coverage for automated GitHub response capability._
