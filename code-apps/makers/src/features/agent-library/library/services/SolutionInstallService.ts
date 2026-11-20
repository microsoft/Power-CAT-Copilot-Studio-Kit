/**
 * SolutionInstallService — Installs solutions via ImportSolutionAsync.
 *
 * Two entry points:
 * 1. installSolution() — for components: downloads ZIP from aka.ms URL via
 *    Custom API (cat_DownloadSolutionBasedOnUrl), then imports to current env.
 * 2. installFromBase64() — for agent templates: takes a pre-downloaded base64
 *    ZIP (possibly rewritten) and imports with optional ComponentParameters.
 */

import type { PowerAppsClient, ComponentTemplate, ConnectionComponentParam, InstallSolutionResult } from '../contracts/types';
import { downloadSolutionAsBase64 } from './SolutionZipService';

const DEBUG = true;
const debug = (...args: unknown[]) => { if (DEBUG) console.log('[SolutionInstall]', ...args); };

const POLL_INTERVAL_MS = 1_000;
const MAX_POLL_ATTEMPTS = 300; // 300 × 1s = 5 minutes

interface ImportJobRecord {
  importjobid: string;
  progress: number;
  data: string;
  completedon?: string;
}

interface ODataResponse {
  value: ImportJobRecord[];
}

interface SdkResult {
  success: boolean;
  data: ODataResponse;
}

/** Parses the importjob.data XML field to determine success or failure. */
function parseImportJobData(dataXml: string): { success: boolean; errorMessage?: string } {
  if (!dataXml) {
    return { success: false, errorMessage: 'Import job returned empty data.' };
  }
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(dataXml, 'text/xml');

    const root = doc.documentElement;
    const succeeded = root.getAttribute('succeeded');
    if (succeeded === 'failure') {
      const status = root.getAttribute('status') ?? '';
      const resultNodes = doc.querySelectorAll('result[result="failure"]');
      for (const node of resultNodes) {
        const errorText = node.getAttribute('errortext');
        if (errorText) {
          return { success: false, errorMessage: errorText };
        }
      }
      return { success: false, errorMessage: status || 'Import failed.' };
    }

    const failureResults = doc.querySelectorAll('result[result="failure"]');
    if (failureResults.length > 0) {
      const errorText = failureResults[0].getAttribute('errortext');
      return { success: false, errorMessage: errorText ?? 'Import failed.' };
    }

    return { success: true };
  } catch {
    return { success: false, errorMessage: 'Could not parse import job result.' };
  }
}

/** Maps known Dataverse error codes to user-friendly messages. */
function mapErrorMessage(raw: string): string {
  if (raw.includes('0x80040220')) {
    return 'Insufficient permissions. Contact your environment administrator.';
  }
  if (raw.includes('connection reference')) {
    return 'This solution requires an external connection that must be configured manually.';
  }
  if (raw.includes('duplicate key') || raw.includes('Cannot insert duplicate key')) {
    return 'This component is already installed in this environment. If you need to update it, uninstall the existing version first.';
  }
  return raw || 'An unexpected error occurred during installation.';
}

/** Synthetic progress emitted before real data arrives (ramps 0→10% over ~5s) */
const SYNTHETIC_PROGRESS = [2, 4, 6, 8, 10];

/** Polls the importjobs entity until progress >= 100 or timeout. */
async function pollImportJob(client: PowerAppsClient, importJobId: string, organization = 'current', onProgress?: (pct: number) => void): Promise<InstallSolutionResult> {
  let realProgressReceived = false;

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    // Emit synthetic progress on early attempts before real data arrives
    if (!realProgressReceived && attempt < SYNTHETIC_PROGRESS.length) {
      onProgress?.(SYNTHETIC_PROGRESS[attempt]);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    debug(`Poll attempt ${attempt + 1}/${MAX_POLL_ATTEMPTS} for job ${importJobId}`);

    try {
      const result = await client.executeAsync<Record<string, string>, ODataResponse>({
        connectorOperation: {
          tableName: 'commondataserviceforapps',
          operationName: 'ListRecordsWithOrganization',
          parameters: {
            organization,
            entityName: 'importjobs',
            $select: 'importjobid,progress,data,completedon',
            $filter: `importjobid eq '${importJobId}'`,
          },
        },
      });

      const sdkResult = result as unknown as SdkResult;
      const records = sdkResult.data?.value ?? [];

      if (records.length === 0) {
        debug('No import job record yet, retrying...');
        continue;
      }

      const job = records[0];
      debug(`Job progress: ${job.progress}%, completed: ${job.completedon ?? 'no'}`);
      realProgressReceived = true;
      onProgress?.(Math.min(job.progress, 100));

      if (job.progress >= 100 || job.completedon) {
        debug('Import complete, parsing result...');
        return parseImportJobData(job.data);
      }
    } catch (pollErr) {
      if (DEBUG) console.warn('[SolutionInstall] Poll query error:', pollErr);
    }
  }

  return {
    success: false,
    errorMessage: 'Installation timed out after 5 minutes. Please try again or install manually.',
  };
}

