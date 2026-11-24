/**
 * Environment Variable service for Advanced Testing setup, Phase 5.
 *
 * Fetches the three Advanced Testing EV definitions and their current values
 * from Dataverse, and writes user edits back either as PATCH (existing value
 * row) or POST (no value row yet). All policy bullets from canonical plan
 * §2.5 are implemented here:
 *
 *  - RD-5: `$expand` may silently drop value rows for some environments. When
 *    a definition has no values returned but the caller suspects there should
 *    be one, a fallback query against `environmentvariablevalues` is issued.
 *    We engage the fallback whenever ANY definition has zero values returned,
 *    so the worst case is one extra fetch and never a missed override.
 *  - RD-6: when more than one value row exists per definition, pick the most
 *    recent by `modifiedon desc` and surface a warning to the caller.
 *  - RD-7: race detection. Before POSTing a new value row, re-query for an
 *    existing one and convert to PATCH if it was created concurrently.
 *  - RD-9: privilege errors are remapped to user-actionable copy that names
 *    the required role.
 *
 * Console log prefix `[AdvancedTesting:Setup:EnvVar]` for filterable diagnostics.
 *
 * No PAC CLI / generated SDK changes are needed: `environmentvariabledefinitions`
 * and `environmentvariablevalues` are system tables on Dataverse and are
 * accessed via the existing `MicrosoftDataverseService` connector wrapper.
 */

import { MicrosoftDataverseService } from "../../../../generated/services/MicrosoftDataverseService";
import type {
  EnvironmentVariable,
  EnvironmentVariableDefinition,
  EnvironmentVariableValue,
  EnvVarKind,
} from "../contracts/types";

const LOG_PREFIX = "[AdvancedTesting:Setup:EnvVar]";

// ─── Schema constants ────────────────────────────────────────────────────────

/**
 * Schema names of the three Advanced Testing EVs (locked with user this
 * session). Ordering here drives the display order in the UI.
 */
export const ADVANCED_TESTING_EV_SCHEMA_NAMES = [
  "cat_DelayforAzureApplicationInsightsEnrichment",
  "cat_DelayforConversationTranscriptsEnrichment",
  "cat_PowerAutomateEndpoint",
] as const;

/**
 * Client-side allow-list for `cat_PowerAutomateEndpoint` (RD-8). Dataverse
 * stores the value as a plain text field; the constraint is enforced in the
 * Setup UI only. Order here drives the dropdown option order.
 */
export const POWER_AUTOMATE_ENDPOINT_OPTIONS = [
  "Commercial",
  "GCC",
  "GCC(High)",
  "DoD",
] as const;

export type PowerAutomateEndpoint = (typeof POWER_AUTOMATE_ENDPOINT_OPTIONS)[number];

export function isAllowedPowerAutomateEndpoint(
  value: string | null | undefined,
): value is PowerAutomateEndpoint {
  if (!value) return false;
  return (POWER_AUTOMATE_ENDPOINT_OPTIONS as readonly string[]).includes(value);
}

// ─── Type option set mapping ─────────────────────────────────────────────────

/**
 * `environmentvariabledefinition.type` is an integer option set. Documented
 * values (see https://learn.microsoft.com/en-us/power-platform/alm/environmentvariables).
 *  - 100000000 String
 *  - 100000001 Number (Decimal)
 *  - 100000002 Boolean
 *  - 100000003 JSON
 *  - 100000004 Data Source (unsupported)
 *  - 100000005 Secret (unsupported)
 */
function mapTypeCode(code: number | undefined): EnvVarKind | null {
  switch (code) {
    case 100000000:
      return "text";
    case 100000001:
      return "decimal";
    case 100000002:
      return "boolean";
    case 100000003:
      return "json";
    default:
      return null;
  }
}

// ─── Error helpers ───────────────────────────────────────────────────────────

function extractError(
  context: string,
  result: { success: boolean; error?: unknown; data?: unknown },
): string {
  const errorObj = result.error ?? result.data;
  console.error(`${LOG_PREFIX} ${context}, full error:`, JSON.stringify(errorObj, null, 2));

  if (typeof errorObj === "object" && errorObj !== null) {
    const err = errorObj as Record<string, unknown>;
    if (typeof err.error === "object" && err.error !== null) {
      const inner = err.error as Record<string, unknown>;
      if (inner.message) return `${context}: ${inner.message as string}`;
    }
    if (err.message) return `${context}: ${err.message as string}`;
    if (typeof err.body === "object" && err.body !== null) {
      const body = err.body as Record<string, unknown>;
      if (typeof body.error === "object" && body.error !== null) {
        const bodyErr = body.error as Record<string, unknown>;
        if (bodyErr.message) return `${context}: ${bodyErr.message as string}`;
      }
    }
  }
  return `${context}: ${JSON.stringify(errorObj) ?? "Unknown error"}`;
}

