const URI_SCHEME = /^[a-z][a-z\d+.-]*:/i;

/**
 * Converts a scheme-free official reference into HTTPS and rejects unsafe URLs.
 */
export function normalizeReferenceHref(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const candidate = URI_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}
