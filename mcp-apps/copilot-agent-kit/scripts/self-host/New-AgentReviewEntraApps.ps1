#Requires -Version 5.1
<#
.SYNOPSIS
Creates or updates the 2 Microsoft Entra app registrations for a self-hosted Agent Review MCP app.

.DESCRIPTION
App 1 (server API):
- Has the identifier URI api://<appId>, the scope access_as_user and access token version 2.
- Has the Dataverse delegated permission user_impersonation with admin consent.
- Has a client secret. The script writes ENTRA_TENANT_ID, ENTRA_CLIENT_ID and ENTRA_CLIENT_SECRET to the azd environment.

App 2 (Copilot Studio client):
- Has the delegated permissions access_as_user (app 1) and offline_access (Microsoft Graph) with admin consent.
- Has a client secret for the Copilot Studio MCP tool. The script writes it to the azd environment
  (AGENT_REVIEW_CONNECTOR_CLIENT_SECRET). It does not show secrets.

Run the script from the repository root after "azd env new". Sign in with "az login" first.
You can run the script again. It uses the apps that it created before.

.PARAMETER AddRedirectUri
Adds a Copilot Studio callback URL to app 2 as a Web redirect URI. The script keeps the existing URIs.
With this parameter, the script does only this task.

.EXAMPLE
pwsh ./scripts/self-host/New-AgentReviewEntraApps.ps1

.EXAMPLE
pwsh ./scripts/self-host/New-AgentReviewEntraApps.ps1 -AddRedirectUri "https://global.consent.azure-apim.net/redirect/<connector>"

.EXAMPLE
pwsh ./scripts/self-host/New-AgentReviewEntraApps.ps1 -RotateServerSecret
#>
[CmdletBinding()]
param(
    [string]$ServerAppName = 'Agent Review MCP',
    [string]$ConnectorAppName = 'Agent Review MCP - Copilot Studio',
    [ValidateRange(1, 24)][int]$SecretMonths = 12,
    [switch]$SkipConnectorApp,
    [switch]$RotateServerSecret,
    [switch]$RotateConnectorSecret,
    [string]$AddRedirectUri
)

$ErrorActionPreference = 'Stop'

# The same scope ID as aad.manifest.json, so that an Agents Toolkit aadApp/update does not conflict.
$AccessAsUserScopeId = '8d57a907-9168-4778-a65e-31741f871062'
$GraphAppId = '00000003-0000-0000-c000-000000000000'
$OfflineAccessScopeId = '7427e0e9-2fba-42fe-b0c0-848c9e6a8182'
$ConnectorClientIdKey = 'AGENT_REVIEW_CONNECTOR_CLIENT_ID'
$ConnectorSecretKey = 'AGENT_REVIEW_CONNECTOR_CLIENT_SECRET'
$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$script:AzdEnvironment = $null

function Write-Step {
    param([string]$Message)
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Invoke-Native {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [switch]$AllowFailure,
        [switch]$HideArguments
    )
    $errorFile = [System.IO.Path]::GetTempFileName()
    # Windows PowerShell 5.1 stops on native stderr output when the preference is Stop.
    $savedPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & $FilePath @Arguments 2> $errorFile
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $savedPreference
    }
    $errorText = Get-Content -LiteralPath $errorFile -Raw -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $errorFile -Force -ErrorAction SilentlyContinue
    if ($exitCode -ne 0) {
        if ($AllowFailure) { return $null }
        $shown = if ($HideArguments) { '(arguments not shown)' } else { $Arguments -join ' ' }
        throw "$FilePath $shown failed with exit code $exitCode. $errorText"
    }
    return ((@($output) | ForEach-Object { "$_" }) -join "`n").Trim()
}

function Invoke-Az {
    param([Parameter(Mandatory = $true)][string[]]$Arguments, [switch]$AllowFailure)
    Invoke-Native -FilePath 'az' -Arguments $Arguments -AllowFailure:$AllowFailure
}

