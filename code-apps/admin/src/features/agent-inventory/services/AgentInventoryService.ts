import type { Cat_agentdetailses } from '../../../generated/models/Cat_agentdetailsesModel';
import { Cat_agentdetailsesService } from '../../../generated/services/Cat_agentdetailsesService';
import { paginatedFetchAll } from '../../../shared/services/paginatedFetchAll';
import type {
  AgentCapabilities,
  AgentInventoryRecord,
  AgentPoweredBy,
  AgentStatus,
  InventoryChoice,
} from '../contracts/types';

const SELECT: string[] = [
  'cat_agentdetailsid', 'cat_agentid', 'cat_name', 'cat_description', 'cat_instructions', 'cat_type',
  'cat_agentstatuscode', 'cat_environmentid', 'cat_environmentname', 'cat_environmenttype',
  'cat_environmenturl', 'cat_location', 'cat_agentowner', 'cat_agentowneremail', 'cat_agentowneradid',
  'cat_agentowningbusinessunit', 'cat_agentcreatedby', 'cat_agentcreatedbyupn',
  'cat_agentcreatedbyadid', 'cat_agentcreateddate', 'cat_agentmodifiedby',
  'cat_agentmodifieddate', 'cat_publishedcode', 'cat_publishedby', 'cat_publisheddate',
  'cat_firstusagedate', 'cat_firstusagefeature', 'cat_lastusagedate', 'cat_lastusagefeature',
  'cat_enduserauthenticationtype', 'cat_orchestrationtype', 'cat_model', 'cat_managedstate',
  'cat_poweredbycode', 'cat_agentcreatedin', 'cat_agentschemaname', 'cat_defaultapplicationid', 'cat_template',
  'cat_istranscriptavailablecode', 'cat_hassysadminaccesscode', 'cat_hasppacenvmismatchcode',
  'cat_autonomousagentcode', 'cat_usesconnectormakerauthcontextcode', 'cat_usesclassicgenerativeanswerssourcescode',
  'cat_usescloudflowauthcontextcode', 'cat_agenttestconfiguredcode', 'cat_numberofevaluations', 'cat_usesgenaicode',
  'cat_sharedwitheditorusercount', 'cat_sharedwitheditorgroupcount', 'cat_sharedwithviewerusercount',
  'cat_sharedwithviewergroupcount', 'cat_sharedwithentiretenantasviewer',
  'cat_usesknowledgesourcescode', 'cat_usestoolscode', 'cat_usesevaluationcode',
  'cat_usespromptscode', 'cat_usesmcpcode', 'cat_usesenhancedsearchresultscode',
  'cat_usesfileinputcode', 'cat_usescustomizedresponsecode', 'cat_usesskillscode',
  'cat_usescomputerusecode', 'cat_useshttprequestscode', 'cat_usescustomknowledgesourcecode',
  'cat_usesaiknowledgecode', 'cat_usesdeepreasoningmodelscode', 'cat_websearchenabledcode',
  'cat_knowledgesources', 'cat_prompts', 'cat_agenttriggers', 'cat_classicdatasources',
  'cat_httprequestactions', 'cat_connections', 'cat_skills', 'cat_evaluations', 'cat_mcp',
  'cat_connectedagents', 'cat_usageagentactionbilledcredits',
  'cat_usageagentactionnonbilledcredits', 'cat_usageagentflowactionsbilledcredits',
  'cat_usageagentflowactionsnonbilledcredits', 'cat_usageclassicanswerbilledcredits',
  'cat_usageclassicanswernonbilledcredits', 'cat_usagegenerativeanswerbilledcredits',
  'cat_usagegenerativeanswernonbilledcredits', 'cat_usagetextgenaitoolsbasicbillcredits',
  'cat_usagetextgenaitoolsbasicnonbillcredits', 'cat_usagetextgenaitoolspremiumbillcredits',
  'cat_usagetextgenaitoolspremiumnonbillcredits', 'cat_usagetextgenaitoolsstandardbillcredits',
  'cat_usagetextgenaitoolsstandardnonbillcredits', 'modifiedon',
  'cat_usagedata',
];

function choice(value: number | undefined): InventoryChoice {
  if (value === 1) return 'yes';
  if (value === 0) return 'no';
  if (value === 2) return 'na';
  return 'unknown';
}

function status(value: number | undefined): AgentStatus {
  if (value === 0) return 'Available';
  if (value === 1) return 'Blocked';
  if (value === 2) return 'Draft';
  if (value === 3) return 'NA';
  return 'Unknown';
}

