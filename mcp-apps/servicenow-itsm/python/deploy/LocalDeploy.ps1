<#
.SYNOPSIS
    LocalDeploy -- start the SN MCP server on this laptop, open a dev tunnel,
    and push the agent to MOS3 (Microsoft Online Services 3, the M365 store).

.DESCRIPTION
    End-to-end LOCAL deploy. Use this when you want the server running on
    your machine (active development). Use ServerDeploy.ps1 when you want
    it running in Azure Container Apps.

    This script is OPERATIONALLY INDEPENDENT of ServerDeploy.ps1 -- it
    never calls into ServerDeploy and is never called by it. Shared
    implementation lives in _deploy_common.ps1 (dot-sourced below).

    Phases:
      0. Pre-flight checks (Python, npm, devtunnel, required files)
      1. Build Python venv + widget bundle if stale
      2. Start the Python MCP server on $ServerPort in a new window
      3. Open or refresh the dev tunnel
      4. Run regen_manifests.py against the live tunnel URL
      5. Build appPackage zip + upload to MOS3

.EXAMPLE
    .\deploy\LocalDeploy.ps1

.NOTES
    Requires: Python 3.11+, Dev Tunnels CLI, Node.js 18+ (for widget build).
    Run from the kit/sn-mcp-copilot/ directory (script is in deploy/).
#>

# Fixed local config -- run this script with no parameters.
$TunnelName = "gtc-sn-v05"
$ServerPort = 8081

$ErrorActionPreference = "Stop"

. "$PSScriptRoot\_deploy_common.ps1"

# ---------------------------------------------------------------------------
# Paths & MOS3 config
# ---------------------------------------------------------------------------

$App        = Split-Path -Parent $PSScriptRoot               # servicenow-itsm\python\
$VenvPython = "$App\.venv\Scripts\python.exe"
$Pkg        = "servicenow_mcp"

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

Write-Host ""
Write-Host "  Ask - ServiceNow  v0.5.0  (LocalDeploy)" -ForegroundColor Cyan
Write-Host "  Port $ServerPort  |  Tunnel $TunnelName" -ForegroundColor DarkCyan
Write-Host ""

# ---------------------------------------------------------------------------
# Phase 0: Pre-flight checks
# ---------------------------------------------------------------------------
Write-Host ">> Phase 0/5: pre-flight checks" -ForegroundColor Cyan

Assert-File -Path "$App\pyproject.toml" `
    -Why "LocalDeploy.ps1 must be run from kit/sn-mcp-copilot/ (script is in deploy/)." `
    -Hint "cd C:\demoprojects\lob-mcp-apps\kit\sn-mcp-copilot then re-run."

Assert-File -Path "$PSScriptRoot\_deploy_common.ps1" `
    -Why "Shared helper functions live here; dot-sourced at the top of this script." `
    -Hint "_deploy_common.ps1 is part of the repo. Pull latest from git."

Assert-Tool -Name "python" `
    -Why "Needed to create the venv and run the MCP server." `
    -Hint "Install Python 3.11+ from https://python.org or via 'winget install Python.Python.3.11'."

Assert-Tool -Name "devtunnel" `
    -Why "Needed to expose the local server to Microsoft Teams over HTTPS." `
    -Hint "Install Dev Tunnels CLI from https://aka.ms/devtunnels/download then run 'devtunnel user login'."

Assert-File -Path "$SrcDir\ai-plugin.json"        -Why "Agent runtime descriptor."          -Hint "This is part of the repo. Pull latest from git."
Assert-File -Path "$SrcDir\mcp-tools.json"        -Why "MCP tools manifest."                -Hint "This is part of the repo. Pull latest from git."
Assert-File -Path "$SrcDir\declarativeAgent.json" -Why "Declarative agent shell."           -Hint "This is part of the repo. Pull latest from git."
Assert-File -Path "$SrcDir\manifest.json"         -Why "Teams app manifest skeleton."       -Hint "This is part of the repo. Pull latest from git."
Assert-File -Path "$SrcDir\instruction.txt"       -Why "System prompt for the agent."       -Hint "This is part of the repo. Pull latest from git."

