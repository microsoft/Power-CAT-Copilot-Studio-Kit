import type { EvaluationCaseUpdateInput, EvaluationDraft, EvaluationMethod, EvaluationSaveReceipt, EvaluationTarget, EvaluationTestType, EvaluationTurn, NativeEvaluationInput, EvaluationCase } from "./contracts.js";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import yaml from "js-yaml";
import { z } from "zod";
import { ReviewError } from "../agent-review/server/types.js";
import { validateEvaluationSelection, validateEvaluationText } from "./validation.js";

export interface NativeComponentRecord {
  botcomponentid: string;
  name: string;
  schemaname: string;
  componenttype: number;
  data: string;
  statecode: number;
  _parentbotid_value: string;
  _parentbotcomponentid_value: string | null;
}

export interface NativeEvaluationContext {
  schemaPrefix: string;
  allowMultiPair: boolean;
  read(ids: readonly string[]): Promise<NativeComponentRecord[]>;
  create(records: readonly NativeComponentRecord[]): Promise<void>;
  /** Replace the data of one existing component (used by generated, auto-saved sets). */
  update?(id: string, data: string): Promise<void>;
  /** Delete one existing child component (used by generated, auto-saved sets). */
  remove?(id: string): Promise<void>;
  /** The agent's active evaluation components, read when the context was inspected. */
  components?: readonly NativeComponentListing[];
}
export type NativeContextFactory = (target: EvaluationTarget) => Promise<NativeEvaluationContext>;
/** A listed evaluation component with its creation time. */
export interface NativeComponentListing extends NativeComponentRecord {
  createdon?: string | null;
}
/** A saved generated set, read from the agent's components. Records keep only the compared native fields. */
export interface SavedGeneratedSet {
  root: NativeComponentRecord;
  method: EvaluationMethod;
  createdOn?: string;
  cases: Array<{ record: NativeComponentRecord; turns: EvaluationTurn[] }>;
}

const savedRoot = z.object({ kind: z.literal("EvaluationSet"), graders: z.array(z.object({ kind: z.string() })).optional() });
const savedCase = z.object({
  kind: z.literal("MultiTurnEvaluationCase"),
  activities: z.array(z.object({ activity: z.object({
    value: z.object({ from: z.object({ role: z.string() }) }),
    text: z.array(z.string()).min(1),
  }) })).min(2),
  extensionData: z.object({ displayOrder: z.union([z.string(), z.number()]).optional() }).passthrough().nullable().optional(),
});

/** Generated sets are named "<agent> – generated evals – <yyyy-mm-dd>" (en dash), cut to 200 characters. */
export function generatedSetPrefix(agentName: string): string {
  return `${agentName} – generated evals`.slice(0, 200);
}
function loadYaml(data: string): unknown {
  try { return yaml.load(data); } catch { return undefined; }
}
function createdTime(value: string | null | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}
function nativeFields(row: NativeComponentRecord): NativeComponentRecord {
  const { botcomponentid, name, schemaname, componenttype, data, statecode, _parentbotid_value, _parentbotcomponentid_value } = row;
  return {
    botcomponentid: botcomponentid.toLowerCase(), name, schemaname, componenttype, data, statecode,
    _parentbotid_value: _parentbotid_value.toLowerCase(), _parentbotcomponentid_value: _parentbotcomponentid_value?.toLowerCase() ?? null,
  };
}
/** Alternating user and agent activities become turns: user text is the question, agent text the expected response. */
function savedTurns(row: NativeComponentRecord): { order: number; turns: EvaluationTurn[] } | undefined {
  const parsed = savedCase.safeParse(loadYaml(row.data));
  if (!parsed.success || parsed.data.activities.length % 2) return undefined;
  const turns: EvaluationTurn[] = [];
  for (let index = 0; index < parsed.data.activities.length; index += 2) {
    const user = parsed.data.activities[index].activity;
    const agent = parsed.data.activities[index + 1].activity;
    if (user.value.from.role !== "user" || agent.value.from.role !== "agent") return undefined;
    turns.push({ question: user.text.join("\n"), observedResponse: "", expectedResponse: agent.text.join("\n"), userTurnId: "", assistantTurnIds: [] });
  }
  const order = Number(parsed.data.extensionData?.displayOrder ?? Number.NaN);
  return { order: Number.isFinite(order) ? order : Number.MAX_SAFE_INTEGER, turns };
}

