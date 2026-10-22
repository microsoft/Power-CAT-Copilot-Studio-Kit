import type { EvaluationCase, EvaluationMethod, EvaluationSelection, EvaluationTestType } from "./contracts.js";
import { ReviewError } from "../agent-review/server/types.js";

const controlCharacters = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const formulaPrefix = /^[\s]*[=+\-@]/;

export function validateEvaluationText(text: string, label: string, maximum?: number): void {
  if (controlCharacters.test(text)) throw new ReviewError("EVALUATION_INVALID_TEXT", `${label} contains an unsupported control character.`);
  if (maximum !== undefined && text.length > maximum) {
    throw new ReviewError("EVALUATION_TEXT_LIMIT", `${label} is limited to ${maximum} characters. No text was truncated.`);
  }
}

function selectedCases(cases: readonly EvaluationCase[], selection: readonly EvaluationSelection[]): EvaluationCase[] {
  if (!selection.length) throw new ReviewError("EVALUATION_SELECTION_REQUIRED", "Select at least one case.");
  const source = new Map(cases.map(item => [item.id, item]));
  const seen = new Set<string>();
  return selection.map(item => {
    const original = source.get(item.caseId);
    if (!original || seen.has(item.caseId)) throw new ReviewError("EVALUATION_INVALID_SELECTION", "The selection contains an unknown or duplicate case.");
    seen.add(item.caseId);
    if (!original.turns.length || item.expectedResponses.length !== original.turns.length) {
      throw new ReviewError("EVALUATION_DRAFT_CHANGED", "The selected case's message count does not match the draft.");
    }
    if (item.questions && item.questions.length !== original.turns.length) {
      throw new ReviewError("EVALUATION_DRAFT_CHANGED", "The selected case's question count does not match the draft.");
    }
    return {
      ...original,
      turns: original.turns.map((turn, index) => {
        const expectedResponse = item.expectedResponses[index];
        validateEvaluationText(expectedResponse, "Expected response", 16_000);
        const question = item.questions ? item.questions[index] : turn.question;
        validateEvaluationText(question, "Question", 16_000);
        return { ...turn, question, expectedResponse };
      }),
    };
  });
}

export function validateEvaluationSelection(
  testType: EvaluationTestType, method: EvaluationMethod,
  cases: readonly EvaluationCase[], selection: readonly EvaluationSelection[],
): EvaluationCase[] {
  if (method === "ExactMatchGrader" && testType !== "single-response") {
    throw new ReviewError("EVALUATION_METHOD_UNSUPPORTED", "Exact match is supported here only for a single-response test set.");
  }
  const maximum = testType === "conversation" ? 20 : 100;
  if (selection.length > maximum) {
    throw new ReviewError("EVALUATION_CASE_LIMIT", `${testType === "conversation" ? "Conversation" : "Single-response"} sets support at most ${maximum} cases. No cases were truncated.`);
  }
  const selected = selectedCases(cases, selection);
  for (const item of selected) {
    if (testType === "conversation" && (item.turns.length > 6 || (item.recordedMessageCount ?? 0) > 12)) {
      throw new ReviewError("EVALUATION_MESSAGE_LIMIT", "Conversation cases support at most 12 messages (six question/answer pairs). No messages were truncated.");
    }
    if (testType === "single-response" && item.turns.length !== 1) {
      throw new ReviewError("EVALUATION_TYPE_CHANGED", "A single-response case must contain exactly one question.");
    }
    for (const turn of item.turns) {
      if (!turn.question.trim()) throw new ReviewError("EVALUATION_QUESTION_REQUIRED", "Each case needs a question.");
      validateEvaluationText(turn.question, "Question", testType === "single-response" ? 1000 : undefined);
      if (method === "ExactMatchGrader" && !turn.expectedResponse.trim()) {
        throw new ReviewError("EVALUATION_EXPECTATION_REQUIRED", "Exact match needs a human-reviewed expected response for every selected case.");
      }
    }
  }
  return selected;
}

function csvCell(value: string, neutralizeFormula = false): string {
  const safe = neutralizeFormula && formulaPrefix.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function studioImportCsv(cases: readonly EvaluationCase[], selection: readonly EvaluationSelection[], method: EvaluationMethod): string {
  const selected = validateEvaluationSelection("single-response", method, cases, selection);
  const rows = selected.map(item => {
    const { question, expectedResponse } = item.turns[0];
    if (formulaPrefix.test(question) || formulaPrefix.test(expectedResponse)) {
      throw new ReviewError("EVALUATION_UNSAFE_CSV", "A question or expectation starts with a spreadsheet formula character. CSV export was rejected rather than changing its text. Use the evidence report or JSON instead.");
    }
    return [question, expectedResponse].map(value => csvCell(value)).join(",");
  });
  return `Question,Expected response\r\n${rows.join("\r\n")}\r\n`;
}

export function evidenceCsv(cases: readonly EvaluationCase[], selection: readonly EvaluationSelection[]): string {
  const rows = selectedCases(cases, selection).map(item => [
    item.id, item.provenance.conversationId, item.provenance.transcriptId,
    item.turns[0].question, item.turns[0].observedResponse, item.turns[0].expectedResponse,
    item.outcome, JSON.stringify(item.path), JSON.stringify(item.turns),
  ].map(value => csvCell(value, true)).join(","));
  return `Case ID,Conversation ID,Transcript ID,Question,Observed response,Expected response,Recorded outcome,Recorded path,All turns\r\n${rows.join("\r\n")}\r\n`;
}
