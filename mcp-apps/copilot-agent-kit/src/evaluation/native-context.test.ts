import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectNativeEvaluationTarget } from "./native-context.js";
import type { NativeComponentRecord } from "./native.js";
import type { AtomicCreate } from "./batch.js";
import { ReviewError } from "../agent-review/server/types.js";

const botId = "11111111-1111-4111-8111-111111111111";
const rootId = "22222222-2222-4222-8222-222222222222";
const childId = "33333333-3333-4333-8333-333333333333";
function fixture() {
  let fields = [
    { LogicalName: "componenttype", AttributeType: "Picklist" }, { LogicalName: "data", AttributeType: "Memo" },
    { LogicalName: "parentbotid", AttributeType: "Lookup" }, { LogicalName: "parentbotcomponentid", AttributeType: "Lookup" },
  ];
  let relationships = [
    { ReferencingAttribute: "parentbotid", ReferencedEntity: "bot", ReferencingEntityNavigationPropertyName: "parentbotid" },
    { ReferencingAttribute: "parentbotcomponentid", ReferencedEntity: "botcomponent", ReferencingEntityNavigationPropertyName: "ParentBotComponentId" },
  ];
  let configuration = "{}";
  const root: NativeComponentRecord = {
    botcomponentid: rootId, name: "Existing root", schemaname: `mspva_${rootId}`, componenttype: 19, statecode: 0,
    data: "kind: EvaluationSet\ngraders:\n  - kind: ExactMatchGrader\n", _parentbotid_value: botId, _parentbotcomponentid_value: null,
  };
  const child: NativeComponentRecord = {
    ...root, botcomponentid: childId, name: "Existing Conversation", schemaname: `mspva_${childId}`, _parentbotcomponentid_value: rootId,
    data: "kind: MultiTurnEvaluationCase\nsource: Manual\nactivities:\n  - activity:\n      value:\n        from:\n          role: user\n      text: [question]\n  - activity:\n      value:\n        from:\n          role: agent\n      text: [answer]\n",
  };
  let rows = [root, child];
  const requests: string[] = [];
  const writes: AtomicCreate[][] = [];
  const client = {
    get: async (path: string) => {
      requests.push(path);
      if (path.startsWith("EntityDefinitions(")) return { EntitySetName: "botcomponents", PrimaryIdAttribute: "botcomponentid" };
      return { botid: botId, statecode: 0, configuration };
    },
    entitySet: async (logicalName: string) => logicalName === "bot" ? "bots" : "botcomponents",
    list: async (path: string) => {
      requests.push(path);
      if (path.includes("/Attributes?")) return fields;
      if (path.includes("/ManyToOneRelationships/")) return relationships;
      return rows;
    },
    createAtomic: async (creates: readonly AtomicCreate[]) => { writes.push(structuredClone([...creates])); },
  };
  return { client, requests, writes, root, child,
    setFields: (value: typeof fields) => { fields = value; },
    setRelationships: (value: typeof relationships) => { relationships = value; },
    setConfiguration: (value: string) => { configuration = value; }, setRows: (value: NativeComponentRecord[]) => { rows = value; },
  };
}
test("native metadata check is read-only and uses typed case-sensitive parent relationship metadata", async () => {
  const f = fixture();
  const context = await inspectNativeEvaluationTarget(f.client, botId);
  assert.equal(context.schemaPrefix, "mspva");
  assert.equal(context.allowMultiPair, true);
  assert.ok(f.requests.some(path => path.includes("/ManyToOneRelationships/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata")));
  assert.equal(f.writes.length, 0);
});
test("native adapter writes one changeset with exact parent binds and without raw lookup-value fields", async () => {
  const f = fixture();
  const context = await inspectNativeEvaluationTarget(f.client, botId);
  await context.create([f.root, f.child]);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0][0].body["parentbotid@odata.bind"], `/bots(${botId})`);
  assert.equal(f.writes[0][1].body["ParentBotComponentId@odata.bind"], `/botcomponents(${rootId})`);
  assert.equal(f.writes[0][0].body._parentbotid_value, undefined);
  assert.equal(f.writes[0][1].body._parentbotcomponentid_value, undefined);
});
test("wrong-case bind metadata, changed field types, or unrelated templates reject native support", async () => {
  const navigation = fixture();
  navigation.setRelationships([
    { ReferencingAttribute: "parentbotid", ReferencedEntity: "bot", ReferencingEntityNavigationPropertyName: "parentbotid" },
    { ReferencingAttribute: "parentbotcomponentid", ReferencedEntity: "botcomponent", ReferencingEntityNavigationPropertyName: "parentbotcomponentid" },
  ]);
  await assert.rejects(() => inspectNativeEvaluationTarget(navigation.client, botId), /case-sensitive/);
  const fields = fixture();
  fields.setFields([{ LogicalName: "componenttype", AttributeType: "Integer" }]);
  await assert.rejects(() => inspectNativeEvaluationTarget(fields.client, botId), /fields/);
  const target = fixture();
  target.setRows([{ ...target.root, _parentbotid_value: childId }, target.child]);
  await assert.rejects(() => inspectNativeEvaluationTarget(target.client, botId), /different agent/);
});
test("GitHub Copilot harness blocks unproved multi-pair native support while keeping one-pair Conversation type honest", async () => {
  const f = fixture();
  f.setConfiguration('{"agentSettings":{}}');
  const context = await inspectNativeEvaluationTarget(f.client, botId);
  assert.equal(context.allowMultiPair, false);
});
test("native support cannot become successful after an API or metadata-read error", async () => {
  const f = fixture();
  f.client.get = async () => { throw new ReviewError("DATAVERSE_ERROR", "Fixture access failure."); };
  await assert.rejects(() => inspectNativeEvaluationTarget(f.client, botId), /Fixture access failure/);
});

