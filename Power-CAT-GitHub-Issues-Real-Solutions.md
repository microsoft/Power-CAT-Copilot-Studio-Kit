# Power CAT Copilot Studio Kit - GitHub Issues & Solutions

## Individual Issue Analysis

Based on actual GitHub issue threads and resolutions from the Microsoft Power CAT Copilot Studio Kit repository.

---

### [Issue #312 - MS Authentication - Failed to authenticate for Agent SDK access](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/312)

**Problem:**
User encountered authentication error: "interaction_in_progress: Interaction is currently in progress. Please ensure that this interaction has been completed before calling an interactive API" after misconfiguring SPN and then fixing the configuration.

**Root Cause:**
Microsoft Authentication Library (MSAL) detecting concurrent authentication processes. This occurs when:

- Multiple simultaneous authentication calls are initiated while another authentication process is already in progress
- A previous authentication session did not complete properly, leaving the authentication state incomplete
- Multiple application components attempting to authenticate simultaneously without proper coordination

**Solution Applied:**
The issue was resolved by clearing browser state and eliminating multiple instances:

1. **Clear Browser State:**

   - Clear all cookies and local storage for the application domain
   - Clear session storage
   - Close all browser tabs containing the application
   - Restart the browser completely

2. **Eliminate Multiple Instances:**
   - Ensure only one instance of the application is running
   - Close any duplicate browser tabs or windows
   - Verify the application is not running in multiple browser sessions

**Outcome:** User confirmed "That worked, I'm connected up 😀 Thank you!" - Issue resolved successfully.

---

### [Issue #314 - Conversation KPI Report on Refresh Error](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/314)

**Problem:**
Power BI report refresh failing with error: "Column 'Component ID' in Table 'Components' contains blank values and this is not allowed for columns on the one side of a many-to-one relationship or for columns that are used as the primary key of a table."

**Root Cause:**
Blank Component ID values in the Components table causing Power BI relationship issues during refresh operations.

**Solution Applied:**
Updated Power BI template provided by the development team:

1. **Download Updated Template:**

   - New Conversation KPI.zip template provided with fix for blank Component ID handling
   - Template includes proper data validation and relationship management

2. **Installation Steps:**
   - Follow updated installation instructions for the embedded Conversation KPI Dashboard
   - Use the corrected template to replace existing Power BI report

**Outcome:** User confirmed "Issue resolved. The new Conversation KPI Power BI report template is working!" - Issue resolved successfully.

---

### [Issue #333 - Bulk import Test Sets + Agent Tests under the same table](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/333)

**Problem:**
User able to bulk import Test Sets but individual Agent Tests within those Test Sets aren't being imported together. Looking for streamlined way to import both Test Sets and Agent Tests in the same operation.

**Root Cause:**
Current bulk import process handles Test Sets and Agent Tests separately, not in unified operation.

**Solution Applied:**
Directed to use existing Excel-based bulk import process:

1. **Use Excel Bulk Import Process:**

   - Follow documentation: CONFIGURE_TESTS.md#use-excel-to-bulk-create-or-update-tests
   - Process supports both Test Sets and Agent Tests creation/updates via Excel templates

2. **Current Workaround:**
   - Bulk import covers both layers (Test Sets and Agent Tests) when using proper Excel template format
   - Documentation provides guidance on Excel template structure for unified import

**Outcome:** Issue closed as completed with reference to existing Excel bulk import functionality.

---

### [Issue #337 - Conversation KPIs Power BI](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/337)

**Problem:**
User asking if Power BI report in September 2025 release had any changes requiring redeployment, as reports appear visually the same.

**Root Cause:**
User uncertainty about whether to redeploy existing Power BI reports after September 2025 release.

**Solution Applied:**
Clear guidance provided by development team:

**Answer:** No functional changes within September 2025 release report. Users can ignore redeployment if already imported earlier version.

**Outcome:** Issue resolved - no action needed for existing Power BI deployments from September 2025 release.

---

### [Issue #330 - Issue while using Setup Wizard](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/330)

**Problem:**
User unable to setup connection references in Setup Wizard.

**Root Cause:**
Connection reference configuration issues during setup wizard process.

**Solution Applied:**
Same resolution pattern as Issue #312 - MSAL authentication clearing:

1. **Clear Browser State:**

   - Clear all cookies and local storage for the application domain
   - Clear session storage
   - Close all browser tabs containing the application
   - Restart the browser completely

2. **Eliminate Multiple Instances:**
   - Ensure only one instance of the application is running
   - Close any duplicate browser tabs or windows
   - Verify the application is not running in multiple browser sessions

**Outcome:** Issue closed as not planned (likely resolved with browser clearing steps).

---

### [Issue #329 - Test configurations should be retained](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/329)

**Problem:**
Test result displays are showing updated configuration even when viewing results from previous test runs. Expected behavior is that test results should reflect the configuration that was active at the time of execution, not current configuration.

**Steps to Reproduce:**

1. Create a test set and add a test case
2. Execute the test case
3. View the test result immediately after execution and take screenshot
4. Modify the test case
5. Revisit the test result from the earlier run
6. Compare - result now shows updated configuration instead of original

**Root Cause:**
Test results are dynamically referencing current test configuration instead of storing snapshot of configuration used during actual test execution.

**Solution Applied:**
Issue was referenced to similar closed issue #312 for authentication-related clearing steps, but core issue appears to be a design/feature request for test result configuration retention.

**Outcome:** Issue closed as not planned - appears to be feature request rather than bug fix.

---

### [Issue #296 - Error GenAIToolPlannerRateLimitReached](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/296)

**Problem:**
Users getting "GenAIToolPlannerRateLimitReached" error when executing tests, wondering if this relates to Dataverse environment quotas and how to monitor request usage.

**Root Cause:**
Usage limit for generative orchestration has been reached in the Copilot Studio environment. This indicates that the Dataverse environment has exceeded its allocated quota for AI-powered operations.

**Solution Applied:**

1. Confirmed this relates to Dataverse environment quota limits for AI operations
2. Provided official Microsoft Learn documentation reference for detailed resolution
3. Directed user to monitor current usage and quotas in their environment
4. Suggested capacity upgrades or waiting for quota reset as needed

**Reference:** https://learn.microsoft.com/en-us/microsoft-copilot-studio/error-codes?tabs=webApp#genaitoolplannerratelimitreached

**Outcome:** Issue resolved by providing comprehensive documentation and explanation of quota management.

---

### [Issue #280 - Where to find Custom API source Code?](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/280)

**Problem:**
User seeking source code for custom APIs used in Agent Inventory to understand how data collection and aggregation works, especially the C# plugin logic, for building additional governance processes.

**Root Cause:**
User needed deeper understanding of Agent Inventory data collection mechanisms and licensing requirements to extend the toolkit with custom governance solutions.

**Solution Applied:**

1. Directed user to the comprehensive Agent Inventory Data Source documentation
2. Provided link to detailed documentation: https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/AGENT_INVENTORY_DATA_SOURCE.md
3. Explained that this document covers all data collection mechanisms and C# plugin functionality
4. Confirmed this would enable building additional extensions and governance processes

**Outcome:** Issue successfully resolved with comprehensive documentation reference that provided all needed technical details.

---

### [Issue #273 - Error when running: RetrieveUserContext..This operation failed](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/273)

**Problem:**
User encountering Error Code -2147093999 when clicking play button, with "RetrieveUserContext: This operation failed because we couldn't connect to the server" message and UciError details.

**Root Cause:**
Connectivity issues between Power Apps client and server, potentially caused by network interruptions, authentication state problems, or browser-related issues.

**Solution Applied:**
Provided comprehensive troubleshooting steps:

1. **Developer Tools Analysis**: Check Network tab in F12 for failed requests and error details
2. **Browser State Reset**: Clear cache/cookies and re-login to Power Apps completely
3. **Session Refresh**: Full logout → browser close → login → re-publish → retry
4. **Network Verification**: Confirm stable connection and check firewall restrictions
5. **Browser Testing**: Try different browser or incognito mode to isolate extension conflicts
6. **Server Connectivity**: Complete session reset to resolve server connection state

