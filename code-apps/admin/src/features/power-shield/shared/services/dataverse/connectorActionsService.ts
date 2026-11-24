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
    blockedByAdmin: !!(r.cat_blockedbyadmin as unknown),
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
      'cat_blockedbyadmin',
    ],
    top: 200,
  });
  return (result.data ?? []).map(toConnectorAction);
}
