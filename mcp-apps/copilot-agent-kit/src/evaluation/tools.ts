import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import { ReviewError } from "../agent-review/server/types.js";
import { DEFAULT_PROMPT_ENVIRONMENT, exactSelection } from "../tools/target-selection.js";
import { AGENT_REQUIRED_MESSAGE, EvaluationService, type EvaluationTargetInput } from "./service.js";
import type { EvaluationCaseUpdateInput, NativeEvaluationInput } from "./contracts.js";

type ServiceFactory = (token: string) => EvaluationService;
function service(token: string | undefined, factory: ServiceFactory = value => new EvaluationService(value)): EvaluationService {
  if (!token) throw new ReviewError("AUTH_REQUIRED", "Sign in to build agent evaluations.");
  return factory(token);
}
function success(text: string, structuredContent: Record<string, unknown>, meta?: Record<string, unknown>): CallToolResult {
  return { content: [{ type: "text", text }], structuredContent, ...(meta ? { _meta: meta } : {}) };
}
function failure(error: unknown): CallToolResult {
  if (!(error instanceof ReviewError)) console.error("Eval Builder tool failed.", error);
  const message = error instanceof ReviewError ? error.message : "The Eval Builder operation failed.";
  return {
    isError: true, content: [{ type: "text", text: message }],
    structuredContent: { view: "evaluation", state: "error", error: {
      code: error instanceof ReviewError ? error.code : "INTERNAL_ERROR", message,
      retryable: error instanceof ReviewError && error.retryable,
    } },
  };
}
/** Target errors show in the generated view as a visible reason, not as a failed tool call. */
const TARGET_ERRORS = ["AGENT_NAME_REQUIRED", "AGENT_NOT_FOUND", "AGENT_AMBIGUOUS", "ENVIRONMENT_NOT_FOUND", "ENVIRONMENT_AMBIGUOUS"];

/** The newest saved generated set, shown without a write: a verified receipt tells the widget not to save again. */
function existingSetResult(context: Record<string, unknown>, saved: NonNullable<Awaited<ReturnType<EvaluationService["openSavedGeneratedSet"]>>>): CallToolResult {
  const { draft, saveGrant, receipt, set } = saved;
  return success(`Showing the ${draft.cases.length} saved test cases of the existing generated set "${set.root.name}" for ${draft.target.agent.name}. No new set was generated or saved, and no evaluation was run. Inline edits update this set.`, {
    ...context, state: "generated", draftId: draft.id, draft, target: draft.target, testType: draft.testType,
    candidateCount: draft.cases.length, studioUrl: receipt.studioUrl, receipt,
    existingSet: { setId: receipt.setId, name: set.root.name, ...(set.createdOn ? { createdOn: set.createdOn } : {}) },
  }, { evaluationSaveGrant: saveGrant });
}

/** The opener shows the agent's newest saved generated set, or else generates new cases. Any mode input is ignored. */
export async function openEvaluationBuilder(token: string | undefined, input: EvaluationTargetInput, factory?: ServiceFactory): Promise<CallToolResult> {
  let context: Record<string, unknown> = { view: "evaluation", state: "loading", selectionId: randomUUID(), targetResolved: false };
  try {
    const current = service(token, factory);
    const environment = exactSelection(await current.listEnvironments(), "ENVIRONMENT", input.environmentId,
      input.environmentName ?? (input.environmentId ? undefined : DEFAULT_PROMPT_ENVIRONMENT));
    context = { ...context, environment, environmentId: environment.id };
    if (!input.agentId && !input.agentName?.trim()) throw new ReviewError("AGENT_NAME_REQUIRED", AGENT_REQUIRED_MESSAGE);
    const agent = await current.sources.resolveAgent(environment.id, input);
    context = { ...context, targetResolved: true, agent, agentId: agent.id };
    const saved = await current.openSavedGeneratedSet(environment, agent);
    if (saved) return existingSetResult(context, saved);
    const { draft, saveGrant, sampledConversations, unreadableConversations, startedAfter } = await current.generate({ environmentId: environment.id, agentId: agent.id });
    const studioUrl = `https://copilotstudio.microsoft.com/environments/${encodeURIComponent(environment.id)}/agents/${encodeURIComponent(agent.id)}/evaluate`;
    return success(`Generated ${draft.cases.length} evaluation cases from ${sampledConversations} recent saved conversations of ${agent.name}. Expected responses are pre-filled from recorded answers for review. The app saves them to Copilot Studio automatically and syncs inline edits; no evaluation is run.`, {
      ...context, state: "generated", draftId: draft.id, draft, target: draft.target, testType: draft.testType,
      candidateCount: draft.cases.length, sampledConversations, unreadableConversations, startedAfter, studioUrl,
    }, { evaluationSaveGrant: saveGrant });
  } catch (error) {
    const failed = failure(error);
    const visible = error instanceof ReviewError && TARGET_ERRORS.includes(error.code);
    return { ...failed, ...(visible ? { isError: undefined } : {}), structuredContent: { ...context, state: "error", error: failed.structuredContent?.error } };
  }
}
export async function createAgentEvaluationSet(token: string | undefined, input: NativeEvaluationInput, factory?: ServiceFactory): Promise<CallToolResult> {
  try {
    const current = service(token, factory);
    const receipt = await current.registry.save(current.token, input, target => current.nativeContext(target));
    return { ...success(receipt.message, { view: "evaluation", state: "save", receipt }), ...(receipt.verified ? {} : { isError: true }) };
  } catch (error) { return failure(error); }
}
export async function getAgentEvaluationSave(token: string | undefined, input: { draftId: string; saveGrant: string; requestId: string }, factory?: ServiceFactory): Promise<CallToolResult> {
  try {
    const current = service(token, factory);
    const receipt = await current.registry.recover(current.token, input, target => current.nativeContext(target));
    return { ...success(receipt.message, { view: "evaluation", state: "save", receipt }), ...(receipt.verified ? {} : { isError: true }) };
  } catch (error) { return failure(error); }
}
export async function updateAgentEvaluationCase(token: string | undefined, input: EvaluationCaseUpdateInput, factory?: ServiceFactory): Promise<CallToolResult> {
  try {
    const current = service(token, factory);
    const receipt = await current.registry.updateCase(current.token, input, target => current.nativeContext(target));
    return success(receipt.message, { view: "evaluation", state: "save", receipt, caseId: input.caseId, removed: Boolean(input.remove) });
  } catch (error) { return failure(error); }
}
