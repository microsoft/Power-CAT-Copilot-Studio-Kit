import { Cat_policyrequestsService } from '../../../../../generated/services/Cat_policyrequestsService';
import type { RequestType } from '../../../models/policyRequest';
import { assertRequestType } from './requestType';

// ─────────────────────────────────────────────────────────────────────────────
// Neutral request-type header guard (SC-002, FR-035).
//
// The single shared implementation used by every ID-taking child read that is
// NOT already routed through a typed repository — comment, attachment, and
// notification reads on both the connector and credit surfaces. It reads the
// header discriminator and rejects a wrong-type id BEFORE any child row is read,
// so a comment/notification list can never leak across experiences even though
// the underlying tables (annotation, email) are shared.
//
// This module is experience-neutral: it takes the expected type as an argument
// and does not import either typed repository, keeping the isolation seam intact.
// ─────────────────────────────────────────────────────────────────────────────

/** Rejects the id when its `cat_requesttype` header is not `expected`. */
export async function assertRequestHeaderType(
  requestId: string,
  expected: RequestType,
): Promise<void> {
  const result = await Cat_policyrequestsService.get(requestId, {
    select: ['cat_requesttype'] as string[],
  });
  if (!result.success || !result.data) {
    throw new Error(result.error?.message ?? 'Failed to load request.');
  }
  assertRequestType(result.data.cat_requesttype, expected);
}
