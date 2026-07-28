<#
.SYNOPSIS
    ServerDeploy -- build the SF MCP server image, deploy it to the Azure
    Container App, and upload the Copilot agent to MOS3.

.DESCRIPTION
    This is the SECOND of the two server scripts. It assumes the Azure infra
    already exists -- run AzureImageSetup.ps1 first to create it.

        1. AzureImageSetup.ps1   (create/verify Azure infra)
        2. ServerDeploy.ps1  <-- you are here (build + deploy + upload agent)

    ServerDeploy provisions NO infrastructure. It builds a fresh image in
    ACR, points the existing Container App at it, and re-registers the agent
    against the live Azure URL. Idempotent: re-run it any time you ship new
    server or agent code. If the infra isn't there yet, it stops and tells
    you to run AzureImageSetup.ps1.

    Use LocalDeploy.ps1 instead when you want the server running on this
    laptop via a dev tunnel. This script is OPERATIONALLY INDEPENDENT of
    LocalDeploy.ps1. Shared implementation lives in _deploy_common.ps1
    (dot-sourced below).

    Phases:
      0. Pre-flight checks (az signed in, files in place, infra exists)
      1. Build image in ACR + point the Container App at it
      2. Read the live ACA FQDN back from the container app
      3. Regen manifests against the ACA URL
      4. Build appPackage zip + upload to MOS3

.EXAMPLE
    .\deploy\ServerDeploy.ps1

.NOTES
    Requires: Azure CLI 2.50+, signed in to a subscription with Contributor
    rights on the resource group, and the infra already provisioned by
    AzureImageSetup.ps1. Run from salesforce-crm/python/.
#>

# Fixed deploy targets -- run this script with no parameters.
$ResourceGroup = "GenericResourceGroup"
$Location      = "southindia"
$AcrName       = "lobmcpapps"

$ErrorActionPreference = "Stop"

. "$PSScriptRoot\_deploy_common.ps1"

# Force a UTF-8 console. `az acr build` streams the in-registry Docker build
# log straight to the console; without this, the CLI's colorama writer crashes
# with "'charmap' codec can't encode character '\u2713'" the moment the build
# prints a non-cp1252 character (e.g. npm's success checkmark), aborting an
# otherwise-successful build.
$env:PYTHONUTF8       = "1"
$env:PYTHONIOENCODING = "utf-8"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

# ---------------------------------------------------------------------------
# Paths & MOS3 config
# ---------------------------------------------------------------------------

$deployRoot       = $PSScriptRoot                            # deploy\
$App              = Split-Path -Parent $deployRoot           # salesforce-crm\python\
$paramsFile       = Join-Path $deployRoot 'parameters.bicepparam'
$containerAppName = 'lob-mcp-apps-sf'

$ClientId   = "7ea7c24c-b1f6-4a20-9d11-9ae12e9e7ac0"
$TenantId   = "8b7a11d9-6513-4d54-a468-f6630df73c8b"
$Scope      = "https://titles.prod.mos.microsoft.com/.default"
$MOS3Url    = "https://titles.prod.mos.microsoft.com"
$TokenCache = "$App\.mos3_token_cache.json"
$SrcDir     = "$App\agent\appPackage"
$BuildDir   = "$App\agent\appPackage\build"
$TmpDir     = "$App\agent\appPackage\_tmp_zip"
$ZipPath    = "$BuildDir\appPackage.dev.zip"
$EnvFile    = "$App\agent\env\.env.dev"
$RegenPy    = "$App\deploy\regen_manifests.py"
# VenvPython is only needed by regen_manifests.py. If the venv exists, use
# it; otherwise fall back to the python on PATH. ServerDeploy doesn't build
# a venv itself -- creating one is LocalDeploy's job.
$VenvPython = "$App\.venv\Scripts\python.exe"
if (-not (Test-Path $VenvPython)) { $VenvPython = "python" }

Write-Host ""
Write-Host "  =====================================" -ForegroundColor DarkCyan
Write-Host "   SERVER DEPLOY -- SF Copilot to Azure" -ForegroundColor Cyan
Write-Host "  =====================================" -ForegroundColor DarkCyan
Write-Host ""

