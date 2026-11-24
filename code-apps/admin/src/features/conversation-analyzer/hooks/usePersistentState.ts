import { useCallback, useState } from 'react';

/** Reads a JSON value from localStorage; returns `fallback` when missing, unreadable or storage is blocked. */
export function readStoredValue<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/** Writes a JSON value to localStorage; failures (quota, private mode) are ignored. */
export function writeStoredValue<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Persistence is best-effort.
  }
}

/** `useState` that is initialised from and written through to localStorage. */
export function usePersistentState<T>(key: string, fallback: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readStoredValue(key, fallback));
  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (prev: T) => T)(prev) : next;
        writeStoredValue(key, resolved);
        return resolved;
      });
    },
    [key],
  );
  return [value, update];
}
