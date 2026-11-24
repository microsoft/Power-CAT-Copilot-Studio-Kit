/**
 * Service wrapper for the cat_agentdetailses virtual entity.
 * Uses generated service pattern matching other Dataverse services.
 */
import { Cat_agentdetailsesService } from '../../../generated/services/Cat_agentdetailsesService';
import type { AgentDetails } from '../contracts/types';
import { paginatedFetchAll } from './paginatedFetchAll';
import type { Cat_agentdetailses } from '../../../generated/models/Cat_agentdetailsesModel';

const SELECT: (keyof AgentDetails)[] = [
  'cat_agentdetailsid',
  'cat_name',
  'cat_environmentname',
  'cat_environmentid',
  'cat_agentid',
  'cat_environmenturl',
];

export class AgentDetailsService {
  /**
   * Fetch agent detail records, optionally filtered by search text.
   *
   * Paginates with skipToken so the caller always receives EVERY matching
   * agent — the Power Apps SDK caps each call at ~500 records, and a single
   * call would silently truncate the list, causing downstream name-resolution
   * lookups to fall back to GUIDs. The `top` parameter is retained for
   * back-compat but ignored (we always page through to the end).
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static async search(searchText?: string, _top?: number): Promise<AgentDetails[]> {
    const trimmed = searchText?.trim() ?? '';
    const filter = trimmed
      ? `(contains(cat_name,'${trimmed.replace(/'/g, "''")}') or contains(cat_environmentname,'${trimmed.replace(/'/g, "''")}'))`
      : undefined;

    const all = await paginatedFetchAll<Cat_agentdetailses>(
      (opts) => Cat_agentdetailsesService.getAll(opts),
      { select: SELECT, filter, orderBy: ['cat_name asc'] },
    );
    return all as unknown as AgentDetails[];
  }

  /** Fetch a single agent detail by ID. */
  static async getById(id: string): Promise<AgentDetails | undefined> {
    const result = await Cat_agentdetailsesService.getAll({
      select: SELECT,
      filter: `cat_agentdetailsid eq '${id}'`,
      top: 1,
    });
    if (!result.success) throw new Error(result.error?.message ?? 'Failed to fetch agent details');
    return (result.data ?? [])[0] as AgentDetails | undefined;
  }
}
