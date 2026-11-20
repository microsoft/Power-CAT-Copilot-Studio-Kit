import { Cat_connectoractionsService } from '../../../../../generated/services/Cat_connectoractionsService';
import type { Cat_connectoractionsBase } from '../../../../../generated/models/Cat_connectoractionsModel';
import type { ConnectorAction, ActionStatus } from '../../../models/connectorAction';

const ACTION_STATUS_MAP: Record<number, ActionStatus> = {
  1: 'Allow',
  2: 'Block',
};

const ACTION_STATUS_REVERSE: Record<ActionStatus, number> = {
  Allow: 1,
  Block: 2,
  Unknown: 1,
};

export interface ConnectorActionRow extends ConnectorAction {
  connectorName?: string;
  lastSyncDateTime?: string;
  createdOn?: string;
}

const SELECT_FIELDS = [
  'cat_connectoractionid', 'cat_actionname', 'cat_actionkey',
  'cat_actiondescription', 'cat_actionstatus', 'cat_isactive',
  '_cat_connectorid_value', 'cat_lastsyncdatetime', 'createdon',
  'cat_connectoractionname', 'cat_blockedbyadmin',
];

function mapAction(r: Record<string, unknown>): ConnectorActionRow {
  return {
    id: r.cat_connectoractionid as string,
    connectorId: (r._cat_connectorid_value as string) ?? '',
    actionName: (r.cat_actionname as string) ?? '',
    actionKey: (r.cat_actionkey as string) ?? '',
    actionDescription: (r.cat_actiondescription as string) ?? undefined,
    actionStatus: ACTION_STATUS_MAP[r.cat_actionstatus as number] ?? 'Unknown',
    isActive: r.cat_isactive === 1,
    blockedByAdmin: !!(r.cat_blockedbyadmin as unknown),
    connectorName: (r['_cat_connectorid_value@OData.Community.Display.V1.FormattedValue'] as string)
      ?? (r.cat_connectoridname as string)
      ?? undefined,
    lastSyncDateTime: (r.cat_lastsyncdatetime as string) ?? undefined,
    createdOn: (r.createdon as string) ?? undefined,
  };
}

export interface ActionSearchParams {
  searchTerm?: string;
}

function buildActionFilter(params: ActionSearchParams): string {
  const clauses = ['statecode eq 0'];
  if (params.searchTerm?.trim()) {
    const safe = params.searchTerm.trim().replace(/'/g, "''");
    const textClauses = [
      `contains(cat_actionname,'${safe}')`,
      `contains(cat_actionkey,'${safe}')`,
      `contains(cat_connectoractionname,'${safe}')`,
    ];
    clauses.push(`(${textClauses.join(' or ')})`);
  }
  return clauses.join(' and ');
}

export interface ActionSearchResult {
  items: ConnectorActionRow[];
  hasMore: boolean;
  nextSkipToken: string | undefined;
}

/** Server-side paged search using OData skipToken cursor pagination. */
export async function searchConnectorActions(
  params: ActionSearchParams,
  pageSize: number,
  skipToken: string | undefined,
): Promise<ActionSearchResult> {
  const filter = buildActionFilter(params);
  const result = await Cat_connectoractionsService.getAll({
    filter,
    orderBy: ['cat_actionname asc'],
    select: SELECT_FIELDS,
    maxPageSize: pageSize,
    ...(skipToken ? { skipToken } : {}),
  });
  const raw = (result.data ?? []) as unknown as Record<string, unknown>[];
  return {
    items: raw.map(mapAction),
    hasMore: !!(result as unknown as Record<string, unknown>).skipToken,
    nextSkipToken: (result as unknown as Record<string, unknown>).skipToken as string | undefined,
  };
}

/** Lightweight check — returns true if at least one active connector action exists. */
export async function hasConnectorActions(): Promise<boolean> {
  try {
    const result = await Cat_connectoractionsService.getAll({
      filter: 'statecode eq 0',
      select: ['cat_connectoractionid'],
      top: 1,
    });
    return (result.data ?? []).length > 0;
  } catch {
    return true; // Assume data exists on error — don't block the UI
  }
}

export async function getConnectorActionsByConnectorId(connectorId: string): Promise<ConnectorActionRow[]> {
  const result = await Cat_connectoractionsService.getAll({
    filter: `statecode eq 0 and _cat_connectorid_value eq '${connectorId}'`,
    select: SELECT_FIELDS,
    orderBy: ['cat_actionname asc'],
    top: 5000,
  });
  return ((result.data ?? []) as unknown as Record<string, unknown>[]).map(mapAction);
}

export async function getConnectorActionById(id: string): Promise<ConnectorActionRow | null> {
  try {
    const result = await Cat_connectoractionsService.get(id, { select: SELECT_FIELDS });
    if (!result.data) return null;
    return mapAction(result.data as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function updateConnectorAction(
  id: string,
  fields: {
    actionStatus?: ActionStatus;
    isActive?: boolean;
    blockedByAdmin?: boolean;
  },
): Promise<void> {
  const changedFields: Record<string, unknown> = {};

  if (fields.actionStatus !== undefined) {
    changedFields.cat_actionstatus = ACTION_STATUS_REVERSE[fields.actionStatus];
  }
  if (fields.isActive !== undefined) {
    changedFields.cat_isactive = fields.isActive ? 1 : 0;
  }
  if (fields.blockedByAdmin !== undefined) {
    changedFields.cat_blockedbyadmin = fields.blockedByAdmin;
  }

  await Cat_connectoractionsService.update(
    id,
    changedFields as Partial<Cat_connectoractionsBase>,
  );
}

export interface BulkUpdateResult {
  successCount: number;
  failedCount: number;
  failedIds: string[];
}

/** Bulk update multiple connector actions with the same field values. */
export async function bulkUpdateConnectorActions(
  ids: string[],
  fields: {
    actionStatus?: ActionStatus;
    blockedByAdmin?: boolean;
  },
): Promise<BulkUpdateResult> {
  const result: BulkUpdateResult = { successCount: 0, failedCount: 0, failedIds: [] };
  for (const id of ids) {
    try {
      await updateConnectorAction(id, fields);
      result.successCount++;
    } catch {
      result.failedCount++;
      result.failedIds.push(id);
    }
  }
  return result;
}
