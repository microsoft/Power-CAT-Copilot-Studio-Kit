/**
 * Service wrapper for the cat_errordetailses Dataverse table.
 * Provides typed access to error detail records.
 */
import { Cat_errordetailsesService } from '../../../generated/services/Cat_errordetailsesService';
import type { ErrorDetails } from '../contracts/types';
import { paginatedFetchAll } from './paginatedFetchAll';

const SELECT: (keyof ErrorDetails)[] = [
  'cat_errordetailsid',
  'cat_errordetailsname',
  'cat_errorcode',
  'cat_metricdate',
  'cat_agentname',
  'cat_channelid',
  'cat_datasourcecode',
  'cat_errorcount',
  'cat_dailyaffectedconversations',
  'cat_dailyaffectedusers',
  'cat_totalsessionsforday',
  'cat_affectedtopics',
  'cat_sampleerrormessages',
  'cat_firstoccurence',
  'cat_lastoccurence',
  'cat_sessionid',
  '_cat_agentconfiguration_value',
];

export class ErrorDetailsService {
  /** Fetch all error details, ordered by date ascending. */
  static async getAll(filter?: string): Promise<ErrorDetails[]> {
    return paginatedFetchAll(
      (opts) => Cat_errordetailsesService.getAll(opts),
      { select: SELECT, filter, orderBy: ['cat_metricdate asc'] },
    ) as Promise<ErrorDetails[]>;
  }

  static async hasAny(): Promise<boolean> {
    const result = await Cat_errordetailsesService.getAll({ select: ['cat_errordetailsid'], top: 1 });
    return (result.data?.length ?? 0) > 0;
  }
}
