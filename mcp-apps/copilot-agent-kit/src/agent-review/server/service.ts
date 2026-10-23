import { createHash, randomUUID } from "node:crypto";
import {
  DEFAULT_DEADLINE_MS,
  ReviewJobStatus,
  ReviewSourceError,
  UNCLAIMED_JOB_TIMEOUT_MS,
  composeReview,
  isComponentRow,
  pollIntervalFor,
  prepareReview,
  prepareAgentMap,
  parseFinalizationSnapshot,
  readWorkflowResults,
  usesCopilotHarness,
  type AgentReviewRecordData,
  type BotComponent,
  type Guid,
  type ReviewJobItemRow,
  type ReviewJobRow,
  type ReviewSourceSnapshot,
  type SkillResourceRow,
} from "../core/index.js";
import { buildReviewViewModel } from "../ui/model/index.js";
import { DataverseClient, discoverEnvironments, escapeOData, guid, type DiscoveryEnvironment } from "./dataverse.js";
import {
  ReviewError,
  type ReviewAgent,
  type ReviewEnvironment,
  type ReviewInventoryRow,
  type ReviewStartFailure,
  type ReviewStatus,
} from "./types.js";
import { buildDeterministicAgentMap } from "../../agent-map/builder.js";
import type { AgentMapGraph } from "../../agent-map/types.js";
import { DEFAULT_PROMPT_ENVIRONMENT, exactAgentFilter, exactSelection, type AgentSelection } from "../../tools/target-selection.js";

const JOBS_LOGICAL_NAME = "cat_agentreviewjob";
const ITEMS_LOGICAL_NAME = "cat_agentreviewjobitem";
const REVIEWS_LOGICAL_NAME = "cat_agentreviews";

export function resolveReviewJobStatus(input: {
  jobStatus: number | null | undefined;
  completedComponents: number;
  createdAt: number;
  errorMessage?: string | null;
  now?: number;
}): Pick<ReviewStatus, "status" | "nextPollMs" | "error"> {
  const elapsed = Math.max(0, (input.now ?? Date.now()) - input.createdAt);
  if (input.jobStatus === ReviewJobStatus.Succeeded) {
    return { status: "succeeded", nextPollMs: null, error: null };
  }
  if (input.jobStatus === ReviewJobStatus.Failed) {
    return input.completedComponents > 0
      ? { status: "salvageable", nextPollMs: null, error: null }
      : {
          status: "failed",
          nextPollMs: null,
          error: input.errorMessage ?? "The review workflow failed.",
        };
  }
  if (
    (input.jobStatus == null || input.jobStatus === ReviewJobStatus.Queued)
    && input.completedComponents === 0
    && elapsed >= UNCLAIMED_JOB_TIMEOUT_MS
  ) {
    return {
      status: "failed",
      nextPollMs: null,
      error: "The review workflow did not pick up this job. It may be turned off in this environment.",
    };
  }
  if (elapsed >= DEFAULT_DEADLINE_MS) {
    return {
      status: "failed",
      nextPollMs: null,
      error: "The review did not finish within 45 minutes. The workflow may still be running in your environment, but this result was not saved. Start the review again to retry.",
    };
  }
  return {
    status: input.jobStatus === ReviewJobStatus.Running ? "running" : "queued",
    nextPollMs: pollIntervalFor(elapsed),
    error: null,
  };
}

interface BotRow {
  botid: string;
  name?: string;
  schemaname?: string;
  componentidunique?: string;
  configuration?: string;
  modifiedon?: string;
  iconbase64?: string;
}

interface ComponentRow extends Record<string, unknown> {
  botcomponentid: string;
  componentidunique?: string;
  name?: string;
  schemaname?: string;
  componenttype?: number;
  content?: string;
  data?: string;
  modifiedon?: string;
}

interface ReviewInventoryRecord {
  cat_agentreviewsid: string;
  cat_botid?: string;
  cat_botname?: string;
  cat_componentidunique?: string;
  cat_overallscore?: string | number;
  cat_totalissues?: string | number;
  cat_highseverityissues?: string | number;
  cat_reviewdate?: string;
  cat_reviewstatus?: number;
  cat_reviewresultjson?: string;
  cat_reviewpdfreport_name?: string;
  cat_sourceenvironment?: string;
}