**Outcome:** Standard connectivity troubleshooting provided and issue marked resolved.

---

### [Issue #271 - Install Blocker - Setup Wizard Data Connection Issue](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/271)

**Problem:**
Setup Wizard encountering connection issues when trying to create new connections for Dataverse, Power Platform Admins, and SharePoint. Error shows "ServiceToServiceEnvironmentNotFound" with specific environment ID not found message.

**Root Cause:**
Environment configuration issues combined with potential browser state problems. The specific error indicates the system cannot locate the referenced environment ID in the tenant, suggesting authentication or environment permission issues.

**Solution Applied:**

1. **Clear Browser State**: Clear browser cache and cookies completely, then re-login
2. **Re-publish Process**: After clearing cache → re-login → publish all customizations → reopen app
3. **Full Reinstall**: If issues persist, reinstall application from App Source
4. **Environment Verification**: Confirm proper environment access and permissions
5. **Connection Reset**: Create fresh connections after browser state reset

**Outcome:** Standard troubleshooting steps provided for setup wizard connection issues.

---

### [Issue #266 - Test run working until a few days ago](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/266)

**Problem:**
Tests suddenly stopped running in early August despite unchanged configuration (Token ID, Agent Configuration, Test Sets all same as before). Re-run attempts failing consistently.

**Root Cause:**
Required flows were turned OFF, specifically the "Test Automation | Run Agent Tests Flow" and related automation flows. Additionally, missing Power Platform Pipelines dependency preventing some flows from activating.

**Solution Applied:**

1. **Flow Status Check**: Navigate to Home → Setup Wizard to verify flow status
2. **Flow Activation**: Turn ON all required test automation flows that were disabled
3. **Dependency Installation**: Install Power Platform Pipelines for pipeline-dependent flows
4. **Documentation Reference**: Provided link to automated testing documentation
5. **Verification**: Confirm successful test runs after flow activation

**Outcome:** Issue resolved successfully after activating required flows and installing dependencies.

---

### [Issue #260 - No Records Showing in Conversation KPIs Dashboard Despite Cross-Environment Data Sync Setup](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/260)

**Problem:**
Conversation KPIs dashboard showing no data despite proper workspace ID/report ID configuration, successful KPI flows, and Power BI dataset refreshes. Empty Conversation KPI table in target environment with cross-environment agent setup.

**Root Cause:**
Environment type limitations and configuration requirements for conversation transcripts. Transcripts are not written for Microsoft Dataverse for Teams, developer environments, or Microsoft 365 Copilot agents. Additionally, improper agent configuration for KPI collection.

**Solution Applied:**

1. **Environment Type Verification**: Confirm environment is Sandbox or Production (not Teams/Developer/M365)
2. **Power BI Refresh Process**: Open report in Power BI Desktop → refresh data → republish to correct workspace
3. **Configuration Documentation**: Reference comprehensive agent configuration guide
4. **Agent Setup**: Follow "Configure a new agent for conversation KPIs" documentation steps
5. **Office Hours Support**: Directed to scheduled office hours for one-on-one troubleshooting

**Reference:** https://learn.microsoft.com/en-us/microsoft-copilot-studio/analytics-transcripts-powerapps
**Documentation:** https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/CONFIGURE_COPILOTS.md#configure-a-new-agent-for-conversation-kpis

**Outcome:** Comprehensive explanation provided with environment limitations and proper configuration steps.

---

### [Issue #254 - Feature Request: Agent Message Consumption & Allocation - Agent Inventory or Standalone pbix](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/254)

**Problem:**
Feature request for adding message consumption and allocation details to Agent Inventory or standalone Power BI report. User wanted detailed breakdown of message usage by knowledge, tools, generative answers per agent for better consumption management.

**Root Cause:**
Missing visibility into agent message consumption patterns and allocation management across environments and agents.

**Solution Applied:**
Feature implemented in September release - message consumption information added to Agent Inventory as requested.

**Outcome:** Feature request fulfilled - message consumption reporting now available in Agent Inventory.

---

### [Issue #252 - Add active session in the agent inventory view + with how many people this agent is shared with](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/252)

**Problem:**
Feature request for adding agent usage statistics (weekly/monthly sessions like in PPAC) and sharing information (number of people/security groups) to Agent Inventory view to consolidate information in one location.

**Root Cause:**
Users having to navigate between multiple interfaces (Copilot Studio Kit and PPAC) to get complete agent usage and sharing visibility.

**Solution Applied:**
Feature request logged and assigned to development team for future enhancement consideration.

**Outcome:** Enhancement request under consideration for future releases.

---

### [Issue #251 - The Conversation KPIs dashboard fails to refresh data](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/251)

**Problem:**
Conversation KPIs dashboard failing to refresh with error in Components data source. Components missing Component ID (botcomponentid) causing duplicate removal to fail and leaving only one agent visible despite multiple configured agents.

**Root Cause:**
Multiple issues: 1) Incorrect Bot ID configuration in Agent setup (using Metadata ID instead of Session Details Copilot ID), 2) Power Automate premium license missing causing pagination limits (75,000 rows failing, needed reduction to 5,000 rows).

**Solution Applied:**

1. **Correct Bot ID Configuration**: Use Settings → Session Details → Copilot Studio Details → Copilot ID (not Advanced → Metadata ID)
2. **Environment Type Verification**: Confirm Production/Sandbox environment (not Teams/Developer/M365)
3. **License Resolution**: Upgrade account running flows to Power Automate Premium or reduce pagination size from 75,000 to 5,000 rows
4. **Flow Processing**: Fixed agent transcript processing after correct Bot ID and pagination adjustments
5. **Office Hours Support**: Complex issue resolved through live troubleshooting session

**Reference:** https://learn.microsoft.com/en-us/microsoft-copilot-studio/analytics-transcripts-powerapps

**Outcome:** Successfully resolved through Bot ID correction and Power Automate license/pagination adjustments.

---

### [Issue #250 - The Flow "Global | Get Current Dataverse Url" fails to run](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/250)

**Problem:**
Flow "Global | Get Current Dataverse Url" failing because @odata.id property not available in List Model-driven Apps task output. The uriHost function cannot access the required metadata property to determine Environment URL.

**Root Cause:**
Missing metadata property due to "Return Full Metadata" option not enabled in the List Model-driven Apps action. Without this setting, the @odata.id property required for URL extraction is not returned in the response.

**Solution Applied:**

1. **Immediate Fix**: In List Model-driven Apps action → Advanced parameters → set "Return Full Metadata" to "Yes"
2. **Managed Solution Editing**: For managed solution installations, edit flow through Default Solution instead of the managed solution
3. **Alternative Installation**: Import unmanaged solution for direct editing capability
4. **Future Release**: Issue scheduled for fix in upcoming release

**Workaround for Managed Solutions:**

- Navigate to Default Solution to access and edit managed flows
- Make the Return Full Metadata change in Default Solution context
- Save and publish the modified flow

**Outcome:** Successfully resolved with metadata setting change, permanent fix planned for future release.

---

### [Issue #234 - Simulate a condition from the chatbot in CSK](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/234)

**Problem:**
User needs to test chatbot behavior for time-dependent conditions (office hours escalation topic) by overriding or manually setting the time variable to simulate both in-hours and out-of-hours scenarios.

**Root Cause:**
Testing challenge for conditional logic that depends on dynamic system values (current time). Need capability to force specific variable values during test automation to validate different behavioral paths.

**Solution Applied:**

1. **Clarification Request**: Team requested details about test automation setup and agent handoff configuration
2. **Context Gathering**: Asked for specifics about current testing approach for time-dependent conditions
3. **Help Wanted**: Issue marked for community input and additional assistance
4. **No Response**: Issue closed due to lack of user response for required clarification details