function Invoke-AzJson {
    param([Parameter(Mandatory = $true)][string[]]$Arguments, [switch]$AllowFailure)
    $text = Invoke-Az -Arguments ($Arguments + @('--output', 'json')) -AllowFailure:$AllowFailure
    if ([string]::IsNullOrWhiteSpace($text)) { return $null }
    return ($text | ConvertFrom-Json)
}

function Invoke-WithRetry {
    param([Parameter(Mandatory = $true)][scriptblock]$Action, [int]$MaxTries = 5, [int]$DelaySeconds = 10)
    for ($retryIndex = 1; ; $retryIndex++) {
        try {
            return & $Action
        }
        catch {
            # A missing role does not go away with a retry.
            if ($retryIndex -ge $MaxTries -or $_.Exception.Message -match 'Authorization_RequestDenied|Insufficient privileges') { throw }
            # New apps and service principals can need some seconds to replicate.
            Write-Verbose "Try $retryIndex of $MaxTries failed: $($_.Exception.Message)"
            Start-Sleep -Seconds $DelaySeconds
        }
    }
}

function Get-AzdValue {
    param([Parameter(Mandatory = $true)][string]$Key)
    $value = Invoke-Native -FilePath 'azd' -Arguments @('env', 'get-value', $Key, '--environment', $script:AzdEnvironment, '--no-prompt') -AllowFailure
    if ([string]::IsNullOrWhiteSpace($value)) { return $null }
    return $value.Trim()
}

function Set-AzdValue {
    param([Parameter(Mandatory = $true)][string]$Key, [Parameter(Mandatory = $true)][string]$Value)
    Invoke-Native -FilePath 'azd' -Arguments @('env', 'set', $Key, $Value, '--environment', $script:AzdEnvironment, '--no-prompt') -HideArguments | Out-Null
}

function Invoke-GraphBody {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('PATCH', 'POST')][string]$Method,
        [Parameter(Mandatory = $true)][string]$Uri,
        [Parameter(Mandatory = $true)][hashtable]$Body
    )
    # A body file prevents quoting problems with az.cmd on Windows.
    $bodyFile = [System.IO.Path]::GetTempFileName()
    try {
        $json = $Body | ConvertTo-Json -Depth 10
        [System.IO.File]::WriteAllText($bodyFile, $json, (New-Object System.Text.UTF8Encoding($false)))
        Invoke-WithRetry { Invoke-Az -Arguments @('rest', '--method', $Method, '--uri', $Uri, '--headers', 'Content-Type=application/json', '--body', "@$bodyFile") } | Out-Null
    }
    finally {
        Remove-Item -LiteralPath $bodyFile -Force -ErrorAction SilentlyContinue
    }
}

function Get-App {
    param([Parameter(Mandatory = $true)][string]$AppId)
    return (Invoke-WithRetry { Invoke-AzJson -Arguments @('ad', 'app', 'show', '--id', $AppId) })
}

function New-ServicePrincipalIfMissing {
    param([Parameter(Mandatory = $true)][string]$AppId)
    $principal = Invoke-AzJson -Arguments @('ad', 'sp', 'show', '--id', $AppId) -AllowFailure
    if (-not $principal) {
        $principal = Invoke-WithRetry { Invoke-AzJson -Arguments @('ad', 'sp', 'create', '--id', $AppId) }
    }
    return $principal
}

