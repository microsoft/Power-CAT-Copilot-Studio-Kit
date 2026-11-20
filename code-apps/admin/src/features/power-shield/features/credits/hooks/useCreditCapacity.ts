import { useCallback, useEffect, useRef, useState } from 'react';
import { createLatestLoader, loadCreditSnapshot, type CreditSnapshot } from '../services/creditCapacity';

export interface CreditCapacityState {
  snapshot: CreditSnapshot | null;
  isLoading: boolean;
  refresh(): void;
}

/**
 * Loads a capacity snapshot as soon as `active` is true, and again on each `refresh`. Only the newest load
 * is kept, and turning `active` off drops any load still in flight (spec 025 US3, spec 030).
 */
export function useCreditCapacity(envId: string, open: boolean): CreditCapacityState {
  const loaderRef = useRef(createLatestLoader(loadCreditSnapshot));
  const [snapshot, setSnapshot] = useState<CreditSnapshot | null>(null);
  const [version, setVersion] = useState(0);
  const active = open && !!envId;

  useEffect(() => {
    if (!active) return;
    const loader = loaderRef.current;
    void loader.load(envId).then((result) => {
      if (result !== undefined) setSnapshot(result);
    });
    return () => {
      loader.cancel();
      setSnapshot(null);
    };
  }, [active, envId, version]);

  const refresh = useCallback(() => {
    setSnapshot(null);
    setVersion((v) => v + 1);
  }, []);

  return { snapshot, isLoading: active && snapshot === null, refresh };
}