**Potential Solutions (for similar future issues):**

- Configure test variables with mock time values
- Use test-specific topics with hardcoded conditions
- Implement testing flags to override system variables
- Create separate test configurations for different scenarios

**Outcome:** Issue closed without resolution due to insufficient user response for detailed guidance.

---

### [Issue #228 - Solution check issues](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/228)

**Problem:**
Large number of solution checker warnings (5228 issues) reported when running solution check on Power CAT Copilot Studio Kit, including performance, maintainability, usage, upgrade readiness, design, accessibility and security issues.

**Root Cause:**
Solution checker findings are primarily code quality and best practices recommendations rather than actual vulnerabilities. Most issues (5228) are about equality comparison patterns and supportability concerns.

**Solution Applied:**

1. **Classification**: Confirmed these are solution checker recommendations, not security vulnerabilities
2. **Prioritization**: High severity issues identified as supportability-related rather than functional problems
3. **Analysis**: Majority of issues are equality comparison code style recommendations
4. **Backlog**: Added to development backlog for future code quality improvements

**Key Clarifications:**

- These are NOT vulnerabilities or functional issues
- Findings range across: performance, maintainability, usage, upgrade readiness, design, accessibility, and security categories
- High severity issues are supportability-focused
- Normal solution checker output for complex Power Platform solutions

**Outcome:** Issue acknowledged and categorized for future code quality enhancements, no immediate action required.

---

### [Issue #226 - Feature Request - Authenticate with Microsoft Support](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/226)

**Problem:**
Feature request to support agents with "Authenticate with Microsoft" authentication method. Currently the kit only supports agents with no authentication or manual authentication due to Direct Line API limitations.

**Root Cause:**
Technical limitation of Direct Line API preventing Microsoft Authentication support for agent testing. Need to implement Direct Engine Protocol to enable this capability.

**Solution Applied:**

1. **Acknowledgment**: Feature request added to active development backlog
2. **Development Work**: Team actively worked on implementing Microsoft Authentication support
3. **Technical Implementation**: Utilized Direct Engine Protocol to overcome Direct Line API limitations
4. **Feature Release**: Microsoft Authentication support released in September release
5. **Verification**: Feature confirmed working and issue closed as completed

**Technical Details:**

- Overcame Direct Line API authentication limitations
- Implemented using Direct Engine Protocol
- Supports Microsoft authentication for comprehensive agent testing

**Outcome:** Feature successfully implemented and released in September 2024 update.

---

### [Issue #224 - Agent Inventory Process](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/224)

**Problem:**
User question about how the `cat_usesaiknowledge` field is populated in the `cat_agentdetails` table in Agent Inventory process.

**Root Cause:**
Need for clarity on data source and population mechanism for AI knowledge usage tracking in agent inventory.

**Solution Applied:**
**Technical Explanation Provided:**

- The `cat_usesaiknowledge` field is populated based on the `useModelKnowledge` property in the Configuration column of the Bot (Copilot) table
- When `useModelKnowledge` is set to `true`, then `cat_usesaiknowledge` is also set to `true`
- This property indicates whether the "Allow the AI to use its own general knowledge" option is enabled or disabled in the agent configuration

**Data Flow:**
Bot Table Configuration → useModelKnowledge property → cat_agentdetails.cat_usesaiknowledge field

**Outcome:** Technical explanation provided but closed due to no user response confirmation.

---

### [Issue #223 - Error while using Setup Wizard in Copilot Studio Kit](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/223)

**Problem:**
Setup Wizard connection references step failing to display connections dropdown, with error: "PowerAppsforMakers.GetConnections failed: { "error": { "code": "MissingEnvironmentFilter", "message": "The environment filter must be set." } }"

**Root Cause:**
Missing environment filter in the GetConnections API call within Setup Wizard, causing the connection retrieval to fail even when connections are properly configured in the default solution.

**Solution Applied:**

1. **Issue Identification**: Team quickly identified the missing environment filter error in Setup Wizard
2. **Fix Development**: Implemented fix for the environment filter requirement
3. **Release**: Fix included in next release of Copilot Studio Kit
4. **User Update**: Provided download link for latest solution with fix
5. **Verification**: Followed up to confirm resolution

**Download Link:** https://aka.ms/DownloadCopilotStudioKit

**Outcome:** Successfully resolved in the next release update, fix confirmed working.

---

### [Issue #220 - Suggestion: Make KPI Tiles Clickable for Drill-Through Filtering in Agent Inventory](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/220)

**Problem:**
Feature request for making KPI tiles in Agent Inventory dashboard clickable to enable drill-through filtering functionality. Currently users must manually scroll and apply filters instead of clicking KPI tiles for instant filtered views.

**Root Cause:**
User experience enhancement need - KPI tiles were static displays without interactive filtering capability, requiring manual navigation and filtering for detailed analysis.

**Solution Applied:**
**Enhancement Implementation:**

1. **Development**: Team implemented clickable KPI tiles with drill-through functionality
2. **Functionality Added**:
   - Click-through filtering from KPI tiles
   - Instant filtered views based on KPI selection
   - Improved navigation workflow similar to COE Toolkit dashboard experience
3. **Release**: Feature included in subsequent release
4. **User Experience**: Eliminated need for manual filtering and scrolling

**Features Delivered:**

- Clickable KPI tiles for instant filtering
- Drill-through functionality to filtered inventory views
- Enhanced dashboard interactivity aligned with Power Platform best practices

**Outcome:** Feature successfully implemented and delivered, significantly improving Agent Inventory dashboard usability.

---

## Common Solution Patterns

### Authentication Issues (MSAL/Browser State)

**Pattern seen in:** Issues #312, #330
**Common solution:** Clear browser state, eliminate multiple instances, restart browser completely

### Power BI Template Issues

**Pattern seen in:** Issues #314, #337
**Common solution:** Use updated templates provided by development team, follow latest installation instructions

### Bulk Import/Configuration Issues

**Pattern seen in:** Issues #333, #329  
**Common solution:** Use existing documented processes (Excel templates), some requests become feature requests

### Issue Resolution Categories

1. **Authentication Problems → Browser State Clearing**
2. **Power BI Errors → Updated Templates**
3. **Feature Requests → Documentation Reference or Not Planned**
4. **Configuration Issues → Existing Process Documentation**

---

### [Issue #295 - Test Run status is not working](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/295)

**Problem:**
User configured agents and test sets, but test run status always shows "no run" regardless of authentication method (No Authentication or Microsoft Entra Authentication). Direct Line channel security was enabled but issue persisted.

**Root Cause Analysis:**
Multiple potential causes identified through troubleshooting:

1. **Environment mismatch** - Agent in Copilot Studio vs Studio Kit pointing to different environments
2. **Security roles missing** - Required Power Platform roles not assigned to user
3. **Agent republishing** - Agent not republished after configuration changes
4. **Flow activation** - Required Power Automate flows not turned on

**Solution Applied:**
Step-by-step troubleshooting process:

1. **Environment Verification:**

   - Ensure agent in Copilot Studio and Studio Kit point to same environment
   - Verify environment alignment

2. **Security Role Assignment:**

   - Assign required Power Platform roles to user running tests
   - Verify user has necessary permissions

3. **Direct Line Configuration:**

   - **For No Authentication:**
     - Go to CS Kit → Direct Line Settings
     - Disable Channel Security
     - Copy token endpoint from Copilot Studio Agent
     - Navigate to Channels → Other Channels → Email
     - Paste token endpoint into CS Kit configuration
   - **For Channel Security Enabled:**
     - Go to Copilot Studio Agent → Settings → Security
     - Under Web Channel Security, copy the Secret
     - Paste Secret into CS Kit under Direct Line Settings

