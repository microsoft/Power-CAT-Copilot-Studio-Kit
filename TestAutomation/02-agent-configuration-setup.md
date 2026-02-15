# Agent Configuration Setup

## Table of Contents

- [Overview](#overview)
- [Creating a Basic Agent Configuration](#creating-a-basic-agent-configuration)
- [Essential Connection Settings](#essential-connection-settings)
- [Managing Secrets](#managing-secrets)
- [Configuring User Authentication](#configuring-user-authentication)
- [Enabling App Insights Enrichment](#enabling-app-insights-enrichment)
- [Enabling AI Builder Generated Answers Analysis](#enabling-ai-builder-generated-answers-analysis)
- [Enabling Dataverse Enrichment](#enabling-dataverse-enrichment)
- [Enrichment Dependencies and Timing](#enrichment-dependencies-and-timing)
- [Configuration for Advanced Test Types](#configuration-for-advanced-test-types)
- [Agent Configuration Quick Reference](#agent-configuration-quick-reference)
- [Troubleshooting Configuration Issues](#troubleshooting-configuration-issues)

---

## Overview

An **Agent Configuration** is a connection profile that defines how the Copilot Studio Kit connects to and tests a specific Copilot Studio agent. Think of it as a saved set of connection details, authentication settings, and enrichment preferences for a particular agent.

### What an Agent Configuration Contains

- **Direct Line connection settings**: Region, token endpoint, and channel security details
- **Secrets management**: Direct Line secrets stored in Dataverse or Azure Key Vault
- **User authentication settings** (optional): For agents requiring user sign-in
- **Enrichment configuration** (optional): App Insights, AI Builder, and Dataverse enrichment
- **Configuration type**: Test Automation, Conversation KPIs, or File Synchronization

### Why Multiple Configurations?

You may need multiple agent configurations to:

- Test different agents (production, staging, development)
- Test the same agent in different environments
- Use different enrichment options for different test scenarios
- Separate configurations for different configuration types

---

## Creating a Basic Agent Configuration

Follow these steps to create a new agent configuration for test automation:

### Step 1: Navigate to Agents

1. Open the **Power CAT Copilot Studio Kit** application
2. Navigate to **Agents** from the left navigation

### Step 2: Create New Agent Configuration

1. Click **+ New** to create a new agent configuration record
2. Provide a descriptive **Name** (e.g., "Production HR Bot", "Dev Environment - Sales Agent")
3. Select **Configuration Type(s)**: Choose **Test Automation**
   - You can select multiple configuration types if needed
   - For test automation, always include "Test Automation"
4. Click **Save**

> **Note**: The name doesn't have to match your agent's name in Copilot Studio. Choose a name that helps you identify the configuration purpose.

---

## Essential Connection Settings

After saving the basic agent configuration, configure the Direct Line connection settings:

### Region

**Required**: Yes

**Description**: The Azure region where your Copilot Studio agent is deployed.

**Purpose**: The Kit needs to target the appropriate [Direct Line endpoint](https://learn.microsoft.com/azure/bot-service/rest-api/bot-framework-rest-direct-line-3-0-api-reference?view=azure-bot-service-4.0) for your region.

**Common Values**:
- United States
- Europe
- Asia Pacific
- Other regions as applicable

**Where to Find**: Your agent's region is typically the same as your Power Platform environment region.

---

### Token Endpoint

**Required**: Depends (see below)

**Description**: The Direct Line token endpoint URL for your agent.

**When Required**: If **Channel Security** is NOT enabled or enforced.

**Where to Find**:
1. Open your agent in Copilot Studio
2. Go to **Channels** → **Mobile app**
3. Copy the **Token Endpoint** URL

**Format**: `https://[region].directline.botframework.com/v3/directline/tokens/generate`

> **Important**: If you enable Channel Security (recommended), you will NOT need to provide the Token Endpoint. The Kit will obtain tokens in exchange for the secret.

---

### Channel Security

**Required**: No (but strongly recommended)

**Description**: When enabled, the Kit obtains Direct Line tokens in exchange for a channel secret, providing better security.

**Enable Channel Security if**:
- Your agent has [web and Direct Line channel security](https://learn.microsoft.com/microsoft-copilot-studio/configure-web-security) enabled
- You want to use user authentication (authentication REQUIRES channel security)
- You want better security posture

**How to Enable Channel Security in Copilot Studio**:
1. Open your agent in Copilot Studio
2. Go to **Settings** → **Security** → **Web channel security**
3. Enable **Require secret to access this agent**
4. Copy the **Secret** (you'll need this for the Agent Configuration)

---

## Managing Secrets

When Channel Security is enabled, you must provide the Direct Line channel secret. The Copilot Studio Kit offers two options for storing secrets:

### Option 1: Store in Dataverse (Simpler)

**How It Works**: The secret is stored in a secured column in Dataverse.

**Steps**:
1. Set **Secret Location** to **Dataverse**
2. Paste your Direct Line channel **Secret** into the **Secret** field
3. Click **Save**

**Pros**:
- Simple setup
- No additional Azure resources required

**Cons**:
- Secret stored in Dataverse (though in a secured column)

---

### Option 2: Store in Azure Key Vault (More Secure)

**How It Works**: The secret is stored in Azure Key Vault, and the Kit retrieves it via an environment variable of type "secret".

**Prerequisites**:
- Azure Key Vault configured in your Azure subscription
- System Administrator security role on the Power Platform environment
- Permissions to configure Azure Key Vault

**Steps**:

#### A. Configure Azure Key Vault

Follow Microsoft's documentation: [Configure Azure Key Vault](https://learn.microsoft.com/power-apps/maker/data-platform/environmentvariables-azure-key-vault-secrets#configure-azure-key-vault)

#### B. Create Environment Variable for Secret

1. Go to **[make.powerapps.com](https://make.powerapps.com/)**
2. Select your environment
3. Go to **Solutions**
4. Select **Common Data Services Default Solution** (or your custom solution)
5. Follow: [Create a new environment variable for the Key Vault secret](https://learn.microsoft.com/power-apps/maker/data-platform/environmentvariables-azure-key-vault-secrets#create-a-new-environment-variable-for-the-key-vault-secret)
6. Note the **schema name** of the environment variable (e.g., `cr42e_Copilot1DirectLineSecret`)

#### C. Configure Agent Configuration

1. Set **Secret Location** to **Key Vault**
2. In the **Environment Variable** field, enter the schema name (e.g., `cr42e_Copilot1DirectLineSecret`)
3. Click **Save**

**Pros**:
- Industry-standard secret management
- Centralized secret rotation
- Better security posture

**Cons**:
- More complex setup
- Requires Azure Key Vault

> **Recommendation**: Use Dataverse for development and testing; use Key Vault for production environments.

---

## Configuring User Authentication

If your Copilot Studio agent requires users to sign in (end-user authentication), you must configure authentication in the agent configuration.

### Prerequisites

- Your agent has user authentication enabled in Copilot Studio
- Channel Security must be enabled
- You have created authentication applications (see below)

### Authentication Setup Overview

User authentication requires three applications:

1. **KitAuthApp**: Authentication application for Copilot Studio Kit
2. **CopilotStudioAuthApp**: Authentication application for your Copilot Studio agent
3. These applications must be linked together via API permissions and scopes

**Detailed Instructions**: See [Enable Authentication](../ENABLE-AUTHENTICATION.md) for complete step-by-step setup.

### Required Fields in Agent Configuration

Once you've completed the authentication setup in Azure Portal and Copilot Studio, configure these fields:

| Field | Description |
|-------|-------------|
| **User Authentication** | Select **Entra ID v2** |
| **Client ID** | Application (client) ID of **KitAuthApp** |
| **Tenant ID** | Directory (tenant) ID of **KitAuthApp** |
| **Scope** | Full scope URI from **CopilotStudioAuthApp** (format: `api://[app-id]/scope.name`) |
| **Secret Location** (User Auth) | Choose **Dataverse** or **Key Vault** |
| **Client Secret** | Client secret for **KitAuthApp** (if using Dataverse) |
| **Environment Variable** (User Auth) | Schema name of environment variable (if using Key Vault) |

### Quick Summary of Authentication Configuration

1. Enable **User Authentication** = **Entra ID v2**
2. Provide **Client ID**, **Tenant ID**, and **Scope** from KitAuthApp
3. Store the **Client Secret** in Dataverse or Key Vault
4. Ensure your agent has authentication enabled and configured with CopilotStudioAuthApp

---

## Enabling App Insights Enrichment

**App Insights Enrichment** retrieves telemetry data and generative answer details from Azure Application Insights.

### What It Provides

- Generative answer outcome (Answered, Moderated, No Search Results)
- Generative answer diagnostics and details
- Agent telemetry data

### When to Enable

- When testing **Generative Answers** test types
- When you need diagnostic information about why an answer was or wasn't generated
- As a prerequisite for **AI Builder Generated Answers Analysis**

### Prerequisites

- Your Copilot Studio agent is connected to Azure Application Insights
- You have an Azure app registration with permissions to read Application Insights data

**Detailed Instructions**: See [Enable App Insights](../ENABLE-APPINSIGHTS.md) for complete setup.

### Required Fields

| Field | Description |
|-------|-------------|
| **Enrich With Azure Application Insights** | Check this box to enable |
| **App Insights Client ID** | Application (client) ID of the app registration with App Insights read permissions |
| **App Insights Application ID** | **AppId** of your Application Insights resource |
| **App Insights Tenant ID** | Tenant ID of the Application Insights resource |
| **App Insights Secret Location** | Choose **Dataverse** or **Key Vault** |
| **App Insights Secret** | Client secret (if using Dataverse) |
| **App Insights Environment Variable** | Schema name of environment variable (if using Key Vault) |

### Timing

App Insights data becomes available approximately **5 minutes** after a test run completes.

---

## Enabling AI Builder Generated Answers Analysis

**AI Builder Generated Answers Analysis** uses large language models to evaluate the quality of generative responses.

### What It Provides

- AI-powered evaluation of generative answers
- Comparison with sample answers or validation instructions
- Grade (1-5) and rationale when using rubrics
- Pass/fail determination for Generative Answers tests

### When to Enable

- When testing **Generative Answers** test types
- When you need semantic comparison rather than exact text matching
- When using custom rubrics to evaluate AI responses

### Prerequisites

- **App Insights Enrichment must be enabled** (prerequisite)
- AI Builder capacity or trial available in your environment

### Required Fields

| Field | Description |
|-------|-------------|
| **Analyze Generated Answers** | Check this box to enable |
| **Generative AI Provider** | Select **AI Builder** (currently the only supported provider) |

### Cost

**AI Builder Credits**: 50 credits per Generative Answers test case

> **Note**: Plan your AI Builder capacity accordingly. A test run with 20 generative answers tests will consume 1,000 AI Builder credits.

### Timing

AI Builder analysis runs **after** App Insights enrichment completes (~5-10 minutes after test run completes).

---

## Enabling Dataverse Enrichment

**Dataverse Enrichment** retrieves conversation transcript data from Dataverse, including topic names, intent scores, and full transcripts.

### What It Provides

- Triggered topic name and ID
- Intent recognition scores
- Full conversation transcript JSON
- Citations used in generative answers
- Dynamic plan details (for Plan Validation tests)

### When to Enable

- When testing **Topic Match** test types
- When testing **Plan Validation** test types
- When you need to analyze conversation transcripts
- When you need intent recognition scores

### Prerequisites

- Your Copilot Studio agent stores conversation transcripts in Dataverse
- The Microsoft Dataverse connection used by the Copilot Studio Kit has **Read** access to the `ConversationTranscript` table in the target environment
- Target environment must be in the **same tenant**

### Required Fields

| Field | Description |
|-------|-------------|
| **Enrich With Conversation Transcripts** | Check this box to enable |
| **Dataverse URL** | URL of the Dataverse environment (e.g., `https://org123.crm.dynamics.com`) |
| **Copy Full Transcript** | Optionally copy the full conversation transcript JSON as an attachment to test result records |

### Where to Find Dataverse URL

1. Open your agent in Copilot Studio
2. Go to **Settings** (⚙️)
3. Under **Session details**, find **Instance URL**

### Timing

Conversation transcript data becomes available approximately **60 minutes** after a test run completes.

> **Important**: Topic Match and Plan Validation tests will remain in **Pending** status until Dataverse enrichment completes.

---

## Enrichment Dependencies and Timing

The three enrichment stages have dependencies and timing considerations:

### Enrichment Pipeline Flow

```
Test Run Completes
        ↓
  (wait ~5 minutes)
        ↓
[1] App Insights Enrichment
        ↓
[2] AI Builder Generated Answers Analysis
        ↓
  (wait ~60 minutes)
        ↓
[3] Dataverse Enrichment
```

### Dependencies

| Enrichment Stage | Depends On | Timing |
|------------------|------------|--------|
| **App Insights Enrichment** | None | ~5 minutes after test run completes |
| **AI Builder Analysis** | App Insights Enrichment | Runs after App Insights completes |
| **Dataverse Enrichment** | None | ~60 minutes after test run completes |

### Planning Your Testing Schedule

When planning test runs, account for enrichment delays:

- **Response Match and Attachments Match tests**: Results available immediately
- **Generative Answers tests**: Results available ~5-10 minutes after test run completes (App Insights + AI Builder)
- **Topic Match and Plan Validation tests**: Results available ~60 minutes after test run completes (Dataverse)

> **Tip**: Run long test sets overnight or during off-hours to accommodate Dataverse enrichment delays.

---

## Configuration for Advanced Test Types

Different test types have different configuration requirements:

### Requirements by Test Type

| Test Type | Required Enrichment | Optional Enrichment |
|-----------|---------------------|---------------------|
| **Response Match** | None | - |
| **Attachments Match** | None | AI Builder (for AI validation of attachments) |
| **Topic Match** | Dataverse | - |
| **Generative Answers** | AI Builder | App Insights (for diagnostics) |
| **Multi-turn** | Depends on child tests | Depends on child tests |
| **Plan Validation** | Dataverse | - |

### Minimal Configuration (Response Match Only)

If you only need Response Match tests:

- **Required**: Region, Token Endpoint (or Channel Security with Secret)
- **Optional**: Nothing

### Standard Configuration (All Test Types)

For full test automation capability:

- **Required**: Region, Channel Security, Secret
- **Enable**: App Insights Enrichment, AI Builder Analysis, Dataverse Enrichment

### Advanced Configuration (With Authentication)

For testing authenticated agents:

- **Required**: All standard configuration settings
- **Enable**: User Authentication (Entra ID v2)
- **Provide**: Client ID, Tenant ID, Scope, Client Secret

---

## Agent Configuration Quick Reference

### Essential Settings

| Setting | Required For | Location |
|---------|--------------|----------|
| **Name** | All configurations | Base Configuration |
| **Configuration Type(s)** | All configurations | Base Configuration |
| **Region** | All configurations | Direct Line Settings |
| **Token Endpoint** | Non-secure connections | Direct Line Settings |
| **Channel Security** | Secure connections, authentication | Direct Line Settings |
| **Secret** | Channel Security | Direct Line Settings |

### Authentication Settings

| Setting | Required For | Location |
|---------|--------------|----------|
| **User Authentication** | Authenticated agents | User Authentication |
| **Client ID** | Entra ID v2 | User Authentication |
| **Tenant ID** | Entra ID v2 | User Authentication |
| **Scope** | Entra ID v2 | User Authentication |
| **Client Secret** | Entra ID v2 | User Authentication |

### Enrichment Settings

| Setting | Required For | Location |
|---------|--------------|----------|
| **Enrich With Azure Application Insights** | Generative Answers diagnostics | Enrichment |
| **App Insights Client ID** | App Insights enrichment | Enrichment |
| **Analyze Generated Answers** | Generative Answers tests | Enrichment |
| **Enrich With Conversation Transcripts** | Topic Match, Plan Validation | Enrichment |
| **Dataverse URL** | Dataverse enrichment | Enrichment |

---

## Troubleshooting Configuration Issues

### Problem: "Failed to obtain Direct Line token"

**Possible Causes**:
- Incorrect Token Endpoint
- Incorrect Secret (when using Channel Security)
- Channel Security not enabled in Copilot Studio
- Secret expired or revoked

**Solutions**:
1. Verify Token Endpoint or Secret is correct
2. Ensure Channel Security is enabled in Copilot Studio if using secrets
3. Regenerate the Direct Line secret in Copilot Studio
4. Verify the region matches your agent's deployment region

---

### Problem: "Authentication failed"

**Possible Causes**:
- Incorrect Client ID, Tenant ID, or Scope
- Applications not properly linked in Azure Portal
- Client Secret expired or incorrect
- User authentication not enabled in Copilot Studio

**Solutions**:
1. Verify all authentication fields match values from Azure Portal
2. Ensure KitAuthApp is listed as an authorized client in CopilotStudioAuthApp
3. Regenerate Client Secret if expired
4. Verify user authentication is enabled in Copilot Studio agent settings
5. See detailed troubleshooting in [Enable Authentication](../ENABLE-AUTHENTICATION.md)

---

### Problem: "App Insights enrichment failed"

**Possible Causes**:
- Incorrect App Insights Application ID
- App registration doesn't have permissions to read App Insights
- Agent not connected to App Insights
- App Insights Client Secret expired

**Solutions**:
1. Verify App Insights Application ID (AppId) is correct
2. Ensure app registration has `API.Read` permissions on Application Insights
3. Verify your agent is sending telemetry to Application Insights
4. Check App Insights Client Secret is valid
5. See detailed troubleshooting in [Enable App Insights](../ENABLE-APPINSIGHTS.md)

---

### Problem: "Dataverse enrichment failed"

**Possible Causes**:
- Incorrect Dataverse URL
- Connection doesn't have Read permissions on ConversationTranscript table
- Target environment is in a different tenant
- Conversation transcripts not available yet (timing)

**Solutions**:
1. Verify Dataverse URL format: `https://[org].crm.dynamics.com`
2. Ensure the Dataverse connection has Read permissions on `ConversationTranscript` table
3. Verify target environment is in the same tenant
4. Wait for full 60 minutes before concluding enrichment has failed
5. Verify conversation transcripts are being stored in Dataverse

---

### Problem: "AI Builder analysis not running"

**Possible Causes**:
- App Insights Enrichment not enabled or failed
- Insufficient AI Builder credits
- AI Builder not available in environment

**Solutions**:
1. **Enable App Insights Enrichment first** (it's a prerequisite)
2. Check AI Builder capacity in your environment
3. Purchase or allocate AI Builder credits if needed
4. Verify AI Builder is available in your environment region

---

**Previous**: [← Test Automation Overview](01-test-automation-overview.md) | **Next**: [Creating and Managing Tests →](03-creating-and-managing-tests.md)
