// Ask - Salesforce — Azure Container Apps deployment parameters
//
// Copy this file to parameters.bicepparam (gitignored) and fill in real values.
//
// Usage:
//   cp deploy/parameters.example.bicepparam deploy/parameters.bicepparam
//   bash deploy/deploy.sh

using './main.bicep'

param environmentName  = 'lob-mcp-apps-env'
param acrName          = 'lobmcpapps'         // must be globally unique, lowercase, no hyphens
param location         = 'southindia'
param logRetentionDays = 30

// ── Salesforce credentials ────────────────────────────────────────────────────
param sfInstanceUrl   = ''                    // https://your-org.salesforce.com
param sfClientId      = ''
param sfClientSecret  = ''

// ── App Insights (optional) ───────────────────────────────────────────────────
param appInsightsConnectionString = ''
param appInsightsRoleName         = 'lob-mcp-sf'
