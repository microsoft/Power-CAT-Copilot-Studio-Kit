/**
 * Skill bundle Dataverse port and service.
 *
 * The port interface isolates all Dataverse I/O so the service is fully
 * testable without a live environment.  The production implementation
 * (`createProductionSkillBundlePort`) is wired up at the feature layer.
 *
 * Power Apps SDK and generated-service imports are intentionally lazy (dynamic)
 * inside the factory so that importing this module at test-collection time does
 * not trigger @microsoft/power-apps/data resolution, which fails under Vitest.
 */

import type { RetrievalIssue, SkillResourceRow } from "../../contracts/SkillBundle";
import { mapWithConcurrency, type BoundedMapResult } from "./concurrency";

/** Injected Dataverse I/O surface for the skill bundle pipeline. */
export interface SkillBundleDataPort {
  /** List type-14 BotFileAttachment children of a parent skill component. */
  listChildren(
    parentId: string,
    botId: string,
    orgUrl?: string | null,
  ): Promise<SkillResourceRow[]>;

  /** Download file bytes from the current environment via the Dataverse file column API. */
  downloadCurrent(recordId: string): Promise<Uint8Array>;

  /** Download file bytes from a cross-environment org via the connector file API. */
  downloadFromOrganization(recordId: string, orgUrl: string): Promise<Uint8Array>;
}

/** Result returned by {@link SkillBundleService.listPublishedChildren}. */
export interface ListPublishedChildrenResult {
  /** Deduplicated published rows — one per unique componentidunique. */
  rows: SkillResourceRow[];
  /** Non-fatal issues detected during list/deduplication. */
  issues: RetrievalIssue[];
}

/**
 * Service for reading type-14 skill bundle resources from Dataverse.
 *
 * All Dataverse I/O is delegated to the injected `SkillBundleDataPort` so
 * the service is testable without a live environment.
 */
export class SkillBundleService {
  private readonly port: SkillBundleDataPort;

  constructor(port: SkillBundleDataPort) {
    this.port = port;
  }

  /**
   * Fetch published type-14 children of `parentId` and deduplicate by
   * `componentidunique`, keeping the row with the highest `versionnumber`
   * (tie-break: newest `modifiedon`).
   *
   * @param parentId - botcomponentid of the parent skill component.
   * @param botId - botid of the owning agent.
   * @param orgUrl - Optional org URL for cross-environment reads.
   */
  async listPublishedChildren(
    parentId: string,
    botId: string,
    orgUrl?: string | null,
  ): Promise<ListPublishedChildrenResult> {
    const rows = await this.port.listChildren(parentId, botId, orgUrl);
    const issues: RetrievalIssue[] = [];

    const byUnique = new Map<string, SkillResourceRow>();
    for (const row of rows) {
      const existing = byUnique.get(row.componentidunique);
      if (!existing) {
        byUnique.set(row.componentidunique, row);
      } else {
        const rowVer = row.versionnumber ?? 0;
        const existingVer = existing.versionnumber ?? 0;
        if (
          rowVer > existingVer ||
          (rowVer === existingVer && row.modifiedon > existing.modifiedon)
        ) {
          byUnique.set(row.componentidunique, row);
        }
        issues.push({
          code: "duplicate-component-layer",
          message: `Duplicate componentidunique "${row.componentidunique}" — kept version ${Math.max(rowVer, existingVer)}`,
          severity: "warning",
        });
      }
    }

    return { rows: Array.from(byUnique.values()), issues };
  }

  /**
   * Download the file bytes for a single resource row.
   *
   * Uses the org-aware connector path when `orgUrl` is provided (cross-environment),
   * and the current-environment Dataverse file API otherwise.
   *
   * @param row - The resource row whose `botcomponentid` identifies the record.
   * @param orgUrl - Optional org URL; when truthy, routes through the connector.
   */
  async downloadResource(
    row: SkillResourceRow,
    orgUrl?: string | null,
  ): Promise<Uint8Array> {
    if (orgUrl) {
      return this.port.downloadFromOrganization(row.botcomponentid, orgUrl);
    }
    return this.port.downloadCurrent(row.botcomponentid);
  }

