const UNIX_MILLISECONDS_THRESHOLD = 1_000_000_000_000;

export function normalizeTimestampMs(value: unknown): number | undefined {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return undefined;
    return Math.abs(value) < UNIX_MILLISECONDS_THRESHOLD
      ? value * 1000
      : value;
  }

  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) return normalizeTimestampMs(numeric);

  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function activityTimestampMs(activity: unknown): number | undefined {
  if (!activity || typeof activity !== "object") return undefined;
  const record = activity as Record<string, unknown>;
  return (
    normalizeTimestampMs(record.timestampMs) ??
    normalizeTimestampMs(record.timestamp)
  );
}
