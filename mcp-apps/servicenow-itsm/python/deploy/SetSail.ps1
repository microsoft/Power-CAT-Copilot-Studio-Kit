<#
.SYNOPSIS
    SetSail — Start ServiceNow MCP server, open dev tunnel, push agent to MOS3.

.EXAMPLE
    .\deploy\SetSail.ps1                         # Full launch: server + tunnel + MOS3
    .\deploy\SetSail.ps1 -SkipMOS3               # Server + tunnel only
    .\deploy\SetSail.ps1 -ServerOnly             # Start server only
    .\deploy\SetSail.ps1 -TunnelOnly             # Start tunnel only
    .\deploy\SetSail.ps1 -SkipServer             # Tunnel + MOS3 (server already running)
    .\deploy\SetSail.ps1 -SkipTunnel             # Server + MOS3
    .\deploy\SetSail.ps1 -TunnelName gtc-sn-v05  # Tunnel override

.NOTES
    Requires: Python 3.11+, Dev Tunnels CLI.
    Run from the kit/sn-mcp-copilot/ directory (script is in deploy/).
#>

param(
    [switch]$SkipServer,
    [switch]$SkipTunnel,
    [switch]$ServerOnly,
    [switch]$TunnelOnly,
    [switch]$SkipMOS3,
    [string]$TunnelName  = "gtc-sn-v05",
    [int]$ServerPort     = 8081
)

$ErrorActionPreference = "Stop"
$App        = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Definition)
$Kit        = Split-Path -Parent $App
$VenvPython = "$App\.venv\Scripts\python.exe"
$Pkg        = "servicenow_mcp"

# MOS3 config
$ClientId   = "7ea7c24c-b1f6-4a20-9d11-9ae12e9e7ac0"
$TenantId   = "8b7a11d9-6513-4d54-a468-f6630df73c8b"
$Scope      = "https://titles.prod.mos.microsoft.com/.default"
$AuthBase   = "https://login.microsoftonline.com/$TenantId/oauth2/v2.0"
$MOS3Url    = "https://titles.prod.mos.microsoft.com"
$TokenCache = "$App\.mos3_token_cache.json"
$SrcDir     = "$App\agent\appPackage"
$BuildDir   = "$App\agent\appPackage\build"
$TmpDir     = "$App\agent\appPackage\_tmp_zip"
$ZipPath    = "$BuildDir\appPackage.dev.zip"
$EnvFile    = "$App\agent\env\.env.dev"

Write-Host ""
Write-Host "  Ask - ServiceNow  v0.5.0" -ForegroundColor Cyan
Write-Host "  Port $ServerPort  |  Tunnel $TunnelName" -ForegroundColor DarkCyan
Write-Host ""

# Pre-flight: Python venv + pip install
if (-not $SkipServer -and -not $TunnelOnly) {
    if (-not (Test-Path $VenvPython)) {
        Write-Host "  [first run] Creating venv and installing dependencies..." -ForegroundColor Yellow
        python -m venv "$App\.venv"
        $pip = "$App\.venv\Scripts\pip.exe"
        & $pip install --upgrade pip --quiet
        & $pip install -e "$Kit\mcp-shared" --quiet
        & $pip install -e "$App" --quiet
        Write-Host "  [ready] Venv built." -ForegroundColor Green
    }

    # Pre-flight: widget node_modules + build if missing or stale
    $widgetHtml   = "$App\$Pkg\web\widget.html"
    $widgetSrcDir = "$App\widgets\src"
    $widgetStale  = $false
    if (-not (Test-Path $widgetHtml)) {
        $widgetStale = $true
    } elseif (Test-Path $widgetSrcDir) {
        $newestSrc = (Get-ChildItem $widgetSrcDir -Recurse -File -ErrorAction SilentlyContinue |
                      Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime
        if ($newestSrc -and $newestSrc -gt (Get-Item $widgetHtml).LastWriteTime) {
            $widgetStale = $true
        }
    }
    if ($widgetStale) {
        if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
            Write-Host "  [abort] npm not found -- install Node.js 18+ to build widgets." -ForegroundColor Red
            exit 1
        }
        if (-not (Test-Path "$App\widgets\node_modules")) {
            Write-Host "  [first run] Installing widget dependencies (npm install, ~2 min)..." -ForegroundColor Yellow
            Push-Location "$App\widgets"
            npm install
            $exit = $LASTEXITCODE
            Pop-Location
            if ($exit -ne 0) {
                Write-Host "  [abort] npm install failed." -ForegroundColor Red
                exit 1
            }
        }
        Write-Host "  [widget] Building widget bundle..." -ForegroundColor Yellow
        Push-Location "$App\widgets"
        npm run build
        $exit = $LASTEXITCODE
        Pop-Location
        if ($exit -ne 0 -or -not (Test-Path $widgetHtml)) {
            Write-Host "  [abort] Widget build failed -- expected $widgetHtml" -ForegroundColor Red
            exit 1
        }
        Write-Host "  [widget] Built $widgetHtml" -ForegroundColor Green
    }
}

