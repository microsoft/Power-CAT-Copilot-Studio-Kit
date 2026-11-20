/**
 * AgentTemplateService — maps the `cat_agenttemplate` Dataverse table to the
 * Agent Library (`../library`) AgentTemplate contract and provides create/edit +
 * file streaming for the Admin app.
 *
 * The solution ZIP lives in the `cat_templatefile` file column; row data is
 * fetched up front and the ZIP bytes are streamed lazily via `getZipBytes`.
 */

import { getClient } from '@microsoft/power-apps/data';
import { dataSourcesInfo } from '../../../../.power/schemas/appschemas/dataSourcesInfo';
import { Cat_agenttemplatesService } from '../../../generated/services/Cat_agenttemplatesService';
import type { Cat_agenttemplates, Cat_agenttemplatesBase } from '../../../generated/models/Cat_agenttemplatesModel';
import { paginatedFetchAll } from '../../../shared/services/paginatedFetchAll';
import { resolveAccentGradient } from '../library';
import type { AgentTemplate, TemplateSubmitValues } from '../library';

/** Data source / entity-set name (matches the generated service's dataSourceName). */
const TABLE = 'cat_agenttemplates';
const FILE_COLUMN = 'cat_templatefile';

const client = getClient(dataSourcesInfo);

/** Columns needed to render and edit a custom template. */
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

// --- Choice-code maps (codes confirmed from the generated model) -----------
const AGENT_TYPE_CUSTOM = 335350000;
const AGENT_TYPE_DECLARATIVE = 335350001;
const PUBLISH_ACTIVE = 335350000;
const PUBLISH_INACTIVE = 335350001;

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
    // Render the Fluent glyph on the admin-chosen accent gradient (no iconSvg).
    iconGradient: resolveAccentGradient(t.cat_accentcolor),
    accent: t.cat_accentcolor || undefined,
    publishStatus: t.cat_publishstatus === PUBLISH_INACTIVE ? 'inactive' : 'active',
    learnMoreUrl: t.cat_learnmoreurl || undefined,
    setupGuideUrl: t.cat_setupguideurl || undefined,
    templateFileName: t.cat_templatefile_name || undefined,
    getZipBytes: hasFile ? () => getTemplateFileBytes(t.cat_agenttemplateid) : undefined,
  };
}

/** Map form values to a Dataverse write payload (ownerid/statecode auto-populated). */
function toPayload(v: TemplateSubmitValues): Omit<Cat_agenttemplatesBase, 'cat_agenttemplateid'> {
  return {
    cat_name: v.name,
    cat_description: v.description || undefined,
    cat_agenttype: (v.agentType === 'declarative' ? AGENT_TYPE_DECLARATIVE : AGENT_TYPE_CUSTOM) as Cat_agenttemplatesBase['cat_agenttype'],
    cat_icon: v.icon,
    cat_accentcolor: v.accent,
    cat_publishstatus: (v.publishStatus === 'inactive' ? PUBLISH_INACTIVE : PUBLISH_ACTIVE) as Cat_agenttemplatesBase['cat_publishstatus'],
    // Learn More / Setup Guide are optional. Send `null` (not `undefined`) when
    // blank so an OData PATCH actively clears any existing URL — an omitted
    // field leaves the stored value unchanged, which is why cleared URLs failed
    // to persist on edit.
    cat_learnmoreurl: v.learnMoreUrl || null,
    cat_setupguideurl: v.setupGuideUrl || null,
  } as Omit<Cat_agenttemplatesBase, 'cat_agenttemplateid'>;
}

async function uploadTemplateFile(id: string, file: File): Promise<void> {
  const result = await Cat_agenttemplatesService.upload(id, FILE_COLUMN, file, file.name);
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to upload template file');
  }
}

export class AgentTemplateService {
  /** All custom templates regardless of publish status (admins manage drafts). */
  static async listAll(): Promise<AgentTemplate[]> {
    const records = await paginatedFetchAll(
      Cat_agenttemplatesService.getAll.bind(Cat_agenttemplatesService),
      { select: SELECT, filter: 'statecode eq 0' },
    );
    return records.map(mapToAgentTemplate);
  }

  /** Create a template row, then upload its solution ZIP. Returns the new id. */
  static async create(values: TemplateSubmitValues, file: File): Promise<string> {
    const result = await Cat_agenttemplatesService.create(toPayload(values));
    if (!result.success) {
      throw new Error(result.error?.message ?? 'Failed to create template');
    }
    const id = result.data!.cat_agenttemplateid;
    await uploadTemplateFile(id, file);
    return id;
  }

  /** Update a template row; re-upload the ZIP only when a new file is provided. */
  static async update(id: string, values: TemplateSubmitValues, file?: File): Promise<void> {
    const result = await Cat_agenttemplatesService.update(id, toPayload(values));
    if (!result.success) {
      throw new Error(result.error?.message ?? 'Failed to update template');
    }
    if (file) {
      await uploadTemplateFile(id, file);
    }
  }

  /** Permanently delete a template row (the attached solution ZIP goes with it). */
  static async delete(id: string): Promise<void> {
    await Cat_agenttemplatesService.delete(id);
  }
}
