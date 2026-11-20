import { useCallback, useEffect, useState } from 'react';

export const TOUR_STORAGE_KEY = 'modelAssessment.tourCompleted';
const TOUR_START_DELAY_MS = 500;

function readCompleted(): boolean {
  try {
    return localStorage.getItem(TOUR_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export interface FirstRunTour {
  /** 1-based step, or 0 when the tour is not showing. */
  step: number;
  next: () => void;
  previous: () => void;
  /** Ends the tour and remembers it, so it does not start again on its own. */
  finish: () => void;
  /** Replays the tour from the first step (from Help). */
  start: () => void;
}

/**
 * First-run tour state. Starts on its own once `ready` (the grid has agents),
 * unless the maker already finished or skipped it in this browser.
 */
export function useFirstRunTour(ready: boolean): FirstRunTour {
  const [completed, setCompleted] = useState(readCompleted);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!ready || completed || step > 0) return;
    const timer = setTimeout(() => setStep(1), TOUR_START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [ready, completed, step]);

  const finish = useCallback(() => {
    setStep(0);
    setCompleted(true);
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    } catch {
      // The tour only repeats on the next visit.
    }
  }, []);

  return {
    step,
    next: useCallback(() => setStep((s) => s + 1), []),
    previous: useCallback(() => setStep((s) => Math.max(1, s - 1)), []),
    finish,
    start: useCallback(() => setStep(1), []),
  };
}
