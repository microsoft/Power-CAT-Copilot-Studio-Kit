# Technical information about Copilot Agent Kit

## 1. Connectors used (for data policy configuration)

The Kit imports as a single solution. Every connector in rows 1–14 must be allowed by the data policies and advanced connector policies (ACP) that apply to the **Kit environment**, whichever features you plan to use. If any app or flow uses a blocked connector, the import fails with an error like:
`AcpDlpPolicyEvaluation … blocked by Advanced Connector Policy (ACP) or Data Policies` (violation type `DLP BlockedConnector`).


| # | Connector (display name) | Connector ID | Connection reference(s) in solution | What it's used for | Feature(s) |
|---|---|---|---|---|---|
| 1 | **Microsoft Dataverse** | `shared_commondataserviceforapps` | **Copilot Studio Kit - Dataverse**; **PowerShield Dataverse** | Read and write all Kit tables, plus agent, transcript and solution data | Core (all features), PowerShield |
| 2 | **HTTP with Microsoft Entra ID (preauthorized)** | `shared_webcontents` | **Copilot Agent Kit - Power Platform Licensing**; **PowerShield APIFlow**; **PowerShield BAPAPI** | Call the Licensing API (usage and credits), the Flow API (custom connectors) and the BAP API (data policies) | Agent Inventory (Usage metrics), PowerShield |
| 3 | **Power Platform for Admins** | `shared_powerplatformforadmins` | **Copilot Agent Kit - Power Platform for Admins** | Enumerate environments and agents tenant-wide | Agent Inventory, Compliance Hub |
| 4 | **Power Platform for Admins V2** | `shared_powerplatformadminv2` | **Copilot Agent Kit - Power Platform for Admins V2** | Agent actions; quarantine, unquarantine and status | Agent Inventory, Compliance Hub |
| 5 | **Office 365 Users** | `shared_office365users` | **Copilot Agent Kit - Office 365 Users** | Look up user and manager profiles | Agent Inventory, Compliance Hub |
| 6 | **Microsoft Teams** | `shared_teams` | **Copilot Agent Kit - Microsoft Teams** | Notify makers and admins in Teams | Compliance Hub |
| 7 | **Office 365 Groups** | `shared_office365groups` | **Copilot Agent Kit - Office 365 Groups** | Resolve group members for approvals and cases | Compliance Hub |
| 8 | **Approvals** (Standard approvals) | `shared_approvals` | **Copilot Agent Kit - Standard approvals** | Admin approval of compliance cases | Compliance Hub |
| 9 | **Office 365 Outlook** | `shared_office365` | **Copilot Agent Kit - Outlook** | Send emails | Compliance Hub, Setup Wizard |
| 10 | **Power Apps for Makers** | `shared_powerappsforappmakers` | **Copilot Agent Kit - Power Apps for Makers**; **PowerShield PowerApps for Makers** | Share or unshare apps; read connections; list custom connectors | Setup Wizard, Code Apps, Agent Review Tool, PowerShield |
| 11 | **Agents** *(docs say preview)* | `shared_agentnode` | **Agent Review Tool \| Agents** | AI review of agent components. Can't be set on the solution import screen (see §2.1) | Agent Review Tool, Kit Installer |
| 12 | **Power Automate Management** | `shared_flowmanagement` | – (app connection only) | Turn on Kit flows after connections are set | Kit Installer |
| 13 | **SharePoint** | `shared_sharepointonline` | **Copilot Agent Kit - SharePoint** | Read SharePoint files to sync into an agent's knowledge | SharePoint Synchronization |
| 14 | **Microsoft Copilot Studio** | `shared_microsoftcopilotstudio` | **Copilot Agent Kit - Automated Tests** | Run agent tests from flows or pipelines | Test Automation |
| 15 | **Direct Line channels in Copilot Studio** | `PvaCustomDemoMobile` | – | Connecting & interacting with an agent | Test Automation, Webchat Playground, Agent Debugger |
| 16 | **Chat without Microsoft Entra ID authentication in Copilot Studio** | `PvaAuth` | – | Connecting & interacting with an agent when the agent has no authentication set | Test Automation, Webchat Playground |

---

## 2. Connection references

