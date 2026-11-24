/**
 * Service wrapper for the cat_agentvalues Dataverse table.
 * Provides typed access to agent value classification records.
 */
import { Cat_agentvaluesService } from '../../../generated/services/Cat_agentvaluesService';
import { paginatedFetchAll } from '../../../shared/services/paginatedFetchAll';
import type { AgentValueRecord } from '../contracts/types';

const SELECT: (keyof AgentValueRecord)[] = [
  'cat_agentvalueid',
  'cat_name',
  'cat_agentid',
  'cat_environmentid',
  'cat_agentvaluebenefit',
  'cat_agenttypes',
  'cat_agentbehaviors',
  'cat_classificationdate',
  'cat_environmentdisplayname',
  'statecode',
  // Optional Agent values list columns.
  'cat_agentdescription',
  'cat_agentinstructions',
  'statuscode',
  'createdon',
  'modifiedon',
  'overriddencreatedon',
  '_ownerid_value',
  '_owningbusinessunit_value',
  '_createdby_value',
  '_createdonbehalfby_value',
  '_modifiedby_value',
  '_modifiedonbehalfby_value',
];

export class AgentValueService {
  /** Fetch all active agent value records using paginated fetch. */
  static async getAll(): Promise<AgentValueRecord[]> {
    const records = await paginatedFetchAll(
      Cat_agentvaluesService.getAll.bind(Cat_agentvaluesService),
      {
        select: SELECT,
        filter: 'statecode eq 0',
      },
    );
    return records as AgentValueRecord[];
  }
}
