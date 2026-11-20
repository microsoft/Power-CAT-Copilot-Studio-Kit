import type { EvaluationIssue, PassingCheck } from '../contracts/DAEvaluationResult';
import {
  CRITERION_LEARN_DOCS,
  HEALTH_CHECK_LEARN_DOCS,
  ISSUE_LEARN_URLS,
  PACKAGE_GUIDANCE_DOCS,
  SCHEMA_LEARN_DOCS,
  type LearnDocLink,
} from '../contracts/learnDocs';

/** A guidance address with an optional label, before the label is resolved. */
export interface GuidanceLinkSource {
  url?: string;
  label?: string;
}

/** An evaluation issue with the optional links that manifest health checks add. */
export type GuidanceIssue = EvaluationIssue & { learnUrl?: string; learnLabel?: string };

const KNOWN_DOCS: readonly LearnDocLink[] = [
  ...Object.values(PACKAGE_GUIDANCE_DOCS),
  ...Object.values(SCHEMA_LEARN_DOCS),
  ...Object.values(CRITERION_LEARN_DOCS).flat(),
  ...Object.values(HEALTH_CHECK_LEARN_DOCS).flat(),
  ...Object.values(ISSUE_LEARN_URLS),
];

const FALLBACK_LABEL = 'Microsoft guidance';

function isWebUrl(url: string): boolean {
  return /^https?:\/\/\S+$/i.test(url);
}

/** Returns the page address: the URL without its `#` fragment. */
export function guidancePageOf(url: string): string {
  const trimmed = url.trim();
  const hashIndex = trimmed.indexOf('#');
  return hashIndex < 0 ? trimmed : trimmed.slice(0, hashIndex);
}

function labelFromPath(page: string): string | undefined {
  try {
    const { hostname, pathname } = new URL(page);
    const segment = pathname.split('/').filter(Boolean).pop();
    const words = segment ? decodeURIComponent(segment).replace(/[-_]+/g, ' ').trim() : '';
    if (!words) return hostname || undefined;
    return words.charAt(0).toUpperCase() + words.slice(1);
  } catch {
    return undefined;
  }
}

/**
 * Returns a readable label for a guidance URL. It uses the label of the known
 * link with the same address, then the label of a known link to the whole page,
 * then words from the last part of the path.
 */
export function guidanceLinkLabel(url: string): string {
  const trimmed = url.trim();
  const exact = KNOWN_DOCS.find((doc) => doc.url === trimmed);
  if (exact) return exact.label;
  const page = guidancePageOf(trimmed);
  const wholePage = KNOWN_DOCS.find((doc) => doc.url === page);
  if (wholePage) return wholePage.label;
  return labelFromPath(page) ?? FALLBACK_LABEL;
}

/**
 * Keeps one link for each page, in the given order. It removes addresses that
 * are empty or are not http or https, and it gives each link a label.
 */
export function distinctGuidanceLinks(
  sources: ReadonlyArray<GuidanceLinkSource | undefined>,
): LearnDocLink[] {
  const pages = new Set<string>();
  const links: LearnDocLink[] = [];
  for (const source of sources) {
    const url = source?.url?.trim();
    if (!url || !isWebUrl(url)) continue;
    const page = guidancePageOf(url);
    if (pages.has(page)) continue;
    pages.add(page);
    links.push({ url, label: source?.label?.trim() || guidanceLinkLabel(url) });
  }
  return links;
}

/** Returns the guidance link of one issue, or undefined when it has no web address. */
export function issueGuidanceLink(issue: GuidanceIssue): LearnDocLink | undefined {
  const mapped = issue.issueKey ? ISSUE_LEARN_URLS[issue.issueKey] : undefined;
  const [link] = distinctGuidanceLinks([
    mapped,
    { url: issue.guidanceUrl },
    { url: issue.learnUrl, label: issue.learnLabel },
  ]);
  return link;
}

/** Keeps the first passing check for each description, ignoring case and extra spaces. */
export function distinctPassingChecks(checks: readonly PassingCheck[]): PassingCheck[] {
  const seen = new Set<string>();
  return checks.filter((check) => {
    const key = (check.description ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
