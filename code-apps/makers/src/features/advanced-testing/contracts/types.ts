import type { Cat_copilottestruns } from "../../../generated/models/Cat_copilottestrunsModel";
import type { Cat_copilottestsets } from "../../../generated/models/Cat_copilottestsetsModel";

export type TestSetSummary = Pick<
  Cat_copilottestsets,
  "cat_copilottestsetid" | "cat_name" | "modifiedon"
> & {
  testCaseCount: number;
  distinctTestMethodCount: number;
  latestTestModifiedOn: string | null;
  latestTestModifiedByName: string | null;
};

export type TestRunSummary = Pick<
  Cat_copilottestruns,
  | "cat_copilottestrunid"
  | "cat_name"
  | "cat_successrate"
  | "cat_success"
  | "cat_failed"
  | "cat_tests"
  | "cat_runstatuscode"
  | "cat_runstatuscodename"
  | "createdon"
  | "modifiedon"
  | "ownerid"
  | "owneridname"
  | "_cat_copilottestsetid_value"
  | "_cat_copilotconfigurationid_value"
> & {
  testSetName: string | null;
  agentName: string | null;
  testCaseCount: number | null;
  ownerAvatarUrl: string | null;
};