4. **Flow Activation (CRITICAL):**
   - Verify these flows are turned ON:
     - "Test Automation | Run Agent Tests"
     - "Test Automation | Run MultiTurn Tests (Child)"
   - Location: Copilot Studio Kit Solution → Cloud Flows (unmanaged) or Default Solution → Cloud Flows (managed)

**Outcome:** User confirmed "It's Running Thank you!!" after enabling the required flows - Issue resolved successfully.

**Additional Features Enabled:**

- **Conversation KPIs flows:** Conversation KPI | Copy Transcripts (Grandchild), Copy Transcripts (Child), Generate Conversation KPIs Scheduler, On Demand, Copy Agent Transcripts Scheduler
- **File Synchronization flows:** Sharepoint Synchronization | Synchronize files to Agent (Child), Scheduler, On Demand, Validate Connection on Demand

---

### [Issue #310 - Test Run Rerun Button not triggering new Test Run](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/310)

**Problem:**
User expected Rerun button to trigger new test runs, but Rerun-Cloud Flow was not being triggered.

**Root Cause:**
User misunderstanding of Rerun button functionality.

**Solution Applied:**
**Clarification provided by development team:**

**Rerun Button Purpose:**

- Rerun button is specifically for rerunning tests with different **enrichment options**
- NOT for creating new test runs with same configuration

**Correct Usage:**

- Use **"Duplicate Run"** button to create and rerun tests with same configuration
- Rerun button is for modifying enrichment parameters only

**Outcome:** Issue closed as "Not an issue" - User education provided on correct button usage.

---

### [Issue #292 - Unable to run Copilot studio kit](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/292)

**Problem:**
User getting DLP (Data Loss Prevention) errors preventing Copilot Studio Kit from running. User had already removed SharePoint, Office365 Outlook, Power Apps for Maker, Power Platform for Admins, Microsoft Copilot Studio, Copilot for service extension, M365 Copilot automation, and Microsoft Dataverse from DLP block list but error persisted.

**Root Cause:**
Additional connectors required by Power CAT Copilot Studio Kit were still blocked by DLP policies.

**Solution Applied:**
**Reference to comprehensive connector list:**

- Direct user to TECHDETAILS.md documentation
- Specific section: "Connectors used for DLP configuration purposes"
- Link: https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/TECHDETAILS.md#connectors-used-for-dlp-configuration-purposes

**Required Action:**
Enable ALL connectors listed in the technical documentation as part of DLP policies, not just the commonly known ones.

**Outcome:** User confirmed issue resolution: "Thanks, This can be closed." - DLP configuration completed successfully.

---

## Common Solution Patterns

### Authentication Issues (MSAL/Browser State)

**Pattern seen in:** Issues #312, #330
**Common solution:** Clear browser state, eliminate multiple instances, restart browser completely

### Power BI Template Issues

**Pattern seen in:** Issues #314, #337
**Common solution:** Use updated templates provided by development team, follow latest installation instructions

### Test Execution Problems

**Pattern seen in:** Issues #295, #310
**Common solutions:**

