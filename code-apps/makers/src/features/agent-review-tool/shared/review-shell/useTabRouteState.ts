import { useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Resolves a valid route selection or returns its fallback. */
export function resolveTabRouteValue<T extends string>(
  search: URLSearchParams,
  parameterName: string,
  fallback: T,
  isValid: (value: string) => boolean,
): T {
  const fromUrl = search.get(parameterName);
  return fromUrl && isValid(fromUrl) ? (fromUrl as T) : fallback;
}

/** Returns a copy of the search parameters with one route selection updated. */
export function withTabRouteValue(
  search: URLSearchParams,
  parameterName: string,
  value: string,
): URLSearchParams {
  const params = new URLSearchParams(search);
  params.set(parameterName, value);
  return params;
}

/** Synchronizes one named tab selection with the current URL. */
export function useTabRouteState<T extends string>(
  fallback: T,
  isValid: (value: string) => boolean,
  parameterName = 'tab',
): [T, (next: T) => void] {
  const [search, setSearch] = useSearchParams();
  const selected = resolveTabRouteValue(search, parameterName, fallback, isValid);

  useEffect(() => {
    if (search.get(parameterName) === selected) return;
    setSearch(
      previous => withTabRouteValue(previous, parameterName, selected),
      { replace: true },
    );
  }, [parameterName, search, selected, setSearch]);

  const select = useCallback((next: T) => {
    setSearch(
      previous => withTabRouteValue(previous, parameterName, next),
      { replace: true },
    );
  }, [parameterName, setSearch]);

  return [selected, select];
}
