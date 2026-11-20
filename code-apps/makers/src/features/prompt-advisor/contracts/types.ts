/** App loading states */
export const AppState = {
  NOT_LOADED: 0,
  LOADING: 1,
  LOADED: 2,
} as const;

export type AppState = (typeof AppState)[keyof typeof AppState];

/** Single prompt evaluation (input or suggested) */
export interface PromptEvaluation {
  prompt: string;
  confidence_score: string;
  confidence_score_value: number;
  confidence_score_reason: string;
  clarity: number;
  relevance: number;
  creativity: number;
  accuracy: number;
  coherence: number;
  response: string;
}

/** Group of suggested prompts */
export interface PromptGroup {
  group_label: string;
  prompts: PromptEvaluation[];
}

/** Response metadata from QuickTest */
export interface ResponseMetadata {
  finishReason: string;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  modelName: string;
}

/** Full parsed analysis result */
export interface AnalysisResult {
  inputEvaluation: PromptEvaluation;
  promptGroups: PromptGroup[];
  metadata: ResponseMetadata;
}

/** Criteria item for bar chart */
export interface CriteriaItem {
  name: string;
  value: number;
  maxValue: number;
}

/** Prompt tip */
export interface PromptTip {
  step: number;
  fact: string;
  description: string;
}
