import type { Cat_environmentgroupsesBase } from '../../../../generated/models/Cat_environmentgroupsesModel';
import { Cat_environmentgroupsesService } from '../../../../generated/services/Cat_environmentgroupsesService';
import type { EnvironmentGroup, EnvironmentGroupInput } from '../contracts/types';
import { normalizeEnvironmentIds, parseEnvironmentIds, serializeEnvironmentIds } from '../utils/settingsUtils';

const SELECT = [
  'cat_environmentgroupsid',
  'cat_name',
  'cat_environmentids',
  'cat_environmentcount',
  'cat_isenabled',
  'modifiedon',
];

export class EnvironmentGroupService {
  /** List active environment-group records. */
  static async list(): Promise<EnvironmentGroup[]> {
    const result = await Cat_environmentgroupsesService.getAll({
      select: SELECT,
      filter: 'statecode eq 0',
      orderBy: ['cat_name asc'],
    });
    if (!result.success) {
      throw new Error(result.error?.message ?? 'Unable to load environment groups.');
    }
    return (result.data ?? []).map((row) => ({
      id: row.cat_environmentgroupsid,
      name: row.cat_name,
      environmentIds: parseEnvironmentIds(row.cat_environmentids),
      environmentCount: row.cat_environmentcount ?? 0,
      enabled: row.cat_isenabled ?? false,
      modifiedOn: row.modifiedon,
    }));
  }

  /** Create an environment group. */
  static async create(input: EnvironmentGroupInput): Promise<void> {
    const ids = normalizeEnvironmentIds(input.environmentIds);
    const fields: Partial<Cat_environmentgroupsesBase> = {
      cat_name: input.name.trim(),
      cat_environmentids: serializeEnvironmentIds(ids),
      cat_environmentcount: ids.length,
      cat_isenabled: false,
    };
    const result = await Cat_environmentgroupsesService.create(
      fields as Omit<Cat_environmentgroupsesBase, 'cat_environmentgroupsid'>,
    );
    if (!result.success) {
      throw new Error(result.error?.message ?? 'Unable to create the environment group.');
    }
  }

  /** Update an environment group's membership. */
  static async update(input: EnvironmentGroupInput): Promise<void> {
    if (!input.id) throw new Error('Environment group ID is required for update.');
    const ids = normalizeEnvironmentIds(input.environmentIds);
    const result = await Cat_environmentgroupsesService.update(input.id, {
      cat_environmentids: serializeEnvironmentIds(ids),
      cat_environmentcount: ids.length,
    });
    if (!result.success) {
      throw new Error(result.error?.message ?? 'Unable to update the environment group.');
    }
  }

  /** Update only the enabled state of an environment group. */
  static async setEnabled(id: string, enabled: boolean): Promise<void> {
    const result = await Cat_environmentgroupsesService.update(id, { cat_isenabled: enabled });
    if (!result.success) {
      throw new Error(result.error?.message ?? 'Unable to update the environment group state.');
    }
  }

  /** Delete an environment group. */
  static async delete(id: string): Promise<void> {
    await Cat_environmentgroupsesService.delete(id);
  }
}
