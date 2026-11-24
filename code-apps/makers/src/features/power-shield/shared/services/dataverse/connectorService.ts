import { Cat_connectorsService } from '../../../../../generated/services/Cat_connectorsService';
import type { Cat_connectors } from '../../../../../generated/models/Cat_connectorsModel';
import type { Connector, RiskLevel } from '../../../models/connector';

export const CONNECTOR_PAGE_SIZE = 25;

const RISK_LEVEL_MAP: Record<number, RiskLevel> = {
  0: 'No Risk',
  1: 'Low',
  2: 'Medium',
  3: 'High',
  4: 'None',
};

function toConnector(r: Cat_connectors): Connector {
  return {
    id: r.cat_connectorid,
    connectorKey: r.cat_connectorkey ?? '',
    displayName: r.cat_displayname ?? '',
    publisher: r.cat_publisher,
    category: r.cat_category,
    isPremium: !!(r.cat_ispremium as unknown),
    isActive: !!(r.cat_isactive as unknown),
    description: r.cat_description,
    riskLevel: r.cat_risklevel != null ? RISK_LEVEL_MAP[Number(r.cat_risklevel)] : undefined,
    iconUrl: r.cat_iconurl,
    connectorDetailsUrl: r.cat_connectordetailsurl,
    actionCount: r.cat_actioncount != null ? Number(r.cat_actioncount) : undefined,
    releaseTag: r.cat_releasetag,
    blockedByAdmin: !!(r.cat_blockedbyadmin as unknown),
    connectorName: r.cat_connectorname,
  };
}

export interface ConnectorSearchParams {
  searchTerm?: string;
  publisher?: string;
  isPremium?: 'all' | 'premium' | 'standard';
  releaseTag?: 'all' | 'Production' | 'Preview';
  riskLevel?: 'all' | 'No Risk' | 'High' | 'Medium' | 'Low' | 'None';
  blockedFilter?: 'all' | 'available' | 'blocked';
}

const RISK_LEVEL_NUM: Record<string, number> = {
  'No Risk': 0,
  Low: 1,
  Medium: 2,
  High: 3,
  None: 4,
};