function modernConfiguration(configuration: string | undefined): boolean {
  if (!configuration) return false;
  try {
    const parsed = JSON.parse(configuration) as {
      settings?: { GenerativeActionsEnabled?: boolean };
      agentSettings?: unknown;
    };
    return (parsed.settings?.GenerativeActionsEnabled ?? false)
      || parsed.agentSettings !== undefined;
  } catch {
    return false;
  }
}

function mapComponent(row: ComponentRow, botId: Guid): BotComponent {
  return {
    botcomponentid: row.botcomponentid,
    botid: botId,
    name: String(row.name ?? ""),
    schemaname: String(row.schemaname ?? ""),
    componenttype: String(row.componenttype ?? ""),
    componentidunique: String(row.componentidunique ?? ""),
    content: typeof row.content === "string" ? row.content : "",
    data: typeof row.data === "string" ? row.data : "",
    description: typeof row.description === "string" ? row.description : undefined,
    parentbotid: botId,
    parentbotcomponentid: typeof row._parentbotcomponentid_value === "string" ? row._parentbotcomponentid_value : undefined,
    filedata_name: typeof row.filedata_name === "string" ? row.filedata_name : undefined,
    componentstate: typeof row.componentstate === "number" ? row.componentstate : undefined,
    statecode: typeof row.statecode === "number" ? row.statecode : undefined,
    statuscode: typeof row.statuscode === "number" ? row.statuscode : undefined,
    versionnumber: typeof row.versionnumber === "number" ? row.versionnumber : undefined,
    modifiedon: row.modifiedon ? new Date(row.modifiedon) : undefined,
  };
}

function resourceRow(row: ComponentRow, botId: Guid): SkillResourceRow {
  return {
    botcomponentid: row.botcomponentid,
    componentidunique: String(row.componentidunique ?? ""),
    parentbotid: botId,
    parentbotcomponentid: String(row._parentbotcomponentid_value ?? ""),
    name: String(row.name ?? ""),
    schemaname: String(row.schemaname ?? ""),
    componenttype: Number(row.componenttype ?? 14),
    componentstate: Number(row.componentstate ?? 0),
    statecode: Number(row.statecode ?? 0),
    statuscode: Number(row.statuscode ?? 1),
    versionnumber: Number(row.versionnumber ?? 0),
    modifiedon: String(row.modifiedon ?? ""),
    filedata_name: typeof row.filedata_name === "string" ? row.filedata_name : undefined,
  };
}

export function buildReviewEnvironmentFilter(
  environment: Pick<DiscoveryEnvironment, "name" | "apiUrl">,
): string {
  const sourceKeys = new Set([
    environment.name,
    environment.apiUrl.origin,
    `${environment.apiUrl.origin}/`,
  ]);
  const filters = [...sourceKeys].map((source) =>
    `cat_sourceenvironment eq '${escapeOData(source)}'`);
  filters.push(
    "cat_sourceenvironment eq ''",
    "cat_sourceenvironment eq null",
    "cat_sourceenvironment eq 'zip'",
  );
  return filters.join(" or ");
}

export class AgentReviewService {
  constructor(private readonly incomingToken: string) {}

  private async jobEntitySets(client: DataverseClient): Promise<{
    jobs: string;
    items: string;
  }> {
    const [jobs, items] = await Promise.all([
      client.entitySet(JOBS_LOGICAL_NAME),
      client.entitySet(ITEMS_LOGICAL_NAME),
    ]);
    return { jobs, items };
  }

  private async environments(): Promise<DiscoveryEnvironment[]> {
    return discoverEnvironments(this.incomingToken);
  }

  private async resolveEnvironment(id: string): Promise<DiscoveryEnvironment> {
    const environmentId = guid(id);
    const environment = (await this.environments()).find((item) => item.id === environmentId);
    if (!environment) throw new ReviewError("ENVIRONMENT_NOT_FOUND", "The selected environment is unavailable.");
    return environment;
  }

