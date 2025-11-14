# Define and enforce compliance with Agent Governance Hub

The Agent Governance Hub enables organizations using Copilot Studio to balance innovation with compliance. It provides visibility, automated compliance enforcement, and clear workflows for both administrators and makers. The system implements continuous compliance monitoring — agents are created freely within Power Platform admin center configurations, but compliance is enforced after creation based on configurable risk thresholds. If compliance is not achieved within a defined SLA, automated enforcement actions (such as quarantine or delete) are applied.

## Key concepts
- Continuous compliance monitoring: Agents are created without friction within allowed limits configured by admin center controls; compliance is enforced post-creation if risk thresholds are breached.
- Compliance case: Automatically created when an agent breaches a risk threshold. Tracks remediation, SLA, and enforcement.
- SLA (Service Level Agreement): The time window for makers to remediate compliance issues before enforcement actions are triggered.
- Enforcement actions: Automated actions (Manual review, Quarantine, Delete) applied if compliance is not achieved within SLA.

## Roles and responsibilities

### Administrator
- Configure compliance thresholds, risk levels, enforcement actions, and SLA timers.
- Monitor agent inventory and compliance posture.
- Review, approve, or reject compliance cases.
- Maintain audit trails and documentation.

### Maker
- Receives notifications when compliance thresholds are breached.
- Provides business justification and confirms ownership for non-compliant agents.
- Remediates compliance issues within the SLA.
- Views compliance status and receives reminders.

## Get started

Setup and configure the governance components using the Copilot Studio Kit setup wizard.

1. Install and launch the Copilot Studio Kit. Follow the [Copilot Studio kit setup instructions](LINK).
1. Use the setup wizard to enable the flows and environment variables.
1. To use compliance hub processes, enable all the flow starting with "Agent Compliance" and "Agent Inventory". 
1. Environment variables: 
    | Display Name| Description| Requires manual input |
    |--------------------------------------------|-----------------------------------------------------------------------------|------------------------|
    | Admin Approval Before Maker Notification   | Determines if admin approval is needed before notifying makers | |
    | App ID | Unique identifier for the Copilot Studio Kit application | Yes |
    | Case Intake SLA | Service Level Agreement for case intake timing | |
    | Case Review SLA                          | SLA for reviewing cases in the compliance process                          |                    |
    | Case Summary Email Frequency               | How often case summary emails are sent                                     |                    |
    | Compliance Admin Group ID                  | Group ID for compliance administrators                                     |                   Yes | 
    | Compliance Documentation Link              | URL to compliance documentation                                            |                   Yes (optional) |
    | Compliance Support Contact Alias           | Email alias for compliance support                                         | Yes (optional)                   |
    | Instance Url                               | URL of the environment instance                                            | Yes                   |
    | Maker Team ID                              | Team ID for makers in the organization                                     | Yes                   |
    | Power Automate Region                      | Region where Power Automate resources are hosted                           |                    |
    | Require Case For No Risk                   | Indicates if a case is required even when risk is low                      |                     |
    | Send Case Alerts To Maker Via Email        | Enables email alerts for makers when cases are triggered                   |                     |
    | Send Case Alerts To Maker Via Teams | Enables Teams alerts for makers when cases are triggered | |

> **Important:**</br>
> - **Require Admin Consent For Notification** - We recommend enabling this variable during initial configuration to avoid excessive notifications or preventing unwanted governance action automation on non-compliant cases (quarantine or delete). This will not send notifications or start any SLA countdowns unless an admin decides to send the notification on the case details screen in compliance hub. Once thresholds are configured, this can be disabled in the Compliance Hub settings page, which will allow notices and policy enforcement to happen automatically.
>
> - **Create case for every agent**: Disabled by default. When disabled, cases are only created for agents that violate a compliance threshold. If enabled, a case will be created for all agents, even if there is no violation. 
> - If makers do not submit intake details within the SLA, the configured no risk enforcement will be implemented.
><br>

## Configure governance policies
Governance policies are implemented through configurable controls that:
- Define what is considered compliant or non-compliant agent behavior (e.g., authentication methods, sharing scope, connector usage).
- Specify what actions should be taken when agents do not meet compliance standards.
- Ensure visibility, accountability, and auditability for all agents in the tenant.

The following governance components are used to define and enforce the policies and procedures that best define your organization's threat tolerance.