if (-not $SkipTunnel -and -not $ServerOnly) {
    if (-not (Get-Command devtunnel -ErrorAction SilentlyContinue)) {
        Write-Host "  [abort] Dev Tunnels CLI missing." -ForegroundColor Red
        exit 1
    }
}

# Start server
if (-not $SkipServer -and -not $TunnelOnly) {
    $procs = (Get-NetTCPConnection -LocalPort $ServerPort -State Listen -ErrorAction SilentlyContinue).OwningProcess | Select-Object -Unique
    if ($procs) {
        $procs | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
        Write-Host "  [server] Stopped existing process on $ServerPort" -ForegroundColor Yellow
        Start-Sleep 1
    }
    Write-Host "  >> Starting SN MCP server..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList @(
        "-NoExit", "-Command",
        "`$host.UI.RawUI.WindowTitle = 'SN MCP Server :$ServerPort'; Set-Location '$App'; & '$VenvPython' -m servicenow_mcp"
    )

    $waited = 0
    $up = $false
    do {
        Start-Sleep 2; $waited += 2
        try {
            $null = Invoke-WebRequest -Uri "http://localhost:$ServerPort" -Method GET -TimeoutSec 2 -ErrorAction Stop
            $up = $true
        } catch {
            if ($_.Exception.Response -ne $null) { $up = $true }
        }
        Write-Host "`r  [watch] Waiting for server... ${waited}s" -NoNewline -ForegroundColor Yellow
    } while (-not $up -and $waited -lt 30)
    Write-Host ""
    if ($up) {
        Write-Host "  [up] Server live --> http://localhost:$ServerPort" -ForegroundColor Green
    } else {
        Write-Host "  [warn] Server not responding after 30s -- check the server window" -ForegroundColor Yellow
    }
}

if ($ServerOnly) { Write-Host "  Server only -- done." -ForegroundColor Green; exit 0 }

# Start tunnel
$tunnelUrl = $null
if (-not $SkipTunnel) {
    $tunnelProcs = Get-Process -Name "devtunnel" -ErrorAction SilentlyContinue
    if ($tunnelProcs) {
        $tunnelProcs | Stop-Process -Force -ErrorAction SilentlyContinue
        Write-Host "  [tunnel] Stopped existing tunnel" -ForegroundColor Yellow
        Start-Sleep 2
    }
    Write-Host "  >> Opening dev tunnel '$TunnelName'..." -ForegroundColor Cyan
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
        Write-Host "  [up] Tunnel live --> $tunnelUrl" -ForegroundColor Green
    } else {
        Write-Host "  [warn] Tunnel URL not yet visible -- check tunnel window" -ForegroundColor Yellow
    }
}

if ($TunnelOnly) { Write-Host "  Tunnel only -- done." -ForegroundColor Green; exit 0 }

# Regenerate manifests from live server
Write-Host "  >> Syncing tools into manifests..." -ForegroundColor Cyan
$env:MCP_GATEWAY_URL = if ($tunnelUrl) { $tunnelUrl } else { "https://localhost:$ServerPort" }
& $VenvPython "$App\deploy\regen_manifests.py"
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [abort] regen_manifests.py detected manifest drift -- not uploading to MOS3." -ForegroundColor Red
    Write-Host "          Fix the reported issues, then rerun SetSail." -ForegroundColor Red
    exit 1
}

if ($SkipMOS3) {
    Write-Host ""
    Write-Host "  ===================================" -ForegroundColor DarkCyan
    Write-Host "   READY (no MOS3 upload)            " -ForegroundColor Green
    Write-Host "  ===================================" -ForegroundColor DarkCyan
    Write-Host "  Server  -->  http://localhost:$ServerPort" -ForegroundColor White
    if ($tunnelUrl) { Write-Host "  Tunnel  -->  $tunnelUrl" -ForegroundColor White }
    exit 0
}

