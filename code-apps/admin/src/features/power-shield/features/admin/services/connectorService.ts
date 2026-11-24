import { Cat_connectorsService } from '../../../../../generated/services/Cat_connectorsService';
import type { Cat_connectorsBase } from '../../../../../generated/models/Cat_connectorsModel';
import type { Connector, RiskLevel } from '../../../models/connector';

export type ConnectorRow = Connector & { lastSyncDateTime?: string; createdOn?: string; modifiedOn?: string };

const RISK_LEVEL_MAP: Record<number, RiskLevel> = {
  0: 'No Risk',
  1: 'Low',
  2: 'Medium',
  3: 'High',
  4: 'None',
};

export const RISK_LEVEL_REVERSE: Record<RiskLevel, number> = {
  'No Risk': 0,
  Low: 1,
  Medium: 2,
  High: 3,
  None: 4,
};

function mapConnector(r: Record<string, unknown>): ConnectorRow {
  return {
    id: r.cat_connectorid as string,
    connectorKey: (r.cat_connectorkey as string) ?? '',
    displayName: (r.cat_displayname as string) ?? '',
    connectorName: (r.cat_connectorname as string) ?? undefined,
    publisher: (r.cat_publisher as string) ?? undefined,
    category: (r.cat_category as string) ?? undefined,
    isPremium: !!(r.cat_ispremium as unknown),
    isActive: !!(r.cat_isactive as unknown),
    description: (r.cat_description as string) ?? undefined,
    riskLevel: RISK_LEVEL_MAP[r.cat_risklevel as number] ?? undefined,
    iconUrl: (r.cat_iconurl as string) ?? undefined,
    connectorDetailsUrl: (r.cat_connectordetailsurl as string) ?? undefined,
    actionCount: r.cat_actioncount != null ? Number(r.cat_actioncount) : undefined,
    releaseTag: (r.cat_releasetag as string) ?? undefined,
    blockedByAdmin: !!(r.cat_blockedbyadmin as unknown),
    lastSyncDateTime: (r.cat_lastsyncdatetime as string) ?? undefined,
    createdOn: (r.createdon as string) ?? undefined,
    modifiedOn: (r.modifiedon as string) ?? undefined,
  };
}

const SELECT_FIELDS = [
  'cat_connectorid', 'cat_connectorkey', 'cat_displayname', 'cat_connectorname',
  'cat_publisher', 'cat_category', 'cat_ispremium', 'cat_isactive',
  'cat_description', 'cat_risklevel', 'cat_iconurl', 'cat_connectordetailsurl',
  'cat_actioncount', 'cat_releasetag', 'cat_blockedbyadmin', 'cat_lastsyncdatetime',
  'createdon', 'modifiedon',
];

const FETCH_ALL_PAGE_SIZE = 5000;

/**
 * Loads every active connector by following skipToken cursors until the last page.
 * Throws if any page fails, so callers never show a partial list with a wrong total.
 */
export async function getAllConnectors(): Promise<ConnectorRow[]> {
  const rows: ConnectorRow[] = [];
  const seenTokens = new Set<string>();
  let skipToken: string | undefined;

  do {
    const result = await Cat_connectorsService.getAll({
      filter: 'statecode eq 0',
      // Unique tie-breaker keeps cursor paging stable so rows aren't skipped or repeated.
      orderBy: ['cat_displayname asc', 'cat_connectorid asc'],
      select: SELECT_FIELDS,
      maxPageSize: FETCH_ALL_PAGE_SIZE,
      ...(skipToken ? { skipToken } : {}),
    });
    if (!result.success) {
      throw new Error(result.error?.message ?? 'Failed to load connectors');
    }
    const raw = (result.data ?? []) as unknown as Record<string, unknown>[];
    rows.push(...raw.map(mapConnector));

    skipToken = (result as unknown as { skipToken?: string }).skipToken || undefined;
    if (skipToken) {
      if (seenTokens.has(skipToken)) throw new Error('Connector paging returned a repeated cursor');
      seenTokens.add(skipToken);
    }
  } while (skipToken);

  return rows;
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

export async function getConnectorById(id: string): Promise<ConnectorRow | null> {
  try {
    const result = await Cat_connectorsService.get(id, { select: SELECT_FIELDS });
    if (!result.data) return null;
    return mapConnector(result.data as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function updateConnector(
  id: string,
  fields: {
    riskLevel?: RiskLevel;
    isActive?: boolean;
    isPremium?: boolean;
    blockedByAdmin?: boolean;
  },
): Promise<void> {
  const changedFields: Record<string, unknown> = {};

  if (fields.riskLevel !== undefined) {
    changedFields.cat_risklevel = RISK_LEVEL_REVERSE[fields.riskLevel];
  }
  if (fields.isActive !== undefined) {
    changedFields.cat_isactive = fields.isActive;
  }
  if (fields.isPremium !== undefined) {
    changedFields.cat_ispremium = fields.isPremium;
  }
  if (fields.blockedByAdmin !== undefined) {
    changedFields.cat_blockedbyadmin = fields.blockedByAdmin;
  }

  console.log('[ConnectorService] updateConnector:', id, changedFields);

  const result = await Cat_connectorsService.update(
    id,
    changedFields as Partial<Cat_connectorsBase>,
  );

  if (!result.success) {
    const errorMsg = result.error?.message ?? 'Unknown error';
    console.error('[ConnectorService] updateConnector failed:', id, errorMsg);
    throw new Error(`Failed to update connector: ${errorMsg}`);
  }

  console.log('[ConnectorService] updateConnector success:', id);
}

export interface BulkUpdateResult {
  successCount: number;
  failedCount: number;
  failedIds: string[];
  errors: string[];
}

/** Bulk update multiple connectors with the same field values. */
export async function bulkUpdateConnectors(
  ids: string[],
  fields: {
    riskLevel?: RiskLevel;
    blockedByAdmin?: boolean;
  },
): Promise<BulkUpdateResult> {
  console.log('[ConnectorService] bulkUpdateConnectors:', ids.length, 'connectors, fields:', fields);
  const result: BulkUpdateResult = { successCount: 0, failedCount: 0, failedIds: [], errors: [] };
  for (const id of ids) {
    try {
      await updateConnector(id, fields);
      result.successCount++;
    } catch (err) {
      console.error('[ConnectorService] bulkUpdateConnectors — failed for:', id, err);
      result.failedCount++;
      result.failedIds.push(id);
      const msg = err instanceof Error ? err.message : String(err);
      if (!result.errors.includes(msg)) result.errors.push(msg);
    }
  }
  console.log('[ConnectorService] bulkUpdateConnectors complete:', result);
  return result;
}
