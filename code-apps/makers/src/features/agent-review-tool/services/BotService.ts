/**
 * BotService
 *
 * Wraps BotsService and BotcomponentsService with business logic for reading bot data.
 * Implements IBotService interface from ServiceContracts.ts
 */

import { BotsService } from '../../../generated/services/BotsService';
import { BotcomponentsService } from '../../../generated/services/BotcomponentsService';
import { MicrosoftDataverseService } from '../../../generated/services/MicrosoftDataverseService';
import type { BotMetadata } from '../contracts/ReviewResult';
import type {
  IBotService,
  BotComponent,
  BotComponentFetchOptions,
  BotSchemaMatch,
} from '../contracts/ServiceContracts';
import { detectAgentHarness, isReviewableAgentConfiguration } from '../agents-experience/services/detection';
import { parseAgentDescription, parseAgentSettings } from '../utils/agentMetadata';

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * BotService implementation
 *
 * Provides methods for fetching bot and bot component data from Dataverse.
 */
export class BotService implements IBotService {
  /**
   * Get all active bots in the environment
   *
   * Filters by statecode eq 0 (active only).
   *
   * @returns Array of bot metadata
   *
   * @example
   * ```ts
   * const bots = await botService.getAllActiveBots();
   * console.log(`Found ${bots.length} active bots`);
   * ```
   */
  async getAllActiveBots(): Promise<BotMetadata[]> {
    try {
      const result = await BotsService.getAll({
        filter: 'statecode eq 0', // Active bots only
        select: ['botid', 'name', 'statuscode', 'componentidunique', 'modifiedon', 'createdon', 'publishedon', 'iconbase64', 'configuration', 'applicationmanifestinformation', 'language', 'authenticationmode', 'template'],
        orderBy: ['name asc'],
      });

      if (!result.success || !result.data) {
        console.error('Failed to fetch bots:', result.error);
        return [];
      }

      // Gen AI standard agents, Microsoft Copilot agents, and unsupported harness agents (issue 947)
      const generativeBots = result.data.filter((bot) =>
        isReviewableAgentConfiguration(bot.configuration, bot.template),
      );

      // Map to BotMetadata format
      return generativeBots.map((bot) => ({
        botId: bot.botid || '',
        name: bot.name || 'Unnamed Bot',
        statusCode: bot.statuscode || 0,
        componentIdUnique: bot.componentidunique || '',
        modifiedOn: bot.modifiedon ? new Date(bot.modifiedon) : undefined,
        createdOn: bot.createdon ? new Date(bot.createdon) : undefined,
        publishedOn: bot.publishedon ? new Date(bot.publishedon) : undefined,
        iconBase64: bot.iconbase64 || undefined,
        description: parseAgentDescription(bot.applicationmanifestinformation),
        agentSettings: parseAgentSettings(bot.language, bot.authenticationmode, bot.configuration),
        configuration: bot.configuration ?? undefined,
        harness: detectAgentHarness(bot.configuration, bot.template).kind,
      }));
    } catch (error) {
      console.error('Error fetching active bots:', error);
      return [];
    }
  }

  /**
   * Gets the latest publication timestamp for one live bot.
   * Returns null if bot doesn't exist or has no publication timestamp (React Query doesn't allow undefined).
   */
  async getBotPublication(
    botId: string,
    orgUrl?: string | null,
  ): Promise<Date | null> {
    if (!botId) return null;

    if (orgUrl) {
      const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
        orgUrl,
        'bots',
        undefined, undefined, undefined, undefined,
        'publishedon',
        `botid eq ${botId}`,
        undefined,
        undefined,
        undefined,
        1,
      );
      if (!result.success || !result.data) {
        throw new Error(result.error?.message ?? 'Unable to load the current bot publication.');
      }
      const rows = (result.data as { value?: Array<{ publishedon?: string }> }).value ?? [];
      return rows[0]?.publishedon ? new Date(rows[0].publishedon) : null;
    }

