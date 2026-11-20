/** User-facing names for Copilot Studio evaluation metric (grader) types. */
export const METRIC_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  generalquality: 'Response Quality',
  capabilityuse: 'Tool and Capability Use',
  anykeywordmatch: 'Required Information Coverage',
  comparemeaning: 'Meaning Alignment',
  textsimilarity: 'Response Similarity',
  customlabels: 'Business Classification',
  // Results recorded for a test set Copilot Studio could not run or score.
  external: 'Test set not scored',
};

/** Content Safety content types, as reported in the result's data.category. */
const CONTENT_SAFETY_CATEGORIES: Readonly<Record<string, string>> = {
  selfharm: 'Self-harm',
  violence: 'Violence',
  sexual: 'Sexual',
  hate: 'Hate and unfairness',
  hateunfairness: 'Hate and unfairness',
  hatefulness: 'Hate and unfairness',
};

const key = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

const humanize = (raw: string) =>
  /\s/.test(raw) ? raw : raw.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');

const baseDisplayName = (raw: string) => METRIC_DISPLAY_NAMES[key(raw)] ?? humanize(raw);

/**
 * Friendly metric label; unknown identifiers are split into words ("ContentSafety" → "Content Safety").
 * The flow stores one identity per evaluation method: "ContentSafety:selfharm" for each Content Safety
 * content type and "<Type>#2" when a test set repeats a method. A known method name (`grader`)
 * replaces the repeat number: "CustomLabels#2" + "PII" → "Business Classification (PII)".
 */
export function metricDisplayName(value: string | undefined, grader?: string): string {
  const raw = value?.trim() ?? '';
  if (!raw) return '';
  const parts = /^([^\s:#]+)(?::([^\s#]+))?(?:#(\d+))?$/.exec(raw);
  if (!parts) return baseDisplayName(raw);
  const [, base, category, occurrence] = parts;
  if (grader?.trim()) return `${baseDisplayName(base)} (${grader.trim()})`;
  const qualifiers = [category && (CONTENT_SAFETY_CATEGORIES[key(category)] ?? humanize(category)), occurrence]
    .filter(Boolean);
  return qualifiers.length ? `${baseDisplayName(base)} (${qualifiers.join(', ')})` : baseDisplayName(base);
}

/**
 * Results saved before each Content Safety method had its own identity are all "ContentSafety";
 * give them the "ContentSafety:<category>" identity newer runs store so runs line up in comparisons.
 */
export function withMetricCategory(metric: string | undefined, reason: string | undefined): string | undefined {
  if (!metric || !reason || key(metric) !== 'contentsafety') return metric;
  try {
    const category = (JSON.parse(reason) as { data?: { category?: unknown } } | null)?.data?.category;
    return typeof category === 'string' && category.trim()
      ? `${metric.trim()}:${category.trim().toLowerCase()}`
      : metric;
  } catch {
    return metric;
  }
}

const metricIdentifiers =
  /\b(?:GeneralQuality|CapabilityUse|AnyKeywordMatch|CompareMeaning|TextSimilarity|CustomLabels|ContentSafety)(?::[a-z]+)?(?:#\d+)?\b/gi;

/** Replace raw metric identifiers inside free text (e.g. the AI analysis). */
export function withMetricDisplayNames(text: string): string {
  return text.replace(metricIdentifiers, (match) => metricDisplayName(match));
}