Write-Host "   All pre-flight checks passed." -ForegroundColor Green
Write-Host ""

# ---------------------------------------------------------------------------
# Phase 1: Build venv + widget if stale
# ---------------------------------------------------------------------------
# Two-stage check: venv existence (python.exe) and install completeness
# (sentinel file). A previous failed run can leave the venv created but
# deps un-installed -- the sentinel ensures we re-run installs in that
# case instead of silently skipping them.
$VenvMarker = "$App\.venv\.installed"

if (-not (Test-Path $VenvPython)) {
    Write-Host ">> Phase 1a/5: creating Python venv (first run)..." -ForegroundColor Cyan
    Invoke-ExternalChecked -Step "python -m venv" `
        -Command { python -m venv "$App\.venv" } `
        -Hint "Make sure Python 3.11+ is on PATH. Try: python --version"
}

if (-not (Test-Path $VenvMarker)) {
    Write-Host ">> Phase 1a/5: installing Python dependencies (~1 min)..." -ForegroundColor Cyan
    # Windows blocks `pip.exe install --upgrade pip` because pip.exe is in
    # use by the running process. Invoke via `python -m pip` instead --
    # that's the pattern pip itself recommends in its own error message.
    Invoke-ExternalChecked -Step "pip install --upgrade pip" `
        -Command { & $VenvPython -m pip install --upgrade pip --quiet } `
        -Hint "Network issue? Check connection / corporate proxy."

    Invoke-ExternalChecked -Step "pip install -e ." `
        -Command { & $VenvPython -m pip install -e "$App" --quiet } `
        -Hint "Check pyproject.toml for syntax errors or missing deps."

    # Marker is touched only after all three installs succeed. If any
    # step above failed, the marker is absent and next run redoes the
    # installs from scratch.
    New-Item -ItemType File -Path $VenvMarker -Force | Out-Null
    Write-Host "   [ready] Venv built." -ForegroundColor Green
}