| # | Display name | Connector | Purpose | Feature(s) |
|---|---|---|---|---|
| 1 | Copilot Studio Kit - Dataverse | Microsoft Dataverse | Read and write all Kit data; calls Kit custom APIs (Direct Line, App Insights, AI Builder) | Core (all features) |
| 2 | Copilot Agent Kit - Power Platform Licensing | HTTP with Microsoft Entra ID (preauthorized) | Call the Power Platform Licensing API (usage and credits). **Per-cloud URLs: §4** | Agent Inventory (Usage metrics) |
| 3 | Copilot Agent Kit - Power Platform for Admins | Power Platform for Admins | List environments and agents tenant-wide | Agent Inventory, Compliance Hub |
| 4 | Copilot Agent Kit - Power Platform for Admins V2 | Power Platform for Admins V2 | Agent actions; quarantine, unquarantine and status | Agent Inventory, Compliance Hub |
| 5 | Copilot Agent Kit - Office 365 Users | Office 365 Users | User and manager lookup | Compliance Hub |
| 6 | Copilot Agent Kit - Microsoft Teams | Microsoft Teams | Notifications and intake cards | Compliance Hub |
| 7 | Copilot Agent Kit - Office 365 Groups | Office 365 Groups | Resolve group members | Compliance Hub |
| 8 | Copilot Agent Kit - Standard approvals | Approvals | Admin approval of cases | Compliance Hub |
| 9 | Copilot Agent Kit - Outlook | Office 365 Outlook | Send emails | Compliance Hub, Setup Wizard |
| 10 | Copilot Agent Kit - Power Apps for Makers | Power Apps for Makers | Share and unshare Kit apps; find the user's Agents connection | Setup Wizard, Code Apps, Agent Review Tool |
| 11 | Agent Review Tool \| Agents | Agents | AI review of agent components. Set via the Installer (§2.1) | Agent Review Tool |
| 12 | Agent Review Tool Dataverse Connection Ref | Microsoft Dataverse | Pre-deployment review gate. Only if that solution is installed | Agent Review Pipeline (separate solution) |
| 13 | Copilot Agent Kit - SharePoint | SharePoint | Sync SharePoint files to agent knowledge | SharePoint Synchronization |
| 14 | Copilot Agent Kit - Automated Tests | Microsoft Copilot Studio | Run agent tests from flows and pipelines | Test Automation |
| 15 | PowerShield Dataverse | Microsoft Dataverse | PowerShield data | PowerShield |
| 16 | PowerShield PowerApps for Makers | Power Apps for Makers | Read connectors and custom connectors | PowerShield |
| 17 | PowerShield APIFlow | HTTP with Microsoft Entra ID (preauthorized) | Call the Flow API (connectors). **Per-cloud URLs: §4** | PowerShield |
| 18 | PowerShield BAPAPI | HTTP with Microsoft Entra ID (preauthorized) | Call the BAP governance API (patch data policies). **Per-cloud URLs: §4** | PowerShield |

PowerShield flows stay **off** until their connections are configured. Run **PowerShield | Sync Connectors** once first.

### 2.1 Agents connector
- You can't select it on the solution import connection-reference screen. Leave it empty and finish setup with the **Copilot Agent Kit Installer** / Setup Wizard.
- The installer **won't overwrite** an Agents connection reference that already has a value.
- If the reference is empty, Power Apps for Makers is used to find the signed-in user's Agents connection.

---

## 3. Environment variables