- **Flow activation** (most critical for #295)
- **User education** on correct button functionality (#310)
- **Environment and security verification**

### DLP Policy Issues

**Pattern seen in:** Issue #292
**Common solution:** Reference comprehensive connector documentation, enable ALL required connectors

### Bulk Import/Configuration Issues

**Pattern seen in:** Issues #333, #329  
**Common solution:** Use existing documented processes (Excel templates), some requests become feature requests

### Issue Resolution Categories

1. **Authentication Problems → Browser State Clearing**
2. **Power BI Errors → Updated Templates**
3. **Test Execution Issues → Flow Activation + Configuration Verification**
4. **DLP Blocking → Comprehensive Connector Documentation**
5. **Feature Requests → Documentation Reference or Not Planned**
6. **User Education → Correct Usage Guidance**

## Key Insights for Automated Responses

1. **MSAL Authentication errors** consistently resolve with browser clearing steps
2. **Power BI issues** often require updated templates from the development team
3. **Test execution problems** most commonly caused by **disabled flows** - check flow activation first
4. **DLP issues** require comprehensive connector documentation reference, not partial lists
5. **User confusion** about button functionality needs clear usage guidance
6. **Bulk import requests** should be directed to existing Excel-based processes
7. **Configuration retention** issues may be feature requests rather than bugs
8. **Setup wizard problems** often authentication-related, same clearing steps apply

---

### [Issue #306 - Can't turn on the flow Pipeline | Validate Agent Using Test Cases](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/306)

**Problem:**
User unable to activate "Pipeline | Validate Agent Using Test Cases" flow after proper installation steps. Flow fails with error: "InvalidOpenApiFlow" message showing missing unbound actions "Deploy the Solution" and "Stop Deployment" with action name "UpdatePreExportStepStatus".

**Root Cause:**
Missing **Power Platform Pipelines** component in the target environment. The pipeline flow requires specific Dataverse unbound actions that are only available when Power Platform Pipelines is installed.

**Solution Applied:**
**Install Power Platform Pipelines dependency:**

1. **Navigate to Power Platform Admin Center**
2. **Select the respective environment**
3. **Go to Dynamics 365 apps**
4. **Choose "Install apps"**
5. **Locate and install "Power Platform Pipelines"**
6. **Wait for installation completion**
7. **Try turning on the flow again**

**Outcome:** Issue closed as completed after providing installation instructions. User did not report back, indicating likely resolution.

**Note:** This is a **prerequisite requirement** - Pipeline flows cannot function without Power Platform Pipelines installed.

---

### [Issue #311 - Can't Activate flow "Conversation KPI | Generate Conversation KPIs Scheduler"](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/311)

**Problem:**
Flow activation fails with pagination policy error: "The pagination policy of workflow run action 'List_rows:\_Agent_Trascripts' of type 'OpenApiConnection' is not valid. The value specified for property 'minimumItemsCount' exceeds the maximum allowed. Actual: '75000'. Maximum: '5000'."

**Root Cause:**
Flow has pagination threshold property set to 75,000 which exceeds Microsoft's maximum limit of 5,000 for Power Automate actions.

**Solution Applied:**
**Reduce pagination threshold to meet platform limits:**

- Change "List_rows:\_Agent_Trascripts" action threshold property from 75,000 to 5,000
- This is a temporary workaround until fixed in next version

---

### [Issue #267 - Power BI Report - Not showing data](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/267)

**Problem:**
Power BI dashboard shows no data despite conversation transcripts being populated in Dataverse. Agent Transcripts show "Workflow Status" as Pending indefinitely, preventing data from appearing in reports.

**Root Cause:**
Data processing delays in the staging table combined with potential Scheduler flow failures prevent KPI records from being generated and moving from pending to completed status.

**Solution Applied:**

1. **Wait for Processing:** Initially wait 10-12 hours as records need time to process in staging tables
2. **If Still Pending After 72+ Hours:**
   - Check Power Automate Advanced section for Scheduler flow logs
   - Look for failed instances of the Scheduler flow
   - Verify all flow connections are properly authenticated
   - Restart any failed Scheduler flows
3. **Verify Configuration:**
   - Confirm Dataverse enrichment is enabled in agent configuration
   - Check conversation transcript enrichment settings
4. **Manual Resolution:** If automated processing fails, contact support for direct intervention

**Outcome:** After fixing scheduler flow issues and allowing proper processing time, KPI records show completed status and data appears in Power BI reports.

---

### [Issue #271 - Install Blocker - Setup Wizard Data Connection Issue](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/271)

**Problem:**
Setup Wizard fails to create new connections, displaying error "ServiceToServiceEnvironmentNotFound" when clicking "New Connection". The error indicates environment ID cannot be found in the tenant.

**Root Cause:**
Browser cache conflicts, authentication issues, or environment configuration problems causing the Power Platform connector to fail during connection creation.

**Solution Applied:**

1. **Clear Browser Cache and Cookies:**
   - Clear all browser cache and cookies completely
   - Close and restart browser
2. **Re-authenticate and Refresh:**
   - Re-login to the Power Platform
   - Publish all customizations
   - Restart the application
3. **Application Reinstall:**
   - If issue persists, reinstall the application from AppSource
   - Download fresh copy: https://appsource.microsoft.com/en-us/product/dynamics-365/microsoftpowercatarch.copilotstudiokit2
4. **Environment Verification:**
   - Verify environment permissions and access
   - Ensure user has proper roles for connection creation

**Outcome:** Connection creation works properly after clearing cache conflicts and re-establishing clean authentication sessions.

---

### [Issue #272 - Transcript does not show](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/272)

**Problem:**
Agent Test Results show no transcript data in the Transcript tab, even when conversation transcript settings are properly configured. Tests remain in pending status with flow errors.

**Root Cause:**
"Negative latency" error in the "Test Automation | Run Agent Tests" flow occurs when bot message timestamps are earlier than user message timestamps, indicating message order mismatch or pairing issues.

**Solution Applied:**

1. **Wait for Processing:** Allow 60-65 minutes for Dataverse conversation transcript enrichment to complete
2. **Check Flow Errors:**
   - Open the failed flow run "Test Automation | Run Agent Tests"
   - Expand outputs of "Filter array: Messages from User" and "Filter array: Messages from Bot"
   - Verify timestamp consistency between user and bot messages
3. **Configuration Check:**
   - Confirm Dataverse enrichment is enabled in agent configuration
   - Verify no external message positioning is being used
4. **Re-run Test:** If timestamp errors persist, re-run the test case with clean data

**Outcome:** After resolving timestamp ordering issues and allowing proper processing time, transcripts populate correctly in test results.

---

### [Issue #274 - Multi-turn test run help](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/274)

**Problem:**
Multi-turn/multi-step test cases fail with "No Response" errors after the first step. The "Transfer to agent" functionality doesn't work properly in automated testing, showing unavailable transcripts.

**Root Cause:**
Latency issues between test steps cause the flow to complete before receiving responses for subsequent steps. The test framework cannot properly wait for asynchronous responses in multi-turn scenarios.

**Solution Applied:**

1. **Verify Test Design:**
   - Ensure test utterances match actual bot conversation flows
   - Test the same conversation manually in Copilot Studio first
   - Create test sets aligned with proven working conversations
2. **Check Bot Response:**
   - If bot returns no response to specific utterances (like "2"), the test correctly marks it as error
   - Verify the bot actually responds to test inputs in live testing
3. **Alternative Approaches:**
   - Use single-turn tests for complex scenarios
   - Consider breaking multi-turn tests into separate single-step tests
   - Join Office Hours sessions for complex multi-turn troubleshooting
4. **Documentation:** Provide complete test sets and expected responses when reporting multi-turn issues

**Outcome:** Multi-turn tests work when designed to match actual bot conversation patterns, or alternative testing approaches can be used for complex scenarios.

---

### [Issue #270 - Error when running Conversation Analyzer](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/270)

**Problem:**
Conversation Analyzer fails to run with flow errors, and some Conversation KPI flows cannot be turned on, showing "Request failed with status code 400" error.

**Root Cause:**
Flow activation order dependencies cause failures when flows are enabled in the wrong sequence. Some flows depend on others being active first.

**Solution Applied:**

1. **Identify Flow Dependencies:**
   - Determine which flows need to be activated first
   - Check for prerequisite flows that must be running
2. **Sequential Activation:**
   - Turn on flows in the correct dependency order
   - Start with foundational flows before dependent ones
   - Wait for each flow to fully activate before proceeding
3. **Retry Failed Activations:**
   - After establishing base flows, retry activating previously failed flows
   - Error 400 often resolves once dependencies are met
4. **Verify Settings:**
   - Ensure "Conversation Analyzer | Analyze Conversation Based on Prompt" flow is enabled
   - Check all connection authentications are valid

**Outcome:** Following proper flow activation sequence resolves conversation analyzer errors and enables all KPI functionality.

**User Concern:** Will reducing threshold to 5,000 result in incomplete data in reporting?

**Resolution Reference:** Duplicate issue of #161 - indicates this is a known problem with established workaround.

**Outcome:** Issue closed as duplicate. Users must manually adjust pagination settings for flow activation.

---

### [Issue #288 - Prompt Advisor: Prompt Evaluation not possible](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/288)

**Problem:**
User unable to use Prompt Advisor in Europe region environment with Agent Builder credits. Error message: "gpt-41-2025-04-14 is not available in the current geography. EnableCrossGeoCall flag is disabled in the input payload sent to CAPI."

**Root Cause Analysis:**

1. **Geographic availability:** GPT-4.1 model not available in Europe region
2. **Cross-geo calls disabled:** System not configured to call models from other regions
3. **Generative AI features not activated** in environment (user discovery)

**Solution Applied:**
**Model version and feature activation check:**

1. **Verify GPT Model Version:**

   - Check if GPT-4.1 model is available in environment
   - Update to latest available GPT version if needed

2. **Activate Generative AI Features:**
   - User discovered generative AI features not activated in environment
   - Enable generative AI capabilities in Power Platform admin center

**Self-Resolution:** User reported "prompt advisor has been working for me in the meantime and I checked and it is using the correct model!"

**Outcome:** Issue resolved after user activated generative AI features and verified correct model availability.

---

### [Issue #279 - Child Agent Inventory Flow is failing](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/279)

**Problem:**
"Agents Inventory | Agents Data Load (Child)" flow failing with error: "PluginError: Entity 'solution' With Id = cff7fe3a-7784-466f-8174-dec8ab48b25e Does Not Exist" when running Agent Inventory sync across all agents and environments.

**Root Cause:**
Intermittent timing or dependency issue with the custom API 'cat_AgentInventory' and child flow execution.

**Solution Applied:**
**Manual parent flow execution workaround:**

- Run the parent flow "Agent Inventory | Agents Data Load" manually from Power Automate
- This bypassed the child flow error and successfully populated agent inventory

**Self-Resolution:** User reported "When I ran the parent flow 'Agent Inventory | Agents Data Load' manually from the power automate, it seems to have worked - I am able to see the agent inventory."

**Outcome:** Issue self-resolved through manual parent flow execution. Suggests possible timing/dependency issue in automated child flow triggers.

---

### [Issue #278 - Environment Default-xxxxxxxxxx cannot be linked](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/278)

**Problem:**
Setup wizard fails to link default environment because app omits "Default-" prefix from environment name, causing "ServiceToServiceEnvironmentNotFound" error. App tries to find environment with ID only instead of full "Default-[ID]" name format.

**Root Cause:**
Bug in environment name parsing logic - application strips "Default-" prefix when processing default environment names.

**Solution Applied:**
**Immediate Workaround:**

1. **Open Copilot Studio Kit solution in Power Apps**
2. **Go to Connection References**
3. **For each connection reference, click "Add/update connection"**
4. **Update all connections manually**
5. **Play the app again**

**Permanent Fix:**
Issue resolved in September 2025 release. User directed to import latest release to apply the fix.

**Outcome:**

- **Immediate:** Workaround provided for current setup
- **Long-term:** Bug fixed in September 2025 release

---

### [Issue #264 - Test type -> Generative Answers -> Result is 'pending' and Result Reason is 'Pending analysis with AI Builder'](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/264)

**Problem:**
Generative Answers test results show 'pending' status with "Pending analysis with AI Builder" error. Flow errors include "ModelNotSupported" and App Insights shows "InsufficientAccessError" with 403 status.

**Root Cause:**
Multiple configuration issues: insufficient AI Builder credits, missing orchestration settings, App Insights permission problems, and environment incompatibility with AI Builder features.

**Solution Applied:**

1. **Check Flow Status:** Verify "Test Automation | Analyze Generated Answers with AI Builder" flow runs successfully (takes 7-10 minutes)
2. **AI Builder Requirements:**
   - Ensure sufficient AI Builder credits in tenant
   - Verify AI Builder is enabled in environment settings
   - Confirm environment supports AI Builder scenarios (not all regions do)
3. **Agent Configuration:**
   - Ensure agent is published in Copilot Studio
   - Enable Orchestration under agent settings to allow generative AI responses
4. **App Insights Permissions:**
   - Follow ENABLE-APPINSIGHTS.md documentation properly
   - Verify user has appropriate roles for App Insights access
   - Check connection authentication in Power Automate flows
5. **Environment Support:** Confirm environment type supports AI Builder (some environments show "This scenario is not supported in this environment")

**Outcome:** User confirmed "Issue is fixed" after attending office hours session to resolve configuration problems.

---

### [Issue #258 - Test Run Issue with No Authentication - Error code: AuthenticationNotConfigured](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/258)

**Problem:**
Agent configured with "No Authentication" fails during testing with error "AuthenticationNotConfigured". Issue occurs both in Copilot Studio Kit testing and direct Copilot Studio test pane when Dataverse is used as knowledge source.

**Root Cause:**
Dataverse knowledge sources require authentication even when "No Authentication" is selected for the agent. This is a platform limitation, not a configuration error.

**Solution Applied:**
**Authentication Requirement for Dataverse:**

- When using Dataverse as knowledge source, "No Authentication" option is not supported
- Must use Manual Authentication approach instead

**Required Configuration:**

1. **Switch to Manual Authentication:**
   - Follow ENABLE-AUTHENTICATION.md documentation
   - Configure proper authentication for Dataverse access
2. **Token Endpoint Configuration:**
   - Use token endpoint from Channels → Email (not Direct Line Speech)
   - Ensure proper channel security settings

**Alternative:** If no authentication is required, use knowledge sources other than Dataverse (SharePoint, websites, etc.)

**Outcome:** User acknowledged solution and requested issue closure to implement Manual Authentication approach.

---

### [Issue #260 - No Records Showing in Conversation KPIs Dashboard Despite Cross-Environment Data Sync Setup](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/260)

**Problem:**
Conversation KPIs dashboard shows no data despite proper Power BI configuration. Conversation KPI table in Dataverse remains empty even when agents exist in different environments.

**Root Cause:**
Misunderstanding of data flow requirements and environment restrictions. Conversation transcripts are not automatically generated in all environment types.

**Solution Applied:**

1. **Environment Type Verification:**

   - Conversation transcripts NOT written for:
     - Microsoft Dataverse for Teams
     - Dataverse developer environments
     - Microsoft 365 Copilot agents
   - Only Sandbox and Production environments support automatic transcript generation

2. **Agent Configuration Required:**

   - Follow "Configure a new agent for conversation KPIs" documentation
   - Proper agent setup required for data population
   - Cannot rely on cross-environment data sync

3. **Power BI Report Refresh:**

   - Open report in Power BI Desktop
   - Perform data refresh to get current date ranges
   - Re-publish after refresh

4. **Documentation Reference:** https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/CONFIGURE_COPILOTS.md#configure-a-new-agent-for-conversation-kpis

**Outcome:** User confirmed understanding of proper configuration process after guidance.

---

### [Issue #265 - Agent Inventory flow not working](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/265)

**Problem:**
Unable to turn on "Agent Inventory | Agents Data Load" flow during fresh AppSource installation. Flow shows status code 400 error when attempting activation.

**Root Cause:**
Flow activation order dependency issue. Hierarchical flows must be activated in correct sequence to avoid dependency conflicts.

**Solution Applied:**
**Sequential Flow Activation Process:**

1. **Start with Grandchild flows** - Activate lowest-level dependent flows first
2. **Then activate Child flows** - Activate intermediate flows
3. **Finally activate Main flows** - Activate top-level orchestrating flows

**Specific Order for Agent Inventory:**

- First: Agent Inventory | Agents Data Load (Grandchild)
- Then: Agent Inventory | Agents Data Load (Child)
- Finally: Agent Inventory | Agents Data Load (Main)

**Verification Steps:**

- Ensure all connections are valid before activation
- Wait for each flow to fully activate before proceeding to next level
- Check that SharePoint configuration (if used) is properly set up

**Outcome:** Issue resolved during call by following proper flow activation sequence. User confirmed successful operation.

---

### [Issue #256 - Help in customizing prompts for AI validation of response](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/256)

**Problem:**
User needs guidance on customizing validation prompts for Generative Answers test types. Unclear how to write effective evaluation criteria against ground truth responses.

**Root Cause:**
User education needed on proper instruction-type prompt formatting for AI validation of generative responses.

**Solution Applied:**
**Instruction-Type Prompt Format:**

- Write clear expectation statements in the test set
- Define specific validation criteria for AI evaluation
- Use instruction format: "Validate the response should contain [expected content]"

**Example Pattern:**

- **Test Utterance:** "Capital of Brazil"
- **Expected Response:** "Validate the response should contain the answer as Brasília"

**Best Practices:**

1. **Be Specific:** Define exact content or concepts expected
2. **Use Clear Instructions:** Write what the AI should validate for
3. **Context Awareness:** AI validation works with attachments and full conversation context
4. **Test Creation:** Write validation instructions directly in Copilot Studio Kit test set creation

**Outcome:** User received guidance on proper prompt instruction format for effective AI validation.

---

### [Issue #251 - The Conversation KPIs dashboard fails to refresh data](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/251)

**Problem:**
Conversation KPIs dashboard refresh fails with error about blank Component IDs in Components table. Power BI query shows agents missing Component ID (botcomponentid) values, causing "Remove Duplicate Components" step to eliminate all but one agent.

**Root Cause:**
Multiple configuration issues: incorrect Agent ID configuration, Power Automate Premium license requirement for pagination, and empty ConversationKPI table due to failed processing flows.

**Solution Applied:**
**Agent ID Configuration Fix:**

1. **Correct Agent ID Source:**

   - Use Agent ID from Settings → Session Details → Copilot Studio Details → Copilot ID
   - NOT from Settings → Advanced → Metadata section
   - User discovered bot table had different ID than what was configured

2. **Power Automate License Issue:**
   - Issue resolved during Office Hours call
   - User discovered flows failing due to pagination limits (75,000 rows)
   - **Root Cause:** Account running flows lacked Power Automate Premium license
   - **Solution:** Reduced pagination from 75,000 to 5,000 rows per batch

**Flow Status Verification:**

- Ensure "Conversation KPI | Copy Transcripts (GrandChild)" runs successfully
- Verify "Conversation KPI | Copy Agent Transcripts Scheduler" completes
- Check that Agent Transcripts no longer show "Pending" workflow status

**Environment Requirements:**

- Conversation transcripts not available in:
  - Microsoft Dataverse for Teams
  - Dataverse developer environments
  - Microsoft 365 Copilot agents
- Only Sandbox and Production environments generate transcripts automatically

**Outcome:** Issue resolved after correcting Agent ID configuration and adjusting pagination limits for non-premium license accounts.

---

### [Issue #249 - Invalid Operation - Division by Zero Error](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/249)

**Problem:**
New "Agent Value Summary" page in July release throws "Invalid Operation - Division by Zero Error" when attempting to load data or perform calculations.

**Root Cause:**
Bug in mathematical calculations within the Agent Value Summary page when certain denominator values are zero or null, causing division operations to fail.

**Solution Applied:**
**Release-Based Fix:**

- Issue identified as a code bug in July 2025 release
- Development team implemented fix for division by zero handling
- **Resolution:** Fixed as part of September 2025 release

**Immediate Workaround:**

- Avoid using Agent Value Summary page until September release
- Use other dashboard pages for agent analytics
- Update to September 2025 release when available

**Outcome:** Bug fixed in September 2025 release. Users experiencing this error should upgrade to latest version.

---

### [Issue #254 - Feature Request: Agent Message Consumption & Allocation - Agent Inventory or Standalone pbix](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/254)

**Problem:**
User request for enhanced reporting capabilities showing message consumption breakdown per agent, including allocation management and detailed consumption by category (knowledge, tools, generative answers, etc.).

**Root Cause:**
Feature gap - no existing capability to track and report on agent message consumption and allocation details in granular format.

**Solution Applied:**
**Feature Implementation:**

- Development team implemented message consumption tracking
- **Resolution:** Message consumption information added to Agent Inventory in September 2025 release

**Capabilities Added:**

- Detailed consumption breakdown per agent
- Message allocation visibility
- Integration with Power Platform Admin Center billing data
- Enhanced reporting for organizational agent adoption planning

**References:**

- Power Platform Admin Center: https://admin.powerplatform.microsoft.com/billing/licenses/environmentlist/CopilotStudio
- Licensing API integration for consumption data

**Outcome:** Feature implemented in September 2025 release. Users can now access comprehensive message consumption reporting through updated Agent Inventory.

---

## Updated Solution Patterns

### Authentication Issues (MSAL/Browser State)

**Pattern seen in:** Issues #312, #330
**Common solution:** Clear browser state, eliminate multiple instances, restart browser completely

### Power BI Template Issues

**Pattern seen in:** Issues #314, #337
**Common solution:** Use updated templates provided by development team, follow latest installation instructions

### Flow Activation Problems

**Pattern seen in:** Issues #295, #306, #311
**Common solutions:**

- **Missing dependencies** → Install required components (Power Platform Pipelines)
- **Flow configuration** → Enable specific flows manually
- **Pagination limits** → Adjust threshold settings to meet platform limits
- **Environment and security verification**

### Prerequisites and Dependencies

**Pattern seen in:** Issues #306, #288, #278
**Common solutions:**

- **Install missing components** (Power Platform Pipelines)
- **Activate required features** (Generative AI)
- **Update to latest release** for bug fixes

### DLP Policy Issues

**Pattern seen in:** Issue #292
**Common solution:** Reference comprehensive connector documentation, enable ALL required connectors

### Environment and Configuration Issues

**Pattern seen in:** Issues #278, #279
**Common solutions:**

- **Manual workarounds** for immediate resolution
- **Update to latest release** for permanent fixes
- **Manual flow execution** for timing issues

### Model and Regional Issues

**Pattern seen in:** Issue #288
**Common solutions:**

- **Verify model availability** in current region
- **Activate generative AI features**
- **Check cross-geo call settings**

### Bulk Import/Configuration Issues

**Pattern seen in:** Issues #333, #329  
**Common solution:** Use existing documented processes (Excel templates), some requests become feature requests

### Issue Resolution Categories

1. **Authentication Problems → Browser State Clearing**
2. **Power BI Errors → Updated Templates**
3. **Flow Activation Issues → Dependencies + Configuration + Manual Fixes**
4. **Prerequisites Missing → Install Required Components**
5. **DLP Blocking → Comprehensive Connector Documentation**
6. **Environment Bugs → Manual Workarounds + Latest Release Updates**
7. **Model/Regional Issues → Feature Activation + Model Verification**
8. **Feature Requests → Documentation Reference or Not Planned**
9. **User Education → Correct Usage Guidance**

## Key Insights for Automated Responses

1. **MSAL Authentication errors** consistently resolve with browser clearing steps
2. **Power BI issues** often require updated templates from the development team
3. **Flow activation problems** commonly caused by **missing dependencies** (Power Platform Pipelines) or **pagination limits**
4. **Prerequisites are critical** - many issues stem from missing required components
5. **Environment bugs** often have **manual workarounds** plus **permanent fixes in later releases**
6. **Regional/model availability** affects Prompt Advisor functionality
7. **Self-resolution common** - users often find solutions through troubleshooting process
8. **Test execution problems** most commonly caused by **disabled flows** - check flow activation first
9. **DLP issues** require comprehensive connector documentation reference, not partial lists
10. **User confusion** about button functionality needs clear usage guidance
11. **Bulk import requests** should be directed to existing Excel-based processes
12. **Configuration retention** issues may be feature requests rather than bugs
13. **Setup wizard problems** often authentication-related, same clearing steps apply

---

### [Issue #218 - Can't access to the app correctly (Incomplete Interface)](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/218)

**Problem:**
User installed the Copilot Studio Kit following all steps, but the app interface is incomplete when launched. Shows only "inconnu61" instead of proper UI elements. Issue occurs in developer environment with company restrictions.

**Root Cause:**
DLP (Data Loss Prevention) policies in corporate environments can block required connectors, preventing proper UI rendering even when policies appear to allow all connectors.

**Solution Applied:**

1. **Reinstall from AppSource:** Direct installation using http://aka.ms/DownloadCopilotStudioKit
2. **DLP Policy Review:** Configure policies to allow all required connectors from technical documentation
3. **Prerequisites Check:** Verify all prerequisites are met before installation
4. **Support Escalation:** Join Office Hours sessions for direct troubleshooting when standard steps fail

**Key Documentation:**

- DLP Configuration Guide: https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/TECHDETAILS.md#connectors-used-for-dlp-configuration-purposes

---

### [Issue #217 - Pipeline | Validate Agent Using Test Cases Flow - unable to turn on](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/217)

**Problem:**
Unable to turn on the "Pipeline | Validate Agent Using Test Cases Flow" after installation, receiving InvalidOpenApiFlow error about missing API operations and XRM API failures.

**Root Cause:**
The flow requires Power Platform Pipelines application to be installed, which provides necessary API operations for test case validation workflows.

**Solution Applied:**

1. **Install Power Platform Pipelines** from Power Platform Admin Center
2. **Optional Usage:** Enable the flow only if planning to use pipelines for test case execution
3. **Keep Disabled:** Flow can remain off if not using Power Platform pipelines functionality
4. **Documentation Update:** Add dependency information to installation guides

**Outcome:** Flow successfully activated after installing Power Platform Pipelines app. User closed issue as completed.

---

### [Issue #214 - Can't see data in Power BI report (Data Pipeline Issues)](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/214)

**Problem:**
Power BI reports showing no data despite flows running successfully. Backend Dataverse tables not populating with conversation transcripts and KPI data. Agent Transcript table empty, Agent list showing blank in reports.

**Root Cause:**
Multiple contributing factors: 1) Date format mismatch (DD/MM/YYYY vs expected MM/DD/YYYY), 2) Environment type restrictions (Developer vs Production/Sandbox), 3) Flow pagination settings for non-premium licenses, 4) Workflow Status stuck as "Pending".