test("an agent without any evaluation set uses the native mspva prefix after the schema checks pass", async () => {
  const f = fixture();
  f.setRows([]);
  const context = await inspectNativeEvaluationTarget(f.client, botId);
  assert.equal(context.schemaPrefix, "mspva");
  assert.equal(f.writes.length, 0);
  const broken = fixture();
  broken.setRows([]);
  broken.setFields([{ LogicalName: "componenttype", AttributeType: "Integer" }]);
  await assert.rejects(() => inspectNativeEvaluationTarget(broken.client, botId), /fields/);
});
test("existing evaluation components keep their own schema prefix; an unreadable prefix blocks native save", async () => {
  const f = fixture();
  f.setRows([{ ...f.root, schemaname: `cr123_${rootId}` }]);
  assert.equal((await inspectNativeEvaluationTarget(f.client, botId)).schemaPrefix, "cr123");
  const bad = fixture();
  bad.setRows([{ ...bad.root, schemaname: "nounderscore" }]);
  await assert.rejects(() => inspectNativeEvaluationTarget(bad.client, botId), /no verified EvaluationSet/);
});

test("the inspected context exposes the agent's evaluation components with their creation time, read only", async () => {
  const f = fixture();
  f.setRows([{ ...f.root, createdon: "2026-10-14T08:00:00Z" } as NativeComponentRecord, f.child]);
  const context = await inspectNativeEvaluationTarget(f.client, botId);
  assert.deepEqual(context.components?.map(row => [row.botcomponentid, row._parentbotcomponentid_value, row.createdon]), [
    [rootId, null, "2026-10-14T08:00:00Z"], [childId, rootId, undefined],
  ]);
  const listing = f.requests.find(path => path.startsWith("botcomponents?"));
  assert.match(listing ?? "", /\$select=[^&]*,createdon&/);
  assert.match(listing ?? "", /componenttype eq 19 and statecode eq 0/);
  assert.equal(f.writes.length, 0);
});