  private async homeEnvironment(): Promise<DiscoveryEnvironment> {
    const configured = process.env.AGENT_KIT_HOME_ENVIRONMENT_ID;
    if (!configured) throw new ReviewError("HOME_NOT_CONFIGURED", "The Agent Review home environment is not configured.");
    return this.resolveEnvironment(configured);
  }

  private async jobBackendEnvironment(): Promise<DiscoveryEnvironment> {
    const environments = await this.environments();
    try {
      return exactSelection(environments, "ENVIRONMENT", undefined, DEFAULT_PROMPT_ENVIRONMENT);
    } catch (error) {
      if (!(error instanceof ReviewError)
          || (error.code !== "ENVIRONMENT_NOT_FOUND" && error.code !== "ENVIRONMENT_AMBIGUOUS")) throw error;
      const ambiguous = error.code === "ENVIRONMENT_AMBIGUOUS";
      const failure = new ReviewError(
        ambiguous ? "JOB_BACKEND_AMBIGUOUS" : "JOB_BACKEND_NOT_FOUND",
        ambiguous
          ? `More than one ${DEFAULT_PROMPT_ENVIRONMENT} environment is available for review jobs. No job backend was selected.`
          : `The ${DEFAULT_PROMPT_ENVIRONMENT} review job backend is unavailable.`,
      );
      failure.cause = error;
      throw failure;
    }
  }

  async listEnvironments(): Promise<ReviewEnvironment[]> {
    return (await this.environments()).map(({ id, name, region }) => ({ id, name, region }));
  }

  async defaultEnvironment(): Promise<ReviewEnvironment> {
    const { id, name, region } = await this.homeEnvironment();
    return { id, name, region };
  }

  async listAgents(environmentId: string, query = "", includeIcons = false): Promise<ReviewAgent[]> {
    const environment = await this.resolveEnvironment(environmentId);
    const client = new DataverseClient(environment.apiUrl, this.incomingToken);
    const filter = "statecode eq 0";
    const rows = await client.list<BotRow>(
      `bots?$select=botid,name,componentidunique,configuration,modifiedon${includeIcons ? ",iconbase64" : ""}&$filter=${encodeURIComponent(filter)}&$orderby=name asc&$top=250`,
    );
    return this.mapAgents(rows, query, includeIcons);
  }

  async resolveAgent(environmentId: string, input: AgentSelection): Promise<ReviewAgent> {
    const filter = exactAgentFilter(input);
    const environment = await this.resolveEnvironment(environmentId);
    const rows = await new DataverseClient(environment.apiUrl, this.incomingToken).list<BotRow>(
      `bots?$select=botid,name,componentidunique,configuration,modifiedon&$filter=${encodeURIComponent(filter)}&$top=250`,
    );
    return exactSelection(this.mapAgents(rows), "AGENT", input.agentId, input.agentName);
  }

  private mapAgents(rows: BotRow[], query = "", includeIcons = false): ReviewAgent[] {
    const needle = query.trim().toLocaleLowerCase();
    return rows
      .filter((row) => modernConfiguration(row.configuration))
      .filter((row) => !needle || String(row.name ?? "").toLocaleLowerCase().includes(needle))
      .map((row) => ({
        id: guid(row.botid),
        name: row.name?.trim() || "Unnamed agent",
        componentIdUnique: guid(row.componentidunique ?? ""),
        modifiedOn: row.modifiedon,
        ...(includeIcons ? { iconBase64: row.iconbase64?.trim() || undefined } : {}),
        harness: usesCopilotHarness(row.configuration) ? "copilot" : "standard",
      }));
  }

