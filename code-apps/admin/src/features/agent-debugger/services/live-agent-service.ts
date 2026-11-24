import { getContext } from "@microsoft/power-apps/app";
import { MicrosoftDataverseService } from "../../../generated/services/MicrosoftDataverseService";
import { PowerAppsforMakersService } from "../../../generated/services/PowerAppsforMakersService";
import type { AgentDetailsOption } from "./dataverse-agent-service";
import { agentDiscoveryError } from "../utils/agent-discovery-errors";
import { agentDiscoveryCacheKey } from "../utils/agent-discovery-priority";
import { extractSkiptokenFromNextLink } from "../utils/dataverse-pagination";

export interface AgentEnvironment {
  url: string;
  name: string;
  id?: string;
}

export const BOTS_WITH_TRANSCRIPTS_FETCH_XML = `
<fetch version="1.0" output-format="xml-platform" mapping="logical">
  <entity name="bot">
    <attribute name="name" />
    <attribute name="createdon" />
    <attribute name="botid" />
    <order attribute="name" descending="false" />
    <order attribute="botid" descending="false" />
    <filter type="and">
      <condition attribute="statecode" operator="eq" value="0" />
    </filter>
    <link-entity name="conversationtranscript" from="bot_conversationtranscriptid"
      to="botid" link-type="exists" alias="transcript" />
  </entity>
</fetch>`.trim();

function escapeXmlAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function canonicalEnvironmentUrl(url: string): string {
  return new URL(url).origin.toLowerCase();
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function getAgentDiscoveryContext(): Promise<{ environmentId: string; priorityCacheKey?: string }> {
  const context = await getContext();
  if (!context.app.environmentId) throw new Error("The current environment could not be identified.");
  const priorityCacheKey = agentDiscoveryCacheKey({
    tenantId: context.user.tenantId,
    objectId: context.user.objectId,
    userPrincipalName: context.user.userPrincipalName,
    appId: context.app.appId,
    environmentId: context.app.environmentId,
  });
  if (!priorityCacheKey) {
    console.warn("[AgentDebugger] User, tenant, or app identity is unavailable; environment priority will not be persisted.");
  }
  return { environmentId: context.app.environmentId, priorityCacheKey };
}

export async function getMakerEnvironments(): Promise<AgentEnvironment[]> {
  const result = await PowerAppsforMakersService.Get_Environments("2022-11-01");
  if (!result.success || !Array.isArray(result.data?.value)) {
    throw agentDiscoveryError(result.error, "Unable to load environment details.");
  }
  if (result.data.nextLink || result.data["@odata.nextLink"]) {
    throw new Error("Environment discovery returned additional pages that this connector cannot load.");
  }
  return result.data.value.flatMap((value: unknown) => {
    const environment = record(value);
    const properties = record(environment.properties);
    const metadata = record(properties.linkedEnvironmentMetadata);
    const url = text(metadata.instanceUrl);
    return url ? [{
      url: canonicalEnvironmentUrl(url),
      name: text(properties.displayName) ?? text(metadata.friendlyName) ?? url,
      id: text(environment.name),
    }] : [];
  });
}

export async function getAgentOrganizations(): Promise<AgentEnvironment[]> {
  const result = await MicrosoftDataverseService.GetOrganizations();
  if (!result.success || !Array.isArray(result.data?.value)) {
    throw agentDiscoveryError(result.error, "Unable to discover Dataverse environments.");
  }
  return result.data.value.flatMap(org => org.Url && org.Url.toLowerCase() !== "current" ? [{
    url: canonicalEnvironmentUrl(org.Url),
    name: org.FriendlyName || org.Url,
  }] : []);
}

export async function listAgentRecords(
  environmentUrl: string, entityName: string, select: string, filter: string,
): Promise<Record<string, unknown>[]> {
  const records: Record<string, unknown>[] = [];
  const seenTokens = new Set<string>();
  let skipToken: string | undefined;
  do {
    const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
      environmentUrl, entityName, "odata.maxpagesize=500", "application/json",
      undefined, undefined, select, filter, "name asc",
      undefined, undefined, undefined, skipToken,
    );
    if (!result.success || !Array.isArray(result.data?.value)) {
      throw agentDiscoveryError(result.error, `Unable to load ${entityName} from ${environmentUrl}.`,
        "Access denied. Your account cannot read agents in this environment.");
    }
    records.push(...result.data.value.map(record));
    const nextLink = text(result.data["@odata.nextLink"]);
    skipToken = extractSkiptokenFromNextLink(nextLink);
    if (nextLink && (!skipToken || seenTokens.has(skipToken))) {
      throw new Error(`Invalid ${entityName} pagination returned by ${environmentUrl}.`);
    }
    if (skipToken) seenTokens.add(skipToken);
  } while (skipToken);
  return records;
}

