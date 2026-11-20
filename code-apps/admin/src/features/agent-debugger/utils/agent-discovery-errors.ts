type DiscoveryErrorKind = "access-denied" | "transient" | "cancelled" | "other";

export function classifyAgentDiscoveryError(error: unknown): DiscoveryErrorKind {
  const messages: string[] = [];
  const statuses: number[] = [];
  let cancelled = false;
  const seen = new Set<unknown>();
  for (let cause = error; cause && !seen.has(cause);) {
    seen.add(cause);
    if (typeof cause !== "object") {
      if (typeof cause === "string") messages.push(cause);
      break;
    }
    const details = cause as Record<string, unknown>;
    cancelled ||= details.name === "AbortError" || details.name === "CancelledError";
    for (const field of ["message", "code", "name"]) {
      if (typeof details[field] === "string") messages.push(details[field]);
    }
    if (typeof details.status === "number" && details.status >= 100 && details.status < 600) {
      statuses.push(details.status);
    }
    cause = details.cause;
  }
  const message = messages.join(" ");
  for (const match of message.matchAll(/\b(?:HTTP|status(?: code)?)\s*[:=]?\s*(\d{3})\b/gi)) {
    statuses.push(Number(match[1]));
  }
  if (cancelled) return "cancelled";
  if (statuses.some(status => status === 401 || status === 403)
    || /prvRead\w*|ThrowCrmSecurityException|access\s*denied|forbidden|unauthorized|insufficient privileges|TOKEN_ACQUISITION_FAILED/i.test(message)) {
    return "access-denied";
  }
  // The connector does not expose Retry-After reliably. Do not blindly retry throttling.
  if (statuses.includes(429)) return "other";
  if (statuses.length) {
    return statuses.every(status => [408, 500, 502, 503, 504].includes(status)) ? "transient" : "other";
  }
  return /Failed to fetch|fetch failed|NetworkError|Network request failed|Load failed|ERR_NETWORK|ECONNRESET|ECONNREFUSED|ETIMEDOUT|TimeoutError|RequestTimeout|timed out|request timeout|BadGateway|ServiceUnavailable|GatewayTimeout/i.test(message)
    ? "transient" : "other";
}

export function agentDiscoveryErrorCacheTime(error: unknown): number {
  const kind = classifyAgentDiscoveryError(error);
  if (kind === "cancelled") return 0;
  return kind === "transient" ? 30_000 : 5 * 60_000;
}

export function shouldRetryAgentDiscovery(failureCount: number, error: Error): boolean {
  return failureCount < 2 && classifyAgentDiscoveryError(error) === "transient";
}

export function agentDiscoveryRetryDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 2000);
}

export function agentDiscoveryError(
  cause: unknown,
  fallback: string,
  accessDeniedMessage?: string,
): Error {
  const message = cause && typeof cause === "object" && "message" in cause
    && typeof cause.message === "string" ? cause.message : fallback;
  return new Error(
    accessDeniedMessage && classifyAgentDiscoveryError(cause) === "access-denied"
      ? accessDeniedMessage : message,
    { cause },
  );
}
