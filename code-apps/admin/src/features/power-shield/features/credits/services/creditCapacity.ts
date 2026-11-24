import type { AllocationRule, CreditAllocationErrorKind, EnvironmentGroupRef, PaygStatus } from './creditApprovalRules';
import {
  CreditAllocationError,
  getAvailableCredits,
  getEnvironmentCredits,
  getEnvironmentGroup,
  getPaygInfo,
} from './creditAllocationService';

/** One read's result: its value, or why it failed. */
export type Part<T> = { ok: true; value: T } | { ok: false; kind: CreditAllocationErrorKind };

export interface CreditSnapshot {
  env: Part<{ allocated: number; rules: AllocationRule[]; rulesDefaulted: boolean }>;
  spare: Part<number>;
  payg: Part<{ status: PaygStatus; policyName?: string }>;
  /** Spec 032: the environment's group, if any. Only drives a note, so a failed read leaves it undefined. */
  group?: EnvironmentGroupRef;
  /** True when any read was refused with 401/403, so one access message replaces the per-part ones. */
  accessDenied: boolean;
  loadedAt: Date;
}

function toPart<T>(name: string, r: PromiseSettledResult<T>): Part<T> {
  if (r.status === 'fulfilled') return { ok: true, value: r.value };
  // The page shows a friendly message; the full error is logged for troubleshooting (spec 030).
  console.log(`[Copilot Credits check] Couldn't read ${name}.`, r.reason);
  return { ok: false, kind: r.reason instanceof CreditAllocationError ? r.reason.kind : 'Unknown' };
}

/** Reads the three capacity parts in parallel. One failed read never hides the others (spec 025 US3). */
export async function loadCreditSnapshot(envId: string): Promise<CreditSnapshot> {
  const [env, spare, payg, group] = await Promise.allSettled([
    getEnvironmentCredits(envId),
    getAvailableCredits(),
    getPaygInfo(envId),
    getEnvironmentGroup(envId),
  ]);
  const snapshot = {
    env: toPart('environment credits', env),
    spare: toPart('tenant spare credits', spare),
    payg: toPart('billing policy', payg),
  };
  const accessDenied = Object.values(snapshot).some((p) => !p.ok && p.kind === 'Permission');
  return {
    ...snapshot,
    group: group.status === 'fulfilled' ? group.value : undefined,
    accessDenied,
    loadedAt: new Date(),
  };
}

export interface LatestLoader<T> {
  /** Resolves to the result, or to undefined when a newer load or a cancel came after this one. */
  load(envId: string): Promise<T | undefined>;
  cancel(): void;
}

/** Wraps a loader so only the newest call's result is kept (spec 025 US3-AS3). */
export function createLatestLoader<T>(load: (envId: string) => Promise<T>): LatestLoader<T> {
  let seq = 0;
  return {
    async load(envId) {
      const mine = ++seq;
      const result = await load(envId);
      return mine === seq ? result : undefined;
    },
    cancel() {
      seq++;
    },
  };
}
