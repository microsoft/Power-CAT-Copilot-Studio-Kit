/**
 * AgentTemplateService — maps the `cat_agenttemplate` Dataverse table to the
 * Agent Library (`../library`) AgentTemplate contract for the Makers app.
 *
 * Makers see only PUBLISHED (Active) custom templates and cannot author them,
 * so this is read-only: list + map + lazy ZIP streaming. Keep the mapping in
 * sync with the Admin app's copy (the publish-status filter is the only
 * intended difference).
 */

import { getClient } from '@microsoft/power-apps/data';
import { dataSourcesInfo } from '../../../../.power/schemas/appschemas/dataSourcesInfo';
import { Cat_agenttemplatesService } from '../../../generated/services/Cat_agenttemplatesService';
import type { Cat_agenttemplates } from '../../../generated/models/Cat_agenttemplatesModel';
import { paginatedFetchAll } from '../../../shared/services/paginatedFetchAll';
import { resolveAccentGradient } from '../library';
import type { AgentTemplate } from '../library';

/** Data source / entity-set name (matches the generated service's dataSourceName). */
const TABLE = 'cat_agenttemplates';
const FILE_COLUMN = 'cat_templatefile';

const client = getClient(dataSourcesInfo);

const SELECT = [
  'cat_agenttemplateid',
  'cat_name',
  'cat_description',
  'cat_agenttype',
  'cat_icon',
  'cat_accentcolor',
  'cat_publishstatus',
  'cat_learnmoreurl',
  'cat_setupguideurl',
  'cat_templatefile_name',
];

const AGENT_TYPE_DECLARATIVE = 335350001;
const PUBLISH_ACTIVE = 335350000;

/** Stream the solution ZIP bytes for a template record. */
export async function getTemplateFileBytes(recordId: string): Promise<Uint8Array> {
  const result = await client.downloadFileFromRecord(TABLE, recordId, FILE_COLUMN);
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to download template file');
  }
  return new Uint8Array(result.data!);
}

/** Map a Dataverse row to the package's AgentTemplate shape. */
export function mapToAgentTemplate(t: Cat_agenttemplates): AgentTemplate {
  const hasFile = !!t.cat_templatefile_name;
  return {
    id: t.cat_agenttemplateid,
    name: t.cat_name ?? '',
    description: t.cat_description ?? '',
    cardDescription: t.cat_description ?? '',
    type: 'template',
    source: 'custom',
    agentType: t.cat_agenttype === AGENT_TYPE_DECLARATIVE ? 'declarative' : 'custom',
    icon: t.cat_icon || undefined,
    iconGradient: resolveAccentGradient(t.cat_accentcolor),
    accent: t.cat_accentcolor || undefined,
    learnMoreUrl: t.cat_learnmoreurl || undefined,
    setupGuideUrl: t.cat_setupguideurl || undefined,
    templateFileName: t.cat_templatefile_name || undefined,
    getZipBytes: hasFile ? () => getTemplateFileBytes(t.cat_agenttemplateid) : undefined,
  };
}

export class AgentTemplateService {
  /** Published (Active) custom templates only — makers don't see drafts. */
  static async listAll(): Promise<AgentTemplate[]> {
    const records = await paginatedFetchAll(
      Cat_agenttemplatesService.getAll.bind(Cat_agenttemplatesService),
      { select: SELECT, filter: `statecode eq 0 and cat_publishstatus eq ${PUBLISH_ACTIVE}` },
    );
    return records.map(mapToAgentTemplate);
  }
}
