import type {
  InventoryProcess,
  SaveOperationResult,
  SettingsSaveRequest,
  SettingsSaveResult,
} from '../contracts/types';
import { INVENTORY_PROCESS_NAMES } from '../contracts/types';
import { requireProcess, settingsEqual } from '../utils/settingsUtils';
import { EnvironmentGroupService } from './EnvironmentGroupService';
import { InventoryProcessService } from './InventoryProcessService';
import { InventorySettingsService } from './InventorySettingsService';

async function operation(
  key: string,
  label: string,
  action: () => Promise<void>,
): Promise<SaveOperationResult> {
  try {
    await action();
    return { key, label, status: 'succeeded' };
  } catch (error) {
    return {
      key,
      label,
      status: 'failed',
      message: error instanceof Error ? error.message : 'Unknown save error.',
    };
  }
}

function processChanges(request: SettingsSaveRequest): Array<{
  process: InventoryProcess;
  active: boolean;
}> {
  const changes: Array<{ process: InventoryProcess; active: boolean }> = [];
  const auto = requireProcess(request.baseline.processes, INVENTORY_PROCESS_NAMES.autoSync);
  if (auto.isActive !== request.draft.autoSyncEnabled) {
    changes.push({ process: auto, active: request.draft.autoSyncEnabled });
  }
  for (const name of [
    INVENTORY_PROCESS_NAMES.usage,
    INVENTORY_PROCESS_NAMES.usageChild,
    INVENTORY_PROCESS_NAMES.usageGrandChild,
  ]) {
    const process = requireProcess(request.baseline.processes, name);
    if (process.isActive !== request.draft.usageEnabled) {
      changes.push({ process, active: request.draft.usageEnabled });
    }
  }
  return changes;
}

export class SettingsSaveService {
  /** Persist changed settings, group enablement, and Process activation with per-operation results. */
  static async save(request: SettingsSaveRequest): Promise<SettingsSaveResult> {
    const operations: Promise<SaveOperationResult>[] = [];
    if (!settingsEqual(request.baseline.settings, request.draft.settings)) {
      operations.push(operation(
        'settings',
        'Inventory settings',
        () => InventorySettingsService.save(request.draft.settings),
      ));
    }

    const desiredGroups = new Set(request.draft.enabledGroupIds);
    for (const group of request.baseline.groups) {
      const desired = desiredGroups.has(group.id);
      if (desired !== group.enabled) {
        operations.push(operation(
          `group:${group.id}`,
          `Environment group: ${group.name}`,
          () => EnvironmentGroupService.setEnabled(group.id, desired),
        ));
      }
    }

    for (const change of processChanges(request)) {
      operations.push(operation(
        `process:${change.process.id}`,
        change.process.name,
        () => InventoryProcessService.setActive(change.process, change.active),
      ));
    }

    const results = await Promise.all(operations);
    const failed = results.filter((result) => result.status === 'failed').length;
    return {
      operations: results,
      succeeded: failed === 0,
      partiallySucceeded: failed > 0 && failed < results.length,
    };
  }
}