  async listReviewInventory(environmentId: string): Promise<{
    environment: ReviewEnvironment;
    rows: ReviewInventoryRow[];
  }> {
    const environment = await this.resolveEnvironment(environmentId);
    const [agents, home] = await Promise.all([
      this.listAgents(environment.id, "", true),
      this.homeEnvironment(),
    ]);
    const client = new DataverseClient(home.apiUrl, this.incomingToken);
    const reviews = await client.entitySet(REVIEWS_LOGICAL_NAME);
    const environmentFilter = buildReviewEnvironmentFilter(environment);
    const typeFilter = "cat_agenttype eq 1 or cat_agenttype eq null";
    const records = await client.list<ReviewInventoryRecord>(
      `${reviews}?$select=cat_agentreviewsid,cat_botid,cat_botname,cat_componentidunique,cat_overallscore,cat_totalissues,cat_highseverityissues,cat_reviewdate,cat_reviewstatus,cat_reviewresultjson,cat_reviewpdfreport_name,cat_sourceenvironment`
      + `&$filter=${encodeURIComponent(`(${typeFilter}) and (${environmentFilter})`)}`
      + "&$orderby=cat_reviewdate desc",
    );
    const latestByBot = new Map<string, ReviewInventoryRecord>();
    records.forEach((record) => {
      const botId = record.cat_botid?.replace(/[{}]/g, "").toLocaleLowerCase();
      if (botId && record.cat_reviewresultjson && !latestByBot.has(botId)) {
        latestByBot.set(botId, record);
      }
    });

    return {
      environment: {
        id: environment.id,
        name: environment.name,
        region: environment.region,
      },
      rows: agents.map((agent) => {
        const record = latestByBot.get(agent.id);
        const completed = record?.cat_reviewstatus === 335350000;
        return {
          botId: agent.id,
          componentIdUnique: agent.componentIdUnique,
          botName: agent.name,
          iconBase64: agent.iconBase64,
          reviewId: record?.cat_agentreviewsid ? guid(record.cat_agentreviewsid) : undefined,
          overallScore: Number(record?.cat_overallscore ?? 0),
          totalIssueCount: Number(record?.cat_totalissues ?? 0),
          highSeverityCount: Number(record?.cat_highseverityissues ?? 0),
          reviewedOn: record?.cat_reviewdate,
          status: record
            ? completed ? "completed" : "failed"
            : "not-reviewed",
          hasReviewData: Boolean(record?.cat_reviewresultjson),
          harness: agent.harness,
        };
      }),
    };
  }

  private async readSource(environment: DiscoveryEnvironment, agentId: Guid): Promise<{
    agent: ReviewAgent;
    source: ReviewSourceSnapshot;
  }> {
    const client = new DataverseClient(environment.apiUrl, this.incomingToken);
    const bots = await client.list<BotRow>(
      `bots?$select=botid,name,componentidunique,configuration,modifiedon,iconbase64&$filter=${encodeURIComponent(`statecode eq 0 and botid eq ${agentId}`)}&$top=1`,
    );
    const bot = bots[0];
    if (!bot || !modernConfiguration(bot.configuration)) {
      throw new ReviewError(
        "UNSUPPORTED_AGENT",
        "The selected agent is not an active supported Copilot Studio agent.",
      );
    }
    const componentRows = await client.list<ComponentRow>(
      `botcomponents?$select=botcomponentid,name,description,componenttype,content,data,componentidunique,schemaname,modifiedon,_parentbotcomponentid_value,componentstate,statecode,statuscode,versionnumber,filedata_name&$filter=${encodeURIComponent(`_parentbotid_value eq ${agentId}`)}&$orderby=name asc`,
    );
    const components = componentRows.map((row) => mapComponent(row, agentId));
    const resources = await Promise.all(
      componentRows
        .filter((row) => Number(row.componenttype) === 14 && Number(row.statecode ?? 0) === 0)
        .map(async (row) => ({
          row: resourceRow(row, agentId),
          bytes: await client.download(`botcomponents(${guid(row.botcomponentid)})/filedata/$value`),
        })),
    );
    return {
      agent: {
        id: agentId,
        name: bot.name?.trim() || "Unnamed agent",
        componentIdUnique: guid(bot.componentidunique ?? ""),
        modifiedOn: bot.modifiedon,
        iconBase64: bot.iconbase64?.trim() || undefined,
        harness: usesCopilotHarness(bot.configuration) ? "copilot" : "standard",
      },
      source: {
        configuration: bot.configuration ?? "",
        components,
        resources,
      },
    };
  }

