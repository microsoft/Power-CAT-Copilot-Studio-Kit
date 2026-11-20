/** Extract the cookie without following a connector-supplied URL or changing query scope. */
export function extractSkiptokenFromNextLink(nextLink: string | undefined): string | undefined {
  if (!nextLink) return undefined;

  // The connector wraps an encoded OData query in `next`. Decode each query
  // layer once so encoded characters within the paging cookie remain intact.
  try {
    const url = new URL(nextLink, "https://placeholder.local");
    const next = url.searchParams.get("next");
    if (next) {
      const qIndex = next.indexOf("?");
      const qs = qIndex >= 0 ? next.substring(qIndex + 1) : next;
      const token = new URLSearchParams(qs).get("$skiptoken");
      if (token) return token;
    }
    const token = url.searchParams.get("$skiptoken");
    if (token) return token;
  } catch {
    // Retain the transcript reader's direct-link fallback for non-URL responses.
  }

  const match = nextLink.match(/[?&]\$skiptoken=([^&]+)/i);
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}
