/**
 * Load the most recently active Agent Test Sets along with aggregate stats.
 *
 * Sort rule: by the most recent child `cat_copilottest.modifiedon` for the
 * set. Test sets with no child tests fall back to their own `modifiedon`.
 *
 * The child test's `_modifiedby_value` (GUID) is resolved to a readable
 * fullname via the `systemuser` table so cards can show "Last modified by
 * Mona Kane, 2 days ago".
 */

import { Cat_copilottestsService } from "../../../generated/services/Cat_copilottestsService";
import { Cat_copilottestsetsService } from "../../../generated/services/Cat_copilottestsetsService";
import { SystemusersService } from "../../../generated/services/SystemusersService";
import type { TestSetSummary } from "../contracts/types";

type ChildTestRow = {
  _cat_copilottestsetid_value?: string;
  cat_testtypecode?: string;
  modifiedon?: string;
  _modifiedby_value?: string;
};

type SystemuserRow = {
  systemuserid?: string;
  fullname?: string;
};

const DEFAULT_TOP = 4;

export async function loadRecentTestSets(top = DEFAULT_TOP): Promise<TestSetSummary[]> {
  const setsResult = await Cat_copilottestsetsService.getAll({
    filter: "statecode eq 0",
    orderBy: ["modifiedon desc"],
    maxPageSize: 5000,
  });

  if (!setsResult.success) {
    throw setsResult.error ?? new Error("Failed to load test sets.");
  }

  const sets = setsResult.data ?? [];
  if (sets.length === 0) return [];

  const [testsResult, usersResult] = await Promise.all([
    Cat_copilottestsService.getAll({
      filter: "statecode eq 0",
      maxPageSize: 5000,
    }),
    SystemusersService.getAll({ maxPageSize: 5000 }),
  ]);

  const tests = testsResult.success
    ? ((testsResult.data ?? []) as unknown as ChildTestRow[])
    : [];

  const usersById = new Map<string, SystemuserRow>();
  if (usersResult.success) {
    for (const user of (usersResult.data ?? []) as unknown as SystemuserRow[]) {
      if (user.systemuserid) usersById.set(user.systemuserid, user);
    }
  }

  const byTestSet = new Map<string, ChildTestRow[]>();
  for (const test of tests) {
    const setId = test._cat_copilottestsetid_value;
    if (!setId) continue;
    const bucket = byTestSet.get(setId);
    if (bucket) bucket.push(test);
    else byTestSet.set(setId, [test]);
  }

  const summaries: TestSetSummary[] = sets.map((set) => {
    const bucket = byTestSet.get(set.cat_copilottestsetid) ?? [];
    let latestModifiedOn: string | null = null;
    let latestModifiedById: string | null = null;
    const methods = new Set<string>();

    for (const test of bucket) {
      if (test.cat_testtypecode) methods.add(String(test.cat_testtypecode));
      const candidate = test.modifiedon ?? null;
      if (candidate && (!latestModifiedOn || candidate > latestModifiedOn)) {
        latestModifiedOn = candidate;
        latestModifiedById = test._modifiedby_value ?? null;
      }
    }

    const latestTestModifiedByName = latestModifiedById
      ? usersById.get(latestModifiedById)?.fullname ?? null
      : null;

    return {
      cat_copilottestsetid: set.cat_copilottestsetid,
      cat_name: set.cat_name,
      modifiedon: set.modifiedon,
      testCaseCount: bucket.length,
      distinctTestMethodCount: methods.size,
      latestTestModifiedOn: latestModifiedOn,
      latestTestModifiedByName,
    };
  });

  summaries.sort((a, b) => {
    const aTime = a.latestTestModifiedOn ?? a.modifiedon ?? "";
    const bTime = b.latestTestModifiedOn ?? b.modifiedon ?? "";
    return bTime.localeCompare(aTime);
  });

  return summaries.slice(0, top);
}
