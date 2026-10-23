# Host Agent Review in your Azure subscription

> **Status: draft for review (2026-10-20).**
> - Tested on the live app: the Azure template, the package build, the deployment and the checks.
> - **Not tested yet:** the 2-app Copilot Studio connection (steps 5 and 9), Node.js 22 on App Service, a Copilot Agent Kit from the public release, and a real run of the two scripts.
> - The Entra script passed 32 checks with mock `az`, `azd` and `node` commands on PowerShell 5.1 and 7. The build script passed `bash -n` and ShellCheck 0.10.0, but it did not run on Linux. The package content (`dist/`, production `node_modules/`, `package.json`) agrees with the runtime imports of the server.

This guide tells you how to host the Agent Review MCP app in your Azure subscription and connect it to a Copilot Studio agent. Do the steps in sequence.

## What you get

- One Linux App Service web app. It hosts the MCP server (27 tools) and 5 UI views: Agent Review, Review Browser, Agent Map, Agent Debugger and Evaluation Builder.
- One Key Vault for the server client secret. A managed identity reads the secret.
- Log Analytics and Application Insights for logs and metrics.
- Two Microsoft Entra app registrations: the server API (app 1) and the Copilot Studio client (app 2).

```text
Copilot Studio agent --(OAuth 2.0, user sign-in, app 2)--> App Service /mcp --(on-behalf-of, app 1)--> Dataverse
                                                              |-- Key Vault (app 1 secret)
                                                              |-- Application Insights, Log Analytics
```

The server keeps no data. It reads and writes Dataverse with the rights of the signed-in user (delegated, on-behalf-of). The server has no app-only access to Dataverse.

The `/mcp` endpoint answers `tools/list`, `resources/list` and `resources/read` without sign-in. Step 8 uses this. Tools that read or write Dataverse data need the token of the signed-in user. Microsoft Entra ID validates this token in the on-behalf-of exchange.