  async getAgentMap(
    environmentId: string,
    agentIdValue: string,
    componentIdUniqueValue: string,
  ): Promise<AgentMapGraph> {
    const environment = await this.resolveEnvironment(environmentId);
    const agentId = guid(agentIdValue);
    const componentIdUnique = guid(componentIdUniqueValue);
    const { agent, source } = await this.readSource(environment, agentId);
    if (agent.componentIdUnique !== componentIdUnique) {
      throw new ReviewError(
        "AGENT_CHANGED",
        "The selected agent changed. Refresh the agent list and try again.",
      );
    }
    const prepared = await prepareAgentMap({
      botId: agent.id,
      botName: agent.name,
      componentIdUnique: agent.componentIdUnique,
      sourceEnvironmentId: environment.id,
      sourceEnvironmentName: environment.name,
      startedAt: new Date().toISOString(),
    }, source, {
      clock: { now: () => new Date() },
      ids: { randomUUID: () => randomUUID() as Guid },
      hash: {
        sha256: async (bytes) => createHash("sha256").update(bytes).digest("hex"),
      },
    });

    const connectedSchemaNames = [...new Set(
      prepared.model.connectedAgents
        .map((connectedAgent) => connectedAgent.botSchemaName?.trim())
        .filter((schemaName): schemaName is string => Boolean(schemaName)),
    )];
    const connectedAgentIcons = connectedSchemaNames.length > 0
      ? await new DataverseClient(environment.apiUrl, this.incomingToken).list<BotRow>(
          `bots?$select=schemaname,iconbase64&$filter=${encodeURIComponent(
            `statecode eq 0 and componentstate eq 0 and (${
              connectedSchemaNames
                .map((schemaName) => `schemaname eq '${escapeOData(schemaName)}'`)
                .join(" or ")
            })`,
          )}`,
        )
      : [];
    const agentIcons = Object.fromEntries(
      connectedAgentIcons.flatMap((connectedAgent) => {
        const schemaName = connectedAgent.schemaname?.trim().toLocaleLowerCase();
        const icon = connectedAgent.iconbase64?.trim();
        return schemaName && icon ? [[schemaName, icon]] : [];
      }),
    );

    return buildDeterministicAgentMap({
      agentId: agent.id,
      agentName: agent.name,
      agentIconBase64: agent.iconBase64,
      environmentId: environment.id,
      environmentName: environment.name,
      model: prepared.model,
      corpusComponents: prepared.corpusComponents,
      agentIcons,
    });
  }

  async getConnectedAgentMap(
    environmentId: string,
    targetSchemaName: string,
  ): Promise<AgentMapGraph> {
    const environment = await this.resolveEnvironment(environmentId);
    const schemaName = targetSchemaName.trim();
    if (!schemaName) {
      throw new ReviewError(
        "CONNECTED_AGENT_SCHEMA_MISSING",
        "The connected agent does not declare a target schema.",
      );
    }
    const matches = await new DataverseClient(environment.apiUrl, this.incomingToken).list<BotRow>(
      `bots?$select=botid,name,componentidunique,configuration&$filter=${encodeURIComponent(
        `statecode eq 0 and componentstate eq 0 and schemaname eq '${escapeOData(schemaName)}'`,
      )}&$top=2`,
    );
    if (matches.length === 0) {
      throw new ReviewError(
        "CONNECTED_AGENT_NOT_FOUND",
        `No active published agent matched schema "${schemaName}".`,
      );
    }
    if (matches.length > 1) {
      throw new ReviewError(
        "CONNECTED_AGENT_AMBIGUOUS",
        `More than one active published agent matched schema "${schemaName}".`,
      );
    }
    const target = matches[0]!;
    return this.getAgentMap(
      environment.id,
      guid(target.botid),
      guid(target.componentidunique ?? ""),
    );
  }

