// Ask - ServiceNow — Azure Container Apps deployment parameters

using './main.bicep'

param environmentName  = 'lob-mcp-apps-env'
param acrName          = 'lobmcpapps'         // shared with SF — must be globally unique
param location         = 'southindia'
param logRetentionDays = 30

// ── ServiceNow credentials ────────────────────────────────────────────────────
param servicenowInstance     = ''                  // e.g. dev12345  (no https://)
param servicenowAuthMode     = 'oauth'             // oauth | basic
param servicenowClientId     = ''
param servicenowClientSecret = ''
param servicenowUsername     = ''                  // only for basic auth
param servicenowPassword     = ''

// ── App Insights (optional) ───────────────────────────────────────────────────
param appInsightsConnectionString = ''
param appInsightsRoleName         = 'lob-mcp-sn'
