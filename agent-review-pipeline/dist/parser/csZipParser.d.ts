import type { CSZipBot, CSZipParseResult } from '../models/types.js';
/**
 * Converts a parsed ZIP bot to the metadata shape expected by Stage A.
 */
export declare function zipBotToMetadata(bot: CSZipBot): {
    botId: string;
    name: string;
    statusCode: number;
    componentIdUnique: string;
    iconBase64?: string;
};
/**
 * Parse a Copilot Studio solution ZIP buffer into bot and component data.
 */
export declare function parseCSZip(buffer: Buffer): Promise<CSZipParseResult>;
