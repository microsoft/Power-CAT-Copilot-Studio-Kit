/**
 * Abort-aware bounded async queue for concurrent resource processing.
 *
 * A cancelled slot means the item was never started because the signal was
 * aborted before the runner picked it up.
 */

export type BoundedMapResult<T> =
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; reason: unknown }
  | { status: "cancelled" };

/**
 * Maps `items` through `worker` with at most `limit` tasks running at once.
 *
 * When `signal` is aborted, runners stop picking up new items. Items already
 * in flight run to completion; unstarted items are returned as `cancelled`.
 *
 * @param items - Read-only array of inputs.
 * @param limit - Maximum simultaneous workers; must be a positive integer.
 * @param worker - Async transform applied to each item.
 * @param signal - Optional AbortSignal to stop scheduling new work.
 * @returns One `BoundedMapResult` per input, in index order.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<BoundedMapResult<R>[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("Concurrency limit must be a positive integer");
  }
  const results: BoundedMapResult<R>[] = items.map(() => ({ status: "cancelled" }));
  let nextIndex = 0;
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (nextIndex < items.length) {
        if (signal?.aborted) return;
        const index = nextIndex;
        nextIndex += 1;
        try {
          results[index] = {
            status: "fulfilled",
            value: await worker(items[index], index),
          };
        } catch (reason) {
          results[index] = { status: "rejected", reason };
        }
      }
    },
  );
  await Promise.all(runners);
  return results;
}
