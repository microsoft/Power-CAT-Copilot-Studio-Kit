import type { Workflows } from '../../../../generated/models/WorkflowsModel';
import { WorkflowsService } from '../../../../generated/services/WorkflowsService';
import {
  INVENTORY_PROCESS_NAMES,
  type InventoryProcess,
  type InventoryProcessName,
} from '../contracts/types';

const PROCESS_NAMES = Object.values(INVENTORY_PROCESS_NAMES);
const SELECT = ['workflowid', 'name', 'statecode', 'statuscode', 'ismanaged', 'category', 'type'];

function toDomain(row: Workflows): InventoryProcess {
  return {
    id: row.workflowid,
    name: row.name as InventoryProcessName,
    stateCode: row.statecode,
    statusCode: row.statuscode,
    isActive: row.statecode === 1 && row.statuscode === 2,
    isManaged: row.ismanaged,
  };
}

export class InventoryProcessService {
  /** Load the supported modern-flow Process records and reject ambiguous names. */
  static async list(): Promise<InventoryProcess[]> {
    const nameFilter = PROCESS_NAMES.map((name) => `name eq '${name.replaceAll("'", "''")}'`).join(' or ');
    const result = await WorkflowsService.getAll({
      select: SELECT,
      filter: `category eq 5 and type eq 1 and (${nameFilter})`,
      top: 20,
    });
    if (!result.success) {
      throw new Error(result.error?.message ?? 'Unable to load Agent Inventory processes.');
    }
    const rows = (result.data ?? []).map(toDomain);
    for (const name of PROCESS_NAMES) {
      const matches = rows.filter((process) => process.name === name);
      if (matches.length !== 1) {
        throw new Error(
          matches.length === 0
            ? `Required process "${name}" was not found.`
            : `Multiple processes named "${name}" were found.`,
        );
      }
    }
    return rows;
  }

  /** Activate or deactivate a supported Process record. */
  static async setActive(process: InventoryProcess, active: boolean): Promise<void> {
    if (process.isManaged) {
      throw new Error(`"${process.name}" is managed and cannot be changed from this app.`);
    }
    const result = await WorkflowsService.update(process.id, {
      statecode: active ? 1 : 0,
      statuscode: active ? 2 : 1,
    });
    if (!result.success) {
      throw new Error(result.error?.message ?? `Unable to update "${process.name}".`);
    }
  }
}