  async start(
    environmentId: string,
    agentIdValue: string,
    componentIdUniqueValue: string,
    options: {
      projectName: string;
      transcriptStart?: string;
      transcriptEnd?: string;
    },
  ): Promise<{ jobId: Guid; agentName: string }> {
    const projectName = options.projectName.trim();
    if (!projectName) {
      throw new ReviewError("PROJECT_NAME_REQUIRED", "Enter a project name before starting the review.");
    }
    if (
      options.transcriptStart
      && options.transcriptEnd
      && options.transcriptStart > options.transcriptEnd
    ) {
      throw new ReviewError("INVALID_TRANSCRIPT_WINDOW", "The transcript start date must be on or before the end date.");
    }
    let stage: ReviewStartFailure["stage"] = "resolve_target";
    let jobCreation: ReviewStartFailure["jobCreation"] = "not_attempted";
    let jobId: Guid | undefined;
    try {
      const environment = await this.resolveEnvironment(environmentId);
      const agentId = guid(agentIdValue);
      const componentIdUnique = guid(componentIdUniqueValue);
      stage = "read_source";
      const { agent, source } = await this.readSource(environment, agentId);
      if (agent.componentIdUnique !== componentIdUnique) {
        throw new ReviewError("AGENT_CHANGED", "The selected agent changed. Refresh the agent list and try again.");
      }
      stage = "prepare_corpus";
      const startedAt = new Date();
      const prepared = await prepareReview({
        botId: agent.id,
        botName: agent.name,
        componentIdUnique: agent.componentIdUnique,
        sourceEnvironmentId: environment.id,
        sourceEnvironmentName: environment.name,
        startedAt: startedAt.toISOString(),
      }, source, {
        clock: { now: () => new Date() },
        ids: { randomUUID: () => randomUUID() as Guid },
        hash: {
          sha256: async (bytes) => createHash("sha256").update(bytes).digest("hex"),
        },
      });
      stage = "resolve_job_backend";
      const backend = await this.jobBackendEnvironment();
      const client = new DataverseClient(backend.apiUrl, this.incomingToken);
      stage = "resolve_review_tables";
      const sets = await this.jobEntitySets(client);
      stage = "create_job";
      jobCreation = "unconfirmed";
      const created = await client.create<ReviewJobRow>(sets.jobs, {
        cat_name: projectName,
        cat_jobkind: 1,
        cat_correlationid: prepared.correlationId,
        cat_botid: agent.id,
        cat_botname: agent.name,
        cat_componentcount: prepared.componentCount,
      });
      jobId = created.id;
      jobCreation = "created";
      stage = "upload_input";
      const bytes = new TextEncoder().encode(JSON.stringify({
        ...prepared.corpus,
        request: {
          projectName,
          transcriptStart: options.transcriptStart ?? null,
          transcriptEnd: options.transcriptEnd ?? null,
          transcriptLimit: 100,
        },
      }));
      await client.upload(`${sets.jobs}(${created.id})/cat_inputfile`, bytes, "review-corpus.json");
      stage = "queue_job";
      await client.update(`${sets.jobs}(${created.id})`, { cat_jobstatus: ReviewJobStatus.Queued });
      return { jobId: created.id, agentName: agent.name };
    } catch (error) {
      const failure = error instanceof ReviewError
        ? error
        : error instanceof ReviewSourceError
          ? new ReviewError(error.code, error.message)
        : new ReviewError("INTERNAL_ERROR", "The Agent Review start failed.");
      if (failure !== error) failure.cause = error;
      failure.diagnostics = {
        ...failure.diagnostics,
        start: { stage, jobCreation, ...(jobId ? { jobId } : {}) },
      };
      throw failure;
    }
  }

  private async readJob(jobIdValue: string): Promise<{
    client: DataverseClient;
    sets: { jobs: string; items: string };
    job: ReviewJobRow;
    rows: ReviewJobItemRow[];
  }> {
    const jobId = guid(jobIdValue);
    const backend = await this.jobBackendEnvironment();
    const client = new DataverseClient(backend.apiUrl, this.incomingToken);
    const sets = await this.jobEntitySets(client);
    const job = await client.get<ReviewJobRow>(
      `${sets.jobs}(${jobId})?$select=cat_agentreviewjobid,cat_correlationid,cat_jobstatus,cat_laststatus,cat_errormessage,cat_componentcount,cat_botid,cat_botname,modifiedon,createdon`,
    );
    const rows = await client.list<ReviewJobItemRow>(
      `${sets.items}?$select=cat_agentreviewjobitemid,cat_skillname,cat_componentindex,cat_componentid,cat_correlationid,cat_itemstatus,cat_resultjson,cat_errormessage,createdon&$filter=${encodeURIComponent(`_cat_jobid_value eq ${jobId}`)}&$orderby=cat_componentindex asc,createdon asc`,
    );
    return { client, sets, job, rows };
  }

