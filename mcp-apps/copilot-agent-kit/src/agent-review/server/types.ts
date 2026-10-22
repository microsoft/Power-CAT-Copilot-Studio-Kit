import type { Guid, ReviewJobItemRow, ReviewJobRow } from "../core/index.js";

export type { Guid, ReviewJobItemRow, ReviewJobRow };

export interface ReviewEnvironment {
  id: Guid;
  name: string;
  region: string;
}

export interface ReviewAgent {
  id: Guid;
  name: string;
  componentIdUnique: Guid;
  modifiedOn?: string;
  iconBase64?: string;
  harness: "standard" | "copilot";
}

export interface ReviewStatus {
  jobId: Guid;
  agentName: string;
  startedAt: string;
  status: "queued" | "running" | "succeeded" | "failed" | "salvageable";
  completedComponents: number;
  totalComponents: number;
  lastCompletedStatus: string | null;
  nextPollMs: number | null;
  canFinalize: boolean;
  error: string | null;
}

export interface ReviewInventoryRow {
  botId: Guid;
  componentIdUnique: Guid;
  botName: string;
  iconBase64?: string;
  reviewId?: Guid;
  overallScore: number;
  totalIssueCount: number;
  highSeverityCount: number;
  reviewedOn?: string;
  status: "completed" | "failed" | "not-reviewed";
  hasReviewData: boolean;
  harness: "standard" | "copilot";
}

export interface ReviewStartFailure {
  stage: "resolve_target" | "read_source" | "prepare_corpus" | "resolve_job_backend"
    | "resolve_review_tables" | "create_job" | "upload_input" | "queue_job";
  jobCreation: "not_attempted" | "unconfirmed" | "created";
  jobId?: Guid;
}

export interface ReviewErrorDiagnostics {
  dataverse?: {
    method: string;
    url: string;
    status: number;
    requestId?: string;
  };
  start?: ReviewStartFailure;
}

export class ReviewError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
    public diagnostics?: ReviewErrorDiagnostics,
  ) {
    super(message);
    this.name = "ReviewError";
  }
}