**Solution Applied:**

1. **Environment Requirement:** Use Sandbox or Production environment (not Developer) for conversation transcript generation
2. **Date Format Fix:** Ensure dates are formatted as MM/DD/YYYY when passed to Generate KPI Count flows
3. **License Configuration:** For non-premium licenses, turn off pagination in flows before enabling
4. **Flow Verification:** Check these flows are enabled and running:
   - Conversation KPI | Generate Conversation KPIs Scheduler Flow (runs at 06:00 and 20:00 daily)
   - Conversation KPI | Copy Transcripts (Grandchild)
5. **Data Pipeline Check:** Verify Agent Transcript table has data before expecting KPI generation
6. **Power BI Refresh:** Refresh dashboard from Power BI service after successful flow execution
7. **Office Hours Support:** Complex data pipeline issues escalated to direct support calls

**Outcome:** Resolved by moving to Production environment and correcting date formats. User confirmed conversation transcripts now populate, though workflow status remained "Pending" requiring additional investigation.

---

### [Issue #213 - Agent Configuration -> Direct Line setting -> Secret field is locked and disabled](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/213)

**Problem:**
When configuring Agent Direct Line settings, enabling channel security and selecting "Dataverse" as secret location causes the 'Secret' field to become locked and disabled, preventing configuration.

