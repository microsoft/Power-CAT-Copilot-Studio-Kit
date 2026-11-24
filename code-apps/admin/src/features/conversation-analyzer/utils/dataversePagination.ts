function decodeQueryComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Extracts a continuation token from a Dataverse or connector next-link without following it.
 * Parameter names match with or without the `$` prefix in any casing, including the
 * percent-encoded `%24skiptoken` form returned by the Power Platform for Admins connector.
 */
export function extractSkiptokenFromNextLink(nextLink: string | undefined): string | undefined {
  const queryStart = nextLink?.indexOf('?') ?? -1;
  if (!nextLink || queryStart < 0) return undefined;

  const fragmentStart = nextLink.indexOf('#', queryStart);
  const query = nextLink.slice(queryStart + 1, fragmentStart < 0 ? undefined : fragmentStart);
  let skipToken: string | undefined;
  let wrappedNextLink: string | undefined;
  for (const parameter of query.split('&')) {
    const separatorIndex = parameter.indexOf('=');
    if (separatorIndex <= 0) continue;
    const name = decodeQueryComponent(parameter.slice(0, separatorIndex)).replace(/^\$/, '').toLowerCase();
    const value = decodeQueryComponent(parameter.slice(separatorIndex + 1));
    if (!value) continue;
    if (name === 'skiptoken') skipToken = value;
    else if (name === 'next') wrappedNextLink = value;
  }

  return (wrappedNextLink && extractSkiptokenFromNextLink(wrappedNextLink)) || skipToken;
}

/** Returns the continuation tokens traversed through the requested infinite-query page. */
export function getTraversedSkipTokens(
  pageParams: readonly (string | undefined)[],
  currentPageParam: string | undefined,
): string[] {
  const currentIndex = pageParams.indexOf(currentPageParam);
  const traversedPageParams =
    currentIndex >= 0 ? pageParams.slice(0, currentIndex + 1) : [...pageParams, currentPageParam];
  return traversedPageParams.filter((token): token is string => token !== undefined);
}
