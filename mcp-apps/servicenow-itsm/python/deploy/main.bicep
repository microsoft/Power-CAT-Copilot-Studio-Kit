// Ask - ServiceNow — Azure Container Apps deployment.

@description('Azure region.')
param location string = resourceGroup().location

@description('Container Apps Environment name (shared with SF — same env hosts both LOB container apps)')
param environmentName string = 'lob-mcp-apps-env'

@description('Azure Container Registry name (shared with SF — must be globally unique)')
param acrName string = 'lobmcpapps'

@description('Log Analytics retention in days')
param logRetentionDays int = 30

// ── ServiceNow credentials ────────────────────────────────────────────────────
param servicenowInstance string = ''
param servicenowAuthMode string = 'oauth'
@secure()
param servicenowClientId string = ''
@secure()
param servicenowClientSecret string = ''
@secure()
param servicenowUsername string = ''
@secure()
param servicenowPassword string = ''

// ── App Insights (optional) ───────────────────────────────────────────────────
@secure()
param appInsightsConnectionString string = ''
param appInsightsRoleName string = 'lob-mcp-sn'

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
// SN Container App
// ═════════════════════════════════════════════════════════════════════════════

var acrServer = acr.properties.loginServer

resource caSn 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'gtc-sn-gw'
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
        targetPort: 8081
        transport: 'http'
        corsPolicy: {
          allowedOrigins: ['*']
          allowedHeaders: ['*']
          allowedMethods: ['GET', 'POST', 'OPTIONS']
          allowCredentials: false
        }
      }
      // Container Apps rejects secrets with empty `value`. Build the secrets
      // and env arrays conditionally so OAuth-only setups (no username/password)
      // and deploys without App Insights still validate.
      secrets: concat(
        [
          { name: 'sn-client-id',     value: servicenowClientId }
          { name: 'sn-client-secret', value: servicenowClientSecret }
        ],
        empty(servicenowUsername)          ? [] : [ { name: 'sn-username',             value: servicenowUsername } ],
        empty(servicenowPassword)          ? [] : [ { name: 'sn-password',             value: servicenowPassword } ],
        empty(appInsightsConnectionString) ? [] : [ { name: 'appinsights-conn-string', value: appInsightsConnectionString } ]
      )
    }
    template: {
      containers: [{
        name: 'sn'
        // Placeholder image -- the real SN image isn't built until ServerDeploy
        // runs `az acr build` AFTER this Bicep deploy. The container app is then
        // re-pointed at the real image via `az containerapp update`.
        // On re-runs this briefly reverts to the placeholder, then back --
        // a few seconds of placeholder traffic; acceptable for this stack.
        image: 'mcr.microsoft.com/k8se/quickstart:latest'
        resources: { cpu: json('0.5'), memory: '1Gi' }
        env: concat(
          [
            { name: 'SERVICENOW_INSTANCE',      value: servicenowInstance }
            { name: 'SERVICENOW_AUTH_MODE',     value: servicenowAuthMode }
            { name: 'SERVICENOW_CLIENT_ID',     secretRef: 'sn-client-id' }
            { name: 'SERVICENOW_CLIENT_SECRET', secretRef: 'sn-client-secret' }
            { name: 'PORT',                     value: '8081' }
            { name: 'APPINSIGHTS_ROLE_NAME',    value: appInsightsRoleName }
          ],
          empty(servicenowUsername)          ? [] : [ { name: 'SERVICENOW_USERNAME',           secretRef: 'sn-username' } ],
          empty(servicenowPassword)          ? [] : [ { name: 'SERVICENOW_PASSWORD',           secretRef: 'sn-password' } ],
          empty(appInsightsConnectionString) ? [] : [ { name: 'APPINSIGHTS_CONNECTION_STRING', secretRef: 'appinsights-conn-string' } ]
        )
      }]
      scale: {
        minReplicas: 1
        maxReplicas: 3
      }
    }
  }
}

@description('Public HTTPS URL of the SN Copilot container app')
output snUrl string = 'https://${caSn.properties.configuration.ingress.fqdn}'

@description('ACR login server')
output acrLoginServer string = acrServer
