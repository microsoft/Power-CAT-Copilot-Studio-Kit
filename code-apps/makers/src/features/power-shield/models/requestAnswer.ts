export interface RequestAnswer {
  id: string;                       // cat_policyrequestanswerid (PK GUID)
  policyRequestId: string;          // cat_policyrequestid (lookup FK)
  questionId: string;               // cat_questionid (lookup FK)
  answerValue: string;              // cat_answervalue: "true"/"false" or free text
  questionTextSnapshot: string;     // cat_questiontextsnapshot (immutable at submission)
}

export interface RequestAnswerCreate {
  policyRequestId: string;
  questionId: string;
  answerValue: string;
  questionTextSnapshot: string;
}
