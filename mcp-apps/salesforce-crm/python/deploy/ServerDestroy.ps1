<#
.SYNOPSIS
    ServerDestroy -- delete all Azure resources created by ServerDeploy.ps1,
    EXCEPT the resource group itself (which may be shared).

.DESCRIPTION
    Removes the SF Copilot's Azure footprint. Use this when:
      - You're tearing down a test deployment.
      - You want to re-create with different names/regions.
      - You're done with the cloud-hosted server (switching to LocalDeploy).

    What this script DELETES (in dependency order):
      1. Container App           lob-mcp-apps-sf
      2. Container Apps Env      lob-mcp-apps-env
      3. Log Analytics workspace lob-mcp-apps-env-logs       (--force-destroy to skip soft-delete)
      4. Azure Container Registry lobmcpapps                  (and all images in it)
      5. User-assigned Identity  lob-mcp-apps-env-identity   (role assignment auto-purged)

    What this script does NOT touch:
      - Resource group              ($ResourceGroup -- you keep it)
      - ai-plugin.json runtime URL  (still points at the now-dead ACA FQDN until you run LocalDeploy/ServerDeploy)
      - MOS3 agent package           (still listed in Teams -- separate concern)
      - parameters.bicepparam         (local file with your SF creds -- untouched)

.PARAMETER ResourceGroup
    Resource group to delete resources from. Default: GenericResourceGroup.

.PARAMETER AcrName
    ACR name (must match what was used in ServerDeploy). Default: lobmcpapps.

.PARAMETER Force
    Skip the confirmation prompt. Default: prompts before deleting anything.

.EXAMPLE
    .\deploy\ServerDestroy.ps1
    .\deploy\ServerDestroy.ps1 -Force
    .\deploy\ServerDestroy.ps1 -ResourceGroup MyOtherRG -AcrName lobmcpapps042

.NOTES
    Requires: Azure CLI 2.50+, signed in to the same subscription that holds
    the resources. Run from kit/sf-mcp-copilot/.
#>

param(
    [string]$ResourceGroup = "GenericResourceGroup",
    [string]$AcrName       = "lobmcpapps",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Helpers (mirror LocalDeploy/ServerDeploy style)
# ---------------------------------------------------------------------------

function Write-FailBlock {
    param([string]$What, [string]$Detail = "", [string]$Hint = "")
    Write-Host ""
    Write-Host "  ===================================" -ForegroundColor Red
    Write-Host "   FAILED: $What" -ForegroundColor Red
    Write-Host "  ===================================" -ForegroundColor Red
    if ($Detail) {
        Write-Host ""
        Write-Host "  Detail:" -ForegroundColor Yellow
        $Detail.Split("`n") | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
    }
    if ($Hint) {
        Write-Host ""
        Write-Host "  How to fix:" -ForegroundColor Yellow
        $Hint.Split("`n") | ForEach-Object { Write-Host "    $_" -ForegroundColor White }
    }
    Write-Host ""
}

function Assert-Tool {
    param([string]$Name, [string]$Why, [string]$Hint)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Write-FailBlock -What "Required tool '$Name' is not installed or not on PATH" -Detail "$Why" -Hint "$Hint"
        exit 1
    }
}

# Try-delete: runs an az delete, surfaces failure with context but does NOT
# stop the script (other resources may still need cleanup). Returns $true on
# success or "already gone", $false on a real error.
function Try-Delete {
    param(
        [string]$ResourceLabel,
        [scriptblock]$ExistsCheck,   # returns $true if the resource exists
        [scriptblock]$DeleteCommand,
        [string]$Hint = ""
    )
    Write-Host ""
    Write-Host ">> Deleting: $ResourceLabel" -ForegroundColor Cyan
    $exists = $false
    try { $exists = & $ExistsCheck } catch { $exists = $false }
    if (-not $exists) {
        Write-Host "   (skipped -- already gone)" -ForegroundColor Gray
        return $true
    }
    & $DeleteCommand
    if ($LASTEXITCODE -ne 0) {
        Write-FailBlock -What "Failed to delete $ResourceLabel (exit $LASTEXITCODE)" `
            -Detail "az command above returned non-zero. Resource may still exist." `
            -Hint $Hint
        return $false
    }
    Write-Host "   [deleted] $ResourceLabel" -ForegroundColor Green
    return $true
}

