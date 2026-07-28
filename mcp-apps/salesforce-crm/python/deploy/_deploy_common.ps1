<#
.SYNOPSIS
    Shared helpers for LocalDeploy.ps1 and ServerDeploy.ps1.

.DESCRIPTION
    Dot-source this file at the top of either deploy script:

        . "$PSScriptRoot\_deploy_common.ps1"

    Then call the functions directly. No script invokes another; this file
    is purely a function library (dot-source = inline into caller scope,
    no child process, no env-var leakage).

    LocalDeploy and ServerDeploy are operationally independent -- each
    runs its own pre-flight, infra/server start, manifest rewrites, zip,
    and MOS3 push. They share *implementation* of the common pieces but
    neither invokes the other.
#>

# ---------------------------------------------------------------------------
# Pretty failure reporting
# ---------------------------------------------------------------------------

function Write-FailBlock {
    param(
        [string]$What,
        [string]$Detail = "",
        [string]$Hint = ""
    )
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
        Write-FailBlock -What "Required tool '$Name' is not installed or not on PATH" `
            -Detail "$Why" -Hint "$Hint"
        exit 1
    }
}

function Assert-File {
    param([string]$Path, [string]$Why, [string]$Hint)
    if (-not (Test-Path $Path)) {
        Write-FailBlock -What "Required file not found: $Path" -Detail "$Why" -Hint "$Hint"
        exit 1
    }
}

function Invoke-ExternalChecked {
    # Runs an external command (scriptblock) and aborts with a clear error
    # if it exits non-zero.
    param(
        [string]$Step,
        [scriptblock]$Command,
        [string]$Hint = ""
    )
    & $Command
    if ($LASTEXITCODE -ne 0) {
        Write-FailBlock -What "$Step (exit code $LASTEXITCODE)" `
            -Detail "The command above returned a non-zero exit code. Scroll up to see the actual error output." `
            -Hint $Hint
        exit $LASTEXITCODE
    }
}

# ---------------------------------------------------------------------------
# UTF-8 (no BOM) JSON I/O
# ---------------------------------------------------------------------------
# .NET's [System.Text.Encoding]::UTF8 writes a BOM, which Python's json.loads
# rejects with "Unexpected UTF-8 BOM (decode using utf-8-sig)". Always use
# these helpers for any file Python will read back.

function Write-JsonNoBom {
    param(
        [Parameter(Mandatory)] [string]$Path,
        [Parameter(Mandatory)] $Object,
        [int]$Depth = 20
    )
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    $json = $Object | ConvertTo-Json -Depth $Depth
    [System.IO.File]::WriteAllText($Path, $json, $utf8NoBom)
}

function Read-JsonFile {
    # PowerShell's Get-Content -Encoding UTF8 transparently strips a BOM on
    # read, so any file we wrote with BOM before the fix still reads cleanly.
    param([Parameter(Mandatory)] [string]$Path)
    Get-Content $Path -Raw -Encoding UTF8 | ConvertFrom-Json
}

# ---------------------------------------------------------------------------
# MOS3 token acquisition (cache-then-device-code)
# ---------------------------------------------------------------------------

function Get-MOS3Token {
    param(
        [Parameter(Mandatory)] [string]$ClientId,
        [Parameter(Mandatory)] [string]$TenantId,
        [Parameter(Mandatory)] [string]$Scope,
        [Parameter(Mandatory)] [string]$TokenCachePath
    )
    $authBase    = "https://login.microsoftonline.com/$TenantId/oauth2/v2.0"
    $deviceScope = "$Scope offline_access"
    $token       = $null

    # Try refresh-token path first
    if (Test-Path $TokenCachePath) {
        $cache = Get-Content $TokenCachePath -Raw | ConvertFrom-Json
        if ($cache.refresh_token) {
            try {
                $resp = Invoke-RestMethod -Method Post -Uri "$authBase/token" `
                    -ContentType "application/x-www-form-urlencoded" `
                    -Body "client_id=$ClientId&grant_type=refresh_token&refresh_token=$($cache.refresh_token)&scope=$([Uri]::EscapeDataString($Scope))" `
                    -ErrorAction Stop
                $token = $resp.access_token
                $cache | Add-Member -Force -NotePropertyName refresh_token -NotePropertyValue $resp.refresh_token
                $cache | ConvertTo-Json | Set-Content $TokenCachePath
                Write-Host "  [ok] Token from cache" -ForegroundColor Green
                return $token
            } catch {
                Write-Host "  [info] Cached refresh token expired -- requesting new device-code sign-in." -ForegroundColor Yellow
            }
        }
    }

    # Device-code fallback
    try {
        $dcResp = Invoke-RestMethod -Method Post -Uri "$authBase/devicecode" `
            -ContentType "application/x-www-form-urlencoded" `
            -Body "client_id=$ClientId&scope=$([Uri]::EscapeDataString($deviceScope))"
    } catch {
        Write-FailBlock -What "Device-code request to Azure AD failed" `
            -Detail $_.Exception.Message `
            -Hint "Check your internet connection / corporate proxy. login.microsoftonline.com must be reachable."
        exit 1
    }
    Write-Host ""
    Write-Host "  ACTION REQUIRED (one-time sign-in):" -ForegroundColor Yellow
    Write-Host "    1. Open: https://microsoft.com/devicelogin" -ForegroundColor White
    Write-Host "    2. Enter: $($dcResp.user_code)" -ForegroundColor Green
    Write-Host ""

    $interval = [int]$dcResp.interval
    $expiry   = (Get-Date).AddSeconds([int]$dcResp.expires_in)
    while ((Get-Date) -lt $expiry) {
        Start-Sleep $interval
        try {
            $resp = Invoke-RestMethod -Method Post -Uri "$authBase/token" `
                -ContentType "application/x-www-form-urlencoded" `
                -Body "client_id=$ClientId&device_code=$($dcResp.device_code)&grant_type=urn:ietf:params:oauth:grant-type:device_code&scope=$([Uri]::EscapeDataString($deviceScope))" `
                -ErrorAction Stop
            $token = $resp.access_token
            @{ refresh_token = $resp.refresh_token } | ConvertTo-Json | Set-Content $TokenCachePath
            Write-Host ""
            Write-Host "  [ok] Signed in" -ForegroundColor Green
            return $token
        } catch {
            $err = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction SilentlyContinue
            if ($err.error -eq "authorization_pending") {
                Write-Host "`r  Still waiting for sign-in..." -NoNewline -ForegroundColor Gray
            } elseif ($err.error -eq "slow_down") {
                $interval += 5
            } else {
                Write-FailBlock -What "MOS3 token acquisition failed: $($err.error)" `
                    -Detail ($_.ErrorDetails.Message) `
                    -Hint "Check that microsoft.com/devicelogin completed successfully. If the code expired, re-run."
                exit 1
            }
        }
    }
    Write-FailBlock -What "Device code expired without sign-in" `
        -Detail "You had 15 minutes to complete the device-code flow." `
        -Hint "Re-run the deploy script -- a fresh code will be issued."
    exit 1
}