# MOS3 token
Write-Host "  >> Acquiring MOS3 token..." -ForegroundColor Cyan
$token = $null
if (Test-Path $TokenCache) {
    $cache = Get-Content $TokenCache -Raw | ConvertFrom-Json
    if ($cache.refresh_token) {
        try {
            $resp = Invoke-RestMethod -Method Post -Uri "$AuthBase/token" `
                -ContentType "application/x-www-form-urlencoded" `
                -Body "client_id=$ClientId&grant_type=refresh_token&refresh_token=$($cache.refresh_token)&scope=$([Uri]::EscapeDataString($Scope))" `
                -ErrorAction Stop
            $token = $resp.access_token
            $cache | Add-Member -Force -NotePropertyName refresh_token -NotePropertyValue $resp.refresh_token
            $cache | ConvertTo-Json | Set-Content $TokenCache
            Write-Host "  [ok] Token from cache" -ForegroundColor Green
        } catch {
            $token = $null
        }
    }
}

$DeviceScope = "$Scope offline_access"
if (-not $token) {
    $dcResp = Invoke-RestMethod -Method Post -Uri "$AuthBase/devicecode" `
        -ContentType "application/x-www-form-urlencoded" `
        -Body "client_id=$ClientId&scope=$([Uri]::EscapeDataString($DeviceScope))"
    Write-Host ""
    Write-Host "  ACTION REQUIRED (one-time sign-in):" -ForegroundColor Yellow
    Write-Host "    1. Open:  https://microsoft.com/devicelogin" -ForegroundColor White
    Write-Host "    2. Enter: $($dcResp.user_code)" -ForegroundColor Green
    Write-Host ""
    $interval = [int]$dcResp.interval
    $expiry   = (Get-Date).AddSeconds([int]$dcResp.expires_in)
    while ((Get-Date) -lt $expiry) {
        Start-Sleep $interval
        try {
            $resp = Invoke-RestMethod -Method Post -Uri "$AuthBase/token" `
                -ContentType "application/x-www-form-urlencoded" `
                -Body "client_id=$ClientId&device_code=$($dcResp.device_code)&grant_type=urn:ietf:params:oauth:grant-type:device_code&scope=$([Uri]::EscapeDataString($DeviceScope))" `
                -ErrorAction Stop
            $token = $resp.access_token
            @{ refresh_token = $resp.refresh_token } | ConvertTo-Json | Set-Content $TokenCache
            break
        } catch {
            $err = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction SilentlyContinue
            if ($err.error -eq "authorization_pending") {
                Write-Host "`r  Still waiting..." -NoNewline -ForegroundColor Gray
            } elseif ($err.error -eq "slow_down") {
                $interval += 5
            } else {
                throw "Token error: $($err.error)"
            }
        }
    }
    if (-not $token) { throw "Device code expired." }
    Write-Host ""
    Write-Host "  [ok] Signed in" -ForegroundColor Green
}

# Build appPackage zip
Write-Host "  >> Building app package..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $BuildDir | Out-Null
$envContent = if (Test-Path $EnvFile) { Get-Content $EnvFile -Raw -Encoding UTF8 } else { "" }
$appSuffix  = ([regex]::Match($envContent, '(?m)^APP_NAME_SUFFIX=(.+)$')).Groups[1].Value.Trim()

$daSrc        = Get-Content "$SrcDir\declarativeAgent.json" -Raw -Encoding UTF8 | ConvertFrom-Json
$instructions = (Get-Content "$SrcDir\instruction.txt" -Raw -Encoding UTF8).TrimEnd()
$daSrc.name   = $daSrc.name -replace [regex]::Escape('${{APP_NAME_SUFFIX}}'), $appSuffix
$daSrc.instructions = $instructions
$daFile       = "$BuildDir\declarativeAgent.dev.json"
[System.IO.File]::WriteAllText($daFile, ($daSrc | ConvertTo-Json -Depth 10), [System.Text.Encoding]::UTF8)

$mfSrc = Get-Content "$SrcDir\manifest.json" -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $mfSrc.id -or $mfSrc.id -match '\${{') {
    $mfSrc.id = (New-Guid).ToString()
}
$mfSrc.name.short = $mfSrc.name.short -replace [regex]::Escape('${{APP_NAME_SUFFIX}}'), $appSuffix
$mfFile = "$BuildDir\manifest.dev.json"
[System.IO.File]::WriteAllText($mfFile, ($mfSrc | ConvertTo-Json -Depth 10), [System.Text.Encoding]::UTF8)

# Inline the SN tools into ai-plugin (single runtime)
$plugin   = Get-Content "$SrcDir\ai-plugin.json" -Raw -Encoding UTF8 | ConvertFrom-Json
$allTools = (Get-Content "$SrcDir\mcp-tools.json" -Raw -Encoding UTF8 | ConvertFrom-Json).tools
foreach ($rt in $plugin.runtimes) {
    if ($tunnelUrl) {
        $rt.spec.url = "$tunnelUrl/mcp"
    }
    $rtFnMap = @{}
    $rt.run_for_functions | ForEach-Object { $rtFnMap[$_] = $true }
    $rtTools = @($allTools | Where-Object { $rtFnMap.ContainsKey($_.name) })
    $rt.spec.mcp_tool_description = [PSCustomObject]@{ tools = $rtTools }
}
$pluginFile = "$BuildDir\ai-plugin.dev.json"
[System.IO.File]::WriteAllText($pluginFile, ($plugin | ConvertTo-Json -Depth 20), [System.Text.Encoding]::UTF8)

