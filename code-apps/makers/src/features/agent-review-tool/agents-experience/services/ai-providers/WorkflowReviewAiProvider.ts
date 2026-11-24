import {
  createReviewJob, getReviewJob, getReviewJobResults, getAgentLevelResult, countCompletedComponents,
} from '../jobs/ReviewJobService';
import { WorkflowReviewAiProviderCore, type WorkflowProviderOptions } from './WorkflowReviewAiProviderCore';

export { toStandardEvaluation, type WorkflowJobProgress, type WorkflowProviderOptions } from './WorkflowReviewAiProviderCore';

/** Browser adapter retaining the generated SDK as the default workflow transport. */
export class WorkflowReviewAiProvider extends WorkflowReviewAiProviderCore {
  /** Bind the existing browser job service without changing review behavior. */
  constructor(options: WorkflowProviderOptions) {
    super(options, { createReviewJob, getReviewJob, getReviewJobResults, getAgentLevelResult, countCompletedComponents });
  }
}
