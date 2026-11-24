import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import {
  EVALUATION_FLOW_NAME,
  isAwaitingKitTests,
  isKitNotPickedUp,
  isRunNotPickedUp,
  isSkippedConcurrentRun,
  KIT_FLOW_NAME,
  RUN_PICKUP_TIMEOUT_MS,
  type EvaluationRunVM,
  type RunNotice,
  type TrackedAgentVM,
} from '../contracts/model-assessment';
import {
  cancelEvaluationRun,
  createEvaluationRun,
  getActiveRunForAgent,
  getFlowsTurnedOff,
  getRunByRequestKey,
  type ActiveRun,
} from '../services/model-assessment-service';

/** `not-started`: a flow never picked up the request, so it will not run. */
export type Phase = 'idle' | 'requesting' | 'tracking' | 'terminal' | 'stalled' | 'not-started' | 'poll-error' | 'error';
export interface CheckSnapshot {
  phase: Phase;
  run?: EvaluationRunVM;
  /** Why the status could not be read (`poll-error`). */
  error?: string;
  /** Why the assessment didn't start (`error` and `not-started`). */
  notice?: RunNotice;
  requestKey?: string;
  /** Set when this check follows an assessment someone else already started. */
  joined?: { startedBy?: string };
}

const TERMINAL = new Set([
  'completed', 'completedwitherrors', 'nochange', 'noevaluationsconfigured',
  'metadataunavailable', 'rejected', 'failed', 'timedout', 'cancelled', 'stale',
]);
const POLL_INTERVAL_MS = 4000;
/** Long-running runs are polled less often. */
const SLOW_POLL_INTERVAL_MS = 10_000;
/** A run the flow has not picked up yet is reported as stalled after 6 minutes. */
const PICKUP_MAX_POLL_MS = 6 * 60_000;
/** Statuses written before the flow starts evaluating. */
const PICKUP_STATUSES = new Set(['requested', 'detecting']);
/** The flow runs the MODELCHECK test sets one at a time, so a started evaluation is followed for an hour. */
const EVAL_MAX_POLL_MS = 60 * 60_000;
/** Kit tests can run for 40 minutes after the model change is confirmed. */
const KIT_MAX_POLL_MS = 45 * 60_000;
const IDLE: CheckSnapshot = { phase: 'idle' };
// Creation can finish while the drawer is closed or a replacement panel is mounted.
const snapshots = new Map<string, CheckSnapshot>();
const listeners = new Map<string, Set<() => void>>();

function publish(agentId: string, snapshot: CheckSnapshot) {
  snapshots.set(agentId, snapshot);
  listeners.get(agentId)?.forEach(listener => listener());
}

/** Best-effort lookup; a failed read must not block starting an assessment. */
async function findActiveRun(agentId: string) {
  try {
    return await getActiveRunForAgent(agentId);
  } catch {
    return undefined;
  }
}

/** Best-effort check; a flow that cannot be read is treated as on. */
async function findFlowsTurnedOff(kitMode: boolean): Promise<string[]> {
  try {
    return await getFlowsTurnedOff(kitMode);
  } catch {
    return [];
  }
}

class StartError extends Error {
  readonly notice: RunNotice;
  constructor(notice: RunNotice) {
    super(notice.message);
    this.notice = notice;
  }
}

function flowsOffNotice(names: string[]): RunNotice {
  const several = names.length > 1;
  return {
    intent: 'error',
    title: several ? 'Assessment flows are turned off' : 'Assessment flow is turned off',
    message: `The ${names.join(' and ')} flow${several ? 's are' : ' is'} turned off, so the assessment can't start. `
      + `Ask an admin to turn ${several ? 'them' : 'it'} on, then run the assessment again.`,
  };
}

/** A request a flow never picked up: the evaluation flow, or in Kit mode the Kit test flow after the hand-off. */
function notStartedNotice(kit: boolean, flowOff: boolean): RunNotice {
  const flow = kit ? KIT_FLOW_NAME : EVALUATION_FLOW_NAME;
  const reason = flowOff
    ? `The ${flow} flow is turned off.`
    : `The ${flow} flow didn't pick ${kit ? 'up the Kit tests' : 'it up'}. The flow may have been off when the `
      + `${kit ? 'tests were handed to it' : 'assessment was requested'}, or its connection may need attention.`;
  return {
    intent: 'warning',
    title: flowOff
      ? `${kit ? 'Kit test' : 'Assessment'} flow is turned off`
      : kit ? "Kit tests weren't picked up" : "Request wasn't picked up",
    message: `${reason} Turning the flow on doesn't start this request. Make sure the flow is on, then select Start again.`,
  };
}

