// Native Dataverse client. Dispatches to the per-table typed services that
// `pac code add-data-source -a dataverse -t <table>` generated under
// src/generated/services. These services use the first-party Power Apps
// runtime ( @microsoft/power-apps/data ) and do NOT go through the
// shared_commondataserviceforapps OAuth connector — so there is no token
// exchange to fail at runtime.

import { Cat_metricdefinitionsService } from '../../../generated/services/Cat_metricdefinitionsService';
import { Cat_userlayoutsService } from '../../../generated/services/Cat_userlayoutsService';
import { Cat_agentdetailsesService } from '../../../generated/services/Cat_agentdetailsesService';
import { Cat_agenttranscriptsesService } from '../../../generated/services/Cat_agenttranscriptsesService';
import { Cat_agentusagehistoriesService } from '../../../generated/services/Cat_agentusagehistoriesService';
import { Cat_agentvaluesService } from '../../../generated/services/Cat_agentvaluesService';
import { Cat_conversationanalyzerpromptsService } from '../../../generated/services/Cat_conversationanalyzerpromptsService';
import { Cat_conversationanalyzersService } from '../../../generated/services/Cat_conversationanalyzersService';
import { Cat_copilotconfigurationsService } from '../../../generated/services/Cat_copilotconfigurationsService';
import { Cat_copilotkpisService } from '../../../generated/services/Cat_copilotkpisService';
import { Cat_customersService } from '../../../generated/services/Cat_customersService';
import { Cat_dailymetricsesService } from '../../../generated/services/Cat_dailymetricsesService';
import { Cat_transcriptmetricsesService } from '../../../generated/services/Cat_transcriptmetricsesService';
import { Cat_topicmetricsesService } from '../../../generated/services/Cat_topicmetricsesService';
import { Cat_toolmetricsesService } from '../../../generated/services/Cat_toolmetricsesService';
import { Cat_agentreviewsesService } from '../../../generated/services/Cat_agentreviewsesService';
import { Cat_copilottestsService } from '../../../generated/services/Cat_copilottestsService';
import { Cat_copilottestresultsService } from '../../../generated/services/Cat_copilottestresultsService';
import { Cat_copilottestrunsService } from '../../../generated/services/Cat_copilottestrunsService';
import { SystemusersService } from '../../../generated/services/SystemusersService';

export interface ListOptions {
  select?: string[];
  filter?: string;
  /** OData orderBy as a single string (e.g. "createdon desc") or an array of column expressions. */
  orderBy?: string | string[];
  top?: number;
  /** Reserved — Power Apps native client does not expose `$expand`; not forwarded. */
  expand?: string;
  /** Reserved — Power Apps native client does not accept raw FetchXML; not forwarded. */
  fetchXml?: string;
}

// Each generated service class exposes the same surface; we only need the bits
// dataverseClient consumed historically.
interface ITypedService {
  getAll(options?: {
    select?: string[];
    filter?: string;
    orderBy?: string[];
    top?: number;
    skip?: number;
    skipToken?: string;
    maxPageSize?: number;
  }): Promise<{ success: boolean; data: unknown; error?: unknown }>;
  get(
    id: string,
    options?: { select?: string[] }
  ): Promise<{ success: boolean; data: unknown; error?: unknown }>;
  create(record: Record<string, unknown>): Promise<{ success: boolean; data: unknown; error?: unknown }>;
  update?(
    id: string,
    changedFields: Record<string, unknown>
  ): Promise<{ success: boolean; data: unknown; error?: unknown }>;
  delete?(id: string): Promise<unknown>;
}

// Map dataSourceName (the entity-set plural that pac code add-data-source
// registered) → generated typed service. Callers historically pass these
// plural names, so the registry mirrors them exactly.
const REGISTRY: Record<string, ITypedService> = {
  cat_metricdefinitions: Cat_metricdefinitionsService as unknown as ITypedService,
  cat_userlayouts: Cat_userlayoutsService as unknown as ITypedService,
  cat_agentdetailses: Cat_agentdetailsesService as unknown as ITypedService,
  cat_agenttranscriptses: Cat_agenttranscriptsesService as unknown as ITypedService,
  cat_agentusagehistories: Cat_agentusagehistoriesService as unknown as ITypedService,
  cat_agentvalues: Cat_agentvaluesService as unknown as ITypedService,
  cat_conversationanalyzerprompts: Cat_conversationanalyzerpromptsService as unknown as ITypedService,
  cat_conversationanalyzers: Cat_conversationanalyzersService as unknown as ITypedService,
  cat_copilotconfigurations: Cat_copilotconfigurationsService as unknown as ITypedService,
  cat_copilotkpis: Cat_copilotkpisService as unknown as ITypedService,
  cat_customers: Cat_customersService as unknown as ITypedService,
  cat_dailymetricses: Cat_dailymetricsesService as unknown as ITypedService,
  cat_transcriptmetricses: Cat_transcriptmetricsesService as unknown as ITypedService,
  cat_topicmetricses: Cat_topicmetricsesService as unknown as ITypedService,
  cat_toolmetricses: Cat_toolmetricsesService as unknown as ITypedService,
  cat_agentreviewses: Cat_agentreviewsesService as unknown as ITypedService,
  cat_copilottests: Cat_copilottestsService as unknown as ITypedService,
  cat_copilottestresults: Cat_copilottestresultsService as unknown as ITypedService,
  cat_copilottestruns: Cat_copilottestrunsService as unknown as ITypedService,
  systemusers: SystemusersService as unknown as ITypedService,
};

