import { listDlpPolicies } from './dlpService';
import { decidePolicyAction, normalizeGuid } from './policyGovernsEnv';

export interface PolicyImpact {
  /** PolicyV2.name — the PP GUID used as the policy's unique identifier. */
  policyId: string;
  /** Full DLP display name, e.g. "DLP-{ST-GUID}-REQ-00001001". */
  policyDisplayName: string;
  /** Human-readable short name, e.g. "REQ-00001001". Falls back to full name. */
  policyShortName: string;
  /** Environments from the new PR that are currently in this policy and will be removed. */
  environmentsLost: Array<{ guid: string; name: string }>;
  /** Number of environments that will remain in this policy after removal. */
  remainingCount: number;
}

export interface DlpPreflightSummary {
  /** Policies that will be affected by this approval. Empty = no impact. */
  policyImpacts: PolicyImpact[];
  /**
   * Policies that GOVERN a requested environment but are NOT owned by Power Shield
   * (external include policies, tenant-wide AllEnvironments policies, or unknown
   * scope types). Approval must be blocked until an admin adjusts these in PPAC.
   */
  blockingPolicies: BlockingPolicy[];
  /** Set when ListPoliciesV2 failed; impact table is unavailable. */
  policyListError?: string;
  /** Set when an existing ST+EC policy was found that will be deleted and recreated. */
  existingPolicyToReplace?: {
    policyId: string;
    policyDisplayName: string;
    policyShortName: string;
  };
}

/**
 * A policy that blocks approval because it governs a requested environment and
 * Power Shield must not silently modify or delete it.
 */
export interface BlockingPolicy {
  /** PolicyV2.name — the PP GUID used as the policy's unique identifier. */
  policyId: string;
  /** Full DLP display name. */
  policyDisplayName: string;
  /** Human-readable short name; falls back to full name. */
  policyShortName: string;
  /** PolicyV2.environmentType, e.g. "AllEnvironments" / "OnlyEnvironments". */
  environmentType: string;
  /** Plain-language reason this policy blocks approval. */
  reason: string;
}

/**
 * Extracts the human-readable short name from a PowerShield DLP policy display name.
 *
 * Supported formats:
 * - New:    "{GUID}-{GUID}-{short}" (serviceTreeId-environmentGroupId-requestNumber)
 * - Legacy: "PowerShield-{GUID}-{short}"
 * - Legacy: "DLP-{GUID}-{short}"
 *
 * Falls back to the full display name if the pattern does not match.
 */
function extractPolicyShortName(displayName: string): string {
  const match = displayName.match(
    /^(?:[0-9a-f-]{36}-[0-9a-f-]{36}|(?:PowerShield|DLP)-[0-9a-f-]{36})-(.+)$/i,
  );
  return match ? match[1] : displayName;
}

/**
 * Computes the full DLP impact for the pre-flight consent dialog.
 *
 * Calls ListPoliciesV2 to get all live DLP policies in the tenant, then checks
 * each one for environment conflicts with the new PR's environments. Returns
 * a list of PolicyImpact objects — one per policy that will lose environments.
 *
 * When serviceTreeId and environmentGroupId are provided, any existing policy
 * matching the "{serviceTreeId}-{environmentGroupId}-" prefix is excluded from
 * the impact analysis — it will be deleted and recreated during fulfillment.
 *
 * Never throws — all errors are captured in the returned summary object.
 */
export async function getDlpPreflightSummary(
  environments: Array<{ guid: string; name: string }>,
  serviceTreeId?: string,
  environmentGroupId?: string,
): Promise<DlpPreflightSummary> {
  const policyImpacts: PolicyImpact[] = [];
  const blockingPolicies: BlockingPolicy[] = [];
  let policyListError: string | undefined;
  let existingPolicyToReplace: DlpPreflightSummary['existingPolicyToReplace'];

  const envNameMap = new Map(environments.map((e) => [e.guid, e.name]));
  const requestEnvGuids = environments.map((e) => e.guid);

  console.log('[preflight] Starting DLP preflight for', environments.length, 'environments:', requestEnvGuids);

  try {
    const policies = await listDlpPolicies();
    console.log('[preflight] Listed', policies.length, 'live DLP policies from tenant');

    // Exclude the existing ST+EC policy that will be deleted-and-recreated during fulfillment
    const reusePrefix = serviceTreeId && environmentGroupId
      ? `${serviceTreeId}-${environmentGroupId}-`
      : undefined;

    for (const policy of policies) {
      if (reusePrefix && policy.displayName.startsWith(reusePrefix)) {
        console.log('[preflight] Excluding existing ST+EC policy from impact (will be deleted):', policy.displayName);
        existingPolicyToReplace = {
          policyId: policy.name,
          policyDisplayName: policy.displayName,
          policyShortName: extractPolicyShortName(policy.displayName),
        };
        continue;
      }

      const decision = decidePolicyAction(policy, requestEnvGuids);

      if (decision.kind === 'skip') {
        continue;
      }

      if (decision.kind === 'block') {
        console.log('[preflight] Blocking policy — governs requested env(s):', policy.displayName,
          '| id:', policy.name, '| scope:', policy.environmentType, '| reason:', decision.reason);
        blockingPolicies.push({
          policyId: policy.name,
          policyDisplayName: policy.displayName,
          policyShortName: extractPolicyShortName(policy.displayName),
          environmentType: policy.environmentType,
          reason: decision.reason,
        });
        continue;
      }

      // decision.kind === 'removeEnvs' — owned Power Shield include policy: carve out envs.
      // Count on the policy side (normalized) so this preview matches exactly what
      // fulfillment's resolveConflictsWithOldPolicies will remove/delete.
      const governed = new Set(decision.governedEnvGuids.map(normalizeGuid));
      const conflicting = policy.environments.filter((e) => governed.has(normalizeGuid(e.name)));
      const remainingCount = policy.environments.length - conflicting.length;
      const environmentsLost = conflicting.map((e) => ({
        guid: e.name,
        name: envNameMap.get(e.name) ?? envNameMap.get(normalizeGuid(e.name)) ?? e.name,
      }));

      console.log('[preflight] Impact — owned policy:', policy.displayName,
        '| id:', policy.name, '| envs losing:', environmentsLost.length,
        '| remaining:', remainingCount);

      policyImpacts.push({
        policyId: policy.name,
        policyDisplayName: policy.displayName,
        policyShortName: extractPolicyShortName(policy.displayName),
        environmentsLost,
        remainingCount,
      });
    }

    console.log('[preflight] Total impacted policies:', policyImpacts.length,
      '| blocking policies:', blockingPolicies.length,
      '| existing ST+EC policy to replace:', existingPolicyToReplace?.policyShortName ?? 'none');
  } catch (err) {
    policyListError = err instanceof Error ? err.message : 'Failed to list DLP policies.';
    console.error('[preflight] ListPoliciesV2 failed:', policyListError);
  }

  return { policyImpacts, blockingPolicies, policyListError, existingPolicyToReplace };
}
