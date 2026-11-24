/** Represents a Connection Reference record from the Dataverse `connectionreferences` table. */
export interface ConnectionReference {
  /** connectionreferenceid (PK) */
  id: string;
  /** connectionreferencedisplayname */
  displayName: string;
  /** connectionreferencelogicalname */
  logicalName: string;
  /** connectorid — short connector API name (e.g., "shared_commondataserviceforapps") */
  connectorId: string;
  /** connectionid — Dataverse-persisted connection id (32-char compact hex). `null` when unmapped. */
  connectionId: string | null;
  /** statecode === 0 → active */
  isActive: boolean;
}

/**
 * An available connection from the Power Platform API Hub,
 * fetched via `PowerAppsforMakersService.Get_Connections`.
 */
export interface AvailableConnection {
  /** value[].name — raw API Hub identifier; used as the Fluent `<Option>` value. */
  name: string;
  /**
   * The connection's underlying GUID normalized to the same 32-char compact hex form Dataverse
   * persists in `connectionreferences.connectionid`. `null` when `name` doesn't contain a GUID.
   */
  normalizedId: string | null;
  /** value[].properties.displayName */
  displayName: string;
  /** value[].properties.statuses[0].status (e.g., "Connected", "Error") */
  status: string;
  /** value[].properties.createdBy.displayName */
  createdBy: string;
  /** value[].properties.apiId — full provider path, used for matching */
  apiId: string;
  /** value[].properties.createdTime — ISO date string */
  createdTime: string;
}
