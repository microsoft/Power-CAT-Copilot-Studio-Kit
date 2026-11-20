/**
 * Service wrapper for sync status polling from cat_copilotstudiokitlogses.
 * Used to detect when Agent Inventory sync completes so data can be refreshed.
 */
import { Cat_copilotstudiokitlogsesService } from '../../../generated/services/Cat_copilotstudiokitlogsesService';
import type { SyncStatusRecord } from '../contracts/types';

const SELECT: (keyof SyncStatusRecord)[] = [
  'cat_copilotstudiokitlogsid',
  'cat_cloudflowname',
  'cat_syncnotified',
  'cat_executionstatuscode',
  'createdon',
];

export class SyncStatusService {
  /** Fetch the latest unnotified Agent Inventory sync log entry. */
  static async getLatestUnnotified(): Promise<SyncStatusRecord | null> {
    const result = await Cat_copilotstudiokitlogsesService.getAll({
      select: SELECT,
      filter: "contains(cat_cloudflowname,'Agent Inventory') and cat_syncnotified eq false",
      orderBy: ['createdon desc'],
      top: 1,
    });
    if (!result.success) throw new Error(result.error?.message ?? 'Failed to fetch sync status');
    const records = result.data ?? [];
    return records.length > 0 ? (records[0] as unknown as SyncStatusRecord) : null;
  }

  /** Mark a sync log entry as notified. */
  static async markNotified(id: string): Promise<void> {
    const result = await Cat_copilotstudiokitlogsesService.update(id, {
      cat_syncnotified: true as never,
    });
    if (!result.success) throw new Error(result.error?.message ?? 'Failed to mark sync as notified');
  }
}