/** The existence join filters server-side without duplicating agents per transcript. */
export async function getLiveAgents(environment: AgentEnvironment): Promise<AgentDetailsOption[]> {
  const bots: Record<string, unknown>[] = [];
  const seenCookies = new Set<string>();
  const seenPages = new Set<string>();
  let pagingCookie: string | undefined;
  for (let page = 1; ; page++) {
    const fetchXml = BOTS_WITH_TRANSCRIPTS_FETCH_XML.replace("<fetch ",
      `<fetch count="500" page="${page}"${pagingCookie ? ` paging-cookie="${escapeXmlAttribute(pagingCookie)}"` : ""} `);
    const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
      environment.url, "bots",
      'odata.include-annotations="Microsoft.Dynamics.CRM.fetchxmlpagingcookie,Microsoft.Dynamics.CRM.morerecords"',
      "application/json", undefined, undefined, undefined, undefined, undefined, undefined, fetchXml,
    );
    if (!result.success || !Array.isArray(result.data?.value)) {
      throw agentDiscoveryError(result.error, `Unable to load agents with transcripts from ${environment.name}.`,
        "Access denied. Your account cannot read agents or transcripts in this environment.");
    }
    const rows = result.data.value.map(record);
    const signature = JSON.stringify(rows.map(row => row.botid));
    if (rows.length && seenPages.has(signature)) throw new Error(`Repeated agent page returned by ${environment.name}.`);
    seenPages.add(signature);
    bots.push(...rows);
    const moreRecords = result.data["@Microsoft.Dynamics.CRM.morerecords"];
    if (moreRecords === false || (moreRecords !== true && rows.length < 500)) break;
    if (!rows.length) throw new Error(`Empty continuation page returned by ${environment.name}.`);
    const cookie = text(result.data["@Microsoft.Dynamics.CRM.fetchxmlpagingcookie"]);
    if (cookie) {
      const encoded = /\bpagingcookie=(["'])(.*?)\1/.exec(cookie)?.[2];
      if (!encoded || seenCookies.has(encoded)) throw new Error(`Invalid agent paging cookie returned by ${environment.name}.`);
      seenCookies.add(encoded);
      // The Web API wraps the paging cookie in a twice-URL-encoded XML attribute.
      pagingCookie = decodeURIComponent(decodeURIComponent(encoded));
    } else {
      pagingCookie = undefined;
      if (page >= 100) throw new Error(`Agent results exceed the 50,000-row simple paging limit in ${environment.name}.`);
    }
  }
  const agents = new Map<string, AgentDetailsOption>();
  for (const bot of bots) {
    const botId = text(bot.botid);
    if (!botId) throw new Error(`An agent in ${environment.name} is missing its ID.`);
    const id = `${environment.url}|${botId.toLowerCase()}`;
    agents.set(id, {
      id, botId, name: text(bot.name) ?? "Unnamed agent",
      environmentUrl: environment.url, environmentName: environment.name,
      environmentId: environment.id, createdDate: text(bot.createdon),
      isTranscriptAvailable: true,
    });
  }
  return [...agents.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Failed environments release their slot just like successful environments. */
export async function loadAgentEnvironments(
  environments: AgentEnvironment[],
  load: (environment: AgentEnvironment) => Promise<AgentDetailsOption[]>,
  onResult: (environment: AgentEnvironment, agents: AgentDetailsOption[], error?: Error) => void,
  signal: AbortSignal,
  priority: (environment: AgentEnvironment) => number = () => 0,
): Promise<void> {
  const pending = [...environments];
  await Promise.all(Array.from({ length: Math.min(10, environments.length) }, async () => {
    while (!signal.aborted && pending.length) {
      // Search can reprioritize queued work without restarting in-flight requests.
      pending.sort((a, b) => priority(b) - priority(a));
      const environment = pending[0];
      pending.shift();
      try {
        const agents = await load(environment);
        if (!signal.aborted) onResult(environment, agents);
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        if (!signal.aborted) {
          onResult(environment, [], error);
        }
      }
    }
  }));
}
