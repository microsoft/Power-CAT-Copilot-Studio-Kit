import type { BlockedConnector } from '../../../models/blockedConnector';
import { dataSourcesInfo } from '../../../../../../.power/schemas/appschemas/dataSourcesInfo';
import { getClient } from '@microsoft/power-apps/data';

const dvClient = getClient(dataSourcesInfo);
const TABLE = 'cat_powershieldblockedconnectorses';

interface BlockedConnectorRecord {
  cat_powershieldblockedconnectorsid: string;
  cat_name?: string;
  cat_connectorkey?: string;
  cat_publishername?: string;
  cat_blockreason?: string;
  cat_isnonblockable?: boolean;
  cat_lastsyncedon?: string;
  createdon?: string;
  [key: string]: unknown;
}

export async function getBlockedConnectors(): Promise<BlockedConnector[]> {
  const result = await dvClient.retrieveMultipleRecordsAsync<BlockedConnectorRecord>(
    TABLE,
    {
      filter: 'statecode eq 0',
      select: [
        'cat_powershieldblockedconnectorsid', 'cat_name', 'cat_connectorkey',
        'cat_publishername', 'cat_blockreason', 'cat_isnonblockable', 'cat_lastsyncedon', 'createdon',
      ],
      orderBy: ['cat_name asc'],
      top: 2000,
    },
  );
  return (result.data ?? []).map(r => ({
    id: r.cat_powershieldblockedconnectorsid,
    name: r.cat_name ?? '',
    connectorKey: r.cat_connectorkey ?? '',
    publisherName: r.cat_publishername,
    blockReason: r.cat_blockreason,
    isNonBlockable: !!(r.cat_isnonblockable as unknown),
    lastSyncedOn: r.cat_lastsyncedon,
    createdOn: r.createdon,
  }));
}

export async function createBlockedConnector(payload: {
  name: string;
  connectorId: string;
  connectorKey?: string;
  publisherName?: string;
  blockReason?: string;
}): Promise<void> {
  await dvClient.createRecordAsync(TABLE, {
    cat_name: payload.name,
    'cat_Connector@odata.bind': `/cat_connectors(${payload.connectorId})`,
    ...(payload.connectorKey ? { cat_connectorkey: payload.connectorKey } : {}),
    ...(payload.publisherName ? { cat_publishername: payload.publisherName } : {}),
    ...(payload.blockReason ? { cat_blockreason: payload.blockReason } : {}),
  });
}

export async function updateBlockedConnector(
  id: string,
  payload: {
    name: string;
    connectorKey?: string;
    publisherName?: string;
    blockReason?: string;
  },
): Promise<void> {
  const changedFields: Record<string, unknown> = {
    cat_name: payload.name,
  };
  if (payload.connectorKey) {
    changedFields.cat_connectorkey = payload.connectorKey;
    changedFields.cat_publishername = null;
  } else if (payload.publisherName) {
    changedFields.cat_publishername = payload.publisherName;
    changedFields.cat_connectorkey = null;
  }
  changedFields.cat_blockreason = payload.blockReason ?? null;
  await dvClient.updateRecordAsync(TABLE, id, changedFields);
}

export async function deleteBlockedConnector(id: string): Promise<void> {
  await dvClient.deleteRecordAsync(TABLE, id);
}

