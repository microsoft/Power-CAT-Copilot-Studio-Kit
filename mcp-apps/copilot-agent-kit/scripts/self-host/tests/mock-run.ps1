param([Parameter(Mandatory = $true)][string]$ScriptUnderTest)
$ErrorActionPreference = 'Stop'
$root = Join-Path ([System.IO.Path]::GetTempPath()) ('ar-selfhost-mock-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
$repo = Join-Path $root 'repo'
New-Item -ItemType Directory -Path (Join-Path $repo 'scripts\self-host'), (Join-Path $repo '.azure') -Force | Out-Null
$target = Join-Path $repo 'scripts\self-host\New-AgentReviewEntraApps.ps1'
Copy-Item -LiteralPath $ScriptUnderTest -Destination $target
Set-Content -LiteralPath (Join-Path $repo 'scripts\ensure-dataverse-permission.mjs') -Value '// stub'
$configPath = Join-Path $repo '.azure\config.json'
Set-Content -LiteralPath $configPath -Value '{"version":1,"defaultEnvironment":"mock"}'

function Reset-Mock {
    $global:MockState = @{
        Tenant = '11111111-1111-1111-1111-111111111111'
        Env = @{}; Apps = @{}
        Sps = @{ '00000003-0000-0000-c000-000000000000' = @{ id = 'graph-sp-id'; appId = '00000003-0000-0000-c000-000000000000' } }
        Grants = New-Object System.Collections.ArrayList
        Patches = New-Object System.Collections.ArrayList
        BadSecretOnce = $true; FailGrantPost = $false; NodeFails = $false; SecretCounter = 0; JsonQuirk = $false; BadEnvFlag = $false
    }
}

function global:Get-MockArg { param([string[]]$A, [string]$Name) $i = [array]::IndexOf($A, $Name); if ($i -ge 0 -and $i + 1 -lt $A.Count) { return $A[$i + 1] }; return $null }
function global:Write-MockJson { param($Object) ConvertTo-Json -InputObject $Object -Depth 20 }
function global:Find-MockApp { param([string]$Key) foreach ($app in $global:MockState.Apps.Values) { if ($app.appId -eq $Key -or $app.id -eq $Key) { return $app } }; return $null }

function global:az {
    $a = [string[]]@($args | ForEach-Object { [string]$_ })
    $S = $global:MockState
    $global:LASTEXITCODE = 0
    $id = Get-MockArg $a '--id'
    switch -Regex ($a -join ' ') {
        '^account show' { Write-MockJson @{ tenantId = $S.Tenant; user = @{ name = 'admin@contoso.test' } }; return }
        '^ad app create ' {
            $app = @{ id = [guid]::NewGuid().ToString(); appId = [guid]::NewGuid().ToString(); displayName = (Get-MockArg $a '--display-name')
                identifierUris = @(); requiredResourceAccess = @(); credentials = @()
                api = @{ oauth2PermissionScopes = @(); knownClientApplications = @(); preAuthorizedApplications = @(); requestedAccessTokenVersion = $null; acceptMappedClaims = $null }
                web = @{ redirectUris = @('https://existing.example/cb'); homePageUrl = $null; logoutUrl = $null; implicitGrantSettings = @{ enableAccessTokenIssuance = $false; enableIdTokenIssuance = $true }; redirectUriSettings = @() } }
            $S.Apps[$app.appId] = $app; Write-MockJson $app; return
        }
        '^ad app show ' { $app = Find-MockApp $id; if (-not $app) { Write-Error 'app not found'; $global:LASTEXITCODE = 3; return }; Write-MockJson $app; return }
        '^ad sp show ' { $sp = $S.Sps[$id]; if (-not $sp) { Write-Error "Service principal '$id' doesn't exist"; $global:LASTEXITCODE = 3; return }; Write-MockJson $sp; return }
        '^ad sp create ' { $sp = @{ id = [guid]::NewGuid().ToString(); appId = $id }; $S.Sps[$id] = $sp; Write-MockJson $sp; return }
        '^ad app permission list ' { Write-MockJson @((Find-MockApp $id).requiredResourceAccess); return }
        '^ad app permission add ' {
            $app = Find-MockApp $id; $api = Get-MockArg $a '--api'; $parts = (Get-MockArg $a '--api-permissions').Split('=')
            $entry = @($app.requiredResourceAccess) | Where-Object { $_.resourceAppId -eq $api } | Select-Object -First 1
            if (-not $entry) { $entry = @{ resourceAppId = $api; resourceAccess = @() }; $app.requiredResourceAccess = @($app.requiredResourceAccess) + , $entry }
            $entry.resourceAccess = @($entry.resourceAccess) + , @{ id = $parts[0]; type = $parts[1] }
            Write-Error 'WARNING: Invoking "az ad app permission grant" is needed to make the change effective'; return
        }
        '^ad app credential reset ' {
            $app = Find-MockApp $id; $S.SecretCounter++
            $pw = if ($S.BadSecretOnce) { $S.BadSecretOnce = $false; '-starts-with-dash' } else { "mock~secret.$($S.SecretCounter)_x" }
            $app.credentials = @($app.credentials) + , @{ keyId = [guid]::NewGuid().ToString(); displayName = (Get-MockArg $a '--display-name'); endDateTime = (Get-MockArg $a '--end-date') }
            Write-Error 'WARNING: The output includes credentials that you must protect.'
            Write-MockJson @{ appId = $app.appId; password = $pw; tenant = $S.Tenant }; return
        }
        '^ad app credential list ' { Write-MockJson @((Find-MockApp $id).credentials); return }
        '^ad app credential delete ' { $app = Find-MockApp $id; $k = Get-MockArg $a '--key-id'; $app.credentials = @(@($app.credentials) | Where-Object { $_.keyId -ne $k }); return }
        '^rest ' {
            $method = Get-MockArg $a '--method'; $uri = Get-MockArg $a '--uri'; $bodyArg = Get-MockArg $a '--body'
            $bodyText = if ($bodyArg) { Get-Content -LiteralPath $bodyArg.Substring(1) -Raw } else { $null }
            if ($bodyText -and $bodyText -match '"Count"\s*:') { $S.JsonQuirk = $true }
            if ($method -eq 'PATCH' -and $uri -match '/applications/([^/]+)$') {
                $app = Find-MockApp $Matches[1]; $body = $bodyText | ConvertFrom-Json; [void]$S.Patches.Add($bodyText)
                if ($body.PSObject.Properties['identifierUris']) { $app.identifierUris = @($body.identifierUris) }
                if ($body.PSObject.Properties['api']) { $app.api = $body.api }
                if ($body.PSObject.Properties['web']) { $app.web = $body.web }
                return
            }
            if ($method -eq 'GET' -and $uri -match '/servicePrincipals/([^/]+)/oauth2PermissionGrants$') {
                $client = $Matches[1]; Write-MockJson @{ value = @($S.Grants | Where-Object { $_.clientId -eq $client }) }; return
            }
            if ($method -eq 'POST' -and $uri -match '/oauth2PermissionGrants$') {
                if ($S.FailGrantPost) { Write-Error 'Forbidden({"error":{"code":"Authorization_RequestDenied","message":"Insufficient privileges to complete the operation."}})'; $global:LASTEXITCODE = 1; return }
                $body = $bodyText | ConvertFrom-Json
                [void]$S.Grants.Add(@{ id = [guid]::NewGuid().ToString(); clientId = $body.clientId; resourceId = $body.resourceId; consentType = $body.consentType; scope = $body.scope }); return
            }
            if ($method -eq 'PATCH' -and $uri -match '/oauth2PermissionGrants/([^/]+)$') {
                $gid = $Matches[1]; $body = $bodyText | ConvertFrom-Json; foreach ($g in $S.Grants) { if ($g.id -eq $gid) { $g.scope = $body.scope } }; return
            }
            Write-Error "Unhandled rest $method $uri"; $global:LASTEXITCODE = 2; return
        }
    }
    Write-Error "Unhandled az $($a -join ' ')"; $global:LASTEXITCODE = 2
}

function global:azd {
    $a = [string[]]@($args | ForEach-Object { [string]$_ })
    $S = $global:MockState
    $global:LASTEXITCODE = 0
    if ((Get-MockArg $a '--environment') -ne 'mock' -or $a -notcontains '--no-prompt') { $S.BadEnvFlag = $true }
    if ($a[0] -eq 'env' -and $a[1] -eq 'get-value') {
        if ($S.Env.ContainsKey($a[2]) -and $S.Env[$a[2]]) { Write-Output $S.Env[$a[2]] } else { Write-Error "ERROR: key '$($a[2])' not found in the environment values"; $global:LASTEXITCODE = 1 }
        return
    }
    if ($a[0] -eq 'env' -and $a[1] -eq 'set') {
        if ($a[3].StartsWith('-')) { Write-Error 'Error: unknown shorthand flag'; $global:LASTEXITCODE = 1; return }
        $S.Env[$a[2]] = $a[3]; return
    }
    Write-Error "Unhandled azd $($a -join ' ')"; $global:LASTEXITCODE = 2
}

function global:node {
    $global:LASTEXITCODE = 0
    if ($global:MockState.NodeFails) { Write-Error 'Grant failed: Insufficient privileges'; $global:LASTEXITCODE = 1; return }
    Write-Output "Dataverse permission OK for $($args[1])"
}

$results = New-Object System.Collections.ArrayList
function Check([string]$Name, [bool]$Ok) { [void]$results.Add([pscustomobject]@{ Result = $(if ($Ok) { 'PASS' } else { 'FAIL' }); Test = $Name }) }
function Run([hashtable]$Params) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try { $text = & $target @Params *>&1 | Out-String -Width 4096 }
    finally { $sw.Stop(); $script:LastSeconds = $sw.Elapsed.TotalSeconds }
    return $text
}

