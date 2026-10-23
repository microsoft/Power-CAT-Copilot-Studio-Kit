export type EvaluationTestType = "single-response" | "conversation";
export type EvaluationMethod = "GeneralQualityGrader" | "ExactMatchGrader";
export type RecordedOutcome = "recorded-success" | "recorded-failure" | "unknown";

export interface EvaluationTurn {
  question: string;
  observedResponse: string;
  expectedResponse: string;
  userTurnId: string;
  assistantTurnIds: string[];
}

export interface EvaluationCase {
  id: string;
  question: string;
  turns: EvaluationTurn[];
  outcome: RecordedOutcome;
  recordedMessageCount?: number;
  recordedMessages?: Array<{ role: "user" | "assistant"; text: string; turnId: string }>;
  path: Array<{ name: string; kind: string; recordedState: string }>;
  pathKey: string;
  /** Present on generated drafts whose expectations were pre-filled from the recorded answer for review. */
  expectationSource?: "recorded-response";
  provenance: {
    conversationId: string;
    transcriptId: string;
    transcriptIds?: string[];
    userTurnIds: string[];
    activityIds: string[];
  };
}

export interface EvaluationTarget {
  environment: { id: string; name: string; url?: string; region?: string };
  agent: { id: string; name: string; schemaName: string; componentIdUnique?: string };
}

export interface EvaluationDraft {
  id: string;
  target: EvaluationTarget;
  testType: EvaluationTestType;
  cases: EvaluationCase[];
  createdOn: string;
}

export interface EvaluationSelection {
  caseId: string;
  expectedResponses: string[];
  /** Optional reviewed questions, one per turn. Omitted questions keep the recorded text. */
  questions?: string[];
}

export interface NativeEvaluationInput {
  draftId: string;
  saveGrant: string;
  requestId: string;
  name: string;
  method: EvaluationMethod;
  selectedCases: EvaluationSelection[];
  confirmed: true;
}

/** Edit or delete one case of a verified, saved set (generated sets save automatically). */
export interface EvaluationCaseUpdateInput {
  draftId: string;
  saveGrant: string;
  requestId: string;
  caseId: string;
  question: string;
  expectedResponse: string;
  remove?: boolean;
}

export interface EvaluationSaveReceipt {
  state: "saved" | "unconfirmed";
  requestId: string;
  setId: string;
  caseIds: string[];
  studioUrl: string;
  verified: boolean;
  message: string;
}