# ---------------------------------------------------------------------------
# regen_manifests.py invocation
# ---------------------------------------------------------------------------
# Sets MCP_GATEWAY_URL JUST BEFORE python launches and clears it after, so
# the env var doesn't leak into other phases or back into the parent shell
# beyond the python child. (Python inherits the env at process start, so
# setting in PS just before & ... is enough.)

function Invoke-RegenManifests {
    param(
        [Parameter(Mandatory)] [string]$GatewayUrl,
        [Parameter(Mandatory)] [string]$PythonExe,
        [Parameter(Mandatory)] [string]$ScriptPath
    )
    $previousValue = $env:MCP_GATEWAY_URL
    $env:MCP_GATEWAY_URL = $GatewayUrl
    Write-Host "   MCP_GATEWAY_URL = $env:MCP_GATEWAY_URL" -ForegroundColor Gray
    try {
        & $PythonExe $ScriptPath
        $exitCode = $LASTEXITCODE
    } finally {
        if ($null -eq $previousValue) {
            Remove-Item Env:\MCP_GATEWAY_URL -ErrorAction SilentlyContinue
        } else {
            $env:MCP_GATEWAY_URL = $previousValue
        }
    }
    if ($exitCode -ne 0) {
        Write-FailBlock -What "regen_manifests.py detected manifest drift (exit $exitCode)" `
            -Detail "The live server's tool list does not match what's in agent/appPackage/mcp-tools.json -- not safe to upload." `
            -Hint @"
The error output above will list which tools drifted. Two ways to fix:
  1. Run regen_manifests.py manually with --write to bring manifests in sync, then re-run.
  2. Or fix the tool name/signature mismatch in code, then re-run.
"@
        exit $exitCode
    }
}