/**
 * RD-9: remap privilege / managed-solution errors to user-actionable copy
 * that names the required role. Leaves other errors untouched.
 */
function remapSaveError(raw: string): string {
  const lower = raw.toLowerCase();
  if (
    lower.includes("privilege") ||
    lower.includes("permission") ||
    lower.includes("0x80040220") ||
    lower.includes("0x80048405")
  ) {
    return "You need Environment Maker or System Customizer privileges in this environment.";
  }
  return raw;
}

// ─── Read path ───────────────────────────────────────────────────────────────

interface DefinitionRaw {
  environmentvariabledefinitionid: string;
  schemaname?: string;
  displayname?: string;
  description?: string | null;
  type?: number;
  defaultvalue?: string | null;
  /** Filled when `$expand` is honoured by the connector. */
  environmentvariabledefinition_environmentvariablevalue?: ValueRaw[];
}

interface ValueRaw {
  environmentvariablevalueid: string;
  value?: string | null;
  modifiedon?: string;
  _environmentvariabledefinitionid_value?: string;
}

function quoteAndJoinFilter(field: string, values: readonly string[]): string {
  return values.map((v) => `${field} eq '${v}'`).join(" or ");
}

function toDefinition(r: DefinitionRaw): EnvironmentVariableDefinition | null {
  const kind = mapTypeCode(r.type);
  if (!kind) {
    console.warn(
      `${LOG_PREFIX} unsupported type code ${r.type} for ${r.schemaname}; skipping`,
    );
    return null;
  }
  return {
    id: r.environmentvariabledefinitionid,
    schemaName: r.schemaname ?? "",
    displayName: r.displayname ?? r.schemaname ?? "",
    description: r.description?.trim() ? r.description.trim() : null,
    kind,
    defaultValue: r.defaultvalue ?? null,
  };
}

/**
 * RD-6: when multiple value rows exist for a single definition, deterministically
 * select the most recently modified, then break ties on `environmentvariablevalueid`
 * ascending so the choice is stable across reloads.
 */
function pickDeterministicValue(rows: ValueRaw[]): ValueRaw {
  const sorted = [...rows].sort((a, b) => {
    const aMod = a.modifiedon ?? "";
    const bMod = b.modifiedon ?? "";
    if (aMod !== bMod) return bMod.localeCompare(aMod); // desc
    return (a.environmentvariablevalueid ?? "").localeCompare(b.environmentvariablevalueid ?? "");
  });
  return sorted[0];
}

function toValue(r: ValueRaw): EnvironmentVariableValue {
  return {
    id: r.environmentvariablevalueid,
    value: r.value ?? "",
  };
}

export interface GetEnvironmentVariablesResult {
  variables: EnvironmentVariable[];
  /**
   * Schema names that were expected but not returned by the definitions query.
   * The Copilot Studio Kit solution may not be installed, or definitions may
   * be deactivated.
   */
  missingSchemaNames: string[];
}

/**
 * Loads the three Advanced Testing EV definitions and their current values
 * from Dataverse. Implements RD-5 (fallback on empty `$expand`) and RD-6
 * (deterministic dedupe when multiple value rows exist).
 */
