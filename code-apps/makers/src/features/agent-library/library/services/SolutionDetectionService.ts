/**
 * SolutionDetectionService — Detects which CSK component solutions are installed
 * in the current Power Platform environment, and fetches component collection IDs
 * for deep linking into Copilot Studio.
 *
 * Uses the commondataserviceforapps connector via the Power Apps SDK.
 */

import type { PowerAppsClient, InstalledSolutionsResult } from '../contracts/types';

interface SolutionRecord {
  uniquename: string;
  version: string;
}

interface ComponentCollectionRecord {
  botcomponentcollectionid: string;
  name: string;
}

interface ODataResponse<T> {
  value: T[];
}

interface SdkResult<T> {
  success: boolean;
  data: ODataResponse<T>;
}

/**
 * Queries the Dataverse solutions entity to detect which CSK component
 * solutions are installed, then fetches component collection IDs for deep linking.
 *
 * @param client - Power Apps SDK client
 * @param solutionNames - Unique solution names from the catalog to check.
 * @param componentNames - Copilot Studio component collection names to look up IDs for.
 * @returns Installed solution names and component collection ID map.
 */
export async function detectInstalledSolutions(
  client: PowerAppsClient,
  solutionNames: string[],
  componentNames: string[],
): Promise<InstalledSolutionsResult> {
    if (solutionNames.length === 0) {
      return { installedNames: new Set(), installedVersions: new Map(), componentIds: new Map() };
    }

    const uniqueNames = [...new Set(solutionNames)];
    const solutionFilter = uniqueNames
      .map((name) => `uniquename eq '${name}'`)
      .join(' or ');

    console.log('[SolutionDetection] Querying solutions with filter:', solutionFilter);

    try {
      const result = await client.executeAsync<
        Record<string, string>,
        ODataResponse<SolutionRecord>
      >({
        connectorOperation: {
          tableName: 'commondataserviceforapps',
          operationName: 'ListRecordsWithOrganization',
          parameters: {
            organization: 'current',
            entityName: 'solutions',
            $select: 'uniquename,version',
            $filter: solutionFilter,
          },
        },
      });

      const sdkResult = result as unknown as SdkResult<SolutionRecord>;
      const records: SolutionRecord[] = sdkResult.data?.value ?? [];

      const installedNames = new Set(records.map((r) => r.uniquename));
      const installedVersions = new Map(records.map((r) => [r.uniquename, r.version]));
      console.log('[SolutionDetection] Installed names:', [...installedNames]);
      console.log('[SolutionDetection] Installed versions:', Object.fromEntries(installedVersions));

      const componentIds = await fetchComponentCollectionIds(client, componentNames);

      return { installedNames, installedVersions, componentIds };
    } catch (err) {
      console.error('[SolutionDetection] Error:', err);
      throw err;
    }
  }

/**
 * Queries botcomponentcollections by name to get their IDs for Copilot Studio deep linking.
 * URL pattern: /environments/{envId}/component-collections/{botcomponentcollectionid}
 */
async function fetchComponentCollectionIds(
  client: PowerAppsClient,
  componentNames: string[],
): Promise<Map<string, string>> {
    if (componentNames.length === 0) {
      return new Map();
    }

    const filter = componentNames
      .map((name) => `name eq '${name}'`)
      .join(' or ');

    console.log('[SolutionDetection] Querying botcomponentcollections for IDs:', filter);

    try {
      const result = await client.executeAsync<
        Record<string, string>,
        ODataResponse<ComponentCollectionRecord>
      >({
        connectorOperation: {
          tableName: 'commondataserviceforapps',
          operationName: 'ListRecordsWithOrganization',
          parameters: {
            organization: 'current',
            entityName: 'botcomponentcollections',
            $select: 'botcomponentcollectionid,name',
            $filter: filter,
          },
        },
      });

      const sdkResult = result as unknown as SdkResult<ComponentCollectionRecord>;
      const records: ComponentCollectionRecord[] = sdkResult.data?.value ?? [];

      const idMap = new Map<string, string>();
      for (const rec of records) {
        idMap.set(rec.name, rec.botcomponentcollectionid);
      }
      console.log('[SolutionDetection] Component collection IDs:', Object.fromEntries(idMap));
      return idMap;
    } catch (err) {
      console.warn('[SolutionDetection] Failed to fetch component collection IDs:', err);
      return new Map();
    }
}