# ---------------------------------------------------------------------------
# Phase 0: Pre-flight checks
# ---------------------------------------------------------------------------
Write-Host ">> Phase 0/4: pre-flight checks" -ForegroundColor Cyan

Assert-File -Path "$App\pyproject.toml" `
    -Why "ServerDeploy.ps1 must be run from the app root (script is in deploy/)." `
    -Hint "cd to the salesforce-crm/python/ folder then re-run."

Assert-File -Path "$PSScriptRoot\_deploy_common.ps1" `
    -Why "Shared helper functions live here; dot-sourced at the top of this script." `
    -Hint "_deploy_common.ps1 is part of the repo. Pull latest from git."

Assert-Tool -Name "az" `
    -Why "Needed for every Azure operation (group create, deployment, acr build, containerapp update)." `
    -Hint "Install: 'winget install Microsoft.AzureCLI'. Then close + reopen PowerShell so PATH refreshes."

Assert-Tool -Name "robocopy" `
    -Why "Used to stage a clean build context for az acr build." `
    -Hint "robocopy is built into Windows; if it is missing your PATH likely lost C:\Windows\System32. Repair PATH."

Assert-File -Path $paramsFile `
    -Why "Bicep parameters file required for deploy." `
    -Hint "Setup step: edit $paramsFile and fill in your Salesforce credentials, then re-run."

Assert-File -Path "$SrcDir\ai-plugin.json"        -Why "Agent runtime descriptor."     -Hint "Pull latest from git."
Assert-File -Path "$SrcDir\mcp-tools.json"        -Why "MCP tools manifest."           -Hint "Pull latest from git."
Assert-File -Path "$SrcDir\declarativeAgent.json" -Why "Declarative agent shell."      -Hint "Pull latest from git."
Assert-File -Path "$SrcDir\manifest.json"         -Why "Teams app manifest skeleton."  -Hint "Pull latest from git."
Assert-File -Path "$SrcDir\instruction.txt"       -Why "System prompt for the agent." -Hint "Pull latest from git."

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

# Infra must already exist -- ServerDeploy provisions nothing. If the Container
# App isn't there, the user skipped AzureImageSetup.ps1.
$existingFqdn = az containerapp show `
    --resource-group $ResourceGroup `
    --name $containerAppName `
    --query "properties.configuration.ingress.fqdn" `
    --output tsv 2>$null
if ($LASTEXITCODE -ne 0 -or -not $existingFqdn) {
    Write-FailBlock -What "Azure infra not found (container app '$containerAppName' in resource group '$ResourceGroup')" `
        -Detail "ServerDeploy builds and ships code onto existing infra -- it does not create any." `
        -Hint "Run .\deploy\AzureImageSetup.ps1 first (same -ResourceGroup / -Location / -AcrName), then re-run ServerDeploy."
    exit 1
}
Write-Host "   All pre-flight checks passed." -ForegroundColor Green
Write-Host ""

# ---------------------------------------------------------------------------
# Phase 1: Build image in ACR + point the Container App at it
# ---------------------------------------------------------------------------
Write-Host ">> Phase 1/4: build image + deploy to container app" -ForegroundColor Cyan
Write-Host "   Resource group: $ResourceGroup" -ForegroundColor Gray
Write-Host "   Location:       $Location" -ForegroundColor Gray
Write-Host "   ACR:            $AcrName" -ForegroundColor Gray