/**
 * The newest saved generated set of an agent, without any write: an active root EvaluationSet whose
 * name starts with "<agent> – generated evals" and that has at least one readable Conversation case.
 * Cases keep their saved display order.
 */
export function findGeneratedSet(listing: readonly NativeComponentListing[], agentName: string): SavedGeneratedSet | undefined {
  const prefix = generatedSetPrefix(agentName);
  const components = listing
    .filter(row => row.componenttype === 19 && row.statecode === 0)
    .map(row => ({ ...nativeFields(row), createdon: row.createdon }));
  const roots = components
    .filter(row => row._parentbotcomponentid_value === null && row.name.startsWith(prefix))
    .sort((a, b) => createdTime(b.createdon) - createdTime(a.createdon) || a.botcomponentid.localeCompare(b.botcomponentid));
  for (const root of roots) {
    const parsedRoot = savedRoot.safeParse(loadYaml(root.data));
    if (!parsedRoot.success) continue;
    const cases = components
      .filter(row => row._parentbotcomponentid_value === root.botcomponentid)
      .flatMap(row => { const saved = savedTurns(row); return saved ? [{ row, ...saved }] : []; })
      .sort((a, b) => a.order - b.order || createdTime(a.row.createdon) - createdTime(b.row.createdon) || a.row.botcomponentid.localeCompare(b.row.botcomponentid))
      .map(item => ({ record: nativeFields(item.row), turns: item.turns }));
    if (!cases.length) continue;
    const method = parsedRoot.data.graders?.[0]?.kind === "ExactMatchGrader" ? "ExactMatchGrader" : "GeneralQualityGrader";
    return { root: nativeFields(root), method, ...(root.createdon ? { createdOn: root.createdon } : {}), cases };
  }
  return undefined;
}

interface StoredDraft {
  caller: string;
  saveGrant: string;
  expires: number;
  draft: EvaluationDraft;
  /** A generated draft keeps one native set. A repeated save returns that set and sends no new create. */
  generated: boolean;
}
interface StoredSave {
  signature: string;
  stored: StoredDraft;
  input: NativeEvaluationInput;
  setId: string;
  caseIds: string[];
  records?: NativeComponentRecord[];
  attempted: boolean;
  pending: boolean;
  promise?: Promise<EvaluationSaveReceipt>;
  receipt?: EvaluationSaveReceipt;
}
const DRAFT_LIFETIME_MS = 30 * 60 * 1000;
const DRAFT_BYTES = 4 * 1024 * 1024;
const MAX_STORED_DRAFTS = 64;

