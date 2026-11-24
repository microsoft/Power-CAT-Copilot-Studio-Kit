import type { BotMetadata } from '../contracts/ReviewResult';
import type { IStageAService, BotComponent, ParsedBotData, LocalPattern } from '../contracts/ServiceContracts';
import type { LocalStageAOutput } from '../contracts/StageOutputs';
import { botService } from './BotService';
import { UnsupportedHarnessError } from '../agents-experience/services/detection';
import { buildLocalPatterns } from '../utils/localPatternBuilder';
import { extractStandardSnapshot } from '../utils/standardSnapshot';

type ReviewBotMetadata = Pick<BotMetadata, 'botId' | 'name' | 'description' | 'configuration' | 'agentSettings'>;

/** Extract the standard-agent snapshot and deterministic checks without making AI calls. */
export class StageAService implements IStageAService {
  /**
   * Read live metadata through the existing service boundary, then use the shared extraction path.
   * Unsupported harness agents stop here; no checks run (issue 947).
   */
  async executeStageA(botId: string, orgUrl?: string | null): Promise<LocalStageAOutput> {
    const metadata = await botService.getBotMetadata(botId, orgUrl);
    if (metadata.harness === 'unsupported') throw new UnsupportedHarnessError();
    const components = await botService.getBotComponents(botId, orgUrl, { throwOnError: true });
    return this.extract(metadata, components, 'live');
  }

  /** Assess supplied ZIP data without accessing its original environment or dependencies. */
  async executeStageAFromData(metadata: ReviewBotMetadata, components: BotComponent[]): Promise<LocalStageAOutput> {
    return this.extract(metadata, components, 'zip');
  }

  /** Generate applicable local checks, preserving legacy callers of this service contract. */
  generateLocalPatterns(botData: ParsedBotData): LocalPattern[] {
    return buildLocalPatterns(botData);
  }

  /** Count the declared component type without mixing semantic resource classifications. */
  countComponentsByType(components: BotComponent[], componentType: string): number {
    return components.filter(component => component.componenttype === componentType).length;
  }

  private extract(metadata: ReviewBotMetadata, components: BotComponent[], source: 'live' | 'zip'): LocalStageAOutput {
    return extractStandardSnapshot(metadata, components, source);
  }
}

export const stageAService = new StageAService();
