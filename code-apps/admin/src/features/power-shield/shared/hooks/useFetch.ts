import { useCallback, useEffect, useState } from 'react';

export interface FetchState<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Generic data-fetching hook. Fetches on mount and whenever `deps` change.
 * Manual refresh is available via the returned `refetch` callback.
 * No timer-based polling or auto-refetch on window focus (Constitution Principle V).
 *
 * @param fetcher  Async function that returns the data. Recreate via closure when deps change.
 * @param deps     Dependency array — same semantics as useEffect/useCallback deps.
 */
export function useFetch<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
): FetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // deps is intentionally spread — hook is deps-driven by design
  /* eslint-disable react-hooks/exhaustive-deps */
  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'An unexpected error occurred.',
      );
    } finally {
      setIsLoading(false);
    }
  }, deps);
  /* eslint-enable react-hooks/exhaustive-deps */

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, isLoading, error, refetch };
}