  async status(jobIdValue: string): Promise<ReviewStatus> {
    const jobId = guid(jobIdValue);
    const { job, rows } = await this.readJob(jobId);
    const completed = new Set(rows.filter(isComponentRow).map((row) => row.cat_componentindex ?? row.cat_agentreviewjobitemid)).size;
    const created = Date.parse(job.createdon ?? job.modifiedon ?? new Date().toISOString());
    const resolved = resolveReviewJobStatus({
      jobStatus: job.cat_jobstatus,
      completedComponents: completed,
      createdAt: created,
      errorMessage: job.cat_errormessage,
    });
    return {
      jobId,
      agentName: job.cat_botname?.trim() || "Agent",
      startedAt: new Date(created).toISOString(),
      status: resolved.status,
      completedComponents: completed,
      totalComponents: job.cat_componentcount ?? 0,
      lastCompletedStatus: job.cat_laststatus ?? null,
      nextPollMs: resolved.nextPollMs,
      canFinalize: resolved.status === "succeeded" || resolved.status === "salvageable",
      error: resolved.error,
    };
  }

  async finalize(jobIdValue: string): Promise<{ reviewId: Guid }> {
    const jobId = guid(jobIdValue);
    const { client, sets, job, rows } = await this.readJob(jobId);
    const status = await this.status(jobId);
    if (!status.canFinalize) throw new ReviewError("NOT_READY", "The review is not ready to finalize.", true);
    const corpusBytes = await client.download(`${sets.jobs}(${jobId})/cat_inputfile/$value`);
    let snapshot: Parameters<typeof readWorkflowResults>[0]["snapshot"];
    try {
      const corpus: unknown = JSON.parse(new TextDecoder().decode(corpusBytes));
      snapshot = parseFinalizationSnapshot(corpus && typeof corpus === "object" && "finalizationSnapshot" in corpus
        ? corpus.finalizationSnapshot : undefined);
      const header = corpus && typeof corpus === "object" && "review" in corpus
        && corpus.review && typeof corpus.review === "object" ? corpus.review : undefined;
      if (job.cat_botid && guid(snapshot.identity.botId) !== guid(job.cat_botid)) {
        throw new Error("The snapshot agent identity does not match the review job.");
      }
      if (snapshot.topics?.length && (!header || !("correlationId" in header)
          || !("botId" in header))) {
        throw new Error("The Standard corpus has no complete review identity header.");
      }
      if (header && "correlationId" in header
          && (typeof header.correlationId !== "string" || guid(header.correlationId) !== guid(job.cat_correlationid ?? ""))) {
        throw new Error("The corpus correlation does not match the review job.");
      }
      if (header && "botId" in header
          && (typeof header.botId !== "string" || guid(header.botId) !== guid(snapshot.identity.botId))) {
        throw new Error("The corpus agent identity does not match its snapshot.");
      }
    } catch (error) {
      const failure = new ReviewError("INVALID_CORPUS", "The review finalization snapshot is invalid.");
      failure.cause = error;
      throw failure;
    }
    const workflow = await readWorkflowResults({
      job: {
        jobId,
        correlationId: guid(job.cat_correlationid ?? ""),
        status: job.cat_jobstatus === ReviewJobStatus.Failed ? "failed" : "succeeded",
        completedAt: job.modifiedon ?? new Date().toISOString(),
        errorMessage: job.cat_errormessage ?? null,
      },
      rows,
      snapshot,
      missingAiStagePolicy: "unavailable",
    }, { hash: { sha256: async bytes => createHash("sha256").update(bytes).digest("hex") } });
    const completed = await composeReview({ snapshot, workflow });
    const botId = guid(completed.record.cat_botid);
    const home = await this.homeEnvironment();
    const reviewClient = new DataverseClient(home.apiUrl, this.incomingToken);
    const reviews = await reviewClient.entitySet(REVIEWS_LOGICAL_NAME);
    const existing = await reviewClient.list<{ cat_agentreviewsid: string; "@odata.etag"?: string }>(
      `${reviews}?$select=cat_agentreviewsid&$filter=${encodeURIComponent(`cat_botid eq '${escapeOData(botId)}'`)}&$orderby=cat_reviewdate desc&$top=1`,
    );
    let reviewId: Guid;
    if (existing[0]) {
      reviewId = guid(existing[0].cat_agentreviewsid);
      await reviewClient.update(`${reviews}(${reviewId})`, completed.record, existing[0]["@odata.etag"] ?? "*");
    } else {
      reviewId = (await reviewClient.create<AgentReviewRecordData>(reviews, completed.record)).id;
    }
    return { reviewId };
  }

