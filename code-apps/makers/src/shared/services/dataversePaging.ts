import { MicrosoftDataverseService } from '../../generated/services/MicrosoftDataverseService';

/** Pulls the `$skiptoken` value out of an OData `@odata.nextLink`. */
export function extractSkiptoken(nextLink: unknown): string | undefined {
  if (typeof nextLink !== 'string' || !nextLink) return undefined;

  // The connector wraps the inner OData query in its `next` parameter.
  try {
    const url = new URL(nextLink, 'https://placeholder.local');
    const next = url.searchParams.get('next');
    if (next) {
      const qIndex = next.indexOf('?');
      const qs = qIndex >= 0 ? next.substring(qIndex + 1) : next;
      const token = new URLSearchParams(qs).get('$skiptoken');
      if (token) return token;
    }
  } catch {
    // Preserve support for direct OData query strings.
  }

  const match = /[?&]\$skiptoken=([^&]+)/i.exec(nextLink);
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

type Row = Record<string, unknown>;
const isRow = (value: unknown): value is Row =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Complete connector reads; never present a partial or malformed page as success. */
export async function listDataverseRows(
  organization: string,
  entitySet: string,
  options: { select?: string; orderby?: string; filter?: string } = {},
): Promise<Row[]> {
  const rows: Row[] = [];
  const seen = new Set<string>();
  let skiptoken: string | undefined;
  do {
    const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
      organization, entitySet,
      'odata.include-annotations="OData.Community.Display.V1.FormattedValue",odata.maxpagesize=5000',
      'application/json', undefined, undefined,
      options.select, options.filter, options.orderby,
      undefined, undefined, undefined, skiptoken,
    );
    if (!result.success) throw new Error(`Failed to load ${entitySet} from Dataverse.`);
    const data: unknown = result.data;
    if (!isRow(data) || !Array.isArray(data.value) || !data.value.every(isRow)) {
      throw new Error(`Dataverse returned invalid rows for ${entitySet}.`);
    }
    rows.push(...data.value);
    const nextLink = data['@odata.nextLink'] ?? data.nextLink;
    if (nextLink === undefined || nextLink === null || nextLink === '') return rows;
    skiptoken = extractSkiptoken(nextLink);
    if (!skiptoken || seen.has(skiptoken)) {
      throw new Error(`Dataverse returned an invalid or repeated continuation for ${entitySet}.`);
    }
    seen.add(skiptoken);
  } while (skiptoken);
  return rows;
}