  /**
   * Download all resource rows with a concurrency cap of 2.
   *
   * Returns one {@link BoundedMapResult} per input row.  A failed download
   * becomes a `rejected` result without cancelling remaining downloads.
   * If `signal` is aborted, unstarted rows are returned as `cancelled`.
   *
   * @param rows - Resource rows to download.
   * @param orgUrl - Optional org URL forwarded to each {@link downloadResource} call.
   * @param signal - Optional AbortSignal to stop scheduling new downloads.
   */
  async downloadPublishedResources(
    rows: SkillResourceRow[],
    orgUrl?: string | null,
    signal?: AbortSignal,
  ): Promise<BoundedMapResult<Uint8Array>[]> {
    return mapWithConcurrency(
      rows,
      2,
      (row) => this.downloadResource(row, orgUrl),
      signal,
    );
  }
}

// ---------------------------------------------------------------------------
// Production port factory
// ---------------------------------------------------------------------------

/** OData fields selected when listing published skill bundle resources.
 * Lookup columns use the _fieldname_value OData format.
 */
const RESOURCE_SELECT = [
  "botcomponentid",
  "componentidunique",
  "_parentbotid_value",
  "_parentbotcomponentid_value",
  "name",
  "schemaname",
  "componenttype",
  "componentstate",
  "statecode",
  "statuscode",
  "versionnumber",
  "modifiedon",
  "filedata",
  "filedata_name",
];

function buildPublishedFilter(parentId: string, botId: string): string {
  return [
    `_parentbotcomponentid_value eq ${parentId}`,
    `_parentbotid_value eq ${botId}`,
    "componenttype eq 14",
    "componentstate eq 0",
    "statecode eq 0",
    "statuscode eq 1",
  ].join(" and ");
}

function mapToSkillResourceRow(item: Record<string, unknown>): SkillResourceRow {
  return {
    botcomponentid: (item["botcomponentid"] as string) ?? "",
    componentidunique: (item["componentidunique"] as string) ?? "",
    parentbotid:
      (item["_parentbotid_value"] as string) ??
      (item["parentbotid"] as string) ??
      "",
    parentbotcomponentid:
      (item["_parentbotcomponentid_value"] as string) ??
      (item["parentbotcomponentid"] as string) ??
      "",
    name: (item["name"] as string) ?? "",
    schemaname: (item["schemaname"] as string) ?? "",
    componenttype: Number(item["componenttype"] ?? 14),
    componentstate: Number(item["componentstate"] ?? 0),
    statecode: Number(item["statecode"] ?? 0),
    statuscode: Number(item["statuscode"] ?? 1),
    versionnumber: Number(item["versionnumber"] ?? 0),
    modifiedon: (item["modifiedon"] as string) ?? "",
    filedata: (item["filedata"] as string) || undefined,
    filedata_name: (item["filedata_name"] as string) || undefined,
  };
}

/**
 * Decode connector file content into bytes.
 *
 * The Dataverse connector does not return one stable shape for file content, and
 * the previous code assumed plain base64. Every real shape it can return is
 * handled here, because guessing wrong fails the whole resource with
 * `Failed to execute 'atob' on 'Window'` — which is what silently emptied the
 * bundle manifest and made skills look empty when their files were fine:
 *
 * - `{ '$content': string, '$content-type': string }` — the Power Automate /
 *   Logic Apps binary envelope. This was the unhandled case: the old code read
 *   only `value`, so the object stringified to `[object Object]` and `atob`
 *   threw on the `[`.
 * - `{ value: string }` — the OData scalar wrapper.
 * - `data:<type>;base64,<payload>` — a data URI, whose prefix is not base64.
 * - a bare base64 string, possibly base64url-encoded or line-wrapped.
 * - raw text, which some text columns return already decoded.
 *
 * Base64 decoding is attempted only when the payload actually looks like base64,
 * so a text file is never mangled by a decode that happens to succeed.
 *
 * @param raw - Whatever the connector returned as file content.
 * @returns The file bytes.
 */