**Cost:** approximately US$15–25 each month at low use. The B1 App Service plan is most of the cost (approximately US$13). Use the [Azure pricing calculator](https://azure.microsoft.com/pricing/calculator/) for your region.

## Steps overview

| Step | Task | Who |
| --- | --- | --- |
| 1 | Get the prerequisites | You |
| 2 | Get the code | You |
| 3 | Prepare the Copilot Agent Kit environment | Power Platform admin |
| 4 | Create the azd environment | You |
| 5 | Create the Entra apps (script) | You, and an Entra admin for consent |
| 6 | Create the Azure resources | You |
| 7 | Build and deploy the app | You |
| 8 | Do the checks | You |
| 9 | Connect Copilot Studio | Agent maker |
| 10 | Give access to users | Power Platform admin |
| 11 | Optional: Microsoft 365 Copilot | You |
| 12 | Update, roll back and remove | You |

## Known limits (read first)

1. **Environment name.** The current code finds the review job environment by its display name, `Copilot Studio Kit - Dev`. Exactly one environment that the user can see must have this name. If not, reviews fail with `JOB_BACKEND_NOT_FOUND` or `JOB_BACKEND_AMBIGUOUS`. Evaluation Builder also uses this name when the user does not give an environment. Until the code has a setting for it, give your Kit environment this name (step 3.4).
2. **Kit tables.** Reviews need the Kit tables `cat_agentreviewjob`, `cat_agentreviewjobitem` and `cat_agentreviews`, and the **Review Agent Components** workflow. Make sure that your Kit version has them (step 3.3).
3. **Linux package.** App Service does not build the app. You build a runtime package on Linux x64 and deploy it (step 7).
4. **Node.js version.** The template uses `NODE|20-lts`. Node.js 20 is at end of life (April 2026). The planned change is `NODE|22-lts`.
5. **Copilot Studio connection.** Use two app registrations (step 5). With one app, the token refresh can fail after approximately one hour with `AADSTS90009`.
6. **Access to the code.** The code is public, in the folder `mcp-apps/copilot-agent-kit/` of the Copilot Agent Kit repository.

## 1. Prerequisites

| Item | Why |
| --- | --- |
| An Azure subscription. Your role: **Owner**, or **Contributor** and **Role Based Access Control Administrator** | The template creates resources and one role assignment (Key Vault Secrets User for the managed identity). |
| Permission to create app registrations in Microsoft Entra ID | The script creates 2 apps. |
| An Entra admin with the **Cloud Application Administrator**, **Application Administrator** or **Privileged Role Administrator** role | Admin consent for the Dataverse permission and for the Copilot Studio client. The admin can run the script, or give consent after you run it. |
| A Power Platform environment with Dataverse and the Copilot Agent Kit | The app runs review jobs and keeps saved reviews in this environment. |
| **System Administrator** in the Kit environment | For the Kit setup in step 3. |
| Maker access in Copilot Studio | For the connection in step 9. |
| A Linux x64 shell with `git`, `az`, `azd`, Node.js 20 or later and npm, `zip` (or `python3`), `curl` and PowerShell 7 (`pwsh`) | To run the commands in this guide. |

**Recommended shell: Azure Cloud Shell (Bash).** It has the tools in the table. Make sure that `node --version` shows 20 or later. Use the same major version as App Service (`NODE|20-lts` in `infra/modules/resources.bicep`). If the versions are different, the build script shows a warning.

Other shells: WSL (Ubuntu) on Windows, a Linux computer or a Linux VM. In WSL, put the code in the Linux file system (for example `~/src`), not in `/mnt/c`.

## 2. Get the code

```bash
git clone --filter=blob:none --sparse https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit.git
cd Power-CAT-Copilot-Studio-Kit
git sparse-checkout set mcp-apps/copilot-agent-kit
cd mcp-apps/copilot-agent-kit
```

The sparse checkout downloads only this folder. The full Kit repository is approximately 350 MB.

Run all the commands in the next steps from `mcp-apps/copilot-agent-kit/`.

## 3. Prepare the Copilot Agent Kit environment

A Power Platform admin does this step one time for each tenant.

### 3.1 Install the Kit

Install the Copilot Agent Kit (formerly Copilot Studio Kit) in a Dataverse environment. Follow the install guide in the [Kit repository](https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit).

### 3.2 Set up Agent Review in the Kit

1. Open the Kit app. Go to **Setup Wizard** > **Agent Review**.
2. Select **Set up Agent Review**.
3. Wait until the 4 checks show **Ready**: Agents connection, Dataverse connection, Workflow connections and Review workflow.
4. Make sure that the **Review Agent Components** workflow is on. If it is off, review jobs stop with a time-out after 45 minutes.

The Kit setup also needs Code Apps on in the environment, Copilot Studio licenses and Copilot Credits. Data policies must allow the Dataverse, Agents and Power Apps for Makers connectors. Refer to the Agent Review guide in the Kit repository for the full list.

### 3.3 Make sure that the Kit tables exist

Open these URLs in a browser that is signed in to the environment. Replace `<org>` with the host name of the Dataverse environment, for example `contoso.crm.dynamics.com`.

```text
https://<org>/api/data/v9.2/EntityDefinitions(LogicalName='cat_agentreviewjob')?$select=LogicalName
https://<org>/api/data/v9.2/EntityDefinitions(LogicalName='cat_agentreviewjobitem')?$select=LogicalName
https://<org>/api/data/v9.2/EntityDefinitions(LogicalName='cat_agentreviews')?$select=LogicalName
```

Each URL must show JSON with the `LogicalName`. If a URL shows an error, your Kit version does not have the Agent Review job tables. Stop, and open an issue in the Copilot Agent Kit repository.

### 3.4 Set the environment name

1. Open the [Power Platform admin center](https://admin.powerplatform.microsoft.com). Go to **Manage** > **Environments**.
2. Select the Kit environment. Select **Edit**.
3. Set **Name** to `Copilot Studio Kit - Dev`. Use this exact text. Select **Save**.
4. Make sure that no other environment that users can see has this name.

> This step is temporary. A planned code change replaces the name with an environment ID setting.

### 3.5 Copy the environment ID

In the Power Platform admin center, open the Kit environment. Copy the **Environment ID** (a GUID). You use it in step 4.

> Use the Power Platform environment ID. Do not use the Dataverse organization ID.

## 4. Create the azd environment

```bash
az login --tenant <tenant-id>                    # Not necessary in Cloud Shell.
az account set --subscription <subscription-id>
azd auth login --tenant-id <tenant-id>           # In Cloud Shell, add --use-device-code.
azd env new <env-name> --subscription <subscription-id> --location <region>
azd env set AZURE_RESOURCE_GROUP_NAME rg-agent-review-mcpapp
azd env set AGENT_KIT_HOME_ENVIRONMENT_ID <environment-id>
```

- `<env-name>`: a short name with lowercase letters, numbers and hyphens, for example `agentreview-prod`. The template uses it to make the resource names.
- `<region>`: an Azure region, for example `westeurope` or `eastus`. The template default is `centralindia`.
- `<environment-id>`: the Kit environment ID from step 3.5.
- The web app name is `azarmcp` and 7 characters from a hash, for example `https://azarmcpk3x9q2a.azurewebsites.net`.

azd keeps the values in `.azure/<env-name>/.env` as plain text. Git ignores this folder. Do not share it.

## 5. Create the Entra app registrations

The script creates 2 app registrations in the tenant of your `az` sign-in.

> **Two tenants?** The apps must be in the Microsoft 365 and Power Platform tenant of your users. If your Azure subscription is in a different tenant, run `az login --tenant <Microsoft 365 tenant ID>` before the script. After the script, run `az login --tenant <subscription tenant ID>` and `az account set --subscription <subscription-id>` again. `azd` keeps its own sign-in from step 4.

| App | Default name | Use |
| --- | --- | --- |
| App 1 | Agent Review MCP | The server API. It has the scope `access_as_user`. The server uses its client ID and secret to get Dataverse tokens on behalf of the user. |
| App 2 | Agent Review MCP - Copilot Studio | The OAuth client for Copilot Studio. It signs in the user and gets a token for app 1. |

Run the script:

```bash
pwsh ./scripts/self-host/New-AgentReviewEntraApps.ps1
```

The script does these steps:

1. It creates app 1, or it uses the app in `ENTRA_CLIENT_ID` if that value is set. It sets the identifier URI `api://<app 1 client ID>`, the scope `access_as_user` and access token version 2.
2. It adds the Dataverse permission `user_impersonation` and gives admin consent. In the Entra admin center, the Dataverse API has the name **Dynamics CRM**.
3. It makes a client secret for app 1. It writes `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID` and `ENTRA_CLIENT_SECRET` to the azd environment. It does not show the secret.
4. It creates app 2, or it uses the app in `AGENT_REVIEW_CONNECTOR_CLIENT_ID` if that value is set. It adds the permissions `access_as_user` (app 1) and `offline_access` (Microsoft Graph) and gives admin consent.
5. It makes a client secret for app 2. It writes `AGENT_REVIEW_CONNECTOR_CLIENT_ID` and `AGENT_REVIEW_CONNECTOR_CLIENT_SECRET` to the azd environment. It does not show the secret. You get the secret in step 9.
6. It shows the values for Copilot Studio (step 9), but not the secret.

If you do not have an Entra admin role, the script shows a warning for each consent that failed. Then an Entra admin must give the consent: Entra admin center > **App registrations** > the app > **API permissions** > **Grant admin consent for \<tenant\>**. Do this for app 1 and app 2.

You can run the script again. It uses the apps that it created before. It makes a new secret only when the azd value is empty, or when you add `-RotateServerSecret` (app 1) or `-RotateConnectorSecret` (app 2). If your tenant limits the secret lifetime, add `-SecretMonths <months>` (default 12).

## 6. Create the Azure resources

```bash
azd provision
```

This command creates the resource group, the managed identity, Log Analytics, Application Insights, the Key Vault and its secret, the App Service plan (B1) and the web app. Then read the URLs:

```bash
azd env get-value WEB_URL
azd env get-value MCP_SERVER_URL
```

> **Caution:** Each `azd provision` writes `ENTRA_CLIENT_SECRET` from the azd environment to Key Vault. Keep the value in the azd environment. If the value is empty, the Key Vault secret becomes empty, and the server cannot get Dataverse tokens.

## 7. Build and deploy the app

App Service does not build the app. Build the runtime package on Linux x64. Then deploy it:

```bash
bash ./scripts/self-host/build-runtime-package.sh
azd deploy web --from-package ~/agent-review-releases/agent-review-mcpapp-<commit>.zip
```

The build script does these steps:

1. It runs `npm ci` and `npm run build`.
2. It installs only the production packages in a temporary folder.
3. It makes a zip with `dist/`, `node_modules/` and `package.json` in `~/agent-review-releases/` (change it with `--out <folder>`).
4. It shows the zip path, the size, the SHA-256 and the deploy command.

Keep the zip and its SHA-256. You can use the zip for a rollback.

## 8. Do the checks

1. Make sure that the app is healthy. The app can need 1–2 minutes to start after a deployment.

   ```bash
   WEB_URL=$(azd env get-value WEB_URL)
   curl -s "$WEB_URL/health"
   ```

   Expected result: `{"status":"ok"}`.

2. Count the tools. Expected result: `27`.

   ```bash
   curl -s -X POST "$WEB_URL/mcp" \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
     | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["result"]["tools"]))'
   ```

3. Count the UI resources. Expected result: `5`.

   ```bash
   curl -s -X POST "$WEB_URL/mcp" \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d '{"jsonrpc":"2.0","id":2,"method":"resources/list","params":{}}' \
     | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["result"]["resources"]))'
   ```

If a check fails, turn on the container log, and read the log stream:

```bash
APP_NAME=$(azd env get-value MCP_SERVER_DOMAIN | cut -d. -f1)
RG=$(azd env get-value AZURE_RESOURCE_GROUP_NAME)
az webapp log config --name "$APP_NAME" --resource-group "$RG" --docker-container-logging filesystem
az webapp log tail --name "$APP_NAME" --resource-group "$RG"
```

The template also sends the app logs to Log Analytics (table `AppServiceConsoleLogs`). The logs show there after some minutes.

## 9. Connect Copilot Studio

1. In Copilot Studio, open your agent. Go to **Tools** > **Add a tool** > **New tool** > **Model Context Protocol**.
2. Enter a **Server name** (for example `Agent Review`) and a **Server description**.
3. Enter these values. The script showed them at the end of step 5, but not the secret.

   | Field | Value |
   | --- | --- |
   | **Server URL** | The `MCP_SERVER_URL` value (`https://<app>.azurewebsites.net/mcp`) |
   | **Authentication** | **OAuth 2.0**, type **Manual** |
   | **Client ID** | The app 2 client ID (`azd env get-value AGENT_REVIEW_CONNECTOR_CLIENT_ID`) |
   | **Client secret** | The app 2 secret. Run `azd env get-value AGENT_REVIEW_CONNECTOR_CLIENT_SECRET`, and paste the value. Do not save it in a file. |
   | **Authorization URL** | `https://login.microsoftonline.com/<tenant-id>/oauth2/v2.0/authorize` |
   | **Token URL template** | `https://login.microsoftonline.com/<tenant-id>/oauth2/v2.0/token` |
   | **Refresh URL** | The same value as **Token URL template** |
   | **Scopes** | `api://<app 1 client ID>/access_as_user offline_access` |

4. Select **Create**. Copilot Studio shows a callback URL. Copy it.
5. Add the callback URL to app 2 as a Web redirect URI. The script keeps the existing redirect URIs:

   ```bash
   pwsh ./scripts/self-host/New-AgentReviewEntraApps.ps1 -AddRedirectUri "<callback-url>"
   ```

   Or use the Entra admin center: **App registrations** > app 2 > **Authentication** > **Add a platform** > **Web**.
6. In Copilot Studio, select **Next**. Select **Create a new connection**, and sign in.
7. Select **Add to agent**.
8. Start a new test chat. Ask the agent to review one of your agents. Sign in when the agent asks.

Each connector has its own callback URL, on `global.consent.azure-apim.net` or on `global-test.consent.azure-apim.net`. Add the exact URL of each connector. If the URL is missing, sign-in fails with `AADSTS50011`.

To change the client secret of an existing connector, go to Power Apps > **Custom connectors** > the connector > **Security**.

## 10. Give access to users

Each user signs in with their own account. The app can do only what the user can do in Dataverse. All users must be in the tenant of the app registrations, because the apps are single-tenant.

| User task | Access that the user needs (verify in your tenant) |
| --- | --- |
| Use the agent | Access to the Copilot Studio agent |
| Run and save reviews | A Kit security role (`CSK - Maker` or `CSK - Administrator`) in the Kit environment |
| Review an agent | Read access to the agent in its environment |
| Agent Debugger | Read access to conversation transcripts, for example the **Bot Transcript Viewer** role |
| Evaluation Builder (save a test set) | Edit access to the agent |

If your tenant has data policies (DLP), the policy must allow the MCP tool connector. A Power Platform admin can add the URL pattern `https://<app>.azurewebsites.net/*` to the allowed custom connector patterns.

## 11. Optional: Microsoft 365 Copilot (Agents Toolkit)

Do this step only if you want Agent Review in Microsoft 365 Copilot. Copilot Studio does not need it.

> **Not tested for self-host.** In this flow, app 1 is also the OAuth client. The token refresh can fail with `AADSTS90009`. The planned change uses app 2.

1. Install the Agents Toolkit CLI, and sign in:

   ```bash
   npm install -g @microsoft/m365agentstoolkit-cli
   atk auth login m365
   ```

2. Make a second client secret for app 1: Entra admin center > **App registrations** > app 1 > **Certificates & secrets** > **New client secret**. Do not use the server secret.
3. Copy `env/.env.dev` to `env/.env.<name>`. Set these values:

   ```text
   TEAMSFX_ENV=<name>
   APP_NAME_SUFFIX=
   AGENT_REVIEW_MCP_CLIENT_ID=<app 1 client ID>
   AAD_APP_TENANT_ID=<tenant-id>
   MCP_SERVER_URL=<WEB_URL>                     # Without /mcp.
   MCP_SERVER_DOMAIN=<app>.azurewebsites.net
   ```

4. Make the file `env/.env.<name>.user` with the secret from step 2. Do not commit this file.

   ```text
   SECRET_AGENT_REVIEW_MCP_CLIENT_SECRET=<app 1 second secret>
   ```

5. Provision and publish:

   ```bash
   atk provision --env <name>
   atk publish --env <name>
   ```

   `provision` publishes the agent for you only. `publish` sends it to your organization. A Microsoft 365 admin must approve it in the Microsoft 365 admin center.

> `provision` applies `aad.manifest.json` to app 1. App 2 is not changed, thus the Copilot Studio redirect URIs stay.

## 12. Update, roll back and remove

**Update** to a new release:

```bash
git fetch && git checkout <new-release>
bash ./scripts/self-host/build-runtime-package.sh
azd deploy web --from-package <new-zip>
```

Run `azd provision` only when files in `infra/` change.

**Roll back:** deploy the previous zip with `azd deploy web --from-package <old-zip>`.

**Rotate the app 1 secret** before it expires:

```bash
pwsh ./scripts/self-host/New-AgentReviewEntraApps.ps1 -RotateServerSecret
azd provision
```

The old secret stays valid. The web app reads the new secret from Key Vault in 24 hours or less. After 24 hours, delete the old secret: Entra admin center > app 1 > **Certificates & secrets**.

**Rotate the app 2 secret:** run the script with `-RotateConnectorSecret`. Get the new secret with `azd env get-value AGENT_REVIEW_CONNECTOR_CLIENT_SECRET`. Put it in the connector (Power Apps > **Custom connectors** > the connector > **Security**). Then delete the old secret in Entra.

**Remove everything:**

```bash
azd down
az ad app delete --id <app 2 client ID>
az ad app delete --id <app 1 client ID>
```

When `azd down` asks to delete permanently (purge), select **No**. The Key Vault has purge protection. Its name stays reserved for 90 days. To deploy again in this period, use a new azd environment name or a new region. Also remove the tool from the Copilot Studio agent.

## 13. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| The Entra script stops with "The azd environment uses tenant ..." | Azure CLI is signed in to a different tenant. | Run `az login --tenant <tenant-id>` with the tenant in the message. Or use a new azd environment. |
| The Entra script cannot make a client secret | A tenant policy limits the secret lifetime, or blocks client secrets. | Run the script again with a smaller `-SecretMonths`. Or ask an Entra admin. |
| Sign-in fails with `AADSTS50011` | The callback URL is not a redirect URI on app 2. | Do step 9.5 with the exact callback URL. |
| Sign-in fails with `AADSTS50020` | The user is not in the tenant of the apps. | Use an account (or a guest account) in that tenant. |
| Sign-in fails with `AADSTS65001` | Admin consent is missing. | An Entra admin gives consent for app 1 and app 2 (step 5). |
| Tools fail after approximately one hour with `AADSTS90009` | The connector uses app 1 as the OAuth client. | Use app 2 as the client (steps 5 and 9). |
| Tools return `AUTH_REQUIRED`, HTTP 401, or `AADSTS500133` | The user token expired. | Sign in again. Make sure that the connector has the **Refresh URL** and the `offline_access` scope. |
| `AADSTS7000215` in the log stream | The app 1 secret in Key Vault is wrong or expired. | Rotate the app 1 secret (step 12). |
| `JOB_BACKEND_NOT_FOUND` or `JOB_BACKEND_AMBIGUOUS` | No environment, or more than one environment, named `Copilot Studio Kit - Dev` that the user can see. | Do step 3.4. Make sure that the user has access to the Kit environment. |
| `HOME_NOT_CONFIGURED`, or saved reviews do not show | `AGENT_KIT_HOME_ENVIRONMENT_ID` is not set or is wrong. | Set the value (step 4). Run `azd provision`. |
| A review stays in progress, then stops after 45 minutes | The **Review Agent Components** workflow is off, or its connections are broken. | Do step 3.2 again. |
| `/health` fails after a deployment | The package is not correct, or the app cannot start. | Build the package again with the script (step 7). Read the log stream (step 8). |
| `azd provision` fails because the Key Vault name exists | A deleted vault keeps its name for 90 days (purge protection). | Use a new azd environment name or a new region. |
| Copilot Studio shows that a data policy blocks the connector | The DLP policy blocks the custom connector. | Allow the server URL pattern (step 10). |

## Appendix A: Text for AGENTS.md

The text for AI coding agents is now in the section "Self-host in an Azure subscription" of [`AGENTS.md`](AGENTS.md#self-host-in-an-azure-subscription). [`CLAUDE.md`](CLAUDE.md#self-host-in-an-azure-subscription) has the same section. When you change the self-host steps, change that section in the 2 files.

## Appendix B: Recommended changes to the repository

These changes are recommended. They are not done yet:

1. **Environment setting.** Add `AGENT_KIT_JOB_ENVIRONMENT_ID` (and an optional default environment name). Use it in `src/tools/target-selection.ts`, `src/agent-review/server/service.ts` and `src/evaluation/`. If the setting is empty, keep the current name lookup. Remove the fixed name from the tool descriptions in `server.ts` and `appPackage/agent-review-plugin.json`.
2. **Node.js 22.** Change `linuxFxVersion` to `NODE|22-lts` in `infra/modules/resources.bicep`. Test on App Service.
3. **Release package.** Add a GitHub Actions workflow on `ubuntu-latest`. It runs `build-runtime-package.sh` and attaches the zip and its SHA-256 to a GitHub release. Then users do not need a Linux build host.
4. **Two apps in the README.** Replace the one-app Copilot Studio steps with the app 2 steps from this guide.
5. **Agents Toolkit client.** In `m365agents.yml`, use app 2 as the `oauth/register` client, or use the GUID form of the scope.
6. **Secret parameter.** In the template, do not write the Key Vault secret when `entraClientSecret` is empty, or make the parameter required.
7. **Web app name.** Add an optional `webAppName` parameter for a readable host name.
8. **Release zips.** Publish release zips (see item 3). The code is under the MIT license of the Kit (`LICENSE.txt` at the repository root), and the Kit `SUPPORT.md` is the support statement.
9. **Token check in the server.** Optional extra protection: make the server validate the signature, the issuer and the audience (app 1) of the caller token before a tool call. Now only the on-behalf-of exchange validates the token.