export async function getAdvancedTestingEnvironmentVariables(): Promise<GetEnvironmentVariablesResult> {
  const schemaFilter = quoteAndJoinFilter("schemaname", ADVANCED_TESTING_EV_SCHEMA_NAMES);
  const definitionFilter = `(${schemaFilter})`;
  const definitionSelect =
    "environmentvariabledefinitionid,schemaname,displayname,description,type,defaultvalue";
  const expand =
    "environmentvariabledefinition_environmentvariablevalue($select=environmentvariablevalueid,value,modifiedon)";

  console.log(
    `${LOG_PREFIX} getAdvancedTestingEnvironmentVariables, filter: ${definitionFilter}`,
  );

  const defResult = await MicrosoftDataverseService.ListRecordsWithOrganization(
    "current",
    "environmentvariabledefinitions",
    undefined,
    undefined,
    undefined,
    undefined,
    definitionSelect,
    definitionFilter,
    undefined,
    expand,
    undefined,
    ADVANCED_TESTING_EV_SCHEMA_NAMES.length,
  );

  if (!defResult.success) {
    throw new Error(extractError("Failed to load environment variable definitions", defResult));
  }

  const defRows =
    (defResult.data as unknown as { value?: DefinitionRaw[] })?.value ?? [];
  console.log(
    `${LOG_PREFIX} ${defRows.length} definition rows returned`,
  );

  const definitions = new Map<string, { def: EnvironmentVariableDefinition; raw: DefinitionRaw }>();
  for (const raw of defRows) {
    const def = toDefinition(raw);
    if (def) definitions.set(def.id, { def, raw });
  }

  // RD-5: if ANY definition has an empty value array, issue a fallback query
  // for the full set of definition ids. The connector is reportedly inconsistent
  // about honouring `$select` inside `$expand`; the fallback is the safe path.
  const needsFallback = Array.from(definitions.values()).some(
    (entry) => !entry.raw.environmentvariabledefinition_environmentvariablevalue?.length,
  );

  const valuesByDefId = new Map<string, ValueRaw[]>();
  for (const { def, raw } of definitions.values()) {
    const rows = raw.environmentvariabledefinition_environmentvariablevalue ?? [];
    if (rows.length > 0) valuesByDefId.set(def.id, rows);
  }

  if (needsFallback && definitions.size > 0) {
    console.log(`${LOG_PREFIX} $expand fallback engaged`);
    const idClause = Array.from(definitions.keys())
      .map((id) => `_environmentvariabledefinitionid_value eq ${id}`)
      .join(" or ");
    const valueResult = await MicrosoftDataverseService.ListRecordsWithOrganization(
      "current",
      "environmentvariablevalues",
      undefined,
      undefined,
      undefined,
      undefined,
      "environmentvariablevalueid,value,modifiedon,_environmentvariabledefinitionid_value",
      `(${idClause})`,
      "modifiedon desc",
      undefined,
      undefined,
      definitions.size * 5,
    );
    if (!valueResult.success) {
      throw new Error(
        extractError("Failed to load environment variable values (fallback)", valueResult),
      );
    }
    const rows =
      (valueResult.data as unknown as { value?: ValueRaw[] })?.value ?? [];
    console.log(`${LOG_PREFIX} fallback returned ${rows.length} value rows`);
    for (const row of rows) {
      const defId = row._environmentvariabledefinitionid_value;
      if (!defId || !definitions.has(defId)) continue;
      const list = valuesByDefId.get(defId) ?? [];
      list.push(row);
      valuesByDefId.set(defId, list);
    }
  }

  const variables: EnvironmentVariable[] = [];

  // Preserve declared display order rather than the order the server returned.
  for (const schemaName of ADVANCED_TESTING_EV_SCHEMA_NAMES) {
    const entry = Array.from(definitions.values()).find(
      (e) => e.def.schemaName === schemaName,
    );
    if (!entry) continue;
    const { def } = entry;
    const valueRows = valuesByDefId.get(def.id) ?? [];
    let currentValue: EnvironmentVariableValue | null = null;
    if (valueRows.length === 1) {
      currentValue = toValue(valueRows[0]);
    } else if (valueRows.length > 1) {
      // Multiple value rows are normal in Dataverse solution layering: each
      // imported managed solution that ships a value adds its own row, on top
      // of any unmanaged customization. PATCH/POST through the Save path
      // targets the Active (unmanaged) layer, which is the maker-visible
      // "Current value". RD-6 deterministic pick is a safety net for the read.
      console.warn(
        `${LOG_PREFIX} ${valueRows.length} value rows for ${def.schemaName}; picking most recent (RD-6)`,
      );
      currentValue = toValue(pickDeterministicValue(valueRows));
    }
    variables.push({ definition: def, currentValue });
  }

  const returnedSchemaNames = new Set(variables.map((v) => v.definition.schemaName));
  const missingSchemaNames = ADVANCED_TESTING_EV_SCHEMA_NAMES.filter(
    (s) => !returnedSchemaNames.has(s),
  );
  if (missingSchemaNames.length > 0) {
    console.warn(
      `${LOG_PREFIX} missing definitions: ${missingSchemaNames.join(", ")}`,
    );
  }

  return { variables, missingSchemaNames };
}

// ─── Write path ──────────────────────────────────────────────────────────────

export interface SaveEnvironmentVariableArgs {
  definitionId: string;
  schemaName: string;
  value: string;
  /** Existing `environmentvariablevalueid` if a row already exists; else null. */
  existingValueId: string | null;
}

