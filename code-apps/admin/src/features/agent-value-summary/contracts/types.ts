/**
 * Agent Value Summary — TypeScript interfaces
 *
 * Raw Dataverse entities, computed aggregations, dashboard KPIs,
 * and static help-screen data shapes.
 */

// ---------------------------------------------------------------------------
// Raw Dataverse Entities
// ---------------------------------------------------------------------------

/** A single active row from the `cat_agentvalue` Dataverse table. */
export interface AgentValueRecord {
  cat_agentvalueid: string;
  /** Agent display name */
  cat_name: string;
  /** Copilot Studio agent (bot) id — matches `cat_agentdetails.cat_agentid` */
  cat_agentid?: string;
  cat_environmentid?: string;
  /** e.g. "Increased productivity" */
  cat_agentvaluebenefit: string;
  /** e.g. "Assistant" */
  cat_agenttypes: string;
  /** e.g. "Sense" */
  cat_agentbehaviors: string;
  /** ISO datetime string */
  cat_classificationdate: string;
  cat_environmentdisplayname: string;
  statecode: number;
  cat_agentdescription?: string;
  cat_agentinstructions?: string;
  statuscode?: number;
  createdon?: string;
  modifiedon?: string;
  /** "Record Created On" (data import) */
  overriddencreatedon?: string;
  _ownerid_value?: string;
  _owningbusinessunit_value?: string;
  _createdby_value?: string;
  _createdonbehalfby_value?: string;
  _modifiedby_value?: string;
  _modifiedonbehalfby_value?: string;
  /** Choice / lookup display text, returned as Dataverse formatted-value annotations. */
  'statecode@OData.Community.Display.V1.FormattedValue'?: string;
  'statuscode@OData.Community.Display.V1.FormattedValue'?: string;
  '_ownerid_value@OData.Community.Display.V1.FormattedValue'?: string;
  '_owningbusinessunit_value@OData.Community.Display.V1.FormattedValue'?: string;
  '_createdby_value@OData.Community.Display.V1.FormattedValue'?: string;
  '_createdonbehalfby_value@OData.Community.Display.V1.FormattedValue'?: string;
  '_modifiedby_value@OData.Community.Display.V1.FormattedValue'?: string;
  '_modifiedonbehalfby_value@OData.Community.Display.V1.FormattedValue'?: string;
}

/** Inventory row from the `cat_agentdetails` virtual table (summary columns only). */
export interface AgentDetailsRecord {
  cat_agentdetailsid: string;
  cat_agentid: string;
  cat_name: string;
  cat_environmentid?: string;
  cat_environmentname?: string;
  /** 0 = Copilot Chat, 1 = GitHub Copilot, 2 = Standard */
  cat_poweredbycode?: number;
}

/** A row from the `cat_copilotstudiokitlogs` table used for sync polling. */
export interface SyncStatusRecord {
  cat_copilotstudiokitlogsid: string;
  cat_cloudflowname: string;
  cat_syncnotified: boolean;
  /** 1=Not Started, 2=Running, 3=Complete, 4=Error, 5=Cancelled */
  cat_executionstatuscode: number;
  createdon: string;
}

// ---------------------------------------------------------------------------
// Computed Collections (client-side aggregations)
// ---------------------------------------------------------------------------

/** Distinct value-benefit name with its occurrence count. */
export interface ValueBenefitCount {
  valueBenefit: string;
  count: number;
}

/** Distinct agent-type name with its occurrence count. */
export interface AgentTypeCount {
  agentType: string;
  count: number;
}

/** Distinct agent-behavior name with its occurrence count. */
export interface AgentBehaviorCount {
  agentBehavior: string;
  count: number;
}

/** One point on the classification-over-time line chart. */
export interface ClassificationTrendPoint {
  /** Formatted as "mm-yyyy" */
  monthLabel: string;
  sortDate: Date;
  totalClassified: number;
}