  async getResult(reviewIdValue: string): Promise<{ reviewId: Guid; model: ReturnType<typeof buildReviewViewModel> }> {
    const reviewId = guid(reviewIdValue);
    const home = await this.homeEnvironment();
    const client = new DataverseClient(home.apiUrl, this.incomingToken);
    const reviews = await client.entitySet(REVIEWS_LOGICAL_NAME);
    const row = await client.get<{
      cat_botid?: string;
      cat_botname?: string;
      cat_componentidunique?: string;
      cat_sourceenvironment?: string;
      cat_reviewresultjson?: string;
      cat_reviewdate?: string;
    }>(`${reviews}(${reviewId})?$select=cat_botid,cat_botname,cat_componentidunique,cat_sourceenvironment,cat_reviewresultjson,cat_reviewdate`);
    if (!row.cat_reviewresultjson) throw new ReviewError("REVIEW_NOT_FOUND", "The review result is unavailable.");
    const persisted = JSON.parse(row.cat_reviewresultjson) as {
      botId?: string;
      botName?: string;
      agentsExperience?: Parameters<typeof buildReviewViewModel>[0];
      durationMs?: number;
    };
    if (!persisted.agentsExperience) {
      throw new ReviewError(
        "INVALID_REVIEW",
        "The stored review is not a Copilot Studio agent review.",
      );
    }
    const agentName = row.cat_botname ?? persisted.botName ?? "Agent";
    const model = buildReviewViewModel(
      persisted.agentsExperience, "Current user", Number(persisted.durationMs ?? 0), agentName,
    );
    const recordBotId = row.cat_botid?.trim();
    const snapshotBotId = persisted.botId?.trim();
    model.agentMap = {
      state: "unavailable", reviewId, reason: "The saved review has no agent ID.",
    };
    let agentIds: Guid[];
    try {
      agentIds = [recordBotId, snapshotBotId].filter((id): id is string => Boolean(id)).map(guid);
    } catch (error) {
      if (!(error instanceof ReviewError) || error.code !== "INVALID_ID") throw error;
      model.agentMap.reason = "The saved review has no valid agent ID.";
      return { reviewId, model };
    }
    if (agentIds.length === 2 && agentIds[0] !== agentIds[1]) {
      model.agentMap.reason = "The saved record and snapshot agent IDs do not match.";
      return { reviewId, model };
    }
    const agentId = agentIds[0];
    if (agentId) {
      const graph = buildDeterministicAgentMap({
        agentId, agentName,
        environmentId: "",
        environmentName: row.cat_sourceenvironment ?? "",
        model: persisted.agentsExperience.model,
        corpusComponents: [],
      });
      const root = graph.nodes.find(node => node.category === "agent" && !node.parentId);
      if (root && row.cat_componentidunique) root.componentIdUnique = row.cat_componentidunique;
      model.agentMap = {
        state: "ready", reviewId, graph,
        reviewedOn: row.cat_reviewdate,
        componentIdUnique: row.cat_componentidunique,
      };
    }
    return { reviewId, model };
  }
}
