import type { IBotService } from '../../../contracts/ServiceContracts';
import type { AgentMapConnectedAgentSnapshot } from '../../contracts/AgentMap';
import { parseAgentsExperience } from '../AgentsExperienceParser';

/**
 * Host-agnostic connected-agent loading.
 *
 * This module is the reusable half of `connectedAgentMapService`. It is deliberately free of any
 * import that reaches `src/generated/**`: the concrete `botService` pulls in `BotsService`,
 * `BotcomponentsService` and `MicrosoftDataverseService`, and a non-React host that imported those
 * would drag the whole generated Dataverse client into its bundle.
 *
 * The caller therefore supplies the service. `connectedAgentMapService` supplies the real one for
 * the Agent Review Tool; another host supplies its own client.
 *
 * Anything added here must keep that property — take collaborators as parameters rather than
 * importing singletons.
 */

/** The narrow slice of the bot service this loader actually needs. */
export type ConnectedAgentBotService = Pick<
  IBotService,
  'getBotBySchemaName' | 'getBotComponents'
>;

/** Load one connected agent's current component inventory from the source environment. */
export async function loadConnectedAgentMapSnapshotWith(
  service: ConnectedAgentBotService,
  targetSchemaName: string,
  orgUrl?: string | null,
): Promise<AgentMapConnectedAgentSnapshot> {
  const schemaName = targetSchemaName.trim();
  if (!schemaName) throw new Error('This connected agent does not declare a target schema.');

  const target = await service.getBotBySchemaName(schemaName, orgUrl);
  if (!target) {
    throw new Error(`No active published agent matched schema "${schemaName}".`);
  }
  const components = await service.getBotComponents(
    target.botId,
    orgUrl,
    { throwOnError: true },
  );
  return {
    agentId: target.botId,
    agentName: target.name,
    agentSchemaName: target.schemaName,
    model: parseAgentsExperience(target.configuration, components),
  };
}