/** A single row in the "Value benefit by environment" data grid. */
export interface ValueByEnvironmentRow {
  /** Environment id used for grouping/drillthrough (falls back to display name when blank). */
  environmentKey: string;
  environmentDisplayName: string;
  agentValueBenefit: string;
  count: number;
}

// ---------------------------------------------------------------------------
// Dashboard KPIs (derived)
// ---------------------------------------------------------------------------

/** All top-level KPI values displayed on the dashboard. */
export interface DashboardKpis {
  /** CountIf('Agent Details', true) */
  allAgentsCount: number;
  /** CountRows(colValueData) */
  classifiedAgentsCount: number;
  /** Round(classified / total * 100, 0) */
  classifiedPercentage: number;
  /** total - classified */
  untappedCount: number;
  /** Round(untapped / total * 100, 0) */
  untappedPercentage: number;
  /** Name of the most-common value benefit */
  topValueBenefit: string;
  /** Round(maxBenefitCount / classified * 100, 0) */
  topValueBenefitPercentage: number;
  /** Name of the most-common agent type */
  topAgentType: string;
  /** Round(maxTypeCount / classified * 100, 0) */
  topAgentTypePercentage: number;
  /** Name of the most-common agent behavior */
  topAgentBehavior: string;
  /** Round(maxBehaviorCount / classified * 100, 0) */
  topAgentBehaviorPercentage: number;
  /** Max from valueBenefitCounts */
  commonValueBenefit: { name: string; count: number };
  /** Min from valueBenefitCounts */
  rareValueBenefit: { name: string; count: number };
}

// ---------------------------------------------------------------------------
// Drillthrough
// ---------------------------------------------------------------------------

/**
 * Dashboard KPI selection that opens the Agent values list
 * (`/agent-value-summary?view=agents&valueFilter=…`). `all-agents` and
 * `unclassified` list inventory agents; every other kind lists matching
 * active Agent Value records.
 */
export type DrillthroughFilter =
  | { kind: 'all-agents' }
  | { kind: 'classified' }
  | { kind: 'unclassified' }
  | { kind: 'value-benefit'; value: string }
  | { kind: 'agent-type'; value: string }
  | { kind: 'agent-behavior'; value: string }
  | {
      kind: 'environment-benefit';
      environmentKey: string;
      environmentDisplayName: string;
      valueBenefit: string;
    }
  | { kind: 'classification-month'; year: number; month: number; monthLabel: string };

/** One row in the Agent values list (an Agent Value record, or an inventory agent for inventory KPIs). */
export interface AgentValueListRow {
  id: string;
  name: string;
  agentId?: string;
  environmentId?: string;
  environmentName: string;
  agentType: string;
  agentBehavior: string;
  valueBenefit: string;
  /** ISO datetime string; empty when the agent is not classified */
  classificationDate: string;
  /** True when the agent uses the new (GitHub Copilot) designer — affects the Copilot Studio URL. */
  isGenerativeDesigner: boolean;
  /** The row's Agent Value record; absent for unclassified inventory agents. */
  valueRecord?: AgentValueRecord;
}

// ---------------------------------------------------------------------------
// Static Help Data
// ---------------------------------------------------------------------------

/** Describes one of the 6 agent types shown on the help screen. */
export interface AgentTypeHelpItem {
  name: string;
  definition: string;
  example: string;
  /** Customer-specific example description from the .msapp source */
  customerExample: string;
  customer: string;
  customerLogo: string;
  customerStoryUrl: string;
  valueBenefits: string[];
}

/** Describes one of the 6 agent behaviors shown on the help screen. */
export interface AgentBehaviorHelpItem {
  name: string;
  /** Noun form of the behavior, e.g. "responder" for Respond */
  agentNoun: string;
  definition: string;
  example: string;
  /** Customer-specific example description from the .msapp source */
  customerExample: string;
  commonAgentTypes: string[];
  primaryAgentType: string;
  customer: string;
  customerLogo: string;
  customerStoryUrl: string;
}
