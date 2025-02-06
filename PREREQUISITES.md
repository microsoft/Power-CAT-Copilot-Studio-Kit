# Power CAT Copilot Studio Kit prerequisites

The Power CAT Copilot Studio Kit is built using Power Platform and requires adequate licensing and capacity.

## Mandatory requirements

- A [**Power Platform environment with Dataverse as a data store**](https://learn.microsoft.com/power-platform/admin/create-environment). <br>
  Microsoft Dataverse is used to store the Power CAT Copilot Studio Kit configuration and test tables data. <br>
  The user performing the installation of the Power CAT Copilot Studio Kit must have the **system administrator** security role on the environment.
- Adequate licensing to run a **Power Apps model-driven application**.
- Adequate licensing to run **Power Automate cloud flows** using **Premium** connectors.

> [!NOTE]
> Power CAT Copilot Studio Kit can be installed in the same environment where you host your custom agents, but this isn't mandatory. <br>
> On licensing:
> - If installed as part of Power Platform, refer to [Microsoft Power Platform Licensing Guide](https://go.microsoft.com/fwlink/?linkid=2085130).
> - If installed as part of Dynamics 365, refer to  [Dynamics 365 Licensing Guide](https://go.microsoft.com/fwlink/p/?LinkId=866544)

- **Azure Application Insights**.<br>
  This integration is required to get additional telemetry details for AI-generated answers. <br>
  Refer to this [documentation](https://learn.microsoft.com/microsoft-copilot-studio/advanced-bot-framework-composer-capture-telemetry?tabs=webApp) on how to integrate Azure Application Insights with Microsoft Copilot Studio.

## Dependencies

- Copilot Studio Kit is using advanced components from the Creator Kit, please make sure to deploy it before deploying Copilot Studio Kit - [Creator Kit installation instructions](https://learn.microsoft.com/power-platform/guidance/creator-kit/setup)

## Optional requirements

- **AI Builder credits**.<br>
  This integration is useful to use AI Builder prompts to analyze an AI-generated answer and compare it with a sample answer or validation instructions. <br>
  Learn more about AI Builder prompts licensing [here](https://learn.microsoft.com/ai-builder/credit-management#ai-prompt-licensing).

## Connector requirements

- [Microsoft Dataverse](https://learn.microsoft.com/connectors/commondataserviceforapps/)

## Next step
[Installation instructions](./INSTALLATION_INSTRUCTIONS.md)