# ---------------------------------------------------------------------------
# Pre-flight
# ---------------------------------------------------------------------------

$deployRoot = $PSScriptRoot
$sfRoot     = Split-Path -Parent $deployRoot

Write-Host ""
Write-Host "  =======================================" -ForegroundColor DarkCyan
Write-Host "   SERVER DESTROY -- Tear down ACA stack" -ForegroundColor Cyan
Write-Host "  =======================================" -ForegroundColor DarkCyan
Write-Host ""
Write-Host ">> Phase 0/2: pre-flight checks" -ForegroundColor Cyan

Assert-Tool -Name "az" `
    -Why "Needed for every Azure delete operation." `
    -Hint "Install: 'winget install Microsoft.AzureCLI'. Then close + reopen PowerShell."

if (-not (Test-Path "$sfRoot\pyproject.toml")) {
    Write-FailBlock -What "Run this from kit/sf-mcp-copilot/" `
        -Detail "Script expects to find pyproject.toml one level up from deploy/." `
        -Hint "cd C:\demoprojects\lob-mcp-apps\kit\sf-mcp-copilot then re-run."
    exit 1
}

# Azure CLI signed in?
$accountJson = az account show --output json 2>$null
if ($LASTEXITCODE -ne 0 -or -not $accountJson) {
    Write-FailBlock -What "Azure CLI is not signed in" `
        -Detail "az account show returned no account." `
        -Hint "Run 'az login' first."
    exit 1
}
$account = $accountJson | ConvertFrom-Json
Write-Host "   Subscription: $($account.name) ($($account.id))" -ForegroundColor Gray

# Resource group exists?
$rgExists = az group exists --name $ResourceGroup 2>$null
if ($LASTEXITCODE -ne 0 -or $rgExists -ne "true") {
    Write-FailBlock -What "Resource group '$ResourceGroup' not found" `
        -Detail "az group exists returned '$rgExists'." `
        -Hint @"
Either it was already deleted, or you're targeting the wrong subscription:
  az group list --output table
"@
    exit 1
}
Write-Host "   Resource group: $ResourceGroup (will NOT be deleted)" -ForegroundColor Gray
Write-Host "   All pre-flight checks passed." -ForegroundColor Green
Write-Host ""

# ---------------------------------------------------------------------------
# Plan + confirm
# ---------------------------------------------------------------------------

$containerAppName = 'lob-mcp-apps-sf'
$envName          = 'lob-mcp-apps-env'
$logsName         = 'lob-mcp-apps-env-logs'
$identityName     = 'lob-mcp-apps-env-identity'

Write-Host "  About to delete (resource group will be kept):" -ForegroundColor Yellow
Write-Host "    Container App           $containerAppName" -ForegroundColor White
Write-Host "    Container Apps Env      $envName" -ForegroundColor White
Write-Host "    Log Analytics workspace $logsName" -ForegroundColor White
Write-Host "    Azure Container Registry $AcrName  (and all images)" -ForegroundColor White
Write-Host "    User-assigned Identity  $identityName  (role assignment auto-purged)" -ForegroundColor White
Write-Host ""

if (-not $Force) {
    $answer = Read-Host "  Type 'YES' to confirm deletion (anything else aborts)"
    if ($answer -ne 'YES') {
        Write-Host ""
        Write-Host "  [aborted] No resources deleted." -ForegroundColor Yellow
        Write-Host ""
        exit 0
    }
}

# ---------------------------------------------------------------------------
# Phase 1: delete in dependency order
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host ">> Phase 1/2: deleting resources in dependency order" -ForegroundColor Cyan

$allOk = $true

# 1. Container App (depends on env, identity, ACR)
$ok = Try-Delete -ResourceLabel "Container App '$containerAppName'" `
    -ExistsCheck { (az containerapp show -g $ResourceGroup -n $containerAppName --query "name" -o tsv 2>$null); ($LASTEXITCODE -eq 0) } `
    -DeleteCommand { az containerapp delete -g $ResourceGroup -n $containerAppName --yes --output none } `
    -Hint "If this fails, the app may have an active revision. Try: az containerapp revision list -g $ResourceGroup -n $containerAppName"
if (-not $ok) { $allOk = $false }

# 2. Container Apps Environment (depends on Log Analytics)
$ok = Try-Delete -ResourceLabel "Container Apps Environment '$envName'" `
    -ExistsCheck { (az containerapp env show -g $ResourceGroup -n $envName --query "name" -o tsv 2>$null); ($LASTEXITCODE -eq 0) } `
    -DeleteCommand { az containerapp env delete -g $ResourceGroup -n $envName --yes --output none } `
    -Hint "An environment must have no apps in it before delete. Step 1 should have cleared them."