| # | Display name | Type | Default | Purpose | Feature | Required? |
|---|---|---|---|---|---|---|
| 1 | Admin Approval Before Maker Notification | Boolean | yes | If on, an admin approves before the maker is notified to complete intake | Compliance Hub | Optional |
| 2 | Agent Maker Team ID | String | (empty) | Entra group object ID of agent makers. New members get a welcome email | Compliance Hub | **Yes** for Compliance Hub |
| 3 | App ID | String | 00000000-… | ID of the Kit model-driven app, used to build record links | Compliance Hub | **Yes** for Compliance Hub |
| 4 | Case Intake SLA | Number | 5 | Days for a maker to complete intake | Compliance Hub | Optional |
| 5 | Case Review SLA | Number | (empty) | Days for admins to review compliance cases | Compliance Hub | Optional |
| 6 | Case Summary Email Frequency | String | WEEKLY | How often admins get inventory summary emails | Compliance Hub | Optional |
| 7 | Compliance Documentation Link | String | https://aka.ms/CopilotStudioKit | Link to your compliance requirements for makers | Compliance Hub | Recommended |
| 8 | Compliance Support Contact Alias | String | support@contosoorg.onmicrosoft.com | Support email shown to makers | Compliance Hub | Recommended |
| 9 | Create Case for All Agents | Boolean | no | Create a compliance case for every agent | Compliance Hub | Optional |
| 10 | Governance Admin Alias | String | (empty) | Entra group object ID that gets compliance notifications and approvals | Compliance Hub | **Yes** for Compliance Hub |
| 11 | Instance Url | String | https://org.crm.dynamics.com | URL of the Kit environment, used to build links | Compliance Hub | **Yes** for Compliance Hub |
| 12 | Require Case For No Risk | Boolean | no | Require a case even for no-risk agents | Compliance Hub | Optional |
| 13 | Send Case Alerts via Email | Boolean | no | Email makers about compliance cases | Compliance Hub | Optional |
| 14 | Send Case Alerts via Teams | Boolean | no | Teams alerts to makers about compliance cases | Compliance Hub | Optional |
| 15 | Power Automate Region | String | Commercial | Tenant cloud. Builds cloud-specific maker portal links. Allowed values → maker portal used:<br>`Commercial` → `https://make.powerautomate.com/`<br>`GCC` → `https://make.gov.powerautomate.us/`<br>`GCC(High)` → `https://make.high.powerautomate.us/`<br>`DoD` → `https://make.powerautomate.appsplatform.us/` | Compliance Hub, Agent Insights, Agent Inventory, Conversation Analyzer, Conversation KPI, PowerShield, SharePoint Sync, Test Automation | **Set it if not Commercial** |
| 16 | Enable Agent Inventory V2 | Boolean | yes | Use the modern (V2) or classic Agent Inventory experience | Agent Inventory | Optional |
| 17 | Agent Change Tracker Base Environment URL | String | (empty) | Org URL of the hub (base) environment that holds the Agent Change Tracker tables | Agent Change Tracker | Per feature |
| 18 | Enable Value Component | Boolean | no | Turn on agent value classification | Agent Value Summary | Optional |
| 19 | Conversation KPIs Report | JSON | template | Power BI workspace and report IDs for the embedded dashboard | Conversation KPI | **Yes** for the embedded dashboard |
| 20 | Delay for Azure Application Insights Enrichment (Minutes) | Number | 5 | Wait before querying App Insights for test results | Test Automation | Optional |
| 21 | Delay for Conversation Transcripts Enrichment (Minutes) | Number | 35 | Wait before reading transcripts for test enrichment | Test Automation | Optional |
| 22 | Agent Token Endpoint | String | (empty) | Token endpoint of the published *Adaptive Card Gallery* agent (Channels → Mobile app), for live webchat preview | Adaptive Cards Gallery, Webchat Playground | Optional: emulator is used if empty |

---

## 4. Per-cloud (tenant type) values

**HTTP with Microsoft Entra ID (preauthorized) connections.** Enter **Base Resource URL** and **Microsoft Entra ID Resource URI** when you create the connection.

| Connection reference | Cloud | Base Resource URL | Microsoft Entra ID Resource URI |
|---|---|---|---|
| Copilot Agent Kit - Power Platform Licensing | Commercial | `https://licensing.powerplatform.microsoft.com/` | `https://licensing.powerplatform.microsoft.com/` |
| | GCC | `https://gov.licensing.powerplatform.microsoft.us/` | `https://gov.licensing.powerplatform.microsoft.us/` |
| | GCC High | `https://high.licensing.powerplatform.microsoft.us/` | `https://high.licensing.powerplatform.microsoft.us/` |
| | DoD | ⚠ Not documented by the Kit | |
| PowerShield APIFlow | Commercial | `https://api.flow.microsoft.com` | `https://service.powerapps.com/` |
| | GCC | `https://gov.api.flow.microsoft.us` | `https://gov.service.powerapps.us/` |
| | GCC High | `https://high.api.flow.microsoft.us` | `https://high.service.powerapps.us/` |
| | DoD | `https://api.flow.appsplatform.us` | `https://service.apps.appsplatform.us/` |
| PowerShield BAPAPI | Commercial | `https://api.bap.microsoft.com` | `https://api.bap.microsoft.com` |
| | GCC | `https://gov.api.bap.microsoft.us` | `https://gov.api.bap.microsoft.us` |
| | GCC High | `https://high.api.bap.microsoft.us` | `https://high.api.bap.microsoft.us` |
| | DoD | `https://api.bap.appsplatform.us` | `https://api.bap.appsplatform.us` |

---

## 5. Data policies (classic DLP)