function poweredBy(code: number | undefined, name?: string): AgentPoweredBy {
  if (code === 0) return 'Copilot Chat';
  if (code === 1) return 'GitHub Copilot';
  if (code === 2) return 'Standard';

  const normalized = name?.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (normalized === 'copilotchat') return 'Copilot Chat';
  if (normalized === 'githubcopilot') return 'GitHub Copilot';
  if (normalized === 'standard') return 'Standard';
  return 'Unknown';
}

/** Coerce an untyped JSON value (number or numeric string) to a finite number, defaulting to 0. */
function toFiniteNumber(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Sum billed + non-billed credits across every entry in the `cat_usagedata` JSON payload.
 * Mirrors the Copilot Studio Kit custom-page formula:
 *   If(IsBlank(cat_usagedata), Blank(), Sum(Table(ParseJSON(cat_usagedata)), Value(Value.Billed) + Value(Value.NonBilled)))
 * Returns undefined (blank) when the payload is blank, empty, or cannot be parsed.
 */
function sumUsageDataCredits(usageData: string | undefined): number | undefined {
  if (!usageData) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(usageData);
  } catch {
    return undefined;
  }
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  if (entries.length === 0) return undefined;
  return entries.reduce<number>((total, entry) => {
    if (!entry || typeof entry !== 'object') return total;
    const record = entry as Record<string, unknown>;
    return total + toFiniteNumber(record.Billed) + toFiniteNumber(record.NonBilled);
  }, 0);
}

function isMissingAgentError(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : JSON.stringify(error);
  return /\b404\b/.test(message)
    && /item with id|no longer exists|not found/i.test(message);
}

function mapCapabilities(row: Cat_agentdetailses): AgentCapabilities {
  return {
    usesGenAI: choice(row.cat_usesgenaicode),
    usesKnowledgeSources: choice(row.cat_usesknowledgesourcescode),
    usesTools: choice(row.cat_usestoolscode),
    usesEvaluations: choice(row.cat_usesevaluationcode),
    usesPrompts: choice(row.cat_usespromptscode),
    usesMCP: choice(row.cat_usesmcpcode),
    usesEnhancedSearch: choice(row.cat_usesenhancedsearchresultscode),
    usesFileInput: choice(row.cat_usesfileinputcode),
    usesCustomizedResponses: choice(row.cat_usescustomizedresponsecode),
    usesSkills: choice(row.cat_usesskillscode),
    usesComputer: choice(row.cat_usescomputerusecode),
    usesHttpRequests: choice(row.cat_useshttprequestscode),
    usesCustomKnowledgeSource: choice(row.cat_usescustomknowledgesourcecode),
    usesAIKnowledge: choice(row.cat_usesaiknowledgecode),
    usesDeepReasoning: choice(row.cat_usesdeepreasoningmodelscode),
    webSearchEnabled: choice(row.cat_websearchenabledcode),
    usesClassicGenerativeAnswerSources: choice(row.cat_usesclassicgenerativeanswerssourcescode),
    usesCloudFlowAuthContext: choice(row.cat_usescloudflowauthcontextcode),
    usesConnectorMakerAuthContext: choice(row.cat_usesconnectormakerauthcontextcode),
  };
}

