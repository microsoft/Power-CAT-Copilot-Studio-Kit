import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const POLL_INTERVAL_MS = 5000;

/**
 * Generic 5-second poller for a background run. Starts when {@link begin} is
 * invoked with a setup value, polls `run(setup)` on an interval until
 * `isPending(result)` is false, then fires `onSettled(result)` exactly once and
 * stops. Nothing is fetched while idle. Polling also stops on unmount, or early
 * when {@link stop} is called (e.g. a dialog closing mid-poll).
 */
export function usePollingTracker<TSetup, TResult>(
  queryKey: readonly unknown[],
  run: (setup: TSetup) => Promise<TResult>,
  isPending: (result: TResult) => boolean,
  onSettled: (result: TResult) => void,
) {
  const queryClient = useQueryClient();
  const [setup, setSetup] = useState<{ value: TSetup } | null>(null);
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;
  const isPendingRef = useRef(isPending);
  isPendingRef.current = isPending;
  const stableKey = useRef(queryKey).current;

  const query = useQuery({
    queryKey: stableKey,
    queryFn: () => run((setup as { value: TSetup }).value),
    enabled: setup !== null,
    refetchInterval: setup !== null ? POLL_INTERVAL_MS : false,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    gcTime: 0,
    staleTime: 0,
  });

  const result = query.data;
  useEffect(() => {
    if (setup === null || result === undefined || isPendingRef.current(result)) return;
    setSetup(null);
    queryClient.removeQueries({ queryKey: stableKey });
    onSettledRef.current(result);
  }, [setup, result, queryClient, stableKey]);

  const begin = useCallback(
    (value: TSetup) => {
      queryClient.removeQueries({ queryKey: stableKey });
      setSetup({ value });
    },
    [queryClient, stableKey],
  );

  const stop = useCallback(() => {
    setSetup(null);
    queryClient.removeQueries({ queryKey: stableKey });
  }, [queryClient, stableKey]);

  return { begin, stop, isTracking: setup !== null };
}
