# Copilot Studio Accelerator prerequisites

The Copilot Studio Accelerator is built using Power Platform and requires adequate licensing and capacity.

## Mandatory requirements

- A [**Power Platform environment with Dataverse as a data store**](https://learn.microsoft.com/power-platform/admin/create-environment). <br>
  Microsoft Dataverse is used to store the Copilot Studio Accelerator configuration and test tables data. <br>
- Adequate licensing to run a **Power Apps model-driven application**.
- Adequate licensing to run **Power Automate cloud flows** using **Premium** connectors.

> [!NOTE]
> You can install the Copilot Studio Accelerator in the same environment where you host your Microsoft Copilot Studio copilots, but this isn't mandatory.
> - If installed as part of Power Platform, refer to [Microsoft Power Platform Licensing Guide](https://go.microsoft.com/fwlink/?linkid=2085130).
> - If installed as part of Dynamics 365, refer to  [Dynamics 365 Licensing Guide](https://go.microsoft.com/fwlink/p/?LinkId=866544)

## Optional requirements

- Azure Monitor **Application Insights**.<br>
  This integration is useful to get additional technical details for AI-generated answers.
- **AI Builder credits**.<br>
  This integration is useful to use AI Builder prompts to analyze an AI-generated answer and compare it with a sample answer or validation instructions.

## Connector requirements

- [Microsoft Dataverse](https://learn.microsoft.com/connectors/commondataserviceforapps/)
- [Azure Application Insights](https://learn.microsoft.com/connectors/applicationinsights/)
- HTTP Requests