/**
 * Installs a component solution into the current environment.
 *
 * Flow: Download ZIP from aka.ms URL via Custom API → ImportSolutionAsync → poll.
 */
export async function installSolution(
  client: PowerAppsClient,
  component: ComponentTemplate,
  importJobId: string,
  onProgress?: (pct: number) => void,
): Promise<InstallSolutionResult> {
  debug('Starting install for:', component.name, 'jobId:', importJobId);

  // Step 1: Download ZIP from aka.ms URL via Custom API
  let customizationFile: string;
  try {
    debug('Downloading solution from:', component.zipUrl);
    customizationFile = await downloadSolutionAsBase64(client, component.zipUrl);
    debug('Downloaded base64, length:', customizationFile.length);
  } catch (err) {
    if (DEBUG) console.error('[SolutionInstall] Download failed:', err);
    const raw = err instanceof Error ? err.message : String(err);
    return { success: false, errorMessage: `Failed to download solution: ${raw}` };
  }

  // Step 2: Import via ImportSolutionAsync
  try {
    debug('Calling ImportSolutionAsync...');
    await client.executeAsync<Record<string, unknown>, unknown>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName: 'PerformUnboundActionWithOrganization',
        parameters: {
          organization: 'current',
          actionName: 'ImportSolutionAsync',
          item: {
            OverwriteUnmanagedCustomizations: true,
            PublishWorkflows: true,
            CustomizationFile: customizationFile,
            ImportJobId: importJobId,
          },
        },
      },
    });
    debug('ImportSolutionAsync call succeeded');
  } catch (err) {
    if (DEBUG) console.error('[SolutionInstall] ImportSolutionAsync error:', err);
    const raw = err instanceof Error ? err.message : String(err);
    return { success: false, errorMessage: mapErrorMessage(raw) };
  }

  // Step 3: Poll importjobs until complete
  try {
    debug('Starting poll for import job...');
    return await pollImportJob(client, importJobId, 'current', onProgress);
  } catch (err) {
    if (DEBUG) console.error('[SolutionInstall] Poll error:', err);
    const raw = err instanceof Error ? err.message : String(err);
    return { success: false, errorMessage: mapErrorMessage(raw) };
  }
}

/**
 * Imports a solution from a raw base64 ZIP string with optional ComponentParameters.
 * Used by Agent Template import (cross-environment, with connection mapping).
 */
export async function installFromBase64(
  client: PowerAppsClient,
  zipBase64: string,
  importJobId: string,
  componentParameters?: ConnectionComponentParam[],
  organization = 'current',
  onProgress?: (pct: number) => void,
): Promise<InstallSolutionResult> {
  try {
    const item: Record<string, unknown> = {
      OverwriteUnmanagedCustomizations: true,
      PublishWorkflows: true,
      CustomizationFile: zipBase64,
      ImportJobId: importJobId,
    };

    if (componentParameters && componentParameters.length > 0) {
      item.ComponentParameters = componentParameters;
    }

    debug('ImportSolutionAsync request:', {
      importJobId,
      organization,
      zipBase64Length: zipBase64.length,
      componentParametersCount: componentParameters?.length ?? 0,
    });

    await client.executeAsync<Record<string, unknown>, unknown>({
      connectorOperation: {
        tableName: 'commondataserviceforapps',
        operationName: 'PerformUnboundActionWithOrganization',
        parameters: {
          organization,
          actionName: 'ImportSolutionAsync',
          item,
        },
      },
    });

    debug('ImportSolutionAsync response success');
  } catch (err) {
    console.error('[SolutionInstall] ImportSolutionAsync error:', err);
    const raw = err instanceof Error ? err.message : String(err);
    return { success: false, errorMessage: raw };
  }

  // Poll importjobs in the same target environment
  try {
    debug('Starting poll for import job:', importJobId, 'in:', organization);
    return await pollImportJob(client, importJobId, organization, onProgress);
  } catch (err) {
    console.error('[SolutionInstall] Poll error:', err);
    const raw = err instanceof Error ? err.message : String(err);
    return { success: false, errorMessage: raw };
  }
}
