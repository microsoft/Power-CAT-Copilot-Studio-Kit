import { Cat_policyrequestsService } from '../../../../../generated/services/Cat_policyrequestsService';
import { Cat_policyrequestenvironmentsService } from '../../../../../generated/services/Cat_policyrequestenvironmentsService';
import { Cat_connectorsService } from '../../../../../generated/services/Cat_connectorsService';
import { getRequestDetail } from '../dataverse/requestService';
import { createDlpPolicy, updateDlpPolicy, listDlpPolicies, deleteDlpPolicyStrict } from './dlpService';
import {
  logFulfillmentStarted,
  logPolicyConflictResolved,
  logPolicyCreated,
  logPolicyDeleted,
  logFulfillmentCompleted,
  logFulfillmentFailed,
} from '../dataverse/requestLogService';
import type { FulfillmentResult } from '../../../models/dlpPolicy';
import type { ActionOverrideMap } from '../../../models/connectorAction';
import type { PolicyV2 } from '../../../../../generated/models/PowerPlatformforAdminsModel';
import { decidePolicyAction, isPowerShieldPolicy, normalizeGuid } from './policyGovernsEnv';

// ─────────────────────────────────────────────────────────────────────────────
// Status integer constants (from requestService.ts option-set mappings)
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_IMPLEMENTING = 8;
const STATUS_IMPLEMENTED = 9;
const STATUS_IMPLEMENTED_WITH_ERRORS = 10;
const FULFILLMENT_SUCCEEDED = 2;
const FULFILLMENT_FAILED = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Connector key resolution
// ─────────────────────────────────────────────────────────────────────────────

interface ResolvedConnector {
  connectorId: string;
  connectorKey: string;
  displayName: string;
  actionOverrides: ActionOverrideMap;
}

/**
 * Batch-fetch cat_connectorkey and cat_displayname for the given connector IDs.
 */
