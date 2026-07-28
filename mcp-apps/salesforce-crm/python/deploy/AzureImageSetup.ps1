<#
.SYNOPSIS
    AzureImageSetup -- provision (or update) the Azure infrastructure that
    hosts the SF MCP server. Idempotent: safe to run any number of times.

.DESCRIPTION
    This is the FIRST of the two server scripts. It creates only Azure
    infrastructure -- it does NOT build the container image, does NOT deploy
    application code, and does NOT touch the Copilot agent registration.

        1. AzureImageSetup.ps1   <-- you are here (create/verify Azure infra)
        2. ServerDeploy.ps1          (build image + deploy + upload agent)

    Run AzureImageSetup once to stand up the stack, then run ServerDeploy
    every time you want to ship new server or agent code. Re-running
    AzureImageSetup is harmless -- the resource group, providers, and Bicep
    stack all deploy in incremental mode, so existing resources are verified,
    not recreated.

    What it provisions (via main.bicep):
      - Resource Group
      - Azure Container Registry (ACR)
      - Container Apps Environment + Log Analytics workspace
      - Container App (running a placeholder image until ServerDeploy runs)
      - User-assigned Managed Identity + ACR pull role assignment

.EXAMPLE
    .\deploy\AzureImageSetup.ps1

.NOTES
    Requires: Azure CLI 2.50+, signed in (az login) to a subscription with
    Contributor rights. Run from salesforce-crm/python/.
#>

# Fixed deploy targets -- run this script with no parameters.
$ResourceGroup = "GenericResourceGroup"
$Location      = "southindia"
$AcrName       = "lobmcpapps"

$ErrorActionPreference = "Stop"

. "$PSScriptRoot\_deploy_common.ps1"

# Force a UTF-8 console so streamed az output never crashes on non-cp1252
# characters. Harmless on setup; kept here for parity with ServerDeploy.
$env:PYTHONUTF8       = "1"
$env:PYTHONIOENCODING = "utf-8"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$deployRoot       = $PSScriptRoot                            # deploy\
$App              = Split-Path -Parent $deployRoot           # salesforce-crm\python\
$paramsFile       = Join-Path $deployRoot 'parameters.bicepparam'
$containerAppName = 'lob-mcp-apps-sf'
$deploymentName   = 'lob-mcp-apps-sf-setup'

Write-Host ""
Write-Host "  =====================================" -ForegroundColor DarkCyan
Write-Host "   SERVER SETUP -- Azure infra for SF" -ForegroundColor Cyan
Write-Host "  =====================================" -ForegroundColor DarkCyan
Write-Host ""

# ---------------------------------------------------------------------------
# Phase 0: Pre-flight checks
# ---------------------------------------------------------------------------
Write-Host ">> Phase 0/2: pre-flight checks" -ForegroundColor Cyan

Assert-File -Path "$App\pyproject.toml" `
    -Why "AzureImageSetup.ps1 must be run from the app root (script is in deploy/)." `
    -Hint "cd to the salesforce-crm/python/ folder then re-run."

Assert-File -Path "$PSScriptRoot\_deploy_common.ps1" `
    -Why "Shared helper functions live here; dot-sourced at the top of this script." `
    -Hint "_deploy_common.ps1 is part of the repo. Pull latest from git."

Assert-Tool -Name "az" `
    -Why "Needed for every Azure operation (group create, provider register, bicep deploy)." `
    -Hint "Install: 'winget install Microsoft.AzureCLI'. Then close + reopen PowerShell so PATH refreshes."

Assert-File -Path $paramsFile `
    -Why "Bicep parameters file required to provision the stack." `
    -Hint "Copy deploy\parameters.example.bicepparam to deploy\parameters.bicepparam and fill in your Salesforce credentials."

# Azure CLI signed in
$accountJson = az account show --output json 2>$null
if ($LASTEXITCODE -ne 0 -or -not $accountJson) {
    Write-FailBlock -What "Azure CLI is not signed in to any subscription" `
        -Detail "az account show returned no account." `
        -Hint "Run 'az login' and pick the subscription with Contributor on the resource group."
    exit 1
}
$account = $accountJson | ConvertFrom-Json
Write-Host "   Subscription: $($account.name) ($($account.id))" -ForegroundColor Gray
Write-Host "   Tenant:       $($account.tenantId)" -ForegroundColor Gray
Write-Host "   User:         $($account.user.name)" -ForegroundColor Gray
Write-Host "   All pre-flight checks passed." -ForegroundColor Green
Write-Host ""