function Set-ServerApi {
    param([Parameter(Mandatory = $true)]$App)
    $identifierUri = "api://$($App.appId)"
    $uris = @($App.identifierUris | Where-Object { $_ })
    if ($uris -notcontains $identifierUri) { $uris += $identifierUri }

    $api = $App.api
    $scopes = @($api.oauth2PermissionScopes | Where-Object { $_ })
    $existingScope = $scopes | Where-Object { $_.value -eq 'access_as_user' } | Select-Object -First 1
    if ($existingScope) {
        $scopeId = $existingScope.id
    }
    else {
        $scopeId = $AccessAsUserScopeId
        $scopes += [pscustomobject]@{
            id                      = $scopeId
            type                    = 'User'
            value                   = 'access_as_user'
            isEnabled               = $true
            adminConsentDisplayName = 'Access Agent Review as the signed-in user'
            adminConsentDescription = 'Allow Agent Review to act on behalf of the signed-in user.'
            userConsentDisplayName  = 'Access Agent Review as you'
            userConsentDescription  = 'Allow Agent Review to act on your behalf.'
        }
    }

    # Send the full api object, so that the PATCH keeps the other api settings.
    $apiBody = @{
        requestedAccessTokenVersion = 2
        oauth2PermissionScopes      = $scopes
        knownClientApplications     = @($api.knownClientApplications | Where-Object { $_ })
        preAuthorizedApplications   = @($api.preAuthorizedApplications | Where-Object { $_ })
    }
    if ($null -ne $api.acceptMappedClaims) { $apiBody.acceptMappedClaims = $api.acceptMappedClaims }

    Invoke-GraphBody -Method 'PATCH' -Uri "https://graph.microsoft.com/v1.0/applications/$($App.id)" -Body @{
        identifierUris = $uris
        api            = $apiBody
    }
    return $scopeId
}

function Add-DelegatedPermission {
    param(
        [Parameter(Mandatory = $true)][string]$ClientAppId,
        [Parameter(Mandatory = $true)][string]$ResourceAppId,
        [Parameter(Mandatory = $true)][string]$ScopeId
    )
    $required = @(Invoke-AzJson -Arguments @('ad', 'app', 'permission', 'list', '--id', $ClientAppId))
    $entry = $required | Where-Object { $_.resourceAppId -eq $ResourceAppId } | Select-Object -First 1
    if ($entry -and (@($entry.resourceAccess) | Where-Object { $_.id -eq $ScopeId -and $_.type -eq 'Scope' })) { return }
    Invoke-WithRetry { Invoke-Az -Arguments @('ad', 'app', 'permission', 'add', '--id', $ClientAppId, '--api', $ResourceAppId, '--api-permissions', "$ScopeId=Scope") } | Out-Null
}

function Grant-DelegatedPermission {
    param(
        [Parameter(Mandatory = $true)][string]$ClientPrincipalId,
        [Parameter(Mandatory = $true)][string]$ResourcePrincipalId,
        [Parameter(Mandatory = $true)][string]$Scope
    )
    $grantsUri = "https://graph.microsoft.com/v1.0/servicePrincipals/$ClientPrincipalId/oauth2PermissionGrants"
    $response = Invoke-WithRetry { Invoke-AzJson -Arguments @('rest', '--method', 'GET', '--uri', $grantsUri) }
    $grant = @($response.value) | Where-Object { $_.resourceId -eq $ResourcePrincipalId -and $_.consentType -eq 'AllPrincipals' } | Select-Object -First 1
    if (-not $grant) {
        Invoke-GraphBody -Method 'POST' -Uri 'https://graph.microsoft.com/v1.0/oauth2PermissionGrants' -Body @{
            clientId    = $ClientPrincipalId
            consentType = 'AllPrincipals'
            resourceId  = $ResourcePrincipalId
            scope       = $Scope
        }
        return
    }
    $scopes = @(([string]$grant.scope) -split '\s+' | Where-Object { $_ })
    if ($scopes -contains $Scope) { return }
    Invoke-GraphBody -Method 'PATCH' -Uri "https://graph.microsoft.com/v1.0/oauth2PermissionGrants/$($grant.id)" -Body @{ scope = (($scopes + $Scope) -join ' ') }
}