**Root Cause:**
Column security profile applied to the Secret field for additional security. Users need proper permissions to access and modify this sensitive field.

**Solution Applied:**

1. **Navigate to Dataverse Security:** Go to Settings > Security > Column Security Profiles
2. **Locate Profile:** Find the column security profile related to the Secret field
3. **Add User Access:** Add the user or team to the column security profile
4. **Grant Permissions:** Ensure users have read/write access to the profile
5. **Verify Access:** Secret field should become editable after permission changes

**Outcome:** Issue resolved immediately after adding user to column security profile. User confirmed field became accessible and editable.

---

### [Issue #212 - Completion of Adaptive Card input (Testing Enhancement)](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/212)

**Problem:**
Unable to test multi-step scenarios involving adaptive cards with input controls. While attachment-type tests can validate adaptive card display, there was no way to simulate user input submission to progress through the conversation flow.

**Root Cause:**
Testing framework lacked support for adaptive card action invocation and input simulation in multi-step test scenarios.

**Solution Applied:**
**Feature Enhancement Implemented:** Added adaptive card action support in September release to enable:

1. **Input Simulation:** Test steps can now submit adaptive card inputs
2. **Action Invocation:** Support for Action.Submit button interactions
3. **Multi-Step Testing:** Complete conversation flows through adaptive card interactions
4. **Choice Selection:** Ability to test ChoiceSet inputs and submissions