# ---------------------------------------------------------------------------
# Phase 1: Provision Azure infra (idempotent)
# ---------------------------------------------------------------------------
Write-Host ">> Phase 1/2: provision Azure infra" -ForegroundColor Cyan
Write-Host "   Resource group: $ResourceGroup" -ForegroundColor Gray
Write-Host "   Location:       $Location" -ForegroundColor Gray
Write-Host "   ACR:            $AcrName" -ForegroundColor Gray

# 1a. Resource group (idempotent)
Write-Host "   >> Creating / verifying resource group..." -ForegroundColor Cyan
az group create --name $ResourceGroup --location $Location | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-FailBlock -What "az group create failed (exit $LASTEXITCODE)" `
        -Detail "Could not create or verify resource group '$ResourceGroup' in '$Location'." `
        -Hint "Likely AuthorizationFailed -- your account needs Contributor on the subscription."
    exit 1
}

# 1b. Register required resource providers (idempotent; first-time subs need
# this, established subs no-op fast). Without registration, bicep deploys can
# fail with vague "provider not registered" errors masked by az CLI 2.73+'s
# response-consumed bug.
Write-Host "   >> Registering required resource providers..." -ForegroundColor Cyan
foreach ($provider in @('Microsoft.App', 'Microsoft.OperationalInsights', 'Microsoft.ContainerRegistry', 'Microsoft.ManagedIdentity')) {
    az provider register --namespace $provider --wait 2>&1 | Out-Null
}

# 1c. Bicep deployment (incremental mode -> idempotent).
# Note on syntax: with a .bicepparam file, do NOT pass --template-file (the
# bicepparam's `using './main.bicep'` directive specifies the template) and
# do NOT prefix the path with `@`. Just pass the bicepparam path directly.
Write-Host "   >> Deploying Bicep stack..." -ForegroundColor Cyan
az deployment group create `
    --name $deploymentName `
    --resource-group $ResourceGroup `
    --parameters deploy/parameters.bicepparam `
    --parameters acrName=$AcrName location=$Location | Out-Null
if ($LASTEXITCODE -ne 0) {
    # az CLI 2.73+ can consume the response stream before the error is shown,
    # leaving only "content for this response was already consumed". Query the
    # deployment record directly to surface the real Azure error.
    Write-Host ""
    Write-Host "  >> Fetching actual Azure error from deployment record..." -ForegroundColor Yellow
    $deploymentError = az deployment operation group list `
        --resource-group $ResourceGroup `
        --name $deploymentName `
        --query "[?properties.provisioningState=='Failed'].{resource:properties.targetResource.resourceName, status:properties.statusMessage}" `
        -o json 2>&1
    Write-FailBlock -What "az deployment group create failed (exit $LASTEXITCODE)" `
        -Detail "Actual Azure error:`n$deploymentError" `
        -Hint @"
Common causes:
  - RegistryNameInUse: ACR name taken globally. Re-run with -AcrName <unique>.
  - InvalidParameter on a secret: parameters.bicepparam has an empty value
    for a required field, or an empty `value:` on a secret entry in bicep.
  - AuthorizationFailed: your account needs Contributor on the subscription.
"@
    exit 1
}

# ---------------------------------------------------------------------------
# Phase 2: Read back the live FQDN
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host ">> Phase 2/2: reading ACA public FQDN..." -ForegroundColor Cyan
$acaFqdn = az containerapp show `
    --resource-group $ResourceGroup `
    --name $containerAppName `
    --query "properties.configuration.ingress.fqdn" `
    --output tsv 2>$null
if ($LASTEXITCODE -ne 0 -or -not $acaFqdn) {
    Write-FailBlock -What "Could not read FQDN of container app '$containerAppName'" `
        -Detail "Bicep reported success but the container app FQDN could not be read." `
        -Hint "Inspect: az containerapp list --resource-group $ResourceGroup --output table"
    exit 1
}
$acaUrl = "https://$acaFqdn"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "  =====================================" -ForegroundColor DarkCyan
Write-Host "   SERVER SETUP COMPLETE" -ForegroundColor Green
Write-Host "  =====================================" -ForegroundColor DarkCyan
Write-Host "  Resource group: $ResourceGroup" -ForegroundColor White
Write-Host "  ACR:            $AcrName" -ForegroundColor White
Write-Host "  Server URL:     $acaUrl" -ForegroundColor White
Write-Host "  (running a placeholder image until you deploy)" -ForegroundColor Gray
Write-Host ""
Write-Host "  Next: .\deploy\ServerDeploy.ps1  -- build image, deploy, upload agent" -ForegroundColor Gray
Write-Host ""
