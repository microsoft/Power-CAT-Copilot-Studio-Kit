import type { ConversationTranscriptJson } from "../agent-debugger/contracts/diagnostics.js";
import { createHash } from "node:crypto";
import { z } from "zod";
import { ReviewError } from "../agent-review/server/types.js";
import { parseTranscript } from "../agent-debugger/utils/transcript/parse-transcript.js";
import { mergeConversationTranscriptRecords } from "../agent-debugger/core/transcript-merge.js";
import type { Activity, ProcessedTurn } from "../agent-debugger/contracts/transcript.js";
import type { EvaluationCase, EvaluationTestType, EvaluationTurn, RecordedOutcome } from "./contracts.js";

const activitySchema = z.object({
  type: z.string().min(1), id: z.string().optional(),
  valueType: z.string().optional(), timestamp: z.union([z.string(), z.number()]).optional(),
  timestampMs: z.union([z.string(), z.number()]).optional(),
  text: z.string().optional(), speak: z.string().optional(),
  from: z.object({
    id: z.string().optional(), role: z.union([z.string(), z.number()]).optional(),
    name: z.string().optional(), aadObjectId: z.string().optional(),
  }).passthrough().optional(),
  channelId: z.string().optional(), replyToId: z.string().optional(),
  name: z.string().optional(), attachments: z.array(z.unknown()).optional(),
  value: z.unknown().optional(), channelData: z.unknown().optional(),
}).passthrough();

const miningActivitySchema = activitySchema.extend({
  evaluationRecordId: z.string(),
  mergedSessionKey: z.string(),
});
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function recordedOutcome(path: EvaluationCase["path"]): RecordedOutcome {
  if (path.some(step => /^(failed|error|blocked)$/i.test(step.recordedState))) return "recorded-failure";
  if (path.length && path.every(step => /^(succeeded|success|completed)$/i.test(step.recordedState))) return "recorded-success";
  return "unknown";
}

export function mineEvaluationTranscript(transcript: ConversationTranscriptJson, testType: EvaluationTestType): EvaluationCase[] {
  const records = transcript.records.map(record => ({
    ...record,
    metadata: record.metadata ? JSON.stringify(record.metadata) : undefined,
    content: JSON.stringify({ ...record.content, activities: record.content.activities.map((raw, index) => {
      const result = activitySchema.safeParse(raw);
      if (!result.success) throw new ReviewError("EVALUATION_INVALID_ACTIVITY", `Transcript ${record.conversationtranscriptid} contains an invalid activity at index ${index}. No partial draft was returned.`);
      return {
        ...result.data, id: result.data.id ?? `${record.conversationtranscriptid}:activity-${index}`,
        evaluationRecordId: record.conversationtranscriptid,
      };
    }) }),
  }));
  let mergedActivities: z.infer<typeof miningActivitySchema>[];
  try {
    const merged = mergeConversationTranscriptRecords(records, transcript.conversationId);
    mergedActivities = z.object({ activities: z.array(miningActivitySchema) }).parse(JSON.parse(merged.content ?? "{}")).activities;
  } catch {
    throw new ReviewError("EVALUATION_INVALID_RECORD", "The saved transcript fragments could not be merged in recorded session and batch order. No partial draft was returned.");
  }
  const sessions = new Map<string, Activity[]>();
  for (const activity of mergedActivities) {
    const session = sessions.get(activity.mergedSessionKey) ?? [];
    session.push(activity);
    sessions.set(activity.mergedSessionKey, session);
  }
  const output: EvaluationCase[] = [];
  for (const [sessionKey, activities] of sessions) {
    const candidates: EvaluationCase[] = [];
    const turns = parseTranscript({ activities }).turns;
    for (let index = 0; index < turns.length; index += 1) {
      const user = turns[index];
      if (user.role !== "user" || !user.content.trim() || user.userAction) continue;
      const assistants: ProcessedTurn[] = [];
      for (let following = index + 1; following < turns.length && turns[following].role !== "user"; following += 1) {
        assistants.push(turns[following]);
      }
      const debug = [user, ...assistants].flatMap(turn => turn.debugInfo?.stepExecutions ?? []);
      const path: EvaluationCase["path"] = debug.map(step => ({
        name: step.displayName ?? step.taskDialogId ?? step.stepId,
        kind: step.toolKind ?? step.type ?? "recorded-step",
        recordedState: step.errorMessage || step.blockedError ? "failed" : String(step.state ?? "unknown"),
      }));
      const turn: EvaluationTurn = {
        question: user.content, observedResponse: assistants.map(assistant => assistant.content).filter(Boolean).join("\n\n"),
        expectedResponse: "", userTurnId: user.id, assistantTurnIds: assistants.map(assistant => assistant.id),
      };
      const evidence = [user, ...assistants].flatMap(item => item.activities);
      const sourceRecords = [...new Set(evidence.flatMap(activity =>
        "evaluationRecordId" in activity && typeof activity.evaluationRecordId === "string" ? [activity.evaluationRecordId] : []))];
      const questionSource = user.activities.find(activity => activity.id === user.id);
      const transcriptId = questionSource && "evaluationRecordId" in questionSource && typeof questionSource.evaluationRecordId === "string"
        ? questionSource.evaluationRecordId : sourceRecords[0];
      if (!transcriptId) throw new ReviewError("EVALUATION_PROVENANCE_MISSING", "A mined question has no saved transcript identity. No partial draft was returned.");
      candidates.push({
        id: hash([transcript.conversationId, transcriptId, user.id, index]),
        question: user.content, turns: [turn], path, pathKey: hash(path), outcome: recordedOutcome(path),
        recordedMessageCount: 1 + assistants.length,
        recordedMessages: [user, ...assistants].map(item => ({ role: item.role, text: item.content, turnId: item.id })),
        provenance: {
          conversationId: transcript.conversationId, transcriptId,
          transcriptIds: sourceRecords, userTurnIds: [user.id],
          activityIds: evidence.flatMap(activity => activity.id ? [activity.id] : []),
        },
      });
    }
    if (testType === "single-response") {
      output.push(...candidates);
      continue;
    }
    if (!candidates.length) continue;
    const path = candidates.flatMap(item => item.path);
    output.push({
      id: hash(["conversation", transcript.conversationId, sessionKey, candidates.map(item => item.id)]),
      question: candidates[0].question, turns: candidates.flatMap(item => item.turns),
      path, pathKey: hash(path), outcome: recordedOutcome(path),
      recordedMessageCount: turns.length,
      recordedMessages: turns.map(turn => ({ role: turn.role, text: turn.content, turnId: turn.id })),
      provenance: {
        conversationId: transcript.conversationId, transcriptId: candidates[0].provenance.transcriptId,
        transcriptIds: [...new Set(candidates.flatMap(item => item.provenance.transcriptIds ?? [item.provenance.transcriptId]))],
        userTurnIds: candidates.flatMap(item => item.provenance.userTurnIds),
        activityIds: candidates.flatMap(item => item.provenance.activityIds),
      },
    });
  }
  return output;
}
