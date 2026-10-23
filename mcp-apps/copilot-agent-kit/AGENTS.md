# Agent Review MCP App

This folder (`mcp-apps/copilot-agent-kit/` in the Copilot Agent Kit repository) is a standalone reference implementation for reviewing Copilot Studio agents with an MCP app and Microsoft 365 declarative agent. Run all commands from this folder.

## Required skill routing

Use the appropriate skill before changing the areas below.

| Skill | Use it for |
| --- | --- |
| `declarative-agent-developer` | Declarative agent manifests, instructions, auth, lifecycle files, provisioning, deployment, and environment wiring |
| `ui-widget-developer` | MCP tools/resources, widget contracts, interactive HTML widgets, and Copilot UI rendering behavior |
| `install-atk` | Installing or updating the Agents Toolkit CLI or VS Code extension |

## Working rules

- Keep this folder standalone and reference-clean.
- Do not commit `.env`, local env files, logs, build output, runtime pid files, or machine-specific state.
- Keep `README.md`, `.env.sample`, `AGENTS.md`, and `CLAUDE.md` aligned with any setup or workflow changes. `AGENTS.md` and `CLAUDE.md` must have the same content.
- Keep application feature code under `src`; do not add npm workspaces or private package-feed coupling.
- For a new Review request, start once for one exact accessible agentName, including when startReview is omitted. Preserve the supplied environment, or resolve Copilot Studio Kit - Dev by name for both direct requests and the fallback form. Unresolved targets keep the form; startReview:false requests manual selection and Create confirms that path. Do not use the review storage environment as the prompt target default.
- Keep unresolved targets on the existing form. Initial-data recovery and saved-job resume must never start another review.
- Bind saved-result reads to the existing Review UI. Recover missing result data only by its saved reviewId; never start or finalize a job to restore findings.
- For an exact Debugger agent-name prompt, preserve the supplied environment or resolve Copilot Studio Kit - Dev by name, without the target form or full catalog dependency. Preserve an explicit saved conversation ID and its date/target checks; otherwise load the first authorized saved conversation in the existing most-recent-first list order. Preserve later user selections and reload identity. Empty lists and read failures stay visible. Do not apply Review-only eligibility. Inline, the Debugger never shows its Environment, Agent or Conversation pickers or Analyze, also without fullscreen; the analysis loads without a click, and the Performance tab shows the full timeline.
- Keep Agent Review, Debugger, and Eval Builder independent. Each opener mounts only its own full view on one SDK bridge, without shared app tabs or embedded views. Keep Findings (with its issue-count badge) and Agent map as the two internal Review-result tabs, in that order; inline starts on Agent map. Opening another view must not start a Review, save a native set, or run an evaluation.
- Eval Builder shows only generated test cases; there is no selection form, mining tool or select mode (`mode` is accepted and ignored). `open_evaluation_builder` requires an exact agent name; missing, unknown or ambiguous targets show the reason in the generated view and generate or save nothing. If the agent already has a saved generated set (the newest active root set named `<agent> – generated evals` with at least one case), it shows that set with a verified receipt and generates or saves nothing; it never deletes or changes existing sets. Otherwise it samples recent authorized saved conversations without selection and pre-fills expectations from recorded answers, clearly labeled for review. Its cases are saved automatically as one Copilot Studio set per generated draft (request ID = draft ID; a remount or Retry never creates another set), and inline edits or deletions update that same set through update_agent_evaluation_case. It never runs an evaluation.
- Native save is Conversation only with GeneralQualityGrader, target checks, immutable IDs, one atomic changeset and exact read-back. The stored draft stays unchanged. Uncertain saves offer read-only recovery, not replacement creation.
- Keep complete peer manifest/chunk tool replies within 65,536 bytes and all five resource JSON-RPC replies within 1,000,000 bytes. Verify actual bytes and lossless hashes; do not raise limits or remove records. Selection lists omit per-agent icon data; full map, analysis and Review history reads retain icons.
- Keep the Review summary in fullscreen and Review history detail, not inline. Do not show the saved-snapshot notice above the map or an empty inline map inspector; show selected relationship details in a compact map overlay.
- Keep the compact Review header, inline map without a toolbar or findings below it, and fullscreen severity accordion cards with other checks behind a disclosure; inline Findings shows a finite compact preview. Keep expand/exit visible in all hosts; display refusal shows a neutral caption, not an error alert.
- Inline views must not scroll vertically. Fit the host height budget (containerDimensions.height, else maxHeight minus the frame inset, else 600 px) and show a finite preview with a fullscreen action, or pages when fullscreen is unavailable. Fullscreen and popups can scroll. The only inline exceptions are the Eval Builder 3-line question and expected-response boxes, which scroll only on hover or focus, and the inline Debugger Performance tab content, which shows the full timeline and can scroll inside the view. An open_agent_debugger result with the optional top-level `structuredContent.inlineLayout: "full"` shows all full Debugger tabs inline with the tab content scrolling inside the view; a missing value or "preview" keeps the inline previews, and this server does not send it. Agent Map and the Review map hide evaluation sets and test cases by default; saved Review map filters carry defaultsVersion 2.
- An `open_agent_review` or `open_evaluation_builder` result with the optional top-level `structuredContent.simulatedProgress` (`true` = 2 s steps, or `{ stepMs }` clamped to 250-10,000 ms; a whole playback stays within 16 s) first plays the view's own waiting state with timers only, then shows the result as before. A completed Review shows the real progress stepper, one stage per step from Parsing Configuration to Complete, without Continue in background or Cancel; Eval Builder cases show the generating loader for 3 steps. It plays once per result (not again after a display-mode change, or in a new frame with the same result and tool call when session storage works) and makes no tool call or save. This server does not send it.
- Review jobs use the existing exact-name Copilot Studio Kit - Dev backend; source selection stays separate and saved results/history remain in the configured home. No 404 fallback, saved-result migration or new backend installation is permitted. Do not overwrite managed dependencies or choose connection bindings by guess.