export function decodeConnectorFileContent(raw: unknown): Uint8Array {
  if (raw instanceof Uint8Array) return raw;
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);

  let payload: string;
  if (typeof raw === 'string') {
    payload = raw;
  } else if (typeof raw === 'object' && raw !== null) {
    const record = raw as Record<string, unknown>;
    const candidate = record['$content'] ?? record['value'] ?? record['content'];
    if (typeof candidate !== 'string') {
      throw new Error(
        'Connector returned file content in an unrecognised shape ' +
        `(keys: ${Object.keys(record).join(', ') || 'none'}).`,
      );
    }
    payload = candidate;
  } else {
    throw new Error(`Connector returned file content as ${typeof raw}.`);
  }

  // A data URI's prefix is not base64, so it must come off before decoding.
  const dataUri = /^data:[^;,]*(?:;[^;,]+)*;base64,/i.exec(payload);
  const body = dataUri ? payload.slice(dataUri[0].length) : payload;

  // base64url swaps two alphabet characters; line wrapping is legal in MIME.
  const compact = body.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = compact.length % 4 === 0
    ? compact
    : compact + '='.repeat(4 - (compact.length % 4));

  const looksBase64 = padded.length > 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(padded);
  if (dataUri || looksBase64) {
    try {
      return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
    } catch {
      // A data URI that will not decode is corrupt, not text.
      if (dataUri) throw new Error('File content declared base64 but did not decode.');
    }
  }

  // Not base64: the column returned the text itself. Preserve it verbatim.
  return new TextEncoder().encode(payload);
}

/**
 * Create the production `SkillBundleDataPort` backed by real Dataverse services.
 *
 * All Power Apps SDK and generated-service imports are lazy (dynamic) so that
 * importing this module at test collection time does not trigger SDK resolution.
 */
export function createProductionSkillBundlePort(): SkillBundleDataPort {
  return {
    async listChildren(
      parentId: string,
      botId: string,
      orgUrl?: string | null,
    ): Promise<SkillResourceRow[]> {
      const filter = buildPublishedFilter(parentId, botId);
      const selectStr = RESOURCE_SELECT.join(",");

      if (orgUrl) {
        const { MicrosoftDataverseService } = await import(
          "../../../../../generated/services/MicrosoftDataverseService"
        );
        const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
          orgUrl,
          "botcomponents",
          undefined,
          undefined,
          undefined,
          undefined,
          selectStr,
          filter,
        );
        if (!result.success || !result.data) {
          throw new Error(
            result.error?.message ?? "Failed to list skill bundle resources from org",
          );
        }
        const items =
          ((result.data as { value?: Record<string, unknown>[] }).value) ?? [];
        return items.map(mapToSkillResourceRow);
      }

      const { BotcomponentsService } = await import(
        "../../../../../generated/services/BotcomponentsService"
      );
      const result = await BotcomponentsService.getAll({
        filter,
        select: RESOURCE_SELECT,
      });
      if (!result.success || !result.data) {
        throw new Error(
          result.error?.message ?? "Failed to list skill bundle resources",
        );
      }
      return (result.data as unknown as Record<string, unknown>[]).map(
        mapToSkillResourceRow,
      );
    },

    async downloadCurrent(recordId: string): Promise<Uint8Array> {
      const [{ getClient }, { dataSourcesInfo }] = await Promise.all([
        import("@microsoft/power-apps/data"),
        import("../../../../../../.power/schemas/appschemas/dataSourcesInfo"),
      ]);
      const client = getClient(dataSourcesInfo);
      const result = await client.downloadFileFromRecord(
        "botcomponents",
        recordId,
        "filedata",
      );
      if (!result.success || !result.data) {
        throw new Error(result.error?.message ?? "Skill resource download failed");
      }
      return new Uint8Array(result.data);
    },

    async downloadFromOrganization(
      recordId: string,
      orgUrl: string,
    ): Promise<Uint8Array> {
      const { MicrosoftDataverseService } = await import(
        "../../../../../generated/services/MicrosoftDataverseService"
      );
      const result =
        await MicrosoftDataverseService.GetEntityFileImageFieldContentWithOrganization(
          "",
          orgUrl,
          "botcomponents",
          recordId,
          "filedata",
        );
      if (!result.success || !result.data) {
        throw new Error(
          result.error?.message ?? "Cross-environment skill resource download failed",
        );
      }
      // The connector returns several shapes here; see decodeConnectorFileContent.
      return decodeConnectorFileContent(result.data as unknown);
    },
  };
}
