# Copilot Agent Kit for Admins

Copilot Agent Kit for Admins is a [Power Apps code app](https://learn.microsoft.com/power-apps/developer/code-apps/overview) for administrators. It is part of the Copilot Agent Kit. The app uses React, TypeScript, Vite, and Fluent UI.

> [!NOTE]
> The old name of the kit is Copilot Studio Kit. Some names in this folder still use the old name. For example, the npm package name of this app is `copilotstudiokitforadmins`.

The Copilot Agent Kit solution installs this app in your environment. To install the kit, see [Installing the Copilot Agent Kit](../../INSTALLATION_INSTRUCTIONS.md). Use this folder to examine the source code, or to build and deploy a development copy of the app.

## Contents

- [Features](#features)
- [Folder layout](#folder-layout)
- [Prerequisites](#prerequisites)
- [Set up the project](#set-up-the-project)
- [Configure your environment](#configure-your-environment)
- [Run the app locally](#run-the-app-locally)
- [Build, lint, and test](#build-lint-and-test)
- [Deploy a development copy](#deploy-a-development-copy)
- [Data sources](#data-sources)
- [Agent Library source](#agent-library-source)
- [Data collection](#data-collection)
- [Data sent to other services](#data-sent-to-other-services)
- [Known issues](#known-issues)
- [Contributing](#contributing)
- [License](#license)
- [Trademarks](#trademarks)

## Features

The menu of the app has these sections: Configure, Administration, Productivity, and Governance. This table shows where you find each feature.

| Feature | Where to find it | Source folder | Documentation |
| --- | --- | --- | --- |
| Agents | Configure > **Agents** | `src/features/agents` | [Configure agents in Copilot Agent Kit](../../CONFIGURE_COPILOTS.md) |
| Agent Inventory | Administration > **Agent Inventory** | `src/features/agent-inventory` | [Agent Inventory V2 (Preview)](../../AGENT_INVENTORY.md) |
| Conversation KPI | Administration > **Conversation KPI** | `src/features/conversation-kpis` | [Conversation KPI](../../CONVERSATION_KPI.md) |
| KPI Details View | Administration > **KPI Details View** | `src/features/kpi-details` | [Conversation KPI](../../CONVERSATION_KPI.md) |
| Conversation Analyzer | Administration > **Conversation Analyzer** | `src/features/conversation-analyzer` | [Conversation Analyzer (Preview)](../../CONVERSATION_ANALYZER.md) |
| Agent Value Summary | Administration > **Agent Value Summary** | `src/features/agent-value-summary` | [Agent value summary dashboard](../../AGENT_VALUE_SUMMARY_DASHBOARD.md) |
| Agent Insights Hub | Administration > **Agent Insights Hub** | `src/features/agent-insights-hub` | [Agent Insights Hub (Preview)](../../AGENT_INSIGHTS_HUB.md) |
| Agent Metric Studio | Administration > **Agent Insights Hub**, then **Build dashboard & forecast** | `src/features/agent-metric-studio` | [Dashboard & Forecasting (Preview)](../../AGENT_INSIGHTS_HUB.md#9-dashboard--forecasting-preview) |
| Agent Debugger | Administration > **Agent Debugger** | `src/features/agent-debugger` | [Agent Debugger](../../AGENT_DEBUGGER.md) |
| Agent Library | Productivity > **Agent Library** | `src/features/agent-library` | [Agent Library](../../AGENT_LIBRARY.md) |
| Compliance Hub | Governance > **Compliance Hub** | `src/features/compliance-hub` | [Define and enforce agent compliance](../../COMPLIANCE_HUB.md) |
| Request Center | Governance > **Request Center** | `src/features/power-shield` | [Govern connector access with Power Shield](../../POWER_SHIELD.md) |

When you open this app from the Copilot Agent Kit model-driven app, some menu items open pages of the model-driven app: Agents, Conversation KPI, KPI Details View, and Compliance Hub. When you open this app directly, for example in Local Play, these items open the pages of this app.

The `src/features/home` folder has a page that no menu item or route opens in this release.

## Folder layout

| Path | Contents |
| --- | --- |
| `src/features` | 1 folder for each feature |
| `src/shared` | Components, hooks, services, configuration, and utilities that the features share |
| `src/generated` | Models and services for the data sources, from the Power Apps CLI |
| `src/styles` | Styles |
| `src/types` | Type definitions that the app shares |
| `public` | Static files. Vite copies them to `dist`. |
| `.power` | Data source schemas for the Power Apps CLI |
| `power.config.json` | The code app configuration: environment, connections, and data sources |
| `build` | A Vite plugin for the offline viewer of the Agent Debugger |
| `vite.config.ts`, `vitest.config.ts` | Build and test configuration |
| `eslint.config.js` | Lint rules |
| `package.json`, `package-lock.json` | npm scripts and the packages that the app uses |

## Prerequisites

- Node.js 22.13 or later, and npm
- Git
- A Power Platform environment with code apps turned on. See [Enable code apps on a Power Platform environment](https://learn.microsoft.com/power-apps/developer/code-apps/overview#enable-code-apps-on-a-power-platform-environment).
- The Copilot Agent Kit solution in that environment. The app uses the tables and the cloud flows of the solution.
- A Power Apps Premium license for each user of the app. See [License end users with Power Apps Premium](https://learn.microsoft.com/power-apps/developer/code-apps/overview#license-end-users-with-power-apps-premium).

## Set up the project

1. Clone the repository:

   ```bash
   git clone https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit.git
   ```

2. Go to the folder of the app:

   ```bash
   cd Power-CAT-Copilot-Studio-Kit/code-apps/admin
   ```

3. Install the packages:

   ```bash
   npm ci
   ```

## Configure your environment

The `power.config.json` file in this repository has placeholder values. Set the values for your environment before you run or deploy the app.

1. Find the ID of your environment. See [Find your environment and organization IDs](https://learn.microsoft.com/power-platform/admin/determine-org-id-name#find-your-environment-and-organization-ids).
2. In `power.config.json`, set `environmentId` to the ID of your environment.
3. Keep `appId` as `null`. The Power Apps CLI sets this value when you deploy the app.
4. Do these steps for each flow in the table that follows:
   1. Run `npx power-apps list-flows --search "<name>"`. Replace `<name>` with a part of the flow name, for example `LogFeatureTelemetry`.
   2. In the output, copy the value in the **Flow ID** column.
   3. In `power.config.json`, find the entry in `connectionReferences` that has the data source name of the flow in `dataSources`.
   4. Set `workflowDetails.workflowName` of this entry to the flow ID.

If the CLI asks you to sign in, use an account that can access the environment.

| Flow in the Copilot Agent Kit solution | Data source name |
| --- | --- |
| Global \| LogFeatureTelemetry | `logfeaturetelemetry` |
| Agent Inventory \| Agents Data Load OnDemand | `agentinventory_agentsdataloadondemand` |
| Agent Inventory \| Agent Data for Actions | `agentinventory_agentdataforactions` |
| Agent Inventory \| Agent Actions | `agentinventory_agentactions` |
| Agent Inventory \| Environment Data Load | `agentinventory_environmentdataload` |

Do not change `workflowEntityId`. Do not use `npx power-apps add-flow` for these flows, because `power.config.json` already has their entries.

> [!WARNING]
> Do not commit the values of your environment. To restore the file, run `git checkout -- power.config.json`.

## Run the app locally

1. Do the steps in [Configure your environment](#configure-your-environment).
2. Run `npm run dev`. Vite starts the app at `http://localhost:3001/` and shows a **Local Play** URL.
3. Open the Local Play URL in the browser profile that you use for Power Platform.

If port 3001 is in use, Vite uses the next free port. The Local Play URL then has the correct port. If the browser asks for access to the local network, allow it.

For more information about Local Play, see [Step 3: Run the app locally](https://learn.microsoft.com/power-apps/developer/code-apps/how-to/create-an-app-from-scratch#step-3-run-the-app-locally). That article uses a newer version of the Power Apps CLI, so its commands are different.

## Build, lint, and test

| Command | What it does |
| --- | --- |
| `npm run build` | Checks the types with `tsc -b`, then builds the app into the `dist` folder with Vite |
| `npm run lint` | Checks the code with ESLint |
| `npm test` | Runs the tests with Vitest |
| `npm run preview` | Serves the `dist` folder on your computer |

The build uses Vite 8.2.0 with Rolldown and `@vitejs/plugin-react` 6.0.5. The type check uses TypeScript 5.9. The tests use Vitest 4.1.10.

`npm test` runs the tests of the Agent Debugger and Request Center features. For the test files, see `vitest.config.ts`.

The checks for this release used Node.js 26.13.0 and npm 11.20.0. All 283 tests pass. Lint reports 0 errors and 87 warnings. See [Known gaps](#known-gaps).

## Deploy a development copy

You can deploy your own copy of the app for development and tests.

1. Do the steps in [Configure your environment](#configure-your-environment).
2. Run `npm run build`.
3. Run `npx power-apps push`.
4. The CLI asks if you want to put the app into a solution. If you select yes, enter the name or the ID of the solution.

If you select no, the CLI uses the preferred solution of the environment. If the environment has no preferred solution, the CLI does not put the app into a solution.

When `appId` is `null`, the CLI creates a new app and writes its ID to `appId` in `power.config.json`. The new app does not replace the app that the Copilot Agent Kit solution installs. Do not commit the changed `power.config.json`.

The build puts the PNG, JPG, GIF, WebP, and ICO images that the code imports into the JavaScript files as data URIs. This prevents a known issue: `power-apps push` can corrupt binary image files ([microsoft/PowerAppsCodeApps#316](https://github.com/microsoft/PowerAppsCodeApps/issues/316)). See `vite.config.ts`. The build copies the 5 JPG and PNG files in `public/media` without change. The source code of the app does not refer to these files. Issue #316 is closed, and a later version of the Power Apps CLI has the fix. This project does not change the CLI version (`@microsoft/power-apps` 1.1.1 and `@microsoft/power-apps-cli` 0.10.0 in `package-lock.json`).

## Data sources

The `connectionReferences` section of `power.config.json` has these connections:

| Data source name | Connection |
| --- | --- |
| `commondataserviceforapps` | Microsoft Dataverse |
| `powerappsforappmakers` | Power Apps for Makers |
| `powerplatformforadmins` | Power Platform for Admins |
| `powerplatformadminv2` | Power Platform for Admins V2 |
| `office365users` | Office 365 Users |
| `logfeaturetelemetry` | Cloud flow Global \| LogFeatureTelemetry |
| `agentinventory_agentsdataloadondemand` | Cloud flow Agent Inventory \| Agents Data Load OnDemand |
| `agentinventory_agentdataforactions` | Cloud flow Agent Inventory \| Agent Data for Actions |
| `agentinventory_agentactions` | Cloud flow Agent Inventory \| Agent Actions |
| `agentinventory_environmentdataload` | Cloud flow Agent Inventory \| Environment Data Load |

The `databaseReferences` section lists the 57 Dataverse tables that the app uses. The `.power/schemas/dataverse` folder has the schemas of these tables.

These schema files of the development environment are not in this repository:

- The schemas of the Microsoft Dataverse, Office 365 Users, Power Apps for Makers, Power Platform for Admins, and Power Platform for Admins V2 connectors
- 2 schema files for the Microsoft 365 Copilot catalog connector

These files had values from the development environment, for example tenant IDs and connection URLs. The build does not use them. The Power Apps CLI uses them when it refreshes the data sources. To refresh the data sources in your environment:

1. Do the steps in [Configure your environment](#configure-your-environment).
2. Run `npx power-apps refresh-data-source`. The command refreshes all the data sources of the app.
3. Examine the changes with `git diff`.
4. Do not commit the new `*.Schema.json` files. They have values from your environment.

## Agent Library source

The `src/features/agent-library/library` folder has the source code of the Agent Library (109 files). The Agent Library page of the app uses this code. Copilot Agent Kit for Makers has an identical copy of this folder, so that each app builds alone. If you change the library, make the same change in both copies.

## Data collection

The software may collect information about you and your use of the software and send it to Microsoft. Microsoft may use this information to provide services and improve our products and services. You may turn off the telemetry as described in the repository. There are also some features in the software that may enable you and Microsoft to collect data from users of your applications. If you use these features, you must comply with applicable law, including providing appropriate notices to users of your applications together with a copy of Microsoft’s privacy statement. Our privacy statement is located at https://go.microsoft.com/fwlink/?LinkID=824704. You can learn more about data collection and use in the help documentation and our privacy statement. Your use of the software operates as your consent to these practices.

### What the app sends

When you open a feature page, the app sends an event to the cloud flow **Global | LogFeatureTelemetry** in your environment. For each feature, the app sends not more than 1 event in 5 seconds. The app also sends an event when you start an analysis in the Agent Debugger.

Each event has these values:

| Value | Description |
| --- | --- |
| `appName` | `Admin` |
| `featureName` | The ID of the feature, for example `agent-library` |
| `featureLabel` | The name of the feature, for example `Agent Library` |
| `userTimestamp` | The date and time of the event, in ISO 8601 format |

The feature IDs are `agent-debugger-load`, `agent-insights-hub`, `agent-inventory`, `agent-library`, `agent-metric-studio`, `agent-value-summary`, `agents`, `compliance-hub`, `conversation-analyzer`, `conversation-kpis`, `kpi-details`, and `power-shield`. The ID of the analysis event is `agent-debugger-analyze`.

The app sends no events before its routes are ready. If the app cannot send an event, it writes a message to the browser console. The user does not see an error. For the source code, see `src/shared/services/featureTelemetry.ts`.

### Turn off the data collection

To stop the data collection, turn off the cloud flow **Global | LogFeatureTelemetry** in your environment. The app continues to operate. The run history of the flow keeps the values of earlier events.

## Data sent to other services

Some features send data to AI Builder. The app calls the Dataverse `Predict` action in the environment of the app. AI Builder runs the prompt in that environment. For more information, see [AI Builder architecture](https://learn.microsoft.com/ai-builder/ai-builder-architecture).

### Conversation Analyzer

When you start an analysis, the app reads the transcripts from the selected environment. For each conversation, the app sends the text of the agent messages and the user messages to AI Builder. If you use a custom prompt, the app also sends the text of the prompt.

The environment of the app can be different from the environment of the transcripts.

The app saves 1 record for each conversation in the environment of the app. The record has the transcript name, the agent ID, the conversation ID, the environment URL, the full transcript, the number of messages, the duration, the summary, the result of the prompt, and a reference to the prompt.

After the save, the app deletes the earlier results for the same agent, conversation, prompt, and environment. If the analysis of a conversation fails, the app saves no result for it, and the earlier results stay.

If 1 or more conversations fail, or if the run stops with an error, the app saves a log record. The record has the start and end time, the environment name and URL, the prompt name, the number of failures, the run error, and for each failure the conversation ID, the agent name, and the error message.

### AI-generated agent descriptions

The details page of an agent in Agent Inventory can show a description that AI Builder generates. The app does this for a Microsoft Copilot agent that has instructions and no description. The app sends only the instructions. The app shows the result and does not save it.

This setting is on by default. To stop these calls, open the Agent Inventory settings. In **Inventory options**, turn off the AI-generated description.

### Feedback

On the Agent Value Summary pages, **Feedback** opens a Microsoft Forms form in a new browser tab. The link is fixed, and the app adds no data to it.

## Known issues

- `npm test` does not run `src/features/agent-debugger/utils/__tests__/turn-timing.test.mjs`, because `vitest.config.ts` does not include it. `node --test` stops with an import error for `mergeClasses` on Node.js 22 and Node.js 26.
- Some text in the app uses the earlier name "GitHub Copilot" for Microsoft Copilot agents. This publication does not change the app text.

## Known gaps

A fix for these items needs a change to the logic or to the module structure of the app. This publication does not make these changes.

- `npm run lint` reports 87 warnings:
  - `react-hooks/set-state-in-effect`: 45
  - `react-hooks/exhaustive-deps`: 14
  - `react-hooks/refs`: 10
  - `@typescript-eslint/no-unused-vars`: 8
  - `react-refresh/only-export-components`: 5
  - `react-hooks/immutability`: 2
  - `react-hooks/set-state-in-render`: 1
  - `react-hooks/preserve-manual-memoization`: 1
  - `react-hooks/use-memo`: 1

  The recommended React Hooks configuration sets `react-hooks/exhaustive-deps` to `warn`. `eslint.config.js` sets the other rules in this list to `warn`. For `@typescript-eslint/no-unused-vars`, this applies only to the 7 files that have these warnings.
- The code in `src` has 169 `console.log` calls. This publication removes the `console.log` calls that wrote identity data of users. It also removes the Microsoft Entra object ID of the user from 1 `console.error` message. A logger can replace the other calls in a later change.
- `npm audit` reports 35 advisories: 17 high, 17 moderate, and 1 low. This publication does not change the dependency versions.

## Contributing

This project welcomes contributions and suggestions. For the rules, see [Contribute to the code apps](../../CONTRIBUTING.md#contribute-to-the-code-apps). To report a security issue, see [Security](../../SECURITY.md). To get help, see [Support](../../SUPPORT.md).

## License

Copyright (c) Microsoft Corporation. Licensed under the [MIT License](../../LICENSE.txt).

## Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft trademarks or logos is subject to and must follow [Microsoft’s Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general). Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship. Any use of third-party trademarks or logos are subject to those third-party’s policies.
