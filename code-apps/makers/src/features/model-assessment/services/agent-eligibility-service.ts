/**
 * Decides which agents Model Assessment shows: agents in the app's environment
 * with an active Copilot Studio evaluation test set named with MODELCHECK
 * or a pipeline-enabled Kit Agent Configuration.
 * Eligible agents are tracked automatically, and each agent's engine is kept
 * consistent with what is set up, so makers never add or remove agents by hand.
 */

import { listDataverseRows } from '../../../shared/services/dataversePaging';
import {
  ENTITY_SET,
  type AgentEnginesVM,
  type KitSettingsVM,
  type TrackedAgentVM,
} from '../contracts/model-assessment';
import { addTrackedAgent, listAgentsInCurrentEnv, type DiscoveredAgent } from './agent-discovery-service';
import { saveKitSettings } from './model-assessment-service';

const ORG = 'current';

export interface EligibleAgent extends Omit<DiscoveredAgent, 'harness'>, AgentEnginesVM {
  kitConfigurationIds: string[];
}

export async function listEligibleAgents(): Promise<EligibleAgent[]> {
  const [bots, evaluationSets, kitConfigurations] = await Promise.all([
    listAgentsInCurrentEnv(),
    // Evaluation test sets are type-19 components without a parent; their cases have one.
    listDataverseRows(ORG, 'botcomponents', {
      select: '_parentbotid_value',
      filter: "componenttype eq 19 and statecode eq 0 and _parentbotcomponentid_value eq null"
        + " and contains(name,'MODELCHECK')",
    }),
    listDataverseRows(ORG, ENTITY_SET.kitConfiguration, {
      select: 'cat_copilotconfigurationid,cat_agentidentifier',
      filter: 'cat_ispipelineenabled eq true and statecode eq 0',
      orderby: 'createdon desc',
    }),
  ]);
  const withEvaluations = new Set(evaluationSets.map((row) => String(row['_parentbotid_value'] ?? '').toLowerCase()));
  const configsBySchema = new Map<string, string[]>();
  for (const row of kitConfigurations) {
    const schema = String(row['cat_agentidentifier'] ?? '').toLowerCase();
    const id = row['cat_copilotconfigurationid'];
    if (!schema || typeof id !== 'string') continue;
    configsBySchema.set(schema, [...(configsBySchema.get(schema) ?? []), id]);
  }
  return bots.flatMap((bot) => {
    const harness = bot.harness ?? false;
    const kitConfigurationIds = harness ? [] : configsBySchema.get(bot.schema.toLowerCase()) ?? [];
    const copilot = withEvaluations.has(bot.botId.toLowerCase());
    const kit = kitConfigurationIds.length > 0;
    return copilot || kit ? [{ ...bot, harness, copilot, kit, kitConfigurationIds }] : [];
  });
}

/** Engine settings to save so the agent uses an engine it has; undefined when nothing changes. */
export function engineFix(saved: KitSettingsVM | undefined, agent: EligibleAgent): KitSettingsVM | undefined {
  const enabled = saved?.enabled ?? false;
  const onlyConfiguration = agent.kitConfigurationIds.length === 1 ? agent.kitConfigurationIds[0] : undefined;
  if (enabled && !agent.kit) return { enabled: false };
  if (!enabled && agent.kit && !agent.copilot) {
    return { enabled: true, configurationId: saved?.configurationId ?? onlyConfiguration };
  }
  if (enabled && !saved?.configurationId && onlyConfiguration) {
    return { enabled: true, configurationId: onlyConfiguration };
  }
  return undefined;
}

export interface EligibilitySync {
  /** Engines per Copilot Studio bot id (lowercase); only eligible agents are present. */
  engines: Record<string, AgentEnginesVM>;
  /** Tracked agents were added or updated, so the tracked data must be re-read. */
  changed: boolean;
}

export async function syncEligibleAgents(tracked: readonly TrackedAgentVM[]): Promise<EligibilitySync> {
  const eligible = await listEligibleAgents();
  const trackedByBot = new Map(tracked.flatMap((agent) =>
    agent.copilotAgentId ? [[agent.copilotAgentId.toLowerCase(), agent] as const] : []));
  let changed = false;
  await Promise.allSettled(eligible.map(async (agent) => {
    const existing = trackedByBot.get(agent.botId.toLowerCase());
    if (!existing) {
      const result = await addTrackedAgent(agent, engineFix(undefined, agent));
      if (result.success) changed = true;
      return;
    }
    const fix = engineFix(existing.kit, agent);
    if (fix) {
      await saveKitSettings(existing.id, fix);
      changed = true;
    }
  }));
  return {
    engines: Object.fromEntries(eligible.map((agent) => [
      agent.botId.toLowerCase(),
      { copilot: agent.copilot, kit: agent.kit, harness: agent.harness },
    ])),
    changed,
  };
}