function useCheckSnapshot(agentId: string) {
  const subscribe = useCallback((listener: () => void) => {
    const subscribers = listeners.get(agentId) ?? new Set<() => void>();
    subscribers.add(listener);
    listeners.set(agentId, subscribers);
    return () => {
      subscribers.delete(listener);
      if (subscribers.size === 0) listeners.delete(agentId);
    };
  }, [agentId]);
  const getSnapshot = useCallback(() => snapshots.get(agentId) ?? IDLE, [agentId]);
  return { snapshot: useSyncExternalStore(subscribe, getSnapshot, getSnapshot), getSnapshot };
}

/** Read-only view of the assessment this session is following for an agent. */
export function useAssessmentSnapshot(agentId: string): CheckSnapshot {
  return useCheckSnapshot(agentId).snapshot;
}

/**
 * Keeps a requested assessment observable across drawer lifetimes and polls while mounted.
 * In Kit mode the run stays in progress while the Kit tests run, so it is followed longer.
 */
export function useAssessmentCheck(agent: TrackedAgentVM, onRunChanged?: () => void, kitMode = false) {
  const agentId = agent.id;
  const { snapshot, getSnapshot } = useCheckSnapshot(agentId);
  const { phase, requestKey } = snapshot;
  const refreshRef = useRef(onRunChanged);
  useEffect(() => { refreshRef.current = onRunChanged; }, [onRunChanged]);

  useEffect(() => {
    const previous = snapshots.get(agentId);
    // Reopening checks again on a run that was stalled or not picked up.
    if ((previous?.phase === 'stalled' || previous?.phase === 'not-started') && previous.requestKey) {
      publish(agentId, { ...previous, phase: 'tracking', error: undefined, notice: undefined });
    }
  }, [agentId]);

  useEffect(() => {
    if (phase === 'tracking' || phase === 'terminal' || phase === 'stalled') {
      refreshRef.current?.();
    }
    if (phase !== 'tracking' || !requestKey) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const startedAt = Date.now();
    let pickedUp = false;
    let awaitingKitSince: number | undefined;
    const poll = (delay: number) => {
      timer = setTimeout(async () => {
        let latest: EvaluationRunVM | undefined;
        try {
          latest = await getRunByRequestKey(requestKey);
        } catch (cause) {
          if (!cancelled) {
            publish(agentId, {
              ...getSnapshot(), phase: 'poll-error',
              error: cause instanceof Error ? cause.message : 'Could not read the assessment status.',
            });
          }
          return;
        }
        if (cancelled) return;
        if (isSkippedConcurrentRun(latest)) {
          // Lost the per-agent lock to a concurrent request: follow that run instead.
          const active = await findActiveRun(agentId);
          if (cancelled) return;
          if (active && active.requestKey !== requestKey) {
            publish(agentId, {
              phase: 'tracking', run: active.run, requestKey: active.requestKey,
              joined: { startedBy: active.startedBy },
            });
            return;
          }
        }
        const status = latest?.status.toLowerCase().replace(/[^a-z]/g, '');
        if (status && !PICKUP_STATUSES.has(status)) pickedUp = true;
        const elapsed = Date.now() - startedAt;
        if (status === 'requested' && !latest?.startedOn
          && (elapsed >= RUN_PICKUP_TIMEOUT_MS || isRunNotPickedUp(latest))) {
          const flowOff = (await findFlowsTurnedOff(false)).length > 0;
          if (cancelled) return;
          publish(agentId, { ...getSnapshot(), run: latest, phase: 'not-started', notice: notStartedNotice(false, flowOff) });
          return;
        }
        // In Kit mode the evaluation flow hands the run to the Kit test flow, which starts within seconds.
        const awaitingKit = kitMode && isAwaitingKitTests(latest);
        if (!awaitingKit) awaitingKitSince = undefined;
        else awaitingKitSince ??= Date.now();
        if (awaitingKit && (Date.now() - awaitingKitSince! >= RUN_PICKUP_TIMEOUT_MS || isKitNotPickedUp(latest))) {
          const flowOff = (await findFlowsTurnedOff(true)).includes(KIT_FLOW_NAME);
          if (cancelled) return;
          publish(agentId, { ...getSnapshot(), run: latest, phase: 'not-started', notice: notStartedNotice(true, flowOff) });
          return;
        }
        const maxPollMs = !pickedUp ? PICKUP_MAX_POLL_MS : kitMode ? KIT_MAX_POLL_MS : EVAL_MAX_POLL_MS;
        const terminal = status !== undefined && TERMINAL.has(status);
        const nextPhase = terminal ? 'terminal' : elapsed >= maxPollMs ? 'stalled' : 'tracking';
        publish(agentId, { ...getSnapshot(), run: latest ?? getSnapshot().run, phase: nextPhase });
        const slow = kitMode ? status === 'evaluationrunning' && !awaitingKit : pickedUp && elapsed >= PICKUP_MAX_POLL_MS;
        if (nextPhase === 'tracking') poll(slow ? SLOW_POLL_INTERVAL_MS : POLL_INTERVAL_MS);
      }, delay);
    };
    poll(POLL_INTERVAL_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [agentId, phase, requestKey, getSnapshot, kitMode]);

  /** Starts an assessment; a request the flow never picked up is cancelled and replaced. */
  const start = async () => {
    const previous = getSnapshot();
    if (!['idle', 'error', 'terminal', 'not-started'].includes(previous.phase)) return;
    publish(agentId, { phase: 'requesting' });
    try {
      // One assessment per agent at a time: join an in-flight run (e.g. started
      // by another member) instead of creating one that would lose the lock.
      const [active, flowsOff] = await Promise.all([findActiveRun(agentId), findFlowsTurnedOff(kitMode)]);
      const neverStarted = (candidate: ActiveRun) => isRunNotPickedUp(candidate.run)
        || (kitMode && isKitNotPickedUp(candidate.run))
        || (previous.phase === 'not-started' && candidate.requestKey === previous.requestKey);
      if (active && !neverStarted(active)) {
        publish(agentId, {
          phase: 'tracking', run: active.run, requestKey: active.requestKey,
          joined: { startedBy: active.startedBy },
        });
        return;
      }
      // A request no flow picked up never runs; cancel it so it is not followed again.
      const stuck = new Map<string, EvaluationRunVM>();
      if (previous.phase === 'not-started' && previous.run?.id) stuck.set(previous.run.id, previous.run);
      if (active?.run.id) stuck.set(active.run.id, active.run);
      await Promise.all([...stuck.values()].map((run) => cancelEvaluationRun(run).catch(() => undefined)));
      if (flowsOff.length > 0) throw new StartError(flowsOffNotice(flowsOff));
      const created = await createEvaluationRun(agent);
      if (!created.success || !created.requestKey) throw new Error('Could not create the evaluation run.');
      publish(agentId, { phase: 'tracking', requestKey: created.requestKey });
    } catch (cause) {
      publish(agentId, {
        phase: 'error',
        notice: cause instanceof StartError ? cause.notice : {
          intent: 'error',
          title: "Assessment didn't start",
          message: cause instanceof Error ? cause.message : 'Could not create the evaluation run.',
        },
      });
    }
  };

  /** Follows an assessment already in progress that this session is not following (for example after a reload). */
  const follow = useCallback(async () => {
    const followable = () => ['idle', 'error', 'terminal'].includes(getSnapshot().phase);
    if (!followable()) return;
    const active = await findActiveRun(agentId);
    if (!active || !followable()) return;
    publish(agentId, { phase: 'tracking', run: active.run, requestKey: active.requestKey });
  }, [agentId, getSnapshot]);

  const resume = () => {
    const previous = getSnapshot();
    if (previous.requestKey && ['poll-error', 'stalled'].includes(previous.phase)) {
      publish(agentId, { ...previous, phase: 'tracking', error: undefined });
    }
  };

  /** Stop the followed assessment; resolves to an error message when it could not be cancelled. */
  const cancel = async (): Promise<string | undefined> => {
    const previous = getSnapshot();
    if (!previous.requestKey || !['tracking', 'stalled', 'not-started', 'poll-error'].includes(previous.phase)) return undefined;
    try {
      const current = previous.run ?? await getRunByRequestKey(previous.requestKey);
      if (!current) return 'The assessment has not started yet. Try again in a moment.';
      await cancelEvaluationRun(current);
      const latest = await getRunByRequestKey(previous.requestKey).catch(() => undefined);
      publish(agentId, {
        ...getSnapshot(),
        phase: 'terminal',
        error: undefined,
        notice: undefined,
        run: latest ?? { ...current, status: 'Cancelled' },
      });
      refreshRef.current?.();
      return undefined;
    } catch (cause) {
      return cause instanceof Error ? cause.message : 'Could not cancel the assessment.';
    }
  };

  return { ...snapshot, start, follow, resume, cancel };
}
