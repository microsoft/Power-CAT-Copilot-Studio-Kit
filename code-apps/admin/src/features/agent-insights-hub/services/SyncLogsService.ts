/**
 * Service wrapper for the cat_copilotstudiokitlogses Dataverse table.
 * Provides typed access to sync/flow execution logs.
 *
 * Pagination: the Power Apps SDK caps each call at ~500 records, so we use
 * skipToken pagination to retrieve every record. Without this, only the
 * first page is loaded and the Sync Logs grid silently truncates.
 */
import { Cat_copilotstudiokitlogsesService } from '../../../generated/services/Cat_copilotstudiokitlogsesService';
import type { Cat_copilotstudiokitlogses } from '../../../generated/models/Cat_copilotstudiokitlogsesModel';
import type { SyncLog } from '../contracts/types';
import { paginatedFetchAll } from './paginatedFetchAll';

const SELECT: (keyof SyncLog)[] = [
  'cat_copilotstudiokitlogsid',
  'cat_name',
  'createdon',
  'cat_executionstatuscode',
  'cat_cloudflowname',
  'cat_cloudflowinstanceurl',
  'cat_startdate',
  'cat_enddate',
  'cat_flowduration',
  'cat_errormessage',
  '_cat_copilotconfigurationid_value',
];

export class SyncLogsService {
  /** Fetch every sync log record, ordered by creation date descending. */
  static async getAll(filter?: string): Promise<SyncLog[]> {
    const all = await paginatedFetchAll<Cat_copilotstudiokitlogses>(
      (opts) => Cat_copilotstudiokitlogsesService.getAll(opts),
      { select: SELECT, filter, orderBy: ['createdon desc'] },
    );
    return all as unknown as SyncLog[];
  }
}
