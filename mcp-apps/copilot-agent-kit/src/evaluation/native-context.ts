import { z } from "zod";
import yaml from "js-yaml";
import { guid } from "../agent-review/server/dataverse.js";
import { ReviewError } from "../agent-review/server/types.js";
import { usesCopilotHarness } from "../agent-review/core/services/detection.js";
import type { AtomicCreate } from "./batch.js";
import type { NativeEvaluationContext } from "./native.js";

interface NativeDataverse {
  get(path: string): Promise<unknown>;
  list(path: string, limits: { maxItems: number; maxBytes: number }): Promise<unknown[]>;
  entitySet(logicalName: string): Promise<string>;
  createAtomic(creates: readonly AtomicCreate[]): Promise<void>;
  update?(path: string, body: unknown): Promise<void>;
  delete?(path: string): Promise<void>;
}
const recordSchema = z.object({
  botcomponentid: z.string().transform(value => guid(value)), name: z.string(), schemaname: z.string(),
  componenttype: z.number(), data: z.string(), statecode: z.number(),
  _parentbotid_value: z.string().transform(value => guid(value)),
  _parentbotcomponentid_value: z.string().transform(value => guid(value)).nullable(),
});
const metadataLimits = { maxItems: 200, maxBytes: 512 * 1024 };
export const NATIVE_EVALUATION_SCHEMA_PREFIX = "mspva";
const templateRoot = z.object({ kind: z.literal("EvaluationSet"), graders: z.array(z.object({ kind: z.string() })).min(1) });
const templateCase = z.object({
  kind: z.literal("MultiTurnEvaluationCase"), source: z.literal("Manual"),
  activities: z.array(z.object({ activity: z.object({
    value: z.object({ from: z.object({ role: z.enum(["user", "agent"]) }) }),
    text: z.array(z.string()).min(1),
  }) })).min(2).max(12),
});