// Some legacy callers pass logical names instead of entity-set names.
// Provide aliases that map both shapes to the same registered service.
const ALIASES: Record<string, string> = {
  cat_metricdefinition: 'cat_metricdefinitions',
  cat_userlayout: 'cat_userlayouts',
  cat_agentdetail: 'cat_agentdetailses',
  cat_agentdetails: 'cat_agentdetailses',
  cat_agenttranscript: 'cat_agenttranscriptses',
  cat_agenttranscripts: 'cat_agenttranscriptses',
  cat_agentusagehistory: 'cat_agentusagehistories',
  cat_agentvalue: 'cat_agentvalues',
  cat_conversationanalyzer: 'cat_conversationanalyzers',
  cat_conversationanalyzerprompt: 'cat_conversationanalyzerprompts',
  cat_copilotconfiguration: 'cat_copilotconfigurations',
  cat_copilotkpi: 'cat_copilotkpis',
  cat_customer: 'cat_customers',
  cat_dailymetrics: 'cat_dailymetricses',
  cat_transcriptmetrics: 'cat_transcriptmetricses',
  cat_transcriptmetricses: 'cat_transcriptmetricses',
  cat_topicmetrics: 'cat_topicmetricses',
  cat_toolmetrics: 'cat_toolmetricses',
  cat_agentreviews: 'cat_agentreviewses',
  cat_agentreview: 'cat_agentreviewses',
  cat_copilottest: 'cat_copilottests',
  cat_copilottestresult: 'cat_copilottestresults',
  cat_copilottestrun: 'cat_copilottestruns',
  systemuser: 'systemusers',
};

function resolve(entity: string): ITypedService {
  const key = REGISTRY[entity] ? entity : ALIASES[entity];
  const svc = key ? REGISTRY[key] : undefined;
  if (!svc) {
    throw new Error(
      `Unregistered Dataverse entity '${entity}'. Add it via: pac code add-data-source -a dataverse -t <logical>`
    );
  }
  return svc;
}

function normalizeOrderBy(o?: string | string[]): string[] | undefined {
  if (!o) return undefined;
  if (Array.isArray(o)) return o.length ? o : undefined;
  return [o];
}

function unwrap<T>(res: { success: boolean; data: unknown; error?: unknown }, entity: string, op: string): T {
  if (!res.success) {
    const err = res.error;
    const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err);
    console.error(`[Dataverse] ${op} ${entity} failed:`, msg);
    throw new Error(`Failed to ${op} ${entity}: ${msg.slice(0, 500)}`);
  }
  return res.data as T;
}

export const dv = {
  async list<T = Record<string, unknown>>(entity: string, opts: ListOptions = {}): Promise<T[]> {
    if (opts.expand || opts.fetchXml) {
      console.warn(`[Dataverse] list ${entity}: 'expand'/'fetchXml' ignored — not supported by native client.`);
    }
    const debug = typeof window !== 'undefined' && !!(window as unknown as { __AMS_DEBUG?: boolean }).__AMS_DEBUG;
    const svc = resolve(entity);
    if (debug) {
      console.groupCollapsed(`[AMS:debug] dv.list → ${entity}`);
      console.log('select:', opts.select ?? '(all)');
      console.log('orderBy:', opts.orderBy ?? '(none)');
      console.log('top:', opts.top ?? '(default)');
    }
    const res = await svc.getAll({
      select: opts.select,
      filter: opts.filter,
      orderBy: normalizeOrderBy(opts.orderBy),
      top: opts.top,
    });
    const data = unwrap<unknown>(res, entity, 'list');
    let rows: T[];
    if (Array.isArray(data)) { rows = data as T[]; }
    else {
      const wrapped = data as { value?: T[] } | undefined;
      rows = (wrapped?.value as T[]) ?? [];
    }
    if (debug) {
      console.log('[AMS:debug] rows returned:', rows.length);
      if (rows.length === 0) console.warn('[AMS:debug] ⚠️ Query returned 0 rows — possible Elastic table or restrictive filter');
      console.groupEnd();
    }
    return rows;
  },

  async getById<T = Record<string, unknown>>(entity: string, id: string, select?: string[]): Promise<T> {
    const svc = resolve(entity);
    const res = await svc.get(id, select && select.length ? { select } : undefined);
    return unwrap<T>(res, entity, 'get');
  },

  async create(entity: string, item: Record<string, unknown>): Promise<void> {
    const svc = resolve(entity);
    const res = await svc.create(item);
    unwrap<unknown>(res, entity, 'create');
  },

  async update(entity: string, id: string, changes: Record<string, unknown>): Promise<void> {
    const svc = resolve(entity);
    if (!svc.update) throw new Error(`Service for ${entity} does not expose update()`);
    const res = await svc.update(id, changes);
    unwrap<unknown>(res, entity, 'update');
  },

  async remove(entity: string, id: string): Promise<void> {
    const svc = resolve(entity);
    if (!svc.delete) throw new Error(`Service for ${entity} does not expose delete()`);
    await svc.delete(id);
  },
};
