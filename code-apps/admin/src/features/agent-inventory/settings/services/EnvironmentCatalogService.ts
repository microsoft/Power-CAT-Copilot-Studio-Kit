import { AgentInventory_EnvironmentDataLoadService } from '../../../../generated/services/AgentInventory_EnvironmentDataLoadService';
import type { EnvironmentCatalogItem } from '../contracts/types';

/** Raw environment object shape returned inside the flow's `environments` JSON string. */
interface FlowEnvironment {
  Id?: string;
  Name?: string;
  Type?: string;
  State?: string;
  Geo?: string;
  Url?: string;
}

function toCatalogItem(env: FlowEnvironment): EnvironmentCatalogItem | null {
  const id = env.Id?.trim();
  if (!id) return null;
  return {
    id,
    name: env.Name?.trim() || id,
    type: env.Type?.trim() || 'Unknown',
    region: env.Geo?.trim() || 'Unknown',
    url: env.Url?.trim() || '',
  };
}

export class EnvironmentCatalogService {
  /**
   * List tenant environments via the "Agent Inventory | Environment Data Load"
   * cloud flow. The flow takes no input and returns the environments as a JSON
   * string under its `environments` output, which is parsed into the catalog
   * shape consumed by the environment-group editor.
   */
  static async list(): Promise<EnvironmentCatalogItem[]> {
    const result = await AgentInventory_EnvironmentDataLoadService.Run({});
    if (!result.success) {
      throw new Error(result.error?.message ?? 'Unable to load tenant environments.');
    }

    const raw = result.data?.environments;
    if (!raw?.trim()) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('Environment data returned by the flow was not valid JSON.');
    }
    if (!Array.isArray(parsed)) {
      throw new Error('Environment data returned by the flow was not a list.');
    }

    return parsed
      .map((env) => toCatalogItem(env as FlowEnvironment))
      .filter((item): item is EnvironmentCatalogItem => item !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}
