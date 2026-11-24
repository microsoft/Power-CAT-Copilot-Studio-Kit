# Copilot Agent Kit for Makers

Copilot Agent Kit for Makers is a [Power Apps code app](https://learn.microsoft.com/power-apps/developer/code-apps/overview) for agent makers. It is part of the Copilot Agent Kit. The app uses React, TypeScript, Vite, and Fluent UI.

> [!NOTE]
> The old name of the kit is Copilot Studio Kit. Some names in this folder still use the old name. For example, the npm package name of this app is `copilotstudiokitformakers`.

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
- [Agent Review Tool notes](#agent-review-tool-notes)
- [Contributing](#contributing)
- [License](#license)
- [Trademarks](#trademarks)

## Features

The menu of the app has these sections: Configure, Productivity, and Governance. This table shows where you find each feature.

| Feature | Where to find it | Source folder | Documentation |
| --- | --- | --- | --- |
| Agents | Configure > **Agents** | `src/features/agents` | [Configure agents in Copilot Agent Kit](../../CONFIGURE_COPILOTS.md) |
| Agent Library | Productivity > **Agent Library** | `src/features/agent-library` | [Agent Library](../../AGENT_LIBRARY.md) |
| Agent Change Tracker | Productivity > **Agent Change Tracker** | `src/features/agent-change-tracker` | [Agent Change Tracker](../../AGENT_CHANGE_TRACKER.md) |
| Webchat Playground | Productivity > **Webchat Playground** | `src/features/webchat-playground` | [Webchat Playground](../../WEBCHAT_PLAYGROUND.md) |
| Advanced Testing | Productivity > **Advanced Testing** | `src/features/advanced-testing` | [Testing capabilities](../../TESTING_CAPABILITIES.md) |
| Model Assessment | Productivity > **Advanced Testing**, then **Model assessment** | `src/features/model-assessment` | [Model Assessment (Preview)](../../MODEL_ASSESSMENT.md) |
| Agent Review Tool | Productivity > **Agent Review Tool** | `src/features/agent-review-tool` | [Agent Review Tool](../../AGENT_REVIEW_TOOL.md) |
| Adaptive Cards | Productivity > **Adaptive Cards** | `src/features/adaptive-cards` | [Adaptive cards gallery](../../ADAPTIVE_CARDS_GALLERY.md) |
| Prompt Advisor | Productivity > **Prompt Advisor** | `src/features/prompt-advisor` | [Prompt Advisor](../../PROMPT_ADVISOR.md) |
| Request Center | Governance > **Request Center** | `src/features/power-shield` | [Govern connector access with Power Shield](../../POWER_SHIELD.md) |

When you open this app from the Copilot Agent Kit model-driven app, some menu items open pages of the model-driven app: Agents, Webchat Playground, and Adaptive Cards. When you open this app directly, for example in Local Play, these items open the pages of this app.

The `src/features/collaboration-hub` folder has a page that no menu item or route opens in this release.

## Folder layout

| Path | Contents |
| --- | --- |
| `src/features` | 1 folder for each feature |
| `src/shared` | Components, hooks, services, configuration, and utilities that the features share |
| `src/generated` | Models and services for the data sources, from the Power Apps CLI |
| `src/styles` | Styles |
| `public` | Static files. Vite copies them to `dist`. |
| `.power` | Data source schemas for the Power Apps CLI |
| `power.config.json` | The code app configuration: environment, connections, and data sources |
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
   cd Power-CAT-Copilot-Studio-Kit/code-apps/makers
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

Do not change `workflowEntityId`. Do not use `npx power-apps add-flow` for these flows, because `power.config.json` already has their entries.

> [!WARNING]
> Do not commit the values of your environment. The test `src/features/agent-review-tool/services/__tests__/powerConfigFlowBindings.test.ts` expects the placeholder flow ID, so it fails after you set your flow ID. To restore the file, run `git checkout -- power.config.json`.

## Run the app locally

1. Do the steps in [Configure your environment](#configure-your-environment).
2. Run `npm run dev`. Vite starts the app at `http://localhost:3002/` and shows a **Local Play** URL.
3. Open the Local Play URL in the browser profile that you use for Power Platform.

If port 3002 is in use, Vite uses the next free port. The Local Play URL then has the correct port. If the browser asks for access to the local network, allow it.

For more information about Local Play, see [Step 3: Run the app locally](https://learn.microsoft.com/power-apps/developer/code-apps/how-to/create-an-app-from-scratch#step-3-run-the-app-locally). That article uses a newer version of the Power Apps CLI, so its commands are different.

## Build, lint, and test

| Command | What it does |
| --- | --- |
| `npm run build` | Checks the types with `tsc -b`, then builds the app into the `dist` folder with Vite |
| `npm run lint` | Checks the code with ESLint |
| `npm test` | Runs the tests with Vitest |
| `npm run preview` | Serves the `dist` folder on your computer |

The build uses Vite 8.2.0 with Rolldown and `@vitejs/plugin-react` 6.0.5. The type check uses TypeScript 5.9. The tests use Vitest 4.1.10.

`npm test` runs the tests of the Agent Review Tool, Model Assessment, Advanced Testing, and Request Center features. For the test files, see `vitest.config.ts`.

The checks for this release used Node.js 26.13.0 and npm 11.20.0. All 4980 tests pass. Lint reports 0 errors and 63 warnings. See [Known gaps](#known-gaps).

## Deploy a development copy

You can deploy your own copy of the app for development and tests.

1. Do the steps in [Configure your environment](#configure-your-environment).
2. Run `npm run build`.
3. Run `npx power-apps push`.
4. The CLI asks if you want to put the app into a solution. If you select yes, enter the name or the ID of the solution.

If you select no, the CLI uses the preferred solution of the environment. If the environment has no preferred solution, the CLI does not put the app into a solution.

When `appId` is `null`, the CLI creates a new app and writes its ID to `appId` in `power.config.json`. The new app does not replace the app that the Copilot Agent Kit solution installs. Do not commit the changed `power.config.json`.

`npx power-apps push` with the CLI version in this project can damage binary image files ([microsoft/PowerAppsCodeApps#316](https://github.com/microsoft/PowerAppsCodeApps/issues/316)). The Makers build keeps 9 PNG images as separate files: the Agent Map image `mcp-mark-mask.png` of the Agent Review Tool, and 8 images that the Agent Library code imports. After a push, these files can be damaged. The app shows only `mcp-mark-mask.png`: in this app, the Agent Library shows SVG icons for its templates, and it does not show its 3 hero images. The build also copies the 7 JPG and PNG files in `public/media` without change. The source code of the app does not refer to these files. Issue #316 is closed, and a later version of the Power Apps CLI has the fix. This project does not change the CLI version (`@microsoft/power-apps` 1.1.1 and `@microsoft/power-apps-cli` 0.10.0 in `package-lock.json`).

## Data sources

The `connectionReferences` section of `power.config.json` has these connections:

| Data source name | Connection |
| --- | --- |
| `commondataserviceforapps` | Microsoft Dataverse |
| `powerappsforappmakers` | Power Apps for Makers |
| `logfeaturetelemetry` | Cloud flow Global \| LogFeatureTelemetry |

The `databaseReferences` section lists the 41 Dataverse tables that the app uses. The `.power/schemas/dataverse` folder has the schemas of these tables.

These schema files of the development environment are not in this repository:

- The schemas of the Microsoft Dataverse, Power Apps for Makers, and Power Platform for Admins connectors
- 2 schema files for the Microsoft 365 Copilot catalog connector

These files had values from the development environment, for example tenant IDs and connection URLs. The build does not use them. The Power Apps CLI uses them when it refreshes the data sources. To refresh the data sources in your environment:

1. Do the steps in [Configure your environment](#configure-your-environment).
2. Run `npx power-apps refresh-data-source`. The command refreshes all the data sources of the app.
3. Examine the changes with `git diff`.
4. Do not commit the new `*.Schema.json` files. They have values from your environment.

The file `src/generated/services/M365CopilotCatalogService.ts` is the generated service for the Microsoft 365 Copilot catalog connector. `power.config.json` has no connection for this connector, and no feature calls this service.

## Agent Library source

The `src/features/agent-library/library` folder has the source code of the Agent Library (109 files). The Agent Library page of the app uses this code. Copilot Agent Kit for Admins has an identical copy of this folder, so that each app builds alone. If you change the library, make the same change in both copies.

## Data collection

The software may collect information about you and your use of the software and send it to Microsoft. Microsoft may use this information to provide services and improve our products and services. You may turn off the telemetry as described in the repository. There are also some features in the software that may enable you and Microsoft to collect data from users of your applications. If you use these features, you must comply with applicable law, including providing appropriate notices to users of your applications together with a copy of Microsoft’s privacy statement. Our privacy statement is located at https://go.microsoft.com/fwlink/?LinkID=824704. You can learn more about data collection and use in the help documentation and our privacy statement. Your use of the software operates as your consent to these practices.

### What the app sends

When you open a feature page, the app sends an event to the cloud flow **Global | LogFeatureTelemetry** in your environment. For each feature, the app sends not more than 1 event in 5 seconds. The app also sends an event when you start a review in the Agent Review Tool.

Each event has these values:

| Value | Description |
| --- | --- |
| `appName` | `Makers` |
| `featureName` | The ID of the feature, for example `agent-library` |
| `featureLabel` | The name of the feature, for example `Agent Library` |
| `userTimestamp` | The date and time of the event, in ISO 8601 format |

The feature IDs are `adaptive-cards`, `advanced-testing`, `agent-change-tracker`, `agent-library`, `agent-review-tool-load`, `agents`, `model-assessment`, `power-shield`, `prompt-advisor`, and `webchat-playground`. The ID of the review event is `agent-review-tool-submission`.

The app sends no events before its routes are ready. If the app cannot send an event, it writes a message to the browser console. The user does not see an error. For the source code, see `src/shared/services/featureTelemetry.ts`.

### Turn off the data collection

To stop the data collection, turn off the cloud flow **Global | LogFeatureTelemetry** in your environment. The app continues to operate. The run history of the flow keeps the values of earlier events.

## Data sent to other services

Some features send data to AI Builder. The app calls the Dataverse `Predict` action in the environment of the app. AI Builder runs the prompt in that environment. For more information, see [AI Builder architecture](https://learn.microsoft.com/ai-builder/ai-builder-architecture).

### Prompt Advisor

**Analyze**, **Refresh**, and **Apply and refine** send the text of the prompt and the number of samples (5) to AI Builder. The app shows the result and does not save it.

### Model Assessment

When the comparison of 2 runs is ready, the app sends data about the comparison to AI Builder. The app keeps the result in memory. It sends the request again when a comparison needs the result after you reload the page, after no open comparison uses the result for 30 minutes, or after the number of checks or their results change. If a call fails with a temporary error, the app tries again. 1 recommendation can send up to 6 calls. The app sends the data only when the 2 runs are of the same kind and have at least 1 shared scored check. The app sends:

- The agent name.
- For each run: the model, the dates, the status, the check counts, the pass rate, and the credits.
- For each test set: the name, and the pass, fail, and error counts.
- The coverage, and the verdict that the app calculates.
- Not more than 6 sample checks in each of 4 groups. For each sample: the test set, the question (not more than 240 characters), the metric, and for each run, the status and the reason of the grader (not more than 300 characters).

The app shows the result. You can add the result to the comparison PDF. The app does not save the result in Dataverse.

### Agent Review Tool

The Agent Review Tool sends data in 2 ways:

- The review workflow. The app creates a review job in Dataverse in the environment of the app and attaches the file `review-corpus.json`. The **Review Agent Components** workflow sends the review text in this file to an AI agent step (connector `shared_agentnode`).
- AI Builder prompts.

The kind of review sets the data that the app sends:

- **Standard**: The app always uses the review workflow. The file has the name, the instructions, and the description of the agent, and the number of topics, tools, connected agents, knowledge sources, and entities. For each topic that is not a standard system topic, the file has the name, the model name and description, the trigger phrases, and the names and descriptions of the input and output variables. For each tool and connected agent that has a description, the file has the name and the description, and for a tool also the display name. The file does not have the names or URLs of knowledge sources, the content of topic nodes, or the content of knowledge files.
- **Microsoft Copilot** and **Skills and automations**: The app uses the review workflow by default. The app removes secrets from the file, and the file has only metadata for binary files. If the browser local storage key `csk.reviewAiProvider` has the value `prompt`, the app uses AI Builder prompts. A resumed job always uses the review workflow.
- **M365 Declarative Agent**: In the review workflow file, the app removes secrets. The file has a size limit and no binary content. For custom skills, the app always uses AI Builder prompts. The app sends the skill markdown, the agent instructions, the names and descriptions of the other skills, the resource manifest and excerpts, and the findings of the local rule checks. When the agent has more than 1 custom skill, the app also runs a cross-skill prompt.

The app saves the results in Dataverse in the environment of the app.

### Links to Copilot Studio

Some links open `copilotstudio.preview.microsoft.com` in a new browser tab. The URLs of these links have IDs:

- **Open in Copilot Studio** on the **Evaluation coverage** tab of a review that has no coverage data. The URL has the ID of the environment of the agent and the agent ID. This link does not show for ZIP reviews.
- **Copilot Studio** in the text "Create agents in Copilot Studio to get started", when the Agent Review Tool finds no agents. The URL has only the environment ID.
- In Model Assessment: **Open agent in Copilot Studio**, **Open in Copilot Studio**, and **Open and update this agent**. The URL has the environment ID of the app and the agent ID. These links use the preview host only in the commercial cloud. In other clouds, they use the Copilot Studio host of that cloud.

## Known issues

- The test `powerConfigFlowBindings.test.ts` fails after you set your flow ID in `power.config.json`. See [Configure your environment](#configure-your-environment).
- After `npx power-apps push`, some PNG images of the app can be damaged. See [Deploy a development copy](#deploy-a-development-copy).

## Known gaps

A fix for these items needs a change to the logic or to the module structure of the app. This publication does not make these changes.

- `npm run lint` reports 63 warnings:
  - `react-hooks/set-state-in-effect`: 30
  - `react-refresh/only-export-components`: 17
  - `react-hooks/exhaustive-deps`: 7
  - `@typescript-eslint/no-unused-vars`: 5
  - `react-hooks/static-components`: 3
  - `react-hooks/use-memo`: 1

  The recommended React Hooks configuration sets `react-hooks/exhaustive-deps` to `warn`. `eslint.config.js` sets the other rules in this list to `warn`. For `@typescript-eslint/no-unused-vars`, this applies only to the 5 files that have these warnings.
- The code in `src` has 121 `console.log` calls. This publication removes the `console.log` calls that wrote identity data of users. A logger can replace the other calls in a later change.
- `npm audit` reports 33 advisories: 1 critical, 13 high, 18 moderate, and 1 low. The critical advisory is for `jspdf` 2.5.2. This publication does not change the dependency versions.

## Agent Review Tool notes

These notes describe the package checks, the review results, the PDF reports, and the optional workflow add-on of the Agent Review Tool. For the user guide, see [Agent Review Tool](../../AGENT_REVIEW_TOOL.md).

### Declarative Agent package checks

The Makers app checks uploaded Microsoft 365 Declarative Agent packages before
it saves the review. Package checks are separate from the AI quality review.
They do not change the quality scoring rules.

The checks find repeated capabilities, invalid conversation starter dependencies,
invalid or repeated function names, unsupported runtime and authentication types,
missing authentication references, runtime function conflicts, and missing
response data paths. Every runtime must declare an authentication object. Use
`None` only when the service permits access without authentication.

Function checks use each runtime's own packaged or inline OpenAPI description.
They support implicit function lists and wildcard selections. If an API
description is remote, missing, or has unresolved operation references, the
operation match is marked **Not assessed**. The app does not fetch remote
descriptions during these checks.

Configuration and instruction checks find unresolved Agents Toolkit placeholders
and credential patterns. Strong credential patterns fail the check. A possible
secret found only through entropy produces a warning. Detected credential values
are removed from all package findings. Knowledge and skill files are excluded
from this check; it is not a complete security assessment.

#### Reading review results

The quality score information button shows each assessed criterion's score,
effective weight, and points. Pass is 100, Warning is 60, and Fail is 0. The
base weights are Instructions 30%, Knowledge 20%, Capabilities 15%, Actions 15%,
Conversation starters 10%, and Error handling 10%. N/A and Not assessed criteria
are excluded. Their weights are shared across the assessed criteria. The app
uses exact weights and rounds the overall score once. Package validity and
custom skill quality do not change this score. Older records without criterion
results show the saved score without an invented breakdown.

**Evidence and location** keeps the recorded file, location, check ID, and
guidance available for each finding. Structured JSON is shown as fields and
lists. **Original evidence** retains the exact recorded excerpt. Plain text,
incomplete JSON, and numbers that cannot be represented safely remain as
recorded. The app does not open addresses found inside evidence.

Custom skill package issues and review failures appear in a compact issue list,
with the highest severity first. Open an issue to see the recorded action and
evidence. Per-skill assessments remain below this list. Issue counts and review
results are unchanged.

The workflow mark in the progress dialog has an **AI review** tooltip and
accessible name. The separate spinner, pending circle, check mark, or error
icon still shows stage status.

### Review PDF reports

Use **Export PDF** from a saved review. Standard, Microsoft Copilot, and M365
Declarative Agent reports use the same rounded blue cover, contents page,
measured text layout, finding blocks, maker-action callouts, and page numbers.
Each report keeps its own review rules, scoring, evidence, and source limits.
The download does not run a new review or make an AI call.

The Microsoft Copilot report includes the saved score, instruction assessment
status, skills, supporting files, recorded check outcomes, and available
observed-use evidence. Optional cost sections show planning assumptions, not
measured consumption. An incomplete assessment or failed check execution is
not presented as a passed check or an additional agent defect.

The M365 report uses the same quality score as the review page. It shows the
configured and effective criterion weights and each score contribution.
Package validity and custom-skill quality remain separate. Passing checks,
N/A notes, evidence locations, custom-skill findings, execution issues, and
recorded workflow provenance are retained. Older reviews without criterion
data show the saved score without an invented breakdown.

Long evidence and recommendations continue across pages without truncation.
Long agent names are shortened only in the running header. The full name is
retained in the cover and review details.
Raw instructions, retained source documents, file bytes, and prompt payloads
are excluded. Encoded values are decoded before secret-like values and signed
addresses are redacted again at export. Reference links come from the verified
guidance lists. Font support is unchanged: Western Latin/WinAnsi text is
preserved; other characters are shown as Unicode code points.

### Copilot review completion

Copilot reviews keep execution status separate from agent findings. Failed or
incomplete skill, resource, instruction-coverage, and cross-skill assessments
are saved as **Failed**, with the completed findings retained. An old snapshot
that contains incomplete assessments is displayed as incomplete without changing
its saved score or record.
Saved incomplete Copilot snapshots remain available in review history. A stage
not recorded by a legacy snapshot does not alone make that snapshot incomplete.
Workflow file assessments update supporting-file coverage without counting
SKILL.md as an extra supporting file or making additional AI calls.

Instruction capability checks require a named reference, such as `SendFax`,
`"Send Fax"`, or a title-case capability name. Ordinary phrases such as
"the next safe action" are not treated as configured capability names.

### Optional Agent Review Workflow add-on

Full workflow-backed reviews need **Agent Review Workflow**
(`AgentReviewWorkflow`) in the environment that hosts the Makers app and review
job tables. The selected agent's source environment is not the setup target.
An older core package that still contains the active **Review Agent Components**
workflow can continue to use it without a separate add-on.

For a workflow review, the app creates a review job in Dataverse in the
environment of the app and attaches the file `review-corpus.json`. The
**Review Agent Components** workflow sends the review text in this file to an
AI agent step (connector `shared_agentnode`). The file does not have the
content of binary files (see
[Data sent to other services](#data-sent-to-other-services)).

The Makers app performs read-only metadata checks before a new review and again
before it creates a job. A missing add-on, disabled worker, duplicate worker, or
unverifiable setup produces a clear message instead of a queued-job timeout.
Saved reviews, agent browsing, and collection of an already submitted job remain
available. The app does not switch AI providers or save local checks as a
completed full review when setup is unavailable.

The availability check uses the existing Dataverse and Power Apps for Makers
connectors. It does not use the Agents connector or an owner's flow list.
The user's effective roles must permit reading the app environment and
organization-level reads of Solution, Process, Environment Variable Definition,
and Environment Variable Value metadata. Solution membership protects against
calling an owner-scoped, invisible legacy workflow missing. Permission, network,
invalid-response, and 15-second timeout failures are **Unable to verify**, not
**Not installed**. **Check again** performs a fresh check.

An installed solution or active process is not proof of healthy connections.
The installer still validates and repairs those connections. No persisted Ready
flag or paid AI call is used for availability detection. New workflow-backed
reviews and the installer are not supported in GCC or the other US Government
clouds. Saved review history remains readable.

## Contributing

This project welcomes contributions and suggestions. For the rules, see [Contribute to the code apps](../../CONTRIBUTING.md#contribute-to-the-code-apps). To report a security issue, see [Security](../../SECURITY.md). To get help, see [Support](../../SUPPORT.md).

## License

Copyright (c) Microsoft Corporation. Licensed under the [MIT License](../../LICENSE.txt).

## Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft trademarks or logos is subject to and must follow [Microsoft’s Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general). Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship. Any use of third-party trademarks or logos are subject to those third-party’s policies.
