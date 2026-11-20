/**
 * Load recent Agent Test Runs with the agent name resolved via the Agent
 * Configuration record:
 *
 *   1. `cat_copilotconfiguration.cat_copilotid`        → `bot.botid` → bot.name
 *   2. else `cat_copilotconfiguration.cat_agentidentifier` → `bot.schemaname` → bot.name
 *   3. else `cat_copilotconfiguration.cat_name`        (the config row's own name)
 *
 * Owner avatar image comes from `systemuser.entityimage_url`. Test-case
 * count is derived by counting active `cat_copilottest` rows for the run's
 * test-set.
 */

import { BotsService } from "../../../generated/services/BotsService";
import { Cat_copilotconfigurationsService } from "../../../generated/services/Cat_copilotconfigurationsService";
import { Cat_copilottestrunsService } from "../../../generated/services/Cat_copilottestrunsService";
import { Cat_copilottestsService } from "../../../generated/services/Cat_copilottestsService";
import { Cat_copilottestsetsService } from "../../../generated/services/Cat_copilottestsetsService";
import { SystemusersService } from "../../../generated/services/SystemusersService";
import type { TestRunSummary } from "../contracts/types";

const DEFAULT_TOP = 10;

type ConfigurationRow = {
  cat_copilotconfigurationid?: string;
  cat_copilotid?: string;
  cat_agentidentifier?: string;
  cat_name?: string;
};

type BotRow = {
  botid?: string;
  name?: string;
  schemaname?: string;
};

type SystemuserRow = {
  systemuserid?: string;
  fullname?: string;
  entityimage_url?: string;
};

type TestSetRow = {
  cat_copilottestsetid?: string;
  cat_name?: string;
};

type TestRow = {
  _cat_copilottestsetid_value?: string;
};

type RunWithOwnerValue = {
  _ownerid_value?: string;
};