### Compliance thresholds (`Threshold Config` table)
Each row defines risk thresholds for a specific agent attribute represented in the Agent Details table. This defines your threat tolerance.

### Enforcement actions (`Action Policies` table)
Set actions (Manual, Quarantine, Delete) and SLA timers for each risk level.

#### Example: Enforcement Actions by Risk Level

| Risk Level	| SLA Days	| Enforcement Action	|Description |
|-|-|-|-|
|Low	|10|	Manual|	Admin reviews/reminders|
|Medium	|5|	Quarantine|	Agent disabled if overdue|
|High|	3|	Delete|	Agent deleted if overdue|

### Manage compliance cases and configure settings

- Use the Dashboard to view KPIs (Total Agents, Open Cases, SLA Breaches, etc.).
- Access Inventory for a wholistic list of agents.
- Adjust settings for thresholds, action policies, email templates, and environment variables as needed on the Settings page.

## Conduct compliance reviews (admin)

1. Monitor compliance cases
   - Navigate to Compliance Cases in the app.
   - Filter cases by status (Open, SLA Breach, Approved, Expired) and risk level.

2. Review case details. Open a compliance case record to view:
   - Triggered thresholds
   - Maker's intake (business justification, owner confirmation). 
   - Automated scan results (DLP/connectors/knowledge sources)
   - SLA countdown and event timeline
3. Approve or reject cases
   - Use the Approve/Reject command bar to make decisions.
   - Add audit notes for documentation.
   - If intake is incomplete or violations persist past SLA, enforcement actions are triggered automatically.
4. Audit and reporting
   - Use dashboards and charts for trend analysis (e.g., distribution of important case statuses, risk level distribution).
   - Maintain thorough documentation for all compliance cases.
   - Enable auditing in the PPAC environment settings to ensure case level auditing is available.
   - Timeline activities are also posted on cases for historical account.

## Agent maker responsibilities
1. Respond to notifications
•	When a compliance case is opened, you’ll receive a Microsoft Teams notification linked to your case.
2. Complete intake
•	The Microsoft Teams notification is an adaptive card that accepts three input fields that can be submitted back to your case.
•	Provide required business justification, data classification, and expected number of users, and submit the form.
3. Remediate issues
•	Fix any compliance violations identified in the case that are medium or high risk.
•	Resubmit or save your intake to trigger re-evaluation.
4. Monitor SLA
•	Track the SLA countdown via notifications that are sent daily. You’ll receive reminders as the SLA deadline approaches.
•	Failure to comply within the SLA may result in agent quarantine or deletion.

Process flow
Below is a high-level process for agents violating compliance thresholds:
 
Summary:
1.	Agent is created or updated.
2.	Automated detection checks for compliance.
3.	If thresholds are breached:
o	Compliance case is opened.
o	Maker is notified and must complete intake.
o	SLA countdown begins.
4.	Admin reviews case and intake.
5.	If compliant, case is approved.
6.	If not compliant within SLA, enforcement action is applied.

Reference: Data model and policies
Key Tables
•	Compliance Case: Tracks workflow, SLA, and enforcement.
•	Role Assignment: Assigns accountability roles to agents.
•	Compliance Rules: Stores threshold metrics and admin settings.
•	Action Policy: Defines enforcement actions per risk level.
•	Email Template: Manages notification templates.

Default compliance rules
Category	Filter Name	Risk Level	Enabled	Mitigation
Auth Mode	Microsoft Authentication	Low	No	Admin review only
Auth Mode	API Key Authentication	High	Yes	
Auth Mode	No Authentication	High	Yes	
Publication Status	Published agents	High	Yes	
Publication Status	Draft agents	Low	Yes	
Environment ring	Production environments	High	Yes	
Sharing Scope	Org wide allowed	High	Yes	

> [!NOTE]
> If a threshold is defined for all possibilities in a certain category (for example, for all auth modes), then a case will be created for every agent.
FAQs and troubleshooting
Q: What happens if I don’t complete intake within the SLA?
A: The system will automatically apply the configured enforcement action (e.g., quarantine or delete the agent).
Q: How do I know which compliance issues to fix?
A: Review the checklist and findings in your compliance case. Automated checks highlight any “Fail” items.
Q: Who do I contact for help?
A: Use the contact information provided in your notification email or reach out to your CoE Admin team.
