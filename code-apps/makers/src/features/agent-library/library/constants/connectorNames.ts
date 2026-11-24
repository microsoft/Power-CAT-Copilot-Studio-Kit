/**
 * Static display name map for Power Platform connector IDs.
 *
 * Maps the short connector name (last segment of connectorId path) to a
 * human-readable display name. Used by parseConnectionReferences and
 * ConnectionSetupView to show user-friendly connector names.
 */

const CONNECTOR_DISPLAY_NAMES: Record<string, string> = {
  shared_commondataserviceforapps: 'Microsoft Dataverse',
  shared_sharepointonline: 'SharePoint',
  shared_teams: 'Microsoft Teams',
  shared_office365: 'Office 365 Outlook',
  shared_office365users: 'Office 365 Users',
  'shared_service-now': 'ServiceNow',
  shared_visualstudioteamservices: 'Azure DevOps',
  shared_sql: 'SQL Server',
  shared_onedriveforbusiness: 'OneDrive for Business',
  shared_approvals: 'Approvals',
  shared_excelonlinebusiness: 'Excel Online (Business)',
  shared_wordonlinebusiness: 'Word Online (Business)',
  shared_planner: 'Planner',
  shared_dynamicscrmonline: 'Dynamics 365',
  shared_azuread: 'Azure Active Directory',
  shared_azureblob: 'Azure Blob Storage',
  shared_a365mcpservers: 'Microsoft 365 MCP Servers',
  shared_a365memcp: 'Work IQ User MCP',
  shared_a365copilotchatmcp: 'Work IQ Copilot MCP',
};

/**
 * Returns a human-readable display name for a connector.
 * Falls back to title-casing the connector name if not in the map.
 */
export function getConnectorDisplayName(connectorName: string): string {
  return (
    CONNECTOR_DISPLAY_NAMES[connectorName] ??
    connectorName
      .replace(/^shared_/, '')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}