### 5.1 How they work
- Three groups: **Business**, **Non-Business** (default for new connectors) and **Blocked**.
- Connectors from different groups **can't be used together** in the same app or flow.
- **All policies that apply to an environment are evaluated together.** *Blocked* in any one policy always wins.
- Enforced at **design time and runtime**. Violating flows are **Suspended** (by a background process that polls, so it isn't instant). Violating apps won't open.
- Environment admins **can't** override tenant-level policies.

### 5.2 Recommended setup for the Kit environment
Ideally, scope a dedicated policy to the Kit environment and put all connectors from §1 (rows 1–16) in the same group, preferably **Business** (they handle business data).

- Check every policy that applies to the environment, both tenant-wide and environment-level. None may block these connectors or put them in a different group.
- Dataverse, Approvals, Office 365 Groups, Office 365 Outlook, Office 365 Users, Microsoft Teams and SharePoint **can't be Blocked** by classic data policies, but they can still end up in a different group from the rest.
- **Microsoft Copilot Studio** *can* be blocked. Blocking it suspends the Kit flows that use it (Test Automation).

### 5.3 Steps
1. **Power Platform admin center** → **Security** → **Data and privacy** → **Data policy**.
2. Select the policy that applies to the Kit environment → **Edit Policy**.
3. **Prebuilt connectors** tab → search for each connector in §1 → select → **Move to Business**.
4. Review scope, then **Update Policy**.
5. Wait for the policy to take effect. Then retry the Kit import (or **Retry installation** in the installer) and turn on any suspended flows.

### 5.4 Endpoint filtering (preview) – if used
If the policy uses **connector endpoint filtering** on **HTTP with Microsoft Entra ID**, allow the URLs in §4 (licensing, `api.flow.microsoft.com`, `api.bap.microsoft.com`, or the sovereign-cloud equivalents) **before** any `* Deny` rule.

---

## 6. Advanced connector policies (ACP)

### 6.1 What ACP is
- A **strict allowlist**: any connector not explicitly allowed is **blocked**, including connectors added in the future.
- Supports **certified connectors** only. **Custom and HTTP connectors aren't supported yet**, and **virtual connectors** (such as the Copilot Studio connectors in rows 15–16) **won't be supported**. Govern those with classic data policies.
- **Modes:**
  - **Mixed** (default): ACP and classic data policies are both evaluated, and the most restrictive result wins.
  - **ACP-only.**
- **Nonblockable connectors** come preloaded as allowed.
- One effective ACP per environment. Removing a group rule **doesn't** remove it from environments that already inherited it; use **Remove rule**.

### 6.2 What the Kit needs in ACP
All connectors in §1 must be allowed. Add each one to the ACP allowlist, then confirm they're all on the list, including the preloaded nonblockable ones. ACP doesn't support **HTTP with Microsoft Entra ID (preauthorized)** (HTTP connectors) or rows 15–16 (Copilot Studio virtual connectors). Allow those through classic data policies instead (§5).

### 6.3 Setup steps
**Environment group (recommended):**
1. Power Platform admin center → **Manage** → **Environment groups** → select the group.
2. **Rules** → **Advanced connector policies**.
3. **Add connectors** → select every Kit connector → **Save**.
4. **Publish rules**.

**Single environment:**
1. Power Platform admin center → **Security** → **Data and privacy** → **Advanced connector policies**.
2. Select the environment → add the Kit connectors → **Save**.

### 6.4 Troubleshooting `AcpDlpPolicyEvaluation`
1. Find the connector ID in the error (for example `shared_agentnode`), then map it with the table in §1.
2. Check **both** the ACP for the environment or group **and** every classic data policy in scope. In Mixed mode either one can block.
3. Fix it, wait for propagation, then retry the import or installation.

---

## Sources
- Learn – Manage data policies: <https://learn.microsoft.com/power-platform/admin/prevent-data-loss>
- Learn – Connector classification (incl. nonblockable list): <https://learn.microsoft.com/power-platform/admin/dlp-connector-classification>
- Learn – Combined effect of multiple policies: <https://learn.microsoft.com/power-platform/admin/dlp-combined-effect-multiple-policies>
- Learn – Impact on apps and flows: <https://learn.microsoft.com/power-platform/admin/dlp-impact-policies-apps-flows>
- Learn – Connector endpoint filtering: <https://learn.microsoft.com/power-platform/admin/connector-endpoint-filtering>
- Learn – Configure data policies for agents (Copilot Studio connectors): <https://learn.microsoft.com/microsoft-copilot-studio/admin-data-loss-prevention>
- Learn – Advanced connector policies: <https://learn.microsoft.com/power-platform/admin/advanced-connector-policies>
