/** Result of the DLP policy fulfillment orchestration */
export interface FulfillmentResult {
  success: boolean;
  policyId?: string;       // PolicyV2.name from API response
  policyName?: string;     // PolicyV2.displayName (format: "{serviceTreeId}-{environmentGroupId}-{requestId}")
  errorSummary?: string;   // error message on failure
  pendingPatterns?: boolean; // true when custom URL patterns will be applied async by PA flow
  deletedExistingPolicy?: boolean; // true when an existing ST+EC policy was deleted before creating new
}
