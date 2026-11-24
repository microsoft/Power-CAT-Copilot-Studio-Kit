import type { PolicyV2 } from '../../../../../generated/models/PowerPlatformforAdminsModel';

/**
 * Whether a DLP policy governs (applies its rules to) a given environment.
 *
 * - `governs`      — the policy's connector rules apply to this environment.
 * - `excluded`     — an ExceptEnvironments policy that explicitly excepts this env
 *                    (listed in the array = NOT governed).
 * - `notGoverned`  — an Only/Single policy whose scope does not include this env.
 * - `manualReview` — an unrecognized environmentType; caller must fail closed.
 *
 * `excluded` and `notGoverned` both mean "the policy does not apply here", but are
 * kept distinct for clearer logging/diagnostics.
 */
export type PolicyGovernance = 'governs' | 'excluded' | 'notGoverned' | 'manualReview';

/**
 * Normalizes an environment GUID for comparison: trims whitespace, lowercases,
 * and strips surrounding braces. DLP APIs and Dataverse can return GUIDs in
 * mixed casing or `{...}` form, so all comparisons must go through this.
 */
export function normalizeGuid(guid: string): string {
  return guid.trim().toLowerCase().replace(/[{}]/g, '');
}

/**
 * Determines whether a DLP V2 policy governs a specific environment, honoring
 * the policy's environmentType.
 *
 * Microsoft DLP scope semantics (grounded via Learn "create-dlp-policy" /
 * "Combined effect of multiple data policies"):
 * - OnlyEnvironments / SingleEnvironment: env in array → governed.
 * - ExceptEnvironments:                   env in array → NOT governed (excepted).
 * - AllEnvironments:                      governs every environment.
 * - anything else:                        unknown — return manualReview.
 */
export function policyGovernsEnv(policy: PolicyV2, envGuid: string): PolicyGovernance {
  const target = normalizeGuid(envGuid);
  const envInArray = policy.environments.some((e) => normalizeGuid(e.name) === target);

  switch (policy.environmentType) {
    case 'OnlyEnvironments':
    case 'SingleEnvironment':
      return envInArray ? 'governs' : 'notGoverned';
    case 'ExceptEnvironments':
      return envInArray ? 'excluded' : 'governs';
    case 'AllEnvironments':
      return 'governs';
    default:
      return 'manualReview';
  }
}

/**
 * Detects whether a policy was created by Power Shield, based on its display-name
 * pattern. Power Shield writes `${serviceTreeId}-${environmentGroupId}-${requestNumber}`;
 * legacy names used a `PowerShield-{GUID}-` or `DLP-{GUID}-` prefix.
 *
 * NOTE: name-pattern ownership is a known-weak heuristic (rename/collision). The
 * robust fix (storing the policy ID in Dataverse) is deliberately out of scope.
 */
export function isPowerShieldPolicy(displayName: string): boolean {
  return /^(?:[0-9a-f-]{36}-[0-9a-f-]{36}|(?:PowerShield|DLP)-[0-9a-f-]{36})-.+$/i.test(displayName);
}

/**
 * The action a single existing DLP policy should trigger during an approval,
 * given the environments requested by the new policy request.
 *
 * - `skip`       — policy does not govern any requested env (incl. ExceptEnvironments
 *                  that excepts the env, and Only/Single that don't include it).
 * - `removeEnvs` — an owned Power Shield include-scope policy that governs one or
 *                  more requested envs; those envs are carved out (existing behavior).
 * - `block`      — an external policy, an AllEnvironments policy, or an unknown
 *                  scope type that governs a requested env. Approval must be blocked
 *                  so an admin can adjust the policy in PPAC first (fail closed).
 */
export type PolicyDecision =
  | { kind: 'skip' }
  | { kind: 'removeEnvs'; governedEnvGuids: string[] }
  | { kind: 'block'; reason: string };

/**
 * Shared per-policy decision used identically by both the preflight (preview) and
 * fulfillment (write) paths, so the admin's preview always matches what executes.
 */
export function decidePolicyAction(policy: PolicyV2, requestEnvGuids: string[]): PolicyDecision {
  const governed: string[] = [];
  let manualReview = false;

  for (const guid of requestEnvGuids) {
    const governance = policyGovernsEnv(policy, guid);
    if (governance === 'governs') governed.push(guid);
    else if (governance === 'manualReview') manualReview = true;
    // 'excluded' / 'notGoverned' → policy does not apply to this env; ignore.
  }

  if (manualReview) {
    return {
      kind: 'block',
      reason: `Unrecognized policy scope "${policy.environmentType}". Review this policy in PPAC.`,
    };
  }

  if (governed.length === 0) {
    return { kind: 'skip' };
  }

  const isIncludeScope =
    policy.environmentType === 'OnlyEnvironments' || policy.environmentType === 'SingleEnvironment';
  const owned = isPowerShieldPolicy(policy.displayName);

  if (owned && isIncludeScope) {
    return { kind: 'removeEnvs', governedEnvGuids: governed };
  }

  if (policy.environmentType === 'AllEnvironments') {
    return {
      kind: 'block',
      reason: 'This tenant-wide (AllEnvironments) policy governs the requested environment(s).',
    };
  }

  if (owned) {
    // Owned by Power Shield, but its scope cannot be carved by removing envs
    // (e.g. an ExceptEnvironments policy). Block rather than mutate it unsafely.
    return {
      kind: 'block',
      reason: `This Request Center policy uses "${policy.environmentType}" scope, which cannot be adjusted automatically. Review it in PPAC.`,
    };
  }

  return {
    kind: 'block',
    reason: 'This policy already governs the requested environment(s) and is not managed by Request Center.',
  };
}