export async function loadRecentTestRuns(top = DEFAULT_TOP): Promise<TestRunSummary[]> {
  const runsResult = await Cat_copilottestrunsService.getAll({
    orderBy: ["createdon desc"],
    maxPageSize: top,
  });

  if (!runsResult.success) {
    throw runsResult.error ?? new Error("Failed to load test runs.");
  }

  const runs = (runsResult.data ?? []).slice(0, top);
  if (runs.length === 0) return [];

  const configIds = new Set<string>();
  const ownerIds = new Set<string>();
  for (const run of runs) {
    if (run._cat_copilotconfigurationid_value) configIds.add(run._cat_copilotconfigurationid_value);
    const ownerValue = (run as RunWithOwnerValue)._ownerid_value ?? run.ownerid;
    if (ownerValue) ownerIds.add(ownerValue);
  }

  const [configsResult, testSetsResult, usersResult] = await Promise.all([
    Cat_copilotconfigurationsService.getAll({ maxPageSize: 5000 }),
    Cat_copilottestsetsService.getAll({ maxPageSize: 5000 }),
    ownerIds.size > 0
      ? SystemusersService.getAll({ maxPageSize: 5000 })
      : Promise.resolve({ success: true, data: [] } as const),
  ]);

  const configs = configsResult.success
    ? ((configsResult.data ?? []) as unknown as ConfigurationRow[])
    : [];
  const testSets = testSetsResult.success
    ? ((testSetsResult.data ?? []) as unknown as TestSetRow[])
    : [];
  const users = usersResult.success
    ? ((usersResult.data ?? []) as unknown as SystemuserRow[])
    : [];

  const configById = new Map<string, ConfigurationRow>();
  for (const config of configs) {
    if (config.cat_copilotconfigurationid) configById.set(config.cat_copilotconfigurationid, config);
  }

  const testSetById = new Map<string, TestSetRow>();
  for (const set of testSets) {
    if (set.cat_copilottestsetid) testSetById.set(set.cat_copilottestsetid, set);
  }

  const userById = new Map<string, SystemuserRow>();
  for (const user of users) {
    if (user.systemuserid) userById.set(user.systemuserid, user);
  }

  // Collect the bot lookup targets declared on the participating configs.
  const botGuidTargets = new Set<string>();
  const botSchemaTargets = new Set<string>();
  for (const run of runs) {
    const config = run._cat_copilotconfigurationid_value
      ? configById.get(run._cat_copilotconfigurationid_value)
      : undefined;
    if (config?.cat_copilotid) botGuidTargets.add(config.cat_copilotid);
    if (config?.cat_agentidentifier) botSchemaTargets.add(config.cat_agentidentifier);
  }

  let botsByGuid = new Map<string, BotRow>();
  let botsBySchema = new Map<string, BotRow>();
  if (botGuidTargets.size > 0 || botSchemaTargets.size > 0) {
    const botsResult = await BotsService.getAll({ maxPageSize: 5000 });
    if (botsResult.success) {
      const rows = (botsResult.data ?? []) as unknown as BotRow[];
      botsByGuid = new Map(rows.filter((b) => b.botid).map((b) => [b.botid!, b]));
      botsBySchema = new Map(
        rows.filter((b) => b.schemaname).map((b) => [b.schemaname!.toLowerCase(), b])
      );
    }
  }

  const testsResult = await Cat_copilottestsService.getAll({
    filter: "statecode eq 0",
    maxPageSize: 5000,
  });
  const testsByTestSet = new Map<string, number>();
  if (testsResult.success) {
    for (const test of (testsResult.data ?? []) as unknown as TestRow[]) {
      const setId = test._cat_copilottestsetid_value;
      if (!setId) continue;
      testsByTestSet.set(setId, (testsByTestSet.get(setId) ?? 0) + 1);
    }
  }

  return runs.map((run) => {
    const config = run._cat_copilotconfigurationid_value
      ? configById.get(run._cat_copilotconfigurationid_value)
      : undefined;

    // Agent resolution order per spec:
    //   1. cat_copilotid (GUID) → bot.botid → bot.name
    //   2. cat_agentidentifier (schema name) → bot.schemaname → bot.name
    //   3. fall back to the configuration record's own cat_name
    let agentName: string | null = null;
    if (config?.cat_copilotid) {
      const bot = botsByGuid.get(config.cat_copilotid);
      if (bot?.name) agentName = bot.name;
    }
    if (!agentName && config?.cat_agentidentifier) {
      const bot = botsBySchema.get(config.cat_agentidentifier.toLowerCase());
      if (bot?.name) agentName = bot.name;
    }
    if (!agentName) {
      agentName = config?.cat_name ?? null;
    }

    const testSet = run._cat_copilottestsetid_value
      ? testSetById.get(run._cat_copilottestsetid_value)
      : undefined;
    const testCaseCount = run._cat_copilottestsetid_value
      ? testsByTestSet.get(run._cat_copilottestsetid_value) ?? null
      : null;

    const ownerValue = (run as RunWithOwnerValue)._ownerid_value ?? run.ownerid;
    const ownerUser = ownerValue ? userById.get(ownerValue) : undefined;
    const ownerName = ownerUser?.fullname ?? run.owneridname ?? null;
    const ownerAvatarUrl = ownerUser?.entityimage_url
      ? buildAvatarUrl(ownerUser.entityimage_url)
      : null;

    return {
      cat_copilottestrunid: run.cat_copilottestrunid,
      cat_name: run.cat_name,
      cat_successrate: run.cat_successrate,
      cat_success: run.cat_success,
      cat_failed: run.cat_failed,
      cat_tests: run.cat_tests,
      cat_runstatuscode: run.cat_runstatuscode,
      cat_runstatuscodename: run.cat_runstatuscodename,
      createdon: run.createdon,
      modifiedon: run.modifiedon,
      ownerid: run.ownerid,
      owneridname: ownerName ?? undefined,
      ownerAvatarUrl,
      _cat_copilottestsetid_value: run._cat_copilottestsetid_value,
      _cat_copilotconfigurationid_value: run._cat_copilotconfigurationid_value,
      testSetName: testSet?.cat_name ?? null,
      agentName,
      testCaseCount,
    } as TestRunSummary;
  });
}

/**
 * systemuser.entityimage_url returns a relative path on the Dataverse host.
 * Prefix it with the org URL stored by the MDA shell so the <img> resolves
 * against an absolute origin.
 */
function buildAvatarUrl(relativeOrAbsolute: string): string | null {
  if (!relativeOrAbsolute) return null;
  if (/^https?:\/\//i.test(relativeOrAbsolute)) return relativeOrAbsolute;

  const orgUrl = sessionStorage.getItem("mda_org_url");
  if (!orgUrl) return null;

  return `${orgUrl.replace(/\/$/, "")}${relativeOrAbsolute.startsWith("/") ? "" : "/"}${relativeOrAbsolute}`;
}