# ---------------------------------------------------------------------------
# Build app package zip
# ---------------------------------------------------------------------------
# Rewrites all three manifest files (declarativeAgent.json, manifest.json,
# ai-plugin.json) from their source templates and bundles them with the
# instruction text + icons into a .zip ready for MOS3.
#
# Every JSON write goes through Write-JsonNoBom -- no BOM, ever.
#
# RuntimeUrl is the public URL of the running MCP server (tunnel URL for
# LocalDeploy, ACA FQDN for ServerDeploy). It is written into every
# entry in ai-plugin.json's runtimes[].spec.url with `/mcp` appended.

function Build-AppPackageZip {
    param(
        [Parameter(Mandatory)] [string]$SrcDir,
        [Parameter(Mandatory)] [string]$BuildDir,
        [Parameter(Mandatory)] [string]$TmpDir,
        [Parameter(Mandatory)] [string]$ZipPath,
        [Parameter(Mandatory)] [string]$RuntimeUrl,
        [string]$EnvFile = $null
    )

    New-Item -ItemType Directory -Force -Path $BuildDir | Out-Null
    $envContent = if ($EnvFile -and (Test-Path $EnvFile)) { Get-Content $EnvFile -Raw -Encoding UTF8 } else { "" }
    $appSuffix  = ([regex]::Match($envContent, '(?m)^APP_NAME_SUFFIX=(.+)$')).Groups[1].Value.Trim()

    try {
        # declarativeAgent.json: name substitution + instructions inline
        $daSrc        = Read-JsonFile "$SrcDir\declarativeAgent.json"
        $instructions = (Get-Content "$SrcDir\instruction.txt" -Raw -Encoding UTF8).TrimEnd()
        $daSrc.name   = $daSrc.name -replace [regex]::Escape('${{APP_NAME_SUFFIX}}'), $appSuffix
        $daSrc.instructions = $instructions
        $daFile = "$BuildDir\declarativeAgent.dev.json"
        Write-JsonNoBom -Path $daFile -Object $daSrc -Depth 10

        # manifest.json: id substitution + name substitution
        $mfSrc = Read-JsonFile "$SrcDir\manifest.json"
        if (-not $mfSrc.id -or $mfSrc.id -match '\${{') {
            $mfSrc.id = (New-Guid).ToString()
        }
        $mfSrc.name.short = $mfSrc.name.short -replace [regex]::Escape('${{APP_NAME_SUFFIX}}'), $appSuffix
        $mfFile = "$BuildDir\manifest.dev.json"
        Write-JsonNoBom -Path $mfFile -Object $mfSrc -Depth 10

        # ai-plugin.json: rewrite runtimes[].spec.url + inline tool descriptions
        $plugin   = Read-JsonFile "$SrcDir\ai-plugin.json"
        $allTools = (Read-JsonFile "$SrcDir\mcp-tools.json").tools
        foreach ($rt in $plugin.runtimes) {
            $rt.spec.url = "$RuntimeUrl/mcp"
            $rtFnMap = @{}
            $rt.run_for_functions | ForEach-Object { $rtFnMap[$_] = $true }
            $rtTools = @($allTools | Where-Object { $rtFnMap.ContainsKey($_.name) })
            $rt.spec.mcp_tool_description = [PSCustomObject]@{ tools = $rtTools }
        }
        $pluginFile = "$BuildDir\ai-plugin.dev.json"
        Write-JsonNoBom -Path $pluginFile -Object $plugin -Depth 20

        # Stage the zip contents
        if (Test-Path $TmpDir) { Remove-Item $TmpDir -Recurse -Force }
        New-Item $TmpDir -ItemType Directory | Out-Null
        Copy-Item $mfFile                     "$TmpDir\manifest.json"
        Copy-Item $daFile                     "$TmpDir\declarativeAgent.json"
        Copy-Item $pluginFile                 "$TmpDir\ai-plugin.json"
        Copy-Item "$SrcDir\instruction.txt"   "$TmpDir\instruction.txt"
        Copy-Item "$SrcDir\color.png"         "$TmpDir\color.png"
        Copy-Item "$SrcDir\outline.png"       "$TmpDir\outline.png"

        if (Test-Path $ZipPath) { Remove-Item $ZipPath }
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [System.IO.Compression.ZipFile]::CreateFromDirectory($TmpDir, $ZipPath)
        Remove-Item $TmpDir -Recurse -Force
    } catch {
        Write-FailBlock -What "Building the agent appPackage zip failed" `
            -Detail $_.Exception.Message `
            -Hint @"
Common causes:
  - color.png or outline.png missing from agent/appPackage/
  - instruction.txt UTF-8 BOM mismatch (re-save as UTF-8 without BOM)
  - mcp-tools.json or ai-plugin.json invalid JSON (run them through 'jq .')
"@
        exit 1
    }

    $sizeKB = [math]::Round((Get-Item $ZipPath).Length / 1KB, 1)
    Write-Host "  [ok] Zip built: $sizeKB KB" -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# Upload to MOS3 (with retry + async polling)
# ---------------------------------------------------------------------------

function Push-AppPackageToMOS3 {
    param(
        [Parameter(Mandatory)] [string]$ZipPath,
        [Parameter(Mandatory)] [string]$Token,
        [Parameter(Mandatory)] [string]$Mos3Url
    )
    Write-Host "  >> Uploading to MOS3..." -ForegroundColor Cyan
    Add-Type -AssemblyName System.Net.Http
    $zipBytes = [System.IO.File]::ReadAllBytes($ZipPath)
    $uploadResp = $null
    $uploadOk   = $false
    $lastError  = ""

    for ($attempt = 1; $attempt -le 3; $attempt++) {
        if ($attempt -gt 1) { Start-Sleep ($attempt * 10) }
        $httpClient = [System.Net.Http.HttpClient]::new()
        $httpClient.Timeout = [System.TimeSpan]::FromSeconds(180)
        $httpClient.DefaultRequestHeaders.Authorization =
            [System.Net.Http.Headers.AuthenticationHeaderValue]::new("Bearer", $Token)
        $zipContent = [System.Net.Http.ByteArrayContent]::new($zipBytes)
        $zipContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::new("application/zip")
        $multipart  = [System.Net.Http.MultipartFormDataContent]::new()
        $multipart.Add($zipContent, "package", "appPackage.zip")
        try {
            $response     = $httpClient.PostAsync("$Mos3Url/builder/v1/users/packages", $multipart).GetAwaiter().GetResult()
            $responseBody = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
            $httpClient.Dispose()
            if ($response.IsSuccessStatusCode) {
                $uploadResp = $responseBody | ConvertFrom-Json
                $uploadOk = $true
                break
            }
            $statusCode = [int]$response.StatusCode
            $lastError  = "HTTP $statusCode -- $responseBody"
            if ($statusCode -lt 500 -or $attempt -eq 3) {
                Write-FailBlock -What "MOS3 upload returned HTTP $statusCode" `
                    -Detail $responseBody `
                    -Hint @"
Common causes:
  - HTTP 400 + 'TooLongInstructions': trim instruction.txt below 8000 chars
  - HTTP 401: token expired -- delete .mos3_token_cache.json and re-run
  - HTTP 403: your account is not allowed to publish to MOS3 -- check tenant access
  - HTTP 4xx + 'manifestSchemaValidationFailed': check the JSON files in agent/appPackage/build/
"@
                exit 1
            }
            Write-Host "  [retry $attempt] MOS3 returned $statusCode, retrying..." -ForegroundColor Yellow
        } catch [System.Threading.Tasks.TaskCanceledException] {
            $httpClient.Dispose()
            $lastError = "TaskCanceledException (timeout after 180s)"
            if ($attempt -eq 3) {
                Write-FailBlock -What "MOS3 upload timed out after 3 attempts" `
                    -Detail "Last error: $lastError" `
                    -Hint "Check internet connection / corporate proxy. titles.prod.mos.microsoft.com must be reachable."
                exit 1
            }
        }
    }
    if ($uploadOk) { Write-Host "  [ok] Uploaded" -ForegroundColor Green }

    # If MOS3 returns an async operation/status id, poll until it finishes.
    if ($uploadResp.operationId -or ($uploadResp.statusId -and -not $uploadResp.titlePreview)) {
        $pollId = if ($uploadResp.operationId) { $uploadResp.operationId } else { $uploadResp.statusId }
        Write-Host "  [..] Polling async status..." -ForegroundColor Gray
        for ($i = 0; $i -lt 30; $i++) {
            Start-Sleep 3
            $status = Invoke-RestMethod -Method Get `
                -Uri "$Mos3Url/builder/v1/users/packages/status/$pollId" `
                -Headers @{ Authorization = "Bearer $Token" } -TimeoutSec 30
            Write-Host "  Status: $($status.status)" -ForegroundColor Gray
            if ($status.status -eq "succeeded") { return $status }
            if ($status.status -in @("failed","error")) {
                Write-FailBlock -What "MOS3 server-side processing failed" `
                    -Detail ($status | ConvertTo-Json -Compress) `
                    -Hint "Inspect the JSON above for the validation error. Most common is a manifest field mismatch."
                exit 1
            }
        }
    }
    return $uploadResp
}
