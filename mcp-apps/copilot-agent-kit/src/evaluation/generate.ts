import type { EvaluationCase } from "./contracts.js";

/** Saved conversations sampled for a generated draft, most recent first. */
export const GENERATE_CONVERSATION_LIMIT = 20;
/** Look-back window for generated drafts. */
export const GENERATE_WINDOW_DAYS = 90;
/** Maximum generated cases presented for review. */
export const GENERATE_CASE_LIMIT = 10;
const EXPECTATION_LIMIT = 16_000;

const normalized = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Pick reviewable single-pair Conversation cases from mined single-response candidates.
 * Removes duplicates and short follow-ups that need earlier context, ranks recorded failures
 * and longer recorded paths first, and pre-fills each expectation from the recorded answer.
 * Expectations remain evidence for human review, never approved ground truth.
 */
export function selectGeneratedCases(candidates: readonly EvaluationCase[], limit = GENERATE_CASE_LIMIT): EvaluationCase[] {
  const firstInConversation = new Set<string>();
  const seenConversations = new Set<string>();
  for (const item of candidates) {
    if (!seenConversations.has(item.provenance.conversationId)) {
      seenConversations.add(item.provenance.conversationId);
      firstInConversation.add(item.id);
    }
  }
  const eligible = candidates
    .map((item, order) => ({ item, order }))
    .filter(({ item }) => item.turns.length === 1 && item.question.trim()
      && (firstInConversation.has(item.id) || item.question.trim().length >= 30));
  eligible.sort((a, b) =>
    Number(b.item.outcome === "recorded-failure") - Number(a.item.outcome === "recorded-failure")
    || b.item.path.length - a.item.path.length
    || a.order - b.order);
  const seen = new Set<string>();
  const output: EvaluationCase[] = [];
  for (const { item } of eligible) {
    const key = normalized(item.question);
    if (seen.has(key)) continue;
    seen.add(key);
    const [turn] = item.turns;
    const expectedResponse = turn.observedResponse.slice(0, EXPECTATION_LIMIT);
    output.push({
      ...item,
      expectationSource: "recorded-response",
      turns: [{ ...turn, expectedResponse }],
      recordedMessageCount: 2,
      recordedMessages: [
        { role: "user", text: turn.question, turnId: turn.userTurnId },
        { role: "assistant", text: turn.observedResponse, turnId: turn.assistantTurnIds[0] ?? `${turn.userTurnId}:response` },
      ],
    });
    if (output.length >= limit) break;
  }
  return output;
}