**Outcome:** Feature request fulfilled with September release. Adaptive card actions are now fully supported in the testing framework.

---

### [Issue #211 - microsoft try (Invalid Issue)](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/211)

**Problem:**
Issue created without any description or specific problem statement.

**Root Cause:**
Invalid issue submission lacking required information to provide assistance or determine the actual problem.

**Solution Applied:**
**Issue Management Process:**

1. **Immediate Closure:** Close issues without proper descriptions
2. **Request Specifics:** Ask users to create new issues with detailed problem descriptions
3. **Template Guidance:** Direct users to follow issue templates for better support

**Outcome:** Issue closed as invalid due to lack of description. Standard process for managing incomplete issue submissions.

---

### [Issue #209 - Non-Direct Line authenticated agent tests failing](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/209)

**Problem:**
Tests failing for agents without Direct Line channel security, returning error "The request URI does not match any known API routes." Token endpoint from web channel configuration doesn't match the expected endpoint format.

**Root Cause:**
Incorrect token endpoint location used for agents without Direct Line security. Documentation was updated during user's testing period, causing confusion about correct endpoint source.

**Solution Applied:**
**Use Email Channel Token Endpoint for non-Direct Line agents:**

1. **Navigate to Copilot Studio:** Go to agent configuration
2. **Access Channels:** Navigate to Channels → Other Channels → Email
3. **Copy Token Endpoint:** Use token endpoint from Email channel (not Web channel)
4. **Update Agent Configuration:** Replace token endpoint in Copilot Studio Kit agent configuration
5. **Reference Documentation:** Follow updated guidance: https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/CONFIGURE_COPILOTS.md#configure-a-new-agent-for-test-automation

**Outcome:** Issue resolved immediately after using correct email channel token endpoint. User confirmed tests running successfully.

---

### [Issue #208 - App Forbidden error after app launch (Test Issue)](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/208)

**Problem:**
Test issue created by project maintainer with "App Forbidden error after app launch" title.

**Root Cause:**
Not a real issue - created for testing purposes by maintainer.

**Solution Applied:**
**Issue Management:**

- Closed as invalid test issue
- No action required from users

**Outcome:** Test issue properly identified and closed by maintainer.

---

### [Issue #204 - New Agent Configuration Not Showing in Dashboard](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/204)

**Problem:**
Agent configuration working for days with successful KPI generation flows and visible Agent Transcripts, but KPIs not displaying in Dashboard after June 4th despite upgrading to newer version (20250404 to 20250523).

**Root Cause:**
Power BI dashboard not refreshing to display latest generated KPI data from Dataverse.

**Solution Applied:**
**Power BI Dashboard Refresh Process:**

1. **Access Power BI Portal:** Navigate to Power BI service online
2. **Open Dashboard:** Locate Conversation KPI Dashboard
3. **Go to Settings:** Navigate to Settings → Admin Portal
4. **Refresh Dashboard:** Execute refresh to pull latest data from Dataverse
5. **Verify Data:** Check that KPIs after June 4th now appear in dashboard

**Outcome:** Issue resolved through Power BI refresh process. User did not report back, indicating likely successful resolution.

---

### [Issue #202 - Kit not compliant with GCC Tenant](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/202)

**Problem:**
Copilot Studio Kit not working properly in Government Community Cloud (GCC) tenant. Power BI Dashboard showing no data due to hardcoded commercial Power Automate URL (https://make.powerautomate.com) in flows instead of using GCC-specific endpoints.

**Root Cause:**
Environment variable configuration issue where flows appeared to have hardcoded commercial URLs in both managed and unmanaged versions, preventing proper operation in GCC environments.

**Solution Applied:**
**GCC Environment Configuration:**

1. **Update Environment Variable:** Set "Power Automate Endpoint" environment variable to GCC-specific URL
2. **Remove Trailing Slash:** Ensure environment variable doesn't end with "/"
3. **Verify Flow Configuration:** Confirm flows use conditional check to prioritize custom environment variable over default commercial URL
4. **Test Both Versions:** Validate functionality in both managed and unmanaged solution versions
5. **Office Hours Escalation:** Join office hours for complex GCC compliance issues

**Key Affected Flows:**

- Conversation KPI | Copy Transcripts (Child)
- Conversation KPI | Generate Conversation KPIs Scheduler

**Outcome:** Resolved through Office Hours session. User confirmed status during follow-up discussions.

---

### [Issue #201 - SharePoint sync setup instructions references non-existent environment variable "Dataverse URL"](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/201)

**Problem:**
SharePoint sync setup instructions reference a "Dataverse URL" environment variable that no longer exists in the May 2025 release installation.

**Root Cause:**
Environment variable deprecated in May 2025 release without updating all documentation references. Architecture changed to read Dataverse URL directly from Agent Configuration.

**Solution Applied:**
**Documentation Update and Configuration Change:**

1. **Environment Variable Deprecated:** "Dataverse URL" environment variable removed from May 2025 release
2. **New Configuration Source:** Value now read directly from Agent Configuration → Dataverse field
3. **Documentation Updated:** Installation instructions updated to reflect architectural change
4. **Reference Link:** Updated documentation at: https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/INSTALLATION_INSTRUCTIONS.md#common-and-shared-configuration-steps-applies-to-both-appsource-and-github

**Outcome:** Documentation updated, issue resolved. User confirmed closure after reviewing updated instructions.

---

### [Issue #199 - Entra ID Authentication - Test Run Issue](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/issues/199)

**Problem:**
Tests not running with Entra ID authentication configuration. Status remains "Not Run" despite completing app registration, security roles, and agent configuration. Later encounters "IntegratedAuthenticationNotSupportedInChannel" error.

**Root Cause:**
Copilot Studio Kit has limited authentication support - "Authentication with Microsoft" (Entra ID integrated) is not supported for test automation.

**Solution Applied:**
**Authentication Limitations and Workaround:**

1. **Setup Wizard Usage:** Use Setup Wizard on Kit home page to ensure proper connection references and environment variables
2. **Flow Activation Check:** Verify "Test Automation | Run Agent Tests" flow is running with proper status (Running/Error/Completed)
3. **Authentication Support Clarification:** Kit only supports:
   - **No Auth** (supported)
   - **Authenticate Manually** (supported)
   - **Authenticate with Microsoft** (NOT supported for test automation)
4. **Alternative Options:** User advised to explore other authentication options for test scenarios

**Error Details:**

- `IntegratedAuthenticationNotSupportedInChannel` indicates authentication method incompatibility
- Agent republishing doesn't resolve authentication type limitations

**Outcome:** Resolved through Office Hours session. User confirmed understanding that Microsoft Authentication is not supported and will explore alternative approaches.
