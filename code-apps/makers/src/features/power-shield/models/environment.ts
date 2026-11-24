/**
 * Environment as returned by PowerAppsforMakersService.Get_Environments().
 * Replaces the old Dataverse-backed Environment model.
 */
export interface PpEnvironment {
  id: string;           // ARM resource ID (value.id)
  name: string;         // PP environment unique ID used as key (value.name)
  type: string;         // ARM resource type (value.type)
  location: string;     // Azure location (value.location)
  displayName: string;  // Human-readable name (value.properties.displayName)
  environmentSku: string; // e.g. "Production", "Sandbox", "Developer" (value.properties.environmentSku)
}