function buildFilter(params: ConnectorSearchParams): string {
  const clauses = ['cat_isactive eq true'];
  if (params.searchTerm?.trim()) {
    const safe = params.searchTerm.trim().replace(/'/g, "''");
    clauses.push(`contains(cat_displayname,'${safe}')`);
  }
  if (params.publisher) {
    const safe = params.publisher.replace(/'/g, "''");
    clauses.push(`cat_publisher eq '${safe}'`);
  }
  if (params.isPremium === 'premium') clauses.push('cat_ispremium eq true');
  if (params.isPremium === 'standard') clauses.push('cat_ispremium eq false');
  if (params.releaseTag && params.releaseTag !== 'all')
    clauses.push(`cat_releasetag eq '${params.releaseTag}'`);
  if (params.riskLevel && params.riskLevel !== 'all') {
    const num = RISK_LEVEL_NUM[params.riskLevel];
    if (num !== undefined) clauses.push(`cat_risklevel eq ${num}`);
  }
  if (params.blockedFilter === 'available') clauses.push('cat_blockedbyadmin eq false');
  if (params.blockedFilter === 'blocked') clauses.push('cat_blockedbyadmin eq true');
  return clauses.join(' and ');
}

/**
 * Lightweight DTO used by the "Add Blocked Connector" dialog Combobox dropdowns.
 * Fetched once on dialog open; never stored in app-wide state.
 */
export interface ConnectorDropdownItem {
  id: string;            // cat_connectorid
  connectorKey: string;  // cat_connectorkey
  displayName: string;   // cat_displayname
  publisher: string;     // cat_publisher (empty string if unset)
}

/**
 * Fetches a lightweight list of active connectors for the blocked-connector dialog dropdowns.
 * Returns key + displayName + publisher for each active connector, sorted by displayName.
 * Max 2000 records — sufficient for the current ~1300 row dataset.
 */
export async function getConnectorDropdownData(): Promise<ConnectorDropdownItem[]> {
  const result = await Cat_connectorsService.getAll({
    filter: 'cat_isactive eq true',
    select: ['cat_connectorid', 'cat_connectorkey', 'cat_displayname', 'cat_publisher'],
    orderBy: ['cat_displayname asc'],
    top: 2000,
  });
  return (result.data ?? [])
    .filter(r => r.cat_connectorkey && r.cat_displayname)
    .map(r => ({
      id: r.cat_connectorid,
      connectorKey: r.cat_connectorkey!,
      displayName: r.cat_displayname!,
      publisher: r.cat_publisher ?? '',
    }));
}

/**
 * Server-side search for connectors by name/key, or for distinct publishers.
 * When `blockType` is 'connector' (default): OData `contains()` on `cat_displayname` and `cat_connectorkey`.
 * When `blockType` is 'publisher': OData `contains()` on `cat_publisher`, deduplicated to distinct publishers.
 */
export async function searchConnectorDropdownData(
  query: string,
  blockType: 'connector' | 'publisher' = 'connector',
): Promise<ConnectorDropdownItem[]> {
  const safe = query.trim().replace(/'/g, "''");

  const filter = blockType === 'publisher'
    ? `cat_isactive eq true and contains(cat_publisher,'${safe}')`
    : `cat_isactive eq true and (contains(cat_displayname,'${safe}') or contains(cat_connectorkey,'${safe}'))`;

  const result = await Cat_connectorsService.getAll({
    filter,
    select: ['cat_connectorid', 'cat_connectorkey', 'cat_displayname', 'cat_publisher'],
    orderBy: [blockType === 'publisher' ? 'cat_publisher asc' : 'cat_displayname asc'],
    top: 2000,
  });

  const items = (result.data ?? [])
    .filter(r => r.cat_connectorkey && r.cat_displayname)
    .map(r => ({
      id: r.cat_connectorid,
      connectorKey: r.cat_connectorkey!,
      displayName: r.cat_displayname!,
      publisher: r.cat_publisher ?? '',
    }));

  if (blockType === 'publisher') {
    // Deduplicate by publisher name — keep one representative connector per publisher
    const seen = new Map<string, ConnectorDropdownItem>();
    for (const item of items) {
      if (item.publisher && !seen.has(item.publisher)) {
        seen.set(item.publisher, item);
      }
    }
    return Array.from(seen.values());
  }

  return items;
}

/**
 * Fetches a lightweight list of distinct active connector publishers for the filter dropdown.
 * Excludes cat_iconurl and other non-essential fields — tiny payload.
 */
export async function getConnectorPublishers(): Promise<string[]> {
  const result = await Cat_connectorsService.getAll({
    filter: 'cat_isactive eq true',
    select: ['cat_publisher'],
    top: 2000,
  });
  const pubs = new Set(
    (result.data ?? []).map(r => r.cat_publisher).filter(Boolean) as string[]
  );
  return Array.from(pubs).sort((a, b) => a.localeCompare(b));
}

/**
 * Server-side paged connector search using OData skiptoken (cursor) pagination.
 * Dataverse returns @odata.nextLink when more records exist; the SDK exposes this
 * as result.skipToken. Numeric $skip is unreliable when the SDK sends the
 * Prefer: odata.maxpagesize header (cursor mode), so we use $skiptoken instead.
 * cat_isactive and cat_ispremium are Edm.Boolean — filtered with `eq true/false`.
 * Text search uses OData contains() on cat_displayname only.
 */
export async function searchConnectors(
  params: ConnectorSearchParams,
  skipToken: string | undefined,
): Promise<{ connectors: Connector[]; hasMore: boolean; nextSkipToken: string | undefined }> {
  const filter = buildFilter(params);
  console.log('[searchConnectors] filter:', filter, '| maxPageSize:', CONNECTOR_PAGE_SIZE, '| skipToken:', skipToken ?? '(none)');
  const result = await Cat_connectorsService.getAll({
    filter,
    orderBy: ['cat_displayname asc'],
    select: [
      'cat_connectorid', 'cat_connectorkey', 'cat_connectorname', 'cat_displayname',
      'cat_publisher', 'cat_category', 'cat_ispremium', 'cat_isactive',
      'cat_description', 'cat_risklevel', 'cat_iconurl',
      'cat_connectordetailsurl', 'cat_actioncount', 'cat_releasetag',
      'cat_blockedbyadmin',
    ],
    maxPageSize: CONNECTOR_PAGE_SIZE,
    ...(skipToken ? { skipToken } : {}),
  });
  const raw = result.data ?? [];
  console.log('[searchConnectors] raw result count:', raw.length, '| hasMore:', !!result.skipToken);
  return {
    connectors: raw.map(toConnector),
    hasMore: !!result.skipToken,
    nextSkipToken: result.skipToken,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Blocked-status check for approval wizard
// ─────────────────────────────────────────────────────────────────────────────

export interface ConnectorBlockedStatus {
  connectorId: string;
  connectorName: string;
  connectorKey: string;
  isBlocked: boolean;
}

/**
 * Checks the live `cat_blockedbyadmin` flag for a set of connector IDs.
 * Used by the Review & Approve wizard to warn admins about connectors
 * that were blocked after the request was submitted.
 */
export async function getConnectorBlockedStatus(
  connectorIds: string[],
): Promise<ConnectorBlockedStatus[]> {
  if (connectorIds.length === 0) return [];

  // Build OData OR filter for the given IDs
  const idClauses = connectorIds.map((id) => `cat_connectorid eq ${id}`);
  const filter = `(${idClauses.join(' or ')})`;

  const result = await Cat_connectorsService.getAll({
    filter,
    select: ['cat_connectorid', 'cat_connectorname', 'cat_connectorkey', 'cat_blockedbyadmin'],
    top: connectorIds.length,
  });

  return (result.data ?? []).map((r) => ({
    connectorId: r.cat_connectorid,
    connectorName: r.cat_connectorname ?? r.cat_connectorkey ?? '',
    connectorKey: r.cat_connectorkey ?? '',
    isBlocked: !!(r.cat_blockedbyadmin as unknown),
  }));
}

/** Lightweight check — returns true if at least one active connector exists. */
export async function hasConnectors(): Promise<boolean> {
  try {
    const result = await Cat_connectorsService.getAll({
      filter: 'statecode eq 0',
      select: ['cat_connectorid'],
      top: 1,
    });
    return (result.data ?? []).length > 0;
  } catch {
    return true; // Assume data exists on error — don't block the UI
  }
}