# Widget build (only if missing or stale).
# Staleness includes BOTH this LOB's widgets/src/ AND the shared
# widgets/mcp-shared/widgets/src/ — referenced via `file:./mcp-shared`
# in widgets/package.json, so edits there trigger a rebuild.
$widgetHtml    = "$App\$Pkg\web\widget.html"
$widgetSrcDirs = @("$App\widgets\src", "$App\widgets\mcp-shared\widgets\src")
$widgetStale   = $false
if (-not (Test-Path $widgetHtml)) {
    $widgetStale = $true
} else {
    $widgetHtmlMtime = (Get-Item $widgetHtml).LastWriteTime
    foreach ($dir in $widgetSrcDirs) {
        if (-not (Test-Path $dir)) { continue }
        $newestSrc = (Get-ChildItem $dir -Recurse -File -ErrorAction SilentlyContinue |
                      Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime
        if ($newestSrc -and $newestSrc -gt $widgetHtmlMtime) {
            $widgetStale = $true
            break
        }
    }
}
if ($widgetStale) {
    Assert-Tool -Name "npm" `
        -Why "Widget source is newer than the built widget.html and needs rebuilding." `
        -Hint "Install Node.js 18+ from https://nodejs.org or via 'winget install OpenJS.NodeJS'."

    if (-not (Test-Path "$App\widgets\node_modules")) {
        Write-Host ">> Phase 1b/5: installing widget dependencies (npm install, ~2 min)..." -ForegroundColor Cyan
        Push-Location "$App\widgets"
        try {
            Invoke-ExternalChecked -Step "npm install" `
                -Command { npm install } `
                -Hint "Check kit/sn-mcp-copilot/widgets/package.json. Network / corporate registry issue is common."
        } finally { Pop-Location }
    }

    Write-Host ">> Phase 1c/5: building widget bundle..." -ForegroundColor Cyan
    Push-Location "$App\widgets"
    try {
        Invoke-ExternalChecked -Step "npm run build" `
            -Command { npm run build } `
            -Hint "Look for TypeScript or Vite errors above. Often a transient HMR conflict; re-run."
    } finally { Pop-Location }

    if (-not (Test-Path $widgetHtml)) {
        Write-FailBlock -What "Widget build finished but produced no widget.html" `
            -Detail "Expected output at $widgetHtml" `
            -Hint "Check kit/sn-mcp-copilot/widgets/build.mjs for path issues."
        exit 1
    }
    Write-Host "   [widget] Built $widgetHtml" -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# Phase 2: Start MCP server
# ---------------------------------------------------------------------------
$procs = (Get-NetTCPConnection -LocalPort $ServerPort -State Listen -ErrorAction SilentlyContinue).OwningProcess | Select-Object -Unique
if ($procs) {
    $procs | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    Write-Host "  [server] Stopped existing process on port $ServerPort" -ForegroundColor Yellow
    Start-Sleep 1
}
Write-Host ">> Phase 2/5: starting SN MCP server on port $ServerPort..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "`$host.UI.RawUI.WindowTitle = 'SN MCP Server :$ServerPort'; Set-Location '$App'; & '$VenvPython' -m servicenow_mcp"
)

$waited = 0
$up = $false
do {
    Start-Sleep 2; $waited += 2
    # A listening TCP port means the server is up. This is more reliable
    # than an HTTP probe: the root path returns 404 (the MCP endpoint is
    # /mcp), and some PowerShell versions surface that 404 as an exception
    # with a null .Response, causing a false "server did not respond".
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $iar = $tcp.BeginConnect("localhost", $ServerPort, $null, $null)
        if ($iar.AsyncWaitHandle.WaitOne(2000) -and $tcp.Connected) { $up = $true }
        $tcp.Close()
    } catch {
        $up = $false
    }
    Write-Host "`r  [watch] Waiting for server... ${waited}s" -NoNewline -ForegroundColor Yellow
} while (-not $up -and $waited -lt 30)
Write-Host ""
if ($up) {
    Write-Host "  [up] Server live: http://localhost:$ServerPort" -ForegroundColor Green
} else {
    Write-FailBlock -What "Server did not respond on port $ServerPort within 30 seconds" `
        -Detail "Look at the 'SN MCP Server' window that just opened. It usually shows the exception that prevented startup." `
        -Hint @"
Common causes:
  - Missing/wrong SN credentials in .env -- check SERVICENOW_INSTANCE / SERVICENOW_CLIENT_ID / SERVICENOW_CLIENT_SECRET / SERVICENOW_USERNAME / SERVICENOW_PASSWORD
  - Port $ServerPort already in use by another process
  - Python deps not installed -- delete .venv/ and re-run to force a fresh venv build
"@
    exit 1
}

# ---------------------------------------------------------------------------
# Phase 3: Open dev tunnel
# ---------------------------------------------------------------------------
$tunnelUrl = $null
$tunnelProcs = Get-Process -Name "devtunnel" -ErrorAction SilentlyContinue
if ($tunnelProcs) {
    $tunnelProcs | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Host "  [tunnel] Stopped existing devtunnel process" -ForegroundColor Yellow
    Start-Sleep 2
}
Write-Host ">> Phase 3/5: opening dev tunnel '$TunnelName'..." -ForegroundColor Cyan

# devtunnel 'show' returns non-zero + writes to stderr if the tunnel doesn't exist.
# Belt-and-suspenders: temporarily disable Stop-on-error AND capture both streams.
$savedEAP = $ErrorActionPreference
$ErrorActionPreference = 'SilentlyContinue'
$existingInfo = ""
try {
    $existingInfo = (& cmd /c "devtunnel show $TunnelName 2>&1") -join "`n"
} catch {
    $existingInfo = ""
}
$ErrorActionPreference = $savedEAP
if ($existingInfo -notmatch 'Tunnel ID') {
    Write-Host "  [tunnel] Creating new tunnel..." -ForegroundColor Yellow
    devtunnel create $TunnelName --allow-anonymous
    if ($LASTEXITCODE -ne 0) {
        Write-FailBlock -What "devtunnel create $TunnelName failed (exit $LASTEXITCODE)" `
            -Detail "Could not create a new tunnel." `
            -Hint "Run 'devtunnel user login' (one-time) if you haven't, or pick a different -TunnelName."
        exit 1
    }
    devtunnel port create $TunnelName -p $ServerPort --protocol auto
} else {
    $portExists = $existingInfo | Select-String "$ServerPort"
    if (-not $portExists) {
        devtunnel port create $TunnelName -p $ServerPort --protocol auto
    }
}
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "`$host.UI.RawUI.WindowTitle = 'SN Tunnel ($TunnelName)'; devtunnel host $TunnelName --allow-anonymous"
)