if (Test-Path $TmpDir) { Remove-Item $TmpDir -Recurse -Force }
New-Item $TmpDir -ItemType Directory | Out-Null
Copy-Item $mfFile         "$TmpDir\manifest.json"
Copy-Item $daFile         "$TmpDir\declarativeAgent.json"
Copy-Item $pluginFile     "$TmpDir\ai-plugin.json"
Copy-Item "$SrcDir\instruction.txt"  "$TmpDir\instruction.txt"
Copy-Item "$SrcDir\color.png"        "$TmpDir\color.png"
Copy-Item "$SrcDir\outline.png"      "$TmpDir\outline.png"

if (Test-Path $ZipPath) { Remove-Item $ZipPath }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($TmpDir, $ZipPath)
Remove-Item $TmpDir -Recurse -Force

$sizeKB = [math]::Round((Get-Item $ZipPath).Length / 1KB, 1)
Write-Host "  [ok] Zip built: $sizeKB KB" -ForegroundColor Green

# Upload to MOS3 (with retry)
Write-Host "  >> Uploading to MOS3..." -ForegroundColor Cyan
Add-Type -AssemblyName System.Net.Http
$zipBytes = [System.IO.File]::ReadAllBytes($ZipPath)
$uploadResp = $null
$uploadOk   = $false
for ($attempt = 1; $attempt -le 3; $attempt++) {
    if ($attempt -gt 1) { Start-Sleep ($attempt * 10) }
    $httpClient = [System.Net.Http.HttpClient]::new()
    $httpClient.Timeout = [System.TimeSpan]::FromSeconds(180)
    $httpClient.DefaultRequestHeaders.Authorization =
        [System.Net.Http.Headers.AuthenticationHeaderValue]::new("Bearer", $token)
    $zipContent = [System.Net.Http.ByteArrayContent]::new($zipBytes)
    $zipContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::new("application/zip")
    $multipart  = [System.Net.Http.MultipartFormDataContent]::new()
    $multipart.Add($zipContent, "package", "appPackage.zip")
    try {
        $response     = $httpClient.PostAsync("$MOS3Url/builder/v1/users/packages", $multipart).GetAwaiter().GetResult()
        $responseBody = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        $httpClient.Dispose()
        if ($response.IsSuccessStatusCode) {
            $uploadResp = $responseBody | ConvertFrom-Json
            $uploadOk = $true
            break
        }
        $statusCode = [int]$response.StatusCode
        if ($statusCode -lt 500 -or $attempt -eq 3) { throw "MOS3 upload failed [$statusCode]: $responseBody" }
        Write-Host "  [retry] MOS3 returned $statusCode" -ForegroundColor Yellow
    } catch [System.Threading.Tasks.TaskCanceledException] {
        $httpClient.Dispose()
        if ($attempt -eq 3) { throw "MOS3 upload timed out after 3 attempts." }
    }
}
if ($uploadOk) { Write-Host "  [ok] Uploaded" -ForegroundColor Green }

if ($uploadResp.operationId -or ($uploadResp.statusId -and -not $uploadResp.titlePreview)) {
    $pollId = if ($uploadResp.operationId) { $uploadResp.operationId } else { $uploadResp.statusId }
    Write-Host "  [..] Polling async status..." -ForegroundColor Gray
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep 3
        $status = Invoke-RestMethod -Method Get `
            -Uri "$MOS3Url/builder/v1/users/packages/status/$pollId" `
            -Headers @{ Authorization = "Bearer $token" } -TimeoutSec 30
        Write-Host "  Status: $($status.status)" -ForegroundColor Gray
        if ($status.status -eq "succeeded") { $uploadResp = $status; break }
        if ($status.status -in @("failed","error")) { throw "MOS3 failed: $($status | ConvertTo-Json -Compress)" }
    }
}

Write-Host ""
Write-Host "  ===================================" -ForegroundColor DarkCyan
Write-Host "   ENTERPRISE SERVICENOW COPILOT LIVE" -ForegroundColor Green
Write-Host "  ===================================" -ForegroundColor DarkCyan
Write-Host "  Server  -->  http://localhost:$ServerPort" -ForegroundColor White
if ($tunnelUrl) { Write-Host "  Tunnel  -->  $tunnelUrl" -ForegroundColor White }
Write-Host "  MOS3    -->  agent package live in Teams" -ForegroundColor Gray
Write-Host ""
