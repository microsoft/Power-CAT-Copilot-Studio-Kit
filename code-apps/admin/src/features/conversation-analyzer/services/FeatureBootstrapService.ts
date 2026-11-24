/**
 * Startup checks for the Conversation Analyzer page: system prompt seeding and synced-agent detection.
 */

import { Cat_conversationanalyzerpromptsService } from '../../../generated/services/Cat_conversationanalyzerpromptsService';
import { Cat_agentdetailsesService } from '../../../generated/services/Cat_agentdetailsesService';
import type { Cat_conversationanalyzerpromptsBase } from '../../../generated/models/Cat_conversationanalyzerpromptsModel';
import { paginatedFetchAll } from '../../../shared/services/paginatedFetchAll';
import { PROMPT_TYPE_SYSTEM } from '../contracts/types';

const SYSTEM_PROMPTS = [
  { name: 'PII Analysis', displayName: 'PII Analysis' },
  { name: 'Sentiment Analysis', displayName: 'Sentiment Analysis' },
] as const;

/** Creates the PII and Sentiment system prompts when they are missing. */
export async function ensureSystemPrompts(): Promise<void> {
  const existing = await paginatedFetchAll(
    (opts) => Cat_conversationanalyzerpromptsService.getAll(opts),
    {
      select: ['cat_conversationanalyzerpromptid', 'cat_name'],
      filter: `cat_type eq ${PROMPT_TYPE_SYSTEM} and statecode eq 0`,
    },
  );

  const existingNames = new Set(existing.map((r) => (r.cat_name ?? '').toLowerCase()));
  const toCreate = SYSTEM_PROMPTS.filter((sp) => !existingNames.has(sp.name.toLowerCase()));

  await Promise.all(
    toCreate.map((sp) =>
      Cat_conversationanalyzerpromptsService.create({
        cat_name: sp.name,
        cat_displayname: sp.displayName,
        cat_type: PROMPT_TYPE_SYSTEM,
      } as unknown as Omit<Cat_conversationanalyzerpromptsBase, 'cat_conversationanalyzerpromptid'>),
    ),
  );
}

/** Returns true when at least one synced agent record exists. */
export async function hasSyncedAgents(): Promise<boolean> {
  const result = await Cat_agentdetailsesService.getAll({
    select: ['cat_agentdetailsid'],
    top: 1,
  });
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Unable to check for synced agents.');
  }
  const data = result.data as unknown as { value?: unknown[] } | unknown[];
  if (Array.isArray(data)) return data.length > 0;
  if (data && 'value' in data && Array.isArray(data.value)) return data.value.length > 0;
  throw new Error('The agent lookup returned an invalid response.');
}