async function resolveConnectorKeys(connectorIds: string[]): Promise<ResolvedConnector[]> {
  if (connectorIds.length === 0) return [];

  const filter = connectorIds.map((id) => `cat_connectorid eq ${id}`).join(' or ');
  const result = await Cat_connectorsService.getAll({
    filter,
    select: ['cat_connectorid', 'cat_connectorkey', 'cat_displayname'],
  });

  return (result.data ?? []).map((c) => ({
    connectorId: c.cat_connectorid,
    connectorKey: c.cat_connectorkey ?? '',
    displayName: c.cat_displayname ?? '',
    actionOverrides: {},
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// DLP payload construction
// NOTE: The generated ManagedPolicyV2 type uses `_type` but the DLP V2 API
// expects `type`. We build as Record<string, unknown> with the correct field.
// ─────────────────────────────────────────────────────────────────────────────

function buildDlpPayload(
  serviceTreeId: string,
  environmentGroupId: string,
  requestNumber: string,
  environmentGuids: string[],
  connectors: ResolvedConnector[],
): Record<string, unknown> {
  return {
    displayName: `${serviceTreeId}-${environmentGroupId}-${requestNumber}`,
    defaultConnectorsClassification: 'Blocked',
    environmentType: 'OnlyEnvironments',
    environments: environmentGuids.map((guid) => ({
      id: guid,
      type: 'Microsoft.PowerApps/scopes/admin/environments',
      name: guid,
    })),
    connectorGroups: [
      {
        classification: 'Confidential',
        connectors: connectors.map((c) => ({
          id: `/providers/Microsoft.PowerApps/apis/${c.connectorKey}`,
          type: 'Microsoft.PowerApps/apis',
          name: c.displayName,
        })),
      },
      { classification: 'General', connectors: [] },
      { classification: 'Blocked', connectors: [] },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Environment conflict resolution helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds an UpdatePolicyV2 payload from an existing PolicyV2, removing the
 * specified environment GUIDs. Translates `_type` → `type` throughout since
 * the DLP V2 API expects `type` but the generated model uses `_type`.
 */
function buildEnvRemovedPayload(
  existingPolicy: PolicyV2,
  envGuidsToRemove: Set<string>,
): Record<string, unknown> {
  console.log('[fulfillment:buildEnvRemovedPayload] Raw policy environments from API:',
    JSON.stringify(existingPolicy.environments, null, 2));
  console.log('[fulfillment:buildEnvRemovedPayload] Env GUIDs to remove:', [...envGuidsToRemove]);

  const remainingEnvironments = existingPolicy.environments
    .filter((e) => !envGuidsToRemove.has(e.name))
    .map((e) => ({
      // Normalize to CREATE format: use e.name (GUID) as id and hardcode the type string.
      // e.id from ListPoliciesV2 may be a full resource path; e._type may be undefined
      // at runtime (SDK maps JSON `type` → `_type`). Both cause DLPPolicyEnvironmentReferenceInvalid.
      id: e.name,
      type: 'Microsoft.PowerApps/scopes/admin/environments',
      name: e.name,
    }));

  console.log('[fulfillment:buildEnvRemovedPayload] Remaining environments in payload:',
    JSON.stringify(remainingEnvironments, null, 2));

  const connectorGroups = existingPolicy.connectorGroups.map((group) => ({
    classification: group.classification,
    connectors: group.connectors.map((c) => ({
      id: c.id,
      type: 'Microsoft.PowerApps/apis', // hardcode — c._type may be undefined at runtime
      name: c.name,
    })),
  }));

  const payload = {
    displayName: existingPolicy.displayName,
    defaultConnectorsClassification: existingPolicy.defaultConnectorsClassification,
    environmentType: existingPolicy.environmentType,
    environments: remainingEnvironments,
    connectorGroups,
  };

  console.log('[fulfillment:buildEnvRemovedPayload] Full update payload:',
    JSON.stringify(payload, null, 2));

  return payload;
}

/**
 * For each old DLP policy (already loaded from ListPoliciesV2), applies the same
 * decision logic the admin saw at preflight (see decidePolicyAction):
 *   - skip:       policy does not govern any requested env (incl. an
 *                 ExceptEnvironments policy that excepts the env) → leave untouched.
 *   - block:      an external / AllEnvironments / unknown-scope policy governs a
 *                 requested env → THROW. This should have been blocked at the
 *                 wizard, so reaching here means fail closed rather than mutate.
 *   - removeEnvs: an owned Power Shield include policy governs requested env(s) →
 *                 carve them out. If that empties the policy, delete it — but ONLY
 *                 if it is a Power Shield policy (delete guard).
 */
async function resolveConflictsWithOldPolicies(
  requestId: string,
  newEnvGuids: Set<string>,
  oldPolicies: PolicyV2[],
  envNameMap: Map<string, string>,
): Promise<void> {
  const requestEnvGuids = [...newEnvGuids];

  // Pass 1 — decide every policy up-front. If ANY policy blocks approval, throw
  // BEFORE performing a single delete/update, so a blocking policy ordered after
  // an owned one can never cause a partial write (fail closed / atomic).
  const decisions = oldPolicies.map((policy) => ({
    policy,
    decision: decidePolicyAction(policy, requestEnvGuids),
  }));

  const blocked = decisions.find((d) => d.decision.kind === 'block');
  if (blocked && blocked.decision.kind === 'block') {
    console.error('[fulfillment] BLOCKED policy reached fulfillment — aborting before any write:',
      blocked.policy.displayName, '| id:', blocked.policy.name, '| reason:', blocked.decision.reason);
    throw new Error(
      `Cannot approve: DLP policy "${blocked.policy.displayName}" governs a requested environment and ` +
      `is not managed by Request Center. Adjust this policy in the Power Platform admin center, then re-check. ` +
      `(${blocked.decision.reason})`,
    );
  }

  // Pass 2 — only skip / removeEnvs remain; apply the carve-outs.
  for (const { policy: oldPolicy, decision } of decisions) {
    if (decision.kind === 'skip') {
      console.log('[fulfillment] Policy does not govern requested env(s) — skipping:', oldPolicy.displayName,
        '| scope:', oldPolicy.environmentType);
      continue;
    }

    if (decision.kind !== 'removeEnvs') {
      continue;
    }

    // decision.kind === 'removeEnvs' — owned Power Shield include policy.
    const governed = new Set(decision.governedEnvGuids.map(normalizeGuid));
    const conflicting = oldPolicy.environments.filter((e) => governed.has(normalizeGuid(e.name)));
    const conflictingGuids = new Set(conflicting.map((e) => e.name));
    const remaining = oldPolicy.environments.length - conflicting.length;

    console.log(
      `[fulfillment] Removing ${conflicting.length} env(s) from owned policy "${oldPolicy.displayName}".`,
      `Remaining: ${remaining} (${remaining === 0 ? 'will be deleted' : 'active'})`,
    );

    if (remaining === 0) {
      // Delete guard: NEVER delete a policy Power Shield does not own, even if a
      // future logic change routed a non-owned policy here.
      if (!isPowerShieldPolicy(oldPolicy.displayName)) {
        console.warn('[fulfillment] SAFETY GUARD: refusing to delete non-owned zero-env policy:',
          oldPolicy.name, oldPolicy.displayName);
        continue;
      }

      // Owned policy would end up with zero environments — delete it instead of updating.
      console.log('[fulfillment] Deleting zero-environment owned policy:', oldPolicy.name, oldPolicy.displayName);
      try {
        await deleteDlpPolicyStrict(oldPolicy.name);
        await logPolicyDeleted(requestId, oldPolicy.name, oldPolicy.displayName);
        const envDisplayNames = conflicting.map((e) => envNameMap.get(e.name) ?? e.name);
        await logPolicyConflictResolved(requestId, oldPolicy.name, oldPolicy.displayName, envDisplayNames);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn('[fulfillment] deleteDlpPolicyStrict failed for policy:', oldPolicy.name,
          '| displayName:', oldPolicy.displayName,
          '| error:', errMsg,
          '| Treating as resolved (policy may have been manually deleted from Admin Center).');
      }
    } else {
      // Policy retains some environments — update to remove only the conflicting ones
      const payload = buildEnvRemovedPayload(oldPolicy, conflictingGuids);
      console.log('[fulfillment] About to update policy:', oldPolicy.name, oldPolicy.displayName);
      console.log('[fulfillment] Conflicting envs (by .name):', [...conflictingGuids]);

      try {
        await updateDlpPolicy(oldPolicy.name, payload);
        console.log('[fulfillment] Policy updated successfully:', oldPolicy.name);
        const envDisplayNames = conflicting.map((e) => envNameMap.get(e.name) ?? e.name);
        await logPolicyConflictResolved(requestId, oldPolicy.name, oldPolicy.displayName, envDisplayNames);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn('[fulfillment] updateDlpPolicy failed for policy:', oldPolicy.name,
          '| displayName:', oldPolicy.displayName,
          '| error:', errMsg,
          '| Treating as resolved (policy may have been manually deleted from Admin Center).');
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fulfillment status updates
// ─────────────────────────────────────────────────────────────────────────────

async function markEnvironmentsSucceeded(environmentIds: string[]): Promise<void> {
  const now = new Date().toISOString();
  await Promise.all(
    environmentIds.map((id) =>
      Cat_policyrequestenvironmentsService.update(id, {
        cat_fulfillmentstatus: FULFILLMENT_SUCCEEDED,
        cat_fulfillmenterror: '',
        cat_fulfilledon: now,
      }),
    ),
  );
}

async function markEnvironmentsFailed(environmentIds: string[], errorMessage: string): Promise<void> {
  const now = new Date().toISOString();
  await Promise.all(
    environmentIds.map((id) =>
      Cat_policyrequestenvironmentsService.update(id, {
        cat_fulfillmentstatus: FULFILLMENT_FAILED,
        cat_fulfillmenterror: errorMessage,
        cat_fulfilledon: now,
      }),
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main orchestrator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Orchestrates DLP policy creation after admin approval.
 * Implements the post-approval multi-PR conflict resolution algorithm (§16.3):
 *
 * 1. Set status to Implementing
 * 2. Fetch request detail (environments + connectors)
 * 3. Resolve connector keys from cat_connector table
 * 4. Build DLP V2 payload (displayName = {serviceTreeId}-{environmentGroupId}-{requestNumber})
 * 5. List ALL live DLP policies in the tenant via ListPoliciesV2
 * 6. For each policy (any Service Tree) — except one with the same displayName (retry guard):
 *    a. Compute environment intersection with new PR's environments
 *    b. If conflicts → UpdatePolicyV2 removing only those environments
 *       (empty-scoped policies are left alive — never deleted)
 * 7. Always CreatePolicyV2 for the new PR (never update an existing policy)
 * 8. Update fulfillment status per environment
 * 9. Set final status (Implemented or Implementing if pending patterns/overrides)
 */
export async function fulfillRequest(requestId: string): Promise<FulfillmentResult> {
  // Step 1: Transition to Implementing
  console.log('[fulfillment] Setting status to Implementing for request:', requestId);
  await Cat_policyrequestsService.update(requestId, {
    cat_status: STATUS_IMPLEMENTING,
  });

  const environmentIds: string[] = [];
  let createdPolicyId: string | undefined;

  try {
    // Step 2: Fetch request detail
    const detail = await getRequestDetail(requestId);
    const envGuids = detail.environments.map((e) => e.environmentGuid);
    const envNameMap = new Map(detail.environments.map((e) => [e.environmentGuid, e.environmentName]));
    environmentIds.push(...detail.environments.map((e) => e.id));
    console.log('[fulfillment] Fetched request detail:', {
      requestNumber: detail.requestNumber,
      envCount: detail.environments.length,
      connectorCount: detail.connectors.length,
      serviceTreeId: detail.serviceTreeId,
      environmentGroupId: detail.environmentGroupId,
      environmentGroupIdType: typeof detail.environmentGroupId,
    });
    await logFulfillmentStarted(requestId, detail.requestNumber, detail.environments.length, detail.connectors.length);

    // Step 3: Resolve connector keys and merge action overrides from request child records
    const connectorIds = detail.connectors.map((c) => c.connectorId);
    const overridesMap = new Map(detail.connectors.map((c) => [c.connectorId, c.actionOverrides ?? {}]));
    const resolvedConnectors = (await resolveConnectorKeys(connectorIds)).map((rc) => ({
      ...rc,
      actionOverrides: overridesMap.get(rc.connectorId) ?? {},
    }));
    console.log('[fulfillment] Resolved connector keys:', resolvedConnectors);

    // Step 3b: Map custom connector patterns
    const customPatterns = detail.customConnectorPatterns ?? [];
    console.log('[fulfillment] Custom connector patterns:', customPatterns.length);

    // Step 4: Build DLP payload using human-readable request number (e.g. REQ-00001009)
    if (!detail.environmentGroupId) {
      console.error('[fulfillment] CRITICAL: environmentGroupId is missing on request', requestId);
      throw new Error('Environment Container is required but missing on this request. Cannot create DLP policy.');
    }
    console.log('[fulfillment] Building DLP payload with:',
      'serviceTreeId=', detail.serviceTreeId,
      'environmentGroupId=', detail.environmentGroupId,
      'requestNumber=', detail.requestNumber,
      'envGuids=', envGuids,
    );
    const newPayload = buildDlpPayload(
      detail.serviceTreeId,
      detail.environmentGroupId,
      detail.requestNumber,
      envGuids,
      resolvedConnectors,
    );
    console.log('[fulfillment] Built displayName:', newPayload.displayName);
    console.log('[fulfillment] DLP payload:', JSON.stringify(newPayload, null, 2));

    // Step 5: List ALL live DLP policies via PowerPlatformforAdmins (single call)
    const allPolicies = await listDlpPolicies();
    console.log('[fulfillment] Total live DLP policies:', allPolicies.length);
    console.log('[fulfillment] Raw policies from ListPoliciesV2:',
      JSON.stringify(allPolicies.map((p) => ({
        name: p.name,
        displayName: p.displayName,
        environmentType: p.environmentType,
        environments: p.environments,
      })), null, 2));

    // Step 5x: Check for an existing policy matching the same Service Tree + Environment Container.
    // If found, delete it before creating the new one (delete-and-recreate strategy).
    let deletedExistingPolicy = false;
    const reusePrefix = `${detail.serviceTreeId}-${detail.environmentGroupId}-`;
    const existingStEcPolicy = allPolicies.find((p) => p.displayName.startsWith(reusePrefix));

    let policiesToCheck = allPolicies;

    if (existingStEcPolicy) {
      console.log('[fulfillment] Found existing ST+EC policy to replace:',
        existingStEcPolicy.displayName, '| id:', existingStEcPolicy.name);
      await deleteDlpPolicyStrict(existingStEcPolicy.name);
      await logPolicyDeleted(requestId, existingStEcPolicy.name, existingStEcPolicy.displayName);
      deletedExistingPolicy = true;

      // Remove the deleted policy from the list before conflict resolution
      policiesToCheck = allPolicies.filter((p) => p.name !== existingStEcPolicy.name);
      console.log('[fulfillment] Removed deleted policy from conflict check list. Remaining:', policiesToCheck.length);
    } else {
      console.log('[fulfillment] No existing ST+EC policy found for prefix:', reusePrefix);
    }

    // Step 6: Check remaining tenant policies for environment conflicts and resolve them.
    // Exclude only any policy with the same displayName as the one we're about to create —
    // on a retry, a previous attempt may have already created that policy; including it
    // would cause its own environments to be stripped before a duplicate is created.
    const newDisplayName = newPayload.displayName as string;
    policiesToCheck = policiesToCheck.filter((p) => p.displayName !== newDisplayName);
    console.log('[fulfillment] Policies to check for env conflicts:', policiesToCheck.length);

    if (policiesToCheck.length > 0) {
      const newEnvGuids = new Set(envGuids);
      await resolveConflictsWithOldPolicies(requestId, newEnvGuids, policiesToCheck, envNameMap);
    }

    // Step 7: Create a fresh DLP policy for the current PR
    console.log('[fulfillment] Creating new DLP policy:', newPayload.displayName);
    const { policyId, policyName } = await createDlpPolicy(newPayload);
    createdPolicyId = policyId;
    console.log('[fulfillment] DLP policy created:', { policyId, policyName });

    // Step 7b: Verify the created policy exists (post-create check)
    try {
      const verifyPolicies = await listDlpPolicies();
      const found = verifyPolicies.find((p) => p.name === policyId);
      if (found) {
        console.log('[fulfillment] POST-CREATE VERIFY: Policy confirmed in tenant.',
          'id:', found.name, 'displayName:', found.displayName, 'envCount:', found.environments?.length);
      } else {
        console.warn('[fulfillment] POST-CREATE VERIFY: Policy NOT found in tenant listing!',
          'Expected id:', policyId, '| Total policies listed:', verifyPolicies.length);
      }
    } catch (verifyErr) {
      console.warn('[fulfillment] POST-CREATE VERIFY: ListPoliciesV2 failed (non-fatal):', verifyErr);
    }

    await logPolicyCreated(requestId, policyId, policyName);

    // Step 8: Mark all environments as Succeeded
    console.log('[fulfillment] Marking', environmentIds.length, 'environments as Succeeded');
    await markEnvironmentsSucceeded(environmentIds);

    // Step 9: Update request header
    // If custom patterns or connector action overrides exist, stay at Implementing —
    // a Power Automate flow will apply them via the BAP API and transition to Implemented.
    const hasPatterns = customPatterns.length > 0;
    const hasActionOverrides = detail.connectors.some(
      (c) => c.actionOverrides && Object.keys(c.actionOverrides).length > 0,
    );
    const pendingWork = hasPatterns || hasActionOverrides;
    await Cat_policyrequestsService.update(requestId, {
      cat_dlppolicyid: policyId,
      cat_dlppolicyname: policyName,
      cat_lasterrorsummary: '',
      cat_status: pendingWork ? STATUS_IMPLEMENTING : STATUS_IMPLEMENTED,
    });

    await logFulfillmentCompleted(requestId, pendingWork);
    console.log('[fulfillment] Request fulfilled:', requestId,
      deletedExistingPolicy ? '(replaced existing policy)' : '(new policy)',
      pendingWork ? '(pending flow: URL patterns / action configs)' : '(complete)');
    return { success: true, policyId, policyName, pendingPatterns: pendingWork, deletedExistingPolicy };
  } catch (err) {
    const baseMessage = err instanceof Error ? err.message : 'Unknown DLP creation error.';

    // If the PP policy was already created but Dataverse write-back failed,
    // surface the policy ID so the admin can record it manually.
    const errorMessage = createdPolicyId
      ? `Dataverse write-back failed. DLP policy was created in Power Platform with ID: ${createdPolicyId}. Please record this ID manually on the request. Error: ${baseMessage}`
      : baseMessage;

    console.error('[fulfillment] DLP creation failed:', errorMessage, err);

    // Mark environments as Failed (best-effort)
    try {
      if (environmentIds.length > 0) {
        await markEnvironmentsFailed(environmentIds, errorMessage);
      }
    } catch {
      // Don't let environment update failure mask the original error
    }

    // Update request header — ImplementedWithErrors.
    // Explicitly manage cat_dlppolicyid so the retry button shows the correct action:
    // - Policy created but Dataverse write-back failed → save the ID (prevents orphaning)
    // - Policy NOT created → clear any stale ID from a prior attempt
    try {
      await Cat_policyrequestsService.update(requestId, {
        cat_lasterrorsummary: errorMessage,
        cat_status: STATUS_IMPLEMENTED_WITH_ERRORS,
        ...(createdPolicyId
          ? { cat_dlppolicyid: createdPolicyId }
          : { cat_dlppolicyid: '', cat_dlppolicyname: '' }),
      });
    } catch {
      // Don't let status update failure mask the original error
    }

    await logFulfillmentFailed(requestId, errorMessage);
    return { success: false, errorSummary: errorMessage };
  }
}

/**
 * Re-triggers the Post-Creation Policy Enhancement flow (§16.3.1) for a request
 * where the DLP policy was already created but the flow failed.
 *
 * Clears the error summary and resets status to Implementing (8).
 * The Dataverse row-change trigger fires because cat_status = 8 AND cat_dlppolicyid is set.
 */
export async function retriggerConnectorConfiguration(requestId: string): Promise<void> {
  await Cat_policyrequestsService.update(requestId, {
    cat_status: STATUS_IMPLEMENTING,
    cat_lasterrorsummary: '',
  });
}