function parseYaml(data: string): unknown {
  try { return yaml.load(data); }
  catch { throw new ReviewError("EVALUATION_NATIVE_TEMPLATE", "The target has invalid saved native evaluation YAML. No native write was sent."); }
}
export async function inspectNativeEvaluationTarget(client: NativeDataverse, agentId: string): Promise<NativeEvaluationContext> {
  const botId = guid(agentId);
  const definition = z.object({ EntitySetName: z.string().regex(/^[a-z][a-z0-9_]*$/i), PrimaryIdAttribute: z.literal("botcomponentid") })
    .safeParse(await client.get("EntityDefinitions(LogicalName='botcomponent')?$select=EntitySetName,PrimaryIdAttribute"));
  if (!definition.success) throw new ReviewError("EVALUATION_NATIVE_SCHEMA", "The target's native botcomponent metadata is unsupported.");
  const attributes = await client.list("EntityDefinitions(LogicalName='botcomponent')/Attributes?$select=LogicalName,AttributeType&$filter=LogicalName eq 'componenttype' or LogicalName eq 'data' or LogicalName eq 'parentbotid' or LogicalName eq 'parentbotcomponentid'", metadataLimits);
  const fields = new Map(attributes.map(value => {
    const field = z.object({ LogicalName: z.string(), AttributeType: z.string() }).safeParse(value);
    if (!field.success) throw new ReviewError("EVALUATION_NATIVE_SCHEMA", "A native component field definition is invalid.");
    return [field.data.LogicalName, field.data.AttributeType];
  }));
  if (fields.get("componenttype") !== "Picklist" || fields.get("data") !== "Memo"
    || fields.get("parentbotid") !== "Lookup" || fields.get("parentbotcomponentid") !== "Lookup") {
    throw new ReviewError("EVALUATION_NATIVE_SCHEMA", "The target's native evaluation fields do not match the verified contract.");
  }
  const relationships = await client.list("EntityDefinitions(LogicalName='botcomponent')/ManyToOneRelationships/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata?$select=ReferencingAttribute,ReferencedEntity,ReferencingEntityNavigationPropertyName&$filter=ReferencingAttribute eq 'parentbotid' or ReferencingAttribute eq 'parentbotcomponentid'", metadataLimits);
  const navigation = new Map(relationships.map(value => {
    const item = z.object({ ReferencingAttribute: z.string(), ReferencedEntity: z.string(), ReferencingEntityNavigationPropertyName: z.string() }).safeParse(value);
    if (!item.success) throw new ReviewError("EVALUATION_NATIVE_SCHEMA", "A native component relationship definition is invalid.");
    return [item.data.ReferencingAttribute, item.data];
  }));
  if (navigation.get("parentbotid")?.ReferencedEntity !== "bot"
    || navigation.get("parentbotid")?.ReferencingEntityNavigationPropertyName !== "parentbotid"
    || navigation.get("parentbotcomponentid")?.ReferencedEntity !== "botcomponent"
    || navigation.get("parentbotcomponentid")?.ReferencingEntityNavigationPropertyName !== "ParentBotComponentId") {
    throw new ReviewError("EVALUATION_NATIVE_SCHEMA", "The target's case-sensitive parent bind names do not match the verified native contract.");
  }
  const entitySet = definition.data.EntitySetName;
  const bots = await client.entitySet("bot");
  const bot = z.object({ botid: z.string().transform(value => guid(value)), configuration: z.string().nullable().optional(), statecode: z.literal(0) })
    .safeParse(await client.get(`${bots}(${botId})?$select=botid,configuration,statecode`));
  if (!bot.success || bot.data.botid !== botId) throw new ReviewError("AGENT_NOT_FOUND", "The selected target is unavailable for native save.");
  if (bot.data.configuration) {
    try { z.record(z.unknown()).parse(JSON.parse(bot.data.configuration)); }
    catch { throw new ReviewError("EVALUATION_NATIVE_HARNESS", "The target's harness configuration is invalid. No native write was sent."); }
  }
  const templates = await client.list(`${entitySet}?$select=botcomponentid,name,schemaname,componenttype,data,statecode,_parentbotid_value,_parentbotcomponentid_value,createdon&$filter=_parentbotid_value eq ${botId} and componenttype eq 19 and statecode eq 0&$orderby=botcomponentid asc`, metadataLimits);
  const rows = templates.map(value => {
    const row = recordSchema.extend({ createdon: z.string().nullable().optional() }).safeParse(value);
    if (!row.success || row.data._parentbotid_value !== botId) throw new ReviewError("EVALUATION_NATIVE_TEMPLATE", "The saved native template is incomplete or belongs to a different agent.");
    return row.data;
  });
  const root = rows.find(row => row._parentbotcomponentid_value === null && templateRoot.safeParse(parseYaml(row.data)).success
    && rows.some(child => child._parentbotcomponentid_value === row.botcomponentid && templateCase.safeParse(parseYaml(child.data)).success));
  // Copilot Studio creates native evaluation components with the "mspva" schema prefix. A target's
  // existing evaluation components prove its prefix; otherwise the verified field and relationship
  // contract above plus exact read-back after the write protect the save.
  const prefixSource = root ?? rows[0];
  const prefix = prefixSource ? prefixSource.schemaname.match(/^([a-z][a-z0-9]*)_/i)?.[1] : NATIVE_EVALUATION_SCHEMA_PREFIX;
  if (!prefix) throw new ReviewError("EVALUATION_NATIVE_UNPROVED", "This target has no verified EvaluationSet and Conversation component template. Native save is unavailable; the documented Single response CSV and evidence export remain available.");
  const allowMultiPair = !usesCopilotHarness(bot.data.configuration);
  return {
    schemaPrefix: prefix, allowMultiPair, components: rows,
    read: async ids => {
      const filter = ids.map(id => `botcomponentid eq ${guid(id)}`).join(" or ");
      const actual = await client.list(`${entitySet}?$select=botcomponentid,name,schemaname,componenttype,data,statecode,_parentbotid_value,_parentbotcomponentid_value&$filter=${filter}`, { maxItems: 21, maxBytes: 512 * 1024 });
      return actual.map(value => {
        const row = recordSchema.safeParse(value);
        if (!row.success) throw new ReviewError("EVALUATION_READBACK_MISMATCH", "A saved component has incomplete native fields or relationships.");
        return row.data;
      });
    },
    create: async records => {
      const creates = records.map(({ _parentbotid_value, _parentbotcomponentid_value, ...body }) => ({
        entitySet, body: {
          ...body, "parentbotid@odata.bind": `/${bots}(${guid(_parentbotid_value)})`,
          ...(_parentbotcomponentid_value ? { "ParentBotComponentId@odata.bind": `/${entitySet}(${guid(_parentbotcomponentid_value)})` } : {}),
        },
      }));
      await client.createAtomic(creates);
    },
    ...(client.update ? { update: async (id: string, data: string) => { await client.update!(`${entitySet}(${guid(id)})`, { data }); } } : {}),
    ...(client.delete ? { remove: async (id: string) => { await client.delete!(`${entitySet}(${guid(id)})`); } } : {}),
  };
}