# 1a. Build container image inside Azure.
#
# Stage the app into a temp folder under %TEMP% using robocopy with /XD to
# exclude bulky folders (node_modules, .venv). `az acr build` then runs
# against the clean staging dir — fast because heavy folders are excluded.
Write-Host "   >> Staging clean build context..." -ForegroundColor Cyan
$staging = Join-Path $env:TEMP ("lob-mcp-build-" + [Guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Path $staging | Out-Null

$excludeDirs  = @('node_modules', '.venv', 'venv', '__pycache__', 'dist', 'build', '.git', '.vscode', '.idea', 'agent', 'deploy')
$excludeFiles = @('*.pyc', '*.pyo', '.env', '.env.dev', '.env.prod', '*.log', 'parameters.bicepparam', '.mos3_token_cache.json')

robocopy $App $staging /MIR /XD @excludeDirs /XF @excludeFiles /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null

# robocopy exit codes 0-7 are success, 8+ are errors. Reset $LASTEXITCODE
# so the next az command's failure isn't masked.
$global:LASTEXITCODE = 0

$dockerfileStaged = Join-Path $staging 'Dockerfile'
if (-not (Test-Path $dockerfileStaged)) {
    Write-FailBlock -What "Staging failed -- Dockerfile not found at $dockerfileStaged" `
        -Detail "robocopy did not copy the Dockerfile. The source tree may be missing it." `
        -Hint "Check that $App\Dockerfile exists. Pull latest from git if not."
    exit 1
}

$stagedMB    = [math]::Round(((Get-ChildItem $staging -Recurse -File | Measure-Object Length -Sum).Sum / 1MB), 2)
$stagedFiles = (Get-ChildItem $staging -Recurse -File | Measure-Object).Count
Write-Host "      Staged $stagedFiles files, $stagedMB MB" -ForegroundColor Gray

Write-Host "   >> Building container image (az acr build)..." -ForegroundColor Cyan
Push-Location $staging
try {
    # `az.cmd` launches its bundled Python as `python.exe -IBm azure.cli`. The
    # -I (isolated) flag makes Python ignore ALL PYTHON* env vars, so we cannot
    # fix the stdout encoding via PYTHONUTF8/PYTHONIOENCODING. On a redirected
    # (non-console) stdout the interpreter then defaults to cp1252, and the acr
    # build log streamer crashes with "'charmap' codec can't encode '\u2713'"
    # the instant the in-registry Docker build prints npm's success checkmark --
    # aborting a build that actually succeeded.
    #
    # Fix: re-invoke the SAME bundled Python WITHOUT -I and in UTF-8 mode, so
    # the log stream encodes cleanly. Fall back to plain `az` if the bundled
    # interpreter can't be located (e.g. a non-MSI install).
    $azCmd = (Get-Command az -ErrorAction SilentlyContinue).Source
    $azPy  = if ($azCmd) { Join-Path (Split-Path (Split-Path $azCmd -Parent) -Parent) 'python.exe' } else { $null }

    if ($azPy -and (Test-Path $azPy)) {
        $env:PYTHONUTF8       = "1"
        $env:PYTHONIOENCODING = "utf-8"
        & $azPy -Bm azure.cli acr build `
            --registry $AcrName `
            --image sf-mcp-copilot:latest `
            --file Dockerfile `
            .
    } else {
        az acr build `
            --registry $AcrName `
            --image sf-mcp-copilot:latest `
            --file Dockerfile `
            .
    }
    if ($LASTEXITCODE -ne 0) {
        Write-FailBlock -What "az acr build failed (exit $LASTEXITCODE)" `
            -Detail "Image build inside ACR failed. Inspect the build log above." `
            -Hint "Common: a Python dep failed to install (check pyproject.toml), or the Dockerfile has a syntax error."
        exit 1
    }
} finally {
    Pop-Location
    Remove-Item -Recurse -Force $staging -ErrorAction SilentlyContinue
}

# 1d. Swap the container app to the freshly-built image
Write-Host "   >> Updating container app to use new image..." -ForegroundColor Cyan
$acrLoginServer = az acr show --name $AcrName --query loginServer --output tsv
if ($LASTEXITCODE -ne 0 -or -not $acrLoginServer) {
    Write-FailBlock -What "Could not read ACR login server for '$AcrName'" `
        -Detail "az acr show returned no loginServer." `
        -Hint "Did the bicep deployment actually create ACR? Run: az acr list -g $ResourceGroup -o table"
    exit 1
}
az containerapp update `
    --resource-group $ResourceGroup `
    --name $containerAppName `
    --image "$acrLoginServer/sf-mcp-copilot:latest" | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-FailBlock -What "az containerapp update failed (exit $LASTEXITCODE)" `
        -Detail "Could not swap the container app to the new image." `
        -Hint "Check that the image '$acrLoginServer/sf-mcp-copilot:latest' actually exists: az acr repository list -n $AcrName"
    exit 1
}

# 1e. Re-assert sticky sessions on ingress (belt-and-suspenders).
# main.bicep already declares stickySessions.affinity=sticky, but the Bicep
# deployment occasionally fails with an opaque "content already consumed"
# error before reaching the ingress block. Without sticky, MCP session
# state (in-memory per replica) is lost on round-robin requests and Teams
# sees Method Not Found / multi-accept / cyclic loops. Re-applying via
# the direct ingress command is idempotent and survives the bicep flake.
Write-Host "   >> Re-asserting sticky sessions on ingress..." -ForegroundColor Cyan
az containerapp ingress sticky-sessions set `
    --resource-group $ResourceGroup `
    --name $containerAppName `
    --affinity sticky | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-FailBlock -What "Could not enable sticky sessions on ingress (exit $LASTEXITCODE)" `
        -Detail "The container app was updated to the new image, but the ingress affinity could not be set." `
        -Hint @"
The container app is still serving traffic, but MCP session state may be lost on multi-replica round-robin.
Verify manually:
  az containerapp ingress show -g $ResourceGroup -n $containerAppName --query stickySessions
Re-apply manually:
  az containerapp ingress sticky-sessions set -g $ResourceGroup -n $containerAppName --affinity sticky
"@
    exit 1
}
Write-Host "      sticky-sessions = sticky" -ForegroundColor Gray

# ---------------------------------------------------------------------------
# Phase 2: Read the live FQDN
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host ">> Phase 2/4: reading ACA public FQDN..." -ForegroundColor Cyan
$acaFqdn = az containerapp show `
    --resource-group $ResourceGroup `
    --name $containerAppName `
    --query "properties.configuration.ingress.fqdn" `
    --output tsv 2>$null
if ($LASTEXITCODE -ne 0 -or -not $acaFqdn) {
    Write-FailBlock -What "Could not read FQDN of container app '$containerAppName'" `
        -Detail "az containerapp show returned exit $LASTEXITCODE or an empty result." `
        -Hint @"
The container app may not have been created. Check:
  az containerapp list --resource-group $ResourceGroup --output table
If the app is there but FQDN is empty, ingress likely isn't configured -- inspect properties.configuration.ingress.
"@
    exit 1
}
$acaUrl = "https://$acaFqdn"
Write-Host "   FQDN: $acaUrl" -ForegroundColor Gray

# ---------------------------------------------------------------------------
# Phase 3: Regen manifests against the ACA URL
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host ">> Phase 3/4: syncing tools into manifests (regen_manifests.py)..." -ForegroundColor Cyan
Invoke-RegenManifests -GatewayUrl $acaUrl -PythonExe $VenvPython -ScriptPath $RegenPy

# ---------------------------------------------------------------------------
# Phase 4: MOS3 -- token, build, upload
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host ">> Phase 4/4: acquiring MOS3 token..." -ForegroundColor Cyan
$token = Get-MOS3Token -ClientId $ClientId -TenantId $TenantId -Scope $Scope -TokenCachePath $TokenCache

Write-Host "  >> Building app package..." -ForegroundColor Cyan
Build-AppPackageZip -SrcDir $SrcDir -BuildDir $BuildDir -TmpDir $TmpDir -ZipPath $ZipPath `
    -RuntimeUrl $acaUrl -EnvFile $EnvFile

$null = Push-AppPackageToMOS3 -ZipPath $ZipPath -Token $token -Mos3Url $MOS3Url

# ---------------------------------------------------------------------------
# Final summary
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "  =====================================" -ForegroundColor DarkCyan
Write-Host "   SERVER DEPLOY COMPLETE" -ForegroundColor Green
Write-Host "  =====================================" -ForegroundColor DarkCyan
Write-Host "  Server:  $acaUrl" -ForegroundColor White
Write-Host "  Agent:   live in MOS3, pointing at ACA" -ForegroundColor White
Write-Host ""
Write-Host "  Next: open Microsoft Teams, pick Ask - Salesforce, test." -ForegroundColor Gray
Write-Host ""
