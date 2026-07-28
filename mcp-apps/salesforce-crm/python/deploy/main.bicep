// Ask - Salesforce — Azure Container Apps deployment.
//
// Deploys: ACR, Log Analytics workspace, Container Apps environment,
//          managed identity (AcrPull), and the lob-mcp-apps-sf Container App.

@description('Azure region. Defaults to the resource group location.')
param location string = resourceGroup().location

@description('Container Apps Environment name')
param environmentName string = 'lob-mcp-apps-env'

@description('Azure Container Registry name (must be globally unique, lowercase, no hyphens)')
param acrName string = 'lobmcpapps'

@description('Log Analytics retention in days')
param logRetentionDays int = 30

// ── Salesforce credentials ────────────────────────────────────────────────────
@secure()
param sfInstanceUrl string = ''
@secure()
param sfClientId string = ''
@secure()
param sfClientSecret string = ''

// ── App Insights (optional) ───────────────────────────────────────────────────
@secure()
param appInsightsConnectionString string = ''
param appInsightsRoleName string = 'lob-mcp-sf'

// ═════════════════════════════════════════════════════════════════════════════
// Core Infrastructure
// ═════════════════════════════════════════════════════════════════════════════

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: false }
}

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${environmentName}-logs'
  location: location
  properties: {
    retentionInDays: logRetentionDays
    sku: { name: 'PerGB2018' }
  }
}

resource cae 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: environmentName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${environmentName}-identity'
  location: location
}

var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'
resource acrPullAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, identity.id, acrPullRoleId)
  scope: acr
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// SF Container App
// ═════════════════════════════════════════════════════════════════════════════

var acrServer = acr.properties.loginServer

resource caSf 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'lob-mcp-apps-sf'
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identity.id}': {} }
  }
  properties: {
    environmentId: cae.id
    configuration: {
      registries: [{
        server: acrServer
        identity: identity.id
      }]
      ingress: {
        external: true
        targetPort: 8080
        transport: 'http'
        // NOTE: stickySessions is NOT declared here. Setting it via Bicep on
        // this API version (2024-03-01) triggered an opaque
        // "content for this response was already consumed" error that we
        // couldn't decode. ServerDeploy.ps1 re-applies sticky sessions via
        // a direct `az containerapp ingress sticky-sessions set` call right
        // after the container app image swap — same effect, but works.
        corsPolicy: {
          allowedOrigins: ['*']
          allowedHeaders: ['*']
          allowedMethods: ['GET', 'POST', 'OPTIONS']
          allowCredentials: false
        }
      }
      // App Insights wiring is optional. If appInsightsConnectionString is
      // empty the secret + env vars are omitted entirely. Container Apps
      // rejects a secret with an empty `value`, hence the conditional concat.
      secrets: concat(
        [
          { name: 'sf-instance-url',  value: sfInstanceUrl }
          { name: 'sf-client-id',     value: sfClientId }
          { name: 'sf-client-secret', value: sfClientSecret }
        ],
        empty(appInsightsConnectionString) ? [] : [
          { name: 'appinsights-conn-string', value: appInsightsConnectionString }
        ]
      )
    }
    template: {
      containers: [{
        name: 'sf'
        // Initial image is Microsoft's quickstart placeholder. The Container
        // App needs SOMETHING to pull on first create, but our real image in
        // ACR doesn't exist yet on a fresh deploy (it's built right after,
        // by `az acr build` in ServerDeploy.ps1). ServerDeploy.ps1 then runs
        // `az containerapp update --image <real>` to swap to the real image.
        // On re-runs this briefly reverts to the placeholder, then back —
        // a few seconds of placeholder traffic; acceptable for this stack.
        image: 'mcr.microsoft.com/k8se/quickstart:latest'
        resources: { cpu: json('0.5'), memory: '1Gi' }
        env: concat(
          [
            { name: 'SF_INSTANCE_URL',  secretRef: 'sf-instance-url' }
            { name: 'SF_CLIENT_ID',     secretRef: 'sf-client-id' }
            { name: 'SF_CLIENT_SECRET', secretRef: 'sf-client-secret' }
            { name: 'PORT',             value: '8080' }
          ],
          empty(appInsightsConnectionString) ? [] : [
            { name: 'APPINSIGHTS_CONNECTION_STRING', secretRef: 'appinsights-conn-string' }
            { name: 'APPINSIGHTS_ROLE_NAME',         value: appInsightsRoleName }
          ]
        )
      }]
      scale: {
        minReplicas: 1
        maxReplicas: 3
      }
    }
  }
}

@description('Public HTTPS URL of the SF Copilot container app')
output sfUrl string = 'https://${caSf.properties.configuration.ingress.fqdn}'

@description('ACR login server')
output acrLoginServer string = acrServer
