/**
 * Service wrapper for the OOB `conversationtranscript` Dataverse table.
 *
 * The table is now registered as a typed Code Apps data source (Phase 4
 * follow-up - the generic Microsoft Dataverse connector `ListRecords`
 * action requires an `organization` parameter that the Code App SDK
 * doesn't populate for cross-table reads). Using the typed service routes
 * through the bound connection cleanly.
 *
 * Field shapes match what the existing `Get the Conversation Transcript`
 * cloud flow uses: filter on `_bot_conversationtranscriptid_value` with the
 * GUID wrapped in single quotes.
 */

import { ConversationtranscriptsService } from '../../../generated/services/ConversationtranscriptsService';
import type { Conversationtranscripts } from '../../../generated/models/ConversationtranscriptsModel';
import { paginatedFetchAll } from '../../../shared/services/paginatedFetchAll';

const SELECT: string[] = [
  'conversationtranscriptid',
  'name',
  'content',
  'createdon',
  '_bot_conversationtranscriptid_value',
];

export interface TranscriptListOptions {
  filter?: string;
  top?: number;
  orderBy?: string[];
}

export class ConversationTranscriptService {
  /** List transcripts via the typed connector. */
  static async list(options: TranscriptListOptions): Promise<Conversationtranscripts[]> {
    return paginatedFetchAll<Conversationtranscripts>(
      (opts) => ConversationtranscriptsService.getAll(opts),
      {
        select: SELECT,
        filter: options.filter,
        orderBy: options.orderBy ?? ['createdon desc'],
        top: options.top,
      },
    );
  }
}
