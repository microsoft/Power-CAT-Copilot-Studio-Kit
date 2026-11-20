/**
 * Service wrapper for the cat_conversationanalyzerprompt Dataverse table.
 *
 * `cat_type` is the OptionSet that distinguishes System (1) from Custom (2)
 * prompts - surfaced as {@link PromptScope} to the UI.
 */

import { Cat_conversationanalyzerpromptsService } from '../../../generated/services/Cat_conversationanalyzerpromptsService';
import type {
  Cat_conversationanalyzerprompts,
  Cat_conversationanalyzerpromptsBase,
} from '../../../generated/models/Cat_conversationanalyzerpromptsModel';
import { paginatedFetchAll } from '../../../shared/services/paginatedFetchAll';
import { ConversationAnalyzerService } from './ConversationAnalyzerService';
import {
  PROMPT_TYPE_CUSTOM,
  PROMPT_TYPE_SYSTEM,
  type PromptRow,
  type PromptScope,
  type PromptType,
} from '../contracts/types';

const SELECT: string[] = [
  'cat_conversationanalyzerpromptid',
  'cat_name',
  'cat_displayname',
  'cat_type',
  'cat_userprompt',
  'statecode',
  'createdon',
  'modifiedon',
  '_createdby_value',
  '_modifiedby_value',
];

/** Raw Dataverse shape including lookup fields not in the generated model. */
interface PromptRaw extends Cat_conversationanalyzerprompts {
  _createdby_value?: string;
  _modifiedby_value?: string;
  ['_createdby_value@OData.Community.Display.V1.FormattedValue']?: string;
  ['_modifiedby_value@OData.Community.Display.V1.FormattedValue']?: string;
}

function toPromptScope(type: PromptType | undefined): PromptScope {
  return type === PROMPT_TYPE_SYSTEM ? 'system' : 'custom';
}

function toPromptRow(raw: Cat_conversationanalyzerprompts): PromptRow {
  const r = raw as PromptRaw;
  const type = (r.cat_type ?? PROMPT_TYPE_CUSTOM) as PromptType;
  return {
    id: r.cat_conversationanalyzerpromptid,
    name: r.cat_name,
    displayName: r.cat_displayname,
    type,
    userPrompt: r.cat_userprompt,
    scope: toPromptScope(type),
    createdOn: r.createdon,
    modifiedOn: r.modifiedon,
    createdBy: r['_createdby_value@OData.Community.Display.V1.FormattedValue'] ?? r._createdby_value,
    modifiedBy: r['_modifiedby_value@OData.Community.Display.V1.FormattedValue'] ?? r._modifiedby_value,
    state: r.statecode != null ? Number(r.statecode) : 0,
  };
}

export class ConversationAnalyzerPromptService {
  /** Fetch all prompts, optionally filtered by scope (system/custom). */
  static async list(scope?: PromptScope): Promise<PromptRow[]> {
    const filterParts: string[] = ['statecode eq 0'];
    if (scope === 'system') filterParts.push(`cat_type eq ${PROMPT_TYPE_SYSTEM}`);
    if (scope === 'custom') filterParts.push(`cat_type eq ${PROMPT_TYPE_CUSTOM}`);

    const rows = await paginatedFetchAll<Cat_conversationanalyzerprompts>(
      (opts) => Cat_conversationanalyzerpromptsService.getAll(opts),
      {
        select: SELECT,
        filter: filterParts.join(' and '),
        orderBy: ['cat_displayname asc'],
      },
    );
    return rows.map(toPromptRow);
  }

  /** Fetch a single prompt by id. */
  static async getById(id: string): Promise<PromptRow | undefined> {
    const result = await Cat_conversationanalyzerpromptsService.get(id, { select: SELECT });
    if (!result.success) throw new Error(result.error?.message ?? 'Failed to fetch prompt');
    return result.data ? toPromptRow(result.data) : undefined;
  }

  /** Create a new custom prompt. */
  static async create(fields: { name: string; displayName?: string; userPrompt: string }): Promise<PromptRow> {
    const payload = {
      cat_name: fields.name,
      cat_displayname: fields.displayName,
      cat_type: PROMPT_TYPE_CUSTOM,
      cat_userprompt: fields.userPrompt,
    } as unknown as Omit<Cat_conversationanalyzerpromptsBase, 'cat_conversationanalyzerpromptid'>;

    const result = await Cat_conversationanalyzerpromptsService.create(payload);
    if (!result.success) throw new Error(result.error?.message ?? 'Failed to create prompt');
    if (!result.data) throw new Error('Created prompt data is missing from response');
    return toPromptRow(result.data);
  }

  /** Update an existing prompt. */
  static async update(
    id: string,
    fields: Partial<{ name: string; displayName: string; userPrompt: string }>,
  ): Promise<PromptRow> {
    const payload: Record<string, unknown> = {};
    if (fields.name !== undefined) payload.cat_name = fields.name;
    if (fields.displayName !== undefined) payload.cat_displayname = fields.displayName;
    if (fields.userPrompt !== undefined) payload.cat_userprompt = fields.userPrompt;

    const result = await Cat_conversationanalyzerpromptsService.update(
      id,
      payload as Partial<Omit<Cat_conversationanalyzerpromptsBase, 'cat_conversationanalyzerpromptid'>>,
    );
    if (!result.success) throw new Error(result.error?.message ?? 'Failed to update prompt');
    if (!result.data) throw new Error('Updated prompt data is missing from response');
    return toPromptRow(result.data);
  }

  /** Delete a prompt and all its related conversation analyzer records. */
  static async delete(id: string): Promise<void> {
    // First delete all analyzer rows that reference this prompt
    await ConversationAnalyzerService.deleteByPromptId(id);
    // Then delete the prompt itself
    await Cat_conversationanalyzerpromptsService.delete(id);
  }
}
