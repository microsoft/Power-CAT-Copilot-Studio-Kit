<#
.SYNOPSIS
    ServerDestroy -- delete all Azure resources created by ServerDeploy.ps1,
    EXCEPT the resource group itself (which may be shared).

.DESCRIPTION
    Removes the SN Copilot's Azure footprint. Use this when:
      - You're tearing down a test deployment.
      - You want to re-create with different names/regions.
      - You're done with the cloud-hosted server (switching to LocalDeploy).

    What this script DELETES (in dependency order):
      1. Container App           gtc-sn-gw
      2. Container Apps Env      gtc-sn-env
      3. Log Analytics workspace gtc-sn-env-logs            (--force-destroy to skip soft-delete)
      4. Azure Container Registry gtcsnregistry              (and all images in it)
      5. User-assigned Identity  gtc-sn-env-identity        (role assignment auto-purged)

    What this script does NOT touch:
      - Resource group              ($ResourceGroup -- you keep it)
      - ai-plugin.json runtime URL  (still points at the now-dead ACA FQDN until you run LocalDeploy/ServerDeploy)
      - MOS3 agent package           (still listed in Teams -- separate concern)
      - parameters.bicepparam         (local file with your SN creds -- untouched)

.PARAMETER ResourceGroup
    Resource group to delete resources from. Default: gtc-sn-rg.

.PARAMETER AcrName
    ACR name (must match what was used in ServerDeploy). Default: gtcsnregistry.

.PARAMETER Force
    Skip the confirmation prompt. Default: prompts before deleting anything.

.EXAMPLE
    .\deploy\ServerDestroy.ps1
    .\deploy\ServerDestroy.ps1 -Force
    .\deploy\ServerDestroy.ps1 -ResourceGroup MyOtherRG -AcrName gtcsnregistry042

.NOTES
    Requires: Azure CLI 2.50+, signed in to the same subscription that holds
    the resources. Run from kit/sn-mcp-copilot/.
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
$snRoot     = Split-Path -Parent $deployRoot

Write-Host ""
Write-Host "  =======================================" -ForegroundColor DarkCyan
Write-Host "   SERVER DESTROY -- Tear down ACA stack" -ForegroundColor Cyan
Write-Host "  =======================================" -ForegroundColor DarkCyan
Write-Host ""
Write-Host ">> Phase 0/2: pre-flight checks" -ForegroundColor Cyan

Assert-Tool -Name "az" `
    -Why "Needed for every Azure delete operation." `
    -Hint "Install: 'winget install Microsoft.AzureCLI'. Then close + reopen PowerShell."

if (-not (Test-Path "$snRoot\pyproject.toml")) {
    Write-FailBlock -What "Run this from kit/sn-mcp-copilot/" `
        -Detail "Script expects to find pyproject.toml one level up from deploy/." `
        -Hint "cd C:\demoprojects\lob-mcp-apps\kit\sn-mcp-copilot then re-run."
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

# SN shares infrastructure with SF -- env, logs, identity, ACR are all shared.
# Only the SN-specific container app is unique to SN and safe to delete here.
# To tear down the shared infrastructure, use sf-mcp-copilot/deploy/ServerDestroy.ps1
# (which assumes nothing else depends on it).
$containerAppName = 'gtc-sn-gw'
$envName          = 'lob-mcp-apps-env'        # SHARED with SF — NOT deleted here
$logsName         = 'lob-mcp-apps-env-logs'   # SHARED with SF — NOT deleted here
$identityName     = 'lob-mcp-apps-env-identity'  # SHARED with SF — NOT deleted here

Write-Host "  About to delete (resource group will be kept):" -ForegroundColor Yellow
Write-Host "    Container App  $containerAppName  (SN-specific)" -ForegroundColor White
Write-Host "    SN image       $AcrName/sn-mcp-copilot (image only — ACR kept)" -ForegroundColor White
Write-Host ""
Write-Host "  Shared with SF (NOT touched by this script):" -ForegroundColor Gray
Write-Host "    Container Apps Env       $envName" -ForegroundColor DarkGray
Write-Host "    Log Analytics workspace  $logsName" -ForegroundColor DarkGray
Write-Host "    Managed Identity         $identityName" -ForegroundColor DarkGray
Write-Host "    Azure Container Registry $AcrName  (still hosts SF image)" -ForegroundColor DarkGray
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

# Only the SN-specific container app is deleted. The env, logs, identity, and
# ACR are shared with SF and remain in place. Use sf-mcp-copilot's ServerDestroy
# if you want to tear those down.
$ok = Try-Delete -ResourceLabel "Container App '$containerAppName'" `
    -ExistsCheck { (az containerapp show -g $ResourceGroup -n $containerAppName --query "name" -o tsv 2>$null); ($LASTEXITCODE -eq 0) } `
    -DeleteCommand { az containerapp delete -g $ResourceGroup -n $containerAppName --yes --output none } `
    -Hint "If this fails, the app may have an active revision. Try: az containerapp revision list -g $ResourceGroup -n $containerAppName"
if (-not $ok) { $allOk = $false }

# Optionally delete the SN image from the shared ACR. SF still has its own image.
$ok = Try-Delete -ResourceLabel "SN image in ACR '$AcrName/sn-mcp-copilot'" `
    -ExistsCheck { (az acr repository show -n $AcrName --repository sn-mcp-copilot --query "name" -o tsv 2>$null); ($LASTEXITCODE -eq 0) } `
    -DeleteCommand { az acr repository delete -n $AcrName --repository sn-mcp-copilot --yes --output none } `
    -Hint "Removes only the SN image; the ACR itself stays for SF to use."
if (-not $ok) { $allOk = $false }

# ---------------------------------------------------------------------------
# Phase 2: verify + final summary
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host ">> Phase 2/2: verifying SN-specific resources are gone" -ForegroundColor Cyan
$leftover = az resource list -g $ResourceGroup --query "[?name=='$containerAppName'].{Name:name, Type:type}" -o json 2>$null
if ($LASTEXITCODE -eq 0 -and $leftover -and $leftover -ne "[]") {
    Write-Host "   Container app still present:" -ForegroundColor Yellow
    Write-Host $leftover -ForegroundColor Gray
} else {
    Write-Host "   No remaining SN-specific resources in $ResourceGroup." -ForegroundColor Green
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
