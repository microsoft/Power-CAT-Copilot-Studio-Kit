import type { BotComponent, IStageAService, LocalPattern, LocalStageAOutput, ParsedBotData } from '../models/types.js';
/**
 * Standalone Stage A service.
 */
export declare class StageAService implements IStageAService {
    /**
     * Execute Stage A from pre-parsed ZIP data.
     */
    executeStageAFromData(botMetadata: {
        botId: string;
        name: string;
        description?: string;
    }, components: BotComponent[]): Promise<LocalStageAOutput>;
    /**
     * Generate local patterns from parsed bot data.
     */
    generateLocalPatterns(botData: ParsedBotData): LocalPattern[];
    /**
     * Count components by type.
     */
    countComponentsByType(components: BotComponent[], componentType: string): number;
    private parseBotComponents;
}
export declare const stageAService: StageAService;
