import { AgentDebuggerService, type DebuggerAgent, type DebuggerEnvironment } from "../agent-debugger/server/service.js";
import { EvaluationDraftRegistry, findGeneratedSet, type NativeEvaluationContext, type SavedGeneratedSet } from "./native.js";
import type { EvaluationDraft, EvaluationSaveReceipt, EvaluationTarget } from "./contracts.js";
import { DEFAULT_PROMPT_ENVIRONMENT, exactSelection } from "../tools/target-selection.js";
import { DataverseClient } from "../agent-review/server/dataverse.js";
import { ReviewError } from "../agent-review/server/types.js";
import { mineEvaluationTranscript } from "./mining.js";
import { inspectNativeEvaluationTarget } from "./native-context.js";
import { GENERATE_CONVERSATION_LIMIT, GENERATE_WINDOW_DAYS, selectGeneratedCases } from "./generate.js";

export interface EvaluationTargetInput {
  environmentId?: string;
  environmentName?: string;
  agentId?: string;
  agentName?: string;
  /** Ignored. Kept only so that older callers do not fail. */
  mode?: string;
}
export type EvaluationSources = Pick<AgentDebuggerService, "listEnvironments" | "listAgents" | "resolveAgent" | "listConversations" | "getConversationTranscript">;
export const evaluationDrafts = new EvaluationDraftRegistry();
export const AGENT_REQUIRED_MESSAGE = "No agent was named. Ask in chat for Eval Builder with the exact agent name. Nothing was generated or saved.";

export class EvaluationService {
  readonly sources: EvaluationSources;
  readonly registry: EvaluationDraftRegistry;
  constructor(readonly token: string, options?: { sources?: EvaluationSources; registry?: EvaluationDraftRegistry }) {
    if (!token) throw new ReviewError("AUTH_REQUIRED", "Sign in to build agent evaluations.");
    this.sources = options?.sources ?? new AgentDebuggerService(token);
    this.registry = options?.registry ?? evaluationDrafts;
  }
  async listEnvironments(): Promise<DebuggerEnvironment[]> { return this.sources.listEnvironments(); }
  async listAgents(environmentId: string): Promise<DebuggerAgent[]> { return this.sources.listAgents(environmentId); }

  async resolveTarget(input: EvaluationTargetInput): Promise<EvaluationTarget> {
    const environment = exactSelection(await this.listEnvironments(), "ENVIRONMENT", input.environmentId,
      input.environmentName ?? (input.environmentId ? undefined : DEFAULT_PROMPT_ENVIRONMENT));
    if (!input.agentId && !input.agentName?.trim()) throw new ReviewError("AGENT_NAME_REQUIRED", AGENT_REQUIRED_MESSAGE);
    const agent = await this.sources.resolveAgent(environment.id, input);
    return {
      environment, agent: { id: agent.id, name: agent.name, schemaName: agent.schemaName ?? "", componentIdUnique: agent.componentIdUnique },
    };
  }

  /**
   * Generate a reviewable Conversation draft from the agent's most recent authorized saved
   * conversations, without date or conversation selection. Nothing is saved or run. The draft is
   * marked as generated, so all later saves of it keep one native set.
   */
  async generate(input: EvaluationTargetInput, now = Date.now()) {
    const target = await this.resolveTarget(input);
    const startedAfter = new Date(now - GENERATE_WINDOW_DAYS * 86_400_000).toISOString();
    const conversations = await this.sources.listConversations(target.environment.id, target.agent.id, "", GENERATE_CONVERSATION_LIMIT, { startedAfter });
    const candidates = [];
    let unreadable = 0;
    for (const conversation of conversations.slice(0, GENERATE_CONVERSATION_LIMIT)) {
      try {
        const transcript = await this.sources.getConversationTranscript(target.environment.id, target.agent.id, conversation.id);
        candidates.push(...mineEvaluationTranscript(transcript, "single-response"));
      } catch (error) {
        if (error instanceof ReviewError && error.code === "AUTH_REQUIRED") throw error;
        unreadable += 1;
      }
    }
    const cases = selectGeneratedCases(candidates);
    const registered = this.registry.register(this.token, target, "conversation", cases, { generated: true });
    return { ...registered, sampledConversations: conversations.length, unreadableConversations: unreadable, startedAfter };
  }

  /**
   * Show the agent's newest saved generated set, read only, as a verified generated draft for this
   * caller. Returns undefined when the agent has no such set. A failed read also returns undefined, so
   * the caller can generate: a generated save refuses to create a set while a matching set exists.
   */
  async openSavedGeneratedSet(environment: DebuggerEnvironment, agent: DebuggerAgent): Promise<{ draft: EvaluationDraft; saveGrant: string; receipt: EvaluationSaveReceipt; set: SavedGeneratedSet } | undefined> {
    const target: EvaluationTarget = { environment, agent: { id: agent.id, name: agent.name, schemaName: agent.schemaName ?? "", componentIdUnique: agent.componentIdUnique } };
    let set: SavedGeneratedSet | undefined;
    try {
      const context = await this.nativeContext(target);
      set = context.components && findGeneratedSet(context.components, target.agent.name);
    } catch (error) {
      if (error instanceof ReviewError && error.code === "AUTH_REQUIRED") throw error;
      console.warn("Eval Builder could not read saved generated sets; generating instead.", error instanceof ReviewError ? error.code : "UNEXPECTED");
      return undefined;
    }
    return set ? { ...this.registry.adopt(this.token, target, set), set } : undefined;
  }

  async nativeContext(target: EvaluationTarget): Promise<NativeEvaluationContext> {
    const current = await this.resolveTarget({ environmentId: target.environment.id, agentId: target.agent.id });
    if (!current.environment.url || current.environment.url !== target.environment.url) {
      throw new ReviewError("EVALUATION_TARGET_CHANGED", "The authenticated target URL has changed. No native write was sent.");
    }
    const client = new DataverseClient(new URL(current.environment.url), this.token);
    return inspectNativeEvaluationTarget({
      get: path => client.get<unknown>(path),
      list: (path, limits) => client.listBounded<unknown>(path, limits),
      entitySet: name => client.entitySet(name),
      createAtomic: creates => client.createAtomic(creates),
      update: (path, body) => client.update(path, body),
      delete: path => client.delete(path),
    }, target.agent.id);
  }
}
