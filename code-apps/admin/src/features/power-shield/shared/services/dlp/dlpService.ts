import { PowerPlatformforAdminsService } from '../../../../../generated/services/PowerPlatformforAdminsService';
import type { ManagedPolicyV2, PolicyV2, ResourceArray_PolicyV2 } from '../../../../../generated/models/PowerPlatformforAdminsModel';

/**
 * Creates a new DLP V2 policy.
 * Accepts Record<string, unknown> because the generated ManagedPolicyV2 uses `_type`
 * but the API expects `type` — callers must build the payload with `type` directly.
 */
export async function createDlpPolicy(
  payload: Record<string, unknown>,
): Promise<{ policyId: string; policyName: string }> {
  console.log('[dlpService:create] Payload displayName:', payload.displayName);
  console.log('[dlpService:create] Payload environmentType:', payload.environmentType);
  console.log('[dlpService:create] Payload environments count:', (payload.environments as unknown[])?.length);
  console.log('[dlpService:create] Full payload:', JSON.stringify(payload, null, 2));

  const result = await PowerPlatformforAdminsService.CreatePolicyV2(
    payload as unknown as ManagedPolicyV2,
  );

  console.log('[dlpService:create] API result success:', result.success);
  console.log('[dlpService:create] API result error:', JSON.stringify(result.error, null, 2));

  if (!result.success || !result.data) {
    const errMsg = result.error?.message ?? 'Failed to create DLP policy.';
    console.error('[dlpService:create] FAILED:', errMsg, '| Full result:', JSON.stringify(result));
    throw new Error(errMsg);
  }

  const policy = result.data as PolicyV2;
  console.log('[dlpService:create] Created policy — id:', policy.name, '| displayName:', policy.displayName,
    '| environmentType:', policy.environmentType, '| envCount:', policy.environments?.length);
  return { policyId: policy.name, policyName: policy.displayName };
}

/**
 * Lists all DLP V2 policies accessible to the current user.
 */
export async function listDlpPolicies(): Promise<PolicyV2[]> {
  const result = await PowerPlatformforAdminsService.ListPoliciesV2();
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to list DLP policies.');
  }
  const data = result.data as ResourceArray_PolicyV2 | undefined;
  const policies = data?.value ?? [];
  console.log('[dlpService] Listed', policies.length, 'policies');
  return policies;
}

/**
 * Updates an existing DLP V2 policy in place.
 * Accepts Record<string, unknown> for the same reason as createDlpPolicy (_type vs type).
 */
export async function updateDlpPolicy(
  policyId: string,
  payload: Record<string, unknown>,
): Promise<{ policyId: string; policyName: string }> {
  console.log('[dlpService] Updating DLP policy:', policyId);
  const result = await PowerPlatformforAdminsService.UpdatePolicyV2(
    payload as unknown as ManagedPolicyV2,
    policyId,
  );
  if (!result.success || !result.data) {
    throw new Error(result.error?.message ?? 'Failed to update DLP policy.');
  }
  const policy = result.data as PolicyV2;
  return { policyId: policy.name, policyName: policy.displayName };
}

/**
 * Deletes a DLP V2 policy by name/ID.
 * Swallows errors — failures are logged but do not throw (cleanup is best-effort).
 */
export async function deleteDlpPolicy(policyName: string): Promise<void> {
  try {
    console.log('[dlpService] Deleting policy:', policyName);
    await PowerPlatformforAdminsService.DeletePolicyV2(policyName);
  } catch {
    // Best-effort cleanup — log but don't abort
    console.warn(`[dlpService] Failed to delete old DLP policy "${policyName}".`);
  }
}

/**
 * Deletes a DLP V2 policy by name/ID — strict variant that throws on failure.
 * Used during policy reuse (delete-then-create) where deletion failure should abort fulfillment.
 */
export async function deleteDlpPolicyStrict(policyName: string): Promise<void> {
  console.log('[dlpService:strictDelete] Deleting policy:', policyName);
  const result = await PowerPlatformforAdminsService.DeletePolicyV2(policyName);
  if (!result.success) {
    const errMsg = result.error?.message ?? `Failed to delete DLP policy "${policyName}".`;
    console.error('[dlpService:strictDelete] FAILED:', errMsg);
    throw new Error(errMsg);
  }
  console.log('[dlpService:strictDelete] Policy deleted successfully:', policyName);
}
