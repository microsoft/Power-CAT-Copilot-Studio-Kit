targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Azure Developer CLI environment name used for tags and deterministic resource names.')
param environmentName string

@description('Azure region for the resource group and all contained resources.')
param location string = 'centralindia'

@description('Dedicated resource group for the Agent Review MCP App.')
param resourceGroupName string = 'rg-agent-review-mcpapp-dev'

@minLength(1)
@maxLength(8)
@description('Short identifier used in globally unique Azure resource names.')
param resourcePrefix string = 'armcp'

@description('Client ID of the Agent Review app registration in the CAT tenant.')
param entraClientId string

@description('Tenant ID that owns the Agent Review app registration.')
param entraTenantId string

@secure()
@description('Client secret for the CAT app registration. Stored in Key Vault and never copied directly into App Service settings.')
param entraClientSecret string

@description('Power Platform home environment used for persisted Agent Review storage and defaults.')
param agentKitHomeEnvironmentId string

var resourceToken = toLower(take(uniqueString(subscription().id, environmentName, location), 7))
var resourceBaseName = 'az${resourcePrefix}${resourceToken}'
var tags = {
  'azd-env-name': environmentName
  application: 'agent-review-mcpapp'
  environment: 'development'
}

resource resourceGroup 'Microsoft.Resources/resourceGroups@2023-07-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

module resources './modules/resources.bicep' = {
  name: 'agent-review-resources'
  scope: resourceGroup
  params: {
    location: location
    resourceBaseName: resourceBaseName
    tags: tags
    entraClientId: entraClientId
    entraTenantId: entraTenantId
    entraClientSecret: entraClientSecret
    agentKitHomeEnvironmentId: agentKitHomeEnvironmentId
  }
}

output AZURE_RESOURCE_GROUP string = resourceGroup.name
output AZURE_LOCATION string = location
output AZURE_APP_SERVICE_NAME string = resources.outputs.webAppName
output AZURE_KEY_VAULT_NAME string = resources.outputs.keyVaultName
output AZURE_MANAGED_IDENTITY_NAME string = resources.outputs.managedIdentityName
output APPLICATIONINSIGHTS_CONNECTION_STRING string = resources.outputs.appInsightsConnectionString
output WEB_URL string = resources.outputs.webAppUrl
output MCP_SERVER_URL string = '${resources.outputs.webAppUrl}/mcp'
output MCP_SERVER_DOMAIN string = resources.outputs.webAppHostName
