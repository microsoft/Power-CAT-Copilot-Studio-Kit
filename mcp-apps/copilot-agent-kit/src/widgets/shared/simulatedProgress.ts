import { useEffect, useRef, useState } from "react";
import type { McpUiHostContext } from "@modelcontextprotocol/ext-apps";

/**
 * Optional demo pacing. A static demo server can add `structuredContent.simulatedProgress`
 * (`true`, or `{ stepMs }`) to a result that is already final. The view then plays its own
 * waiting state with timers only: no tool call and no save. This server never sends the field.
 */
export const SIMULATED_STEP_MS = 2_000;
export const SIMULATED_MIN_STEP_MS = 250;
export const SIMULATED_MAX_STEP_MS = 10_000;
/** A whole playback stays within this time; more steps get shorter steps. */
export const SIMULATED_MAX_TOTAL_MS = 16_000;
const PLAYED_KEY_PREFIX = "mcp-app:simulated-progress:";

/** The step time of the flag: `true` is 2 s, `{ stepMs }` is clamped to 250–10,000 ms. Undefined without a flag. */
export function simulatedStepMs(flag: unknown): number | undefined {
  if (flag === true) return SIMULATED_STEP_MS;
  if (!flag || typeof flag !== "object" || Array.isArray(flag)) return undefined;
  const stepMs = (flag as { stepMs?: unknown }).stepMs;
  if (typeof stepMs !== "number" || !Number.isFinite(stepMs)) return SIMULATED_STEP_MS;
  return Math.min(SIMULATED_MAX_STEP_MS, Math.max(SIMULATED_MIN_STEP_MS, Math.round(stepMs)));
}

/** The step time that keeps `steps` steps within the total playback limit. */
export function simulatedPlaybackStepMs(stepMs: number, steps: number): number {
  return Math.min(stepMs, Math.floor(SIMULATED_MAX_TOTAL_MS / Math.max(1, steps)));
}

/** The JSON-RPC id of the tool call that opened this view, when the host supplies it. */
export function hostToolCallId(host: McpUiHostContext | undefined): string | undefined {
  const id = host?.toolInfo?.id;
  return typeof id === "string" || typeof id === "number" ? String(id) : undefined;
}

function sessionStore(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

/** True when another frame of this tab already played the same result of the same tool call. */
function playedInSession(key: string, toolCallId: string | undefined): boolean {
  try {
    const played = sessionStore()?.getItem(PLAYED_KEY_PREFIX + key);
    // A new tool call with the same static result plays again.
    return played != null && (!toolCallId || !played || played === toolCallId);
  } catch {
    return false;
  }
}

function rememberPlayed(key: string, toolCallId: string | undefined): void {
  try {
    sessionStore()?.setItem(PLAYED_KEY_PREFIX + key, toolCallId ?? "");
  } catch {
    // A sandboxed frame can block storage. The view then plays once per frame.
  }
}

export interface SimulatedPlayback {
  /** The current step, from 0 to `steps - 1`. */
  step: number;
  steps: number;
  /** The effective step time, after the total playback limit. */
  stepMs: number;
  startedAt: number;
}

interface PlaybackRun {
  key: string;
  step: number;
  startedAt: number;
}

/**
 * Plays `steps` timed steps once for each result `key`. The same key does not play again in
 * this view, for example after a display-mode change, or in a new frame of the same tab when
 * session storage works. Returns null when nothing plays.
 */
export function useSimulatedPlayback(
  key: string | undefined,
  stepMs: number | undefined,
  steps: number,
  toolCallId?: string,
): SimulatedPlayback | null {
  const played = useRef(new Set<string>());
  const playbackStepMs = stepMs && steps > 0 ? simulatedPlaybackStepMs(stepMs, steps) : undefined;
  const begin = (next: string | undefined): PlaybackRun | null =>
    next && playbackStepMs && !played.current.has(next) && !playedInSession(next, toolCallId)
      ? { key: next, step: 0, startedAt: Date.now() }
      : null;
  const [run, setRun] = useState<PlaybackRun | null>(() => begin(key));
  const [runKey, setRunKey] = useState(key);
  if (runKey !== key) {
    setRunKey(key);
    setRun(begin(key));
  }

  useEffect(() => {
    if (!run) return;
    played.current.add(run.key);
    rememberPlayed(run.key, toolCallId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.key]);

  // One interval for each run: batched ticks still advance one step each.
  const playing = run?.key;
  useEffect(() => {
    if (!playing || !playbackStepMs) return;
    const timer = window.setInterval(() => setRun(current =>
      current?.key !== playing ? current
        : current.step + 1 < steps ? { ...current, step: current.step + 1 } : null), playbackStepMs);
    return () => window.clearInterval(timer);
  }, [playing, playbackStepMs, steps]);

  return run && playbackStepMs ? { step: run.step, steps, stepMs: playbackStepMs, startedAt: run.startedAt } : null;
}