try {
    Reset-Mock
    $S = $global:MockState
    $out1 = Run @{}
    $app1 = Find-MockApp $S.Env['ENTRA_CLIENT_ID']; $app2 = Find-MockApp $S.Env['AGENT_REVIEW_CONNECTOR_CLIENT_ID']
    Check 'run 1: 2 apps created' ($S.Apps.Count -eq 2 -and $app1 -and $app2)
    Check 'run 1: app 1 identifier URI' (@($app1.identifierUris) -contains "api://$($app1.appId)")
    Check 'run 1: app 1 token version 2' ($app1.api.requestedAccessTokenVersion -eq 2)
    Check 'run 1: app 1 scope id and value' (@($app1.api.oauth2PermissionScopes | Where-Object { $_.id -eq '8d57a907-9168-4778-a65e-31741f871062' -and $_.value -eq 'access_as_user' }).Count -eq 1)
    Check 'run 1: both service principals' ($S.Sps.ContainsKey($app1.appId) -and $S.Sps.ContainsKey($app2.appId))
    $rra = @($app2.requiredResourceAccess)
    Check 'run 1: app 2 permissions' ($rra.Count -eq 2 -and @($rra | Where-Object { $_.resourceAppId -eq $app1.appId }).Count -eq 1 -and @($rra | Where-Object { $_.resourceAppId -eq '00000003-0000-0000-c000-000000000000' }).Count -eq 1)
    $sp2 = $S.Sps[$app2.appId].id
    Check 'run 1: 2 grants for app 2' (@($S.Grants | Where-Object { $_.clientId -eq $sp2 }).Count -eq 2)
    Check 'run 1: grant scopes' ((@($S.Grants | ForEach-Object { $_.scope }) | Sort-Object) -join ',' -eq 'access_as_user,offline_access')
    Check 'run 1: azd values' ($S.Env['ENTRA_TENANT_ID'] -eq $S.Tenant -and $S.Env['ENTRA_CLIENT_SECRET'] -like 'mock~secret*' -and $S.Env['AGENT_REVIEW_CONNECTOR_CLIENT_SECRET'] -like 'mock~secret*')
    Check 'run 1: dash secret removed' (@($app1.credentials).Count -eq 1 -and @($app2.credentials).Count -eq 1)
    Check 'run 1: no JSON Count quirk' (-not $S.JsonQuirk)
    Check 'run 1: azd flags' (-not $S.BadEnvFlag)
    Check 'run 1: no secret in output' ($out1 -notmatch 'mock~secret')
    Check 'run 1: Copilot Studio values shown' ($out1 -match [regex]::Escape("api://$($app1.appId)/access_as_user offline_access") -and $out1 -match 'oauth2/v2.0/token')
    Check 'run 1: no admin warnings' ($out1 -notmatch 'An Entra admin must')

    $secret1 = $S.Env['ENTRA_CLIENT_SECRET']
    $out2 = Run @{}
    Check 'run 2: no new apps' ($S.Apps.Count -eq 2)
    Check 'run 2: no new secrets' (@($app1.credentials).Count -eq 1 -and @($app2.credentials).Count -eq 1 -and $S.Env['ENTRA_CLIENT_SECRET'] -eq $secret1)
    Check 'run 2: no new grants' ($S.Grants.Count -eq 2)
    Check 'run 2: no duplicate permissions' (@($app2.requiredResourceAccess).Count -eq 2 -and @(@($app2.requiredResourceAccess) | ForEach-Object { @($_.resourceAccess).Count } | Measure-Object -Sum).Sum -eq 2)
    Check 'run 2: one scope on app 1' (@($app1.api.oauth2PermissionScopes).Count -eq 1)
    Check 'run 2: reuse messages' ($out2 -match 'Uses the app in ENTRA_CLIENT_ID' -and $out2 -match 'did not make a new app 2 secret')

    $cb = 'https://global.consent.azure-apim.net/redirect/cr123-5fagent-20review-5f0123456789abcdef'
    $null = Run @{ AddRedirectUri = $cb }
    $uris = @($app2.web.redirectUris)
    Check 'redirect: added and existing URI kept' ($uris -contains $cb -and $uris -contains 'https://existing.example/cb' -and $uris.Count -eq 2)
    Check 'redirect: implicit grant kept' ($app2.web.implicitGrantSettings.enableIdTokenIssuance -eq $true)
    Check 'redirect: no redirectUriSettings sent' ($S.Patches[$S.Patches.Count - 1] -notmatch 'redirectUriSettings')
    $out4 = Run @{ AddRedirectUri = $cb }
    Check 'redirect: second add is a no-op' ($out4 -match 'already has' -and @($app2.web.redirectUris).Count -eq 2)
    $msg = ''; try { Run @{ AddRedirectUri = 'http://bad.example/cb' } | Out-Null } catch { $msg = $_.Exception.Message }
    Check 'redirect: http is refused' ($msg -match 'must start with https')

    $null = Run @{ RotateServerSecret = $true }
    Check 'rotate: new app 1 secret only' (@($app1.credentials).Count -eq 2 -and $S.Env['ENTRA_CLIENT_SECRET'] -ne $secret1 -and @($app2.credentials).Count -eq 1)

    Reset-Mock
    $S = $global:MockState
    $S.FailGrantPost = $true; $S.NodeFails = $true
    $out6 = Run @{}
    Check 'no admin role: completes with warnings' ($out6 -match 'admin consent for access_as_user \(app 1\)' -and $out6 -match 'admin consent for offline_access' -and $out6 -match 'Dynamics CRM' -and $out6 -match 'An Entra admin must')
    Check 'no admin role: fails fast (< 8 s)' ($script:LastSeconds -lt 8)
    Check 'no admin role: secrets still saved' ($S.Env['ENTRA_CLIENT_SECRET'] -and $S.Env['AGENT_REVIEW_CONNECTOR_CLIENT_SECRET'])

    $S.Env['ENTRA_TENANT_ID'] = '22222222-2222-2222-2222-222222222222'
    $msg = ''; try { Run @{} | Out-Null } catch { $msg = $_.Exception.Message }
    Check 'tenant mismatch: stops' ($msg -match 'signed in to tenant')

    Remove-Item -LiteralPath $configPath
    $msg = ''; try { Run @{} | Out-Null } catch { $msg = $_.Exception.Message }
    Check 'no azd environment: stops' ($msg -match 'No azd environment')
}
catch {
    Check "UNEXPECTED: $($_.Exception.Message) at line $($_.InvocationInfo.ScriptLineNumber)" $false
}
finally {
    Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
"PowerShell $($PSVersionTable.PSVersion)"
$results | Format-Table -AutoSize | Out-String -Width 200
"FAILED: " + @($results | Where-Object { $_.Result -eq 'FAIL' }).Count + " of " + $results.Count