function fingerprint(token: string): string {
  if (!token) throw new ReviewError("AUTH_REQUIRED", "Sign in to build agent evaluations.");
  return createHash("sha256").update(token).digest("hex");
}
function immutableId(value: string): string {
  const bytes = createHash("sha256").update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function sameGrant(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
function exactRows(actual: readonly NativeComponentRecord[], expected: readonly NativeComponentRecord[]): boolean {
  const byId = new Map(actual.map(row => [row.botcomponentid.toLowerCase(), row]));
  return actual.length === expected.length && byId.size === expected.length && expected.every(row => {
    const found = byId.get(row.botcomponentid);
    return found && Object.entries(row).every(([key, value]) => {
      const actualValue = found[key as keyof NativeComponentRecord];
      return key.endsWith("_value") && typeof value === "string"
        ? typeof actualValue === "string" && actualValue.toLowerCase() === value
        : actualValue === value;
    });
  });
}
function encodeNativeRows(entry: StoredSave, context: NativeEvaluationContext): NativeComponentRecord[] {
  const draft = entry.stored.draft;
  const selected = validateEvaluationSelection(draft.testType, entry.input.method, draft.cases, entry.input.selectedCases);
  if (selected.some(item => item.recordedMessages && (
    item.recordedMessages.length !== item.turns.length * 2
    || item.recordedMessages.some((message, index) => message.role !== (index % 2 === 0 ? "user" : "assistant"))
  ))) {
    throw new ReviewError("EVALUATION_NATIVE_SEQUENCE_UNSUPPORTED", "A recorded case does not have alternating question/answer pairs. Native save would change its message sequence. Export its complete evidence instead; no write was sent.");
  }
  if (!context.allowMultiPair && selected.some(item => item.turns.length > 1)) {
    throw new ReviewError("EVALUATION_HARNESS_UNSUPPORTED", "This target has not proved support for multi-pair Conversation cases. Use the evidence report, or select a supported single-pair Conversation. No write was sent.");
  }
  if (!/^[a-z][a-z0-9]*$/i.test(context.schemaPrefix)) throw new ReviewError("EVALUATION_NATIVE_SCHEMA", "The target's native component schema prefix is unavailable.");
  const record = (id: string, name: string, data: unknown, parent: string | null): NativeComponentRecord => ({
    botcomponentid: id, name, schemaname: `${context.schemaPrefix}_${id}`,
    componenttype: 19, data: yaml.dump(data, { noRefs: true, lineWidth: -1, forceQuotes: true }),
    statecode: 0, _parentbotid_value: draft.target.agent.id.toLowerCase(), _parentbotcomponentid_value: parent,
  });
  return [
    record(entry.setId, entry.input.name, { kind: "EvaluationSet", graders: [{ kind: entry.input.method }] }, null),
    ...selected.map((item, index) => record(entry.caseIds[index], `Case ${index + 1}`, caseData(item, index), entry.setId)),
  ];
}
function caseData(item: EvaluationCase, index: number): unknown {
  return {
    kind: "MultiTurnEvaluationCase", source: "Manual",
    activities: item.turns.flatMap(turn => [
      { activity: { value: { from: { role: "user" } }, text: [turn.question] } },
      { activity: { value: { from: { role: "agent" } }, text: [turn.expectedResponse] } },
    ]),
    extensionData: { displayOrder: String(index) },
  };
}

export class EvaluationDraftRegistry {
  private readonly drafts = new Map<string, StoredDraft>();
  private readonly saves = new Map<string, StoredSave>();
  constructor(private readonly now: () => number = Date.now) {}

  register(token: string, target: EvaluationTarget, testType: EvaluationTestType, cases: EvaluationCase[], options: { generated?: boolean } = {}): { draft: EvaluationDraft; saveGrant: string } {
    const caller = fingerprint(token);
    for (const [id, entry] of this.drafts) if (entry.expires < this.now()) this.drafts.delete(id);
    if (this.drafts.size >= MAX_STORED_DRAFTS) throw new ReviewError("EVALUATION_CAPACITY", "The temporary draft store is full. Wait for an older draft to expire.");
    const draft = structuredClone({ id: randomUUID(), target, testType, cases, createdOn: new Date(this.now()).toISOString() });
    if (cases.length > 1000 || Buffer.byteLength(JSON.stringify(draft), "utf8") > DRAFT_BYTES) {
      throw new ReviewError("EVALUATION_DRAFT_LIMIT", "Mining is limited to 1000 candidates and a 4 MiB complete draft. Select fewer conversations. No partial draft was returned.");
    }
    const saveGrant = randomBytes(32).toString("base64url");
    this.drafts.set(draft.id, { caller, saveGrant, expires: this.now() + DRAFT_LIFETIME_MS, draft, generated: options.generated === true });
    return { draft: structuredClone(draft), saveGrant };
  }

  private stored(token: string, draftId: string): StoredDraft {
    const caller = fingerprint(token);
    const entry = this.drafts.get(draftId);
    if (!entry || entry.caller !== caller) throw new ReviewError("EVALUATION_DRAFT_UNAVAILABLE", "This draft is unavailable to the caller. It is not shared between signed-in sessions.");
    if (entry.expires < this.now()) throw new ReviewError("EVALUATION_DRAFT_EXPIRED", "This temporary draft has expired. Export the edited draft and mine a new one before any new save.");
    return entry;
  }

  read(token: string, draftId: string): { draft: EvaluationDraft; saveGrant: string } {
    const stored = this.stored(token, draftId);
    return { draft: structuredClone(stored.draft), saveGrant: stored.saveGrant };
  }

  private receipt(entry: StoredSave, verified: boolean, message: string): EvaluationSaveReceipt {
    const { environment, agent } = entry.stored.draft.target;
    return {
      state: verified ? "saved" : "unconfirmed", requestId: entry.input.requestId,
      setId: entry.setId, caseIds: [...entry.caseIds], verified,
      studioUrl: `https://copilotstudio.microsoft.com/environments/${encodeURIComponent(environment.id)}/agents/${encodeURIComponent(agent.id)}/evaluate`,
      message,
    };
  }

  private unconfirmed(entry: StoredSave, error: unknown): EvaluationSaveReceipt {
    if (!(error instanceof ReviewError)) console.error("Native evaluation save confirmation failed.", error);
    return this.receipt(entry, false, `${error instanceof ReviewError ? error.message : "The native save response could not be confirmed."} Keep these component IDs and use Check existing set. Do not create a replacement set. No evaluation was run.`);
  }

  /**
   * Save the selected cases of a draft as one native Conversation set. A generated draft keeps one
   * set: a later save with any request ID shares its pending run or returns its receipt, and sends no
   * write. If that run stopped before a create, a later save runs it again with its first input and IDs.
   */
  async save(token: string, input: NativeEvaluationInput, contextFactory: NativeContextFactory): Promise<EvaluationSaveReceipt> {
    const caller = fingerprint(token);
    const generated = this.generatedEntry(caller, input.draftId);
    if (generated) {
      if (!sameGrant(input.saveGrant, generated.stored.saveGrant)) throw new ReviewError("EVALUATION_INVALID_GRANT", "The native save grant is invalid.");
      if (generated.pending && generated.promise) return generated.promise;
      if (generated.receipt) return structuredClone(generated.receipt);
      if (generated.attempted) throw new ReviewError("EVALUATION_CONFIRMATION_FAILED", "The existing confirmation failed before a write. Correct the reported prerequisite before confirming a new request.");
      this.stored(token, input.draftId); // A new run can write, so the draft must still be live for this caller.
      if (!input.confirmed) throw new ReviewError("EVALUATION_CONFIRMATION_REQUIRED", "Explicit selected-case confirmation is required.");
      return this.run(generated, contextFactory);
    }
    const key = `${caller}:${input.requestId.toLowerCase()}`;
    const signature = JSON.stringify({
      draftId: input.draftId, name: input.name, method: input.method, selectedCases: input.selectedCases, confirmed: input.confirmed,
    });
    const existing = this.saves.get(key);
    if (existing) {
      if (!sameGrant(input.saveGrant, existing.stored.saveGrant)) throw new ReviewError("EVALUATION_INVALID_GRANT", "The native save grant is invalid.");
      if (signature !== existing.signature) throw new ReviewError("EVALUATION_REQUEST_CHANGED", "The confirmed request changed. Its UUID cannot be reused for different content.");
      if (existing.pending && existing.promise) return existing.promise;
      if (existing.receipt) return structuredClone(existing.receipt);
      throw new ReviewError("EVALUATION_CONFIRMATION_FAILED", "The existing confirmation failed before a write. Correct the reported prerequisite before confirming a new request.");
    }
    const stored = this.stored(token, input.draftId);
    if (!sameGrant(input.saveGrant, stored.saveGrant)) throw new ReviewError("EVALUATION_INVALID_GRANT", "The native save grant is invalid.");
    if (!input.confirmed) throw new ReviewError("EVALUATION_CONFIRMATION_REQUIRED", "Explicit selected-case confirmation is required.");
    if (stored.draft.testType !== "conversation") throw new ReviewError("EVALUATION_NATIVE_TYPE_UNPROVED", "Native single-response serialization has not been proved. Export the documented Single response CSV instead.");
    validateEvaluationText(input.name, "Test set name", 200);
    if (!input.name.trim()) throw new ReviewError("EVALUATION_NAME_REQUIRED", "Enter a test set name.");
    validateEvaluationSelection(stored.draft.testType, input.method, stored.draft.cases, input.selectedCases);
    if ([...this.saves.values()].some(entry => entry.stored.caller === caller && entry.stored.draft.id === input.draftId
      && (entry.pending || entry.receipt?.state === "unconfirmed"))) {
      throw new ReviewError("EVALUATION_RECOVERY_REQUIRED", "Recover the existing set before another confirmation for this draft.");
    }
    if (this.saves.size >= MAX_STORED_DRAFTS) this.pruneSaves();
    if (this.saves.size >= MAX_STORED_DRAFTS) throw new ReviewError("EVALUATION_CAPACITY", "The immutable save registry is full. No new write was sent.");
    const entry: StoredSave = {
      signature, stored, input: structuredClone(input), setId: immutableId(`${key}:${input.draftId}:root`),
      caseIds: input.selectedCases.map(item => immutableId(`${key}:${input.draftId}:${item.caseId}`)),
      attempted: false, pending: true,
    };
    this.saves.set(key, entry);
    return this.run(entry, contextFactory);
  }

  /** The one save entry of a generated draft for this caller, whatever request ID made it. */
  private generatedEntry(caller: string, draftId: string): StoredSave | undefined {
    for (const entry of this.saves.values()) {
      if (entry.stored.generated && entry.stored.caller === caller && entry.stored.draft.id === draftId) return entry;
    }
    return undefined;
  }

  /** At capacity, forget verified saves whose drafts expired. Their sets are complete, and opening Eval Builder shows them again. */
  private pruneSaves(): void {
    for (const [key, entry] of this.saves) {
      if (!entry.pending && entry.receipt?.verified && entry.stored.expires < this.now()) this.saves.delete(key);
    }
  }

  /**
   * Show an existing generated set without any write. Registers a generated draft of its cases (request
   * ID = draft ID) and a verified save entry with the set's real IDs and read rows for this caller, so a
   * later save returns that set and inline edits or deletions update it.
   */
  adopt(token: string, target: EvaluationTarget, set: SavedGeneratedSet): { draft: EvaluationDraft; saveGrant: string; receipt: EvaluationSaveReceipt } {
    const caller = fingerprint(token);
    const agentId = target.agent.id.toLowerCase();
    const records = [set.root, ...set.cases.map(item => item.record)].map(row => nativeFields(row));
    if (!set.cases.length || records.some(row => row._parentbotid_value !== agentId)
      || set.cases.some(item => item.record._parentbotcomponentid_value?.toLowerCase() !== records[0].botcomponentid)) {
      throw new ReviewError("EVALUATION_TARGET_CHANGED", "The saved set does not belong to the selected agent. Nothing was changed.");
    }
    if (this.saves.size >= MAX_STORED_DRAFTS) this.pruneSaves();
    if (this.saves.size >= MAX_STORED_DRAFTS) throw new ReviewError("EVALUATION_CAPACITY", "The immutable save registry is full. No new write was sent.");
    const cases: EvaluationCase[] = set.cases.map(({ record, turns }) => ({
      id: record.botcomponentid.toLowerCase(), question: turns[0].question, turns: structuredClone(turns), outcome: "unknown", path: [], pathKey: "",
      provenance: { conversationId: "", transcriptId: "", userTurnIds: [], activityIds: [] },
    }));
    const { draft, saveGrant } = this.register(token, target, "conversation", cases, { generated: true });
    const input: NativeEvaluationInput = {
      draftId: draft.id, saveGrant, requestId: draft.id, name: set.root.name, method: set.method, confirmed: true,
      selectedCases: cases.map(item => ({ caseId: item.id, expectedResponses: item.turns.map(turn => turn.expectedResponse), questions: item.turns.map(turn => turn.question) })),
    };
    const entry: StoredSave = {
      signature: JSON.stringify({ draftId: input.draftId, name: input.name, method: input.method, selectedCases: input.selectedCases, confirmed: input.confirmed }),
      stored: this.drafts.get(draft.id)!, input, setId: records[0].botcomponentid, caseIds: cases.map(item => item.id),
      records, attempted: true, pending: false,
    };
    entry.receipt = this.receipt(entry, true, "Showing the existing generated set as read from Copilot Studio. Nothing was created or changed, and no evaluation was run.");
    this.saves.set(`${caller}:${draft.id.toLowerCase()}`, entry);
    return { draft, saveGrant, receipt: structuredClone(entry.receipt) };
  }

  /**
   * Run one save entry with its stored input and IDs. Calls during the run share its promise. A read
   * before the create verifies a complete existing set or refuses a partial set. The create runs only when no row exists.
   */
  private run(entry: StoredSave, contextFactory: NativeContextFactory): Promise<EvaluationSaveReceipt> {
    entry.pending = true;
    entry.promise = (async () => {
      try {
        const context = await contextFactory(entry.stored.draft.target);
        const records = encodeNativeRows(entry, context);
        entry.records = records;
        const ids = [entry.setId, ...entry.caseIds];
        const before = await context.read(ids);
        if (before.length) {
          if (!exactRows(before, records)) throw new ReviewError("EVALUATION_READBACK_MISMATCH", "An existing component does not match the complete immutable set. It was not overwritten.");
          entry.receipt = this.receipt(entry, true, "Verified the complete existing native Conversation set. No evaluation was run or agent published.");
          return structuredClone(entry.receipt);
        }
        if (entry.stored.generated && context.components && findGeneratedSet(context.components, entry.stored.draft.target.agent.name)) {
          throw new ReviewError("EVALUATION_GENERATED_SET_EXISTS", "This agent already has a generated set. Open Eval Builder again to show it. No new set was created.");
        }
        entry.attempted = true;
        try {
          await context.create(records);
          const after = await context.read(ids);
          if (!exactRows(after, records)) throw new ReviewError("EVALUATION_READBACK_MISMATCH", "The saved components do not match the complete requested set and parent relationships.");
          entry.receipt = this.receipt(entry, true, "Saved and read back every native Conversation component and parent relationship. Studio rendering and grading have not been tested. No evaluation was run or agent published.");
        } catch (error) {
          entry.receipt = this.unconfirmed(entry, error);
        }
        return structuredClone(entry.receipt);
      } finally {
        entry.pending = false;
      }
    })();
    return entry.promise;
  }

  async recover(token: string, input: { draftId: string; saveGrant: string; requestId: string }, contextFactory: NativeContextFactory): Promise<EvaluationSaveReceipt> {
    const caller = fingerprint(token);
    const entry = this.saves.get(`${caller}:${input.requestId.toLowerCase()}`) ?? this.generatedEntry(caller, input.draftId);
    if (!entry || entry.stored.draft.id !== input.draftId || !sameGrant(input.saveGrant, entry.stored.saveGrant)) {
      throw new ReviewError("EVALUATION_SAVE_UNAVAILABLE", "This immutable save is unavailable to the caller or its grant is invalid.");
    }
    if (entry.pending && entry.promise) return entry.promise;
    if (!entry.records || !entry.attempted) throw new ReviewError("EVALUATION_WRITE_NOT_ATTEMPTED", "This request did not reach a native write. Correct its prerequisite, then open Eval Builder again.");
    try {
      const context = await contextFactory(entry.stored.draft.target);
      const rows = await context.read([entry.setId, ...entry.caseIds]);
      if (!exactRows(rows, entry.records)) throw new ReviewError("EVALUATION_READBACK_MISMATCH", "The complete existing components or relationships are missing or do not match. No new write was sent.");
      entry.receipt = this.receipt(entry, true, "Verified the complete existing native Conversation set. No new write, evaluation run or publication occurred.");
    } catch (error) {
      entry.receipt = this.unconfirmed(entry, error);
    }
    return structuredClone(entry.receipt);
  }

  /**
   * Edit or delete one case of a verified saved set. Used by generated sets, which are saved
   * automatically and then kept in sync with inline edits. Each write is read back exactly.
   * A generated draft also accepts the request ID of a later save, because it keeps one set.
   */
  async updateCase(token: string, input: EvaluationCaseUpdateInput, contextFactory: NativeContextFactory): Promise<EvaluationSaveReceipt> {
    const caller = fingerprint(token);
    const entry = this.saves.get(`${caller}:${input.requestId.toLowerCase()}`) ?? this.generatedEntry(caller, input.draftId);
    if (!entry || entry.stored.draft.id !== input.draftId || !sameGrant(input.saveGrant, entry.stored.saveGrant)) {
      throw new ReviewError("EVALUATION_SAVE_UNAVAILABLE", "This saved set is unavailable to the caller or its grant is invalid.");
    }
    if (entry.pending || !entry.receipt?.verified || !entry.records) {
      throw new ReviewError("EVALUATION_SAVE_UNCONFIRMED", "The set must be saved and verified before its cases can change.");
    }
    const index = entry.input.selectedCases.findIndex(item => item.caseId === input.caseId);
    if (index < 0) throw new ReviewError("EVALUATION_INVALID_SELECTION", "This case is not part of the saved set.");
    const id = entry.caseIds[index];
    const context = await contextFactory(entry.stored.draft.target);
    if (input.remove) {
      if (entry.caseIds.length <= 1) throw new ReviewError("EVALUATION_SELECTION_REQUIRED", "A saved set keeps at least one case.");
      if (!context.remove) throw new ReviewError("EVALUATION_NATIVE_SCHEMA", "This target cannot delete saved cases.");
      await context.remove(id);
      if ((await context.read([id])).length) throw new ReviewError("EVALUATION_READBACK_MISMATCH", "The deleted case is still present.");
      entry.caseIds.splice(index, 1);
      entry.input.selectedCases.splice(index, 1);
      entry.records = entry.records.filter(row => row.botcomponentid !== id);
      entry.receipt = this.receipt(entry, true, "Deleted the case from the saved set. No evaluation was run.");
      return structuredClone(entry.receipt);
    }
    const original = entry.stored.draft.cases.find(item => item.id === input.caseId);
    const question = input.question.trim();
    const expectedResponse = input.expectedResponse.trim();
    if (!original || original.turns.length !== 1) throw new ReviewError("EVALUATION_TYPE_CHANGED", "Only single-pair cases can be edited after saving.");
    if (!question) throw new ReviewError("EVALUATION_QUESTION_REQUIRED", "Each case needs a question.");
    if (!expectedResponse) throw new ReviewError("EVALUATION_EXPECTATION_REQUIRED", "Each saved case needs an expected response.");
    validateEvaluationText(question, "Question", 16_000);
    validateEvaluationText(expectedResponse, "Expected response", 16_000);
    if (!context.update) throw new ReviewError("EVALUATION_NATIVE_SCHEMA", "This target cannot update saved cases.");
    const current = entry.records.find(row => row.botcomponentid === id);
    if (!current) throw new ReviewError("EVALUATION_READBACK_MISMATCH", "The saved case record is unavailable.");
    const next: NativeComponentRecord = {
      ...current,
      data: yaml.dump(caseData({ ...original, turns: [{ ...original.turns[0], question, expectedResponse }] }, index), { noRefs: true, lineWidth: -1, forceQuotes: true }),
    };
    await context.update(id, next.data);
    if (!exactRows(await context.read([id]), [next])) throw new ReviewError("EVALUATION_READBACK_MISMATCH", "The updated case does not match the requested text.");
    entry.records = entry.records.map(row => row.botcomponentid === id ? next : row);
    entry.input.selectedCases[index] = { caseId: input.caseId, expectedResponses: [expectedResponse], questions: [question] };
    entry.receipt = this.receipt(entry, true, "Updated the saved case. No evaluation was run.");
    return structuredClone(entry.receipt);
  }
}
