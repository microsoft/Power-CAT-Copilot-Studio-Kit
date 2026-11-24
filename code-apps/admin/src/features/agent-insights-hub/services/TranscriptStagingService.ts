/**
 * Service wrapper for the cat_agentinsightstranscriptstagings Dataverse table.
 * Provides typed access to transcript staging records.
 *
 * NOTE: This is a Virtual Entity — it does NOT support $select, $orderby, or $top.
 * Only $filter is passed; sorting is done client-side.
 */
import { Cat_agentinsightstranscriptstagingsService } from '../../../generated/services/Cat_agentinsightstranscriptstagingsService';
import type { TranscriptStaging } from '../contracts/types';

export class TranscriptStagingService {
  /** Fetch transcript staging records. Virtual entity — minimal OData options only. */
  static async getAll(filter?: string): Promise<TranscriptStaging[]> {
    // Virtual entities may reject any OData options. Pass filter only when set.
    const options = filter ? { filter } : undefined;
    const result = await Cat_agentinsightstranscriptstagingsService.getAll(options);
    if (!result.success) {
      console.error('[TranscriptStagingService] Query failed:', result.error);
      throw new Error(result.error?.message ?? 'Failed to fetch transcript staging');
    }
    const records = (result.data ?? []) as TranscriptStaging[];
    // Client-side sort since virtual entities don't support $orderby
    return records.sort((a, b) =>
      (b.createdon ?? '').localeCompare(a.createdon ?? '')
    );
  }
}