## Hosting and sign-in

- The MCP endpoint is `https://<app-name>.azurewebsites.net/mcp`, on a Linux App Service. The Azure hosting section of `README.md` describes the deployment.
- Deploy only a prebuilt Linux runtime package, with `azd deploy web --from-package <zip>`. Keep `SCM_DO_BUILD_DURING_DEPLOYMENT=false` and `ENABLE_ORYX_BUILD=false`.
- After a deployment, make sure that `/health` returns `{"status":"ok"}`. Make sure that `tools/list` and `resources/list` agree with the tool and resource counts in `README.md`.
- The Entra app registration is single-tenant (`AzureADMyOrg`). To add a Copilot Studio callback URL, add it to the Web redirect URIs, keep all existing URIs, and read the list back. Do not remove redirect URIs, or change secrets, scopes, API permissions, or the sign-in audience, without approval.
- Agents Toolkit `provision` runs `aadApp/update` with `aad.manifest.json`, and that manifest lists only the Teams redirect URI. Thus, a provision can remove the Copilot Studio callback URLs from a shared app registration. Do not provision against a shared app registration without approval. Compare `web.redirectUris` before and after.
- An HTTP 401 from `/mcp` shows a problem with the caller token, usually an expired token from a client connection. Read the App Service logs first (see Troubleshooting in `README.md`). Do not bypass expiry, add retries, or use another credential.
- Never print, log, or commit secret values. The Copilot Studio connection uses its own client secret. Do not reuse the server secret.

## Self-host in an Azure subscription

Use this section when a user asks you to host Agent Review in their own Azure subscription. Follow [SELF-HOSTING.md](SELF-HOSTING.md) in sequence.

Rules:
- Do the steps in `SELF-HOSTING.md` in sequence. Do not skip a check.
- Stop and ask the user at these points: the tenant and subscription choice, the Kit setup (step 3), a failed admin consent (step 5), and the Copilot Studio steps (step 9).
- Do not show, log or commit secrets. Keep them in the azd environment and Key Vault only. Do not run `azd env get-values`. For the Copilot Studio secret, tell the user to run `azd env get-value AGENT_REVIEW_CONNECTOR_CLIENT_SECRET` in their own shell.
- Build the package on Linux x64 only. Use `scripts/self-host/build-runtime-package.sh`.
- Do not change the app code to make a deployment work. Tell the user about the problem.
- Before you tell the user that the deployment is complete, make sure that `/health` returns `{"status":"ok"}`, `tools/list` returns 27 tools and `resources/list` returns 5 resources.

Commands, in sequence:
1. `azd env new <env-name> --subscription <id> --location <region>`
2. `azd env set AZURE_RESOURCE_GROUP_NAME <rg>`; `azd env set AGENT_KIT_HOME_ENVIRONMENT_ID <environment-id>`
3. `pwsh ./scripts/self-host/New-AgentReviewEntraApps.ps1`
4. `azd provision`
5. `bash ./scripts/self-host/build-runtime-package.sh`
6. `azd deploy web --from-package <zip>`
7. The checks in `SELF-HOSTING.md` step 8
8. Give the user the step 9 values (not the secret). When the user gives the callback URL: `pwsh ./scripts/self-host/New-AgentReviewEntraApps.ps1 -AddRedirectUri "<callback-url>"`

## Tests

- `npm test` stops at the first suite that fails. To see all results, run `npm run test:node`, `npm run test:review-core`, and `npm run test:review-ui` one at a time.
- `README.md` lists the known test failures. A listed failure is not a new regression. When you fix one, remove it from that list in the same commit.
- Do not weaken or delete a test only to make it pass. First, find out whether the test or the source is correct.
- To test the self-host Entra script, run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/self-host/tests/mock-run.ps1 -ScriptUnderTest scripts/self-host/New-AgentReviewEntraApps.ps1` (PowerShell 5.1) and the same command with `pwsh` (PowerShell 7). Each run must pass 32 of 32 checks (`FAILED: 0 of 32`). The test uses mock `az`, `azd` and `node` commands and makes no change in Azure or Entra.

## Do not

- Edit files under `appPackage\` or `m365agents*.yml` without `declarative-agent-developer`.
- Change MCP tool contracts, widget resources, or widget UI flows without `ui-widget-developer`.
- Fabricate tool definitions; verify them from the source or from a running local server with MCP Inspector.
- Commit `.azure/`, local machine paths (for example, `C:\Users\...`), or agent session-state files.
