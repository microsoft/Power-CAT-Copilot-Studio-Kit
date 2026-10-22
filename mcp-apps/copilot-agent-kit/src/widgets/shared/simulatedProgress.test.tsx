import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { simulatedPlaybackStepMs, simulatedStepMs, useSimulatedPlayback } from "./simulatedProgress";

describe("simulated progress flag", () => {
  it("accepts true or { stepMs } and clamps the step to 250–10,000 ms", () => {
    expect(simulatedStepMs(true)).toBe(2_000);
    expect(simulatedStepMs({ stepMs: 1_500 })).toBe(1_500);
    expect(simulatedStepMs({ stepMs: 10 })).toBe(250);
    expect(simulatedStepMs({ stepMs: 60_000 })).toBe(10_000);
    expect(simulatedStepMs({})).toBe(2_000);
    expect(simulatedStepMs({ stepMs: Number.NaN })).toBe(2_000);
    for (const flag of [undefined, null, false, 0, 2_000, "true", []]) expect(simulatedStepMs(flag)).toBeUndefined();
  });

  it("keeps a whole playback within 16 seconds", () => {
    expect(simulatedPlaybackStepMs(2_000, 5)).toBe(2_000);
    expect(simulatedPlaybackStepMs(10_000, 5)).toBe(3_200);
    expect(simulatedPlaybackStepMs(10_000, 3)).toBe(5_333);
  });
});

describe("simulated playback", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("advances one step per step time and stops after the last step", () => {
    const { result } = renderHook(() => useSimulatedPlayback("result-a", 1_000, 3));
    expect(result.current).toMatchObject({ step: 0, steps: 3, stepMs: 1_000 });
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(result.current?.step).toBe(1);
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(result.current?.step).toBe(2);
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(result.current).toBeNull();
  });

  it("plays again for a new tool call, but not for the same result of the same call in a new frame", () => {
    const first = renderHook(() => useSimulatedPlayback("result-b", 1_000, 2, "call-1"));
    expect(first.result.current?.step).toBe(0);
    first.unmount();
    expect(renderHook(() => useSimulatedPlayback("result-b", 1_000, 2, "call-1")).result.current).toBeNull();
    expect(renderHook(() => useSimulatedPlayback("result-b", 1_000, 2)).result.current).toBeNull();
    expect(renderHook(() => useSimulatedPlayback("result-b", 1_000, 2, "call-2")).result.current?.step).toBe(0);
  });

  it("plays once per frame when session storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
    const view = renderHook(({ key }) => useSimulatedPlayback(key, 1_000, 2), { initialProps: { key: "result-c" as string | undefined } });
    expect(view.result.current?.step).toBe(0);
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(view.result.current).toBeNull();
    view.rerender({ key: undefined });
    view.rerender({ key: "result-c" });
    expect(view.result.current).toBeNull();
    view.unmount();
    expect(renderHook(() => useSimulatedPlayback("result-c", 1_000, 2)).result.current?.step).toBe(0);
  });
});
