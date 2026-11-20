import type { DAPackageReference } from '../contracts/DAPackageReview';

const EXAMPLE_LABEL = 'Example:';
const VERIFY_LABEL = 'How to verify:';

/**
 * Joins one concrete fix, an optional example that uses the agent's own
 * values, and the check that confirms the fix.
 */
export function withVerification(action: string, verification: string, example?: string): string {
  const exampleText = example?.trim();
  return `${action.trim()}${exampleText ? ` ${EXAMPLE_LABEL} ${exampleText}` : ''} ${VERIFY_LABEL} ${verification.trim()}`;
}

export interface RecommendationParts {
  action: string;
  example?: string;
  verify?: string;
}

/**
 * Splits a recommendation into its action, example, and verification parts.
 * Only the labels "Example:" and "How to verify:" start a part, so the
 * phrase "for example" in the action text stays in the action.
 */
export function splitRecommendation(text: string): RecommendationParts {
  const source = text.trim();
  const markers: Array<{ part: 'example' | 'verify'; start: number; end: number }> = [];
  const verifyStart = source.lastIndexOf(VERIFY_LABEL);
  if (verifyStart >= 0) {
    markers.push({ part: 'verify', start: verifyStart, end: verifyStart + VERIFY_LABEL.length });
  }
  const exampleMatch = /(^|\s)Example:/.exec(source);
  if (exampleMatch) {
    const start = exampleMatch.index + exampleMatch[1].length;
    markers.push({ part: 'example', start, end: start + EXAMPLE_LABEL.length });
  }
  markers.sort((first, second) => first.start - second.start);

  const parts: RecommendationParts = {
    action: source.slice(0, markers[0]?.start ?? source.length).trim(),
  };
  markers.forEach((marker, index) => {
    const value = source.slice(marker.end, markers[index + 1]?.start ?? source.length).trim();
    if (value) parts[marker.part] = value;
  });
  return parts;
}

/** Returns the https:// form of an http:// URL, or undefined for other values. */
export function httpsFormOf(url: string): string | undefined {
  return /^http:\/\/\S+$/i.test(url.trim()) ? `https://${url.trim().slice('http://'.length)}` : undefined;
}

/** Quotes up to `max` values and says how many other values there are. */
export function quotedList(values: readonly string[], max = 3): string {
  return limitedList(values.map((value) => `"${value}"`), max, ', ');
}

/**
 * Shortens text to the limit at a word boundary, so that the example stays
 * the agent's own words.
 */
export function shortenedTo(value: string, limit: number): string {
  const text = value.trim();
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > limit / 2 ? cut.slice(0, lastSpace) : cut).trim();
}

/** Returns a count with the correct singular or plural noun. */
export function countOf(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Joins up to `max` items and says how many other items there are. */
export function limitedList(items: readonly string[], max: number, separator = '; '): string {
  const shown = items.slice(0, max).join(separator);
  return items.length > max ? `${shown}${separator}and ${items.length - max} more` : shown;
}

/**
 * Describes a plugin document for a maker. Inline plugins have evidence paths
 * such as "declarativeAgent.json#$.actions[0].plugin".
 */
export function documentLabel(documentPath: string): string {
  const hashIndex = documentPath.indexOf('#');
  return hashIndex < 0
    ? documentPath
    : `the inline plugin at ${documentPath.slice(hashIndex + 1)} in ${documentPath.slice(0, hashIndex)}`;
}

/** Builds the fix for an absolute HTTPS URL finding. */
export function httpsUrlRecommendation(
  url: string,
  jsonPath: string,
  sourceFile: string,
  subject: string,
): string {
  const httpsUrl = httpsFormOf(url);
  return withVerification(
    url
      ? `Change ${jsonPath} in ${sourceFile} from "${url}" to the absolute https:// URL of the ${subject}.`
      : `Add the absolute https:// URL of the ${subject} at ${jsonPath} in ${sourceFile}.`,
    `Confirm that ${jsonPath} starts with https:// and that the ${subject} responds at that address.`,
    httpsUrl ? `"url": "${httpsUrl}"` : undefined,
  );
}

/** Builds the fix for a package reference that the parser could not resolve. */
export function referenceRecommendation(reference: DAPackageReference): string {
  const location = `${reference.jsonPath} in ${reference.sourceFile}`;
  const requestedPath = reference.requestedPath.trim();
  const target = reference.normalizedPath ?? requestedPath;
  const openCheck = `Open the ZIP and confirm that the file that ${location} names is in the package.`;

  if (!requestedPath) {
    return reference.kind === 'plugin'
      ? withVerification(
          `Add a package-relative plugin file path or an inline plugin manifest at ${location}.`,
          `Confirm that ${location} has a file value or a plugin object.`,
        )
      : withVerification(`Add a package-relative file path at ${location}.`, openCheck);
  }

  const fileName = requestedPath
    .replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '')
    .split(/[\\/]/)
    .filter(Boolean)
    .pop()
    ?.split(/[?#]/)[0];
  const localExample = fileName && !/^\.+$/.test(fileName)
    ? `Put ${fileName} in the package next to ${reference.sourceFile}, and set the value to "${fileName}".`
    : undefined;

  switch (reference.status) {
    case 'unsafe':
      return withVerification(
        `Change ${location} to a path inside the package, relative to ${reference.sourceFile}. Do not use an absolute path, a URL, or ".." segments that go outside the package root.`,
        openCheck,
        localExample,
      );
    case 'invalid': {
      const format = /\.ya?ml$/i.test(target) ? 'YAML' : 'JSON';
      return withVerification(
        `Correct the syntax of "${target}" so that it is valid ${format}.`,
        `Open "${target}" in a ${format} validator and confirm that it reports no errors.`,
      );
    }
    case 'external':
      return withVerification(
        `Put the file in the package and change ${location} to its package-relative path.`,
        openCheck,
        localExample,
      );
    default:
      return withVerification(
        `Add "${target}" to the package, or change ${location} to the path of a file that is in the package.`,
        openCheck,
      );
  }
}
