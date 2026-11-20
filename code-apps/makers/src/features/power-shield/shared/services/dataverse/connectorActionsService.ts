import { Cat_connectoractionsService } from '../../../../../generated/services/Cat_connectoractionsService';
import type { Cat_connectoractions } from '../../../../../generated/models/Cat_connectoractionsModel';
import type { ConnectorAction, ActionStatus } from '../../../models/connectorAction';

const ACTION_STATUS_MAP: Record<number, ActionStatus> = {
  1: 'Allow',
  2: 'Block',
};

function toConnectorAction(r: Cat_connectoractions): ConnectorAction {
  return {
    id: r.cat_connectoractionid,
    connectorId: r._cat_connectorid_value ?? '',
    actionName: r.cat_actionname,
    actionKey: r.cat_actionkey,
    actionDescription: r.cat_actiondescription,
    actionStatus: ACTION_STATUS_MAP[Number(r.cat_actionstatus)] ?? 'Unknown',
    isActive: !!(r.cat_isactive as unknown),
    blockedByAdmin: !!((r as unknown as Record<string, unknown>).cat_blockedbyadmin),
  };
}

/**
 * Retrieves all active actions for a given connector, ordered by action name.
 * cat_isactive is Edm.Boolean — filter with `eq true`.
 */
export async function getConnectorActions(connectorId: string): Promise<ConnectorAction[]> {
  const result = await Cat_connectoractionsService.getAll({
    filter: `_cat_connectorid_value eq ${connectorId} and cat_isactive eq true`,
    orderBy: ['cat_actionname asc'],
    select: [
      'cat_connectoractionid', '_cat_connectorid_value', 'cat_actionname',
      'cat_actionkey', 'cat_actiondescription', 'cat_actionstatus', 'cat_isactive',
    ],
    top: 200,
  });
  return (result.data ?? []).map(toConnectorAction);
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
