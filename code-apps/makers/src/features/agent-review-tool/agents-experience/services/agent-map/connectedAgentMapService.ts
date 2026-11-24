import { botService } from '../../../services/BotService';
import type { AgentMapConnectedAgentSnapshot } from '../../contracts/AgentMap';
import {
  loadConnectedAgentMapSnapshotWith,
  type ConnectedAgentBotService,
} from './connectedAgentMapCore';

/**
 * Load one connected agent's current component inventory from the source environment.
 *
 * The logic lives in `connectedAgentMapCore` so hosts outside this app can reuse it without
 * pulling in the generated Dataverse client. This wrapper only supplies the app's own service,
 * keeping the signature callers already depend on.
 */
export async function loadConnectedAgentMapSnapshot(
  targetSchemaName: string,
  orgUrl?: string | null,
  service: ConnectedAgentBotService = botService,
): Promise<AgentMapConnectedAgentSnapshot> {
  return loadConnectedAgentMapSnapshotWith(service, targetSchemaName, orgUrl);
}