if (-not $ok) { $allOk = $false }

# 3. Log Analytics workspace (use --force to skip soft-delete)
$ok = Try-Delete -ResourceLabel "Log Analytics workspace '$logsName'" `
    -ExistsCheck { (az monitor log-analytics workspace show -g $ResourceGroup -n $logsName --query "name" -o tsv 2>$null); ($LASTEXITCODE -eq 0) } `
    -DeleteCommand { az monitor log-analytics workspace delete -g $ResourceGroup -n $logsName --force true --yes --output none } `
    -Hint "Log Analytics has a 14-day soft-delete by default; --force=true purges immediately."
if (-not $ok) { $allOk = $false }

# 4. ACR (also clears the role assignment scoped to it)
$ok = Try-Delete -ResourceLabel "Azure Container Registry '$AcrName'" `
    -ExistsCheck { (az acr show -g $ResourceGroup -n $AcrName --query "name" -o tsv 2>$null); ($LASTEXITCODE -eq 0) } `
    -DeleteCommand { az acr delete -g $ResourceGroup -n $AcrName --yes --output none } `
    -Hint "If ACR delete fails with 'in use', confirm no Container Apps/AKS still reference it."
if (-not $ok) { $allOk = $false }

# 5. Managed Identity
$ok = Try-Delete -ResourceLabel "User-assigned Managed Identity '$identityName'" `
    -ExistsCheck { (az identity show -g $ResourceGroup -n $identityName --query "name" -o tsv 2>$null); ($LASTEXITCODE -eq 0) } `
    -DeleteCommand { az identity delete -g $ResourceGroup -n $identityName --output none } `
    -Hint "If delete fails, check 'az role assignment list --assignee <principalId>' to find lingering refs."
if (-not $ok) { $allOk = $false }

# ---------------------------------------------------------------------------
# Phase 2: verify + final summary
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host ">> Phase 2/2: verifying RG is now empty (of OUR resources)" -ForegroundColor Cyan
$leftover = az resource list -g $ResourceGroup --query "[?contains(name, 'lob-mcp-apps') || contains(name, 'lobmcpapps')].{Name:name, Type:type}" -o json 2>$null
if ($LASTEXITCODE -eq 0 -and $leftover -and $leftover -ne "[]") {
    Write-Host "   Some related resources remain:" -ForegroundColor Yellow
    Write-Host $leftover -ForegroundColor Gray
} else {
    Write-Host "   No remaining lob-mcp-apps* resources in $ResourceGroup." -ForegroundColor Green
}

Write-Host ""
if ($allOk) {
    Write-Host "  =====================================" -ForegroundColor DarkCyan
    Write-Host "   SERVER DESTROY COMPLETE" -ForegroundColor Green
    Write-Host "  =====================================" -ForegroundColor DarkCyan
    Write-Host "  RG kept: $ResourceGroup" -ForegroundColor White
    Write-Host ""
    Write-Host "  Reminders:" -ForegroundColor Gray
    Write-Host "    - ai-plugin.json still points at the now-dead ACA URL." -ForegroundColor Gray
    Write-Host "      Run LocalDeploy or ServerDeploy to re-set it." -ForegroundColor Gray
    Write-Host "    - The agent is still registered in MOS3 (Teams)." -ForegroundColor Gray
    Write-Host "      Delete it from the Teams admin center if you want it gone there too." -ForegroundColor Gray
    Write-Host ""
    exit 0
} else {
    Write-FailBlock -What "One or more deletes failed -- see error blocks above" `
        -Detail "Some resources may still exist in $ResourceGroup." `
        -Hint @"
Inspect what's left:
  az resource list -g $ResourceGroup --output table
You can re-run ServerDestroy.ps1 -- it skips resources that are already gone.
"@
    exit 1
}
