/**
 * AI Builder credit lookups (`msdyn_aimodels`, `msdyn_aievent`) for the Conversation Analyzer.
 * Wraps the generated Dataverse service so hooks never call it directly.
 */

import { MicrosoftDataverseService } from '../../../generated/services/MicrosoftDataverseService';

/** The three AI model display names the analyzer uses. */
export const AI_MODEL_LABELS = ['Sentiment Analysis', 'PII Analysis', 'Custom Prompt Analysis'] as const;
export type AiModelLabel = (typeof AI_MODEL_LABELS)[number];

interface AiModelRecord {
  msdyn_aimodelid: string;
  msdyn_name: string;
}

interface AggregateRow {
  totalCredits?: number;
  eventCount?: number;
  modelId?: string;
}

export interface ModelCreditTotals {
  credits: number;
  events: number;
}

let cachedModelIdMap: Map<string, AiModelLabel> | null = null;

function toRows<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object' && 'value' in data) {
    const value = (data as { value?: unknown }).value;
    return Array.isArray(value) ? (value as T[]) : [];
  }
  return [];
}

/** Maps model GUID → display name for the analyzer's models. Cached for the browser session. */
async function getModelIdMap(): Promise<Map<string, AiModelLabel>> {
  if (cachedModelIdMap) return cachedModelIdMap;

  const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
    'current',
    'msdyn_aimodels',
    undefined,
    undefined,
    undefined,
    undefined,
    'msdyn_aimodelid,msdyn_name',
    AI_MODEL_LABELS.map((n) => `msdyn_name eq '${n}'`).join(' or '),
  );
  if (!result.success) {
    throw new Error('Unable to access data from AI Model table. Check permissions.');
  }

  const map = new Map<string, AiModelLabel>();
  for (const record of toRows<AiModelRecord>(result.data)) {
    if (AI_MODEL_LABELS.includes(record.msdyn_name as AiModelLabel)) {
      map.set(record.msdyn_aimodelid.toLowerCase(), record.msdyn_name as AiModelLabel);
    }
  }
  cachedModelIdMap = map;
  return map;
}

function buildAggregateFetchXml(from: string, to: string, modelIds: string[]): string {
  const modelValues = modelIds.map((id) => `<value>{${id}}</value>`).join('');
  return [
    '<fetch aggregate="true">',
    '  <entity name="msdyn_aievent">',
    '    <attribute name="msdyn_creditconsumed" alias="totalCredits" aggregate="sum" />',
    '    <attribute name="msdyn_aieventid" alias="eventCount" aggregate="count" />',
    '    <attribute name="msdyn_aimodelid" alias="modelId" groupby="true" />',
    '    <filter type="and">',
    `      <condition attribute="createdon" operator="ge" value="${from}" />`,
    `      <condition attribute="createdon" operator="le" value="${to}" />`,
    `      <condition attribute="msdyn_aimodelid" operator="in">${modelValues}</condition>`,
    '    </filter>',
    '  </entity>',
    '</fetch>',
  ].join('');
}

export class AiCreditService {
  /** Sums credits and counts AI events per analyzer model in the ISO date range. */
  static async getCreditTotalsByModel(from: string, to: string): Promise<Map<AiModelLabel, ModelCreditTotals>> {
    const totals = new Map<AiModelLabel, ModelCreditTotals>(
      AI_MODEL_LABELS.map((label) => [label, { credits: 0, events: 0 }]),
    );
    const modelIdMap = await getModelIdMap();
    if (modelIdMap.size === 0) return totals;

    const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
      'current',
      'msdyn_aievents',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      buildAggregateFetchXml(from, to, [...modelIdMap.keys()]),
    );
    if (!result.success) {
      throw new Error('Unable to access data from AI Event table. Check permissions.');
    }

    for (const row of toRows<AggregateRow>(result.data)) {
      const label = row.modelId ? modelIdMap.get(row.modelId.toLowerCase()) : undefined;
      if (!label) continue;
      const current = totals.get(label)!;
      current.credits += Number(row.totalCredits) || 0;
      current.events += Number(row.eventCount) || 0;
    }
    return totals;
  }
}