function toDomain(row: Cat_agentdetailses): AgentInventoryRecord {
  return {
    id: row.cat_agentdetailsid,
    agentId: row.cat_agentid,
    name: row.cat_name,
    description: row.cat_description,
    instructions: row.cat_instructions,
    type: row.cat_type?.trim() || 'Unknown',
    status: status(row.cat_agentstatuscode),
    environmentId: row.cat_environmentid,
    environmentName: row.cat_environmentname,
    environmentType: row.cat_environmenttype,
    environmentUrl: row.cat_environmenturl,
    location: row.cat_location,
    owner: row.cat_agentowner,
    ownerEmail: row.cat_agentowneremail,
    ownerAdId: row.cat_agentowneradid,
    owningBusinessUnit: row.cat_agentowningbusinessunit,
    createdBy: row.cat_agentcreatedby,
    createdByUpn: row.cat_agentcreatedbyupn,
    createdByAdId: row.cat_agentcreatedbyadid,
    createdDate: row.cat_agentcreateddate,
    modifiedBy: row.cat_agentmodifiedby,
    modifiedDate: row.cat_agentmodifieddate ?? row.modifiedon,
    published: choice(row.cat_publishedcode),
    publishedBy: row.cat_publishedby,
    publishedDate: row.cat_publisheddate,
    firstUsageDate: row.cat_firstusagedate,
    firstUsageFeature: row.cat_firstusagefeature,
    lastUsageDate: row.cat_lastusagedate,
    lastUsageFeature: row.cat_lastusagefeature,
    authenticationType: row.cat_enduserauthenticationtype,
    orchestrationType: row.cat_orchestrationtype,
    poweredBy: poweredBy(row.cat_poweredbycode, row.cat_poweredbycodename),
    model: row.cat_model,
    managedState: row.cat_managedstate,
    createdIn: row.cat_agentcreatedin,
    schemaName: row.cat_agentschemaname,
    defaultApplicationId: row.cat_defaultapplicationid,
    template: row.cat_template,
    transcriptAvailable: choice(row.cat_istranscriptavailablecode),
    hasSystemAdminAccess: choice(row.cat_hassysadminaccesscode),
    hasPpacMismatch: choice(row.cat_hasppacenvmismatchcode),
    autonomousAgent: choice(row.cat_autonomousagentcode),
    testConfigured: choice(row.cat_agenttestconfiguredcode),
    numberOfEvaluations: row.cat_numberofevaluations,
    sharedWithEditorUserCount: row.cat_sharedwitheditorusercount,
    sharedWithEditorGroupCount: row.cat_sharedwitheditorgroupcount,
    sharedWithViewerUserCount: row.cat_sharedwithviewerusercount,
    sharedWithViewerGroupCount: row.cat_sharedwithviewergroupcount,
    sharedWithEntireTenantAsViewer: choice(row.cat_sharedwithentiretenantasviewer),
    capabilities: mapCapabilities(row),
    components: {
      knowledgeSources: row.cat_knowledgesources,
      prompts: row.cat_prompts,
      triggers: row.cat_agenttriggers,
      classicDataSources: row.cat_classicdatasources,
      httpRequestActions: row.cat_httprequestactions,
      connections: row.cat_connections,
      skills: row.cat_skills,
      evaluations: row.cat_evaluations,
      mcp: row.cat_mcp,
      connectedAgents: row.cat_connectedagents,
      usageData: row.cat_usagedata,
    },
    aggregateCredits: sumUsageDataCredits(row.cat_usagedata),
    agentUsage: {
      usageAgentActionBilled: row.cat_usageagentactionbilledcredits,
      usageAgentActionNonBilled: row.cat_usageagentactionnonbilledcredits,
      usageAgentFlowActionBilled: row.cat_usageagentflowactionsbilledcredits,
      usageAgentFlowActionNonBilled: row.cat_usageagentflowactionsnonbilledcredits,
      usageClassicAnswerBilled: row.cat_usageclassicanswerbilledcredits,
      usageClassicAnswerNonBilled: row.cat_usageclassicanswernonbilledcredits,
      usageGenerativeAnswerBilled: row.cat_usagegenerativeanswerbilledcredits,
      usageGenerativeAnswerNonBilled: row.cat_usagegenerativeanswernonbilledcredits,
      usageTextAndGenAIToolsBasicBilled: row.cat_usagetextgenaitoolsbasicbillcredits,
      usageTextAndGenAIToolsBasicNonBilled: row.cat_usagetextgenaitoolsbasicnonbillcredits,
      usageTextAndGenAIToolsStandardBilled: row.cat_usagetextgenaitoolsstandardbillcredits,
      usageTextAndGenAIToolsStandardNonBilled: row.cat_usagetextgenaitoolsstandardnonbillcredits,
      usageTextAndGenAIToolsPremiumBilled: row.cat_usagetextgenaitoolspremiumbillcredits,
      usageTextAndGenAIToolsPremiumNonBilled: row.cat_usagetextgenaitoolspremiumnonbillcredits,
    },
  };
}

export class AgentInventoryService {
  /** Fetch every synced agent with the fields required by dashboard and detail views. */
  static async listAll(): Promise<AgentInventoryRecord[]> {
    const rows = await paginatedFetchAll<Cat_agentdetailses>(
      (options) => Cat_agentdetailsesService.getAll(options),
      { select: SELECT, orderBy: ['cat_name asc'] },
    );
    return rows.map(toDomain);
  }

  /** Fetch one Agent Details record by its Dataverse primary key. */
  static async getById(agentDetailsId: string): Promise<AgentInventoryRecord | undefined> {
    try {
      const result = await Cat_agentdetailsesService.get(agentDetailsId, { select: SELECT });
      if (!result.success) {
        if (isMissingAgentError(result.error)) return undefined;
        throw new Error('Unable to load agent details.', { cause: result.error });
      }
      return result.data ? toDomain(result.data) : undefined;
    } catch (error) {
      if (isMissingAgentError(error)) return undefined;
      if (error instanceof Error && error.message === 'Unable to load agent details.') throw error;
      throw new Error('Unable to load agent details.', { cause: error });
    }
  }
}