function New-AppSecret {
    param([Parameter(Mandatory = $true)][string]$AppId, [Parameter(Mandatory = $true)][string]$Prefix)
    $endDate = (Get-Date).ToUniversalTime().AddMonths($SecretMonths).ToString('yyyy-MM-dd')
    for ($secretTry = 1; $secretTry -le 5; $secretTry++) {
        $displayName = '{0}-{1}-{2}' -f $Prefix, (Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss'), $secretTry
        $credential = Invoke-WithRetry { Invoke-AzJson -Arguments @('ad', 'app', 'credential', 'reset', '--id', $AppId, '--append', '--display-name', $displayName, '--end-date', $endDate) }
        $password = [string]$credential.password
        if ($password -and -not $password.StartsWith('-')) { return $password }
        # azd reads a value that starts with "-" as an option. Remove this secret and make a new one.
        $items = @(Invoke-AzJson -Arguments @('ad', 'app', 'credential', 'list', '--id', $AppId))
        foreach ($item in ($items | Where-Object { $_.displayName -eq $displayName })) {
            Invoke-Az -Arguments @('ad', 'app', 'credential', 'delete', '--id', $AppId, '--key-id', [string]$item.keyId) | Out-Null
        }
    }
    throw "Could not make a client secret for app $AppId."
}

function Add-ConnectorRedirectUri {
    param([Parameter(Mandatory = $true)][string]$Uri)
    if ($Uri -notmatch '^https://') { throw 'The redirect URI must start with https://.' }
    $connectorAppId = Get-AzdValue -Key $ConnectorClientIdKey
    if (-not $connectorAppId) { throw "$ConnectorClientIdKey is not set in the azd environment. Run the script without -AddRedirectUri first." }
    if ($Uri -notmatch '^https://[^/]+\.consent\.azure-apim\.net/') {
        Write-Warning 'This is not a usual Copilot Studio callback URL (https://<name>.consent.azure-apim.net/redirect/...). Make sure that it is correct.'
    }
    $app = Get-App -AppId $connectorAppId
    $web = $app.web
    $uris = @($web.redirectUris | Where-Object { $_ })
    if ($uris -contains $Uri) {
        Write-Host "App 2 ($connectorAppId) already has this redirect URI."
        return
    }
    # Send the other web settings again, so that the PATCH keeps them.
    $webBody = @{ redirectUris = @($uris + $Uri) }
    if ($web.homePageUrl) { $webBody.homePageUrl = [string]$web.homePageUrl }
    if ($web.logoutUrl) { $webBody.logoutUrl = [string]$web.logoutUrl }
    if ($web.implicitGrantSettings) {
        $webBody.implicitGrantSettings = @{
            enableAccessTokenIssuance = [bool]$web.implicitGrantSettings.enableAccessTokenIssuance
            enableIdTokenIssuance     = [bool]$web.implicitGrantSettings.enableIdTokenIssuance
        }
    }
    Invoke-GraphBody -Method 'PATCH' -Uri "https://graph.microsoft.com/v1.0/applications/$($app.id)" -Body @{ web = $webBody }
    Write-Host "Added the redirect URI to app 2 ($connectorAppId). App 2 has $($uris.Count + 1) redirect URIs."
}

if ($PSVersionTable.PSVersion.Major -lt 6) {
    # Windows PowerShell 5.1 can write arrays as {"value":[...],"Count":n} in JSON. This prevents it.
    Remove-TypeData -TypeName System.Array -ErrorAction SilentlyContinue
}

$script:ConsentWarnings = New-Object System.Collections.Generic.List[string]
Push-Location -LiteralPath $RepoRoot
try {
    foreach ($tool in @('az', 'azd')) {
        if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "'$tool' is not installed. See step 1 of SELF-HOSTING.md." }
    }
    $configPath = Join-Path $RepoRoot '.azure/config.json'
    if (Test-Path -LiteralPath $configPath) {
        $script:AzdEnvironment = [string](Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json).defaultEnvironment
    }
    if ([string]::IsNullOrWhiteSpace($script:AzdEnvironment)) {
        throw 'No azd environment is selected. Do step 4 of SELF-HOSTING.md first ("azd env new <env-name>").'
    }
    $account = Invoke-AzJson -Arguments @('account', 'show') -AllowFailure
    if (-not $account) { throw 'Azure CLI is not signed in. Run "az login --tenant <tenant-id>" first.' }
    $tenantId = [string]$account.tenantId
    Write-Step "azd environment '$($script:AzdEnvironment)', tenant $tenantId, user $($account.user.name)"

    if ($AddRedirectUri) {
        Add-ConnectorRedirectUri -Uri $AddRedirectUri
        return
    }

    if (-not (Get-Command 'node' -ErrorAction SilentlyContinue)) { throw "'node' is not installed. See step 1 of SELF-HOSTING.md." }
    $dataverseScript = Join-Path $RepoRoot 'scripts/ensure-dataverse-permission.mjs'
    if (-not (Test-Path -LiteralPath $dataverseScript)) { throw "Cannot find $dataverseScript. Keep this script in scripts/self-host/ of the repository." }
    $savedTenantId = Get-AzdValue -Key 'ENTRA_TENANT_ID'
    if ($savedTenantId -and $savedTenantId -ne $tenantId) {
        throw "The azd environment uses tenant $savedTenantId, but Azure CLI is signed in to tenant $tenantId. Run ""az login --tenant $savedTenantId"", or use a new azd environment."
    }
    Set-AzdValue -Key 'ENTRA_TENANT_ID' -Value $tenantId

    Write-Step "App 1 ($ServerAppName): server API"
    $serverAppId = Get-AzdValue -Key 'ENTRA_CLIENT_ID'
    if ($serverAppId) {
        Write-Host "Uses the app in ENTRA_CLIENT_ID: $serverAppId"
    }
    else {
        $serverAppId = [string](Invoke-AzJson -Arguments @('ad', 'app', 'create', '--display-name', $ServerAppName, '--sign-in-audience', 'AzureADMyOrg')).appId
        Set-AzdValue -Key 'ENTRA_CLIENT_ID' -Value $serverAppId
        Write-Host "Created the app: $serverAppId"
    }
    $scopeId = Set-ServerApi -App (Get-App -AppId $serverAppId)
    $serverPrincipal = New-ServicePrincipalIfMissing -AppId $serverAppId
    Write-Host "Set the identifier URI api://$serverAppId and the scope access_as_user."

    Write-Step 'App 1: Dataverse permission and admin consent'
    try {
        $dataverseOutput = Invoke-Native -FilePath 'node' -Arguments @($dataverseScript, $serverAppId)
        if ($dataverseOutput) { Write-Host $dataverseOutput }
    }
    catch {
        Write-Warning "The Dataverse permission step failed. $($_.Exception.Message)"
        $script:ConsentWarnings.Add("App 1 ($serverAppId): the Dynamics CRM permission user_impersonation, with admin consent.")
    }

    if ($RotateServerSecret -or -not (Get-AzdValue -Key 'ENTRA_CLIENT_SECRET')) {
        Write-Step 'App 1: client secret'
        Set-AzdValue -Key 'ENTRA_CLIENT_SECRET' -Value (New-AppSecret -AppId $serverAppId -Prefix 'agent-review-server')
        Write-Host 'Saved the secret in the azd environment (ENTRA_CLIENT_SECRET). "azd provision" puts it in Key Vault.'
    }
    else {
        Write-Host 'ENTRA_CLIENT_SECRET is set. The script did not make a new app 1 secret.'
    }

    $connectorAppId = $null
    if (-not $SkipConnectorApp) {
        Write-Step "App 2 ($ConnectorAppName): Copilot Studio client"
        $connectorAppId = Get-AzdValue -Key $ConnectorClientIdKey
        if ($connectorAppId) {
            Write-Host "Uses the app in ${ConnectorClientIdKey}: $connectorAppId"
        }
        else {
            $connectorAppId = [string](Invoke-AzJson -Arguments @('ad', 'app', 'create', '--display-name', $ConnectorAppName, '--sign-in-audience', 'AzureADMyOrg')).appId
            Set-AzdValue -Key $ConnectorClientIdKey -Value $connectorAppId
            Write-Host "Created the app: $connectorAppId"
        }
        $connectorPrincipal = New-ServicePrincipalIfMissing -AppId $connectorAppId
        Add-DelegatedPermission -ClientAppId $connectorAppId -ResourceAppId $serverAppId -ScopeId $scopeId
        Add-DelegatedPermission -ClientAppId $connectorAppId -ResourceAppId $GraphAppId -ScopeId $OfflineAccessScopeId
        Write-Host 'Set the permissions access_as_user (app 1) and offline_access (Microsoft Graph).'

        Write-Step 'App 2: admin consent'
        $graphPrincipal = Invoke-AzJson -Arguments @('ad', 'sp', 'show', '--id', $GraphAppId)
        $consents = @(
            @{ Name = 'access_as_user (app 1)'; ResourceId = [string]$serverPrincipal.id; Scope = 'access_as_user' },
            @{ Name = 'offline_access (Microsoft Graph)'; ResourceId = [string]$graphPrincipal.id; Scope = 'offline_access' }
        )
        foreach ($consent in $consents) {
            try {
                Grant-DelegatedPermission -ClientPrincipalId ([string]$connectorPrincipal.id) -ResourcePrincipalId $consent.ResourceId -Scope $consent.Scope
                Write-Host "Admin consent is given for $($consent.Name)."
            }
            catch {
                Write-Warning "Could not give admin consent for $($consent.Name). $($_.Exception.Message)"
                $script:ConsentWarnings.Add("App 2 ($connectorAppId): admin consent for $($consent.Name).")
            }
        }

        if ($RotateConnectorSecret -or -not (Get-AzdValue -Key $ConnectorSecretKey)) {
            Write-Step 'App 2: client secret'
            Set-AzdValue -Key $ConnectorSecretKey -Value (New-AppSecret -AppId $connectorAppId -Prefix 'agent-review-copilot-studio')
            Write-Host "Saved the secret in the azd environment ($ConnectorSecretKey)."
        }
        else {
            Write-Host "$ConnectorSecretKey is set. The script did not make a new app 2 secret."
        }
    }

    $mcpServerUrl = Get-AzdValue -Key 'MCP_SERVER_URL'
    if (-not $mcpServerUrl) { $mcpServerUrl = '(after step 6: azd env get-value MCP_SERVER_URL)' }
    $authority = "https://login.microsoftonline.com/$tenantId/oauth2/v2.0"
    Write-Host ''
    Write-Host 'Saved in the azd environment: ENTRA_TENANT_ID, ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET.' -ForegroundColor Green
    if ($connectorAppId) {
        Write-Host 'Values for the Copilot Studio MCP tool (step 9 of SELF-HOSTING.md):' -ForegroundColor Green
        Write-Host "  Server URL:         $mcpServerUrl"
        Write-Host "  Client ID:          $connectorAppId"
        Write-Host "  Client secret:      run: azd env get-value $ConnectorSecretKey"
        Write-Host "  Authorization URL:  $authority/authorize"
        Write-Host "  Token URL template: $authority/token"
        Write-Host "  Refresh URL:        $authority/token"
        Write-Host "  Scopes:             api://$serverAppId/access_as_user offline_access"
    }
    if ($script:ConsentWarnings.Count -gt 0) {
        Write-Warning 'An Entra admin must do these tasks (Entra admin center > App registrations > the app > API permissions > Grant admin consent):'
        foreach ($item in $script:ConsentWarnings) { Write-Warning "- $item" }
    }
    Write-Host 'Next: azd provision (step 6). Then build and deploy (step 7).'
}
finally {
    Pop-Location
}
