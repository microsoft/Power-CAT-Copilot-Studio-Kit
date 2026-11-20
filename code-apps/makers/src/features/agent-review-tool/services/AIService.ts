import { MicrosoftDataverseService } from '../../../generated/services/MicrosoftDataverseService';
import { AIServiceCore } from './AIServiceCore';

export { extractStructuredOutput } from './AIServiceCore';

/** Browser adapter retaining the existing connector, entitlement fallback, and retry policy. */
export class AIService extends AIServiceCore {
  /** Bind the current-environment generated SDK only at the browser composition boundary. */
  constructor() {
    super((modelId, payload) => MicrosoftDataverseService.PerformBoundActionWithOrganization(
      'current', 'msdyn_aimodels', 'Microsoft.Dynamics.CRM.Predict', modelId, payload,
    ));
  }
}

export const aiService = new AIService();