Write-Host "  [watch] Registering tunnel..." -NoNewline -ForegroundColor Yellow
$savedEAP = $ErrorActionPreference
$ErrorActionPreference = 'SilentlyContinue'
for ($i = 0; $i -lt 12; $i++) {
    Start-Sleep 3
    $info = ""
    try { $info = (& cmd /c "devtunnel show $TunnelName 2>&1") -join "`n" } catch { $info = "" }
    if ($info -match 'https://(\S+-\d+\.\S+devtunnels\.ms)') {
        $tunnelUrl = "https://$($Matches[1])"
        break
    }
    Write-Host "." -NoNewline -ForegroundColor Yellow
}
$ErrorActionPreference = $savedEAP
Write-Host ""
if ($tunnelUrl) {
    Write-Host "  [up] Tunnel live: $tunnelUrl" -ForegroundColor Green
} else {
    Write-FailBlock -What "Tunnel URL did not become visible after 36 seconds" `
        -Detail "Look at the 'SN Tunnel' window that just opened. The tunnel may have failed to register." `
        -Hint "Check that you ran 'devtunnel user login' once. Try a different -TunnelName if this one is stuck."
    exit 1
}

# ---------------------------------------------------------------------------
# Phase 4: Regen manifests against the live endpoint
# ---------------------------------------------------------------------------
Write-Host ">> Phase 4/5: syncing tools into manifests (regen_manifests.py)..." -ForegroundColor Cyan
$runtimeUrl = if ($tunnelUrl) { $tunnelUrl } else { "https://localhost:$ServerPort" }
Invoke-RegenManifests -GatewayUrl $runtimeUrl -PythonExe $VenvPython -ScriptPath $RegenPy

# ---------------------------------------------------------------------------
# Phase 5: MOS3 -- token, build, upload
# ---------------------------------------------------------------------------
Write-Host ">> Phase 5/5: acquiring MOS3 token..." -ForegroundColor Cyan
$token = Get-MOS3Token -ClientId $ClientId -TenantId $TenantId -Scope $Scope -TokenCachePath $TokenCache

Write-Host "  >> Building app package..." -ForegroundColor Cyan
Build-AppPackageZip -SrcDir $SrcDir -BuildDir $BuildDir -TmpDir $TmpDir -ZipPath $ZipPath `
    -RuntimeUrl $runtimeUrl -EnvFile $EnvFile

$null = Push-AppPackageToMOS3 -ZipPath $ZipPath -Token $token -Mos3Url $MOS3Url

Write-Host ""
Write-Host "  ===================================" -ForegroundColor DarkCyan
Write-Host "   ENTERPRISE SERVICENOW COPILOT LIVE" -ForegroundColor Green
Write-Host "  ===================================" -ForegroundColor DarkCyan
Write-Host "  Server: http://localhost:$ServerPort" -ForegroundColor White
if ($tunnelUrl) { Write-Host "  Tunnel: $tunnelUrl" -ForegroundColor White }
Write-Host "  MOS3:   agent package live in Teams" -ForegroundColor Gray
Write-Host ""