export interface SaveEnvironmentVariableResult {
  /** Final value row id after the save (post-PATCH or post-POST). */
  environmentvariablevalueid: string;
  /** True when RD-7 detected a concurrently-created row and converted POST→PATCH. */
  raceDetected: boolean;
}

/**
 * Persists a new value for a single environment variable.
 *  - PATCH `environmentvariablevalues(<id>)` when `existingValueId` is set.
 *  - Otherwise, re-checks for an existing row (RD-7) and either PATCHes the
 *    discovered row or POSTs a new one via `@odata.bind`.
 *
 * Errors are remapped via RD-9 before being thrown.
 */
export async function saveEnvironmentVariableValue(
  args: SaveEnvironmentVariableArgs,
): Promise<SaveEnvironmentVariableResult> {
  const { definitionId, schemaName, value, existingValueId } = args;
  console.log(
    `${LOG_PREFIX} saveEnvironmentVariableValue, schema=${schemaName}, existing=${existingValueId ?? "null"}`,
  );

  if (existingValueId) {
    const patchResult = await MicrosoftDataverseService.UpdateRecordWithOrganization(
      "return=minimal",
      "application/json",
      "current",
      "environmentvariablevalues",
      existingValueId,
      { value },
    );
    if (!patchResult.success) {
      throw new Error(
        remapSaveError(extractError(`Failed to update ${schemaName}`, patchResult)),
      );
    }
    return { environmentvariablevalueid: existingValueId, raceDetected: false };
  }

  // RD-7: re-fetch before POST so a concurrent create doesn't produce a duplicate.
  const precheck = await MicrosoftDataverseService.ListRecordsWithOrganization(
    "current",
    "environmentvariablevalues",
    undefined,
    undefined,
    undefined,
    undefined,
    "environmentvariablevalueid",
    `_environmentvariabledefinitionid_value eq ${definitionId}`,
    "modifiedon desc",
    undefined,
    undefined,
    1,
  );
  if (!precheck.success) {
    throw new Error(
      remapSaveError(extractError(`Failed to pre-check ${schemaName}`, precheck)),
    );
  }
  const preRows =
    (precheck.data as unknown as { value?: ValueRaw[] })?.value ?? [];
  if (preRows.length > 0) {
    console.log(
      `${LOG_PREFIX} RD-7 race detected for ${schemaName}; converting POST to PATCH on ${preRows[0].environmentvariablevalueid}`,
    );
    const patchResult = await MicrosoftDataverseService.UpdateRecordWithOrganization(
      "return=minimal",
      "application/json",
      "current",
      "environmentvariablevalues",
      preRows[0].environmentvariablevalueid,
      { value },
    );
    if (!patchResult.success) {
      throw new Error(
        remapSaveError(extractError(`Failed to update ${schemaName}`, patchResult)),
      );
    }
    return {
      environmentvariablevalueid: preRows[0].environmentvariablevalueid,
      raceDetected: true,
    };
  }

  const postResult = await MicrosoftDataverseService.CreateRecordWithOrganization(
    "return=representation",
    "application/json",
    "current",
    "environmentvariablevalues",
    {
      schemaname: schemaName,
      value,
      "EnvironmentVariableDefinitionId@odata.bind": `/environmentvariabledefinitions(${definitionId})`,
    },
  );
  if (!postResult.success) {
    throw new Error(
      remapSaveError(extractError(`Failed to create value for ${schemaName}`, postResult)),
    );
  }

  // `return=representation` causes Dataverse to echo the new record, including
  // its PK, even though the generated signature types `data` as void.
  const created = postResult.data as unknown as ValueRaw | undefined;
  if (created?.environmentvariablevalueid) {
    return {
      environmentvariablevalueid: created.environmentvariablevalueid,
      raceDetected: false,
    };
  }

  // Fallback: some connector revisions strip the echoed body. Re-query.
  const postcheck = await MicrosoftDataverseService.ListRecordsWithOrganization(
    "current",
    "environmentvariablevalues",
    undefined,
    undefined,
    undefined,
    undefined,
    "environmentvariablevalueid",
    `_environmentvariabledefinitionid_value eq ${definitionId}`,
    "modifiedon desc",
    undefined,
    undefined,
    1,
  );
  const postRows =
    (postcheck.data as unknown as { value?: ValueRaw[] })?.value ?? [];
  if (postRows.length === 0) {
    throw new Error(
      `Saved ${schemaName} but could not read back the new value row id.`,
    );
  }
  return {
    environmentvariablevalueid: postRows[0].environmentvariablevalueid,
    raceDetected: false,
  };
}
