import assert from "node:assert/strict";
import { test } from "node:test";
import type { EvaluationCase, EvaluationSelection } from "./contracts.js";
import { evidenceCsv, studioImportCsv, validateEvaluationSelection } from "./validation.js";

const candidate = (id = "case-1", pairs = 1): EvaluationCase => ({
  id, question: "What is the policy?", outcome: "unknown", path: [], pathKey: "no-recorded-path",
  provenance: { conversationId: "conversation-1", transcriptId: "record-1", userTurnIds: ["user-1"], activityIds: ["user-1", "bot-1"] },
  turns: Array.from({ length: pairs }, (_, index) => ({
    question: `Question ${index + 1}`, observedResponse: "An observed answer is not an expectation.",
    expectedResponse: "", userTurnId: `user-${index}`, assistantTurnIds: [`bot-${index}`],
  })),
});
const selections = (cases: EvaluationCase[], response = ""): EvaluationSelection[] =>
  cases.map(item => ({ caseId: item.id, expectedResponses: item.turns.map(() => response) }));

test("General quality permits a blank human expectation and does not substitute the observed response", () => {
  const cases = [candidate()];
  const result = validateEvaluationSelection("conversation", "GeneralQualityGrader", cases, selections(cases));
  assert.equal(result[0].turns[0].expectedResponse, "");
  assert.equal(result[0].turns[0].observedResponse, "An observed answer is not an expectation.");
});
test("Conversation accepts 20 cases and rejects 21 without truncation", () => {
  const twenty = Array.from({ length: 20 }, (_, i) => candidate(`case-${i}`));
  assert.equal(validateEvaluationSelection("conversation", "GeneralQualityGrader", twenty, selections(twenty)).length, 20);
  const twentyOne = [...twenty, candidate("case-21")];
  assert.throws(() => validateEvaluationSelection("conversation", "GeneralQualityGrader", twentyOne, selections(twentyOne)), /20/);
});
test("Conversation accepts six pairs and rejects seven without truncation", () => {
  const six = [candidate("six", 6)];
  assert.equal(validateEvaluationSelection("conversation", "GeneralQualityGrader", six, selections(six))[0].turns.length, 6);
  const seven = [candidate("seven", 7)];
  assert.throws(() => validateEvaluationSelection("conversation", "GeneralQualityGrader", seven, selections(seven)), /12.*messages|six.*pairs/i);
});
test("Conversation rejects a thirteenth recorded message, including an extra assistant message", () => {
  const item = { ...candidate("recorded-12", 6), recordedMessageCount: 12 };
  assert.doesNotThrow(() => validateEvaluationSelection("conversation", "GeneralQualityGrader", [item], selections([item])));
  const thirteen = { ...item, recordedMessageCount: 13 };
  assert.throws(() => validateEvaluationSelection("conversation", "GeneralQualityGrader", [thirteen], selections([thirteen])), /12.*messages/i);
});
test("Conversation does not permit the documented single-response Exact match method", () => {
  const cases = [candidate()];
  assert.throws(() => validateEvaluationSelection("conversation", "ExactMatchGrader", cases, selections(cases, "Reviewed answer")), /Exact match.*single-response/i);
});
test("single-response accepts 100 cases and rejects 101", () => {
  const hundred = Array.from({ length: 100 }, (_, i) => candidate(`case-${i}`));
  assert.equal(validateEvaluationSelection("single-response", "GeneralQualityGrader", hundred, selections(hundred)).length, 100);
  const hundredOne = [...hundred, candidate("case-101")];
  assert.throws(() => validateEvaluationSelection("single-response", "GeneralQualityGrader", hundredOne, selections(hundredOne)), /100/);
});
test("single-response accepts 1000 question characters and rejects 1001", () => {
  const item = candidate();
  item.turns[0].question = "q".repeat(1000);
  assert.doesNotThrow(() => validateEvaluationSelection("single-response", "GeneralQualityGrader", [item], selections([item])));
  item.turns[0].question += "q";
  assert.throws(() => validateEvaluationSelection("single-response", "GeneralQualityGrader", [item], selections([item])), /1000/);
});
test("selection rejects unknown cases, duplicate IDs, changed turn counts and empty selections", () => {
  const cases = [candidate()];
  for (const selection of [
    [], [{ caseId: "unknown", expectedResponses: [""] }],
    [...selections(cases), ...selections(cases)], [{ caseId: cases[0].id, expectedResponses: [] }],
  ]) assert.throws(() => validateEvaluationSelection("conversation", "GeneralQualityGrader", cases, selection));
});
test("Exact match requires a reviewed expectation", () => {
  const cases = [candidate()];
  assert.throws(() => validateEvaluationSelection("single-response", "ExactMatchGrader", cases, selections(cases)), /expected response/i);
});
test("Studio CSV has only the two documented columns, in order, with lossless CSV quoting", () => {
  const item = candidate();
  item.turns[0].question = 'What is "policy", exactly?\nSecond line';
  const csv = studioImportCsv([item], selections([item], 'Approved "answer", with a comma'), "ExactMatchGrader");
  assert.equal(csv, 'Question,Expected response\r\n"What is ""policy"", exactly?\nSecond line","Approved ""answer"", with a comma"\r\n');
});
test("Studio CSV rejects formula-like questions rather than changing their identity", () => {
  for (const question of ["=cmd()", "+1+1", "-1+2", "@SUM(1)", "\t=cmd()"]) {
    const item = candidate();
    item.turns[0].question = question;
    assert.throws(() => studioImportCsv([item], selections([item]), "GeneralQualityGrader"), /spreadsheet formula/i);
  }
});
test("evidence CSV is separate, preserves unknown outcomes and neutralizes spreadsheet formulas", () => {
  const item = candidate();
  item.turns[0].question = "=cmd()";
  const csv = evidenceCsv([item], selections([item]));
  assert.match(csv, /Conversation ID/);
  assert.match(csv, /unknown/);
  assert.match(csv, /'=cmd\(\)/);
  assert.doesNotMatch(csv, /^Question,Expected response\r\n/);
});
test("control characters and oversized expectations are errors, not silent cleanup", () => {
  const cases = [candidate()];
  for (const answer of ["invalid\u0000answer", "x".repeat(16001)]) {
    assert.throws(() => validateEvaluationSelection("conversation", "GeneralQualityGrader", cases, selections(cases, answer)));
  }
});

test("reviewed question edits replace the recorded question; omitted questions keep it", () => {
  const cases = [candidate("edited"), candidate("kept")];
  const result = validateEvaluationSelection("conversation", "GeneralQualityGrader", cases, [
    { caseId: "edited", expectedResponses: ["Reviewed"], questions: ["Edited question?"] },
    { caseId: "kept", expectedResponses: ["Reviewed"] },
  ]);
  assert.equal(result[0].turns[0].question, "Edited question?");
  assert.equal(result[1].turns[0].question, "Question 1");
});
test("question edits must match the recorded turn count and stay free of control characters", () => {
  const cases = [candidate("two", 2)];
  assert.throws(() => validateEvaluationSelection("conversation", "GeneralQualityGrader", cases,
    [{ caseId: "two", expectedResponses: ["", ""], questions: ["Only one"] }]), /question count/);
  assert.throws(() => validateEvaluationSelection("conversation", "GeneralQualityGrader", [candidate()],
    [{ caseId: "case-1", expectedResponses: [""], questions: ["Bad\u0007question"] }]), /control character/);
  assert.throws(() => validateEvaluationSelection("conversation", "GeneralQualityGrader", [candidate()],
    [{ caseId: "case-1", expectedResponses: [""], questions: ["   "] }]), /needs a question/);
});
