import { Cat_powershieldpolicyrequestlogsService } from '../../../../../generated/services/Cat_powershieldpolicyrequestlogsService';
import { Cat_policyrequestsService } from '../../../../../generated/services/Cat_policyrequestsService';
import type { Cat_powershieldpolicyrequestlogsBase } from '../../../../../generated/models/Cat_powershieldpolicyrequestlogsModel';
import type {
  Cat_powershieldpolicyrequestlogscat_eventtype,
  Cat_powershieldpolicyrequestlogscat_loglevel,
} from '../../../../../generated/models/Cat_powershieldpolicyrequestlogsModel';
import { assertRequestType } from './requestType';

// ─────────────────────────────────────────────────────────────────────────────
// Option-set integer constants
// ─────────────────────────────────────────────────────────────────────────────

export const LOG_LEVEL = {
  Info: 1 as Cat_powershieldpolicyrequestlogscat_loglevel,
  Warning: 2 as Cat_powershieldpolicyrequestlogscat_loglevel,
  Error: 3 as Cat_powershieldpolicyrequestlogscat_loglevel,
} as const;

export const EVENT_TYPE = {
  FulfillmentStarted: 1 as Cat_powershieldpolicyrequestlogscat_eventtype,
  PolicyConflictResolved: 2 as Cat_powershieldpolicyrequestlogscat_eventtype,
  PolicyCreated: 3 as Cat_powershieldpolicyrequestlogscat_eventtype,
  FulfillmentCompleted: 4 as Cat_powershieldpolicyrequestlogscat_eventtype,
  FulfillmentFailed: 5 as Cat_powershieldpolicyrequestlogscat_eventtype,
  PolicyDeleted: 6 as Cat_powershieldpolicyrequestlogscat_eventtype,
} as const;

const EVENT_TYPE_NAMES: Record<Cat_powershieldpolicyrequestlogscat_eventtype, string> = {
  1: 'FulfillmentStarted',
  2: 'PolicyConflictResolved',
  3: 'PolicyCreated',
  4: 'FulfillmentCompleted',
  5: 'FulfillmentFailed',
  6: 'PolicyDeleted',
};

// ─────────────────────────────────────────────────────────────────────────────
// Core write function — never throws; log failure must never abort fulfillment
// ─────────────────────────────────────────────────────────────────────────────

async function safeAppendLog(
  requestId: string,
  eventType: Cat_powershieldpolicyrequestlogscat_eventtype,
  logLevel: Cat_powershieldpolicyrequestlogscat_loglevel,
  message: string,
  affectedPolicyId?: string,
  affectedPolicyName?: string,
): Promise<void> {
  try {
    // Isolation (SC-002 / FR-017 / FR-034 — strict write boundary): only append
    // logs to a Connector parent. Best-effort semantics are preserved — if the
    // parent type cannot be confirmed Connector (lookup failure, wrong type, or
    // an unrecognized discriminator) the write is skipped rather than crossing
    // types, and never surfaces an error to the caller.
    const parent = await Cat_policyrequestsService.get(requestId, {
      select: ['cat_requesttype'] as string[],
    });
    if (!parent.success || !parent.data) return;
    assertRequestType(parent.data.cat_requesttype, 'Connector');

    await Cat_powershieldpolicyrequestlogsService.create({
      cat_name: EVENT_TYPE_NAMES[eventType],
      'cat_PolicyRequest@odata.bind': `/cat_policyrequests(${requestId})`,
      cat_eventtype: eventType,
      cat_loglevel: logLevel,
      cat_message: message,
      cat_affectedpolicyid: affectedPolicyId,
      cat_affectedpolicyname: affectedPolicyName,
    } as Omit<Cat_powershieldpolicyrequestlogsBase, 'cat_powershieldpolicyrequestlogid'>);
  } catch {
    // Intentionally swallowed — log writes are best-effort and must never
    // abort the fulfillment operation or surface errors to the admin.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience helpers — called from fulfillmentService.ts
// ─────────────────────────────────────────────────────────────────────────────

export function logFulfillmentStarted(
  requestId: string,
  requestNumber: string,
  envCount: number,
  connectorCount: number,
): Promise<void> {
  return safeAppendLog(
    requestId,
    EVENT_TYPE.FulfillmentStarted,
    LOG_LEVEL.Info,
    `Fulfillment started for ${requestNumber} (${envCount} environment(s), ${connectorCount} connector(s))`,
  );
}

export function logPolicyConflictResolved(
  requestId: string,
  policyId: string,
  policyName: string,
  envsRemoved: string[],
): Promise<void> {
  const envList = envsRemoved.join(', ');
  const message =
    envsRemoved.length === 1
      ? `Removed '${envList}' from existing policy '${policyName}'`
      : `Removed ${envsRemoved.length} environment(s) [${envList}] from existing policy '${policyName}'`;
  return safeAppendLog(
    requestId,
    EVENT_TYPE.PolicyConflictResolved,
    LOG_LEVEL.Warning,
    message,
    policyId,
    policyName,
  );
}

export function logPolicyCreated(
  requestId: string,
  policyId: string,
  policyName: string,
): Promise<void> {
  return safeAppendLog(
    requestId,
    EVENT_TYPE.PolicyCreated,
    LOG_LEVEL.Info,
    `New DLP policy created: '${policyName}'`,
    policyId,
    policyName,
  );
}

export function logFulfillmentCompleted(
  requestId: string,
  pendingWork: boolean,
): Promise<void> {
  const message = pendingWork
    ? 'Fulfillment completed; pending connector configuration'
    : 'Fulfillment completed successfully';
  return safeAppendLog(requestId, EVENT_TYPE.FulfillmentCompleted, LOG_LEVEL.Info, message);
}

export function logFulfillmentFailed(
  requestId: string,
  errorMessage: string,
): Promise<void> {
  return safeAppendLog(requestId, EVENT_TYPE.FulfillmentFailed, LOG_LEVEL.Error, errorMessage);
}

export function logPolicyDeleted(
  requestId: string,
  policyId: string,
  policyName: string,
): Promise<void> {
  return safeAppendLog(
    requestId,
    EVENT_TYPE.PolicyDeleted,
    LOG_LEVEL.Info,
    `Existing DLP policy deleted for reuse: '${policyName}'`,
    policyId,
    policyName,
  );
}
