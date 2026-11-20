/**
 * Service wrapper for the cat_agentdetailses virtual entity (agent inventory).
 *
 * cat_agentdetails is a VIRTUAL ENTITY that caps at 500 records per request.
 * We request a large `top` value and paginate via skipToken when more pages exist.
 */
import { Cat_agentdetailsesService } from '../../../generated/services/Cat_agentdetailsesService';
import type { AgentDetailsRecord } from '../contracts/types';

const SELECT: (keyof AgentDetailsRecord)[] = [
  'cat_agentdetailsid',
  'cat_agentid',
  'cat_name',
  'cat_environmentid',
  'cat_environmentname',
  'cat_poweredbycode',
];

export class AgentDetailsService {
  /**
   * Fetch summary rows for every agent in the inventory.
   * Uses pagination to overcome the virtual entity 500-record cap.
   */
  static async getAll(): Promise<AgentDetailsRecord[]> {
    const result = await Cat_agentdetailsesService.getAll({
      select: SELECT,
      top: 5000,
    });
    if (!result.success) throw new Error(result.error?.message ?? 'Failed to fetch agent details');

    const allRecords = [...(result.data ?? [])];

    let skipToken = result.skipToken;
    while (skipToken) {
      const nextResult = await Cat_agentdetailsesService.getAll({
        select: SELECT,
        top: 5000,
        skipToken,
      });
      if (!nextResult.success) {
        throw new Error(nextResult.error?.message ?? 'Failed to fetch all agent details pages');
      }
      const page = nextResult.data ?? [];
      allRecords.push(...page);
      skipToken = page.length > 0 ? nextResult.skipToken : undefined;
    }

    return allRecords.map((r) => ({
      cat_agentdetailsid: r.cat_agentdetailsid,
      cat_agentid: r.cat_agentid,
      cat_name: r.cat_name,
      cat_environmentid: r.cat_environmentid,
      cat_environmentname: r.cat_environmentname,
      cat_poweredbycode: r.cat_poweredbycode === undefined ? undefined : Number(r.cat_poweredbycode),
    }));
  }
}