    const result = await BotsService.get(botId, { select: ['publishedon'] });
    if (!result.success || !result.data) {
      throw new Error(result.error?.message ?? 'Unable to load the current bot publication.');
    }
    return result.data.publishedon ? new Date(result.data.publishedon) : null;
  }

  /**
   * Resolve an active, published bot by exact schema name.
   *
   * Duplicate matches are rejected because choosing one would make a connected-agent
   * expansion nondeterministic.
   */
  async getBotBySchemaName(
    schemaName: string,
    orgUrl?: string | null,
  ): Promise<BotSchemaMatch | null> {
    const normalizedSchemaName = schemaName.trim();
    if (!normalizedSchemaName) throw new Error('Connected agent schema name is required.');

    const filter =
      `schemaname eq '${escapeODataString(normalizedSchemaName)}' and statecode eq 0 and componentstate eq 0`;
    let items: Array<{
      botid?: string;
      name?: string;
      schemaname?: string;
      configuration?: string;
    }>;

    if (orgUrl) {
      const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
        orgUrl,
        'bots',
        undefined, undefined, undefined, undefined,
        'botid,name,schemaname,configuration',
        filter,
        'modifiedon desc',
        undefined,
        undefined,
        2,
      );
      if (!result.success || !result.data) {
        throw new Error(`Unable to resolve connected agent "${normalizedSchemaName}".`);
      }
      items = ((result.data as { value?: typeof items }).value) ?? [];
    } else {
      const result = await BotsService.getAll({
        filter,
        select: ['botid', 'name', 'schemaname', 'configuration'],
        orderBy: ['modifiedon desc'],
        top: 2,
      });
      if (!result.success || !result.data) {
        throw new Error(`Unable to resolve connected agent "${normalizedSchemaName}".`);
      }
      items = result.data;
    }

    if (items.length === 0) return null;
    if (items.length > 1) {
      throw new Error(
        `Connected agent schema "${normalizedSchemaName}" matched multiple active published bots.`,
      );
    }

    const [bot] = items;
    if (!bot.botid || !bot.schemaname) {
      throw new Error(`Connected agent "${normalizedSchemaName}" is missing required identity fields.`);
    }
    return {
      botId: bot.botid,
      name: bot.name?.trim() || normalizedSchemaName,
      schemaName: bot.schemaname,
      configuration: bot.configuration ?? '',
    };
  }

  /**
   * Get the raw `configuration` JSON string of a bot (spec 013).
   * Used by the Microsoft Copilot harness parser, which reads the `agentSettings` block.
   *
   * @param botId - Bot unique identifier
   * @param orgUrl - Optional cross-environment organization URL.
   * @returns The raw configuration string, or '' if unavailable.
   */
  async getBotConfiguration(botId: string, orgUrl?: string | null): Promise<string> {
    return (await this.getBotHarnessSource(botId, orgUrl)).configuration;
  }

  /**
   * Get the raw `configuration` JSON string and the `template` of a bot.
   * One request reads both values, because the harness check needs both (issue 947, rule 2).
   *
   * @param botId - Bot unique identifier
   * @param orgUrl - Optional cross-environment organization URL.
   * @returns The configuration ('' if unavailable) and the template (undefined if unavailable).
   */
  async getBotHarnessSource(
    botId: string,
    orgUrl?: string | null,
  ): Promise<{ configuration: string; template?: string }> {
    try {
      let row: { configuration?: unknown; template?: unknown } | undefined;
      if (orgUrl) {
        const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
          orgUrl,
          'bots',
          undefined, undefined, undefined, undefined,
          'configuration,template',
          `botid eq ${botId}`,
          undefined,
          undefined,
          undefined,
          1,
        );
        if (!result.success || !result.data) return { configuration: '' };
        row = ((result.data as { value?: Array<{ configuration?: unknown; template?: unknown }> }).value)?.[0];
      } else {
        const result = await BotsService.get(botId, { select: ['configuration', 'template'] });
        if (!result.success || !result.data) return { configuration: '' };
        row = result.data as { configuration?: unknown; template?: unknown };
      }
      const configuration = typeof row?.configuration === 'string' ? row.configuration : '';
      return typeof row?.template === 'string'
        ? { configuration, template: row.template }
        : { configuration };
    } catch (error) {
      console.error('Error fetching bot configuration:', error);
      return { configuration: '' };
    }
  }

  /**
   * Get the agent authentication mode (bot column `authenticationmode`).
   * The Microsoft Copilot review uses it to check tools that need user sign-in.
   *
   * @param botId - Bot unique identifier
   * @param orgUrl - Optional cross-environment organization URL.
   * @returns The mode, or undefined when it is missing, is not a whole number, or cannot be read.
   */
  async getBotAuthenticationMode(botId: string, orgUrl?: string | null): Promise<number | undefined> {
    try {
      let value: unknown;
      if (orgUrl) {
        const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
          orgUrl,
          'bots',
          undefined, undefined, undefined, undefined,
          'authenticationmode',
          `botid eq ${botId}`,
          undefined,
          undefined,
          undefined,
          1,
        );
        if (!result.success || !result.data) return undefined;
        const rows = ((result.data as { value?: Array<{ authenticationmode?: unknown }> }).value) ?? [];
        value = rows[0]?.authenticationmode;
      } else {
        const result = await BotsService.get(botId, { select: ['authenticationmode'] });
        if (!result.success || !result.data) return undefined;
        value = (result.data as { authenticationmode?: unknown }).authenticationmode;
      }
      return Number.isInteger(value) ? value as number : undefined;
    } catch (error) {
      console.error('Error fetching bot authentication mode:', error);
      return undefined;
    }
  }

  /**
   * Get bot components (YAML configuration) for a bot
   *
   * @param botId - Bot unique identifier
   * @returns Array of bot component records
   *
   * @example
   * ```ts
   * const components = await botService.getBotComponents(botId);
   * const yamlComponents = components.filter(c => c.componenttype === 'BotTopic');
   * ```
   */
  async getBotComponents(
    botId: string,
    orgUrl?: string | null,
    options?: BotComponentFetchOptions,
  ): Promise<BotComponent[]> {
    try {
      let items: Record<string, unknown>[];

      if (orgUrl) {
        const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
          orgUrl,
          'botcomponents',
          undefined, undefined, undefined, undefined,
          'botcomponentid,name,description,componenttype,content,data,componentidunique,schemaname,modifiedon,_parentbotcomponentid_value,filedata_name',
          `_parentbotid_value eq ${botId}`,
          'name asc',
        );
        if (!result.success || !result.data) {
          console.error('Failed to fetch bot components from org:', result.error);
          if (options?.throwOnError) {
            throw new Error(`Unable to load botcomponents for bot ${botId}.`);
          }
          return [];
        }
        items = ((result.data as { value?: Record<string, unknown>[] }).value) ?? [];
      } else {
        const result = await BotcomponentsService.getAll({
          filter: `_parentbotid_value eq ${botId}`,
          select: ['botcomponentid', 'name', 'description', 'componenttype', 'content', 'data', 'componentidunique', 'schemaname', 'modifiedon', '_parentbotcomponentid_value', 'filedata_name'],
          orderBy: ['name asc'],
        });
        if (!result.success || !result.data) {
          console.error('Failed to fetch bot components:', result.error);
          if (options?.throwOnError) {
            throw new Error(`Unable to load botcomponents for bot ${botId}.`);
          }
          return [];
        }
        items = result.data as unknown as Record<string, unknown>[];
      }

      // Map basic fields first (content may be empty in list response — Dataverse truncates large memo fields)
      const mapped = items.map((component) => ({
        botcomponentid: (component['botcomponentid'] as string) || '',
        botid: botId,
        componenttype: String(component['componenttype'] || ''),
        content: (component['content'] as string) || '',
        data: (component['data'] as string) || undefined,
        name: (component['name'] as string) || '',
        description: (component['description'] as string) || undefined,
        componentidunique: (component['componentidunique'] as string) || '',
        schemaname: (component['schemaname'] as string) || '',
        parentbotcomponentid:
          (component['_parentbotcomponentid_value'] as string)
          ?? (component['parentbotcomponentid'] as string)
          ?? undefined,
        filedata_name: (component['filedata_name'] as string) || undefined,
        modifiedon: component['modifiedon']
          ? new Date(component['modifiedon'] as string)
          : undefined,
      }));

      // Fetch full content individually for components that have empty content
      // Dataverse OData list queries omit large memo fields — individual get returns full content
      const enriched = await Promise.all(
        mapped.map(async (component) => {
          // Always fetch full record for type 15 (CustomGPT) — instructions may be in data field even when content is present
          const needsFullFetch = component.componenttype !== '14' && (
            component.componenttype === '15'
              ? !component.data
              : !component.content && !component.data
          );
          if (!needsFullFetch) return component;
          if (!component.botcomponentid) {
            if (options?.throwOnError) {
              throw new Error('Unable to load botcomponent details because its identity is missing.');
            }
            return component;
          }
          try {
            let raw: Record<string, unknown> | undefined;
            if (orgUrl) {
              const detail = await MicrosoftDataverseService.ListRecordsWithOrganization(
                orgUrl,
                'botcomponents',
                undefined, undefined, undefined, undefined,
                'content,data',
                `botcomponentid eq ${component.botcomponentid}`,
                undefined,
                undefined,
                undefined,
                1,
              );
              if (!detail.success || !detail.data) {
                if (options?.throwOnError) {
                  throw new Error(
                    `Unable to load botcomponent details for ${component.botcomponentid}.`,
                  );
                }
                return component;
              }
              raw = ((detail.data as { value?: Record<string, unknown>[] }).value)?.[0];
            } else {
              const detail = await BotcomponentsService.get(component.botcomponentid, {
                select: ['content', 'data'],
              });
              if (!detail.success) {
                if (options?.throwOnError) {
                  throw new Error(
                    `Unable to load botcomponent details for ${component.botcomponentid}.`,
                  );
                }
                return component;
              }
              raw = detail.data as unknown as Record<string, unknown> | undefined;
            }
            if (!raw && options?.throwOnError) {
              throw new Error(
                `Unable to load botcomponent details for ${component.botcomponentid}.`,
              );
            }
            const contentVal = (raw?.['content'] as string | null) || '';
            const dataVal = (raw?.['data'] as string | null) || '';
            if (contentVal || dataVal) {
              return { ...component, content: contentVal, data: dataVal || undefined };
            }
          } catch (err) {
            console.error('[BotService] individual get failed for', component.botcomponentid, err);
            if (options?.throwOnError) {
              throw err instanceof Error
                ? err
                : new Error(
                    `Unable to load botcomponent details for ${component.botcomponentid}.`,
                  );
            }
          }
          return component;
        })
      );

      return enriched;
    } catch (error) {
      console.error('Error fetching bot components:', error);
      if (options?.throwOnError) {
        throw error instanceof Error
          ? error
          : new Error(`Unable to load botcomponents for bot ${botId}.`);
      }
      return [];
    }
  }

  /**
   * Get full bot metadata including component reference
   *
   * Fetches bot data and determines the main YAML component ID.
   *
   * @param botId - Bot unique identifier
   * @returns Complete bot metadata
   *
   * @example
   * ```ts
   * const botMetadata = await botService.getBotMetadata(botId);
   * console.log(botMetadata.componentIdUnique);
   * ```
   */
  async getBotMetadata(botId: string, orgUrl?: string | null): Promise<BotMetadata> {
    try {
      let bot: { botid?: string; name?: string; statuscode?: number; modifiedon?: string; createdon?: string; applicationmanifestinformation?: string; language?: number; authenticationmode?: number; configuration?: string; template?: string };

      if (orgUrl) {
        const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
          orgUrl,
          'bots',
          undefined, undefined, undefined, undefined,
          'botid,name,statuscode,modifiedon,createdon,applicationmanifestinformation,language,authenticationmode,configuration,template',
          `botid eq ${botId}`,
        );
        if (!result.success || !result.data) {
          throw new Error(`Bot not found in org: ${botId}`);
        }
        const items = ((result.data as { value?: Record<string, unknown>[] }).value) ?? [];
        if (items.length === 0) throw new Error(`Bot not found in org: ${botId}`);
        bot = items[0] as typeof bot;
      } else {
        const botResult = await BotsService.get(botId, {
          select: ['botid', 'name', 'statuscode', 'modifiedon', 'createdon', 'applicationmanifestinformation', 'language', 'authenticationmode', 'configuration', 'template'],
        });
        if (!botResult.success || !botResult.data) {
          throw new Error(`Bot not found: ${botId}`);
        }
        bot = botResult.data as typeof bot;
      }

      // Fetch components to get componentIdUnique
      const components = await this.getBotComponents(botId, orgUrl);

      // Find main configuration component (typically the agent manifest)
      // Look for component type that contains agent configuration
      const mainComponent = components.find(
        (c) =>
          c.componenttype === '1' || // Bot type enum
          c.schemaname?.toLowerCase().includes('manifest')
      );

      return {
        botId: bot.botid || '',
        name: bot.name || 'Unnamed Bot',
        statusCode: bot.statuscode || 0,
        componentIdUnique: mainComponent?.componentidunique || '',
        modifiedOn: bot.modifiedon ? new Date(bot.modifiedon) : undefined,
        createdOn: bot.createdon ? new Date(bot.createdon) : undefined,
        description: parseAgentDescription(bot.applicationmanifestinformation),
        agentSettings: parseAgentSettings(bot.language, bot.authenticationmode, bot.configuration),
        configuration: bot.configuration ?? undefined,
        harness: detectAgentHarness(bot.configuration, bot.template).kind,
      };
    } catch (error) {
      console.error('Error fetching bot metadata:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const botService = new BotService();
